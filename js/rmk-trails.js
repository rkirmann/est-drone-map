const rmkLayer = L.markerClusterGroup({
    maxClusterRadius: 40,
    disableClusteringAtZoom: 12,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    chunkedLoading: true
});

let rmkDataLoaded = false;

async function fetchRmkData(page = 1, allElements = []) {
    const perPage = 250;
    const url = `https://loodusegakoos.ee/admin/api/elements?q.page.path.$starts=kuhuminna/&include_values=true&page=${page}&per_page=${perPage}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const totalPages = parseInt(response.headers.get('x-total-pages') || '1', 10);

        allElements = allElements.concat(data);

        if (page < totalPages) {
            return fetchRmkData(page + 1, allElements);
        }

        return allElements;
    } catch (error) {
        console.error("Error fetching RMK data:", error);
        return allElements;
    }
}

function getRmkIcon(type) {
    let color = '#10b981'; // emerald-500
    let icon = '🌲';

    const typeLower = type ? type.toLowerCase() : '';
    if (typeLower.includes('telkimis')) {
        color = '#3b82f6'; // blue-500
        icon = '⛺';
    } else if (typeLower.includes('lõkke')) {
        color = '#ef4444'; // red-500
        icon = '🔥';
    } else if (typeLower.includes('matkarada') || typeLower.includes('õpperada')) {
        color = '#f59e0b'; // amber-500
        icon = '🥾';
    } else if (typeLower.includes('metsaonn') || typeLower.includes('metsamaja')) {
        color = '#8b5cf6'; // purple-500
        icon = '🛖';
    } else if (typeLower.includes('uuritorn') || typeLower.includes('vaatetorn')) {
        color = '#6366f1'; // indigo-500
        icon = '🔭';
    } else if (typeLower.includes('info')) {
        color = '#64748b'; // slate-500
        icon = 'ℹ️';
    }

    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.5); font-size: 12px; line-height: 1;">${icon}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

async function updateRmkData() {
    if (rmkDataLoaded) return;

    const toggleLabel = document.querySelector('label[for="rmkToggle"]');
    const originalText = toggleLabel ? toggleLabel.innerHTML : '🌲 RMK Trails';
    if (toggleLabel) {
        toggleLabel.innerHTML = '⏳ Loading...';
    }

    const elements = await fetchRmkData();

    // Filter out elements without coordinates
    const validElements = elements.filter(el => el.values && el.values.latitude && el.values.longitude);

    validElements.forEach(el => {
        const lat = parseFloat(el.values.latitude);
        const lon = parseFloat(el.values.longitude);

        if (isNaN(lat) || isNaN(lon)) return;

        const title = el.title || 'Unknown Object';
        const type = el.values.object_type || (el.element_definition ? el.element_definition.title : '');
        const region = el.values.region || '';
        const desc = el.values.description || '';
        const equip = el.values.equipment || '';
        const url = el.public_url || '';
        let photo = null;
        if (el.values.photo) {
            if (el.values.photo.startsWith('//')) {
                photo = 'https:' + el.values.photo;
            } else if (el.values.photo.startsWith('/photos/')) {
                photo = 'https://loodusegakoos.ee' + el.values.photo;
            } else {
                photo = el.values.photo;
            }
        }
        let popupContent = `
            <div class="text-xs max-w-xs">
                <div class="font-bold text-sm mb-1 text-emerald-800">${title}</div>
                ${photo ? `<div class="mb-2"><img src="${photo}" class="w-full h-auto rounded border border-slate-200" alt="Photo" style="max-height: 120px; object-fit: cover;"></div>` : ''}
                <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 mb-2">
                    ${type ? `<span class="text-slate-500 font-semibold">Type:</span><span>${type}</span>` : ''}
                    ${region ? `<span class="text-slate-500 font-semibold">Region:</span><span>${region}</span>` : ''}
                </div>
                ${desc ? `<div class="mb-2 text-slate-700 italic border-l-2 border-emerald-300 pl-2 pr-1 max-h-32 overflow-y-auto">${desc}</div>` : ''}
                ${equip ? `<div class="mb-2"><span class="font-semibold text-slate-600">Equipment:</span><br/>${equip}</div>` : ''}
                ${url ? `<div class="mt-2 text-right"><a href="${url}" target="_blank" class="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center gap-1">More Info <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a></div>` : ''}
            </div>
        `;

        const marker = L.marker([lat, lon], {
            icon: getRmkIcon(type)
        });

        marker.bindPopup(popupContent, { maxWidth: 320 });
        rmkLayer.addLayer(marker);
    });

    rmkDataLoaded = true;
    if (toggleLabel) {
        toggleLabel.innerHTML = originalText;
    }
}
