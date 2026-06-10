import { bus } from '../bus.js';

class PointsModule {
    constructor() {
        this.id = 'points';
        this.pairs = [];
        this.currentPair = {};
        this.expectedInput = 'recon';
        this.active = false;
        
        bus.on(`app:launch:${this.id}`, (data) => this.launch(data));
        bus.on('app:close', (id) => {
            if (id === this.id) this.cleanup();
        });
        
        bus.on('calibrate:ortho-click', (pt) => this.handleOrthoClick(pt));
        bus.on('calibrate:recon-click', (pt) => this.handleReconClick(pt));
        bus.on('calibrate:undo', () => this.handleUndo());
    }

    launch(data) {
        this.isClosing = false;
        if (this.active) return;
        this.active = true;
        
        document.getElementById('tiling-container').classList.add('calibration-mode');

        bus.emit('app:launch:ortho', { title: 'Orthomosaic (Calibration)', mode: 'calibrate' });

        const content = `
            <style>
                .cal-log { font-family: monospace; font-size: 12px; color: #a1a1aa; padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); }
                .cal-log.success { color: #10b981; }
                .cal-log.warning { color: #f59e0b; }
                
                .cal-btn { 
                    font-family: 'Space Grotesk', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    padding: 12px 16px; 
                    border-radius: 10px; 
                    cursor: pointer; 
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                }
                .btn-secondary { 
                    background: rgba(255, 255, 255, 0.05); 
                    color: #e2e8f0; 
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .btn-secondary:hover { 
                    background: rgba(255, 255, 255, 0.1); 
                    transform: translateY(-1px);
                }
                .btn-primary { 
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                    color: #fff; 
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255,255,255,0.2);
                }
                .btn-primary:hover { 
                    filter: brightness(1.1); 
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
                }
            </style>
            <div style="display: flex; flex-direction: column; height: 100%;">
                <div id="points-logs" style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div class="cal-log success">> Calibration Module Initialized</div>
                    <div class="cal-log">> Tip: Alternate between clicking a point in 3D and its exact equivalent in 2D.</div>
                    <div class="cal-log warning">> Pair 1: Click on the 3D Reconstruction model...</div>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 12px;">
                    <button class="cal-btn btn-secondary" id="calUndoBtn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
                        Undo Step
                    </button>
                    <button class="cal-btn btn-primary" id="calcMatrixBtn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Compute Matrix
                    </button>
                </div>
            </div>
        `;

        bus.emit('app:open', { id: this.id, title: 'Calibration Logs', content });
        bus.emit('app:launch:recon', { title: '3D Model (Calibration)', mode: 'calibrate' });
        
        setTimeout(() => {
            const undoBtn = document.getElementById('calUndoBtn');
            if (undoBtn) undoBtn.addEventListener('click', () => bus.emit('calibrate:undo'));
            
            const calcBtn = document.getElementById('calcMatrixBtn');
            if (calcBtn) calcBtn.addEventListener('click', () => this.computeAndDownloadMatrix());
            
            this.loadExistingCalibration();
        }, 100);
    }

