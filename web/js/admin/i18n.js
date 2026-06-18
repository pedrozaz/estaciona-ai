export class I18nManager {
    constructor(defaultLang = 'en') {
        this.currentLang = localStorage.getItem('estaciona_lang') || defaultLang;
        this.translations = {};
    }

    async init() {
        await this.loadLanguage(this.currentLang);
        this.applyTranslations();
    }

    async loadLanguage(lang) {
        try {
            const response = await fetch(`/locales/${lang}.json`);
            if (!response.ok) throw new Error(`Could not load /locales/${lang}.json`);
            this.translations = await response.json();
            this.currentLang = lang;
            localStorage.setItem('estaciona_lang', lang);
            document.documentElement.lang = lang;
        } catch (error) {
            console.error('Failed to load language:', error);
            if (lang !== 'en') {
                await this.loadLanguage('en');
            }
        }
    }

    applyTranslations() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.getNestedTranslation(key);
            if (translation) {
                el.textContent = translation;
            }
        });
    }

    getNestedTranslation(key) {
        return key.split('.').reduce((obj, i) => (obj ? obj[i] : null), this.translations);
    }

    async changeLanguage(lang) {
        if (lang !== this.currentLang) {
            await this.loadLanguage(lang);
            this.applyTranslations();
        }
    }
}
