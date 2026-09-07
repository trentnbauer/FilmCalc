// Google Analytics (GA4) — opt-in only. Pulled out of index.html (same
// reasoning as js/adsense-loader.js) so the page's CSP can use a plain
// script-src allowlist instead of an inline-script hash that would differ
// before/after the build workflow's substitution.
//
// The build-github-page.yml workflow sed-replaces %%GA_MEASUREMENT_ID%%
// from a repo secret; a build that never runs that step (e.g. a local
// checkout) leaves the token literal, and the guard below bails out before
// requesting anything from Google — no analytics script for local/dev use.
//
// Consent gate: GA4 never loads until the visitor has explicitly accepted
// the cookie-consent banner (App.acceptAnalytics() in js/app.js, which
// sets localStorage.analyticsConsent = 'granted' and then calls
// window.__loadGAIfConsented() directly so acceptance takes effect
// immediately, not just on next page load). Declining, or never answering,
// means this script never injects anything — no request to Google, no
// cookie, ever. See privacy.html for what GA collects once consented.
(function () {
    var id = "%%GA_MEASUREMENT_ID%%";
    if (!id || id.indexOf('%%') === 0) return;

    function loadGA() {
        if (window.__gaLoaded) return;
        window.__gaLoaded = true;
        window.dataLayer = window.dataLayer || [];
        function gtag() { window.dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        // anonymize_ip: true truncates the visitor's IP before Google
        // stores it — reduces what's collected even for a consenting
        // visitor, per privacy.html's "what GA collects" section.
        gtag('config', id, { anonymize_ip: true });
        var loader = document.createElement('script');
        loader.async = true;
        loader.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
        document.head.appendChild(loader);
    }

    window.__loadGAIfConsented = function () {
        try {
            if (localStorage.getItem('analyticsConsent') === 'granted') loadGA();
        } catch (e) { /* localStorage blocked (private mode, etc.) — no analytics, fail closed */ }
    };
    window.__loadGAIfConsented();
})();
