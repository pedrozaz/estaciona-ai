import { bus } from '../bus.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class PathModule {
    constructor() {
        this.id = 'path';
        this.pins = [];
        this.activeRouteId = null;
        
        bus.on(`app:launch:${this.id}`, () => this.launch());
    }

    async launch() {
        const content = `
            <style>
                #win-${this.id} .fw-body { padding: 0 !important; overflow: hidden; font-family: 'Outfit', sans-serif; }
                .pt-sidebar { width: 450px; background: rgba(15,17,23,0.9); border-left: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; }
                .pt-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .pt-title { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 6px; }
                .pt-desc { font-size: 14px; color: #94a3b8; }
                .pt-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
                .pt-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 16px; cursor: pointer; transition: 0.2s; }
                .pt-item:hover { background: rgba(255,255,255,0.06); }
                .pt-item.active { border-color: #f59e0b; background: rgba(245, 158, 11, 0.05); }
                .pt-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                .pt-input { flex: 1; background: transparent; border: none; color: #fff; font-size: 16px; font-weight: 600; outline: none; width: 100%; font-family: inherit; }
                .pt-del { background: none; border: none; color: #475569; cursor: pointer; font-size: 18px; font-family: inherit; padding: 4px; }
                .pt-del:hover { color: #f87171; }
                .pt-footer { padding: 20px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 10px; }
                .pt-btn { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #94a3b8; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; font-family: inherit; }
                .pt-btn:hover { background: rgba(255,255,255,0.05); color: #fff; }
                .pt-btn-primary { background: #f59e0b; border-color: #f59e0b; color: #fff; font-size: 15px; }
                .pt-btn-primary:hover { background: #d97706; }
                .pt-loading { position: absolute; inset: 0; background: rgba(0,0,0,0.8); z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                .pt-loader { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #f59e0b; border-radius: 50%; animation: pt-spin 1s linear infinite; margin-bottom: 16px; }
                @keyframes pt-spin { to { transform: rotate(360deg); } }
            </style>
            <div style="display: flex; height: 100%; width: 100%;">
                <div style="flex: 1; position: relative; background: #08090a;" id="pt-canvas-wrapper">
                    <div class="pt-loading" id="pt-loading">
                        <div class="pt-loader"></div>
                        <div style="color: #fff; font-size: 14px; font-weight: 600;" id="pt-progress">0%</div>
                    </div>
                </div>
                <div class="pt-sidebar">
                    <div class="pt-header">
                        <div class="pt-title">Path Configurator</div>
                        <div class="pt-desc">Desenhe trajetos em 3D</div>
                    </div>
                    <div class="pt-list" id="pt-list"></div>
                    <div class="pt-footer">
                        <button class="pt-btn pt-btn-primary" id="pt-export">Exportar JSON</button>
                    </div>
                </div>
            </div>
        `;

        bus.emit('app:open', { id: this.id, title: 'Path Configurator', content });
        setTimeout(() => this.initLogic(), 100);
    }

    async initLogic() {
        this.wrapper = document.getElementById('pt-canvas-wrapper');
        
        try {
            const res = await fetch('/data/config.json');
            if (res.ok) {
                const existing = await res.json();
                this.pins = existing.map((lot, i) => ({
                    id: Date.now() + i,
                    name: lot.name,
                    path: lot.path || [],
                    position: lot.position,
                    camera: lot.camera,
                    markerMeshes: [],
                    lineMesh: null
                }));
                if (this.pins.length > 0) this.activeRouteId = this.pins[0].id;
            }
        } catch(e) {}

        this.initThree();
        this.renderSidebar();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0b0e);
        this.camera = new THREE.PerspectiveCamera(45, this.wrapper.clientWidth / this.wrapper.clientHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.wrapper.clientWidth, this.wrapper.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.wrapper.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        const amLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(amLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/lib/draco/');
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        loader.load(
            '/assets/reconstruction/melhorresultado_otimizado.glb',
            (gltf) => {
                this.loadedModel = gltf.scene;
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

                document.getElementById('pt-loading').style.display = 'none';
                this.updateAllMeshes();
            },
            (xhr) => {
                if (xhr.lengthComputable) {
                    document.getElementById('pt-progress').textContent = Math.round((xhr.loaded / xhr.total) * 100) + '%';
                }
            }
        );

        const animate = () => {
            if (!document.getElementById('pt-canvas-wrapper')) return;
            requestAnimationFrame(animate);
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.draggingIdx = -1;

        let startX = 0;
        let startY = 0;
        this.renderer.domElement.addEventListener('mousedown', e => { 
            startX = e.clientX; 
            startY = e.clientY; 
            
            if (!this.activeRouteId) return;
            const pin = this.pins.find(p => p.id === this.activeRouteId);
            if (!pin || pin.markerMeshes.length === 0) return;

            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            const intersects = this.raycaster.intersectObjects(pin.markerMeshes);
            if (intersects.length > 0) {
                this.draggingIdx = pin.markerMeshes.indexOf(intersects[0].object);
                this.controls.enabled = false;
            }
        });

        this.renderer.domElement.addEventListener('mousemove', e => {
            if (this.draggingIdx === -1 || !this.loadedModel) return;
            const pin = this.pins.find(p => p.id === this.activeRouteId);
            if (!pin) return;

            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            const intersects = this.raycaster.intersectObject(this.loadedModel, true);
            if (intersects.length > 0) {
                const pt = intersects[0].point;
                pin.path[this.draggingIdx].x = parseFloat(pt.x.toFixed(4));
                pin.path[this.draggingIdx].y = parseFloat(pt.y.toFixed(4));
                pin.path[this.draggingIdx].z = parseFloat(pt.z.toFixed(4));

                pin.markerMeshes[this.draggingIdx].position.set(pt.x, pt.y, pt.z);
                
                if (pin.lineMesh) {
                    const points = pin.path.map(p => new THREE.Vector3(p.x, p.y + 0.02, p.z));
                    pin.lineMesh.geometry.setFromPoints(points);
                }

                const coordSpan = document.getElementById(`coord-${pin.id}-${this.draggingIdx}`);
                if (coordSpan) coordSpan.textContent = `[${this.draggingIdx}] ${pt.x.toFixed(2)}, ${pt.z.toFixed(2)}`;
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.draggingIdx !== -1) {
                this.draggingIdx = -1;
                this.controls.enabled = true;
            }
        });

        this.renderer.domElement.addEventListener('click', e => {
            if (!this.loadedModel || !this.activeRouteId) return;
            const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
            if (dist > 5) return;

            const pin = this.pins.find(p => p.id === this.activeRouteId);
            if (!pin) return;

            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            if (pin.markerMeshes.length > 0) {
                const markerIntersects = this.raycaster.intersectObjects(pin.markerMeshes);
                if (markerIntersects.length > 0) return;
            }

            const intersects = this.raycaster.intersectObject(this.loadedModel, true);

            if (intersects.length > 0) {
                const point = intersects[0].point;
                pin.path.push({ x: parseFloat(point.x.toFixed(4)), y: parseFloat(point.y.toFixed(4)), z: parseFloat(point.z.toFixed(4)) });
                if (!pin.position && pin.path.length === 1) pin.position = { ...pin.path[0] };
                this.updateAllMeshes();
                this.renderSidebar();
            }
        });

        const ro = new ResizeObserver(() => {
            this.camera.aspect = this.wrapper.clientWidth / this.wrapper.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.wrapper.clientWidth, this.wrapper.clientHeight);
        });
        ro.observe(this.wrapper);
        
        document.getElementById('pt-export').addEventListener('click', () => this.exportJson());
    }

    createMarker(pos, isStart) {
        const geo = new THREE.SphereGeometry(isStart ? 0.2 : 0.1, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: isStart ? 0xef4444 : 0xf59e0b, emissive: isStart ? 0xef4444 : 0xf59e0b, emissiveIntensity: 0.5 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        return mesh;
    }

    updateMeshes(pin) {
        if (pin.lineMesh) this.scene.remove(pin.lineMesh);
        pin.markerMeshes.forEach(m => this.scene.remove(m));
        pin.markerMeshes = [];

        if (pin.path.length === 0) return;

        const points = pin.path.map(p => new THREE.Vector3(p.x, p.y + 0.02, p.z));
        if (points.length > 1) {
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
            pin.lineMesh = new THREE.Line(geo, mat);
            this.scene.add(pin.lineMesh);
        }

        pin.path.forEach((p, i) => {
            const marker = this.createMarker(new THREE.Vector3(p.x, p.y, p.z), i === 0);
            pin.markerMeshes.push(marker);
            this.scene.add(marker);
        });
    }

    updateAllMeshes() {
        this.pins.forEach(pin => {
            if (pin.lineMesh) this.scene.remove(pin.lineMesh);
            pin.markerMeshes.forEach(m => this.scene.remove(m));
            
            if (pin.id === this.activeRouteId) {
                this.updateMeshes(pin);
            }
        });
    }

    renderSidebar() {
        const list = document.getElementById('pt-list');
        list.innerHTML = '';
        this.pins.forEach((pin, i) => {
            const div = document.createElement('div');
            const isActive = this.activeRouteId === pin.id;
            div.className = 'pt-item' + (isActive ? ' active' : '');
            
            let pointsListHtml = '';
            if (isActive && pin.path.length > 0) {
                pointsListHtml = '<div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">';
                pointsListHtml += '<div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Coordenadas do Trajeto</div>';
                pointsListHtml += '<div style="display: flex; flex-direction: column; gap: 6px;">';
                pin.path.forEach((pt, ptIdx) => {
                    pointsListHtml += `
                        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px;">
                            <span id="coord-${pin.id}-${ptIdx}" style="font-size: 14px; color: #cbd5e1; font-family: monospace;">[${ptIdx}] ${pt.x.toFixed(2)}, ${pt.z.toFixed(2)}</span>
                            <button class="pt-del-pt" data-pt-idx="${ptIdx}" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 16px; padding: 2px;">&times;</button>
                        </div>
                    `;
                });
                pointsListHtml += '</div></div>';
                pointsListHtml += `
                    <div style="display: flex; gap: 6px; margin-top: 12px;">
                        <button class="pt-btn" style="flex: 1; padding: 10px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2);" data-action="undo">⮌ Desfazer Último Ponto</button>
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="pt-row">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background: ${isActive ? '#f59e0b' : '#475569'}; flex-shrink: 0;"></div>
                    <input type="text" class="pt-input" value="${pin.name}">
                    <button class="pt-del">&times;</button>
                </div>
                <div style="font-size: 13px; color: #94a3b8;">${pin.path.length} pontos desenhados</div>
                ${pointsListHtml}
            `;

            div.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && !e.target.closest('.pt-del-pt')) {
                    this.activeRouteId = pin.id;
                    this.updateAllMeshes();
                    this.renderSidebar();
                }
            });

            div.querySelector('.pt-input').addEventListener('input', e => pin.name = e.target.value);
            div.querySelector('.pt-del').addEventListener('click', () => {
                if (pin.lineMesh) this.scene.remove(pin.lineMesh);
                pin.markerMeshes.forEach(m => this.scene.remove(m));
                this.pins = this.pins.filter(p => p.id !== pin.id);
                if (this.activeRouteId === pin.id) this.activeRouteId = this.pins[0]?.id || null;
                this.renderSidebar();
            });

            const undoBtn = div.querySelector('[data-action="undo"]');
            if (undoBtn) {
                undoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (pin.path.length > 0) {
                        pin.path.pop();
                        if (pin.path.length === 0) pin.position = null;
                        this.updateAllMeshes();
                        this.renderSidebar();
                    }
                });
            }

            div.querySelectorAll('.pt-del-pt').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.getAttribute('data-pt-idx'));
                    pin.path.splice(idx, 1);
                    if (pin.path.length === 0) pin.position = null;
                    this.updateAllMeshes();
                    this.renderSidebar();
                });
            });

            list.appendChild(div);
        });
    }

    exportJson() {
        const exported = this.pins.map(p => ({
            name: p.name,
            blocked: false,
            path: p.path,
            position: p.position || { x:0, y:0, z:0 },
            camera: p.camera || null
        }));
        const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'config.json';
        a.click();
    }
}

new PathModule();
