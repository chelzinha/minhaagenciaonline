/* Minhas Postagens Cliente — API */
const SfClientApi = (function () {
  function getWebAppUrl() {
    return localStorage.getItem(SF_CLIENT_CONFIG.STORAGE_KEYS.WEBAPP_URL) || SF_CLIENT_CONFIG.GAS_WEBAPP_URL;
  }
  function setWebAppUrl(url) {
    const clean = String(url || '').trim();
    if (!clean || !/\/exec$/.test(clean)) throw new Error('Cole a URL do Web App terminando em /exec.');
    localStorage.setItem(SF_CLIENT_CONFIG.STORAGE_KEYS.WEBAPP_URL, clean);
    return clean;
  }
  function getSessionToken() { return localStorage.getItem(SF_CLIENT_CONFIG.STORAGE_KEYS.SESSION_TOKEN) || ''; }
  function setSessionToken(token) {
    if (token) localStorage.setItem(SF_CLIENT_CONFIG.STORAGE_KEYS.SESSION_TOKEN, token);
    else localStorage.removeItem(SF_CLIENT_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
  }
  function setUser(user) {
    if (user) localStorage.setItem(SF_CLIENT_CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
    else localStorage.removeItem(SF_CLIENT_CONFIG.STORAGE_KEYS.USER);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(SF_CLIENT_CONFIG.STORAGE_KEYS.USER) || 'null'); }
    catch (e) { return null; }
  }
  async function call(action, params, options) {
    const url = getWebAppUrl();
    if (!url || url.indexOf('__COLE_AQUI') >= 0) throw new Error('URL do Web App não configurada.');
    const timeoutMs = Number((options && options.timeoutMs) || 150000);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = null;
    let timedOut = false;
    if (controller && timeoutMs > 0) {
      timer = setTimeout(() => { timedOut = true; try { controller.abort(); } catch (e) {} }, timeoutMs);
    }
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action }, params || {})),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
    } catch (e) {
      if (timedOut || (e && e.name === 'AbortError')) throw new Error('O servidor demorou demais para responder. Tente novamente.');
      throw new Error('Falha de rede: ' + (e.message || e));
    } finally {
      if (timer) clearTimeout(timer);
    }
    let json;
    try { json = await resp.json(); } catch (e) { throw new Error('Resposta inválida do servidor.'); }
    if (!json || typeof json !== 'object') throw new Error('Resposta vazia do servidor.');
    if (json.ok === false) {
      const err = new Error(json.error || 'Erro desconhecido no backend.');
      err.validationErrors = json.validationErrors || null;
      if (/sess[ãa]o.*expir|sess[ãa]o.*inv/i.test(err.message)) { setSessionToken(''); setUser(null); }
      throw err;
    }
    return json.data;
  }
  function auth(action, payload, options) {
    return call(action, Object.assign({ sessionToken: getSessionToken() }, payload || {}), options);
  }
  return {
    getWebAppUrl,
    setWebAppUrl,
    getSessionToken,
    setSessionToken,
    getUser,
    setUser,
    health: () => call('sfHealth'),
    login: async (login, senha) => {
      const data = await call('sfClientLogin', { login, senha });
      setSessionToken(data.sessionToken);
      setUser(data.user);
      localStorage.setItem(SF_CLIENT_CONFIG.STORAGE_KEYS.LAST_LOGIN, login || '');
      return data;
    },
    me: () => auth('sfClientMe'),
    dashboard: () => auth('sfClientDashboard'),
    bootstrap: () => auth('sfClientEmissionBootstrap'),
    lookupCep: (cep) => auth('sfClientLookupCep', { cep }, { timeoutMs: 60000 }),
    quote: (payload) => auth('sfClientQuoteSuperFrete', payload, { timeoutMs: 150000 }),
    emit: (payload) => auth('sfClientCreateAndCheckoutLabel', payload, { timeoutMs: 240000 }),
    history: () => auth('sfClientListLabels', { limit: 100 }),
    finance: () => auth('sfClientFinancial'),
    refreshOrder: (orderIdAgf) => auth('sfClientRefreshSuperFreteOrder', { orderIdAgf }, { timeoutMs: 150000 }),
    logout: () => { setSessionToken(''); setUser(null); }
  };
})();
