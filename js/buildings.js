const buildingsLayer = L.layerGroup();
let currentBuildingsBbox = '';

function updateBuildings() {
    if (!map.hasLayer(buildingsLayer)) return;
    if (map.getZoom() < 9) {
        buildingsLayer.clearLayers();
        currentBuildingsBbox = '';
        return;
    }

    const bounds = map.getBounds();
    const p1 = estCRS.project(bounds.getSouthWest());
    const p2 = estCRS.project(bounds.getNorthEast());

    // Buffer the bbox slightly so we don't fetch on every tiny pan
    const buffer = 500;
    const bboxStr = `${p1.x - buffer},${p1.y - buffer},${p2.x + buffer},${p2.y + buffer}`;

    // If the map panned but is still contained within our last fetched bbox, skip fetching
    if (currentBuildingsBbox === bboxStr) return; // very simplistic caching
    currentBuildingsBbox = bboxStr;

    const url = `https://gsavalik.envir.ee/geoserver/etak/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=etak:e_401_hoone_ka,etak:e_402_korgrajatis_p&outputFormat=application/json&srsName=EPSG:3301&bbox=${bboxStr}`;
    const katasterUrl = `https://gsavalik.envir.ee/geoserver/kataster/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=kataster:ky_kehtiv&outputFormat=application/json&srsName=EPSG:3301&bbox=${bboxStr}`;

    Promise.all([
        fetch(url).then(r => r.json()).catch(e => { console.error("Error fetching buildings:", e); return null; }),
        fetch(katasterUrl).then(r => r.json()).catch(e => { console.error("Error fetching kataster:", e); return null; })
    ]).then(([buildingsData, katasterData]) => {
        if (!map.hasLayer(buildingsLayer) || currentBuildingsBbox !== bboxStr) return;
        buildingsLayer.clearLayers();

        if (katasterData) {
            L.geoJSON(katasterData, {
                coordsToLatLng: function (coords) {
                    return estCRS.unproject(L.point(coords[0], coords[1]));
                },
                style: function () {
                    return {
                        color: '#ff7800',
                        weight: 1,
                        fillOpacity: 0,
                        interactive: false
                    };
                }
            }).addTo(buildingsLayer);
        }

        if (buildingsData) {
            L.geoJSON(buildingsData, {
                coordsToLatLng: function (coords) {
                    return estCRS.unproject(L.point(coords[0], coords[1]));
                },
                style: function (feature) {
                    const props = feature.properties;
                    let h = props.korgus_m || props.korgus || props.suhteline_korgus || props.absoluutne_korgus || 0;
                    if (!h && props.nimipinge) {
                        const v = parseInt(props.nimipinge);
                        if (v >= 330) h = 42;
                        else if (v >= 110) h = 32;
                        else if (v >= 35) h = 22;
                        else if (v >= 10) h = 9;
                        else h = 8;
                    }

                    // nDSM Gradient Color Stops matched to image exactly
                    // 0m: transparent, 5m: #6b9c2a, 15m: #c4cd1e, 25m: #e08e1a, 35m+: #c03d13
                    let color = '#6b9c2a'; // base green start
                    let opacity = 0.5;

                    // Helper to interpolate between two hex colors based on a factor (0.0 - 1.0)
                    const interpolateHex = (color1, color2, factor) => {
                        const hex1 = color1.substring(1);
                        const hex2 = color2.substring(1);
                        const r1 = parseInt(hex1.substring(0, 2), 16), g1 = parseInt(hex1.substring(2, 4), 16), b1 = parseInt(hex1.substring(4, 6), 16);
                        const r2 = parseInt(hex2.substring(0, 2), 16), g2 = parseInt(hex2.substring(2, 4), 16), b2 = parseInt(hex2.substring(4, 6), 16);
                        const r = Math.round(r1 + factor * (r2 - r1)), g = Math.round(g1 + factor * (g2 - g1)), b = Math.round(b1 + factor * (b2 - b1));
                        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
                    };

                    if (h <= 5) {
                        color = '#6b9c2a';
                        opacity = 0.4;
                    } else if (h <= 15) {
                        color = interpolateHex('#6b9c2a', '#c4cd1e', (h - 5) / 10);
                        opacity = 0.6;
                    } else if (h <= 25) {
                        color = interpolateHex('#c4cd1e', '#e08e1a', (h - 15) / 10);
                        opacity = 0.7;
                    } else if (h <= 35) {
                        color = interpolateHex('#e08e1a', '#c03d13', (h - 25) / 10);
                        opacity = 0.8;
                    } else {
                        color = '#c03d13';
                        opacity = 0.85;
                    }

                    return {
                        color: color,
                        weight: 1,
                        fillColor: color,
                        fillOpacity: opacity, // Smoothly increase opacity for higher buildings
                        interactive: true
                    };
                },
                onEachFeature: function (feature, layer) {
                    layer.on('click', (e) => {
                        if (isMissionMode) return;
                        L.DomEvent.stopPropagation(e);
                        showInfoPopup(e.latlng, feature.properties);
                    });
                },
                pointToLayer: function (feature, latlng) {
                    return L.circleMarker(latlng, {
                        radius: 6,
                        color: "#ffffff",
                        weight: 1,
                        fillOpacity: 0.9
                    });
                }
            }).addTo(buildingsLayer);
        }
    });
}

