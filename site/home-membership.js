/* The shared homepage stays static; membership comes from the current server session. */
(function () {
    'use strict';

    let innovationMember = false;
    let controller;
    let version = 0;

    function apply() {
        const key = innovationMember ? 'nav.benefits' : 'nav.apply';
        document.querySelectorAll('[data-home-membership-link]').forEach(link => {
            const label = link.hasAttribute('data-i18n') ? link : link.querySelector('[data-i18n]');
            if (label) {
                label.setAttribute('data-i18n', key);
                label.textContent = window.CQAI_HOME_I18N?.t(key) || (innovationMember ? '会员权益' : '申请入会');
            }
            link.setAttribute('href', innovationMember ? '/member/dashboard/plans' : '/member/dashboard/application');
        });
    }

    async function refresh() {
        const currentVersion = ++version;
        controller?.abort();
        const currentController = new AbortController();
        controller = currentController;
        const timeout = setTimeout(() => currentController.abort(), 10000);
        try {
            const response = await fetch('/member/api/membership', {
                credentials: 'same-origin', cache: 'no-store', signal: currentController.signal,
            });
            if (!response.ok) return;
            const data = await response.json();
            if (currentVersion !== version || typeof data.innovationMember !== 'boolean') return;
            innovationMember = data.innovationMember;
            apply();
        } catch {
            // A verification failure leaves the current label usable; protected pages recheck access.
        } finally {
            clearTimeout(timeout);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    else void refresh();
    window.addEventListener('cqai-home-language-changed', apply);
    window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); });
})();
