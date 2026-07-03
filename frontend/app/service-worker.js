const CACHE_NAME = 'postagens-agf-app-v37-idem-svgfix';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/screens.css',
  './styles/nfe-import.css',
  './js/config.js',
  './js/api.js',
  './js/app.js',
  './js/router.js',
  './js/ui.js',
  './js/nfe-import.js',
  './js/screens/login.js',
  './js/screens/nova.js',
  './js/screens/etiqueta.js',
  './js/screens/historico.js',
  './js/screens/destinatarios.js',
  './js/screens/config.js',
  './js/screens/sucesso.js',
  './assets/correios-logo-2.png',
  './assets/favicon.ico',
  './assets/favicon-16x16.png',
  './assets/favicon-32x32.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

function isShellAsset(request) {
  const url = new URL(request.url);
  return request.mode === 'navigate' || /\.(html|css|js|webmanifest)$/i.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (e) {
    return (await caches.match(request)) || caches.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return caches.match('./index.html');
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(isShellAsset(event.request) ? networkFirst(event.request) : cacheFirst(event.request));
});