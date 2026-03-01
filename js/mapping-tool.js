// mapping-tool.js

let mappingModeActive = false;
let mappingTool = 'select'; // 'select' or 'rect'

let selectedPolygons = []; // Array of GeoJSON features
let mappingLayerGroup = L.layerGroup().addTo(map);
let generatedPathPolyline = null;
let currentLawnmowerPath = []; // Array of {lat, lng, alt}
let highestObstacle = 0;
let pathReversed = false;

// UI Elements
const btnModeWaypoint = document.getElementById('btnModeWaypoint');
const btnModeMapping = document.getElementById('btnModeMapping');
const waypointParams = document.getElementById('waypointParams');
const mappingParams = document.getElementById('mappingParams');
const btnToolSelect = document.getElementById('btnToolSelect');
const btnToolPoly = document.getElementById('btnToolPoly');
const btnExportKMZ = document.getElementById('btnExportKMZ');
const btnMapReverse = document.getElementById('btnMapReverse');

const uiMapAltitude = document.getElementById('mapAltitude');
const uiMapAngle = document.getElementById('mapAngle');
const uiMapSideOverlap = document.getElementById('mapSideOverlap');
const uiMapFrontOverlap = document.getElementById('mapFrontOverlap');
const uiMapCameraLens = document.getElementById('mapCameraLens');
const uiMapSpeed = document.getElementById('mapSpeed');

// Air 3S Specs (approximate 24mm equiv)
const AIR3S_FOV_H = 73.7; // degrees horizontal
const AIR3S_FOV_V = 53.1; // degrees vertical

// Air 3S 3x Tele Specs (approximate 70mm equiv)
const AIR3S_TELE_FOV_H = 28.5;
const AIR3S_TELE_FOV_V = 21.6;

// Toggle Mapping Mode
btnModeMapping.addEventListener('click', () => {
    mappingModeActive = true;

    // UI toggle
    btnModeMapping.classList.remove('text-slate-400', 'hover:bg-slate-700');
    btnModeMapping.classList.add('bg-blue-600', 'text-white');

    btnModeWaypoint.classList.remove('bg-blue-600', 'text-white');
    btnModeWaypoint.classList.add('text-slate-400', 'hover:bg-slate-700');

    waypointParams.classList.add('hidden');
    mappingParams.classList.remove('hidden');

    // Switch to mapping clear mode instead of waypoint clear
    clearMission();

    // Show Export button instead of RTH
    document.getElementById('btnReturnHome').classList.add('hidden');
    btnExportKMZ.classList.remove('hidden');
    if (btnMapReverse) btnMapReverse.classList.remove('hidden');


});

btnModeWaypoint.addEventListener('click', () => {
    mappingModeActive = false;

    btnModeWaypoint.classList.remove('text-slate-400', 'hover:bg-slate-700');
    btnModeWaypoint.classList.add('bg-blue-600', 'text-white');

    btnModeMapping.classList.remove('bg-blue-600', 'text-white');
    btnModeMapping.classList.add('text-slate-400', 'hover:bg-slate-700');

    mappingParams.classList.add('hidden');
    waypointParams.classList.remove('hidden');

    document.getElementById('btnReturnHome').classList.remove('hidden');
    btnExportKMZ.classList.add('hidden');
    if (btnMapReverse) btnMapReverse.classList.add('hidden');

    clearMapping();

});

btnToolSelect.addEventListener('click', () => {
    mappingTool = 'select';
    btnToolSelect.classList.replace('bg-slate-700', 'bg-blue-600');
    btnToolSelect.classList.replace('hover:bg-slate-600', 'text-white');
    btnToolSelect.classList.remove('text-slate-200');

    if (btnToolPoly) {
        btnToolPoly.classList.replace('bg-blue-600', 'bg-slate-700');
        btnToolPoly.classList.add('hover:bg-slate-600', 'text-slate-200');
    }


    clearActiveDraw();
});

