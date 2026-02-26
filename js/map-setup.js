        const estCRS = new L.Proj.CRS('EPSG:3301',
            '+proj=lcc +lat_1=59.33333333333334 +lat_2=58 +lat_0=57.51755393055556 +lon_0=24 +x_0=500000 +y_0=6375000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', {
            resolutions: [4000, 2000, 1000, 500, 250, 125, 62.5, 31.25, 15.625, 7.8125, 3.90625, 1.953125, 0.9765625, 0.48828125, 0.244140625, 0.1220703125],
            origin: [40500, 5993000],
            bounds: L.bounds([40500, 5993000], [1064500, 7017000])
        });

        const map = L.map('map', {
            crs: estCRS,
            continuousWorld: true,
            zoomControl: true
        }).setView([58.59, 25.01], 2);

        const locationControl = L.control({ position: 'topleft' });
        locationControl.onAdd = function () {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const button = L.DomUtil.create('a', 'locate-button', container);
            button.href = "#";
            button.id = "btnFindLocation";
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line></svg>`;
            button.title = "Find my location";

            L.DomEvent.disableClickPropagation(container);

            L.DomEvent.on(button, 'click', async function (e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);

                if (!window.isSecureContext) {
                    L.popup()
                        .setLatLng(map.getCenter())
                        .setContent('<div class="p-3 text-red-600 text-xs font-bold leading-tight">🚫 <b>Security Block:</b> Browsers require an HTTPS connection to use GPS. This preview environment may be restricted.</div>')
                        .openOn(map);
                    return;
                }

                try {
                    if (navigator.permissions && navigator.permissions.query) {
                        const perm = await navigator.permissions.query({ name: 'geolocation' });
                        if (perm.state === 'prompt') {
                            // Show a friendly message just before the native prompt appears
                            L.popup()
                                .setLatLng(map.getCenter())
                                .setContent('<div class="p-3 text-slate-700 text-xs font-bold leading-tight">📍 Please "Allow" location access when prompted by your browser.</div>')
                                .openOn(map);
                        }
                    }
                } catch (e) { /* ignore if permissions API is unsupported */ }

                // Manually flyTo in locationfound to guarantee 'moveend' triggers perfectly
                // Increased timeout for mobile devices which can be slow to get a GPS lock
                map.locate({ setView: false, timeout: 15000, enableHighAccuracy: true });
            });
            return container;
        };
        locationControl.addTo(map);

        // Auto-locate on startup
        setTimeout(() => {
            if (window.isSecureContext) {
                document.getElementById('btnFindLocation').click();
            }
        }, 1000);

        const baseSatellite = L.tileLayer.wms('https://kaart.maaamet.ee/wms/fotokaart', { layers: 'EESTIFOTO', format: 'image/jpeg', attribution: '&copy; Maa-amet', zIndex: 1 }).addTo(map);
        const baseMap = L.tileLayer.wms('https://kaart.maaamet.ee/wms/kaart', { layers: 'MA-KAART', format: 'image/png', attribution: '&copy; Maa-amet', zIndex: 1 });

        // Force heightLayer to stay above base maps (zIndex 10)
        const heightLayer = L.tileLayer.wms('https://kaart.maaamet.ee/wms/fotokaart', { layers: 'nDSM', format: 'image/png', transparent: true, opacity: 0.75, zIndex: 10 }).addTo(map);

        // Place Names / Labels Layer (HYBRID from Maa-amet)
        const labelsLayer = L.tileLayer.wms('https://kaart.maaamet.ee/wms/fotokaart', { layers: 'HYBRID', format: 'image/png', transparent: true, zIndex: 400 });

        const powerGridLayer = L.layerGroup();
        const eansLayer = L.layerGroup();

        let userMarker = null;
        map.on('locationfound', (e) => {
            map.closePopup(); // Close the generic "please allow" prompt if it was shown
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.circleMarker(e.latlng, {
                radius: 9, fillColor: "#3b82f6", color: "#fff", weight: 3, opacity: 1, fillOpacity: 0.9
            }).addTo(map).bindPopup("You are here").openPopup();

            // Fly to the location and ensure zoom is at least 14 so that buildings/powerlines load
            map.flyTo(e.latlng, Math.max(map.getZoom(), 14), { duration: 1.5 });
        });

