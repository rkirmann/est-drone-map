        // --- AIRCRAFT LAYER ---
        const aircraftLayer = L.layerGroup();
        let aircraftInterval = null;
        let activeAircraftMarkers = {}; // Store markers by FR24 hex ID

        const warningAudio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'); // Optional silent base64 fallback or real tick
        let existingWarnings = new Set();
        let hasAutoZoomedThisSession = false; // Prevent constant re-zooming every 5 seconds

        async function updateAircraft() {
            const bounds = map.getBounds();
            let lamin = bounds.getSouthWest().lat;
            let lomin = bounds.getSouthWest().lng;
            let lamax = bounds.getNorthEast().lat;
            let lomax = bounds.getNorthEast().lng;

            // Expand search radius by ~100km if user has a location, so we always see incoming threats
            if (userMarker) {
                const uLat = userMarker.getLatLng().lat;
                const uLng = userMarker.getLatLng().lng;
                const buffer = 1.0; // Roughly 100km in degrees at this latitude
                lamin = Math.min(lamin, uLat - buffer);
                lomin = Math.min(lomin, uLng - buffer);
                lamax = Math.max(lamax, uLat + buffer);
                lomax = Math.max(lomax, uLng + buffer);
            }

            // Use FR24 bounds format: maxLat,minLat,minLon,maxLon
            // Add a cache-buster (_cb) to prevent aggressive mobile browser caching of the proxy response
            const frUrl = `https://data-cloud.flightradar24.com/zones/fcgi/boxes.json?bounds=${lamax},${lamin},${lomin},${lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&vehicles=1&gliders=1&estimated=1&_cb=${Date.now()}`;

            let frData = null;

            try {
                // Primary proxy strategy: Custom Cloudflare Worker
                const proxyUrl = `${CONFIG_PROXY_URL}?url=${encodeURIComponent(frUrl)}`;
                const res = await fetch(proxyUrl, { cache: 'no-store' });

                if (res.ok) {
                    frData = await res.json();
                }
            } catch (e) {
                console.warn("Primary custom proxy for aircraft failed, falling back...", e);
            }

            // Fallback strategy if custom proxy fails
            if (!frData) {
                try {
                    const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(frUrl)}`;
                    const res = await fetch(allOriginsUrl, { cache: 'no-store' });

                    if (res.ok) {
                        const wrapper = await res.json();
                        if (wrapper.contents) {
                            frData = JSON.parse(wrapper.contents);
                        }
                    }
                } catch (e) {
                    console.error("All aircraft proxy strategies failed", e);
                    return;
                }
            }

            if (!frData) return;

            try {
                // aircraftLayer.clearLayers();
                let hasCriticalThreats = false;
                let newlySeenKeys = new Set();

                if (frData) {
                    Object.keys(frData).forEach(key => {
                        // FR24 flights are arrays mapped to hexadecimal keys, skip metadata keys
                        if (key !== 'full_count' && key !== 'version' && Array.isArray(frData[key])) {
                            const flight = frData[key];
                            const lat = flight[1];
                            const lng = flight[2];
                            const true_track = flight[3];
                            const altFt = flight[4]; // FR24 altitude is in feet
                            const speedKts = flight[5]; // FR24 speed is in knots
                            const callsign = flight[16] ? flight[16].trim() : flight[11] || 'Unknown';

                            // Convert to metric
                            const altM = Math.round(altFt * 0.3048);
                            const speedKmh = Math.round(speedKts * 1.852);

                            if (lat !== null && lng !== null) {
                                newlySeenKeys.add(key);
                                const isCritical = addAircraftMarker(key, lat, lng, true_track, callsign, altM, speedKmh, 'FR24');
                                if (isCritical) {
                                    hasCriticalThreats = true;

                                    // AUTOMATICALLY ENABLE LAYER IF HIDDEN
                                    if (!map.hasLayer(aircraftLayer)) {
                                        aircraftLayer.addTo(map);
                                        document.getElementById('aircraftToggle').checked = true;
                                    }

                                    if (!existingWarnings.has(callsign)) {
                                        existingWarnings.add(callsign);
                                        // Auto-open popup or show alert toast
                                        triggerCriticalAlert(callsign, altM, speedKmh);

                                        // Auto-zoom to fit both the drone and the incoming aircraft, but only once per new plane
                                        if (userMarker) {
                                            const threatBounds = L.latLngBounds([userMarker.getLatLng(), L.latLng(lat, lng)]);
                                            map.flyToBounds(threatBounds, { padding: [50, 50], duration: 1.5, maxZoom: 12 });
                                        }
                                    }
                                } else {
                                    existingWarnings.delete(callsign);
                                }
                            }
                        }
                    });
                }

                // Clean up markers that are no longer in frData
                Object.keys(activeAircraftMarkers).forEach(existingKey => {
                    if (!newlySeenKeys.has(existingKey)) {
                        aircraftLayer.removeLayer(activeAircraftMarkers[existingKey]);
                        delete activeAircraftMarkers[existingKey];
                    }
                });

                if (!hasCriticalThreats) {
                    hideCriticalAlert();
                }
            } catch (e) {
                console.error("Failed to fetch aircraft data", e);
            }
        }

        let isAlarmPlaying = false;
        let alarmInterval;

        function playLoudAlarm() {
            if (isAlarmPlaying) return;
            isAlarmPlaying = true;

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            const beep = () => {
                if (!isAlarmPlaying) return;
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();

                osc.type = 'square';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
                osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1);

                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);
            };

            // Double beep every second
            beep();
            setTimeout(beep, 150);
            alarmInterval = setInterval(() => {
                beep();
                setTimeout(beep, 150);
            }, 1000);
        }

        function stopLoudAlarm() {
            isAlarmPlaying = false;
            if (alarmInterval) clearInterval(alarmInterval);
        }

        function triggerCriticalAlert(callsign, altM, speedKmh) {
            let alertBox = document.getElementById('criticalAircraftAlert');
            if (!alertBox) {
                alertBox = document.createElement('div');
                alertBox.id = 'criticalAircraftAlert';
                // Use left-0 right-0 mx-auto to center, avoiding transform conflicts with animate-bounce
                alertBox.className = 'absolute top-16 sm:top-20 left-0 right-0 mx-auto w-[90%] max-w-sm z-[2000] bg-red-600/95 backdrop-blur text-white px-4 py-3 sm:px-6 sm:py-4 rounded-xl shadow-2xl border-2 border-red-400 flex flex-col items-center animate-bounce pointer-events-none';
                document.body.appendChild(alertBox);
            }
            alertBox.innerHTML = `
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-3xl animate-pulse">⚠️</span>
                    <h2 class="text-xl font-black uppercase tracking-widest text-red-50">Inbound Aircraft</h2>
                </div>
                <div class="text-center">
                    <div class="font-bold text-lg mb-1">${callsign}</div>
                    <div class="text-red-200 text-sm">Altitude: <b class="text-white">${altM}m</b> • Speed: <b class="text-white">${speedKmh} km/h</b></div>
                </div>
            `;
            alertBox.style.display = 'flex';

            // Start the audio alarm
            playLoudAlarm();
        }

        function hideCriticalAlert() {
            const alertBox = document.getElementById('criticalAircraftAlert');
            if (alertBox) alertBox.style.display = 'none';
            stopLoudAlarm();
        }

        function getCrossTrackDistance(lat1, lon1, lat2, lon2, brng) {
            const R = 6371e3; // Earth radius in meters
            const d13 = map.distance(L.latLng(lat1, lon1), L.latLng(lat2, lon2)) / R;
            const brng13 = getBearing(lat1, lon1, lat2, lon2) * Math.PI / 180;
            const brng12 = brng * Math.PI / 180;

            return Math.asin(Math.sin(d13) * Math.sin(brng13 - brng12)) * R;
        }

        function checkAircraftPopupOffscreen(marker) {
            if (!marker.isPopupOpen()) return;
            const bounds = map.getBounds();
            if (!bounds.contains(marker.getLatLng())) {
                marker.closePopup();
            }
        }

        map.on('move', () => {
            Object.values(activeAircraftMarkers).forEach(marker => {
                checkAircraftPopupOffscreen(marker);
            });
        });

        function addAircraftMarker(key, lat, lng, true_track, callsign, altM, speedKmh, source) {
            let color = '#3b82f6'; // Default Blue (High Altitude)
            let isThreat = false;
            let isCritical = false;
            let threatText = '';

            // Check if aircraft intersects our operational area
            if (userMarker && speedKmh > 20 && altM < 1500) {
                const userLatlng = userMarker.getLatLng();
                const distToUserMeters = map.distance(userLatlng, L.latLng(lat, lng));

                if (distToUserMeters < 100000) { // Only care if plane is within 100km
                    // Calculate cross-track distance to see how close the path gets to the user
                    const brngToUser = getBearing(lat, lng, userLatlng.lat, userLatlng.lng);
                    let angleDiff = Math.abs(true_track - brngToUser);
                    if (angleDiff > 180) angleDiff = 360 - angleDiff;

                    // Only calculate if the plane is generally flying towards the hemisphere of the user
                    if (angleDiff < 90) {
                        const crossTrackDist = Math.abs(getCrossTrackDistance(lat, lng, userLatlng.lat, userLatlng.lng, true_track));

                        // Plane's path will cross within 20km (WARNING ZONE) or 10km (CRITICAL ZONE)
                        if (crossTrackDist < 20000) {
                            // Calculate along-track distance to find out how far away the closest point of approach is
                            const R = 6371e3;
                            const d13 = distToUserMeters / R;
                            const xtD = crossTrackDist / R;
                            const alongTrackDist = Math.acos(Math.cos(d13) / Math.cos(xtD)) * R;

                            const speedMs = speedKmh / 3.6;
                            const secondsToArrival = alongTrackDist / speedMs;

                            // If it hits the zone in less than 5 minutes
                            if (secondsToArrival > 0 && secondsToArrival < 300) {
                                let etaText = Math.round(secondsToArrival / 60) + 'm';
                                if (secondsToArrival < 60) etaText = '<1m';

                                if (crossTrackDist < 10000) {
                                    isCritical = true; // Will enter 10km radius
                                    threatText = `<div class="text-xs font-bold mt-2 p-1.5 border rounded text-center tracking-wide shadow-sm text-red-700 bg-red-100 border-red-500 animate-pulse">
                                        🚨 CRITICAL: Intersects 10km zone (ETA: ${etaText})
                                    </div>`;
                                } else {
                                    isThreat = true; // Will enter 20km radius
                                    threatText = `<div class="text-xs font-bold mt-2 p-1.5 border rounded text-center tracking-wide shadow-sm text-amber-700 bg-amber-50 border-amber-300">
                                        ⚠️ WARNING: Intersects 20km zone (ETA: ${etaText})
                                    </div>`;
                                }
                            }
                        }
                    }
                }
            }

            // Dynamic color grading based on altitude in meters
            if (isCritical) color = '#7f1d1d'; // Dark Red (Critical Danger!)
            else if (isThreat) color = '#ef4444'; // Red (Danger - Inbound!)
            else if (altM < 300) color = '#ef4444'; // Red (Danger/Taking off/Landing)
            else if (altM < 1000) color = '#f97316'; // Orange
            else if (altM < 3000) color = '#eab308'; // Yellow
            else if (altM < 6000) color = '#22c55e'; // Green
            else color = '#3b82f6'; // High cruising altitude

            // For rotation to play nicely with Leaflet's zoom transforms, we need a locked container
            let iconHtml = `
                <div style="position: absolute; width: 24px; height: 24px; left: -12px; top: -12px; transform: rotate(${true_track}deg); transform-origin: center center;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1.5"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                </div>
            `;

            if (isCritical) {
                // EXTREME visual pulse with absolute locked positioning to prevent zoom offsets
                iconHtml = `
                    <div style="position: absolute; left:-18px; top:-18px; width:36px; height:36px;" class="animate-ping rounded-full bg-red-500 opacity-75"></div>
                    <div style="position: absolute; left:0; top:0; transform: scale(1.5);" class="drop-shadow-2xl">
                        ${iconHtml}
                    </div>
                `;
            } else if (isThreat) {
                iconHtml = `<div style="position: absolute; left: 0; top: 0;" class="animate-pulse drop-shadow-md">${iconHtml}</div>`;
            }

            const icon = L.divIcon({
                html: iconHtml,
                className: 'aircraft-icon',
                iconSize: [0, 0], // Let the absolute positions above handle centering
                iconAnchor: [0, 0],
                popupAnchor: [0, -12]
            });

            const popupContent = `
                <div class="p-1 min-w-[140px]">
                    <b class="text-sm font-bold text-slate-800 uppercase border-b border-slate-200 block pb-1 mb-2">✈️ ${callsign}</b>
                    <div class="text-xs mb-1"><b>Alt:</b> ${Math.round(altM)} m</div>
                    <div class="text-xs mb-1"><b>Speed:</b> ${speedKmh} km/h</div>
                    ${threatText}
                    <div class="text-[10px] text-slate-500 mt-2 text-right leading-tight border-t border-slate-100 pt-1">Data by ${source}</div>
                </div>
            `;

            let marker = activeAircraftMarkers[key];
            if (marker) {
                marker.setLatLng([lat, lng]);
                marker.setIcon(icon);

                if (marker.isPopupOpen()) {
                    marker.getPopup().setContent(popupContent);
                    checkAircraftPopupOffscreen(marker);
                } else {
                    marker.setPopupContent(popupContent);
                }
            } else {
                marker = L.marker([lat, lng], { icon: icon });
                marker.bindPopup(popupContent, { autoPan: false });
                marker.addTo(aircraftLayer);
                activeAircraftMarkers[key] = marker;
            }

            return isCritical;
        }

        let isAerofotoPanning = false;

        map.on('moveend', () => {
            updateBuildings();
            updatePowerGrid();
            // Aircraft layer is now updated constantly in the background, no need to call on moveend
            // if (map.hasLayer(aircraftLayer)) updateAircraft();

            if (isAerofotoPanning) {
                isAerofotoPanning = false;
            } else {
                updateAerofoto();
            }
        });

