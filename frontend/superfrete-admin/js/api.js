/* =====================================================
   AGF SuperFrete Admin — API Client
   ===================================================== */

const SfAdminApi = (function () {
  function getWebAppUrl() {
    return localStorage.getItem(SF_ADMIN_CONFIG.STORAGE_KEYS.WEBAPP_URL) || SF_ADMIN_CONFIG.GAS_WEBAPP_URL;
  }

  function setWebAppUrl(url) {
    const clean = String(url || '').trim();
    if (!clean || !/\/exec$/.test(clean)) throw new Error('Cole a URL do Web App terminando em /exec.');
    localStorage.setItem(SF_ADMIN_CONFIG.STORAGE_KEYS.WEBAPP_URL, clean);
    return clean;
  }

  async function call(action, params, options) {
    const url = getWebAppUrl();
    if (!url || url.indexOf('__COLE_AQUI') >= 0) {
      throw new Error('URL do Web App não configurada. Cole a URL terminando em /exec.');
    }

    const timeoutMs = Number((options && options.timeoutMs) || 120000);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = null;
    let timedOut = false;

    if (controller && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try { controller.abort(); } catch (e) {}
      }, timeoutMs);
    }

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action }, params || {})),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
    } catch (e) {
      if (timedOut || (e && e.name === 'AbortError')) {
        throw new Error('O servidor demorou demais para responder. Tente novamente.');
      }
      throw new Error('Falha de rede ao contatar o servidor: ' + (e.message || e));
    } finally {
      if (timer) clearTimeout(timer);
    }

    let json;
    try {
      json = await resp.json();
    } catch (e) {
      throw new Error('Resposta inválida do servidor. O retorno não é JSON.');
    }

    if (!json || typeof json !== 'object') throw new Error('Resposta vazia do servidor.');
    if (json.ok === false) throw new Error(json.error || 'Erro desconhecido no backend.');
    return json.data;
  }

  function auth(action, payload, options) {
    const sessionToken = localStorage.getItem(SF_ADMIN_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
    return call(action, Object.assign({ sessionToken: sessionToken }, payload || {}), options);
  }

  return {
    getWebAppUrl,
    setWebAppUrl,
    health: () => call('sfHealth'),
    login: (login, senha) => call('sfAdminLogin', { login, senha }),
    me: () => auth('sfAdminMe'),
    snapshot: () => auth('sfAdminGetFinancialSnapshot'),
    listClients: () => auth('sfAdminListClients'),
    getClient: (clienteId) => auth('sfAdminGetClient', { clienteId }),
    saveClient: (payload) => auth('sfAdminSaveClient', payload, { timeoutMs: 150000 }),
    uploadClientLogo: (payload) => auth('sfAdminUploadClientLogo', payload, { timeoutMs: 180000 }),
    getClientFinancial: (clienteId) => auth('sfAdminGetClientFinancial', { clienteId }),
    adjustClientBalance: (payload) => auth('sfAdminAdjustClientBalance', payload),
    emissionBootstrap: () => auth('sfAdminEmissionBootstrap'),
    getSuperFreteConfig: () => auth('sfAdminGetSuperFreteConfig'),
    saveSuperFreteConfig: (payload) => auth('sfAdminSaveSuperFreteConfig', payload, { timeoutMs: 150000 }),
    quoteSuperFrete: (payload) => auth('sfAdminQuoteSuperFrete', payload, { timeoutMs: 150000 }),
    lookupCep: (cep) => auth('sfAdminLookupCep', { cep }, { timeoutMs: 60000 }),
    createRealCartOrder: (payload) => auth('sfAdminCreateRealCartOrder', payload, { timeoutMs: 150000 }),
    releasePendingOrderLocal: (orderIdAgf) => auth('sfAdminReleasePendingOrderLocal', { orderIdAgf }, { timeoutMs: 150000 }),
    checkoutRealOrder: (payload) => auth('sfAdminCheckoutRealOrder', payload, { timeoutMs: 180000 }),
    refreshSuperFreteOrder: (orderIdAgf) => auth('sfAdminRefreshSuperFreteOrder', { orderIdAgf }, { timeoutMs: 150000 }),
    getAgfLabelData: (orderIdAgf) => auth('sfAdminGetAgfLabelData', { orderIdAgf }, { timeoutMs: 150000 }),
    getAgfLabelOverlayData: (orderIdAgf) => auth('sfAdminGetAgfLabelOverlayData', { orderIdAgf }, { timeoutMs: 180000 }),
    createSimulatedLabel: (payload) => auth('sfAdminCreateSimulatedLabel', payload, { timeoutMs: 150000 }),
    listLabels: (payload) => auth('sfAdminListLabels', payload || {}),
    registerSuperFreteRecharge: (payload) => auth('sfAdminRegisterSuperFreteRecharge', payload),
    model: () => auth('sfModel')
  };
})();
