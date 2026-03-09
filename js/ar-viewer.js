// ar-viewer.js
// Handles displaying the planned flight path in a 1:1 scale outdoor AR view

let arViewActive = false;
let arSceneCreated = false;

function initARButton() {
    const btnExportKMZ = document.getElementById('btnExportKMZ');
    
    // Create AR View button
    const btnARView = document.createElement('button');
    btnARView.id = 'btnARView';
    btnARView.className = 'hidden flex-1 bg-indigo-700 hover:bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider py-2 ml-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    btnARView.innerText = 'AR View (Beta)';
    btnARView.title = 'View Flight Path in Augmented Reality';
    btnARView.disabled = true;
    
    btnARView.onclick = toggleARView;
    
    // Insert after Export KMZ
    btnExportKMZ.parentNode.insertBefore(btnARView, btnExportKMZ.nextSibling);
    
    // Intercept path generation to enable the AR button
    if (typeof generateLawnmowerPath === 'function') {
        const originalGenerateLawnmowerPath = generateLawnmowerPath;
        generateLawnmowerPath = async function() {
            await originalGenerateLawnmowerPath.apply(this, arguments);
            const hasPath = typeof currentLawnmowerPath !== 'undefined' && currentLawnmowerPath && currentLawnmowerPath.length > 0;
            document.getElementById('btnARView').disabled = !hasPath;
        };
    }
    
    // Intercept clear mapping to disable it
    if (typeof clearMapping === 'function') {
        const originalClearMapping = clearMapping;
        clearMapping = function() {
            originalClearMapping.apply(this, arguments);
            document.getElementById('btnARView').disabled = true;
        };
    }
    
    // Toggling visibility based on mode
    const btnModeMapping = document.getElementById('btnModeMapping');
    const btnModeWaypoint = document.getElementById('btnModeWaypoint');
    
    if (btnModeMapping) {
        btnModeMapping.addEventListener('click', () => {
            document.getElementById('btnARView').classList.remove('hidden');
        });
    }
    
    if (btnModeWaypoint) {
        btnModeWaypoint.addEventListener('click', () => {
            document.getElementById('btnARView').classList.add('hidden');
        });
    }
}

function createARScene() {
    if (arSceneCreated) return;
    
    // Create loading indicator
    const loadingUI = document.createElement('div');
    loadingUI.id = 'arLoadingUI';
    loadingUI.className = 'fixed inset-0 z-[10000] bg-slate-900 flex flex-col items-center justify-center text-white';
    loadingUI.innerHTML = `
        <div class="spinner mb-4 w-12 h-12 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin"></div>
        <h2 class="text-xl font-bold">Starting AR Camera...</h2>
        <p class="text-slate-400 mt-2 max-w-sm text-center">Please allow camera and GPS permissions if prompted. Stand safely outside with a clear view of the sky.</p>
        <button id="cancelARLoadBtn" class="mt-8 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-full font-bold">Cancel</button>
    `;
    document.body.appendChild(loadingUI);
    
    document.getElementById('cancelARLoadBtn').onclick = () => {
        document.getElementById('arLoadingUI').remove();
        arViewActive = false;
    };
    
    // Load A-Frame
    const aframeScript = document.createElement('script');
    aframeScript.src = 'https://aframe.io/releases/1.3.0/aframe.min.js';
    document.head.appendChild(aframeScript);
    
    aframeScript.onload = () => {
        // Load AR.js Location module
        const arjsScript = document.createElement('script');
        arjsScript.src = 'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js';
        document.head.appendChild(arjsScript);
        
        arjsScript.onload = setupARContainer;
    };
}

