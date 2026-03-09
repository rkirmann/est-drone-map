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
    btnARView.innerText = 'AR View';
    btnARView.title = 'View Flight Path in Augmented Reality';
    btnARView.disabled = true;

    btnARView.onclick = toggleARView;

    // Insert after Export KMZ
    btnExportKMZ.parentNode.insertBefore(btnARView, btnExportKMZ.nextSibling);

    // Intercept path generation to enable the AR button
    if (typeof generateLawnmowerPath === 'function') {
        const originalGenerateLawnmowerPath = generateLawnmowerPath;
        generateLawnmowerPath = async function () {
            await originalGenerateLawnmowerPath.apply(this, arguments);
            const hasPath = typeof currentLawnmowerPath !== 'undefined' && currentLawnmowerPath && currentLawnmowerPath.length > 0;
            document.getElementById('btnARView').disabled = !hasPath;
        };
    }

    // Intercept clear mapping to disable it
    if (typeof clearMapping === 'function') {
        const originalClearMapping = clearMapping;
        clearMapping = function () {
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

    // Explicit modern getUserMedia request (fixes Android PWA standalone mode bugs)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        })
            .then(stream => {
                stream.getTracks().forEach(track => track.stop()); // AR.js manages its own stream
                proceedWithARLoad();
            })
            .catch(err => {
                console.error(err);
                // Fallback: Proceed anyway as AR.js has legacy adapters
                proceedWithARLoad();
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
        <h2 class="text-xl font-bold">Connecting Sensors...</h2>
        <p class="text-slate-400 mt-2 max-w-sm text-center">Please allow camera and GPS permissions. If on a phone, pan around to calibrate compass.</p>
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

        arjsScript.onload = setupGpsLineComponentAndScene;
    };
}

function setupGpsLineComponentAndScene() {
    if (typeof AFRAME === 'undefined') return;

    // Custom component to draw physical lines using standard A-Frame line component
    // connected across all GPS points in sequence
    AFRAME.registerComponent('gps-poly-line', {
        schema: {
            pathJSON: { type: 'string', default: '[]' },
        },
        init: function () {
            this.pathData = JSON.parse(this.data.pathJSON);
            this.drawn = false;

            this.el.sceneEl.addEventListener('gps-camera-update-position', () => {
                if (!this.drawn) this.drawLines();
            });
            // Try drawing immediately just in case GPS lock is fast
            this.drawLines();
        },
        drawLines: function () {
            if (this.drawn || this.pathData.length < 2) return;

            // We anchor a parent container at Point 0
            const anchorLat = this.pathData[0].lat;
            const anchorLng = this.pathData[0].lng;
            const R = 6378137; // Earth radius

            this.el.setAttribute('gps-entity-place', `latitude: ${anchorLat}; longitude: ${anchorLng}`);
            this.el.setAttribute('position', '0 0 0'); // Origin

            // Keep track of previous coordinate to draw lines between them
            let prevCoords = { x: 0, y: parseFloat(this.pathData[0].alt) || 0, z: 0 };

            for (let i = 1; i < this.pathData.length; i++) {
                const pt = this.pathData[i];

                // Calculate offset from anchor
                const dLat = (pt.lat - anchorLat) * (Math.PI / 180);
                const dLng = (pt.lng - anchorLng) * (Math.PI / 180);
                const x = R * dLng * Math.cos(anchorLat * Math.PI / 180);
                const y = parseFloat(pt.alt) || 0;
                const z = - (R * dLat);

                const currentCoords = { x, y, z };

                // Create a line segment entity
                const lineSegment = document.createElement('a-entity');

                let color = '#f59e0b'; // solid amber
                let width = 15; // px width

                // If it's the lead-in staging leg
                if (i === 1) {
                    color = '#22c55e'; // green
                    width = 10;
                }

                // Draw standard A-Frame native line
                // The syntax is line="start: x y z; end: x y z; color: color"
                lineSegment.setAttribute('line', {
                    start: `${prevCoords.x} ${prevCoords.y} ${prevCoords.z}`,
                    end: `${currentCoords.x} ${currentCoords.y} ${currentCoords.z}`,
                    color: color
                });

                // Add a tiny connecting joint to hide gaps between sharp turns
                if (i > 1) {
                    const joint = document.createElement('a-sphere');
                    joint.setAttribute('position', `${prevCoords.x} ${prevCoords.y} ${prevCoords.z}`);
                    joint.setAttribute('radius', '0.2');
                    joint.setAttribute('color', '#f59e0b');
                    joint.setAttribute('shader', 'flat');
                    this.el.appendChild(joint);
                }

                this.el.appendChild(lineSegment);

                prevCoords = currentCoords;
            }

            // Draw a red END marker sphere
            const endMarker = document.createElement('a-sphere');
            endMarker.setAttribute('position', `${prevCoords.x} ${prevCoords.y} ${prevCoords.z}`);
            endMarker.setAttribute('radius', '1.5');
            endMarker.setAttribute('color', '#ef4444');
            endMarker.setAttribute('shader', 'flat');
            this.el.appendChild(endMarker);

            this.drawn = true;
        }
    });
}

function setupARContainer() {
    if (!document.getElementById('arLoadingUI')) return;

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

    // AR.js scene. Crucial that 'sourceType: webcam' is explicit
    const sceneStr = `
        <a-scene 
            vr-mode-ui="enabled: false"
            embedded
            renderer="antialias: true; alpha: true"
            arjs="sourceType: webcam; debugUIEnabled: false; videoTexture: true;">
            
            <a-camera gps-camera="minDistance: 1; positionMinAccuracy: 100; maxDistance: 3000" rotation-reader></a-camera>
            
            <!-- Where we attach the custom line generator -->
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
    // Send stringified JSON to the custom component to draw the solid lines
    pathEntity.setAttribute('gps-poly-line', `pathJSON: ${JSON.stringify(currentLawnmowerPath)}`);
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

            // Brute force stop all cameras (fixes lingering green dot on Android)
            navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()));

            const videos = document.querySelectorAll('video');
            videos.forEach(v => {
                if (v.srcObject) {
                    v.srcObject.getTracks().forEach(track => track.stop());
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
