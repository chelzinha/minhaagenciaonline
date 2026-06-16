/* ============================================================
 * AGF José Bonifácio — cliente de autenticação compartilhado
 * ------------------------------------------------------------
 * Mantém sessão persistente no navegador até logout explícito,
 * revogação administrativa ou expiração configurada no backend.
 * Apps Script recebe text/plain para evitar preflight CORS.
 * ============================================================ */
(function (global) {
  'use strict';

  const cfg = global.AGF_AUTH_CONFIG || {};

  function isConfigured() {
    return Boolean(cfg.apiUrl && !/COLE_AQUI|SEU_DEPLOY|__COLE_AQUI/i.test(cfg.apiUrl));
  }

  function storageGet(key) {
    try { return global.localStorage.getItem(key) || ''; } catch (err) { return ''; }
  }

  function storageSet(key, value) {
    try {
      if (value) global.localStorage.setItem(key, String(value));
      else global.localStorage.removeItem(key);
    } catch (err) {}
  }

  function setSessionCookie(value) {
    try {
      const name = cfg.cookieName || 'agf_jb_session';
      if (value) document.cookie = name + '=' + encodeURIComponent(String(value)) + '; Path=/; Max-Age=315360000; SameSite=Lax; Secure';
      else document.cookie = name + '=; Path=/; Max-Age=0; SameSite=Lax; Secure';
    } catch (err) {}
  }

  function getToken() { return storageGet(cfg.storageKey); }
  function setToken(value) { storageSet(cfg.storageKey, value); setSessionCookie(value); }

  function getCachedUser() {
    try {
      const raw = storageGet(cfg.userStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  function setCachedUser(user) {
    try { storageSet(cfg.userStorageKey, user ? JSON.stringify(user) : ''); } catch (err) {}
  }

  function clearSession() {
    setToken('');
    setCachedUser(null);
    markValidated(0);
  }

  /* Carimbo da última confirmação de sessão pelo servidor (usado pela
   * guarda de rota para revalidação em segundo plano). */
  function validatedAtKey() { return (cfg.storageKey || 'agf_jb_session_v1') + '_validated_at'; }
  function markValidated(ts) { storageSet(validatedAtKey(), ts ? String(ts) : ''); }
  function getLastValidatedAt() {
    const raw = storageGet(validatedAtKey());
    const value = Number(raw || 0);
    return isFinite(value) ? value : 0;
  }

  function parseJwtPayload(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) return null;
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(global.atob(padded), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    } catch (err) { return null; }
  }

  function getLocalSession() {
    const token = getToken();
    const payload = parseJwtPayload(token);
    if (!token || !payload || !payload.role || !payload.sub) return null;
    if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return { token, payload, user: getCachedUser() };
  }

  function normalizeRoles(roles) {
    if (!roles) return [];
    return Array.isArray(roles) ? roles.map(String) : [String(roles)];
  }

  function hasRole(roles, role) {
    const allowed = normalizeRoles(roles);
    return !allowed.length || allowed.indexOf(String(role || '')) >= 0;
  }

  function normalizeApps(apps) {
    return (Array.isArray(apps) ? apps : []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  }

  function hasApp(userOrApps, appKey) {
    const key = String(appKey || '').trim().toLowerCase();
    if (!key) return true;
    const apps = Array.isArray(userOrApps) ? userOrApps : ((userOrApps && userOrApps.apps) || []);
    return normalizeApps(apps).indexOf(key) >= 0;
  }

  function hasAnyApp(userOrApps, appKeys) {
    const keys = (Array.isArray(appKeys) ? appKeys : String(appKeys || '').split(','))
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
    return !keys.length || keys.some((key) => hasApp(userOrApps, key));
  }

  function appKeyForPath(pathname) {
    const path = String(pathname || '/').toLowerCase();
    if (path.indexOf('/crm') === 0) return 'crm';
    if (path.indexOf('/intra') === 0) return 'intra';
    if (path.indexOf('/balcao') === 0) return 'balcao';
    if (path.indexOf('/atende') === 0) return 'atende';
    if (path.indexOf('/cep') === 0) return 'cep';
    if (path.indexOf('/sla') === 0) return 'sla';
    if (path.indexOf('/caixa') === 0) return 'caixa';
    if (path.indexOf('/superfrete-admin') === 0) return 'superfrete-admin';
    if (path.indexOf('/reverso-admin') === 0) return 'reverso-admin';
    if (path.indexOf('/reverso-coleta') === 0) return 'reverso-coleta';
    if (path.indexOf('/reverso-expedicao') === 0) return 'reverso-expedicao';
    if (path.indexOf('/nuvemshop') === 0 || path.indexOf('/nuvem') === 0) return 'nuvemshop';
    if (path.indexOf('/app') === 0) return 'app';
    return '';
  }

  /* Erro com código legível por máquina: 'timeout' | 'network' |
   * 'bad-response' (transitórios) e 'rejected' (recusa explícita do
   * servidor). Permite à guarda de rota distinguir falha de rede de
   * sessão realmente inválida. */
  function makeError(message, code) {
    const err = new Error(message);
    err.code = code || 'unknown';
    return err;
  }

  async function post(action, payload, options) {
    if (!isConfigured()) throw new Error('Controle de acesso ainda não configurado. Informe o URL do Apps Script em /shared/auth/agf-auth-config.js.');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = Number((options && options.timeoutMs) || cfg.requestTimeoutMs || 15000);
    let timer = null;
    if (controller && timeoutMs > 0) timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action }, payload || {})),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw makeError('O servidor demorou para responder. Tente novamente.', 'timeout');
      throw makeError('Falha de rede ao contatar o controle de acesso.', 'network');
    } finally {
      if (timer) clearTimeout(timer);
    }
    let data;
    try { data = await response.json(); } catch (err) { throw makeError('O controle de acesso retornou uma resposta inválida.', 'bad-response'); }
    if (!data || typeof data !== 'object') throw makeError('Resposta vazia do controle de acesso.', 'bad-response');
    if (data.ok === false) throw makeError(data.error || 'Não foi possível concluir a autenticação.', 'rejected');
    return data;
  }

  async function login(username, password) {
    const result = await post('login', { username, password, userAgent: global.navigator ? navigator.userAgent : '' });
    if (!result.token || !result.user) throw new Error('Sessão não retornada pelo servidor.');
    setToken(result.token);
    setCachedUser(result.user);
    markValidated(Date.now());
    return result;
  }

  async function validate(options) {
    const token = getToken();
    if (!token) throw new Error('Faça login para continuar.');
    const result = await post('validate', { token }, options);
    if (!result.user) throw new Error('Usuário não identificado.');
    setCachedUser(result.user);
    markValidated(Date.now());
    return result;
  }

  async function logout() {
    const token = getToken();
    try { if (token && isConfigured()) await post('logout', { token }); } catch (err) {}
    clearSession();
  }

  async function getUiConfig() { return post('getUiConfig'); }

  async function saveUiConfig(config) {
    const token = getToken();
    if (!token) throw new Error('Faça login novamente.');
    return post('saveUiConfig', { token, config });
  }

  async function adminListUsers() {
    const token = getToken();
    if (!token) throw new Error('Faça login novamente.');
    return post('adminListUsers', { token });
  }

  async function adminSaveUser(user) {
    const token = getToken();
    if (!token) throw new Error('Faça login novamente.');
    return post('adminSaveUser', Object.assign({ token }, user || {}));
  }

  async function adminRevokeSessions(username) {
    const token = getToken();
    if (!token) throw new Error('Faça login novamente.');
    return post('adminRevokeSessions', { token, username });
  }

  async function adminPurgeSessions() {
    const token = getToken();
    if (!token) throw new Error('Faça login novamente.');
    return post('adminPurgeSessions', { token });
  }

  async function adminSyncCrmResponsaveis() {
    const token = getToken();
    if (!token) throw new Error('Faça login novamente.');
    return post('adminSyncCrmResponsaveis', { token });
  }

  function isAllowedPath(pathname, userOrRole, explicitApps) {
    const path = String(pathname || '/').toLowerCase();
    const role = typeof userOrRole === 'string' ? userOrRole : String((userOrRole && userOrRole.role) || '');
    const apps = Array.isArray(explicitApps) ? explicitApps : ((userOrRole && userOrRole.apps) || []);
    if (path.indexOf('/agf/icones') === 0 || path.indexOf('/agf/usuarios') === 0) return role === 'admin';
    if (path.indexOf('/agf') === 0) return true;
    if (path.indexOf('/reverso-interno') === 0) return hasAnyApp(apps, ['reverso-admin', 'reverso-coleta', 'reverso-expedicao']);
    const appKey = appKeyForPath(path);
    if (!appKey) return false;
    if (appKey === 'intra' && role !== 'admin' && role !== 'manager') return false;
    return hasApp(apps, appKey);
  }

  function redirectToLogin(reason) {
    const path = global.location ? global.location.pathname + global.location.search + global.location.hash : '/';
    const target = (cfg.portalUrl || '/agf/') + '?next=' + encodeURIComponent(path) + (reason ? '&reason=' + encodeURIComponent(reason) : '');
    if (global.location) global.location.replace(target);
  }

  global.AgfAuth = Object.freeze({
    isConfigured, getToken, setToken, clearSession, parseJwtPayload, getLocalSession,
    markValidated, getLastValidatedAt,
    hasRole, hasApp, hasAnyApp, appKeyForPath, login, validate, logout, getCachedUser, getUiConfig, saveUiConfig,
    adminListUsers, adminSaveUser, adminRevokeSessions, adminPurgeSessions, adminSyncCrmResponsaveis,
    isAllowedPath, redirectToLogin
  });
})(window);
