const CACHE = 'caixa-balcao-v3-20260905001500';
const ASSETS = [
  '/caixa-avista/',
  '/caixa-avista/index.html',
  '/caixa-avista/styles-v2.css',
  '/caixa-avista/app.js?v=20260905001500',
  '/caixa-avista/unit-selector.js?v=20260902102544',
  '/caixa-avista/v3-controller.js?v=20260905001500',
  '/caixa-avista/app-v2.js?v=20260904230000',
  '/caixa-avista/pix-message-link-fix.js?v=20260904232000',
  '/caixa-avista/pix-safety.js?v=20260904212500',
  '/caixa-avista/movement-history.js?v=20260904230000',
  '/caixa-avista/manifest.webmanifest',
  '/caixa-avista/vendor/qrcode.min.js?v=20260902102544'
];

self.addEventListener('install', event =>
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  )
);

self.addEventListener('activate', event =>
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE)
          .then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