if (btnToolPoly) {
    btnToolPoly.addEventListener('click', () => {
        mappingTool = 'poly';
        btnToolPoly.classList.replace('bg-slate-700', 'bg-blue-600');
        btnToolPoly.classList.replace('hover:bg-slate-600', 'text-white');
        btnToolPoly.classList.remove('text-slate-200');

        btnToolSelect.classList.replace('bg-blue-600', 'bg-slate-700');
        btnToolSelect.classList.add('hover:bg-slate-600', 'text-slate-200');


        clearActiveDraw();
    });
}

// Listener for inputs modifying the generated path
[uiMapAltitude, uiMapAngle, uiMapSideOverlap, uiMapFrontOverlap, uiHeight, uiMapCameraLens, uiMapSpeed].forEach(el => {
    if (el) el.addEventListener('change', generateLawnmowerPath);
});

function clearMapping() {
    selectedPolygons = [];
    currentLawnmowerPath = [];
    mappingLayerGroup.clearLayers();
    if (generatedPathPolyline) {
        map.removeLayer(generatedPathPolyline);
        generatedPathPolyline = null;
    }
    highestObstacle = 0;
    pathReversed = false;
    btnExportKMZ.disabled = true;
    if (btnMapReverse) btnMapReverse.disabled = true;
    clearActiveDraw();
}

// Intercept original clear button
const origClear = document.getElementById('btnClearMission');
origClear.addEventListener('click', () => {
    if (mappingModeActive) {
        clearMapping();
    }
});

if (btnMapReverse) {
    btnMapReverse.addEventListener('click', () => {
        pathReversed = !pathReversed;
        if (selectedPolygons.length > 0) {
            generateLawnmowerPath();
        }
    });
}

function clearActiveDraw() {
    polyDrawPoints = [];
    if (activePolyLayer) {
        map.removeLayer(activePolyLayer);
        activePolyLayer = null;
    }
}

let polyDrawPoints = [];
let activePolyLayer = null;

