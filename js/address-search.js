// address-search.js

let searchTimeout = null;
const searchWrapper = document.getElementById('searchWrapper');
const searchIconBtn = document.getElementById('searchIconBtn');
const searchInput = document.getElementById('searchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const searchResults = document.getElementById('searchResults');
let isSearchExpanded = false;
let searchMarker = null;

function toggleSearch(expand) {
    isSearchExpanded = expand;
    if (expand) {
        searchWrapper.classList.remove('w-10', 'sm:w-12');
        searchWrapper.classList.add('w-48', 'sm:w-64');
        searchInput.classList.remove('opacity-0');
        searchInput.classList.add('opacity-100');
        // Small delay to allow transition to start before focusing
        setTimeout(() => searchInput.focus(), 50);
    } else {
        searchWrapper.classList.remove('w-48', 'sm:w-64');
        searchWrapper.classList.add('w-10', 'sm:w-12');
        searchInput.classList.remove('opacity-100');
        searchInput.classList.add('opacity-0');
        searchInput.value = '';
        searchInput.blur();
        searchResults.classList.add('hidden');
        searchClearBtn.classList.add('opacity-0', 'pointer-events-none', 'hidden');
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
        }
    }
}

searchIconBtn.addEventListener('click', () => {
    toggleSearch(!isSearchExpanded);
});

searchWrapper.addEventListener('click', (e) => {
    // If clicking wrapper while closed, expand it
    if (!isSearchExpanded && e.target !== searchIconBtn) {
        toggleSearch(true);
    }
});

searchClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    searchInput.value = '';
    searchResults.classList.add('hidden');
    searchClearBtn.classList.add('opacity-0', 'pointer-events-none', 'hidden');
    searchInput.focus();
    if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
    }
});

// Hide search when clicking on the map
map.on('click', () => {
    if (isSearchExpanded && searchInput.value.length === 0) {
        toggleSearch(false);
    } else if (isSearchExpanded) {
        searchResults.classList.add('hidden');
    }
});

// Hide search when clicking anywhere else outside of searchControl
document.addEventListener('click', (e) => {
    const searchControl = document.getElementById('addressSearchControl');
    if (isSearchExpanded && searchControl && !searchControl.contains(e.target) && e.target.id !== 'map') {
        if (searchInput.value.length === 0) {
            toggleSearch(false);
        } else {
            searchResults.classList.add('hidden');
        }
    }
});

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();

    if (val.length > 0) {
        searchClearBtn.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
    } else {
        searchClearBtn.classList.add('opacity-0', 'pointer-events-none', 'hidden');
        searchResults.classList.add('hidden');
    }

    if (val.length < 3) {
        searchResults.classList.add('hidden');
        return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        fetchAddress(val);
    }, 400);
});

searchInput.addEventListener('focus', () => {
    // If focused and has value > 3, we might want to re-show results
    if (searchInput.value.trim().length >= 3 && searchResults.innerHTML !== '') {
        searchResults.classList.remove('hidden');
    }
});

async function fetchAddress(query) {
    try {
        const url = `https://inaadress.maaamet.ee/inaadress/gazetteer?address=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();

        // Maa-amet API returns generic error or empty array if not found
        if (data.addresses && data.addresses.length > 0) {
            renderResults(data.addresses);
        } else {
            searchResults.innerHTML = '<div class="p-3 text-xs text-slate-400">Ei leitud vastet</div>';
            searchResults.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Address search failed:", err);
    }
}

function renderResults(addresses) {
    searchResults.innerHTML = '';

    // Take up to 10 results
    const topResults = addresses.slice(0, 10);

    topResults.forEach(addr => {
        const item = document.createElement('div');
        item.className = 'p-3 border-b border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors last:border-0';

        const title = document.createElement('div');
        title.className = 'text-xs font-bold text-slate-200';
        title.innerText = addr.aadresstekst || addr.pikkaadress;

        const subtitle = document.createElement('div');
        subtitle.className = 'text-[10px] text-slate-400 mt-0.5';
        let subText = addr.pikkaadress !== addr.aadresstekst ? addr.pikkaadress : '';
        if (!subText) {
            subText = [addr.asustusyksus, addr.omavalitsus, addr.maakond].filter(Boolean).join(', ');
        }
        subtitle.innerText = subText;

        item.appendChild(title);
        item.appendChild(subtitle);

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAddress(addr);
        });

        searchResults.appendChild(item);
    });

    searchResults.classList.remove('hidden');
}

function selectAddress(addr) {
    // Hide results
    searchResults.classList.add('hidden');
    // Set input value
    searchInput.value = addr.aadresstekst || addr.pikkaadress;

    let lat = parseFloat(addr.viitepunkt_b);
    let lng = parseFloat(addr.viitepunkt_l);

    // Fallback to L-EST coordinates if lat/lng are missing or invalid
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const coordX = parseFloat(addr.viitepunkt_x); // Easting
        const coordY = parseFloat(addr.viitepunkt_y); // Northing

        if (Number.isFinite(coordX) && Number.isFinite(coordY) && typeof estCRS !== 'undefined') {
            const p = estCRS.unproject(L.point(coordX, coordY));
            lat = p.lat;
            lng = p.lng;
        }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
        console.error("Valed või puuduvad koordinaadid:", addr);
        return;
    }

    if (searchMarker) {
        map.removeLayer(searchMarker);
    }

    // Fly to address, capped at zoom 14 since Estonian CRS max zoom is 15
    map.flyTo([lat, lng], 14, { duration: 1.5 });

    // Add point marker
    searchMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: "#3b82f6",
        color: "#fff",
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(map)
        .bindPopup(`<div class="font-bold text-slate-800">${addr.aadresstekst || addr.pikkaadress}</div><div class="text-xs text-slate-600">${addr.pikkaadress}</div>`)
        .openPopup();

    toggleSearch(false);
}
