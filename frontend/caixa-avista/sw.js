const CACHE = 'caixa-balcao-date-client-20260831204825';
const ASSETS = [
  '/caixa-avista/',
  '/caixa-avista/index.html',
  '/caixa-avista/styles-v2.css',
  '/caixa-avista/app.js',
  '/caixa-avista/unit-selector.js',
  '/caixa-avista/app-v2.js',
  '/caixa-avista/manifest.webmanifest'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request)));
});
