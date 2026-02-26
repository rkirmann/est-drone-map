// --- TOGGLES ---

document.querySelectorAll('input[name="basemap"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        map.removeLayer(baseMap);
        map.removeLayer(baseSatellite);
        map.removeLayer(labelsLayer);

        if (e.target.value === 'satellite') {
            baseSatellite.addTo(map);
        } else if (e.target.value === 'hybrid') {
            baseSatellite.addTo(map);
            labelsLayer.addTo(map);
        } else {
            baseMap.addTo(map);
        }
    });
});

document.getElementById('aircraftToggle').addEventListener('change', e => {
    if (e.target.checked) {
        aircraftLayer.addTo(map);
        updateAircraft();
    } else {
        map.removeLayer(aircraftLayer);
        aircraftLayer.clearLayers();
        Object.keys(activeAircraftMarkers).forEach(k => delete activeAircraftMarkers[k]);
    }
});

// --- WAKE LOCK (Keep screen on) ---
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released');
            });
            console.log('Screen Wake Lock acquired');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

// Request wake lock on first interaction (required by many browsers)
document.addEventListener('click', () => {
    if (!wakeLock) requestWakeLock();
}, { once: true });

// Loop the update in the background constantly every 5 seconds
updateAircraft();
aircraftInterval = setInterval(updateAircraft, 5000);

// Mobile browsers aggressively pause setInterval when the tab is backgrounded or screen is off.
// This forces an immediate data refresh the exact millisecond the user returns to the map tab.
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        updateAircraft();
        // Re-acquire wake lock if it was released when tab was hidden
        if (wakeLock === null || wakeLock.released) {
            requestWakeLock();
        }
    }
});

document.getElementById('buildingsToggle').addEventListener('change', e => {
    if (e.target.checked) {
        buildingsLayer.addTo(map);
        updateBuildings();
    } else {
        map.removeLayer(buildingsLayer);
        buildingsLayer.clearLayers();
        currentBuildingsBbox = ''; // Force redraw on next toggle
    }
});

document.getElementById('rmkToggle').addEventListener('change', e => {
    if (e.target.checked) {
        map.addLayer(rmkLayer);
        updateRmkData();
    } else {
        map.removeLayer(rmkLayer);
    }
});
