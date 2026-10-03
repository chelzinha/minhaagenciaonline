/* ============================================================================
   agf-header.js - Cabecalho padrao da Plataforma AGF Jose Bonifacio
   Versao 1.2.1 (pele "Selo solido", opcao C)

   O cabecalho e dado, nao markup. Cada app declara apenas a rota.
   Titulo, titulo curto, icone, cor e visibilidade publica vem do registro.

   Novidades da 1.2.1
   - Foto do usuario passa a morar no agf-mural-api (D1), a mesma fonte do
     Portal e de Usuarios internos. O Apps Script segue como copia e como
     origem de migracao: foto que so existe la e copiada para o D1 no 1o acesso.

   Novidades da 1.2.0
   - Menu de aplicativos em ordem fixa (MENU), igual ao Portal Interno.
     Gerencial (/intra) oculto do menu. Todos os itens com selo e cor.
   - Glifos novos: caixa, sla, app, nuvemshop, superfrete e os 3 do Reverso.
   - Zona B com contexto opcional: mount({ context }) e setContext(html).
   - API: AgfHeader.mark(glifo) devolve o selo SVG para outras telas.

   Novidades da 1.1.0
   - Sessao lida sozinha via AgfAuth quando mount() nao recebe "user".
   - Sem sessao: slot vazio de 32px. Botao Entrar removido (spec 4.2).
   - Conta embutida: foto (getMyAvatar/uploadMyAvatar), troca de senha
     (changeMyPassword) e Sair. Cada app pode sobrescrever os handlers.
   - Titulo curto abaixo de 640px (campo "short" do registro).
   - Alternador filtra os apps pelo perfil do usuario.
   - API nova: setActions(), toast().

   Uso minimo:
     <link rel="stylesheet" href="/shared/ui/agf-header.css?v=2">
     <div data-agf-header data-route="/crm"></div>
     <script src="/shared/ui/agf-header.js?v=2"></script>
   ========================================================================== */
