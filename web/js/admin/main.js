import { I18nManager } from './i18n.js?v=3';
import { bus } from './bus.js';
import { WindowManager } from './window-manager.js?v=2';
import './modules/ortho.js?v=3';
import './modules/recon.js?v=6';
import './modules/points.js?v=3';
import './modules/camera.js?v=6';
import './modules/spots.js?v=3';
import './modules/path.js?v=3';
import './modules/analytics.js?v=10';

document.addEventListener('DOMContentLoaded', async () => {
    window.i18n = new I18nManager('pt');
    await window.i18n.init();
    
    window.wm = new WindowManager('workspace');

    const homeWidget = document.getElementById('homeWidget');
    
    bus.on('ui:app-opened', () => {
        if (homeWidget) homeWidget.style.display = 'none';
    });

    bus.on('ui:all-closed', () => {
        if (homeWidget) homeWidget.style.display = 'flex';
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.querySelector('.nav-item[data-app="home"]').classList.add('active');
    });

    function openApp(appId) {
        const navItem = document.querySelector(`.nav-item[data-app="${appId}"]`);
        if (!navItem) return;
        const title = navItem.querySelector('[data-i18n]')?.textContent?.trim() || navItem.textContent.trim();

        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        navItem.classList.add('active');

        if (appId === 'home') {
            const windows = Array.from(window.wm.activeWindows.keys());
            windows.forEach(id => bus.emit('app:close', id));
        } else {
            bus.emit(`app:launch:${appId}`, { id: appId, title });
        }
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => openApp(item.dataset.app));
    });
    document.querySelectorAll('[data-launch-app]').forEach(item => {
        item.addEventListener('click', () => openApp(item.dataset.launchApp));
    });
});
