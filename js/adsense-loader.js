// AdSense site verification — Google requires this exact snippet to run on
// every page. Pulled out of index.html (rather than left inline) so the
// page's CSP can use a plain script-src allowlist instead of 'unsafe-inline'
// or a build-specific hash (this file's content changes per deploy once the
// build workflow substitutes the client id below).
//
// The build-github-page.yml workflow sed-replaces %%ADSENSE_CLIENT_ID%%
// from a repo secret; a self-hosted build never runs that step, so the
// token stays literal here and this bails out before requesting anything
// from Google — no ad script for self-hosted users.
(function () {
    var client = "%%ADSENSE_CLIENT_ID%%";
    if (!client || client.indexOf('%%') === 0) return;
    var loader = document.createElement('script');
    loader.async = true;
    loader.crossOrigin = 'anonymous';
    loader.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    document.head.appendChild(loader);
})();
