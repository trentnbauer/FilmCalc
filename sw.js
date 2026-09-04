// Service worker — exists to satisfy the PWA baseline "offline page"
// requirement (see web.dev's PWA checklist) and Chrome's installability
// check (which still looks for a registered service worker with a fetch
// handler, even though the fetch handler itself no longer has to do
// anything for the install prompt to appear).
//
// Deliberately narrow: only precaches the app shell (the files needed to
// boot the calculator UI). It does NOT cache films/labs/schema data,
// options.yaml, or changelog.json — those change over time (new film
// stocks, new labs, price corrections), and a cost calculator silently
// showing stale prices offline would be worse than it not working
// offline at all. The core loop (open the app, pick an already-saved
// film/lab, calculate cost) only ever reads from localStorage anyway, so
// app-shell caching alone is enough for that to keep working offline;
// only the "browse more presets to import" flow needs live network and
// degrades (fails its fetch, same as it would with no service worker)
// when offline.
//
// %%FILMCALC_VERSION%% is stamped in by build-github-page.yml (same sed
// step that already stamps index.html) — that gives every deploy its own
// cache name for free, so an old shell never lingers past its own commit.
const CACHE_NAME = 'filmcalc-shell-%%FILMCALC_VERSION%%';

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
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (!SHELL_FILES.includes(url.pathname)) return; // let films/labs/schema/etc hit the network untouched

    event.respondWith(
        caches.match(req).then((cached) => cached || fetch(req))
    );
});