    async loadExistingCalibration() {
        try {
            const res = await fetch('/data/ortho_calibration.json');
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.referencePoints && data.referencePoints.length > 0) {
                this.pairs = data.referencePoints.map(p => ({
                    recon: { x: p.model.x, y: 0, z: p.model.z },
                    ortho: { x: p.image.x, y: p.image.y }
                }));
                this.expectedInput = 'recon';
                
                this.log(`> Loaded ${this.pairs.length} existing reference points.`, 'success');
                this.log(`> Pair ${this.pairs.length + 1}: Click on the 3D Reconstruction model...`, 'warning');
                
                setTimeout(() => {
                    bus.emit('calibrate:ortho-load', this.pairs.map(p => p.ortho));
                    bus.emit('calibrate:recon-load', this.pairs.map(p => p.recon));
                }, 500);
            }
        } catch(e) {
            console.warn('No existing calibration found or error loading it.', e);
        }
    }

    computeAndDownloadMatrix() {
        if (this.pairs.length < 3) {
            this.log(`> Error: At least 3 pairs are required to compute an affine transform.`, 'warning');
            return;
        }
        
        const computeAffine = (src, dst) => {
            let sumX = 0, sumY = 0, sumU = 0, sumV = 0;
            let sumXX = 0, sumYY = 0, sumXY = 0;
            let sumUX = 0, sumUY = 0, sumVX = 0, sumVY = 0;
            let n = src.length;
            
            for(let i=0; i<n; i++) {
                let x = src[i].x, y = src[i].y;
                let u = dst[i].x, v = dst[i].y;
                sumX += x; sumY += y; sumU += u; sumV += v;
                sumXX += x*x; sumYY += y*y; sumXY += x*y;
                sumUX += u*x; sumUY += u*y; sumVX += v*x; sumVY += v*y;
            }
            
            const denom = n * (sumXX * sumYY - sumXY * sumXY) - sumX * (sumX * sumYY - sumY * sumXY) + sumY * (sumX * sumXY - sumY * sumXX);
            if (Math.abs(denom) < 1e-10) return null;
            
            const a = (sumUX * (n * sumYY - sumY * sumY) - sumUY * (n * sumXY - sumX * sumY) + sumU * (sumY * sumXY - sumX * sumYY)) / denom;
            const b = (sumXX * (n * sumUY - sumU * sumY) - sumXY * (n * sumUX - sumU * sumX) + sumX * (sumUX * sumY - sumUY * sumX)) / denom;
            const tx = (sumXX * (sumYY * sumU - sumY * sumUY) - sumXY * (sumXY * sumU - sumX * sumUY) + sumX * (sumXY * sumUY - sumYY * sumUX)) / denom;

            const c = (sumVX * (n * sumYY - sumY * sumY) - sumVY * (n * sumXY - sumX * sumY) + sumV * (sumY * sumXY - sumX * sumYY)) / denom;
            const d = (sumXX * (n * sumVY - sumV * sumY) - sumXY * (n * sumVX - sumV * sumX) + sumX * (sumVX * sumY - sumVY * sumX)) / denom;
            const ty = (sumXX * (sumYY * sumV - sumY * sumVY) - sumXY * (sumXY * sumV - sumX * sumVY) + sumX * (sumXY * sumVY - sumYY * sumVX)) / denom;

            return { a, b, c, d, tx, ty };
        };
        
        const srcModel = this.pairs.map(p => ({ x: p.recon.x, y: p.recon.z }));
        const dstImage = this.pairs.map(p => ({ x: p.ortho.x, y: p.ortho.y }));
        
        const modelToImage = computeAffine(srcModel, dstImage);
        const imageToModel = computeAffine(dstImage, srcModel);
        
        if (!modelToImage || !imageToModel) {
            this.log(`> Error: Points are collinear or degenerate. Cannot compute matrix.`, 'warning');
            return;
        }

        this.log(`> Matrix computed successfully! Triggering download...`, 'success');
        
        const outJSON = {
            "image": "assets/images/uniube_ortho_projection.png",
            "imageSize": {
                "width": 1646,
                "height": 1164
            },
            "referencePoints": this.pairs.map(p => ({
                "model": { "x": parseFloat(p.recon.x.toFixed(6)), "z": parseFloat(p.recon.z.toFixed(6)) },
                "image": { "x": parseFloat(p.ortho.x.toFixed(6)), "y": parseFloat(p.ortho.y.toFixed(6)) }
            })),
            "transform": {
                "imageToModel": {
                    "a": parseFloat(imageToModel.a.toFixed(6)), "b": parseFloat(imageToModel.b.toFixed(6)), "c": parseFloat(imageToModel.c.toFixed(6)), "d": parseFloat(imageToModel.d.toFixed(6)), "tx": parseFloat(imageToModel.tx.toFixed(6)), "ty": parseFloat(imageToModel.ty.toFixed(6))
                },
                "modelToImage": {
                    "a": parseFloat(modelToImage.a.toFixed(6)), "b": parseFloat(modelToImage.b.toFixed(6)), "c": parseFloat(modelToImage.c.toFixed(6)), "d": parseFloat(modelToImage.d.toFixed(6)), "tx": parseFloat(modelToImage.tx.toFixed(6)), "ty": parseFloat(modelToImage.ty.toFixed(6))
                }
            }
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(outJSON, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "ortho_calibration.json");
        dlAnchorElem.click();
    }

    cleanup() {
        if (this.isClosing) return;
        this.isClosing = true;
        this.active = false;
        setTimeout(() => {
            const container = document.getElementById('tiling-container');
            if (container) container.classList.remove('calibration-mode');
        }, 200);
        bus.emit('app:close', 'ortho');
        bus.emit('app:close', 'recon');
    }

    log(msg, type = '') {
        const logs = document.getElementById('points-logs');
        if (logs) {
            logs.innerHTML += `<div class="cal-log ${type}">> ${msg}</div>`;
            logs.scrollTop = logs.scrollHeight;
        }
    }

    handleReconClick(pt) {
        if (!this.active) return;
        if (this.expectedInput !== 'recon') {
            this.log(`Out of order: Expected 2D Orthomosaic click.`, 'warning');
            bus.emit('calibrate:undo:recon');
            return;
        }
        this.currentPair.recon = pt;
        this.expectedInput = 'ortho';
        this.log(`[3D] Registered: X:${pt.x.toFixed(2)} Y:${pt.y.toFixed(2)} Z:${pt.z.toFixed(2)}`, 'success');
        this.log(`> Pair ${this.pairs.length + 1}: Click matching point on 2D Orthomosaic...`, 'warning');
    }

    handleOrthoClick(pt) {
        if (!this.active) return;
        if (this.expectedInput !== 'ortho') {
            this.log(`Out of order: Expected 3D Reconstruction click.`, 'warning');
            bus.emit('calibrate:undo:ortho');
            return;
        }
        this.currentPair.ortho = pt;
        this.pairs.push({...this.currentPair});
        this.currentPair = {};
        this.expectedInput = 'recon';
        this.log(`[2D] Registered: X:${pt.x.toFixed(2)} Y:${pt.y.toFixed(2)}`, 'success');
        this.log(`> Pair ${this.pairs.length + 1}: Click on the 3D Reconstruction model...`, 'warning');
    }

    handleUndo() {
        if (!this.active) return;
        if (this.expectedInput === 'ortho') {
            this.currentPair = {};
            this.expectedInput = 'recon';
            bus.emit('calibrate:undo:recon');
            this.log(`> Undid 3D point. Pair ${this.pairs.length + 1}: Click 3D model...`, 'warning');
        } else if (this.pairs.length > 0) {
            this.pairs.pop();
            this.currentPair = {};
            bus.emit('calibrate:undo:ortho');
            bus.emit('calibrate:undo:recon');
            this.log(`> Undid Pair. Pair ${this.pairs.length + 1}: Click 3D model...`, 'warning');
        }
    }
}

new PointsModule();
