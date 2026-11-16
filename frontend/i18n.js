/**
 * MENTORAE SIS - Universal Internationalization (i18n) Engine
 * Deprecated: The system standardizes on English as per academic project scope.
 * Safe backward-compatibility stub provided to prevent runtime errors on any cached assets.
 */

(function (window) {
    'use strict';

    try {
        localStorage.removeItem('mentorae_language');
    } catch (e) {}

    window.i18n = {
        getLanguage: () => 'en',
        setLanguage: async () => {},
        t: (key, fallback) => fallback || key || '',
        applyTranslations: () => {},
        syncFromProfile: async () => {},
        supportedLanguages: [
            { code: 'en', label: 'English (US)' }
        ]
    };
})(window);
