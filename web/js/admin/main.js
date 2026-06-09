import { I18nManager } from './i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializa motor de tradução globalmente
    window.i18n = new I18nManager('en');
    await window.i18n.init();
    
    // Teste de debug (você pode apagar depois)
    console.log('[App] I18n Manager loaded. Language:', window.i18n.currentLang);
});
