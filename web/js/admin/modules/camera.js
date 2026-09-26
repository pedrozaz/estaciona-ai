import { bus } from '../bus.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class CameraModule {
    constructor() {
        this.id = 'camera';
        this.pins = [];
        this.activeRouteId = null;
        
        bus.on(`app:launch:${this.id}`, (data) => this.launch(data));
    }

    async launch(data = {}) {
        const content = `
            <style>
                #win-${this.id} .fw-body { padding: 0 !important; overflow: hidden; font-family: 'Outfit', sans-serif; }
                .cam-sidebar { width: 450px; background: rgba(15,17,23,0.9); border-left: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; }
                .cam-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .cam-title { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 6px; }
                .cam-desc { font-size: 14px; color: #94a3b8; }
                .cam-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
                .cam-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 16px; cursor: pointer; transition: 0.2s; }
                .cam-item:hover { background: rgba(255,255,255,0.06); }
                .cam-item.active { border-color: #2563eb; background: rgba(37, 99, 235, 0.05); }
                .cam-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                .cam-input { flex: 1; background: transparent; border: none; color: #fff; font-size: 16px; font-weight: 600; outline: none; width: 100%; font-family: inherit; }
                .cam-del { background: none; border: none; color: #475569; cursor: pointer; font-size: 18px; font-family: inherit; padding: 4px; }
                .cam-del:hover { color: #f87171; }
                .cam-footer { padding: 20px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 10px; }
                .cam-btn { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #94a3b8; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; font-family: inherit; }
                .cam-btn:hover { background: rgba(255,255,255,0.05); color: #fff; }
                .cam-btn-primary { background: #2563eb; border-color: #2563eb; color: #fff; font-size: 15px; }
                .cam-btn-primary:hover { background: #1d4ed8; }
                .cam-loading { position: absolute; inset: 0; background: rgba(0,0,0,0.8); z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                .cam-loader { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #2563eb; border-radius: 50%; animation: cam-spin 1s linear infinite; margin-bottom: 16px; }
                @keyframes cam-spin { to { transform: rotate(360deg); } }
            </style>
            <div style="display: flex; height: 100%; width: 100%;">
                <div style="flex: 1; position: relative; background: #091831;" id="cam-canvas-wrapper">
                    <div class="cam-loading" id="cam-loading">
                        <div class="cam-loader"></div>
                        <div style="color: #fff; font-size: 14px; font-weight: 600;" id="cam-progress">0%</div>
                    </div>
                </div>
                <div class="cam-sidebar">
                    <div class="cam-header" style="border-bottom: none; padding-bottom: 8px;">
                        <div class="cam-title">Câmera e marcadores</div>
                        <div class="cam-desc">Ajuste o modelo e clique para setar a câmera inicial do aplicativo.</div>
                    </div>
                    <div style="padding: 0 20px 20px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div style="display: flex; gap: 6px;">
                            <button class="cam-btn" style="flex: 1; padding: 10px; border-color: #10b981; color: #34d399; background: rgba(16, 185, 129, 0.12);" id="cam-set-global">Definir câmera</button>
                            <button class="cam-btn" style="flex: 1; padding: 10px;" id="cam-test-global">Testar visão</button>
                        </div>
                    </div>
                    <div class="cam-header">
                        <div class="cam-title">Pinpoints (Centros)</div>
                        <div class="cam-desc">Selecione um lote e clique no 3D.</div>
                    </div>
                    <div class="cam-list" id="cam-list"></div>
                    <div class="cam-footer">
                        <button class="cam-btn" id="cam-add">Novo Estacionamento</button>
                        <button class="cam-btn cam-btn-primary" id="cam-export">Exportar JSON</button>
                    </div>
                </div>
            </div>
        `;

        bus.emit('app:open', { id: this.id, title: data.title || 'Câmera e marcadores', content });
        setTimeout(() => this.initLogic(), 100);
    }

    async initLogic() {
        this.wrapper = document.getElementById('cam-canvas-wrapper');
        
        try {
            const res = await fetch('./data/config.json');
            if (res.ok) {
                const existing = await res.json();
                this.pins = existing.map((lot, i) => ({
                    id: Date.now() + i,
                    name: lot.name,
                    blocked: lot.blocked === true,
                    path: lot.path || [],
                    position: lot.position,
                    camera: lot.camera,
                    mesh: null
                }));
                if (this.pins.length > 0) this.activeRouteId = this.pins[0].id;
            }
        } catch(e) {}

        try {
            const resGlobal = await fetch('./data/global_camera.json');
            if (resGlobal.ok) {
                this.globalCamera = await resGlobal.json();
            }
        } catch(e) {}

        this.initThree();
        this.renderSidebar();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x091831);
        this.camera = new THREE.PerspectiveCamera(45, this.wrapper.clientWidth / this.wrapper.clientHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.wrapper.clientWidth, this.wrapper.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.wrapper.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.07;

        const amLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(amLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./lib/draco/');
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        loader.load(
            './assets/reconstruction/melhorresultado_otimizado.glb',
            (gltf) => {
                this.loadedModel = gltf.scene;
                const maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
                this.loadedModel.traverse((child) => {
                    if (!child.isMesh) return;
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach((material) => {
                        if (material?.map) {
                            material.map.anisotropy = maxAnisotropy;
                            material.map.needsUpdate = true;
                        }
                    });
                });
                const box = new THREE.Box3().setFromObject(this.loadedModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                this.loadedModel.position.sub(center);
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 15 / maxDim;
                this.loadedModel.scale.setScalar(scale);
                this.scene.add(this.loadedModel);

                const finalBox = new THREE.Box3().setFromObject(this.loadedModel);
                const finalCenter = finalBox.getCenter(new THREE.Vector3());
                const finalSize = finalBox.getSize(new THREE.Vector3());
                const dist = finalSize.length() * 0.7;

                this.camera.position.set(finalCenter.x - dist * 0.7, finalCenter.y + dist * 0.5, finalCenter.z - dist * 0.7);
                this.controls.target.copy(finalCenter);
                this.controls.update();

                document.getElementById('cam-loading').style.display = 'none';
                this.updateAllMeshes();
            },
            (xhr) => {
                if (xhr.lengthComputable) {
                    document.getElementById('cam-progress').textContent = Math.round((xhr.loaded / xhr.total) * 100) + '%';
                }
            }
        );

        const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
        let lastFrame = performance.now();
        const animate = () => {
            if (!document.getElementById('cam-canvas-wrapper')) return;
            requestAnimationFrame(animate);
            const now = performance.now();
            const delta = Math.min((now - lastFrame) / 1000, .05);
            lastFrame = now;
            if (document.hidden) return;
            this.controls.enableDamping = !motionPreference.matches;
            this.controls.dampingFactor = 1 - Math.exp(-6.5 * delta);
            this.controls.update(delta);
            this.renderer.render(this.scene, this.camera);
        };
        animate();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        let startX = 0;
        let startY = 0;
        this.renderer.domElement.addEventListener('mousedown', e => { startX = e.clientX; startY = e.clientY; });
        this.renderer.domElement.addEventListener('click', e => {
            if (!this.loadedModel || !this.activeRouteId) return;
            const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
            if (dist > 5) return;

            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.loadedModel, true);

            if (intersects.length > 0) {
                const point = intersects[0].point;
                const pin = this.pins.find(p => p.id === this.activeRouteId);
                if (pin) {
                    pin.position = { x: parseFloat(point.x.toFixed(4)), y: parseFloat(point.y.toFixed(4)), z: parseFloat(point.z.toFixed(4)) };
                    this.updateMeshes(pin);
                    this.renderSidebar();
                }
            }
        });

        const ro = new ResizeObserver(() => {
            this.camera.aspect = this.wrapper.clientWidth / this.wrapper.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.wrapper.clientWidth, this.wrapper.clientHeight);
        });
        ro.observe(this.wrapper);
        
        document.getElementById('cam-add').addEventListener('click', () => {
            const pin = { id: Date.now(), name: `Estacionamento ${this.pins.length + 1}`, path: [], position: null, mesh: null };
            this.pins.push(pin);
            this.activeRouteId = pin.id;
            this.renderSidebar();
        });
        document.getElementById('cam-export').addEventListener('click', () => this.exportJson());

        document.getElementById('cam-set-global').addEventListener('click', () => {
            if (!confirm(`Deseja salvar a visão atual como Câmera Inicial do App?`)) return;
            this.globalCamera = {
                position: { x: parseFloat(this.camera.position.x.toFixed(4)), y: parseFloat(this.camera.position.y.toFixed(4)), z: parseFloat(this.camera.position.z.toFixed(4)) },
                target: { x: parseFloat(this.controls.target.x.toFixed(4)), y: parseFloat(this.controls.target.y.toFixed(4)), z: parseFloat(this.controls.target.z.toFixed(4)) }
            };
            this.renderSidebar();
        });

        document.getElementById('cam-test-global').addEventListener('click', () => {
            if (!this.globalCamera) {
                alert("Câmera Inicial não configurada ainda.");
                return;
            }
            this.camera.position.set(this.globalCamera.position.x, this.globalCamera.position.y, this.globalCamera.position.z);
            this.controls.target.set(this.globalCamera.target.x, this.globalCamera.target.y, this.globalCamera.target.z);
            this.controls.update();
        });
    }

    updateMeshes(pin) {
        if (pin.mesh) {
            this.scene.remove(pin.mesh);
            pin.mesh = null;
        }

        if (pin.position) {
            const geo = new THREE.SphereGeometry(0.5, 16, 16);
            const mat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.5 });
            pin.mesh = new THREE.Mesh(geo, mat);
            pin.mesh.position.copy(pin.position);
            this.scene.add(pin.mesh);
        }
    }

    updateAllMeshes() {
        this.pins.forEach(pin => {
            if (pin.mesh) this.scene.remove(pin.mesh);
            if (pin.id === this.activeRouteId) {
                this.updateMeshes(pin);
            }
        });
    }

    renderSidebar() {
        const list = document.getElementById('cam-list');
        list.innerHTML = '';
        
        const btnSet = document.getElementById('cam-set-global');
        if (this.globalCamera) {
            btnSet.textContent = 'Câmera definida';
        } else {
            btnSet.textContent = 'Definir câmera inicial';
        }

        this.pins.forEach((pin, i) => {
            const div = document.createElement('div');
            const isActive = this.activeRouteId === pin.id;
            div.className = 'cam-item' + (isActive ? ' active' : '');
            
            let posHtml = pin.position 
                ? `<div style="font-size: 13px; color: #94a3b8; font-family: monospace;">[x: ${pin.position.x.toFixed(2)}, y: ${pin.position.y.toFixed(2)}]</div>`
                : `<div style="font-size: 13px; color: #ef4444;">Sem pinpoint definido</div>`;

            div.innerHTML = `
                <div class="cam-row">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background: ${isActive ? '#2563eb' : '#475569'}; flex-shrink: 0;"></div>
                    <input type="text" class="cam-input" value="${pin.name}">
                    <button class="cam-del">&times;</button>
                </div>
                ${posHtml}
                <div style="font-size: 12px; color: #94a3b8; margin: 12px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">Câmera do Carrinho</div>
                <div style="display: flex; gap: 6px;">
                    <button class="cam-btn" style="flex: 1; padding: 8px; ${pin.camera ? 'background: rgba(16, 185, 129, 0.12); color: #34d399; border-color: #10b981;' : ''}" data-action="cam">
                        ${pin.camera ? 'Câmera definida' : 'Definir câmera'}
                    </button>
                    <button class="cam-btn" style="flex: 1; padding: 8px;" data-action="test">Ver câmera</button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                    this.activeRouteId = pin.id;
                    this.updateAllMeshes();
                    this.renderSidebar();
                }
            });

            div.querySelector('.cam-input').addEventListener('input', e => pin.name = e.target.value);
            div.querySelector('.cam-del').addEventListener('click', () => {
                if (pin.mesh) this.scene.remove(pin.mesh);
                this.pins = this.pins.filter(p => p.id !== pin.id);
                if (this.activeRouteId === pin.id) this.activeRouteId = this.pins[0]?.id || null;
                this.updateAllMeshes();
                this.renderSidebar();
            });

            div.querySelector('[data-action="cam"]').addEventListener('click', () => {
                if (!confirm(`Deseja salvar a visão atual para seguir o carrinho do ${pin.name}?`)) return;
                pin.camera = {
                    position: { x: parseFloat(this.camera.position.x.toFixed(4)), y: parseFloat(this.camera.position.y.toFixed(4)), z: parseFloat(this.camera.position.z.toFixed(4)) },
                    target: { x: parseFloat(this.controls.target.x.toFixed(4)), y: parseFloat(this.controls.target.y.toFixed(4)), z: parseFloat(this.controls.target.z.toFixed(4)) }
                };
                this.renderSidebar();
            });

            div.querySelector('[data-action="test"]').addEventListener('click', () => {
                if (!pin.camera) {
                    alert("Câmera do carrinho não configurada.");
                    return;
                }
                this.camera.position.set(pin.camera.position.x, pin.camera.position.y, pin.camera.position.z);
                this.controls.target.set(pin.camera.target.x, pin.camera.target.y, pin.camera.target.z);
                this.controls.update();
            });

            list.appendChild(div);
        });
    }

    exportJson() {
        const exported = this.pins.map((p, i) => ({
            name: p.name,
            blocked: p.blocked === true,
            path: p.path || [],
            position: p.position || null,
            camera: p.camera || null
        }));
        const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'config.json';
        // a.click();
        alert('Modo demonstração: as alterações são apenas visuais e não serão salvas.');

        if (this.globalCamera) {
            const blobGlobal = new Blob([JSON.stringify(this.globalCamera, null, 2)], { type: 'application/json' });
            const aGlobal = document.createElement('a');
            aGlobal.href = URL.createObjectURL(blobGlobal);
            aGlobal.download = 'global_camera.json';
            // aGlobal.click();
        }
    }
}

new CameraModule();
