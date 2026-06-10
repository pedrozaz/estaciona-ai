import { I18nManager } from './i18n.js';
import { bus } from './bus.js';
import { WindowManager } from './window-manager.js';
import './modules/ortho.js';
import './modules/recon.js';

document.addEventListener('DOMContentLoaded', async () => {
    window.i18n = new I18nManager('en');
    await window.i18n.init();
    
    window.wm = new WindowManager('workspace');

    const homeWidget = document.getElementById('homeWidget');
    
    bus.on('ui:app-opened', () => {
        if (homeWidget) homeWidget.style.display = 'none';
    });

    bus.on('ui:all-closed', () => {
        if (homeWidget) homeWidget.style.display = 'flex';
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.querySelector('.nav-item[data-app="dashboard"]').classList.add('active');
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const appId = e.currentTarget.getAttribute('data-app');
            const title = e.currentTarget.textContent;
            
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            e.currentTarget.classList.add('active');

            if (appId === 'dashboard') {
                const windows = Array.from(window.wm.activeWindows.keys());
                windows.forEach(id => bus.emit('app:close', id));
            } else {
                bus.emit(`app:launch:${appId}`, { id: appId, title: title });
            }
        });
    });
});
