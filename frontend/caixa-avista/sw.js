const CACHE = 'caixa-avista-v1-2026-08-30-santander-1';
const ASSETS = [
  '/caixa-avista/',
  '/caixa-avista/index.html',
  '/caixa-avista/styles.css',
  '/caixa-avista/app.js',
  '/caixa-avista/app-utils.js',
  '/caixa-avista/app-core.js',
  '/caixa-avista/app-ui-shell.js',
  '/caixa-avista/app-client-keypad.js',
  '/caixa-avista/app-pix-provider.js',
  '/caixa-avista/app-sales-pix.js',
  '/caixa-avista/app-movements.js',
  '/caixa-avista/app-summary-settings.js',
  '/caixa-avista/app-repository.js',
  '/caixa-avista/app-bootstrap.js',
  '/caixa-avista/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request)));
});
