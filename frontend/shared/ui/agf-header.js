/* ============================================================================
   agf-header.js - Cabecalho padrao da Plataforma AGF Jose Bonifacio
   Versao 1.0.1

   O cabecalho e dado, nao markup. Cada app declara apenas a rota.
   Titulo, icone, cor e visibilidade publica vem do registro abaixo.

   Uso minimo:
     <link rel="stylesheet" href="/shared/ui/agf-header.css?v=1">
     <div data-agf-header data-route="/crm"></div>
     <script src="/shared/ui/agf-header.js?v=1" defer></script>
   ========================================================================== */
(function (global, document) {
  'use strict';

  var VERSION = '1.0.1';
  var SUBTITLE = 'AGF Jos\u00E9 Bonif\u00E1cio';

  /* =========================================================== 1. ROTAS ===
     Fonte unica da verdade. Para adicionar um app novo, acrescente aqui.
     ===================================================================== */
  var ROUTES = {
    '/agf':           { title: 'Portal Interno',  glyph: 'portal',  accent: '#B07207', group: 'Opera\u00E7\u00E3o', publico: false },
    '/intra':         { title: 'Gerencial',       glyph: 'painel',  accent: '#0F766E', group: 'Opera\u00E7\u00E3o', publico: false },
    '/crm':           { title: 'CRM Comercial',   glyph: 'crm',     accent: '#6D28D9', group: 'Opera\u00E7\u00E3o', publico: false },
    '/balcao':        { title: 'Balc\u00E3o',     glyph: 'balcao',  accent: '#C2410C', group: 'Opera\u00E7\u00E3o', publico: false },
    '/atende':        { title: 'Atendimento',     glyph: 'atende',  accent: '#9F1239', group: 'Opera\u00E7\u00E3o', publico: false },
    '/caixa':         { title: 'Caixa Balc\u00E3o', glyph: 'caixa', accent: '#15803D', group: 'Opera\u00E7\u00E3o', publico: false },
    '/cep':           { title: 'Consulta de CEP', glyph: 'cep',     accent: '#0083CA', group: 'Consulta', publico: true },
    '/reverso-admin': { title: 'Admin Reverso',   glyph: 'reverso', accent: '#3F4A5F', group: 'Log\u00EDstica reversa', publico: false }
  };

  /* Apps deliberadamente FORA do padrao. Nao aplicar agf-header nestes. */
  var EXTERNOS = [
    { href: '/app',              title: 'Minhas Postagens' },
    { href: '/nuvemshop',        title: 'Nuvemshop' },
    { href: '/superfrete-admin', title: 'SuperFrete Admin' },
    { href: '/reverso',          title: 'Home Reverso' },
    { href: '/reverso-coleta',   title: 'Coleta Reverso' }
  ];

  /* ========================================================== 2. ICONES ===
     SVG inline de proposito. Sprite externo passaria pelo service worker,
     que hoje serve /shared/ui/ em cache-first e travaria a atualizacao.
     ===================================================================== */
  var GLYPHS = {
    portal:  '<path d="M4.2 20.4V9.8L12 4.2l7.8 5.6v10.6"/><path d="M9 20.4v-5.6a3 3 0 0 1 6 0v5.6"/>',
    painel:  '<path d="M5.4 19.2v-6.4"/><path d="M12 19.2V5.4"/><path d="M18.6 19.2v-9.6"/>',
    crm:     '<path d="M4.4 5.6h15.2l-5.9 7v5.3l-3.4 2.1V12.6z"/>',
    balcao:  '<path d="M3.6 9.6h16.8l-1.4-4.2H5z"/><path d="M5 9.6v9.6h14V9.6"/><path d="M9.4 19.2v-5h5.2v5"/>',
    atende:  '<path d="M4.4 7.2A1.8 1.8 0 0 1 6.2 5.4h11.6a1.8 1.8 0 0 1 1.8 1.8v7.4a1.8 1.8 0 0 1-1.8 1.8h-6.4l-4.2 3.2v-3.2H6.2a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M8.4 9.6h7.2"/><path d="M8.4 12.6h4.4"/>',
    cep:     '<path d="M12 20.6s6-5.7 6-9.6a6 6 0 1 0-12 0c0 3.9 6 9.6 6 9.6z"/><circle cx="12" cy="10.8" r="2.2"/>',
    caixa:   '<rect x="3.2" y="6.4" width="17.6" height="11.2" rx="2"/><circle cx="12" cy="12" r="2.7"/><path d="M6.6 9.4v5.2"/><path d="M17.4 9.4v5.2"/>',
    reverso: '<path d="M6.6 5.6h10.8l2.6 4.4v8.4H4V10z"/><path d="M12 15.6V8.8"/><path d="M9.2 11.6 12 8.8l2.8 2.8"/>'
  };

  function s(inner, w) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  var UI = {
    launcher: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></svg>',
    refresh:  s('<path d="M20.2 11.4a8.2 8.2 0 1 1-2.5-5.6"/><path d="M20.4 4.4v5.2h-5.2"/>'),
    globe:    s('<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6c2.2 2.4 3.3 5.3 3.3 8.4s-1.1 6-3.3 8.4c-2.2-2.4-3.3-5.3-3.3-8.4S9.8 6 12 3.6z"/>'),
    shield:   s('<path d="M12 3.4 5 6.2v5c0 4.3 2.9 8.1 7 9.4 4.1-1.3 7-5.1 7-9.4v-5z"/><path d="M9.4 12.2l1.9 1.9 3.5-3.6"/>'),
    parcel:   s('<path d="M20.4 8.2v7.6L12 20.4l-8.4-4.6V8.2L12 3.6z"/><path d="M3.6 8.2 12 12.8l8.4-4.6"/><path d="M12 12.8v7.6"/>'),
    swap:     s('<path d="M4.4 8.4h13.4l-3.2-3.2"/><path d="M19.6 15.6H6.2l3.2 3.2"/>'),
    camera:   s('<path d="M3.6 8.4h3.6l1.6-2.4h6.4l1.6 2.4h3.6v10.2H3.6z"/><circle cx="12" cy="13.2" r="3"/>'),
    key:      s('<circle cx="8.2" cy="12" r="3.6"/><path d="M11.8 12h8.6"/><path d="M17.4 12v3"/><path d="M20.4 12v2.2"/>'),
    exit:     s('<path d="M14.4 4.6H6.2v14.8h8.2"/><path d="M11 12h9.2"/><path d="M17.4 8.8 20.6 12l-3.2 3.2"/>'),
    login:    s('<path d="M10.4 4.6h7.4v14.8h-7.4"/><path d="M13.6 12H4.4"/><path d="M7.6 8.8 4.4 12l3.2 3.2"/>'),
    external: s('<path d="M13.6 4.6h5.8v5.8"/><path d="M19.4 4.6 10.8 13.2"/><path d="M17.4 14v5.4H4.6V6.6H10"/>')
  };

  /* Marca do app: glifo do Sistema 3 apoiado na linha de base.
     A linha de base e o DNA da familia. Nao remover. */
  function markSVG(glyph) {
    var g = GLYPHS[glyph] || GLYPHS.portal;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4.2 21.2h15.6" stroke-width="2.1"/>' +
      '<g transform="translate(12,10.2) scale(0.84) translate(-12,-12)">' + g + '</g></svg>';
  }

  var FALLBACK_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" fill="#5C7799"/><circle cx="32" cy="24" r="11" fill="#E4E9F0"/>' +
    '<path d="M10 64c2-13 11-20 22-20s20 7 22 20z" fill="#E4E9F0"/></svg>');

  /* ======================================================== 3. UTILITARIOS */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Casa o prefixo mais longo, para /reverso-admin nao cair em /reverso. */
  function detectRoute() {
    var path = global.location.pathname.replace(/\/+$/, '') || '/';
    var best = null;
    for (var key in ROUTES) {
      if (!Object.prototype.hasOwnProperty.call(ROUTES, key)) continue;
      if (path === key || path.indexOf(key + '/') === 0) {
        if (!best || key.length > best.length) best = key;
      }
    }
    return best;
  }

  /* ========================================================= 4. COMPONENTE */
  var state = {
    el: null, cfg: null, route: null, def: null,
    userMenu: null, appsMenu: null,
    pending: 0, timer: null, loadEl: null,
    scrollTicking: false,
    wired: false          // trava anti-duplicacao de listener
  };

  function buildActions(actions) {
    if (!actions || !actions.length) return '';
    return actions.slice(0, 2).map(function (a, i) {
      var icon = UI[a.icon] || '';
      return '<button type="button" class="agf-hd__btn" data-agf-action="' + i + '">' +
        icon + '<span class="agf-hd__btn-label">' + esc(a.label) + '</span></button>';
    }).join('');
  }

  function buildUser(cfg) {
    if (!cfg.user) {
      return '<button type="button" class="agf-hd__enter" data-agf-login>' +
        UI.login + '<span>Entrar</span></button>';
    }
    var photo = cfg.user.photo || FALLBACK_AVATAR;
    var name = esc(cfg.user.name || 'Usu\u00E1rio');
    var role = esc(cfg.user.role || '');
    return '' +
      '<button type="button" class="agf-hd__avatar" data-agf-usermenu ' +
        'aria-haspopup="menu" aria-expanded="false" aria-label="Sua conta">' +
        '<img src="' + esc(photo) + '" alt=""></button>' +
      '<div class="agf-hd__menu agf-hd__menu--user" role="menu" data-open="false" data-agf-usermenu-panel>' +
        '<div class="agf-hd__menu-head"><img src="' + esc(photo) + '" alt="">' +
          '<span><span class="agf-hd__menu-name">' + name + '</span>' +
          '<br><span class="agf-hd__menu-role">' + role + '</span></span></div>' +
        '<button type="button" class="agf-hd__menu-item" role="menuitem" data-agf-photo>' + UI.camera + 'Alterar foto</button>' +
        '<button type="button" class="agf-hd__menu-item" role="menuitem" data-agf-password>' + UI.key + 'Alterar senha</button>' +
        '<div class="agf-hd__menu-sep"></div>' +
        '<button type="button" class="agf-hd__menu-item agf-hd__menu-item--danger" role="menuitem" data-agf-logout>' +
          UI.exit + 'Sair</button>' +
      '</div>';
  }

  function buildApps(current) {
    var groups = {}, order = [];
    for (var key in ROUTES) {
      if (!Object.prototype.hasOwnProperty.call(ROUTES, key)) continue;
      var r = ROUTES[key];
      if (!groups[r.group]) { groups[r.group] = []; order.push(r.group); }
      groups[r.group].push({ href: key, r: r });
    }
    var html = '';
    order.forEach(function (g) {
      html += '<div class="agf-hd__menu-label">' + esc(g) + '</div>';
      groups[g].forEach(function (it) {
        html += '<a class="agf-hd__menu-item" role="menuitem" href="' + esc(it.href) + '"' +
          (it.href === current ? ' aria-current="page"' : '') + '>' +
          '<span class="agf-hd__menu-mark" style="color:' + it.r.accent + '">' + markSVG(it.r.glyph) + '</span>' +
          esc(it.r.title) + '</a>';
      });
    });
    if (EXTERNOS.length) {
      html += '<div class="agf-hd__menu-sep"></div><div class="agf-hd__menu-label">Aplicativos</div>';
      var newTab = global.matchMedia && global.matchMedia('(min-width: 768px)').matches;
      EXTERNOS.forEach(function (e) {
        html += '<a class="agf-hd__menu-item" role="menuitem" href="' + esc(e.href) + '"' +
          (newTab ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
          esc(e.title) +
          (newTab ? '<span class="agf-hd__menu-ext" title="Abre em nova aba">' + UI.external + '</span>' : '') +
          '</a>';
      });
    }
    return '<div class="agf-hd__menu agf-hd__menu--apps" role="menu" data-open="false" data-agf-appsmenu-panel>' +
      html + '</div>';
  }

  function render() {
    var cfg = state.cfg, def = state.def;
    state.el.className = 'agf-hd';
    state.el.setAttribute('data-agf-route', state.route);
    state.el.style.setProperty('--agf-hd-accent', def.accent);

    state.el.innerHTML = '' +
      '<div class="agf-hd__glow" aria-hidden="true"></div>' +
      '<div class="agf-hd__load" data-on="false" role="progressbar" aria-label="Carregando"><i></i></div>' +
      '<div class="agf-hd__in">' +
        '<button type="button" class="agf-hd__launcher" data-agf-appsmenu ' +
          'aria-haspopup="menu" aria-expanded="false" aria-label="Aplicativos">' + UI.launcher + '</button>' +
        '<span class="agf-hd__rule" aria-hidden="true"></span>' +
        '<div class="agf-hd__brand">' +
          '<span class="agf-hd__mark">' + markSVG(def.glyph) + '</span>' +
          '<span class="agf-hd__titles">' +
            '<span class="agf-hd__title">' + esc(def.title) + '</span>' +
            '<span class="agf-hd__sub">' + esc(SUBTITLE) + '</span>' +
          '</span>' +
        '</div>' +
        '<span class="agf-hd__spacer"></span>' +
        '<span class="agf-hd__actions">' + buildActions(cfg.actions) + '</span>' +
        '<span class="agf-hd__rule" aria-hidden="true"></span>' +
        '<button type="button" class="agf-hd__icon-btn" data-agf-refresh aria-label="Atualizar">' + UI.refresh + '</button>' +
        '<span class="agf-hd__user">' + buildUser(cfg) + buildApps(state.route) + '</span>' +
      '</div>';

    /* o painel de apps ancora na esquerda, nao no bloco do usuario */
    var apps = state.el.querySelector('[data-agf-appsmenu-panel]');
    if (apps) state.el.querySelector('.agf-hd__in').appendChild(apps);

    state.loadEl = state.el.querySelector('.agf-hd__load');
    state.userMenu = state.el.querySelector('[data-agf-usermenu-panel]');
    state.appsMenu = apps;
    wire();
    onScroll();
  }

  /* ============================================================ 5. EVENTOS */
  function closeMenus(except) {
    [state.userMenu, state.appsMenu].forEach(function (m) {
      if (!m || m === except) return;
      m.setAttribute('data-open', 'false');
    });
    ['[data-agf-usermenu]', '[data-agf-appsmenu]'].forEach(function (sel) {
      var b = state.el && state.el.querySelector(sel);
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleMenu(panel, button) {
    if (!panel) return;
    var open = panel.getAttribute('data-open') === 'true';
    closeMenus();
    if (!open) {
      panel.setAttribute('data-open', 'true');
      if (button) button.setAttribute('aria-expanded', 'true');
    }
  }

  /* O listener e amarrado UMA vez no elemento de montagem. Ele le state.cfg
     em tempo de clique, entao continua correto depois de qualquer re-render.
     Amarrar dentro de render() duplicaria o handler a cada mount/setUser. */
  function wire() {
    if (state.wired) return;
    state.wired = true;

    state.el.addEventListener('click', function (ev) {
      var cfg = state.cfg;
      var t = ev.target;
      var hit = function (sel) { return t.closest && t.closest(sel); };

      var u = hit('[data-agf-usermenu]');
      if (u) { ev.stopPropagation(); toggleMenu(state.userMenu, u); return; }

      var a = hit('[data-agf-appsmenu]');
      if (a) { ev.stopPropagation(); toggleMenu(state.appsMenu, a); return; }

      var act = hit('[data-agf-action]');
      if (act) {
        var i = parseInt(act.getAttribute('data-agf-action'), 10);
        var d = cfg.actions && cfg.actions[i];
        if (d && typeof d.onClick === 'function') d.onClick(ev);
        else if (d && d.href) global.location.href = d.href;
        return;
      }

      if (hit('[data-agf-refresh]')) {
        if (typeof cfg.onRefresh === 'function') cfg.onRefresh(ev);
        else global.location.reload();
        return;
      }
      if (hit('[data-agf-login]'))    { call(cfg.onLogin, 'onLogin'); return; }
      if (hit('[data-agf-photo]'))    { closeMenus(); call(cfg.onChangePhoto, 'onChangePhoto'); return; }
      if (hit('[data-agf-password]')) { closeMenus(); call(cfg.onChangePassword, 'onChangePassword'); return; }
      if (hit('[data-agf-logout]'))   { closeMenus(); call(cfg.onLogout, 'onLogout'); return; }
    });

    /* Sem handler, o item ficaria morto e silencioso.
       Nao inventamos URL de destino: avisamos alto no console. */
    function call(fn, nome) {
      if (typeof fn === 'function') { fn(); return; }
      console.error('[agf-header] "' + nome + '" nao foi informado no mount(). ' +
        'O item do menu nao tem para onde ir. Rota: ' + state.route);
    }
  }

  function onScroll() {
    if (state.scrollTicking) return;
    state.scrollTicking = true;
    global.requestAnimationFrame(function () {
      if (state.el) {
        var y = global.pageYOffset || document.documentElement.scrollTop || 0;
        state.el.classList.toggle('is-scrolled', y > 8);
      }
      state.scrollTicking = false;
    });
  }

  document.addEventListener('click', function (ev) {
    if (!state.el) return;
    if (!state.el.contains(ev.target)) closeMenus();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && state.el) closeMenus();
  });
  global.addEventListener('scroll', onScroll, { passive: true });

  /* ====================================================== 6. CARREGAMENTO
     Contador de requisicoes. So aparece se passar de 400ms, senao pisca
     e vira ruido. Amarrar a chamadas reais, nunca a animacao decorativa.
     ===================================================================== */
  var loading = {
    start: function () {
      state.pending++;
      if (state.pending === 1) {
        clearTimeout(state.timer);
        state.timer = setTimeout(function () {
          if (state.loadEl) {
            state.loadEl.setAttribute('data-done', 'false');
            state.loadEl.setAttribute('data-on', 'true');
          }
        }, 400);
      }
    },
    done: function () {
      state.pending = Math.max(0, state.pending - 1);
      if (state.pending > 0) return;
      clearTimeout(state.timer);
      if (!state.loadEl) return;
      if (state.loadEl.getAttribute('data-on') !== 'true') return;
      state.loadEl.setAttribute('data-done', 'true');
      setTimeout(function () {
        if (!state.loadEl) return;
        state.loadEl.setAttribute('data-on', 'false');
        state.loadEl.setAttribute('data-done', 'false');
      }, 240);
    },
    reset: function () {
      state.pending = 0;
      clearTimeout(state.timer);
      if (state.loadEl) {
        state.loadEl.setAttribute('data-on', 'false');
        state.loadEl.setAttribute('data-done', 'false');
      }
    }
  };

  /* ======================================================== 7. API PUBLICA */
  function mount(options) {
    var cfg = options || {};
    var target = cfg.target || '[data-agf-header]';
    var el = typeof target === 'string' ? document.querySelector(target) : target;

    if (!el) { console.warn('[agf-header] ponto de montagem nao encontrado:', target); return null; }

    var route = cfg.route || el.getAttribute('data-route') || detectRoute();
    var def = ROUTES[route];

    if (!def) {
      console.warn('[agf-header] rota nao registrada:', route, '- usando /agf como base.');
      route = '/agf';
      def = ROUTES[route];
    }

    state.el = el;
    state.cfg = cfg;
    state.route = route;
    state.def = def;
    render();

    /* Auditoria de integracao: falha alto na montagem, nao no clique. */
    if (cfg.user && typeof cfg.onLogout !== 'function') {
      console.error('[agf-header] rota ' + route + ' montada com sessao mas sem onLogout. ' +
        'O botao Sair nao vai funcionar.');
    }
    if (!cfg.user && def.publico === false) {
      console.warn('[agf-header] rota privada ' + route + ' montada sem usuario. ' +
        'Sera exibido o botao Entrar. Confirme se o guard de sessao rodou.');
    }
    return AgfHeader;
  }

  function setUser(user) {
    if (!state.el) return;
    state.cfg.user = user || null;
    render();
  }

  function setTitle(text) {
    if (!state.el) return;
    var t = state.el.querySelector('.agf-hd__title');
    if (t) t.textContent = text;
  }

  var AgfHeader = {
    VERSION: VERSION,
    ROUTES: ROUTES,
    EXTERNOS: EXTERNOS,
    mount: mount,
    setUser: setUser,
    setTitle: setTitle,
    loading: loading,
    close: closeMenus
  };

  global.AgfHeader = AgfHeader;

  /* Montagem automatica quando existe [data-agf-header] no HTML.
     App que precise passar usuario ou acoes chama mount() manualmente. */
  function auto() {
    var el = document.querySelector('[data-agf-header]');
    if (el && !state.el) mount({ target: el });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();

})(window, document);
