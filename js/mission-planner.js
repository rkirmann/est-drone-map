        // --- MISSION PLANNER STATE ---
        let isMissionMode = false;
        let waypoints = [];             // Array of { latlng, windData, legDistance, legTime }
        let missionPolyline = null;
        const missionLayerGroup = L.layerGroup().addTo(map);

        // Drone Performance Constants
        const DRONE_CRUISE_SPEED = 10;  // m/s (~36km/h)
        const DRONE_CLIMB_SPEED = 3;    // m/s
        const DRONE_DESCENT_SPEED = 2;  // m/s

        const uiMissionToggle = document.getElementById('missionToggle');
        const uiMissionControls = document.getElementById('missionControls');
        const uiMaxTime = document.getElementById('missionMaxTime');
        const uiHeight = document.getElementById('missionHeight');
        const uiStatDist = document.getElementById('statDistance');
        const uiStatTime = document.getElementById('statTime');
        const uiStatBatteryUsed = document.getElementById('statBatteryUsed');
        const uiStatRem = document.getElementById('statRemaining');
        const uiBtnRTH = document.getElementById('btnReturnHome');
        const uiBtnClear = document.getElementById('btnClearMission');
        const uiStatus = document.getElementById('missionStatus');

        uiMissionToggle.addEventListener('change', (e) => {
            isMissionMode = e.target.checked;
            if (isMissionMode) {
                uiMissionControls.classList.remove('hidden');
                // Small delay to allow display:block to apply before fading in
                setTimeout(() => uiMissionControls.classList.remove('opacity-0'), 10);
                map.getContainer().style.cursor = 'crosshair';
            } else {
                uiMissionControls.classList.add('opacity-0');
                setTimeout(() => uiMissionControls.classList.add('hidden'), 300);
                map.getContainer().style.cursor = ''; // Reset to default
            }
        });

        uiBtnClear.addEventListener('click', clearMission);
        uiBtnRTH.addEventListener('click', () => {
            if (waypoints.length > 2) {
                addWaypoint(waypoints[0].latlng, true); // Add home point again
            }
        });

        // Event listeners for inputs to trigger recalculation
        uiMaxTime.addEventListener('change', updateMissionStats);
        uiHeight.addEventListener('change', () => {
            // Need to refetch wind data for all points if height changes
            if (waypoints.length > 0) recalculateAllWaypoints();
        });

        function clearMission() {
            waypoints = [];
            missionLayerGroup.clearLayers();
            if (missionPolyline) {
                map.removeLayer(missionPolyline);
                missionPolyline = null;
            }
            updateMissionStats();
            uiStatus.innerText = "Click the map to set Home Point.";
            uiBtnRTH.disabled = true;
            uiBtnClear.disabled = true;
        }

        function getBearing(lat1, lon1, lat2, lon2) {
            // Convert to radians
            const φ1 = lat1 * Math.PI / 180;
            const φ2 = lat2 * Math.PI / 180;
            const λ1 = lon1 * Math.PI / 180;
            const λ2 = lon2 * Math.PI / 180;

            const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
            const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
            const θ = Math.atan2(y, x);

            return (θ * 180 / Math.PI + 360) % 360; // in degrees
        }

        async function recalculateAllWaypoints() {
            uiStatus.innerText = "Recalculating mission parameters...";
            for (let i = 0; i < waypoints.length; i++) {
                // Re-fetch wind for new height
                const wind = await getWindData(waypoints[i].latlng.lat, waypoints[i].latlng.lng);
                waypoints[i].windData = wind;
            }
            updateMissionStats();
        }

        async function addWaypoint(latlng, isRTH = false) {
            uiStatus.innerText = "Fetching weather data for waypoint...";

            // Add visual marker
            const isHome = waypoints.length === 0;
            const markerColor = isHome ? '#3b82f6' : (isRTH ? '#eab308' : '#ef4444');
            const markerText = isHome ? 'H' : (isRTH ? 'RTH' : waypoints.length);

            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color:${markerColor}; width:24px; height:24px; border-radius:50%; color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3); margin-left:-12px; margin-top:-12px;">${markerText}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            L.marker(latlng, { icon: icon }).addTo(missionLayerGroup);

            // Draw line
            const points = waypoints.map(wp => wp.latlng);
            points.push(latlng);

            if (missionPolyline) {
                missionPolyline.setLatLngs(points);
            } else if (points.length > 1) {
                missionPolyline = L.polyline(points, { color: '#3b82f6', weight: 3, dashArray: '5, 10' }).addTo(map);
            }

            // Fetch Data
            let windData = null;
            try {
                windData = await getWindData(latlng.lat, latlng.lng);
            } catch (e) {
                console.error("Failed to get wind for waypoint", e);
                uiStatus.innerText = "Warning: Failed to fetch wind data. Using defaults.";
            }

            waypoints.push({
                latlng: latlng,
                windData: windData,
                isRTH: isRTH
            });

            uiBtnClear.disabled = false;
            if (waypoints.length > 2) uiBtnRTH.disabled = false;
            if (isRTH) {
                uiBtnRTH.disabled = true; // Complete
                uiStatus.innerText = "Mission configured.";
            } else {
                uiStatus.innerText = "Click to add next waypoint.";
            }

            updateMissionStats();
        }

        function updateMissionStats() {
            const maxMinutes = parseFloat(uiMaxTime.value) || 30;

            if (waypoints.length === 0) {
                uiStatDist.innerText = "0 m";
                uiStatTime.innerText = "0:00";
                if (uiStatBatteryUsed) uiStatBatteryUsed.innerText = "0:00";

                const safeMins = Math.floor(maxMinutes);
                const safeSecs = Math.round((maxMinutes - safeMins) * 60);
                uiStatRem.innerText = `${safeMins}:${safeSecs.toString().padStart(2, '0')}`;
                uiStatRem.className = "font-bold text-green-500";
                return;
            }

            const targetHeight = parseFloat(uiHeight.value) || 60;

            let totalDist = 0;
            let totalSeconds = 0; // Actual flight duration in seconds
            let batterySecondsConsumed = 0;   // Equivalent battery drain in seconds

            // 1. Initial Climb Tax and Final Descent Tax (assuming we land at end)
            // Climbing uses significantly more power
            const climbTime = (targetHeight / DRONE_CLIMB_SPEED);
            totalSeconds += climbTime;
            batterySecondsConsumed += climbTime * 1.5;

            const descentTime = (targetHeight / DRONE_DESCENT_SPEED);
            totalSeconds += descentTime;
            batterySecondsConsumed += descentTime * 0.8;

            // 2. Leg Calculations
            for (let i = 1; i < waypoints.length; i++) {
                const prev = waypoints[i - 1];
                const curr = waypoints[i];

                const dist = map.distance(prev.latlng, curr.latlng);
                totalDist += dist;

                // Determine effective wind speed
                // We use the wind data from the destination waypoint for the leg
                let windSpdKmh = 0;
                let windDirDeg = 0;

                if (curr.windData && curr.windData.hourly) {
                    const h = parseInt(targetHeight);
                    // Select closest height tier from open-meteo response (10m, 80m, 120m)
                    if (h <= 45) {
                        windSpdKmh = curr.windData.current.wind_speed_10m;
                        windDirDeg = curr.windData.current.wind_direction_10m;
                    } else if (h <= 100) {
                        windSpdKmh = curr.windData.hourly.wind_speed_80m[0];
                        windDirDeg = curr.windData.hourly.wind_direction_80m[0];
                    } else {
                        windSpdKmh = curr.windData.hourly.wind_speed_120m[0];
                        windDirDeg = curr.windData.hourly.wind_direction_120m[0];
                    }
                }

                const windSpdMs = windSpdKmh / 3.6;
                const flightBearing = getBearing(prev.latlng.lat, prev.latlng.lng, curr.latlng.lat, curr.latlng.lng);

                // Calculate headwind (+ is headwind, - is tailwind)
                // Math.cos takes radians. 
                // A headwind means wind direction is opposite to flight bearing.
                // Wind direction is WHERE IT BLOWS FROM. So if flying North (0) and wind from North (0), that's a direct headwind.
                const angleRad = (windDirDeg - flightBearing) * (Math.PI / 180);
                const headwind = windSpdMs * Math.cos(angleRad);
                const crosswind = Math.abs(windSpdMs * Math.sin(angleRad));

                // Drone crabs into crosswind, reducing forward speed capacity
                let forwardSpeedCapacity = DRONE_CRUISE_SPEED;
                if (crosswind < DRONE_CRUISE_SPEED) {
                    forwardSpeedCapacity = Math.sqrt(Math.pow(DRONE_CRUISE_SPEED, 2) - Math.pow(crosswind, 2));
                } else {
                    forwardSpeedCapacity = 1; // Overcome by crosswind
                }

                // Effective ground speed
                let effectiveSpeed = forwardSpeedCapacity - headwind;
                if (effectiveSpeed < 1) effectiveSpeed = 1; // absolute minimum progress to avoid infinite time

                const legTime = dist / effectiveSpeed;
                totalSeconds += legTime;

                // Wind Tax: fighting wind (even tailwind or crosswind) makes motors work harder
                // 1m/s wind adds ~3% energy consumption 
                let windTax = 1 + (windSpdMs * 0.03);

                // Temperature Tax: LiPo batteries lose capacity in the cold
                // Assuming capacity drops by ~1% for every degree below 15°C
                if (curr.windData && curr.windData.temp !== undefined) {
                    if (curr.windData.temp < 15) {
                        const tempTax = (15 - curr.windData.temp) * 0.01;
                        windTax += tempTax;
                    }
                }

                batterySecondsConsumed += legTime * windTax;
            }

            // Update UI
            uiStatDist.innerText = totalDist < 1000 ? `${Math.round(totalDist)} m` : `${(totalDist / 1000).toFixed(2)} km`;

            const flightMins = Math.floor(totalSeconds / 60);
            const flightSecs = Math.round(totalSeconds % 60);
            uiStatTime.innerText = `${flightMins}:${flightSecs.toString().padStart(2, '0')}`;

            if (uiStatBatteryUsed) {
                const battMins = Math.floor(batterySecondsConsumed / 60);
                const battSecs = Math.round(batterySecondsConsumed % 60);
                uiStatBatteryUsed.innerText = `${battMins}:${battSecs.toString().padStart(2, '0')}`;
            }

            const remainingMins = maxMinutes - (batterySecondsConsumed / 60);
            const sign = remainingMins < 0 ? '-' : '';
            const absRemMinsBase = Math.abs(remainingMins);
            const rMins = Math.floor(absRemMinsBase);
            const rSecs = Math.round((absRemMinsBase - rMins) * 60);

            uiStatRem.innerText = `${sign}${rMins}:${rSecs.toString().padStart(2, '0')}`;

            const remainingPct = remainingMins / maxMinutes;

            if (remainingPct <= 0.05 || remainingMins < 0) {
                uiStatRem.className = "font-bold text-red-500 animate-pulse";
            } else if (remainingPct <= 0.15) {
                uiStatRem.className = "font-bold text-orange-400"; // Critical Low
            } else if (remainingPct <= 0.30) {
                uiStatRem.className = "font-bold text-amber-400";  // Low Warning
            } else {
                uiStatRem.className = "font-bold text-green-500";  // Good
            }
        }

        document.getElementById('opacitySlider').addEventListener('input', e => {
            document.getElementById('opacityValue').innerText = e.target.value + '%';
            heightLayer.setOpacity(e.target.value / 100);
        });

        map.on('locationerror', (e) => {
            let msg = "Could not access your location.";
            if (e.code === 1) { // PERMISSION_DENIED
                msg = `<b>Location Access Denied</b><br><br>Please allow location access in your browser settings (often found by tapping the lock icon in the URL bar), then try again.`;
            } else if (e.code === 2) { // POSITION_UNAVAILABLE
                msg = `<b>Location Unavailable</b><br><br>Your device's GPS signal is weak or unavailable.`;
            } else if (e.code === 3) { // TIMEOUT
                msg = `<b>Location Timeout</b><br><br>It took too long to get a GPS signal. Make sure you have a clear view of the sky.`;
            }

            L.popup()
                .setLatLng(map.getCenter())
                .setContent(`<div class="p-3 text-red-600 text-xs leading-tight">${msg}</div>`)
                .openOn(map);
        });

        document.getElementById('opacitySlider').addEventListener('input', e => {
            document.getElementById('opacityValue').innerText = e.target.value + '%';
            heightLayer.setOpacity(e.target.value / 100);
        });

