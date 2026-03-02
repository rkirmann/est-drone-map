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

const uiMap3DToggle = document.getElementById('map3DToggle');
const uiMap3DParams = document.getElementById('map3DParams');
const uiMap3DMinAlt = document.getElementById('map3DMinAlt');
const uiMap3DMaxAlt = document.getElementById('map3DMaxAlt');
const uiMap3DBuffer = document.getElementById('map3DBuffer');

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

if (uiMap3DToggle) {
    uiMap3DToggle.addEventListener('change', () => {
        if (uiMap3DParams) {
            uiMap3DParams.classList.toggle('hidden', !uiMap3DToggle.checked);
        }
        generateLawnmowerPath();
    });
}

// Listener for inputs modifying the generated path
[uiMapAltitude, uiMapAngle, uiMapSideOverlap, uiMapFrontOverlap, uiHeight, uiMapCameraLens, uiMapSpeed, uiMap3DMinAlt, uiMap3DMaxAlt, uiMap3DBuffer].forEach(el => {
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

    document.getElementById('statDistance').innerText = "0 m";
    document.getElementById('statTime').innerText = "0:00";

    const label3 = document.getElementById('labelStat3');
    if (label3) label3.innerText = "Battery Eq. Used:";
    document.getElementById('statBatteryUsed').innerText = "-";
    document.getElementById('statBatteryUsed').title = "";

    const label4 = document.getElementById('labelStat4');
    if (label4) label4.innerText = "Rec. Timed Shot:";
    const statRem = document.getElementById('statRemaining');
    if (statRem) {
        statRem.innerText = "-";
        statRem.className = "font-bold text-slate-500";
        statRem.title = "";
    }
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
        document.getElementById('statRemaining').innerText = "-";
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
    let flightHeight = parseFloat(uiMapAltitude.value) || 50;

    const is3D = uiMap3DToggle && uiMap3DToggle.checked;
    if (is3D) {
        flightHeight = parseFloat(uiMap3DMaxAlt.value) || 80;
    }

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

    let missionPointsArr = []; // Array of {lat, lng, alt, gimbalPitch}

    // --- 3D ORBIT GENERATION ---
    if (is3D) {
        const bufferMeters = parseFloat(uiMap3DBuffer.value) || 20;
        const bufferedOrbit = turf.buffer(combined, bufferMeters / 1000, { units: 'kilometers' });

        let orbitCoords = [];
        if (bufferedOrbit.geometry.type === 'Polygon') {
            orbitCoords = bufferedOrbit.geometry.coordinates[0];
        } else if (bufferedOrbit.geometry.type === 'MultiPolygon') {
            orbitCoords = bufferedOrbit.geometry.coordinates[0][0]; // Take first exterior ring
        }

        const minAlt = parseFloat(uiMap3DMinAlt.value) || 30;
        const maxAlt = parseFloat(uiMap3DMaxAlt.value) || 80;

        // Dynamic pass increment based on Vertical FOV and Front Overlap
        const activeFovV = uiMapCameraLens && uiMapCameraLens.value === 'tele' ? AIR3S_TELE_FOV_V : AIR3S_FOV_V;
        const fovVRad = (activeFovV * Math.PI) / 180;
        const frontOverlap = (parseFloat(uiMapFrontOverlap.value) || 80) / 100;

        // When looking at a buildings facade from distance D, the vertical footprint is: 2 * D * tan(FOV/2)
        // Here, D is approximately the bufferMeters.
        const verticalFootprint = 2 * bufferMeters * Math.tan(fovVRad / 2);

        // The step up should advance by the non-overlapped portion of the vertical footprint
        let passIncrement = verticalFootprint * (1 - frontOverlap);

        // Clamp passIncrement to sensible values to prevent infinite loops or giant gaps
        passIncrement = Math.max(5, Math.min(passIncrement, 50));

        const centerPoint = center.geometry.coordinates; // [lng, lat]

        const addRing = (coords, alt, pitch) => {
            // Apply rotation offset to the start point so the lead-in can be user-controlled
            let adjustedCoords = [...coords];

            // Remove the duplicate last point in the Turf polygon ring before shifting
            if (adjustedCoords.length > 0 &&
                adjustedCoords[0][0] === adjustedCoords[adjustedCoords.length - 1][0] &&
                adjustedCoords[0][1] === adjustedCoords[adjustedCoords.length - 1][1]) {
                adjustedCoords.pop();
            }

            // Shift array based on user angle (0-360 mapped to array length)
            if (adjustedCoords.length > 0) {
                let shiftAmount = Math.floor((angle % 360) / 360 * adjustedCoords.length);
                if (shiftAmount < 0) shiftAmount += adjustedCoords.length;
                adjustedCoords = adjustedCoords.slice(shiftAmount).concat(adjustedCoords.slice(0, shiftAmount));
            }

            // Reverse direction if requested
            if (pathReversed) {
                adjustedCoords.reverse();
            }

            adjustedCoords.forEach(pt => {
                // For 3D orbits, we want the drone to look at the center of the building footprint
                missionPointsArr.push({
                    lng: pt[0],
                    lat: pt[1],
                    alt: alt,
                    gimbalPitch: pitch,
                    poi: { lng: centerPoint[0], lat: centerPoint[1] } // Add POI target
                });
            });
        };

        // Facade passes (Serrated Ascent Strategy)
        if (orbitCoords && orbitCoords.length > 0) {
            let currentPitchIsUp = true; // Toggle flag

            // Ascent loop from minAlt up to maxAlt
            for (let alt = minAlt; alt < maxAlt; alt += passIncrement) {
                const pitch = currentPitchIsUp ? 15 : -45;
                addRing(orbitCoords, alt, pitch);
                currentPitchIsUp = !currentPitchIsUp; // Toggle for next ring
            }

            // Final Top Oblique pass just before the roof
            addRing(orbitCoords, maxAlt, -60);
        }
    }

    // --- ROOF PASS (LAWNMOWER) ---
    const coords = finalGeoJson.geometry.coordinates;
    coords.forEach(pt => {
        missionPointsArr.push({ lng: pt[0], lat: pt[1], alt: flightHeight, gimbalPitch: -90 });
    });

    // --- ADD 10m STAGING/RUN-UP WAYPOINT ---
    if (missionPointsArr.length >= 2) {
        const p1 = turf.point([missionPointsArr[0].lng, missionPointsArr[0].lat]);
        const p2 = turf.point([missionPointsArr[1].lng, missionPointsArr[1].lat]);
        // Get bearing from p1 to p2, then reverse it (subtract 180) to go backwards
        const bearing = turf.bearing(p1, p2);
        const reverseBearing = bearing - 180;

        // Calculate point 10 meters (0.010 km) backwards
        // (Minimum safe distance to allow speed to stabilize up to 1.3m/s and gimbal to lock)
        const stagingPt = turf.destination(p1, 0.010, reverseBearing, { units: 'kilometers' });

        currentLawnmowerPath.push({
            lat: stagingPt.geometry.coordinates[1],
            lng: stagingPt.geometry.coordinates[0],
            alt: missionPointsArr[0].alt,
            isStaging: true,
            gimbalPitch: missionPointsArr[0].gimbalPitch
        });

        totalLengthMeters += 10;
    }

    for (let i = 0; i < missionPointsArr.length; i++) {
        const lat = missionPointsArr[i].lat;
        const lng = missionPointsArr[i].lng;
        const alt = missionPointsArr[i].alt;
        const pitch = missionPointsArr[i].gimbalPitch;

        currentLawnmowerPath.push({ lat, lng, alt, gimbalPitch: pitch });

        if (i > 0) {
            totalLengthMeters += map.distance([missionPointsArr[i - 1].lat, missionPointsArr[i - 1].lng], [lat, lng]);
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
    // Ensure function can be fully awaited to fetch wind
    let windSpdKmh = 0;
    let windDirDeg = 0;
    let tempCelsius = 15;

    try {
        // Fetch wind data for the center of the mapping polygon
        const wind = await getWindData(center.geometry.coordinates[1], center.geometry.coordinates[0]);
        if (wind && wind.hourly) {
            tempCelsius = wind.temp || 15;
            const h = parseInt(flightHeight);
            if (h <= 45) {
                windSpdKmh = wind.current.wind_speed_10m;
                windDirDeg = wind.current.wind_direction_10m;
            } else if (h <= 100) {
                windSpdKmh = wind.hourly.wind_speed_80m[0];
                windDirDeg = wind.hourly.wind_direction_80m[0];
            } else {
                windSpdKmh = wind.hourly.wind_speed_120m[0];
                windDirDeg = wind.hourly.wind_direction_120m[0];
            }
        }
    } catch (e) {
        console.warn("Could not fetch wind data for mapping battery estimate", e);
    }

    const windSpdMs = windSpdKmh / 3.6;

    let totalSeconds = 0;
    let batterySecondsConsumed = 0;

    // 1. Initial Climb Tax and Final Descent Tax
    const DRONE_CLIMB_SPEED = 3;
    const DRONE_DESCENT_SPEED = 2;
    const climbTime = (flightHeight / DRONE_CLIMB_SPEED);
    totalSeconds += climbTime;
    batterySecondsConsumed += climbTime * 1.5;

    const descentTime = (flightHeight / DRONE_DESCENT_SPEED);
    totalSeconds += descentTime;
    batterySecondsConsumed += descentTime * 0.8;

    // 2. Leg Calculations
    const reqSpeed = parseFloat(uiMapSpeed.value) || 1.3;

    for (let i = 1; i < currentLawnmowerPath.length; i++) {
        const prev = currentLawnmowerPath[i - 1];
        const curr = currentLawnmowerPath[i];
        const legDist = map.distance([prev.lat, prev.lng], [curr.lat, curr.lng]);

        // Same wind tax logic as mission planner
        const flightBearing = turf.bearing(turf.point([prev.lng, prev.lat]), turf.point([curr.lng, curr.lat]));

        // Convert turf bearing (-180 to 180) to standard (0 to 360) for math
        const standardBearing = (flightBearing + 360) % 360;

        const angleRad = (windDirDeg - standardBearing) * (Math.PI / 180);
        const headwind = windSpdMs * Math.cos(angleRad);
        const crosswind = Math.abs(windSpdMs * Math.sin(angleRad));

        // Effective ground speed: Mapping speed is usually slow, but the drone crabs into wind.
        let forwardSpeedCapacity = reqSpeed;

        // Ensure the drone CAN actually fly this requested speed against crosswinds + headwinds.
        // Drones usually cap top speed if wind is crazy, but we assume it pushes harder to hit reqSpeed.
        // We calculate how much energy it actually needs.

        // Drone physically limits ground speed if crabbing angle is too extreme.
        // If the mapping speed is 1.3m/s, and there's 5m/s crosswind, it's just angling hard.

        // Time taken for leg is always dist / reqSpeed unless headwind physically exceeds max drone speed (rare).
        const legTime = legDist / reqSpeed;
        totalSeconds += legTime;

        // Wind Tax (power needed to hold that speed + fight wind)
        // 1m/s wind adds ~3% energy consumption 
        let windTax = 1 + (windSpdMs * 0.03);

        // Temperature Tax
        if (tempCelsius < 15) {
            windTax += (15 - tempCelsius) * 0.01;
        }

        batterySecondsConsumed += legTime * windTax;
    }

    const flightMins = Math.floor(totalSeconds / 60);
    const flightSecs = Math.round(totalSeconds % 60);

    const battMins = Math.floor(batterySecondsConsumed / 60);
    const battSecs = Math.round(batterySecondsConsumed % 60);

    document.getElementById('statDistance').innerText = totalLengthMeters < 1000 ? `${Math.round(totalLengthMeters)} m` : `${(totalLengthMeters / 1000).toFixed(2)} km`;
    document.getElementById('statTime').innerText = `${flightMins}:${flightSecs.toString().padStart(2, '0')}`;

    document.getElementById('labelStat3').innerText = "Battery Eq. Used:";
    document.getElementById('statBatteryUsed').innerHTML = `${battMins}:${battSecs.toString().padStart(2, '0')} <span class="text-white text-[10px] bg-slate-700 px-1 ml-1 rounded">Alt: ${Math.round(flightHeight)}m</span>`;
    document.getElementById('statBatteryUsed').title = "Battery time consumed accounting for wind (" + Math.round(windSpdMs) + "m/s)";

    document.getElementById('labelStat4').innerText = "Rec. Timed Shot:";
    const activeFovV = isTele ? AIR3S_TELE_FOV_V : AIR3S_FOV_V;
    const fovV_rad = (activeFovV * Math.PI) / 180;

    const footprintHeight = 2 * flightHeight * Math.tan(fovV_rad / 2);
    const photoIntervalMeters = footprintHeight * (1 - ((parseFloat(uiMapFrontOverlap.value) || 80) / 100));

    // Calculate required interval in seconds = distance / speed
    let rawIntervalSeconds = photoIntervalMeters / reqSpeed;

    // Safety clamp (lowest DJI allows for JPEG is usually 2s natively on Timed Shot, sometimes 0.7 on Pro)
    let displayInterval = Math.max(2, Math.round(rawIntervalSeconds));

    // Give user clear actionable instruction for their remote
    document.getElementById('statRemaining').innerText = `${displayInterval}s`;

    // If interval is below 2s, highlight red to warn they might not be able to shoot that fast.
    if (rawIntervalSeconds < 1.9) {
        document.getElementById('statRemaining').className = "font-bold text-red-500";
        document.getElementById('statRemaining').title = "Warning: Speed too high to maintain overlap with standard 2s Timed Shot. Reduce speed or increase front overlap.";
    } else {
        document.getElementById('statRemaining').className = "font-bold text-blue-400";
        document.getElementById('statRemaining').title = "Set camera to Timed Shot mode to this value.";
    }

    // Enable export button once path is successfully drawn
    btnExportKMZ.disabled = false;
    if (btnMapReverse) btnMapReverse.disabled = false;
}
