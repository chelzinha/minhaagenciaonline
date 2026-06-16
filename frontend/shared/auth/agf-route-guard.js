/* ============================================================
 * Guarda de rota compartilhada.
 * Uso antes do conteúdo protegido:
 *   window.AGF_ACCESS = { roles: ['admin','manager','user'], app: 'crm' };
 * O campo app é opcional para preservar páginas antigas.
 * ============================================================ */
(function (global) {
  'use strict';
  const auth = global.AgfAuth;
  const access = global.AGF_ACCESS || {};
  const roles = Array.isArray(access.roles) ? access.roles : [];
  const appKey = String(access.app || '').trim().toLowerCase();
  const appsAny = Array.isArray(access.appsAny) ? access.appsAny.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean) : [];

  function fail(reason) {
    if (auth && (reason === 'sessao' || reason === 'login')) auth.clearSession();
    if (auth) auth.redirectToLogin(reason || 'login');
  }

  function activateProtectedFrames() {
    document.querySelectorAll('iframe[data-agf-frame-src]').forEach((frame) => {
      if (!frame.getAttribute('src')) frame.setAttribute('src', frame.getAttribute('data-agf-frame-src'));
    });
  }

  function canAccess(user) {
    return Boolean(user) &&
      auth.hasRole(roles, user.role) &&
      (!appKey || auth.hasApp(user, appKey)) &&
      (!appsAny.length || auth.hasAnyApp(user, appsAny));
  }

  function ready(result) {
    document.documentElement.classList.remove('agf-auth-pending');
    document.documentElement.classList.add('agf-auth-ready');
    activateProtectedFrames();
    global.dispatchEvent(new CustomEvent('agf:auth-ready', { detail: result || {} }));
  }

  if (!auth || !auth.isConfigured()) {
    fail('config');
    return;
  }

  const local = auth.getLocalSession();
  const localUser = (local && local.user) || (local && local.payload) || null;
  if (!local || !canAccess(localUser)) {
    fail(local ? 'perfil' : 'login');
    return;
  }

  /* ------------------------------------------------------------
   * Revalidação inteligente (performance):
   *  - Sempre que o backend confirma a sessão, o cliente grava um
   *    carimbo de horário (AgfAuth.markValidated / getLastValidatedAt).
   *  - Se a sessão local é válida E foi confirmada pelo servidor há
   *    menos de AGF_AUTH_CONFIG.revalidateTtlMs (padrão 10 min), a
   *    página renderiza IMEDIATAMENTE e a validação roda em segundo
   *    plano. Se o servidor recusar, o redirect acontece igual a hoje.
   *  - Sem carimbo recente (primeiro acesso, outro dispositivo, TTL
   *    vencido), o comportamento é EXATAMENTE o anterior: bloqueia
   *    com "Validando acesso…" até o servidor responder.
   *  - Segurança preservada: toda chamada de dados continua sendo
   *    validada token-a-token no Apps Script; uma sessão revogada é
   *    barrada no backend e derrubada aqui em, no máximo, o TTL.
   * ------------------------------------------------------------ */
  const ttlMs = Number((global.AGF_AUTH_CONFIG && global.AGF_AUTH_CONFIG.revalidateTtlMs) || 10 * 60 * 1000);
  const lastOk = (auth.getLastValidatedAt && auth.getLastValidatedAt()) || 0;
  const freshEnough = ttlMs > 0 && lastOk > 0 && (Date.now() - lastOk) < ttlMs;

  if (freshEnough) {
    ready({ user: localUser, cached: true });
    /* Confirmação muito recente (< 45 s): não dispara nova validação.
     * Evita a tempestade de validates paralelos quando o portal abre
     * página pai + iframes ao mesmo tempo, poupando quota do Apps Script. */
    if ((Date.now() - lastOk) < 45000) return;
    /* Fail-soft: em segundo plano, só derruba a sessão se o SERVIDOR
     * recusar explicitamente (err.code === 'rejected') ou se o perfil
     * perder permissão. Timeout, queda de rede e principalmente o abort
     * do fetch ao navegar para outra página NÃO podem apagar a sessão —
     * era isso que deslogava o usuário a cada navegação rápida. Sem
     * confirmação, o carimbo não é renovado: vencido o TTL, o fluxo
     * bloqueante clássico revalida com rigor total. */
    let leaving = false;
    global.addEventListener('pagehide', () => { leaving = true; });
    auth.validate({ timeoutMs: 12000 })
      .then((result) => {
        if (!canAccess(result.user)) { fail('perfil'); return; }
        global.dispatchEvent(new CustomEvent('agf:auth-revalidated', { detail: result || {} }));
      })
      .catch((err) => {
        if (leaving) return;
        if (err && err.code === 'rejected') fail('sessao');
        /* transitório: mantém a sessão e tenta no próximo carregamento */
      });
    return;
  }

  document.documentElement.classList.add('agf-auth-pending');
  auth.validate({ timeoutMs: 12000 })
    .then((result) => {
      if (!canAccess(result.user)) throw new Error('Perfil sem permissão.');
      ready(result);
    })
    .catch(() => fail('sessao'));
})(window);
