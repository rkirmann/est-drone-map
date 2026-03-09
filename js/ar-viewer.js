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
    
    // Force camera request upfront to ensure iOS/Android prompt triggers properly
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                // We just needed permission, we can stop this temporary stream 
                // because AR.js will create its own managed stream
                stream.getTracks().forEach(track => track.stop());
                proceedWithARLoad();
            })
            .catch(err => {
                alert("Camera permission is required for AR view. Please allow it in your browser settings.");
                arViewActive = false;
            });
    } else {
        proceedWithARLoad();
    }
}

function proceedWithARLoad() {
    // Create loading indicator
    const loadingUI = document.createElement('div');
    loadingUI.id = 'arLoadingUI';
    loadingUI.className = 'fixed inset-0 z-[10000] bg-slate-900 flex flex-col items-center justify-center text-white';
    loadingUI.innerHTML = `
        <div class="spinner mb-4 w-12 h-12 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin"></div>
        <h2 class="text-xl font-bold">Starting AR Camera...</h2>
        <p class="text-slate-400 mt-2 max-w-sm text-center">Stand safely outside. Look around to calibrate compass.</p>
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
        // We need a custom component to draw lines between GPS coordinate entities
        setupGpsLineComponent();
        
        // Load AR.js Location module
        const arjsScript = document.createElement('script');
        arjsScript.src = 'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js';
        document.head.appendChild(arjsScript);
        
        arjsScript.onload = setupARContainer;
    };
}

function setupGpsLineComponent() {
    if (typeof AFRAME === 'undefined') return;
    
    // Custom A-Frame component to draw a line between this GPS entity and another GPS entity
    AFRAME.registerComponent('gps-line', {
        schema: {
            color: { default: '#f59e0b' },
            width: { default: 5 },
            nextLat: { type: 'number' },
            nextLng: { type: 'number' },
            nextAlt: { type: 'number', default: 0 }
        },
        init: function () {
            // Wait for both the camera and the GPS system to initialize
            this.el.sceneEl.addEventListener('gps-camera-update-position', () => {
                this.updateLine();
            });
            // Update line geometry relative to camera on every frame tick is heavy,
            // AR.js 'gps-entity-place' handles moving the parent entity wrapper.
            // We just need to draw a local line from 0,0,0 to the relative position of the NEXT point.
        },
        updateLine: function() {
            // Converting lat/lng differences to local meters (rough equirectangular projection for speed)
            const currentLat = this.el.getAttribute('gps-entity-place').latitude;
            const currentLng = this.el.getAttribute('gps-entity-place').longitude;
            const currentAlt = parseFloat(this.el.getAttribute('position').y) || 0;
            
            // Earth radius in meters
            const R = 6378137; 
            
            // Offsets in meters from CURRENT point to NEXT point
            const dLat = (this.data.nextLat - currentLat) * (Math.PI / 180);
            const dLng = (this.data.nextLng - currentLng) * (Math.PI / 180);
            
            const dx = R * dLng * Math.cos(currentLat * Math.PI / 180); // East/West (X axis)
            const dy = this.data.nextAlt - currentAlt;                 // Up/Down (Y axis)
            const dz = - (R * dLat);                                   // North/South (Z axis, negative is North in WebGL)
            
            // Draw standard A-Frame line from local origin (0,0,0) to calculated offset (dx,dy,dz)
            this.el.setAttribute('line', {
                start: '0 0 0',
                end: `${dx} ${dy} ${dz}`,
                color: this.data.color,
                width: this.data.width // Note: Line width over 1px often unsupported by browser WebGL on Windows, but works on some mobile
            });
            
            // For thicker lines that work everywhere, we could draw a cylinder across dx,dy,dz, 
            // but A-Frame lines are usually sufficient for path preview
        }
    });
}

function setupARContainer() {
    if (!document.getElementById('arLoadingUI')) return; // Was cancelled
    
    const arContainer = document.createElement('div');
    arContainer.id = 'arContainer';
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
    helpText.innerHTML = '<span class="bg-black/60 text-white px-4 py-2 rounded-full backdrop-blur text-sm font-bold shadow opacity-80">Look around to calibrate GPS</span>';
    arContainer.appendChild(helpText);
    
    // AR.js scene. Crucial that 'sourceType: webcam' is explicit
    const sceneStr = `
        <a-scene 
            vr-mode-ui="enabled: false"
            embedded
            renderer="antialias: true; alpha: true"
            arjs="sourceType: webcam; debugUIEnabled: false; videoTexture: true;">
            
            <a-camera gps-camera="minDistance: 1; positionMinAccuracy: 100; maxDistance: 3000" rotation-reader></a-camera>
            
            <a-entity id="arFlightPath"></a-entity>
            
        </a-scene>
    `;
    
    arContainer.insertAdjacentHTML('beforeend', sceneStr);
    document.body.appendChild(arContainer);
    
    arSceneCreated = true;
    renderARPath();
    
    setTimeout(() => {
        const loader = document.getElementById('arLoadingUI');
        if (loader) loader.remove();
    }, 2000);
}

function renderARPath() {
    if (typeof currentLawnmowerPath === 'undefined' || !currentLawnmowerPath || currentLawnmowerPath.length < 2) return;
    
    const pathEntity = document.getElementById('arFlightPath');
    if (!pathEntity) return;
    
    pathEntity.innerHTML = '';
    
    // Render lines using the custom gps-line component
    for (let i = 0; i < currentLawnmowerPath.length - 1; i++) {
        const pt = currentLawnmowerPath[i];
        const nextPt = currentLawnmowerPath[i+1];
        
        const isStart = i === 0;
        let color = '#f59e0b'; // Path color amber
        
        if (isStart) color = '#22c55e'; // Green start leg
        
        const node = document.createElement('a-entity');
        node.setAttribute('gps-entity-place', `latitude: ${pt.lat}; longitude: ${pt.lng}`);
        node.setAttribute('position', `0 ${pt.alt} 0`);
        
        // Draw the line from this node to the next
        node.setAttribute('gps-line', `nextLat: ${nextPt.lat}; nextLng: ${nextPt.lng}; nextAlt: ${nextPt.alt}; color: ${color}; width: 10;`);
        
        // Add tiny markers at corners just to help visualization from afar
        const cornerMarker = document.createElement('a-sphere');
        cornerMarker.setAttribute('radius', '0.5'); 
        cornerMarker.setAttribute('color', i === 0 ? '#22c55e' : '#f59e0b');
        node.appendChild(cornerMarker);
        
        // Add START text
        if (isStart) {
            const text = document.createElement('a-text');
            text.setAttribute('value', 'START');
            text.setAttribute('align', 'center');
            text.setAttribute('scale', '10 10 10'); 
            text.setAttribute('position', '0 2 0'); 
            text.setAttribute('look-at', '[gps-camera]'); 
            node.appendChild(text);
        }
        
        pathEntity.appendChild(node);
    }
    
    // Add END point marker
    const endP = currentLawnmowerPath[currentLawnmowerPath.length - 1];
    const endNode = document.createElement('a-entity');
    endNode.setAttribute('gps-entity-place', `latitude: ${endP.lat}; longitude: ${endP.lng}`);
    endNode.setAttribute('position', `0 ${endP.alt} 0`);
    
    const endMarker = document.createElement('a-sphere');
    endMarker.setAttribute('radius', '0.8'); 
    endMarker.setAttribute('color', '#ef4444');
    
    const endText = document.createElement('a-text');
    endText.setAttribute('value', 'END');
    endText.setAttribute('align', 'center');
    endText.setAttribute('scale', '10 10 10'); 
    endText.setAttribute('position', '0 2 0'); 
    endText.setAttribute('look-at', '[gps-camera]'); 
    
    endNode.appendChild(endMarker);
    endNode.appendChild(endText);
    pathEntity.appendChild(endNode);
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
                window.dispatchEvent(new Event('resize'));
            }
        }
    } else {
        const arContainer = document.getElementById('arContainer');
        if (arContainer) {
            arContainer.style.display = 'none';
            arContainer.hidden = true;
            
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initARButton);
} else {
    setTimeout(initARButton, 500);
}