map.on('click', async (e) => {
    if (typeof isMissionMode !== 'undefined' && !isMissionMode) return;
    if (!mappingModeActive) return;

    if (mappingTool === 'poly') {
        const p = e.latlng;

        // If we have at least 3 points, check if we clicked near the first point to close
        if (polyDrawPoints.length > 2) {
            const firstPt = polyDrawPoints[0]; // array [lng, lat]
            // Leaflet map.distance expects [lat, lng] or LatLng object, so swap the array order!
            const dist = map.distance([firstPt[1], firstPt[0]], p);

            // If click is within 10 meters, close it (requires clicking inside the circle basically)
            if (dist < 10) {
                // Close polygon by strictly matching the first point
                polyDrawPoints.push([...firstPt]);

                // Build turf polygon. Turf expects a 3D array: [[[lon, lat], ...]]]
                try {
                    // Deep copy array to ensure no reference mutations
                    const closedRing = JSON.parse(JSON.stringify(polyDrawPoints));
                    console.log("Attempting to create turf polygon with ring:", closedRing);
                    const turfPoly = turf.polygon([closedRing]);
                    turfPoly.properties = { korgus_m: 0 };

                    // Reset drawing state visually first
                    clearActiveDraw();


                    addPolygonToMap(turfPoly);
                } catch (e) {
                    console.error("Failed to build polygon", e);

                    clearActiveDraw();
                }

                return;
            }
        }

        // Add point
        polyDrawPoints.push([p.lng, p.lat]);


        // Enable clear button so they can restart drawing
        document.getElementById('btnClearMission').disabled = false;

        // Update live drawing
        if (activePolyLayer) map.removeLayer(activePolyLayer);

        const latLngs = polyDrawPoints.map(pt => [pt[1], pt[0]]);

        // Group everything in a layer group
        activePolyLayer = L.layerGroup().addTo(map);

        if (polyDrawPoints.length === 1) {
            // First point marker
            L.circleMarker(latLngs[0], { radius: 8, color: '#f59e0b', fillColor: '#ef4444', fillOpacity: 0.8, weight: 3, interactive: false }).addTo(activePolyLayer);
        } else {
            // Lines between points
            L.polyline(latLngs, { color: '#f59e0b', weight: 3, dashArray: '5,5', interactive: false }).addTo(activePolyLayer);
            // Draw a target circle on the first point to show closure target
            L.circleMarker(latLngs[0], { radius: 8, color: '#f59e0b', fillColor: '#ef4444', fillOpacity: 0.8, weight: 3, interactive: false }).addTo(activePolyLayer);
        }

        return;
    }

    if (mappingTool === 'select') {

        const p = estCRS.project(e.latlng);
        const buffer = 3; // 5 meters click tolerance
        const bboxStr = `${p.x - buffer},${p.y - buffer},${p.x + buffer},${p.y + buffer}`;

        // Query both Kataster and Buildings
        const katasterUrl = `https://gsavalik.envir.ee/geoserver/kataster/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=kataster:ky_kehtiv&outputFormat=application/json&srsName=EPSG:3301&bbox=${bboxStr}`;
        const buildingUrl = `https://gsavalik.envir.ee/geoserver/etak/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=etak:e_401_hoone_ka&outputFormat=application/json&srsName=EPSG:3301&bbox=${bboxStr}`;

        try {
            const [kRes, bRes] = await Promise.allSettled([
                fetch(katasterUrl).then(r => r.json()),
                fetch(buildingUrl).then(r => r.json())
            ]);

            let foundFeatures = [];

            if (kRes.status === 'fulfilled' && kRes.value.features && kRes.value.features.length > 0) {
                // Ensure properties are properly formatted
                kRes.value.features[0].properties.korgus_m = 0; // Kataster has no height naturally
                foundFeatures.push(kRes.value.features[0]);
            }
            if (bRes.status === 'fulfilled' && bRes.value.features && bRes.value.features.length > 0) {
                foundFeatures.push(bRes.value.features[0]);
            }

            if (foundFeatures.length > 0) {
                // If we clicked a building, prioritize it and DO NOT map the entire kataster underneath it
                const buildings = foundFeatures.filter(f => f.id && f.id.includes('e_401_hoone_ka'));
                const featuresToProcess = buildings.length > 0 ? buildings : foundFeatures;

                let addedCount = 0;
                let removedCount = 0;

                featuresToProcess.forEach(feat => {
                    const existingIndex = selectedPolygons.findIndex(p => p.id === feat.id);
                    if (existingIndex > -1) {
                        // Toggle OFF
                        selectedPolygons.splice(existingIndex, 1);
                        removedCount++;
                    } else {
                        // Toggle ON
                        addPolygonToMap(feat);
                        addedCount++;
                    }
                });

                if (removedCount > 0 && addedCount === 0) {

                    redrawAllSelectedPolygons();
                    setTimeout(generateLawnmowerPath, 50);
                } else {

                }

                document.getElementById('btnClearMission').disabled = selectedPolygons.length === 0;
            } else {

            }

        } catch (err) {
            console.error(err);

        }
    }
});

function reprojectFeatureToWGS84(feature) {
    // feature arrives in EPSG:3301 coords. We need to convert it to WGS84 for Turf and Leaflet drawing.
    const wgsFeature = JSON.parse(JSON.stringify(feature));

    // Deep map coordinates
    function traverseCoords(coords) {
        if (typeof coords[0] === 'number') {
            const p = estCRS.unproject(L.point(coords[0], coords[1]));
            coords[0] = p.lng;
            coords[1] = p.lat;
        } else {
            for (let i = 0; i < coords.length; i++) {
                traverseCoords(coords[i]);
            }
        }
    }

    traverseCoords(wgsFeature.geometry.coordinates);
    return wgsFeature;
}

function redrawAllSelectedPolygons() {
    mappingLayerGroup.clearLayers();
    selectedPolygons.forEach(p => {
        L.geoJSON(p, {
            style: {
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
                weight: 2
            }
        }).addTo(mappingLayerGroup);
    });
}

