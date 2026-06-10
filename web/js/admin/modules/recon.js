import { bus } from '../bus.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class ReconModule {
    constructor() {
        this.id = 'recon';
        this.activeScene = null;
        this.activeCamera = null;
        this.activeRenderer = null;
        this.animationFrameId = null;
        this.controls = null;
        
        bus.on(`app:launch:${this.id}`, (data) => this.launch(data));
    }

    launch(data) {
        const content = `
            <style> #win-${this.id} .fw-body { padding: 0 !important; } </style>
            <div id="reconContainer" style="flex: 1; width: 100%; height: 100%; overflow: hidden; background: #08090a; position: relative; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;">
                <div id="reconLoading" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f1117; z-index: 10; transition: opacity 0.5s;">
                    <div style="width: 48px; height: 48px; border: 3px solid rgba(28, 167, 69, 0.2); border-top-color: var(--primary-green); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
                    <div id="reconProgress" style="color: #1ca745; font-family: 'Space Grotesk'; font-size: 14px; font-weight: 600;">LOADING 3D DATA... 0%</div>
                </div>
            </div>
            <style> @keyframes spin { to { transform: rotate(360deg); } } </style>
        `;

        bus.emit('app:open', { id: this.id, title: data.title, content });

        setTimeout(() => this.initThree(), 100);
    }

    initThree() {
        const container = document.getElementById('reconContainer');
        if (!container) return;
        
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f1117);
        scene.fog = new THREE.FogExp2(0x0f1117, 0.002);

        const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(20, 15, 20);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);

        this.controls = new OrbitControls(camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
        keyLight.position.set(10, 20, 10);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xc4d4f7, 0.5);
        fillLight.position.set(-10, 10, -10);
        scene.add(fillLight);

        const gridGeo = new THREE.BufferGeometry();
        const boxSize = 100;
        const spacing = 2.0;
        const posList = [];
        

        for (let x = -boxSize / 2; x <= boxSize / 2; x += spacing) {
            for (let z = -boxSize / 2; z <= boxSize / 2; z += spacing) {
                posList.push(x, -boxSize / 2, z);
                posList.push(x, boxSize / 2, z);
            }
        }

        for (let z = -boxSize / 2; z <= boxSize / 2; z += spacing) {
            for (let y = -boxSize / 2; y <= boxSize / 2; y += spacing) {
                if (y !== -boxSize / 2 && y !== boxSize / 2) {
                    posList.push(-boxSize / 2, y, z);
                    posList.push(boxSize / 2, y, z);
                }
            }
        }

        for (let x = -boxSize / 2; x <= boxSize / 2; x += spacing) {
            for (let y = -boxSize / 2; y <= boxSize / 2; y += spacing) {
                if (y !== -boxSize / 2 && y !== boxSize / 2 && x !== -boxSize / 2 && x !== boxSize / 2) {
                    posList.push(x, y, -boxSize / 2);
                    posList.push(x, y, boxSize / 2);
                }
            }
        }
        
        const posArray = new Float32Array(posList);
        gridGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));

        const circleCanvas = document.createElement("canvas");
        circleCanvas.width = 32;
        circleCanvas.height = 32;
        const circleCtx = circleCanvas.getContext("2d");
        circleCtx.beginPath();
        circleCtx.arc(16, 16, 16, 0, Math.PI * 2);
        circleCtx.fillStyle = "#ffffff";
        circleCtx.fill();
        const circleTexture = new THREE.CanvasTexture(circleCanvas);

        const gridMat = new THREE.PointsMaterial({
            size: 0.18,
            color: 0x1ca745,
            transparent: true,
            opacity: 0.4,
            map: circleTexture,
            depthWrite: false,
        });
        const particlesMesh = new THREE.Points(gridGeo, gridMat);
        scene.add(particlesMesh);

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("/lib/draco/");
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        
        const modelPath = "/assets/reconstruction/melhorresultado_otimizado.glb";
        const progressEl = document.getElementById("reconProgress");
        const loadingOverlay = document.getElementById("reconLoading");

        loader.load(
            modelPath,
            (gltf) => {
                const model = gltf.scene;
                
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());

                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 15 / maxDim;
                model.scale.setScalar(scale);

                scene.add(model);
                
                const finalBox = new THREE.Box3().setFromObject(model);
                const finalCenter = finalBox.getCenter(new THREE.Vector3());
                const finalSize = finalBox.getSize(new THREE.Vector3());
                const dist = Math.max(finalSize.x, finalSize.y, finalSize.z) * 1.2;

                camera.position.set(finalCenter.x, finalCenter.y + dist * 0.5, finalCenter.z + dist);
                this.controls.target.copy(finalCenter);
                this.controls.update();
                
                if (loadingOverlay) {
                    loadingOverlay.style.opacity = '0';
                    setTimeout(() => loadingOverlay.style.display = 'none', 500);
                }
            },
            (xhr) => {
                if (xhr.lengthComputable && progressEl) {
                    const pct = Math.round((xhr.loaded / xhr.total) * 100);
                    progressEl.textContent = `LOADING 3D DATA... ${pct}%`;
                }
            },
            (error) => {
                console.error("Error loading 3D model:", error);
                if (progressEl) {
                    progressEl.textContent = "ERROR LOADING MODEL";
                    progressEl.style.color = "#dc2626";
                }
            }
        );

        this.activeScene = scene;
        this.activeCamera = camera;
        this.activeRenderer = renderer;

        const animate = () => {
            if (!document.getElementById('reconContainer')) {
                cancelAnimationFrame(this.animationFrameId);
                renderer.dispose();
                return;
            }
            this.animationFrameId = requestAnimationFrame(animate);
            this.controls.update();
            renderer.render(scene, camera);
        };
        animate();

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        });
        resizeObserver.observe(container);
    }
}

new ReconModule();
