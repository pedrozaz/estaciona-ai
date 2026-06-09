import { bus } from './bus.js';

export class WindowManager {
    constructor(workspaceId) {
        this.workspace = document.getElementById(workspaceId);
        this.activeWindows = new Map();
        bus.on('app:open', (data) => this.openWindow(data));
        bus.on('app:close', (id) => this.closeWindow(id));
    }

    openWindow({ id, title, content = '' }) {
        if (this.activeWindows.has(id)) {
            this.bringToFront(id);
            return;
        }

        const winEl = document.createElement('div');
        winEl.className = 'floating-window';
        winEl.id = `win-${id}`;

        winEl.innerHTML = `
            <div class="fw-header">
                <div class="fw-title">${title}</div>
                <div class="fw-controls">
                    <button class="fw-btn-close" data-win-id="${id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="fw-body">${content}</div>
        `;

        winEl.querySelector('.fw-btn-close').addEventListener('click', () => bus.emit('app:close', id));
        winEl.addEventListener('mousedown', () => this.bringToFront(id));

        this.workspace.appendChild(winEl);
        this.activeWindows.set(id, winEl);
        
        bus.emit('ui:app-opened');
    }

    closeWindow(id) {
        const winEl = this.activeWindows.get(id);
        if (winEl) {
            winEl.remove();
            this.activeWindows.delete(id);
        }
        if (this.activeWindows.size === 0) {
            bus.emit('ui:all-closed');
        }
    }

    bringToFront(id) {
        const winEl = this.activeWindows.get(id);
        if (winEl) {
            this.workspace.appendChild(winEl);
        }
    }
}
