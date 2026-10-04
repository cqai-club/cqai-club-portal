/* Shared browser preference with the member center; no account request is needed. */
(function () {
    'use strict';

    const storageKey = 'account-center-language';
    const messages = window.CQAI_HOME_MESSAGES || {};

    function normalizeLanguage(value) {
        return /^en(?:-|$)/i.test(String(value || '')) ? 'en' : 'zh';
    }

    function readPreferredLanguage() {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) return normalizeLanguage(stored);
        } catch {
            // The language control still works when browser storage is unavailable.
        }
        return normalizeLanguage(navigator.languages?.find(Boolean) || navigator.language);
    }

    let language = readPreferredLanguage();
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';

    function t(key, params = {}) {
        const value = messages[language]?.[key] ?? messages.zh?.[key] ?? key;
        return value.replace(/\{(\w+)\}/g, (match, name) =>
            Object.hasOwn(params, name) ? String(params[name]) : match);
    }

    function apply() {
        document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
        document.title = t('meta.title');
        document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
        for (const attribute of ['text', 'alt', 'aria-label']) {
            const binding = attribute === 'text' ? 'data-i18n' : `data-i18n-${attribute}`;
            document.querySelectorAll(`[${binding}]`).forEach(element => {
                const value = t(element.getAttribute(binding));
                if (attribute === 'text') element.textContent = value;
                else element.setAttribute(attribute, value);
            });
        }
        const button = document.getElementById('languageSwitch');
        if (button) {
            button.hidden = false;
            button.textContent = language === 'en' ? '中文' : 'EN';
            const label = t(language === 'en' ? 'nav.switchToChinese' : 'nav.switchToEnglish');
            button.setAttribute('aria-label', label);
            button.title = label;
        }
    }

    function setLanguage(value, persist = false) {
        language = normalizeLanguage(value);
        if (persist) {
            try { localStorage.setItem(storageKey, language); } catch { /* In-memory choice is usable. */ }
        }
        apply();
        window.dispatchEvent(new CustomEvent('cqai-home-language-changed', { detail: language }));
        if (persist) window.dispatchEvent(new CustomEvent('account-center-language-changed', { detail: language }));
    }

    window.CQAI_HOME_I18N = { t, apply, getLanguage: () => language };
    document.addEventListener('DOMContentLoaded', () => {
        apply();
        document.getElementById('languageSwitch')?.addEventListener('click', () => {
            setLanguage(language === 'en' ? 'zh' : 'en', true);
        });
    });
    window.addEventListener('storage', event => {
        if (event.key === storageKey || event.key === null) setLanguage(readPreferredLanguage());
    });
    window.addEventListener('account-center-language-changed', event => {
        // Use the event value as well, so a blocked localStorage cannot undo a click.
        const nextLanguage = normalizeLanguage(event.detail || readPreferredLanguage());
        if (nextLanguage !== language) setLanguage(nextLanguage);
    });
})();
