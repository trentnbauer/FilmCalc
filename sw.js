// Service worker — exists to satisfy the PWA baseline "offline page"
// requirement (see web.dev's PWA checklist) and Chrome's installability
// check (which still looks for a registered service worker with a fetch
// handler, even though the fetch handler itself no longer has to do
// anything for the install prompt to appear).
//
// The app shell (files needed to boot the calculator UI) is precached —
// the core loop (open the app, pick an already-saved film/lab, calculate
// cost) only ever reads from localStorage, so that alone is enough to
// keep it working offline.
//
// films/index.json, labs/index.json, and the preset YAML files under
// films/*.yaml & labs/*.yaml (Settings → Starter presets) get a separate
// stale-while-revalidate cache instead: serve whatever's cached
// immediately (instant, and works offline once something's been fetched
// once), while always kicking off a network fetch in the background to
// refresh that cache for next time. This deliberately trades a small
// staleness risk (an offline visitor might see a price that's since
// changed) for the presets screen actually working offline at all — the
// same tradeoff every stale-while-revalidate cache makes. js/app.js's
// renderPresetImport() flags this explicitly when navigator.onLine is
// false, so a stale price is never shown as if it were live. Everything
// else (schema/, options.yaml, changelog.json) still hits the network
// untouched, same as before.
//
// %%FILMCALC_VERSION%% is stamped in by build-github-page.yml (same sed
// step that already stamps index.html) — that gives every deploy its own
// shell cache name for free, so an old shell never lingers past its own
// commit. The preset cache below is deliberately NOT versioned this way —
// it's meant to persist across deploys, not get wiped by one.
const CACHE_NAME = 'filmcalc-shell-%%FILMCALC_VERSION%%';
const PRESET_CACHE_NAME = 'filmcalc-presets-v1';

const SHELL_FILES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/icon.ico',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/apple-touch-icon.png',
    '/js/i18n.js',
    '/js/dev-cost-calc.js',
    '/js/data-validate.js',
    '/js/tz-country.js',
    '/js/app.js',
    '/js/adsense-loader.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME && n !== PRESET_CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// films/index.json, labs/index.json, or a films/*.yaml|.yml / labs/*.yaml|.yml
// preset file — see the stale-while-revalidate note up top.
function isPresetDataPath(pathname) {
    if (pathname === '/films/index.json' || pathname === '/labs/index.json') return true;
    return /^\/(films|labs)\/[\w.-]+\.ya?ml$/.test(pathname);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (SHELL_FILES.includes(url.pathname)) {
        event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
        return;
    }

    if (isPresetDataPath(url.pathname)) {
        event.respondWith(
            caches.open(PRESET_CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(req);
                const network = fetch(req).then((res) => {
                    if (res.ok) cache.put(req, res.clone());
                    return res;
                }).catch(() => null);
                // Cached copy wins if there is one — instant, and works
                // offline — but the network fetch above still runs
                // unconditionally to refresh the cache for next time.
                // Only actually wait on the network when there's nothing
                // cached yet (first-ever visit to this file).
                return cached || (await network) || Response.error();
            })
        );
        return;
    }

    // everything else (schema/, options.yaml, changelog.json, ...) hits
    // the network untouched, same as before.
});
