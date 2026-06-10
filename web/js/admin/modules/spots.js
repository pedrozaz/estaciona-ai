import { bus } from '../bus.js';

class SpotsModule {
    constructor() {
        this.id = 'spots';
        this.spots = [];
        this.currentPolygon = [];
        this.calibrationTransform = null;
        
        this.imgScale = 1;
        this.imgOffX = 0;
        this.imgOffY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        
        bus.on(`app:launch:${this.id}`, () => this.launch());
    }

    async launch() {
        const content = `
            <style>
                #win-${this.id} .fw-body { padding: 0 !important; overflow: hidden; font-family: 'Outfit', sans-serif; }
                .sp-sidebar { width: 450px; background: rgba(15,17,23,0.9); border-left: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; }
                .sp-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .sp-title { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 6px; }
                .sp-desc { font-size: 14px; color: #94a3b8; }
                .sp-list { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
                .sp-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; transition: 0.2s; }
                .sp-item:hover { background: rgba(255,255,255,0.06); }
                .sp-id { font-size: 15px; font-weight: 600; color: #fff; }
                .sp-pts { font-size: 12px; color: #1ca745; background: rgba(28, 167, 69, 0.1); padding: 4px 8px; border-radius: 6px; font-weight: 600; display: inline-block; }
                .sp-del { background: none; border: none; color: #ef4444; cursor: pointer; padding: 6px; font-size: 18px; border-radius: 6px; transition: 0.2s; }
                .sp-del:hover { background: rgba(239, 68, 68, 0.1); }
                .sp-footer { padding: 20px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 10px; }
                .sp-btn { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #94a3b8; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; font-family: inherit; }
                .sp-btn:hover { background: rgba(255,255,255,0.05); color: #fff; }
                .sp-btn-primary { background: #10b981; border-color: #10b981; color: #fff; font-size: 15px; }
                .sp-btn-primary:hover { background: #059669; }
                .sp-tools { display: flex; gap: 6px; padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .sp-tool-btn { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #94a3b8; cursor: pointer; font-size: 14px; font-family: inherit; font-weight: 600; }
                #sp-canvas-wrapper { position: relative; overflow: hidden; background: #0a0a0a; cursor: crosshair; }
            </style>
            <div style="display: flex; height: 100%; width: 100%;">
                <div style="flex: 1; position: relative; background: #08090a; cursor: crosshair;" id="sp-canvas-wrapper">
                    <canvas id="sp-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
                </div>
                <div class="sp-sidebar">
                    <div class="sp-header">
                        <div class="sp-title">Spot Calibration (2D)</div>
                        <div class="sp-desc" id="sp-status">Carregando matriz...</div>
                    </div>
                    <div class="sp-list" id="sp-list"></div>
                    <div class="sp-footer">
                        <button class="sp-btn" id="sp-btn-undo" disabled>Desfazer</button>
                        <button class="sp-btn sp-btn-primary" id="sp-btn-export">Exportar JSON</button>
                    </div>
                </div>
            </div>
            
            <div class="sp-modal" id="sp-modal">
                <div class="sp-modal-content">
                    <h3>ID da Vaga</h3>
                    <input type="text" id="sp-modal-input" class="sp-input" placeholder="Ex: A-01" autocomplete="off">
                    <div style="display: flex; gap: 8px;">
                        <button class="sp-btn sp-btn-undo" id="sp-modal-cancel">Cancelar</button>
                        <button class="sp-btn sp-btn-export" id="sp-modal-confirm">Confirmar</button>
                    </div>
                </div>
            </div>
        `;

        bus.emit('app:open', { id: this.id, title: 'Zone Management (Spots)', content });
        
        setTimeout(() => this.initLogic(), 100);
    }

