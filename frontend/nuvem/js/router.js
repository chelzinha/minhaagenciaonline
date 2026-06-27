
const Router = (function () {
  let _initialized = false;
  let _params = {};
  const ROUTES = {
    '/pedidos': { tpl: 'tpl-pedidos', title: 'Pedidos', screen: 'pedidos' },
    '/revisar': { tpl: 'tpl-revisar', title: 'Revisar etiqueta', screen: 'revisar' },
    '/emitidas': { tpl: 'tpl-emitidas', title: 'Emitidas', screen: 'emitidas' },
    '/conta':   { tpl: 'tpl-conta', title: 'Conta', screen: 'conta' }
  };
  function parseHash() {
    const raw = (location.hash || '').replace(/^#/, '').trim();
    if (!raw) return { route: '/pedidos', params: {} };
    const parts = raw.split('/').filter(Boolean);
    const route = '/' + (parts[0] || 'pedidos');
    if (!ROUTES[route]) return { route: '/pedidos', params: {} };
    const params = {};
    if (route === '/revisar' && parts[1]) params.orderId = decodeURIComponent(parts[1]);
    return { route, params };
  }
  function navigate(route, params) {
    if (route === '/revisar' && params && params.orderId) location.hash = '#/revisar/' + encodeURIComponent(params.orderId);
    else location.hash = '#' + route;
  }
  function updateBottomNav(currentRoute) {
    document.querySelectorAll('.bn-item').forEach(a => {
      const r = a.getAttribute('data-route');
      const active = r === currentRoute;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  // Ao trocar de tela, fecha overlays presos (modal de rastreio, confirmação,
  // loading) e libera o scroll do body. Sem isso, navegar com um modal aberto
  // deixava body.modal-open ativo e travava o scroll em todas as abas.
  function clearTransientUi_() {
    document.querySelectorAll('.track-modal.show, .modal.show').forEach(function (m) {
      m.classList.remove('show');
      m.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('modal-open');
    if (window.UI && UI.forceHideLoading) UI.forceHideLoading();
    else document.body.classList.remove('is-busy');
  }
  function render() {
    clearTransientUi_();
    const parsed = parseHash();
    _params = parsed.params;
    const def = ROUTES[parsed.route];
    const tpl = document.getElementById(def.tpl);
    const mount = document.getElementById('screenMount');
    mount.innerHTML = '';
    mount.appendChild(tpl.content.cloneNode(true));
    document.getElementById('topbarTitle').textContent = def.title;
    updateBottomNav(parsed.route);
    if (window.Screens && Screens[def.screen] && typeof Screens[def.screen].mount === 'function') {
      Screens[def.screen].mount(_params);
    }
  }
  function init() { if (_initialized) return render(); _initialized = true; window.addEventListener('hashchange', render); render(); }
  function currentParams() { return _params; }
  return { init, navigate, currentParams };
})();
