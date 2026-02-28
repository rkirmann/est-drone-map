// Simple Ray-Casting PIP algorithm for Leaflet polygons
function pointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getActiveZones(latlng) {
    let activeHtml = '';
    eansLayer.eachLayer(layer => {
        if (layer instanceof L.Polygon) {
            const latlngs = layer.getLatLngs()[0]; // MultiPolygons might need deeper iteration but this works for simple Polys
            const vs = latlngs.map(ll => [ll.lat, ll.lng]);
            if (pointInPolygon([latlng.lat, latlng.lng], vs)) {
                activeHtml += layer.featureContent || '';
            }
        } else if (layer instanceof L.GeoJSON) {
            layer.eachLayer(subLayer => {
                if (subLayer instanceof L.Polygon) {
                    // Check deeply for MultiPolygons
                    const parts = subLayer.getLatLngs();
                    let isInside = false;

                    // It's usually nested arrays for polygons/multipolygons in Leaflet
                    const checkPart = (part) => {
                        if (part.length > 0 && part[0] instanceof L.LatLng) {
                            const vs = part.map(ll => [ll.lat, ll.lng]);
                            if (pointInPolygon([latlng.lat, latlng.lng], vs)) isInside = true;
                        } else {
                            for (let i = 0; i < part.length; i++) checkPart(part[i]);
                        }
                    }
                    checkPart(parts);

                    if (isInside && subLayer.featureContent) activeHtml += subLayer.featureContent;
                }
            });
        }
    });
    return activeHtml ? `<div class="mt-3 pt-2 border-t border-slate-200"><b class="text-sm text-slate-800 block mb-2 font-bold uppercase">Flight Zones</b>${activeHtml}</div>` : '';
}

// --- MAP CLICK HANDLER & POPUPS ---