(function (global, document) {
  'use strict';

  var VERSION = '1.2.1';
  var SUBTITLE = 'AGF José Bonifácio';
  var AVATAR_KEY = 'agf_jb_avatar_v1';            /* mesmo cache usado pelo CRM e pelo Visao 360 */
  var LOGOUT_URL = '/agf/?reason=logout';
  var PASSWORD_URL = '/agf/?reason=password-changed';
  var ROLE_LABELS = { admin: 'Administrador', manager: 'Gestor', user: 'Usuário' };
  /* Fonte da foto do usuario (Worker agf-mural-api). Local usa o wrangler dev. */
  var MURAL_API = (global.AGF_MURAL_CONFIG && global.AGF_MURAL_CONFIG.apiUrl) ||
    (/^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) ? 'http://127.0.0.1:8787' : 'https://agf-mural-api.chelzinha.workers.dev');

  /* =========================================================== 1. ROTAS ===
     Fonte unica da verdade. roles/app espelham o AGF_ACCESS de cada pagina
     e servem so para filtrar o alternador; quem protege a rota e o guard.
     ===================================================================== */
  var ROUTES = {
    '/agf':          { title: 'Portal Interno',        short: 'Portal',    glyph: 'portal',     accent: '#B07207', group: 'Operação', publico: false },
    '/intra':        { title: 'Gerencial',             short: 'Gerencial', glyph: 'painel',     accent: '#0F766E', group: 'Operação', publico: false, roles: ['admin', 'manager'], app: 'intra', oculto: true },
    '/crm':          { title: 'CRM Comercial',         short: 'CRM',       glyph: 'crm',        accent: '#6D28D9', group: 'Operação', publico: false, app: 'crm' },
    '/balcao':       { title: 'Balcão',           short: 'Balcão', glyph: 'balcao',   accent: '#C2410C', group: 'Operação', publico: false, app: 'balcao' },
    '/atende':       { title: 'Visão 360',        short: 'Visão 360', glyph: 'atende', accent: '#9F1239', group: 'Operação', publico: false, app: 'atende' },
    '/cadastros':    { title: 'Cadastro de Clientes',  short: 'Clientes',  glyph: 'cadastros',  accent: '#4338CA', group: 'Administração', publico: false, roles: ['admin'] },
    '/comparador':   { title: 'Comparador de Tarifas', short: 'Tarifas',   glyph: 'comparador', accent: '#047857', group: 'Operação', publico: false, roles: ['admin', 'manager'], app: 'intra' },
    '/cep':          { title: 'Consulta de CEP',       short: 'CEP',       glyph: 'cep',        accent: '#0083CA', group: 'Consulta', publico: true },
    '/agf/usuarios': { title: 'Usuários Internos', short: 'Usuários', glyph: 'usuarios', accent: '#B07207', group: 'Administração', publico: false, roles: ['admin'] },
    '/agf/icones':   { title: 'Biblioteca de Ícones', short: 'Ícones', glyph: 'icones', accent: '#B07207', group: 'Administração', publico: false, roles: ['admin'] }
  };

  /* Apps FORA do padrao de topo (spec secao 7). Aparecem no alternador como links
     que abrem em nova aba no desktop. Tem selo e cor como as rotas do padrao. */
  var EXTERNOS = [
    { href: '/simulador',        title: 'Simulador de Frete', publico: true,         glyph: 'simulador',  accent: '#1D4ED8' },
    { href: '/caixa',            title: 'Caixa Balcão',     app: 'caixa',            glyph: 'caixa',      accent: '#0F766E' },
    { href: '/sla',              title: 'SLA',              app: 'sla',              glyph: 'sla',        accent: '#475569' },
    { href: '/app',              title: 'Minhas Postagens', publico: true,           glyph: 'app',        accent: '#00416B' },
    { href: '/nuvemshop',        title: 'Nuvemshop',        app: 'nuvemshop',        glyph: 'nuvemshop',  accent: '#0369A1' },
    { href: '/superfrete-admin', title: 'SuperFrete Admin', app: 'superfrete-admin', glyph: 'superfrete', accent: '#A21CAF' },
    { href: '/reverso',          title: 'Home Reverso',     appAny: ['reverso-admin', 'reverso-coleta', 'reverso-expedicao'], glyph: 'revhome', accent: '#0E7490' },
    { href: '/reverso-admin',    title: 'Admin Reverso',    app: 'reverso-admin',    glyph: 'revadmin',   accent: '#0E7490' },
    { href: '/reverso-coleta',   title: 'Coleta Reverso',   app: 'reverso-coleta',   glyph: 'revcoleta',  accent: '#0E7490' }
  ];

  /* Ordem do alternador = ordem do Portal Interno (/agf). Fonte unica.
     Portal Interno fica sempre no topo, fora dos grupos. */
  var MENU = [
    { group: 'Operação',          items: ['/atende', '/crm', '/balcao', '/caixa', '/sla', '/comparador'] },
    { group: 'Consulta',          items: ['/simulador', '/cep'] },
    { group: 'Aplicativos',       items: ['/app', '/nuvemshop', '/superfrete-admin'] },
    { group: 'Logística reversa', items: ['/reverso', '/reverso-admin', '/reverso-coleta'] },
    { group: 'Administração',     items: ['/cadastros', '/agf/usuarios', '/agf/icones'] }
  ];

  /* ========================================================== 2. ICONES ===
     SVG inline de proposito: nao depende de sprite nem de cache externo.
     Grade 24, traco 1,8, ponta arredondada. A linha de base e adicionada
     por markSVG() e e o DNA da familia. Nao remover.
     ===================================================================== */
  var GLYPHS = {
    portal:     '<path d="M4.2 20.4V9.8L12 4.2l7.8 5.6v10.6"/><path d="M9 20.4v-5.6a3 3 0 0 1 6 0v5.6"/>',
    painel:     '<path d="M5.4 19.2v-6.4"/><path d="M12 19.2V5.4"/><path d="M18.6 19.2v-9.6"/>',
    crm:        '<path d="M4.4 5.6h15.2l-5.9 7v5.3l-3.4 2.1V12.6z"/>',
    balcao:     '<path d="M3.6 9.6h16.8l-1.4-4.2H5z"/><path d="M5 9.6v9.6h14V9.6"/><path d="M9.4 19.2v-5h5.2v5"/>',
    atende:     '<path d="M4.4 7.2A1.8 1.8 0 0 1 6.2 5.4h11.6a1.8 1.8 0 0 1 1.8 1.8v7.4a1.8 1.8 0 0 1-1.8 1.8h-6.4l-4.2 3.2v-3.2H6.2a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M8.4 9.6h7.2"/><path d="M8.4 12.6h4.4"/>',
    cep:        '<path d="M12 20.6s6-5.7 6-9.6a6 6 0 1 0-12 0c0 3.9 6 9.6 6 9.6z"/><circle cx="12" cy="10.8" r="2.2"/>',
    comparador: '<path d="M12 4.4v15"/><path d="M5.2 7.2h13.6"/><path d="M5.2 7.2 2.8 13a2.6 2.6 0 0 0 4.8 0z"/><path d="M18.8 7.2 16.4 13a2.6 2.6 0 0 0 4.8 0z"/><path d="M8.6 19.4h6.8"/>',
    simulador:  '<path d="M19.6 12.8V7.4L12 3.4 4.4 7.4v9.2l7.6 4"/><path d="M4.4 7.4 12 11.4l7.6-4"/><path d="M12 11.4v9.2"/><path d="M15 17.4h6M18.6 15l2.4 2.4-2.4 2.4"/>',
    cadastros:  '<rect x="3.6" y="5.6" width="16.8" height="12.8" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M5.8 15.6c.6-1.4 1.8-2.1 3.2-2.1s2.6.7 3.2 2.1"/><path d="M14.4 10h3.6"/><path d="M14.4 13.4h2.6"/>',
    usuarios:   '<circle cx="9.4" cy="8.6" r="3.2"/><path d="M3.6 19.2c.8-3.3 3-5 5.8-5s5 1.7 5.8 5"/><path d="M15.6 5.8a3 3 0 0 1 0 5.8"/><path d="M17.8 14.6c1.3.7 2.2 2.2 2.6 4.6"/>',
    icones:     '<rect x="4" y="4" width="6.6" height="6.6" rx="1.6"/><circle cx="16.7" cy="7.3" r="3.3"/><path d="M7.3 13.4 10.8 20H3.8z"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="3.3"/>',
    caixa:      '<rect x="4.2" y="10.6" width="15.6" height="8.8" rx="1.6"/><path d="M7.2 10.6V5h7.6v5.6"/><path d="M9.6 7.8h2.8"/><path d="M8 15h.01M12 15h.01M16 15h.01" stroke-width="2.6"/>',
    sla:        '<path d="M4.4 17.4a7.6 7.6 0 1 1 15.2 0"/><path d="M12 17.4l3.8-4.6"/><path d="M7 12.6l1 .8M12 9.8v1.2M17 12.6l-1 .8"/>',
    app:        '<rect x="6.8" y="3.4" width="10.4" height="17.2" rx="2.2"/><path d="M9.6 7.6h4.8v4.6H9.6z"/><path d="M10.6 17.4h2.8"/>',
    nuvemshop:  '<path d="M7.2 18.4h9.8a3.8 3.8 0 0 0 .5-7.6 5.6 5.6 0 0 0-10.8-1.2 4.4 4.4 0 0 0 .5 8.8z"/>',
    superfrete: '<path d="M3.4 6.6h10.6v9.6H3.4z"/><path d="M14 9.8h3.8l2.8 3.2v3.2H14"/><circle cx="7" cy="17.6" r="1.7"/><circle cx="17" cy="17.6" r="1.7"/>',
    revhome:    '<path d="M4.4 11.2 12 4.6l7.6 6.6"/><path d="M6.4 9.6v10h11.2v-10"/><path d="M14.6 15.6H9.8l1.8-1.8"/>',
    revadmin:   '<rect x="5.4" y="4.8" width="13.2" height="15.6" rx="1.8"/><path d="M9.4 4.8V3.4h5.2v1.4"/><path d="M8.6 10h6.8M8.6 13.4h6.8M8.6 16.8h4"/>',
    revcoleta:  '<path d="M4.2 7.8V5.2h2.6M17.2 5.2h2.6v2.6M19.8 16.2v2.6h-2.6M6.8 18.8H4.2v-2.6"/><path d="M8.4 8.6v6.8M11 8.6v6.8M13.4 8.6v6.8M16 8.6v6.8"/>'
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
    database: s('<ellipse cx="12" cy="6" rx="7.4" ry="2.6"/><path d="M4.6 6v12c0 1.4 3.3 2.6 7.4 2.6s7.4-1.2 7.4-2.6V6"/><path d="M4.6 12c0 1.4 3.3 2.6 7.4 2.6s7.4-1.2 7.4-2.6"/>'),
    print:    s('<path d="M7 9V3.8h10V9"/><path d="M7 17.2H5.2a1.6 1.6 0 0 1-1.6-1.6v-5a1.6 1.6 0 0 1 1.6-1.6h13.6a1.6 1.6 0 0 1 1.6 1.6v5a1.6 1.6 0 0 1-1.6 1.6H17"/><path d="M7 14h10v6.2H7z"/>'),
    wand:     s('<path d="M4.4 19.6 15 9"/><path d="M13.2 7.2 16.8 10.8"/><path d="M17.6 3.6v2.8"/><path d="M19 5h-2.8"/><path d="M8.4 4.4v2"/><path d="M9.4 5.4h-2"/><path d="M19.6 13.6v2"/><path d="M20.6 14.6h-2"/>'),
    download: s('<path d="M12 4v11"/><path d="M7.6 10.6 12 15l4.4-4.4"/><path d="M5 19.6h14"/>'),
    camera:   s('<path d="M3.6 8.4h3.6l1.6-2.4h6.4l1.6 2.4h3.6v10.2H3.6z"/><circle cx="12" cy="13.2" r="3"/>'),
    key:      s('<circle cx="8.2" cy="12" r="3.6"/><path d="M11.8 12h8.6"/><path d="M17.4 12v3"/><path d="M20.4 12v2.2"/>'),
    exit:     s('<path d="M14.4 4.6H6.2v14.8h8.2"/><path d="M11 12h9.2"/><path d="M17.4 8.8 20.6 12l-3.2 3.2"/>'),
    close:    s('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
    external: s('<path d="M13.6 4.6h5.8v5.8"/><path d="M19.4 4.6 10.8 13.2"/><path d="M17.4 14v5.4H4.6V6.6H10"/>')
  };

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

  function auth() { return global.AgfAuth || null; }

  /* Casa o prefixo mais longo, para /agf/usuarios nao cair em /agf. */
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

  function storageGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }

  /* ============================================================ 4. SESSAO */
  /* Usuario cru do AgfAuth. Mesma ordem de leitura do CRM e do Visao 360. */
  function rawSessionUser() {
    var a = auth();
    if (!a) return null;
    try {
      var ls = a.getLocalSession ? a.getLocalSession() : null;
      var u = (ls && ls.user) || (a.getCachedUser ? a.getCachedUser() : null);
      if (!u && ls && ls.payload) u = { username: ls.payload.sub, role: ls.payload.role };
      return u || null;
    } catch (e) { return null; }
  }

  function token() {
    var a = auth();
    try { return (a && a.getToken) ? (a.getToken() || '') : ''; } catch (e) { return ''; }
  }

  /* Normaliza para o formato de exibicao. Aceita o formato antigo
     { name, role:'Administrador', photo } passado por mount(). */
  function normalizeUser(u) {
    if (!u) return null;
    var role = String(u.role || '');
    return {
      username: String(u.username || u.email || u.name || ''),
      roleKey: role.toLowerCase(),
      name: String(u.displayName || u.name || u.username || 'Usuário'),
      role: ROLE_LABELS[role.toLowerCase()] || role,
      apps: u.apps || [],
      photo: u.photo || ''
    };
  }

  function resolveUser() {
    var cfg = state.cfg;
    if (Object.prototype.hasOwnProperty.call(cfg, 'user')) return normalizeUser(cfg.user);
    return normalizeUser(rawSessionUser());
  }

  function canSee(def, user) {
    if (def.publico) return true;
    if (!user) return false;
    if (def.roles && def.roles.indexOf(user.roleKey) < 0) return false;
    var a = auth();
    if (def.appAny && a && a.hasApp) {
      try { return def.appAny.some(function (k) { return a.hasApp({ apps: user.apps }, k); }); } catch (e) { return true; }
    }
    if (def.app && a && a.hasApp) {
      try { return a.hasApp({ apps: user.apps }, def.app); } catch (e) { return true; }
    }
    return true;
  }

  function cachedAvatar(user) {
    try {
      var raw = storageGet(AVATAR_KEY);
      if (!raw || !user) return '';
      var o = JSON.parse(raw);
      return (o && o.u === user.username) ? (o.d || '') : '';
    } catch (e) { return ''; }
  }
  function cacheAvatar(user, data) { storageSet(AVATAR_KEY, JSON.stringify({ u: user && user.username, d: data || '' })); }

  function authPost(action, payload) {
    var cfg = global.AGF_AUTH_CONFIG || {};
    if (!cfg.apiUrl) return Promise.reject(new Error('Controle de acesso não configurado.'));
    return fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      redirect: 'follow'
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.ok === false) throw new Error((d && d.error) || 'Não foi possível concluir a operação.');
      return d;
    });
  }

  function muralFetch(method, path, body) {
    var tk = token();
    if (!tk) return Promise.reject(new Error('Sem sessão.'));
    return fetch(String(MURAL_API).replace(/\/+$/, '') + path, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + tk, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) throw new Error(d.error || 'Não foi possível concluir a operação.');
        return d;
      });
    });
  }

  /* ========================================================= 5. COMPONENTE */
  var state = {
    el: null, cfg: null, route: null, def: null, user: null,
    userMenu: null, appsMenu: null,
    pending: 0, timer: null, loadEl: null,
    scrollTicking: false,
    avatarFetched: '',
    wired: false          /* trava anti-duplicacao de listener */
  };

  function buildActions(actions) {
    if (!actions || !actions.length) return '';
    if (actions.length > 2) console.warn('[agf-header] maximo de 2 acoes (regra 4). As excedentes foram ignoradas.');
    return actions.slice(0, 2).map(function (a, i) {
      var icon = UI[a.icon] || '';
      return '<button type="button" class="agf-hd__btn" data-agf-action="' + i + '" title="' + esc(a.label) + '">' +
        icon + '<span class="agf-hd__btn-label">' + esc(a.label) + '</span></button>';
    }).join('');
  }

  function avatarSrc(user) { return user.photo || cachedAvatar(user) || FALLBACK_AVATAR; }

  function buildUser(user) {
    if (!user) return '<span class="agf-hd__slot" aria-hidden="true"></span>';
    var photo = esc(avatarSrc(user));
    return '' +
      '<button type="button" class="agf-hd__avatar" data-agf-usermenu ' +
        'aria-haspopup="menu" aria-expanded="false" aria-label="Sua conta: ' + esc(user.name) + '">' +
        '<img src="' + photo + '" alt="" data-agf-avatar-img></button>' +
      '<div class="agf-hd__menu agf-hd__menu--user" role="menu" data-open="false" data-agf-usermenu-panel>' +
        '<div class="agf-hd__menu-head"><img src="' + photo + '" alt="" data-agf-avatar-img>' +
          '<span><span class="agf-hd__menu-name">' + esc(user.name) + '</span>' +
          '<br><span class="agf-hd__menu-role">' + esc(user.role) + '</span></span></div>' +
        '<button type="button" class="agf-hd__menu-item" role="menuitem" data-agf-photo>' + UI.camera + 'Alterar foto</button>' +
        '<button type="button" class="agf-hd__menu-item" role="menuitem" data-agf-password>' + UI.key + 'Alterar senha</button>' +
        '<div class="agf-hd__menu-sep"></div>' +
        '<button type="button" class="agf-hd__menu-item agf-hd__menu-item--danger" role="menuitem" data-agf-logout>' +
          UI.exit + 'Sair</button>' +
      '</div>';
  }

  var EXT_BY_HREF = {};
  EXTERNOS.forEach(function (e) { EXT_BY_HREF[e.href] = e; });

  function menuMark(glyph, accent) {
    return '<span class="agf-hd__menu-mark" style="background:' + accent + '">' + markSVG(glyph) + '</span>';
  }
  function menuInternal(key, r, current) {
    return '<a class="agf-hd__menu-item" role="menuitem" href="' + esc(key) + '/"' +
      (key === current ? ' aria-current="page"' : '') + '>' + menuMark(r.glyph, r.accent) + esc(r.title) + '</a>';
  }
  function menuExternal(e, newTab) {
    return '<a class="agf-hd__menu-item" role="menuitem" href="' + esc(e.href) + '/"' +
      (newTab ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + menuMark(e.glyph, e.accent) + esc(e.title) +
      (newTab ? '<span class="agf-hd__menu-ext" title="Abre em nova aba">' + UI.external + '<span class="agf-hd__sr">(abre em nova aba)</span></span>' : '') +
      '</a>';
  }

  /* Ordem fixa do MENU. Rota oculta (Gerencial) so aparece quando e a rota atual. */
  function buildApps(current, user) {
    var newTab = global.matchMedia && global.matchMedia('(min-width: 768px)').matches;
    var html = menuInternal('/agf', ROUTES['/agf'], current);
    var listed = { '/agf': true };
    MENU.forEach(function (g) {
      var rows = '';
      g.items.forEach(function (key) {
        listed[key] = true;
        var r = ROUTES[key];
        if (r) {
          if (key !== current && (r.oculto || !canSee(r, user))) return;
          rows += menuInternal(key, r, current);
          return;
        }
        var e = EXT_BY_HREF[key];
        if (e && canSee({ publico: e.publico, app: e.app, appAny: e.appAny }, user)) rows += menuExternal(e, newTab);
      });
      if (rows) html += '<div class="agf-hd__menu-sep"></div><div class="agf-hd__menu-label">' + esc(g.group) + '</div>' + rows;
    });
    if (current && !listed[current] && ROUTES[current]) {
      html = menuInternal(current, ROUTES[current], current) + html;
    }
    return '<div class="agf-hd__menu agf-hd__menu--apps" role="menu" data-open="false" data-agf-appsmenu-panel>' +
      html + '</div>';
  }

  function render() {
    var cfg = state.cfg, def = state.def;
    state.user = resolveUser();
    state.el.className = 'agf-hd';
    state.el.setAttribute('data-agf-route', state.route);
    state.el.setAttribute('role', 'banner');
    state.el.style.setProperty('--agf-hd-accent', def.accent);

    var shortTitle = def.short || def.title;
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
            '<span class="agf-hd__title" title="' + esc(def.title) + '">' +
              '<span class="agf-hd__t-full">' + esc(def.title) + '</span>' +
              '<span class="agf-hd__t-short" aria-hidden="true">' + esc(shortTitle) + '</span>' +
            '</span>' +
            '<span class="agf-hd__sub">' + esc(SUBTITLE) + '</span>' +
          '</span>' +
        '</div>' +
        '<span class="agf-hd__spacer" data-agf-context>' + (cfg.context || '') + '</span>' +
        '<span class="agf-hd__actions" data-agf-actions>' + buildActions(cfg.actions) + '</span>' +
        '<span class="agf-hd__rule" aria-hidden="true"></span>' +
        '<button type="button" class="agf-hd__icon-btn" data-agf-refresh aria-label="Atualizar" title="Atualizar">' + UI.refresh + '</button>' +
        '<span class="agf-hd__user">' + buildUser(state.user) + '</span>' +
        buildApps(state.route, state.user) +
      '</div>';

    state.loadEl = state.el.querySelector('.agf-hd__load');
    state.userMenu = state.el.querySelector('[data-agf-usermenu-panel]');
    state.appsMenu = state.el.querySelector('[data-agf-appsmenu-panel]');
    wire();
    onScroll();
    refreshAvatar();
  }

  /* Busca a foto uma vez por usuario: primeiro no agf-mural-api (fonte unica);
     sem foto la, procura no Apps Script e, se achar, copia para o D1 (migracao). */
  function refreshAvatar() {
    var user = state.user;
    if (!user || user.photo || !user.username) return;
    if (state.avatarFetched === user.username) return;
    if (!token()) return;
    state.avatarFetched = user.username;
    function aplicar(data) { cacheAvatar(user, data); paintAvatar(data); }
    function doAppsScript(migrar) {
      return authPost('getMyAvatar', { token: token() }).then(function (d) {
        var data = (d && d.avatar) || '';
        aplicar(data);
        if (migrar && data) muralFetch('PUT', '/api/mural/eu/avatar', { avatar: data, origem: 'migracao' }).catch(function () {});
      });
    }
    muralFetch('GET', '/api/mural/eu/avatar').then(function (d) {
      if (d && d.avatar) aplicar(d.avatar);
      else return doAppsScript(true);
    }).catch(function () {
      return doAppsScript(false);
    }).catch(function () { /* sem foto: segue o avatar generico */ });
  }

  function paintAvatar(data) {
    if (!state.el) return;
    var src = data || FALLBACK_AVATAR;
    Array.prototype.forEach.call(state.el.querySelectorAll('[data-agf-avatar-img]'), function (img) { img.src = src; });
  }

  /* ============================================================ 6. EVENTOS */
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
      var first = panel.querySelector('[role="menuitem"]');
      if (first && global.matchMedia && global.matchMedia('(hover: none)').matches === false) {
        /* foco no primeiro item so para teclado/mouse; no toque rola a tela */
        try { first.focus({ preventScroll: true }); } catch (e) {}
      }
    }
  }

  /* O listener e amarrado UMA vez no elemento de montagem. Le state.cfg em
     tempo de clique, entao continua correto depois de qualquer re-render. */
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
      if (hit('[data-agf-photo]'))    { closeMenus(); (typeof cfg.onChangePhoto === 'function' ? cfg.onChangePhoto : changePhoto)(); return; }
      if (hit('[data-agf-password]')) { closeMenus(); (typeof cfg.onChangePassword === 'function' ? cfg.onChangePassword : openPassword)(); return; }
      if (hit('[data-agf-logout]'))   { closeMenus(); (typeof cfg.onLogout === 'function' ? cfg.onLogout : logout)(); return; }
    });
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
    if (ev.key !== 'Escape' || !state.el) return;
    if (dlg && dlg.getAttribute('data-open') === 'true') { closePassword(); return; }
    closeMenus();
  });
  global.addEventListener('scroll', onScroll, { passive: true });

  /* Sessao confirmada pelo guard depois do primeiro render: atualiza o slot. */
  global.addEventListener('agf:auth-ready', function () {
    if (!state.el || Object.prototype.hasOwnProperty.call(state.cfg, 'user')) return;
    render();
  });

  /* ========================================================== 7. CONTA === */
  function logout() {
    var a = auth();
    var done = function () { global.location.href = LOGOUT_URL; };
    if (a && a.logout) Promise.resolve(a.logout()).then(done, done);
    else done();
  }

  /* Foto: recorta quadrado, reduz para 128px JPEG e envia. Mesmo contrato do CRM. */
  var fileInput = null;
  function changePhoto() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/png,image/jpeg,image/webp';
      fileInput.hidden = true;
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) return;
        if (!/^image\/(png|jpeg|webp)$/i.test(f.type)) { toast('Use uma imagem PNG, JPEG ou WebP.', true); return; }
        if (f.size > 8 * 1024 * 1024) { toast('Imagem muito grande. Escolha um arquivo de até 8 MB.', true); return; }
        var img = new Image();
        img.onload = function () {
          try {
            var S = 128, c = document.createElement('canvas');
            c.width = S; c.height = S;
            var side = Math.min(img.width, img.height);
            c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
            var data = c.toDataURL('image/jpeg', 0.82);
            if (data.length > 45000) data = c.toDataURL('image/jpeg', 0.6);
            var user = state.user;
            toast('Enviando foto…');
            AgfHeader.loading.start();
            /* Grava no agf-mural-api (fonte unica) e mantem a copia no Apps Script.
               Basta um dos dois dar certo para a foto aparecer. */
            var mural = muralFetch('PUT', '/api/mural/eu/avatar', { avatar: data }).then(function () { return true; }, function (e) { return e; });
            var apps = authPost('uploadMyAvatar', { token: token(), avatarData: data }).then(function () { return true; }, function (e) { return e; });
            Promise.all([mural, apps]).then(function (res) {
              if (res[0] === true || res[1] === true) {
                cacheAvatar(user, data); paintAvatar(data); toast('Foto atualizada.');
                try { global.dispatchEvent(new CustomEvent('agf:avatar-changed', { detail: { username: user.username } })); } catch (e) {}
              } else {
                toast((res[0] && res[0].message) || 'Não foi possível atualizar a foto.', true);
              }
            }).then(function () { AgfHeader.loading.done(); });
          } catch (e) { toast('Não foi possível processar a imagem.', true); }
          finally { URL.revokeObjectURL(img.src); }
        };
        img.onerror = function () { URL.revokeObjectURL(img.src); toast('Arquivo de imagem inválido.', true); };
        img.src = URL.createObjectURL(f);
      });
    }
    fileInput.click();
  }

  /* Senha: dialogo proprio, namespaced, montado uma vez no body. */
  var dlg = null, lastFocus = null;
  function buildPassword() {
    dlg = document.createElement('div');
    dlg.className = 'agf-hd-dlg';
    dlg.setAttribute('data-open', 'false');
    dlg.innerHTML = '' +
      '<form class="agf-hd-dlg__card" role="dialog" aria-modal="true" aria-labelledby="agfHdPwdTitle" novalidate>' +
        '<div class="agf-hd-dlg__head"><strong id="agfHdPwdTitle">Alterar senha</strong>' +
          '<button type="button" class="agf-hd-dlg__x" data-agf-dlg-close aria-label="Fechar">' + UI.close + '</button></div>' +
        '<div class="agf-hd-dlg__body">' +
          '<div class="agf-hd-dlg__err" role="alert" data-agf-dlg-err></div>' +
          '<label class="agf-hd-dlg__field"><span>Senha atual</span><input type="password" name="cur" autocomplete="current-password" required></label>' +
          '<label class="agf-hd-dlg__field"><span>Nova senha</span><input type="password" name="nv" autocomplete="new-password" minlength="8" required>' +
            '<small>Mínimo de 8 caracteres. Ao confirmar, você sai de todos os dispositivos e entra de novo.</small></label>' +
          '<label class="agf-hd-dlg__field"><span>Confirmar nova senha</span><input type="password" name="cf" autocomplete="new-password" minlength="8" required></label>' +
          '<div class="agf-hd-dlg__actions">' +
            '<button type="button" class="agf-hd-dlg__btn" data-agf-dlg-close>Cancelar</button>' +
            '<button type="submit" class="agf-hd-dlg__btn agf-hd-dlg__btn--primary">Alterar senha</button>' +
          '</div>' +
        '</div>' +
      '</form>';
    document.body.appendChild(dlg);

    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || (e.target.closest && e.target.closest('[data-agf-dlg-close]'))) closePassword();
    });
    var form = dlg.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = dlg.querySelector('[data-agf-dlg-err]');
      var cur = form.cur.value, nv = form.nv.value, cf = form.cf.value;
      var fail = function (m) { err.textContent = m; err.setAttribute('data-on', 'true'); };
      err.setAttribute('data-on', 'false');
      if (!cur) return fail('Informe a senha atual.');
      if (nv.length < 8) return fail('A nova senha deve ter ao menos 8 caracteres.');
      if (nv !== cf) return fail('A confirmação não confere com a nova senha.');
      var save = form.querySelector('[type="submit"]');
      save.disabled = true;
      save.textContent = 'Alterando…';
      authPost('changeMyPassword', { token: token(), currentPassword: cur, newPassword: nv })
        .then(function () {
          closePassword();
          toast('Senha alterada. Entre novamente com a nova senha.');
          var a = auth();
          if (a && a.clearSession) a.clearSession();
          setTimeout(function () { global.location.href = PASSWORD_URL; }, 900);
        })
        .catch(function (ex) { fail(ex.message || 'Não foi possível alterar a senha.'); })
        .then(function () { save.disabled = false; save.textContent = 'Alterar senha'; });
    });
  }
  function openPassword() {
    if (!dlg) buildPassword();
    lastFocus = document.activeElement;
    dlg.querySelector('form').reset();
    dlg.querySelector('[data-agf-dlg-err]').setAttribute('data-on', 'false');
    dlg.setAttribute('data-open', 'true');
    setTimeout(function () { var f = dlg.querySelector('input'); if (f) f.focus(); }, 40);
  }
  function closePassword() {
    if (!dlg) return;
    dlg.setAttribute('data-open', 'false');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  /* Aviso curto, fora do fluxo da pagina. */
  var toastEl = null, toastTimer = null;
  function toast(msg, isErr) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'agf-hd-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.setAttribute('data-err', isErr ? 'true' : 'false');
    toastEl.setAttribute('data-on', 'true');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.setAttribute('data-on', 'false'); }, isErr ? 4200 : 2600);
  }

  /* ====================================================== 8. CARREGAMENTO
     Contador de requisicoes. So aparece se passar de 400ms.
     Amarrar a chamadas reais, nunca a animacao decorativa.
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

  /* ======================================================== 9. API PUBLICA */
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

    if (state.el && state.el !== el) state.wired = false;
    state.el = el;
    state.cfg = cfg;
    state.route = route;
    state.def = def;
    render();

    if (!state.user && def.publico === false) {
      console.warn('[agf-header] rota privada ' + route + ' sem sessao no momento da montagem. ' +
        'O slot do usuario fica vazio ate o guard confirmar a sessao.');
    }
    return AgfHeader;
  }

  function setUser(user) {
    if (!state.el) return;
    state.cfg.user = user || null;
    render();
  }

  function setTitle(text, shortText) {
    if (!state.el) return;
    var f = state.el.querySelector('.agf-hd__t-full');
    var sh = state.el.querySelector('.agf-hd__t-short');
    if (f) f.textContent = text;
    if (sh) sh.textContent = shortText || text;
  }

  /* Troca as acoes sem re-renderizar a barra (ex.: Admin so para admin). */
  function setActions(actions) {
    if (!state.el) return;
    state.cfg.actions = actions || [];
    var box = state.el.querySelector('[data-agf-actions]');
    if (box) box.innerHTML = buildActions(state.cfg.actions);
  }

  /* Zona B: contexto curto da pagina (ex.: data e dia util no Portal). HTML confiavel do app. */
  function setContext(html) {
    if (!state.el) return;
    state.cfg.context = html || '';
    var box = state.el.querySelector('[data-agf-context]');
    if (box) box.innerHTML = state.cfg.context;
  }

  var AgfHeader = {
    VERSION: VERSION,
    ROUTES: ROUTES,
    EXTERNOS: EXTERNOS,
    MENU: MENU,
    GLYPHS: GLYPHS,
    mark: markSVG,
    setContext: setContext,
    mount: mount,
    setUser: setUser,
    setTitle: setTitle,
    setActions: setActions,
    toast: toast,
    loading: loading,
    close: closeMenus
  };

  global.AgfHeader = AgfHeader;

  /* Montagem automatica quando existe [data-agf-header] no HTML.
     App que precise de acoes ou handlers proprios chama mount() manualmente. */
  function auto() {
    var el = document.querySelector('[data-agf-header]');
    if (el && !state.el) mount({ target: el });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();

})(window, document);
