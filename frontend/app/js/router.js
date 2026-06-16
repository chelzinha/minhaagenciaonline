/* =====================================================
   APP ETIQUETAS — Hash Router
   =====================================================
   SPA simples com hash routing. Cada rota corresponde a um
   template <template id="tpl-*"> no index.html. O router
   clona o template, monta no #screenMount e chama o módulo
   de tela (Screens.nova.mount(), Screens.sucesso.mount(), ...).

   Rotas:
     #/nova              -> tela de criar etiqueta
     #/sucesso           -> tela de sucesso (dados em memória)
     #/historico         -> lista de etiquetas geradas
     #/destinatarios      -> cadastro e controle de destinatários
     #/config            -> perfil, conexão Correios, diagnóstico

   Rotas default:
     sem hash            -> #/nova
     rota desconhecida   -> #/nova
   ===================================================== */

const Router = (function () {

  // Tela de sucesso precisa segurar o dado do último resultado
  // porque a rota não carrega parâmetros complexos (só strings).
  let _lastSuccessData = null;
  let _initialized = false;

  const ROUTES = {
    '/nova':      { tpl: 'tpl-nova',      title: 'Cotação',        screen: 'nova' },
    '/etiqueta':  { tpl: 'tpl-etiqueta',  title: 'Etiqueta',       screen: 'etiqueta' },
    '/sucesso':   { tpl: 'tpl-sucesso',   title: 'Etiqueta gerada', screen: 'sucesso' },
    '/historico': { tpl: 'tpl-historico', title: 'Histórico',      screen: 'historico' },
    '/destinatarios': { tpl: 'tpl-destinatarios', title: 'Destinatários', screen: 'destinatarios' },
    '/config':    { tpl: 'tpl-config',    title: 'Conta',          screen: 'config' }
  };

  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '').trim();
    if (!h || !ROUTES[h]) return '/nova';
    return h;
  }

  function setSuccessData(data) { _lastSuccessData = data; }
  function getSuccessData() { return _lastSuccessData; }

  function navigate(route) {
    if (location.hash !== '#' + route) {
      location.hash = '#' + route;
    } else {
      // Já estamos na rota — força re-render
      render();
    }
  }

  function updateBottomNav(currentRoute) {
    document.querySelectorAll('.bn-item').forEach(a => {
      const r = a.getAttribute('data-route');
      const active = r === currentRoute;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function render() {
    if (typeof UI !== 'undefined' && UI.repairScrollLock) UI.repairScrollLock();

    const route = parseHash();
    const def = ROUTES[route];
    if (!def) return;

    const tpl = document.getElementById(def.tpl);
    if (!tpl) {
      console.error('Template não encontrado: ' + def.tpl);
      return;
    }

    const mount = document.getElementById('screenMount');
    mount.innerHTML = '';
    mount.appendChild(tpl.content.cloneNode(true));

    document.getElementById('topbarTitle').textContent = def.title;
    updateBottomNav(route);

    // Sobe o scroll até o topo da tela (boa prática de SPA mobile)
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    try { mount.focus({ preventScroll: true }); } catch (e) {}

    // Chama o mount da tela correspondente
    if (typeof Screens !== 'undefined' && Screens[def.screen] && typeof Screens[def.screen].mount === 'function') {
      try {
        Screens[def.screen].mount();
      } catch (e) {
        console.error('Erro ao montar tela ' + def.screen + ': ', e);
        UI.toastError(e);
      }
    }

    setTimeout(() => {
      if (typeof UI !== 'undefined' && UI.repairScrollLock) UI.repairScrollLock();
    }, 0);
  }

  function init() {
    if (_initialized) {
      render();
      return;
    }
    _initialized = true;
    window.addEventListener('hashchange', render);
    render();
  }

  return {
    init,
    navigate,
    setSuccessData,
    getSuccessData
  };
})();