function addPolygonToMap(feature) {
    let wgsFeature = feature;
    // Check if it's already WGS84 (like Turf rect or poly drawn by hand) or needs reprojection (from L.Estonia WFS = EPSG 3301 X > 180)
    // Only parse if coordinates exist and are large X/Y numbers indicative of EPSG:3301
    try {
        if (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0] && feature.geometry.coordinates[0][0]) {
            const firstCoord = feature.geometry.coordinates[0][0];
            // Handle both Polygon [ [ [x,y] ] ] and MultiPolygon [ [ [ [x,y] ] ] ]
            let testX = 0;
            if (typeof firstCoord[0] === 'number') {
                testX = firstCoord[0];
            } else if (typeof firstCoord[0][0] === 'number') {
                testX = firstCoord[0][0];
            }
            if (testX > 180) {
                wgsFeature = reprojectFeatureToWGS84(feature);
            }
        }
    } catch (e) {
        console.warn("Coordinate check failed, assuming WGS84", e);
    }

    selectedPolygons.push(wgsFeature);

    // Draw on map
    L.geoJSON(wgsFeature, {
        style: {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            weight: 2
        }
    }).addTo(mappingLayerGroup);

    // Update highest obstacle
    const props = feature.properties || {};
    let h = props.korgus_m || props.korgus || props.suhteline_korgus || props.absoluutne_korgus || 0;
    if (h > highestObstacle) {
        highestObstacle = h;
        // Auto-bump the flight altitude field if we find a tall building (adds 20m safety default)
        const safeAlt = Math.round(h + 20);
        if (parseFloat(uiMapAltitude.value) < safeAlt) {
            uiMapAltitude.value = safeAlt;
        }
    }



    // Slight delay to allow UI to breathe
    setTimeout(generateLawnmowerPath, 50);
}