async function showInfoPopup(latlng, preLoadedFeature = null) {
    const popup = L.popup({ minWidth: 260 }).setLatLng(latlng).setContent('<div class="loading p-2"><div class="spinner"></div><span>Querying Data...</span></div>').openOn(map);

    let feature = preLoadedFeature;
    let wind = null;
    let dbRes = null;
    let groundElevation = null;

    if (!feature) {
        const p3301 = estCRS.project(latlng);
        const zoom = map.getZoom();
        // Dynamic buffer: much larger on zoomed out map for easier clicking on mobile
        let buffer = 4;
        if (zoom <= 14) buffer = 20;
        else if (zoom === 15) buffer = 15;
        else if (zoom === 16) buffer = 10;
        else if (zoom >= 17) buffer = 5;

        const bbox = `${p3301.x - buffer},${p3301.y - buffer},${p3301.x + buffer},${p3301.y + buffer}`;
        const layers = [
            'etak:e_401_hoone_ka', 'etak:e_402_korgrajatis_p',
            'etak:e_403_muu_rajatis_ka', 'etak:e_601_elektriliin_j',
            'etak:e_602_tehnopaigaldis_p'
        ].join(',');
        const wfsUrl = `https://gsavalik.envir.ee/geoserver/etak/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${layers}&outputFormat=application/json&srsName=EPSG:3301&bbox=${bbox}`;
        const xyzUrl = `https://geoportaal.maaamet.ee/url/xgis-xyz.php?x=${p3301.y}&y=${p3301.x}&out=json`;

        let elevationRes;
        [dbRes, wind, elevationRes] = await Promise.all([
            fetch(wfsUrl).then(r => r.json()).catch(() => null),
            getWindData(latlng.lat, latlng.lng),
            fetch(xyzUrl).then(r => r.json()).catch(() => null)
        ]);
        feature = (dbRes && dbRes.features && dbRes.features.length > 0) ? dbRes.features[0].properties : null;
        if (elevationRes && elevationRes["1"]) {
            groundElevation = parseFloat(elevationRes["1"].H);
        }
    } else {
        const p3301 = estCRS.project(latlng);
        const xyzUrl = `https://geoportaal.maaamet.ee/url/xgis-xyz.php?x=${p3301.y}&y=${p3301.x}&out=json`;
        let elevationRes;

        [wind, elevationRes] = await Promise.all([
            getWindData(latlng.lat, latlng.lng),
            fetch(xyzUrl).then(r => r.json()).catch(() => null)
        ]);
        if (elevationRes && elevationRes["1"]) {
            groundElevation = parseFloat(elevationRes["1"].H);
        }
    }

    const zonesHtml = getActiveZones(latlng);

    let tempHtml = (wind && wind.temp !== undefined) ? `
                <div class="flex justify-between items-center mb-1 gap-4 text-xs">
                    <span>Temperature:</span>
                    <span class="font-bold ${wind.temp < 5 ? 'text-blue-500' : (wind.temp < 15 ? 'text-amber-500' : 'text-slate-800')}">
                        ${Math.round(wind.temp)}°C
                    </span>
                </div>
            ` : '';

    let elevHtml = (groundElevation !== null) ? `
                <div class="flex justify-between items-center mb-1 gap-4 text-xs">
                    <span title="Bare earth elevation (does not include trees/buildings)">Ground Elevation:</span>
                    <span class="font-bold text-slate-700">${Math.round(groundElevation)} m</span>
                </div>
            ` : '';

    let windHtml = wind ? `
            <div class="mt-3 pt-2 border-t border-slate-200">
                <b class="text-[10px] text-slate-500 uppercase block mb-2 tracking-widest text-center">Wind & Gusts (km/h)</b>
                <div class="grid grid-cols-3 gap-1 text-center">
                    <div class="bg-slate-50 p-1 rounded border border-slate-100">
                        <div class="text-[9px] font-bold text-slate-400">10m</div>
                        <div class="text-xs font-bold text-slate-700">${Math.round(wind.gnd.speed)}<small class="text-[8px] ml-0.5 opacity-60">(${Math.round(wind.gnd.gust)})</small></div>
                        <div class="wind-arrow text-blue-500" style="transform: rotate(${wind.gnd.dir}deg)">↓</div>
                    </div>
                    <div class="bg-blue-50 p-1 rounded border border-blue-100">
                        <div class="text-[9px] font-bold text-blue-400">80m</div>
                        <div class="text-xs font-bold text-blue-700">${Math.round(wind.h80.speed)}<small class="text-[8px] ml-0.5 opacity-60">(${Math.round(wind.h80.gust)})</small></div>
                        <div class="wind-arrow text-blue-600" style="transform: rotate(${wind.h80.dir}deg)">↓</div>
                    </div>
                    <div class="bg-indigo-50 p-1 rounded border border-indigo-100">
                        <div class="text-[9px] font-bold text-indigo-400">120m</div>
                        <div class="text-xs font-bold text-indigo-700">${Math.round(wind.h120.speed)}<small class="text-[8px] ml-0.5 opacity-60">(${Math.round(wind.h120.gust)})</small></div>
                        <div class="wind-arrow text-indigo-600" style="transform: rotate(${wind.h120.dir}deg)">↓</div>
                    </div>
                </div>
            </div>
        ` : '';

    const droneMapBtn = `<div class="mt-3 pt-2 border-t border-slate-200 flex gap-2">
            <a href="https://utm.eans.ee/" target="_blank" class="flex-1 text-center bg-slate-800 text-white text-[9px] font-bold py-1.5 rounded uppercase tracking-tighter shadow">Drone Map</a>
        </div>`;

    if (feature) {
        let height = feature.korgus_m || feature.korgus || feature.suhteline_korgus || feature.absoluutne_korgus;
        const voltage = feature.nimipinge;
        const typeName = feature.tyyp_tekst || feature.nimetus || (voltage ? "Elektriliin" : "Object");

        let estimatedInfo = '';
        if (voltage && !height) {
            const v = parseInt(voltage);
            if (v >= 330) {
                height = 42;
                estimatedInfo = `<div class="text-[10px] text-amber-600 italic">Clearance estimate: ~30m</div>`;
            } else if (v >= 110) {
                height = 32;
                estimatedInfo = `<div class="text-[10px] text-amber-600 italic">Clearance estimate: ~20m</div>`;
            } else if (v >= 35) {
                height = 22;
                estimatedInfo = `<div class="text-[10px] text-amber-600 italic">Clearance estimate: ~15m</div>`;
            } else if (v >= 10) {
                height = 9;
                estimatedInfo = `<div class="text-[10px] text-amber-600 italic">Clearance estimate: ~7m</div>`;
            } else {
                height = 8;
                estimatedInfo = `<div class="text-[10px] text-amber-600 italic">Clearance estimate: ~5m</div>`;
            }
        }

        popup.setContent(`
                <div class="p-1 max-h-[70vh] overflow-y-auto">
                    <b class="text-slate-800 text-sm border-b border-slate-200 block pb-1 mb-2 capitalize font-bold">${typeName}</b>
                    ${height ? `<div class="flex justify-between items-center mb-1 gap-4 text-xs"><span>Tower Height:</span><span class="text-green-600 font-bold text-lg">~${height} m</span></div>` : ''}
                    ${voltage ? `<div class="flex justify-between items-center mb-1 gap-4 text-xs"><span>Voltage:</span><span class="text-amber-500 font-bold">${voltage} kV</span></div>` : ''}
                    ${elevHtml}
                    ${tempHtml}
                    ${estimatedInfo}
                    ${zonesHtml}
                    ${windHtml}
                    ${droneMapBtn}
                </div>
            `);
    } else {
        popup.setContent(`
                <div class="p-1 max-h-[70vh] overflow-y-auto">
                    <b class="text-slate-800 text-sm border-b border-slate-200 block pb-1 mb-2 font-bold">Terrain / Environment</b>
                    <p class="text-[10px] text-slate-500 italic mb-2">No registered building found here.</p>
                    ${elevHtml}
                    ${tempHtml}
                    ${zonesHtml}
                    ${windHtml}
                    ${droneMapBtn}
                </div>
            `);
    }
}
map.on('click', async function (e) {
    if (isMissionMode) {
        if (typeof mappingModeActive !== 'undefined' && mappingModeActive) {
            return; // Let mapping-tool.js handle the click
        }
        if (waypoints.length > 0 && waypoints[waypoints.length - 1].isRTH) return;
        await addWaypoint(e.latlng);
        return;
    }
    showInfoPopup(e.latlng);
});

// Toggle Map Layers Panel
const layerToggleBtn = document.getElementById('layerToggleBtn');
const layerControls = document.getElementById('layerControls');
const layerToggleIcon = document.getElementById('layerToggleIcon');
let isLayerPanelOpen = true;

layerToggleBtn.addEventListener('click', () => {
    isLayerPanelOpen = !isLayerPanelOpen;
    if (isLayerPanelOpen) {
        layerControls.classList.remove('hidden');
        // Small delay to allow display:block to apply before animating opacity/height
        setTimeout(() => {
            layerControls.style.opacity = '1';
            layerControls.style.transform = 'scaleY(1)';
            layerToggleIcon.classList.add('rotate-180');
        }, 10);
    } else {
        layerControls.style.opacity = '0';
        layerControls.style.transform = 'scaleY(0)';
        layerToggleIcon.classList.remove('rotate-180');
        // Wait for animation to finish before hiding
        setTimeout(() => {
            layerControls.classList.add('hidden');
        }, 300);
    }
});
