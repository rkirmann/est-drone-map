        async function getWindData(lat, lng) {
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m&hourly=wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m&wind_speed_unit=kmh&forecast_days=1`;
                const res = await fetch(url);
                const data = await res.json();
                const nowIso = new Date().toISOString().substring(0, 13) + ":00";
                let idx = data.hourly.time.indexOf(nowIso);
                if (idx === -1) idx = new Date().getHours();
                const s80 = data.hourly.wind_speed_80m[idx];
                const s120 = data.hourly.wind_speed_120m[idx];
                return {
                    temp: data.current.temperature_2m,
                    gnd: { speed: data.current.wind_speed_10m, gust: data.current.wind_gusts_10m, dir: data.current.wind_direction_10m },
                    h80: { speed: s80, gust: Math.round(s80 * 1.4), dir: data.hourly.wind_direction_80m[idx] },
                    h120: { speed: s120, gust: Math.round(s120 * 1.4), dir: data.hourly.wind_direction_120m[idx] }
                };
            } catch (e) { return null; }
        }

        document.getElementById('eansToggle').addEventListener('change', async e => {
            if (e.target.checked) {
                eansLayer.addTo(map);
                if (eansLayer.getLayers().length === 0) {
                    const loadingPopup = L.popup().setLatLng(map.getCenter()).setContent('<div class="loading p-2"><div class="spinner"></div><span>Downloading Zones...</span></div>').openOn(map);
                    
                    const url = 'https://utm.eans.ee/avm/utm/uas.geojson';
                    const proxyUrl = `${CONFIG_PROXY_URL}?url=${encodeURIComponent(url)}`;
                    
                    try {
                        const res = await fetch(proxyUrl);
                        const data = await res.json();

                        L.geoJSON(data, {
                            filter: function (feature) {
                                const ignoredZones = ['Outside Estonia', 'EEGZS1', 'INFO'];
                                return !ignoredZones.includes(feature.properties.name || feature.properties.identifier || '');
                            },
                            style: function (feature) {
                                return {
                                    color: "#ef4444",
                                    weight: 2,
                                    fillColor: "#ef4444",
                                    fillOpacity: 0.15,
                                    dashArray: '5, 5',
                                    interactive: false // Let map clicks pass through to the terrain/main popup
                                };
                            },
                            onEachFeature: function (feature, layer) {
                                const props = feature.properties;
                                const name = props.name || props.identifier || 'Zone';
                                let message = props.message || '';
                                if (!message && props.extendedProperties && props.extendedProperties.localizedMessages) {
                                    const enMsg = props.extendedProperties.localizedMessages.find(m => m.language === 'en-GB') || props.extendedProperties.localizedMessages[0];
                                    if (enMsg) message = enMsg.message;
                                }

                                let content = `<div class="text-xs p-1">
                                    <b class="uppercase">${name}</b> - <span class="text-[10px] text-slate-500">${props.type || ''}</span>
                                    <hr class="my-1 border-slate-200">
                                    <div class="mb-1"><b class="text-slate-700">Restriction:</b> ${props.restriction || 'None'}</div>
                                    ${props.lower || props.upper ? `<div class="mb-1"><b class="text-slate-700">Limits:</b> ${props.lower || 'SFC'} - ${props.upper || 'UNL'}</div>` : ''}
                                    ${props.reason ? `<div class="mb-1"><b class="text-slate-700">Reason:</b> ${props.reason}</div>` : ''}
                                    ${message ? `<p class="max-h-32 overflow-y-auto whitespace-pre-wrap mt-2 bg-slate-50 p-1 border border-slate-100 rounded text-slate-700">${message}</p>` : ''}
                                </div>`;
                                layer.featureContent = content; // Store the HTML content on the layer instead of binding popup
                            }
                        }).addTo(eansLayer);
                    } catch (err) {
                        console.error('Error loading geojson:', err);
                    }
                    map.closePopup(loadingPopup);
                }
            } else map.removeLayer(eansLayer);
        });