    async initLogic() {
        this.canvas = document.getElementById('sp-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.wrapper = document.getElementById('sp-canvas-wrapper');
        this.orthoImg = new Image();
        
        try {
            const res = await fetch('/data/ortho_calibration.json');
            if (res.ok) {
                const calData = await res.json();
                this.calibrationTransform = calData.transform.imageToModel;
                document.getElementById('sp-status').textContent = 'Matriz Carregada';
                document.getElementById('sp-status').style.color = '#1ca745';
                
                this.orthoImg.src = '/assets/images/' + (calData.image ? calData.image.split('/').pop() : 'uniube_ortho_projection.png');
            }
        } catch(e) {
            document.getElementById('sp-status').textContent = 'Erro ao carregar calibração';
            document.getElementById('sp-status').style.color = '#f87171';
        }

        try {
            const spotsRes = await fetch('/data/spots_3d.json');
            if (spotsRes.ok) {
                const existing = await spotsRes.json();
                this.spots = existing.map(s => ({
                    id: s.id,
                    pixels: s.polygonPixels
                }));
                this.renderSidebar();
            }
        } catch(e) {}

        this.orthoImg.onload = () => {
            this.fitImage();
            this.draw();
        };

        this.bindEvents();
    }

    fitImage() {
        const w = this.wrapper.clientWidth;
        const h = this.wrapper.clientHeight;
        this.canvas.width = w;
        this.canvas.height = h;

        if (!this.orthoImg.complete || this.orthoImg.naturalWidth === 0) return;

        const scaleX = w / this.orthoImg.width;
        const scaleY = h / this.orthoImg.height;
        this.imgScale = Math.min(scaleX, scaleY) * 0.95;
        this.imgOffX = (w - this.orthoImg.width * this.imgScale) / 2;
        this.imgOffY = (h - this.orthoImg.height * this.imgScale) / 2;
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        
        if (this.orthoImg.complete && this.orthoImg.naturalWidth > 0) {
            this.ctx.drawImage(this.orthoImg, this.imgOffX, this.imgOffY, this.orthoImg.width * this.imgScale, this.orthoImg.height * this.imgScale);
        }

        this.spots.forEach(spot => {
            if (!spot.pixels || spot.pixels.length === 0) return;
            this.ctx.beginPath();
            const first = spot.pixels[0];
            this.ctx.moveTo(this.imgOffX + first.x * this.imgScale, this.imgOffY + first.y * this.imgScale);
            for(let i=1; i<spot.pixels.length; i++) {
                const pt = spot.pixels[i];
                this.ctx.lineTo(this.imgOffX + pt.x * this.imgScale, this.imgOffY + pt.y * this.imgScale);
            }
            this.ctx.closePath();
            this.ctx.fillStyle = "rgba(28, 167, 69, 0.3)";
            this.ctx.fill();
            this.ctx.strokeStyle = "#1ca745";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            const center = this.calcCenter(spot.pixels);
            const cx = this.imgOffX + center.x * this.imgScale;
            const cy = this.imgOffY + center.y * this.imgScale;
            this.ctx.fillStyle = "#fff";
            this.ctx.font = "bold 14px var(--font-main, sans-serif)";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.strokeStyle = "#000";
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(spot.id, cx, cy);
            this.ctx.fillText(spot.id, cx, cy);
        });

        if (this.currentPolygon.length > 0) {
            this.ctx.beginPath();
            const first = this.currentPolygon[0];
            this.ctx.moveTo(this.imgOffX + first.x * this.imgScale, this.imgOffY + first.y * this.imgScale);
            for(let i=1; i<this.currentPolygon.length; i++) {
                const pt = this.currentPolygon[i];
                this.ctx.lineTo(this.imgOffX + pt.x * this.imgScale, this.imgOffY + pt.y * this.imgScale);
            }
            this.ctx.strokeStyle = "#f59e0b";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.currentPolygon.forEach(pt => {
                this.ctx.beginPath();
                this.ctx.arc(this.imgOffX + pt.x * this.imgScale, this.imgOffY + pt.y * this.imgScale, 4, 0, Math.PI*2);
                this.ctx.fillStyle = "#f59e0b";
                this.ctx.fill();
            });
        }
    }

    calcCenter(pts) {
        if(pts.length === 0) return {x:0, y:0};
        let x = 0, y = 0;
        for(let p of pts) { x += p.x; y += p.y; }
        return { x: x/pts.length, y: y/pts.length };
    }

    applyTransform(pt, t) {
        return {
            x: t.a * pt.x + t.b * pt.y + t.tx,
            z: t.c * pt.x + t.d * pt.y + t.ty
        };
    }

    bindEvents() {
        this.wrapper.addEventListener('mousedown', e => {
            if (e.button === 2 || e.button === 1) {
                this.isDragging = true;
                this.dragStartX = e.clientX - this.imgOffX;
                this.dragStartY = e.clientY - this.imgOffY;
                this.wrapper.style.cursor = 'grabbing';
            }
        });

        this.wrapper.addEventListener('mousemove', e => {
            if (this.isDragging) {
                this.imgOffX = e.clientX - this.dragStartX;
                this.imgOffY = e.clientY - this.dragStartY;
                this.draw();
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.wrapper.style.cursor = 'crosshair';
            }
        });

        this.wrapper.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const oldScale = this.imgScale;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            this.imgScale *= factor;
            this.imgScale = Math.max(0.05, Math.min(this.imgScale, 10));

            this.imgOffX = mx - (mx - this.imgOffX) * (this.imgScale / oldScale);
            this.imgOffY = my - (my - this.imgOffY) * (this.imgScale / oldScale);
            this.draw();
        });