function setupARContainer() {
    if (!document.getElementById('arLoadingUI')) return; // Was cancelled
    
    const arContainer = document.createElement('div');
    arContainer.id = 'arContainer';
    // Style forces it to cover the entire viewport identically to full screen
    arContainer.setAttribute('style', 'position: fixed; inset: 0; z-index: 9999; width: 100vw; height: 100vh; background: black; overflow: hidden;');
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-safe right-safe top-6 right-6 z-[10001] bg-red-600/90 hover:bg-red-500 text-white p-3 rounded-full shadow-2xl backdrop-blur-sm transition-transform active:scale-90';
    closeBtn.setAttribute('style', 'position: absolute; top: 1.5rem; right: 1.5rem; z-index: 10001;');
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.onclick = toggleARView;
    arContainer.appendChild(closeBtn);
    
    // AR Help Overlay
    const helpText = document.createElement('div');
    helpText.className = 'absolute bottom-8 left-0 right-0 z-[10001] text-center pointer-events-none';
    helpText.setAttribute('style', 'position: absolute; bottom: 2rem; width: 100%; z-index: 10001;');
    helpText.innerHTML = '<span class="bg-black/60 text-white px-4 py-2 rounded-full backdrop-blur text-sm font-bold shadow opacity-80">Look towards the planned flight area</span>';
    arContainer.appendChild(helpText);
    
    // A-Frame Scene built using template literals
    const sceneStr = `
        <a-scene 
            vr-mode-ui="enabled: false"
            embedded
            arjs="sourceType: webcam; debugUIEnabled: false;">
            
            <a-camera gps-camera rotation-reader></a-camera>
            
            <!-- Where we will spawn the waypoints -->
            <a-entity id="arFlightPath"></a-entity>
            
        </a-scene>
    `;
    
    arContainer.insertAdjacentHTML('beforeend', sceneStr);
    document.body.appendChild(arContainer);
    
    arSceneCreated = true;
    renderARPath();
    
    // Remove loading UI once camera feed is theoretically requesting
    setTimeout(() => {
        const loader = document.getElementById('arLoadingUI');
        if (loader) loader.remove();
    }, 1500);
}

function renderARPath() {
    if (typeof currentLawnmowerPath === 'undefined' || !currentLawnmowerPath || currentLawnmowerPath.length < 2) return;
    
    const pathEntity = document.getElementById('arFlightPath');
    if (!pathEntity) return;
    
    // Clear old path
    pathEntity.innerHTML = '';
    
    // In actual WebXR location AR, rendering continuous custom 3D lines across kilometers natively is complex.
    // The easiest and most performant AR approach is rendering large glowing "Waypoints" at each coordinate.
    
    currentLawnmowerPath.forEach((pt, i) => {
        const isStart = i === 0;
        const isEnd = i === currentLawnmowerPath.length - 1;
        
        let color = '#f59e0b'; // Amber
        let scale = '2 2 2';
        let label = (i + 1).toString();
        
        if (isStart) {
            color = '#22c55e'; // Green
            scale = '3 3 3';
            label = 'START';
        } else if (isEnd) {
            color = '#ef4444'; // Red
            scale = '3 3 3';
            label = 'END';
        }
        
        // The container linking real-world GPS to A-Frame space
        const node = document.createElement('a-entity');
        node.setAttribute('gps-entity-place', `latitude: ${pt.lat}; longitude: ${pt.lng}`);
        
        // The visible sphere/marker
        const marker = document.createElement('a-sphere');
        marker.setAttribute('radius', isStart || isEnd ? '1.5' : '1'); 
        marker.setAttribute('color', color);
        marker.setAttribute('opacity', '0.8');
        // Standardize Y Up coordinate relative to standard user eye-level height (assumed building height + takeoff)
        marker.setAttribute('position', `0 ${pt.alt} 0`);
        
        // The floating text
        const text = document.createElement('a-text');
        text.setAttribute('value', label);
        text.setAttribute('align', 'center');
        text.setAttribute('scale', '15 15 15'); // Text needs to be scaled massively in AR
        text.setAttribute('position', `0 ${parseFloat(pt.alt) + 3} 0`); // Float 3 meters above sphere
        text.setAttribute('look-at', '[gps-camera]'); // Always face user
        
        // Add components to DOM
        node.appendChild(marker);
        node.appendChild(text);
        pathEntity.appendChild(node);
    });
}

function toggleARView() {
    arViewActive = !arViewActive;
    
    if (arViewActive) {
        if (!arSceneCreated) {
            createARScene();
        } else {
            const arContainer = document.getElementById('arContainer');
            if (arContainer) {
                arContainer.hidden = false;
                arContainer.style.display = 'block';
                renderARPath();
                // Safari iOS WebGL resize hack
                window.dispatchEvent(new Event('resize'));
            }
        }
    } else {
        const arContainer = document.getElementById('arContainer');
        if (arContainer) {
            arContainer.style.display = 'none';
            arContainer.hidden = true;
            
            // To properly stop the camera and save battery entirely when "X" is clicked:
            // The safest route is blowing away the A-Frame DOM and AR.js video feeds entirely.
            // A-Frame binds heavily to document level events.
            
            const videos = document.querySelectorAll('video');
            videos.forEach(v => {
                if (v.srcObject) {
                    v.srcObject.getTracks().forEach(track => {
                        track.stop();
                    });
                }
                v.remove();
            });
            
            arContainer.remove();
            arSceneCreated = false;
        }
    }
}

// Auto-initialize when file loads via DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initARButton);
} else {
    // If dynamically injected late
    setTimeout(initARButton, 500);
}
