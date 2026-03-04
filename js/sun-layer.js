// sun-layer.js

const sunLayerGroup = L.layerGroup().addTo(map);
const sunToggle = document.getElementById('sunToggle');

// Create info control for times
let sunInfoControl = null;

function padZero(num) {
    return num.toString().padStart(2, '0');
}

function initSunInfoControl() {
    if (sunInfoControl) return;

    sunInfoControl = L.control({ position: 'bottomleft' });

    sunInfoControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'bg-slate-900/90 backdrop-blur text-white rounded-xl border border-slate-700 shadow-xl p-3 mb-4 pointer-events-none');
        div.id = 'sunInfoBox';
        div.innerHTML = `
            <div class="flex items-center justify-between gap-4 mb-2">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sun Position</span>
                <span id="sunInfoCurrentTime" class="text-xs font-bold text-slate-200">--:--</span>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                <div class="flex items-center gap-1.5">
                    <span class="text-orange-400 text-sm">🌅</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sunrise:</span>
                    <span id="sunInfoSunrise" class="text-xs font-bold text-white">--:--</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="text-pink-400 text-sm">🌇</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sunset:</span>
                    <span id="sunInfoSunset" class="text-xs font-bold text-white">--:--</span>
                </div>
                <div class="flex items-center gap-1.5 col-span-2 pt-1 border-t border-slate-700 mt-1">
                    <span class="text-yellow-400 text-sm">☀️</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Altitude:</span>
                    <span id="sunInfoAltitude" class="text-xs font-bold text-white">--°</span>
                </div>
            </div>
        `;
        return div;
    };
}

function azimuthToBearing(azimuth) {
    return (azimuth * 180 / Math.PI + 180) % 360;
}

function updateSunLayer() {
    if (!sunToggle || !sunToggle.checked) {
        sunLayerGroup.clearLayers();
        if (sunInfoControl && map.hasLayer(sunInfoControl)) {
            map.removeControl(sunInfoControl);
        }
        return;
    }

    if (!sunInfoControl) {
        initSunInfoControl();
    }

    if (!map.hasLayer(sunInfoControl)) {
        // hasLayer checks if control is added on map despite name
        sunInfoControl.addTo(map);
    }

    sunLayerGroup.clearLayers();

    const center = map.getCenter();
    const now = new Date();

    // Ensure SunCalc is loaded
    if (typeof SunCalc === 'undefined') {
        console.error("SunCalc library not loaded.");
        return;
    }

    const times = SunCalc.getTimes(now, center.lat, center.lng);
    const currentPos = SunCalc.getPosition(now, center.lat, center.lng);
    const sunrisePos = SunCalc.getPosition(times.sunrise, center.lat, center.lng);
    const sunsetPos = SunCalc.getPosition(times.sunset, center.lat, center.lng);

    const currentBearing = azimuthToBearing(currentPos.azimuth);
    const sunriseBearing = azimuthToBearing(sunrisePos.azimuth);
    const sunsetBearing = azimuthToBearing(sunsetPos.azimuth);

    // Update Info Box
    const sunriseEl = document.getElementById('sunInfoSunrise');
    const sunsetEl = document.getElementById('sunInfoSunset');
    const timeEl = document.getElementById('sunInfoCurrentTime');
    const altEl = document.getElementById('sunInfoAltitude');

    if (sunriseEl && sunsetEl && timeEl && altEl) {
        sunriseEl.textContent = `${padZero(times.sunrise.getHours())}:${padZero(times.sunrise.getMinutes())}`;
        sunsetEl.textContent = `${padZero(times.sunset.getHours())}:${padZero(times.sunset.getMinutes())}`;
        timeEl.textContent = `${padZero(now.getHours())}:${padZero(now.getMinutes())}`;

        // Altitude is returned in radians, convert to degrees
        const altitudeDeg = currentPos.altitude * 180 / Math.PI;
        altEl.textContent = `${altitudeDeg.toFixed(1)}°`;

        if (altitudeDeg < 0) {
            altEl.classList.add('text-slate-500');
            altEl.classList.remove('text-white', 'text-yellow-400');
        } else {
            altEl.classList.remove('text-slate-500');
            altEl.classList.add('text-yellow-400');
        }
    }

    const centerPt = turf.point([center.lng, center.lat]);
    const lineLengthKm = 100; // sufficiently long to go offscreen for typical zooms

    // Draw Current Sun Line
    const currentDest = turf.destination(centerPt, lineLengthKm, currentBearing, { units: 'kilometers' });
    const currentLine = [
        [center.lat, center.lng],
        [currentDest.geometry.coordinates[1], currentDest.geometry.coordinates[0]]
    ];
    L.polyline(currentLine, { color: '#eab308', weight: 4, dashArray: '10, 10', opacity: 0.8 }).addTo(sunLayerGroup);

    // Draw Sunrise Line
    const sunriseDest = turf.destination(centerPt, lineLengthKm, sunriseBearing, { units: 'kilometers' });
    const sunriseLine = [
        [center.lat, center.lng],
        [sunriseDest.geometry.coordinates[1], sunriseDest.geometry.coordinates[0]]
    ];
    L.polyline(sunriseLine, { color: '#fb923c', weight: 3, dashArray: '5, 15', opacity: 0.7 }).addTo(sunLayerGroup);

    // Draw Sunset Line
    const sunsetDest = turf.destination(centerPt, lineLengthKm, sunsetBearing, { units: 'kilometers' });
    const sunsetLine = [
        [center.lat, center.lng],
        [sunsetDest.geometry.coordinates[1], sunsetDest.geometry.coordinates[0]]
    ];
    L.polyline(sunsetLine, { color: '#f472b6', weight: 3, dashArray: '5, 15', opacity: 0.7 }).addTo(sunLayerGroup);

    // Add central marker (Sun)
    L.circleMarker([center.lat, center.lng], {
        radius: 6,
        color: '#eab308',
        fillColor: '#fef08a',
        fillOpacity: 1,
        weight: 2
    }).addTo(sunLayerGroup);
}

if (sunToggle) {
    sunToggle.addEventListener('change', updateSunLayer);
}

map.on('move', () => {
    if (sunToggle && sunToggle.checked) {
        updateSunLayer();
    }
});

// Update every minute (for time and sun position)
setInterval(() => {
    if (sunToggle && sunToggle.checked) {
        updateSunLayer();
    }
}, 60000);
