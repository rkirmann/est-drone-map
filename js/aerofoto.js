        // --- AEROFOTO (OBLIQUE) LAYER ---
        const aerofotoLayer = L.markerClusterGroup({
            maxClusterRadius: 80,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });

        aerofotoLayer.on('clusterclick', function (a) {
            // When a cluster is clicked, instead of zooming in, 
            // we gather all its markers and open a group popup.
            // If the user wants to zoom, they can use scroll wheel, 
            // but clicking the cluster shows its photos.

            const markers = a.layer.getAllChildMarkers();

            // Map Leaflet markers back to our data objects
            activePopupGroup = aerofotoDataList.filter(data => markers.includes(data.marker));

            // Sort by Date/ID descending
            activePopupGroup.sort((a, b) => b.id - a.id);

            if (activePopupGroup.length > 0) {
                aerofotoPopupMode = 'cluster';
                aerofotoClusterLatLng = a.layer.getLatLng();
                openAerofotoPopup(0);
            }
        });
        let aerofotoIdList = [];
        let aerofotoDataList = [];
        let activePopupGroup = [];
        let aerofotoPopupMode = 'marker'; // 'cluster' or 'marker'
        let aerofotoClusterLatLng = null;
        let currentAerofotoRequest = null;

        function openAerofotoPopup(index) {
            if (index < 0 || index >= activePopupGroup.length) return;
            const data = activePopupGroup[index];
            const p = data.properties;

            const thumbUrl = `https://fotoladu.maaamet.ee/data/${p.dir}/thumbs/${p.file}`;
            const fullUrl = `https://fotoladu.maaamet.ee/data/${p.dir}/hd/${p.file}`;

            const hasPrev = index > 0;
            const hasNext = index < activePopupGroup.length - 1;

            const prevButton = hasPrev ? `<button onclick="openAerofotoPopup(${index - 1})" style="background: #e2e8f0; color: #1e293b; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">&lt; Prev</button>` : `<div style="width: 50px;"></div>`;
            const nextButton = hasNext ? `<button onclick="openAerofotoPopup(${index + 1})" style="background: #e2e8f0; color: #1e293b; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">Next &gt;</button>` : `<div style="width: 50px;"></div>`;

            const content = `
                <div style="text-align:center; min-width: 250px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        ${prevButton}
                        <h4 style="margin: 0; font-size: 12px; font-weight: bold; color: #1e293b;">Date: ${p.date}</h4>
                        ${nextButton}
                    </div>
                    ${activePopupGroup.length > 1 ? `<div style="font-size: 10px; color: #64748b; margin-bottom: 8px;">Photo ${index + 1} of ${activePopupGroup.length}</div>` : ''}
                    <a href="${fullUrl}" target="_blank">
                        <img src="${thumbUrl}" style="width: 100%; max-width: 320px; height: auto; border-radius: 4px; border: 1px solid #cbd5e1; margin-bottom: 5px;">
                    </a>
                    <a href="${fullUrl}" target="_blank" style="display: block; font-size: 11px; color: #3b82f6; text-decoration: underline; font-weight: bold;">[Open High-Res in New Tab]</a>
                </div>
            `;

            let targetPos = [data.lat, data.lng];

            if (aerofotoPopupMode === 'cluster' && aerofotoClusterLatLng) {
                targetPos = [aerofotoClusterLatLng.lat, aerofotoClusterLatLng.lng];
                L.popup({ maxWidth: 350, autoPan: false })
                    .setLatLng(targetPos)
                    .setContent(content)
                    .openOn(map);
            } else {
                data.marker.bindPopup(content, { maxWidth: 350, autoPan: false }).openPopup();
                targetPos = [data.lat, data.lng];
            }

            const zoom = map.getZoom();
            const px = map.project(targetPos, zoom);
            const mapWidth = document.getElementById('map').offsetWidth;
            if (mapWidth > 640) {
                px.x += 160; // Shift center to the right => marker moves to the left
            }
            px.y -= 120; // Shift center up => marker moves down

            const targetLatLng = map.unproject(px, zoom);
            // Only trigger pan if we are actually moving, to ensure moveend fires
            if (!map.getCenter().equals(targetLatLng)) {
                isAerofotoPanning = true;
                map.panTo(targetLatLng);
            }
        }

        async function updateAerofoto() {
            if (!map.hasLayer(aerofotoLayer)) return;

            const zoom = Math.round(map.getZoom());
            // Filter fetching purely so we don't fetch way too many at completely zoomed out map
            if (zoom < 10) {
                aerofotoLayer.clearLayers();
                aerofotoIdList = [];
                aerofotoDataList = [];
                return;
            }

            const bounds = map.getBounds();
            const url = `https://fotoladu.maaamet.ee/paring_db_cluster.php?l=avaleht&a_lat=${bounds.getSouthWest().lat}&a_lng=${bounds.getSouthWest().lng}&u_lat=${bounds.getNorthEast().lat}&u_lng=${bounds.getNorthEast().lng}&m=${zoom}`;

            const controller = new AbortController();
            currentAerofotoRequest = controller;

            try {
                // Primary proxy strategy: Custom Cloudflare Worker
                const proxyUrl = `${CONFIG_PROXY_URL}?url=${encodeURIComponent(url)}`;
                const res = await fetch(proxyUrl, { signal: controller.signal });
                if (res.ok) {
                    data = await res.json();
                }
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.warn("Primary custom proxy failed, falling back to public ones...", e);
                } else {
                    return; // Request was aborted
                }
            }

            // Fallback strategy if custom proxy fails
            if (!data) {
                try {
                    const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                    const res = await fetch(allOriginsUrl, { signal: controller.signal });

                    if (res.ok) {
                        const wrapper = await res.json();
                        if (wrapper.contents) {
                            data = JSON.parse(wrapper.contents);
                        }
                    }
                } catch (e) {
                    if (e.name !== 'AbortError') {
                        console.error('All aerofoto proxy strategies failed', e);
                    }
                    return;
                }
            }

            if (currentAerofotoRequest !== controller || !data || !data.features) return;

            const newMarkers = [];
            data.features.forEach(feature => {
                        const id = feature.properties.id;
                        if (!aerofotoIdList.includes(id)) {
                            aerofotoIdList.push(id);

                            const lat = feature.geometry.coordinates[1];
                            const lng = feature.geometry.coordinates[0];
                            const p = feature.properties;

                            const thumbUrl = `https://fotoladu.maaamet.ee/data/${p.dir}/thumbs/${p.file}`;

                            const icon = L.divIcon({
                                className: 'aerofoto-icon',
                                html: `<img src="${thumbUrl}" style="width: 50px; height: auto; border: 2px solid white; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">`,
                                iconSize: [54, 38], // adjust for border
                                iconAnchor: [27, 38]
                            });

                            const marker = L.marker([lat, lng], { icon: icon });

                            aerofotoDataList.push({
                                properties: p,
                                lat, lng,
                                marker,
                                id: parseInt(id)
                            });

                            newMarkers.push(marker);
                        }
                    });

                    if (newMarkers.length > 0) {
                        aerofotoDataList.sort((a, b) => b.id - a.id);

                        // Identify if marker is in a cluster when clicked
                        aerofotoDataList.forEach((data) => {
                            data.marker.off('click');
                            data.marker.on('click', () => {
                                // Find the top-most cluster parent (excluding the root layer group itself)
                                let parent = data.marker.__parent;
                                // Go up the tree if we are spiderfied or in nested clusters
                                while (parent && parent.__parent && parent.__parent._featureGroup !== undefined) {
                                    parent = parent.__parent;
                                }

                                if (parent && typeof parent.getAllChildMarkers === 'function') {
                                    // It's inside a cluster
                                    const clusterMarkers = parent.getAllChildMarkers();
                                    activePopupGroup = aerofotoDataList.filter(d => clusterMarkers.includes(d.marker));
                                    activePopupGroup.sort((a, b) => b.id - a.id);

                                    // Find index of clicked photo in the sorted group
                                    const index = activePopupGroup.findIndex(d => d.id === data.id);
                                    aerofotoPopupMode = 'marker';
                                    openAerofotoPopup(index >= 0 ? index : 0);
                                } else {
                                    // It's a single standalone marker
                                    activePopupGroup = [data];
                                    aerofotoPopupMode = 'marker';
                                    openAerofotoPopup(0);
                                }
                            });
                        });

                        aerofotoLayer.addLayers(newMarkers);
                    }
        }

        document.getElementById('aerofotoToggle').addEventListener('change', e => {
            if (e.target.checked) {
                aerofotoLayer.addTo(map);
                updateAerofoto();
            } else {
                map.removeLayer(aerofotoLayer);
                aerofotoLayer.clearLayers();
                aerofotoIdList = [];
                aerofotoDataList = [];
                if (currentAerofotoRequest) currentAerofotoRequest.abort();
            }
        });

