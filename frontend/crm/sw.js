const CACHE='agf-crm-v86-static';
const STATIC=['/crm/','/crm/index.html','/crm/styles.css','/crm/config.js','/crm/app.js','/shared/ui/agf-ui.css','/shared/ui/agf-ui.js','/shared/auth/agf-auth-client.js'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(STATIC.map(u=>c.add(u).catch(()=>{})))));
});

self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('agf-crm-')).map(k=>caches.delete(k)))),
  self.clients.claim()
])));

function cacheResponse(req,res){
  if(res&&res.status===200){
    const copy=res.clone();
    caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
  }
  return res;
}

function cacheFirst(req){
  return caches.match(req).then(hit=>hit||fetch(req).then(res=>cacheResponse(req,res)));
}

function networkFirst(req,options){
  return fetch(req,options).then(res=>cacheResponse(req,res)).catch(()=>caches.match(req));
}

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;

  const url=new URL(req.url);
  if(url.hostname.includes('script.google.com')||url.hostname.includes('googleusercontent.com'))return;

  if(url.pathname.indexOf('/shared/ui/')===0){
    e.respondWith(networkFirst(req));
    return;
  }

  // Autenticacao e configuracao continuam sempre frescas por seguranca.
  if(url.pathname.indexOf('/shared/auth/')===0||url.pathname==='/crm/config.js'){
    e.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }

  // app.js/styles.css usam ?v= no HTML. Quando a URL esta versionada, ela e
  // imutavel para aquela versao e pode ser cache-first sem risco de servir a
  // versao anterior apos um deploy (o proximo deploy muda o ?v=).
  if(url.pathname==='/crm/app.js'||url.pathname==='/crm/styles.css'){
    e.respondWith(url.searchParams.has('v')?cacheFirst(req):networkFirst(req));
    return;
  }

  if(req.mode==='navigate'){
    e.respondWith(fetch(req).catch(()=>caches.match('/crm/')));
    return;
  }

  if(url.origin===location.origin){
    e.respondWith(cacheFirst(req));
  }
});