        this.wrapper.addEventListener('contextmenu', e => e.preventDefault());

        this.wrapper.addEventListener('click', e => {
            if (this.isDragging) return;
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const px = (mx - this.imgOffX) / this.imgScale;
            const py = (my - this.imgOffY) / this.imgScale;

            this.currentPolygon.push({ x: px, y: py });
            document.getElementById('sp-btn-undo').disabled = false;
            this.draw();
        });

        window.addEventListener('keydown', e => {
            if (e.key.toLowerCase() === 'z') {
                this.undoPoint();
            }
            if (e.key.toLowerCase() === 'c' && this.currentPolygon.length >= 3) {
                this.finishPolygon();
            }
        });

        document.getElementById('sp-btn-undo').addEventListener('click', () => this.undoPoint());
        document.getElementById('sp-btn-export').addEventListener('click', () => this.exportSpots());
        document.getElementById('sp-modal-cancel').addEventListener('click', () => this.cancelSpot());
        document.getElementById('sp-modal-confirm').addEventListener('click', () => this.confirmSpot());
        
        document.getElementById('sp-modal-input').addEventListener('keyup', e => {
            if (e.key === 'Enter') this.confirmSpot();
            if (e.key === 'Escape') this.cancelSpot();
        });

        const ro = new ResizeObserver(() => {
            this.fitImage();
            this.draw();
        });
        ro.observe(this.wrapper);
    }

    undoPoint() {
        if (this.currentPolygon.length > 0) {
            this.currentPolygon.pop();
            if (this.currentPolygon.length === 0) document.getElementById('sp-btn-undo').disabled = true;
            this.draw();
        }
    }

    finishPolygon() {
        if (this.currentPolygon.length < 3) return;
        document.getElementById('sp-modal').classList.add('active');
        const input = document.getElementById('sp-modal-input');
        input.value = '';
        input.focus();
    }

    cancelSpot() {
        document.getElementById('sp-modal').classList.remove('active');
    }

    confirmSpot() {
        const id = document.getElementById('sp-modal-input').value.trim();
        if (!id) return;

        this.spots.push({
            id: id,
            pixels: [...this.currentPolygon]
        });

        this.currentPolygon = [];
        document.getElementById('sp-btn-undo').disabled = true;
        document.getElementById('sp-modal').classList.remove('active');
        this.draw();
        this.renderSidebar();
    }

    deleteSpot(idx) {
        this.spots.splice(idx, 1);
        this.renderSidebar();
        this.draw();
    }

    renderSidebar() {
        const list = document.getElementById('sp-list');
        list.innerHTML = '';
        this.spots.forEach((spot, idx) => {
            const div = document.createElement('div');
            div.className = 'sp-item';
            div.innerHTML = `
                <div class="sp-id">${spot.id}</div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="sp-pts">${spot.pixels.length} pts</div>
                    <button class="sp-del">&times;</button>
                </div>
            `;
            div.querySelector('.sp-del').addEventListener('click', () => this.deleteSpot(idx));
            list.appendChild(div);
        });
    }

    exportSpots() {
        if (!this.calibrationTransform) {
            alert("A calibração não está carregada.");
            return;
        }
        
        const exported = [];
        this.spots.forEach(spot => {
            const centerPx = this.calcCenter(spot.pixels);
            const center3D = this.applyTransform(centerPx, this.calibrationTransform);
            const polygon3D = spot.pixels.map(pt => this.applyTransform(pt, this.calibrationTransform));

            exported.push({
                id: spot.id,
                center3D: { x: parseFloat(center3D.x.toFixed(4)), y: 0, z: parseFloat(center3D.z.toFixed(4)) },
                polygon3D: polygon3D.map(p => ({ x: parseFloat(p.x.toFixed(4)), y: 0, z: parseFloat(p.z.toFixed(4)) })),
                polygonPixels: spot.pixels.map(p => ({ x: parseFloat(p.x.toFixed(2)), y: parseFloat(p.y.toFixed(2)) }))
            });
        });

        const jsonStr = JSON.stringify(exported, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'spots_3d.json';
        a.click();
        URL.revokeObjectURL(url);
    }
}

new SpotsModule();
