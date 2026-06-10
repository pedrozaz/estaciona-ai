import { bus } from './bus.js';

export class WindowManager {
    constructor(workspaceId) {
        this.activeWindows = new Map();
        this.workspace = document.getElementById('tiling-container');
        if (!this.workspace) {
            this.workspace = document.createElement('div');
            this.workspace.id = 'tiling-container';
            const ws = document.getElementById(workspaceId);
            if (ws) ws.appendChild(this.workspace);
        }
        this.sidebar = document.getElementById('sidebar');

        bus.on('app:open', (data) => this.openWindow(data));
        bus.on('app:close', (id) => this.closeWindow(id));
    }

    openWindow({ id, title, content = '' }) {
        if (this.activeWindows.has(id)) return;

        const winEl = document.createElement('div');
        winEl.className = 'tiling-window';
        winEl.id = `win-${id}`;

        winEl.innerHTML = `
            <div class="fw-header">
                <div class="fw-title">${title}</div>
                <div class="fw-controls">
                    <button class="fw-btn fw-close" data-id="${id}" style="background: none; border: none; color: #94a3b8; cursor: pointer;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="fw-body">${content}</div>
        `;

        winEl.querySelector('.fw-close').addEventListener('click', () => bus.emit('app:close', id));
        
        this.activeWindows.set(id, winEl);
        this.workspace.appendChild(winEl);
        
        this.updateTiling();
        bus.emit('ui:app-opened', id);
    }

    closeWindow(id) {
        if (!this.activeWindows.has(id)) return;
        
        const winEl = this.activeWindows.get(id);
        winEl.style.transform = 'scale(0.95)';
        winEl.style.opacity = '0';
        
        setTimeout(() => {
            winEl.remove();
            this.activeWindows.delete(id);
            this.updateTiling();
            if (this.activeWindows.size === 0) {
                bus.emit('ui:all-closed');
            }
        }, 200);
    }

    updateTiling() {
        const count = this.activeWindows.size;
        
        this.workspace.className = count > 0 ? `tiling-active tiling-${Math.min(count, 4)}` : '';
        
        const homeWidget = document.getElementById('homeWidget');
        if (homeWidget) {
            homeWidget.style.opacity = count > 0 ? '0' : '1';
            homeWidget.style.pointerEvents = count > 0 ? 'none' : 'auto';
        }
        
        if (this.sidebar) {
            if (count > 0) {
                this.sidebar.classList.add('collapsed');
            } else {
                this.sidebar.classList.remove('collapsed');
            }
        }

        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    }
}
