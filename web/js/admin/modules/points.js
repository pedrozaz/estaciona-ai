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
        }, 100);
    }

    cleanup() {
        this.active = false;
        document.getElementById('tiling-container').classList.remove('calibration-mode');
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
