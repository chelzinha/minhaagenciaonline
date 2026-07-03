/* ============================================================
 * AGF Metrô — Service Worker
 * ------------------------------------------------------------
 * Estratégia:
 *   - HTML (navegação) → network-first, fallback cache, fallback offline
 *   - CSS / fontes / imagens / ícones → cache-first com revalidação
 *   - API Apps Script → SEMPRE rede (nunca cacheia dados dinâmicos)
 *
 * Como atualizar a versão:
 *   1. Bumpar VERSION abaixo (ex: 'v14' → 'v15')
 *   2. Deploy no Netlify
 *   3. SW novo é detectado, baixa em background, ativa no próximo refresh
 * ============================================================ */

const VERSION = 'v22-sharedui-nf';
const STATIC_CACHE  = 'agf-static-'  + VERSION;
const RUNTIME_CACHE = 'agf-runtime-' + VERSION;

/* Páginas e assets pré-cacheados na instalação.
   Tudo o mais é cacheado sob demanda em runtime. */
const PRECACHE_URLS = [
  '/intra/',
  '/intra/index.html',
  '/intra/dashboard/',
  '/intra/manuais/',
  '/intra/logistica/',
  '/intra/caixa/',
  '/intra/resumo/',
  '/intra/styles/app-shell.css',
  '/intra/manifest.webmanifest',
  '/assets/pwa/intra/icon-192.png',
  '/assets/pwa/intra/icon-512.png',
  '/assets/pwa/intra/icon-192-maskable.png',
  '/assets/pwa/intra/icon-512-maskable.png',
  '/assets/pwa/intra/apple-touch-icon.png'
];

/* Páginas servidas quando offline + URL não está em cache */
const OFFLINE_FALLBACK_HTML = '/intra/offline.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      /* addAll falha tudo se um item falhar — usamos add() individual com catch
         para tolerar 404 em assets opcionais */
      return Promise.all(
        PRECACHE_URLS.concat([OFFLINE_FALLBACK_HTML]).map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Precache falhou:', url, err);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      /* Limpa caches antigos de versões anteriores */
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      ),
      /* Toma controle imediato de todas as abas abertas */
      self.clients.claim()
    ])
  );
});

/* Detecta se a request é navegação para uma página */
function isNavigationRequest(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'));
}

/* Detecta se é chamada para a API do Apps Script — nunca cachear */
function isApiCall(url) {
  return url.hostname.includes('script.google.com')
      || url.hostname.includes('googleusercontent.com')
      || url.hostname.includes('apis.google.com');
}

/* Detecta assets estáticos do próprio site (mesma origem) */
function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname.toLowerCase();
  return p.endsWith('.css') || p.endsWith('.js')
      || p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg')
      || p.endsWith('.svg') || p.endsWith('.webp') || p.endsWith('.ico')
      || p.endsWith('.woff') || p.endsWith('.woff2') || p.endsWith('.ttf')
      || p.endsWith('.webmanifest');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* Apenas GET é cacheado */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* === API do Apps Script: SEMPRE rede direto, sem cache === */
  if (isApiCall(url)) {
    return; /* deixa o browser tratar normalmente */
  }

  /* === Navegação (HTML): network-first, fallback cache, fallback offline === */
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          /* Sucesso → atualiza cache em background e devolve a resposta */
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => {
          /* Offline → tenta cache exato, depois cache de root, depois offline */
          return caches.match(req)
            .then((cached) => cached
              || caches.match('/intra/')
              || caches.match(OFFLINE_FALLBACK_HTML));
        })
    );
    return;
  }

  /* === UI compartilhada (/shared/ui/): network-first para propagar
     atualizações de CSS/JS imediatamente; cai no cache só offline. === */
  if (url.origin === self.location.origin && url.pathname.indexOf('/shared/ui/') === 0) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  /* === Assets estáticos da mesma origem: cache-first com revalidação === */
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached); /* offline → devolve cache */
        return cached || networkFetch;
      })
    );
    return;
  }

  /* === Qualquer outro GET (ex: Google Fonts CDN): stale-while-revalidate === */
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

/* Permite que a página force uma atualização imediata do SW */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
