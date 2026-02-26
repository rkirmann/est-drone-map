        let currentPowerGridBbox = '';
        function updatePowerGrid() {
            if (!map.hasLayer(powerGridLayer)) return;
            if (map.getZoom() < 8) {
                powerGridLayer.clearLayers();
                currentPowerGridBbox = '';
                return;
            }

            const bounds = map.getBounds();
            const p1 = estCRS.project(bounds.getSouthWest());
            const p2 = estCRS.project(bounds.getNorthEast());
            const buffer = 500;
            const bboxStr = `${p1.x - buffer},${p1.y - buffer},${p2.x + buffer},${p2.y + buffer}`;

            if (currentPowerGridBbox === bboxStr) return;
            currentPowerGridBbox = bboxStr;

            const url = `https://gsavalik.envir.ee/geoserver/etak/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=etak:e_601_elektriliin_j,etak:e_602_tehnopaigaldis_p&outputFormat=application/json&srsName=EPSG:3301&bbox=${bboxStr}`;

            fetch(url).then(r => r.json()).then(data => {
                if (!map.hasLayer(powerGridLayer) || currentPowerGridBbox !== bboxStr) return;
                powerGridLayer.clearLayers();

                L.geoJSON(data, {
                    coordsToLatLng: function (coords) {
                        return estCRS.unproject(L.point(coords[0], coords[1]));
                    },
                    style: function (feature) {
                        const props = feature.properties;
                        let h = 8; // Default low voltage ~5m clearance = 8m pole
                        if (props.nimipinge) {
                            const v = parseInt(props.nimipinge);
                            if (v >= 330) h = 42; // Elering backbone 330kV
                            else if (v >= 110) h = 32; // Elering 110kV
                            else if (v >= 10) h = 9; // Elektrilevi medium
                        }

                        let color = '#84cc00'; // 0-5m (< 10kV basically)
                        if (h >= 42) color = '#800000'; // 330kV dark red
                        else if (h >= 32) color = '#ff0000'; // 110kV bright red
                        else if (h >= 22) color = '#ff7b00'; // 35kV orange
                        else if (h >= 9) color = '#ffea00'; // 10kV yellow

                        return {
                            color: color,
                            weight: props.kood === 601 ? 2 : 1, // Thicker lines for wires
                            fillColor: color,
                            fillOpacity: 0.8,
                            interactive: false
                        };
                    },
                    pointToLayer: function (feature, latlng) {
                        return L.circleMarker(latlng, {
                            radius: 4,
                            color: "#ffffff",
                            weight: 1,
                            fillOpacity: 0.9
                        });
                    }
                }).addTo(powerGridLayer);
            }).catch(e => console.error("Error fetching powerGrid WFS:", e));
        }

        document.getElementById('powerGridToggle').addEventListener('change', e => {
            if (e.target.checked) {
                powerGridLayer.addTo(map);
                updatePowerGrid();
            } else {
                map.removeLayer(powerGridLayer);
                powerGridLayer.clearLayers();
            }
        });

