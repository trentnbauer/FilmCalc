// Minimal service worker — just enough to make the app installable as a PWA.
// Caches the app shell so it still loads (with stale data) if offline; doesn't
// try to be a full offline-first cache since this app relies on config.yaml
// and localStorage rather than a lot of external requests.
const CACHE_NAME = 'filmcalc-v3';
const APP_SHELL = ['/', '/index.html', '/favicon.ico', '/icon.svg', '/apple-touch-icon.png', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