async function generateLawnmowerPath() {
    if (generatedPathPolyline) {
        map.removeLayer(generatedPathPolyline);
    }
    document.getElementById('btnClearMission').disabled = selectedPolygons.length === 0;

    if (selectedPolygons.length === 0) {

        btnExportKMZ.disabled = true;
        if (btnMapReverse) btnMapReverse.disabled = true;
        document.getElementById('statDistance').innerText = "0 m";
        document.getElementById('statTime').innerText = "0:00";
        document.getElementById('statBatteryUsed').innerText = "-";
        document.getElementById('statRemaining').innerText = "0 Photos";
        return;
    }

    // 1. Union all selected polygons into one big multipolygon
    let combined = selectedPolygons[0];
    for (let i = 1; i < selectedPolygons.length; i++) {
        combined = turf.union(combined, selectedPolygons[i]);
    }

    // Buffer slightly (e.g., 2 meters) to cover edges
    const buffered = turf.buffer(combined, 0.002, { units: 'kilometers' });

    // 2. Flight Height logic
    const flightHeight = parseFloat(uiMapAltitude.value) || 50;

    // Update Wayne UI to match
    if (uiHeight) {
        uiHeight.value = Math.round(flightHeight);
    }

    // 3. Spacing logic (Air 3S Lens Select)
    const isTele = uiMapCameraLens ? uiMapCameraLens.value === 'tele' : false;
    const sideOverlap = (parseFloat(uiMapSideOverlap.value) || 70) / 100;
    const activeFovH = isTele ? AIR3S_TELE_FOV_H : AIR3S_FOV_H;

    // Width of photo footprint on the ground at this altitude
    const fovH_rad = (activeFovH * Math.PI) / 180;
    const footprintWidth = 2 * flightHeight * Math.tan(fovH_rad / 2);

    const spacing = footprintWidth * (1 - sideOverlap);

    // We can't have tiny spacing that kills the browser
    const clampedSpacing = Math.max(spacing, 2);

    // 4. Generate Bounding Box Sweep Lines
    const bbox = turf.bbox(buffered);
    const angle = parseFloat(uiMapAngle.value) || 0;

    // Center point of the bbox to rotate around
    const center = turf.center(buffered);

    // To generate lines, we create a grid or just lines that span wider than the bbox
    // We can use Turf's transformRotate to rotate the polygon back, draw horizontal lines, inside bbox, then rotate lines forward

    const rotatedPoly = turf.transformRotate(buffered, -angle, { pivot: center });
    const rBbox = turf.bbox(rotatedPoly);

    // rBbox: minX, minY, maxX, maxY
    // Spacing is in meters. We need it in degrees.
    // 1 lat degree = ~111,000 meters
    const spacingDeg = clampedSpacing / 111000;

    let lines = [];
    let isLeftToRight = true;

    // Start sweeping from MaxY (Top) down to MinY (Bottom)
    for (let y = rBbox[3]; y >= rBbox[1]; y -= spacingDeg) {
        const line = turf.lineString([
            [rBbox[0] - 0.001, y], // Start a bit left of bbox
            [rBbox[2] + 0.001, y]  // End a bit right of bbox
        ]);

        // Intersect horizontal line with rotated polygon
        try {
            // turf.lineIntersect gives points. We need the actual line segments inside polygon.
            // turf.bboxClip works for bboxes. For polygons, turf.intersect doesn't always work intuitively with lines.
            // Alternative: sample points along line, keep contiguous chunks.
            // Better alternative: Use turf.booleanPointInPolygon.

            // To keep it simple and performant for basic rectangles/katasters:
            // Just use the bounding box intersecting the polygon.

            // Generate points along the line every 1m
            const lineLength = turf.length(line, { units: 'meters' });
            const steps = Math.max(2, Math.floor(lineLength));

            let insidePolyPoints = [];
            for (let i = 0; i <= steps; i++) {
                const pt = turf.along(line, i, { units: 'meters' });
                if (turf.booleanPointInPolygon(pt, rotatedPoly)) {
                    insidePolyPoints.push(pt.geometry.coordinates);
                }
            }

            if (insidePolyPoints.length >= 2) {
                // We just take the first and last point of this intersection sweep
                const startPt = insidePolyPoints[0];
                const endPt = insidePolyPoints[insidePolyPoints.length - 1];

                if (isLeftToRight) {
                    lines.push([startPt, endPt]);
                } else {
                    lines.push([endPt, startPt]); // serpentine
                }
                isLeftToRight = !isLeftToRight;
            }

        } catch (e) {
            console.warn("Intersection error", e);
        }
    }

    if (pathReversed) {
        lines = lines.reverse().map(seg => [seg[1], seg[0]]);
    }

    // Assembly continuous path
    let linearRing = [];
    lines.forEach(seg => {
        linearRing.push(seg[0]);
        linearRing.push(seg[1]);
    });

    // Rotate back to original angle
    if (linearRing.length === 0) {

        return;
    }

    let pathGeoJson = turf.lineString(linearRing);
    let finalGeoJson = turf.transformRotate(pathGeoJson, angle, { pivot: center });

    // Transform arrays back to Leaflet LatLng structure and compute distance
    currentLawnmowerPath = [];
    let totalLengthMeters = 0;

    const coords = finalGeoJson.geometry.coordinates;

    // --- ADD 30m STAGING/RUN-UP WAYPOINT ---
    if (coords.length >= 2) {
        const p1 = turf.point(coords[0]);
        const p2 = turf.point(coords[1]);
        // Get bearing from p1 to p2, then reverse it (subtract 180) to go backwards
        const bearing = turf.bearing(p1, p2);
        const reverseBearing = bearing - 180;

        // Calculate point 10 meters (0.010 km) backwards
        // (Minimum safe distance to allow speed to stabilize up to 1.3m/s and gimbal to lock)
        const stagingPt = turf.destination(p1, 0.010, reverseBearing, { units: 'kilometers' });

        // Prepend it as an approach point (mark it so we know it doesn't need photos taken at this specific coordinate)
        currentLawnmowerPath.push({
            lat: stagingPt.geometry.coordinates[1],
            lng: stagingPt.geometry.coordinates[0],
            alt: flightHeight,
            isStaging: true
        });

        // Add staging dash approach length
        totalLengthMeters += 10;
    }

    for (let i = 0; i < coords.length; i++) {
        const lat = coords[i][1];
        const lng = coords[i][0];

        // Push normal mapping point
        currentLawnmowerPath.push({ lat, lng, alt: flightHeight });

        if (i > 0) {
            totalLengthMeters += map.distance([coords[i - 1][1], coords[i - 1][0]], [lat, lng]);
        }
    }

    // Draw Polyline
    if (generatedPathPolyline) {
        map.removeLayer(generatedPathPolyline);
    }

    // We create a GeoJSON feature group instead of a single polyline so we can style the lead-in differently
    generatedPathPolyline = L.featureGroup().addTo(map);

    const latLngs = currentLawnmowerPath.map(p => [p.lat, p.lng]);

    // Draw staging dashed line
    if (currentLawnmowerPath.length > 0 && currentLawnmowerPath[0].isStaging) {
        L.polyline([latLngs[0], latLngs[1]], { color: '#9ca3af', weight: 3, dashArray: '5,5' }).addTo(generatedPathPolyline);
        L.circleMarker(latLngs[0], { radius: 5, color: '#1f2937', fillColor: '#9ca3af', fillOpacity: 1, weight: 2 }).addTo(generatedPathPolyline);
        L.marker(latLngs[0], {
            icon: L.divIcon({
                className: 'bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap border border-slate-600',
                html: 'START (10m Lead-in)',
                iconSize: [100, 16],
                iconAnchor: [50, -8]
            })
        }).addTo(generatedPathPolyline);

        // Draw main mapping path from point 1 onwards
        L.polyline(latLngs.slice(1), { color: '#f59e0b', weight: 4 }).addTo(generatedPathPolyline);
    } else {
        // Fallback standard path
        L.polyline(latLngs, { color: '#f59e0b', weight: 4 }).addTo(generatedPathPolyline);
    }

    // Update Stats UI
    btnExportKMZ.disabled = false;
    if (btnMapReverse) btnMapReverse.disabled = false;

    const reqSpeed = parseFloat(uiMapSpeed.value) || 1.3; // Video mapping recommended slow speed
    const estTimeSec = totalLengthMeters / reqSpeed;
    const flightMins = Math.floor(estTimeSec / 60);
    const flightSecs = Math.round(estTimeSec % 60);

    document.getElementById('statDistance').innerText = totalLengthMeters < 1000 ? `${Math.round(totalLengthMeters)} m` : `${(totalLengthMeters / 1000).toFixed(2)} km`;
    document.getElementById('statTime').innerText = `${flightMins}:${flightSecs.toString().padStart(2, '0')}`;

    document.getElementById('labelStat3').innerText = "Flight Height:";
    document.getElementById('statBatteryUsed').innerHTML = `Alt: <span class="text-white">${Math.round(flightHeight)}m</span>`;
    document.getElementById('statBatteryUsed').title = "Final Flight Altitude";

    document.getElementById('labelStat4').innerText = "Total Photos:";
    const activeFovV = isTele ? AIR3S_TELE_FOV_V : AIR3S_FOV_V;
    const fovV_rad = (activeFovV * Math.PI) / 180;

    const footprintHeight = 2 * flightHeight * Math.tan(fovV_rad / 2);
    const photoIntervalMeters = footprintHeight * (1 - ((parseFloat(uiMapFrontOverlap.value) || 80) / 100));
    const totalPhotos = Math.round(totalLengthMeters / photoIntervalMeters);
    document.getElementById('statRemaining').innerText = `~${totalPhotos} Photos`;
    document.getElementById('statRemaining').className = "font-bold text-blue-400";


}
