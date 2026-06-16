
const Api = (function () {
  function getSessionToken() { return localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SESSION_TOKEN) || ''; }
  function setSessionToken(token) {
    if (token) localStorage.setItem(APP_CONFIG.STORAGE_KEYS.SESSION_TOKEN, token);
    else localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
  }
  function getCachedClient() {
    try { return JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CLIENT) || 'null'); }
    catch (e) { return null; }
  }
  function setCachedClient(client) {
    if (client) localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CLIENT, JSON.stringify(client));
    else localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.CLIENT);
  }
  async function call(action, params) {
    if (!APP_CONFIG.GAS_WEBAPP_URL || APP_CONFIG.GAS_WEBAPP_URL.indexOf('__COLE_AQUI') >= 0) {
      throw new Error('GAS_WEBAPP_URL não configurada em js/config.js');
    }
    const body = Object.assign({ action, sessionToken: getSessionToken() }, params || {});
    const resp = await fetch(APP_CONFIG.GAS_WEBAPP_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow'
    });
    let json;
    try { json = await resp.json(); } catch (e) { throw new Error('Resposta inválida do servidor.'); }
    if (!json || typeof json !== 'object') throw new Error('Resposta vazia do servidor.');
    if (json.ok === false) {
      const err = new Error(json.error || 'Erro desconhecido');
      err.cwsCode = json.cwsCode; err.validationErrors = json.validationErrors;
      if (json.error && /sess[ãa]o|login/i.test(json.error)) {
        setSessionToken(''); setCachedClient('');
      }
      throw err;
    }
    return json.data;
  }
  return {
    getSessionToken, setSessionToken, getCachedClient, setCachedClient,
    ping: () => call('ping'),
    login: async (login, senha) => { const d = await call('login', { login, senha }); setSessionToken(d.sessionToken); setCachedClient(d.client); return d; },
    me: () => call('me'),
    logout: async () => { try { await call('logout'); } catch(e) {} setSessionToken(''); setCachedClient(''); },
    listPedidos: (filtros) => call('listPedidos', { filtros: filtros || {} }),
    getPedido: (orderId) => call('getPedido', { orderId }),
    syncPedidos: (limit) => call('syncPedidos', { limit: limit || 50 }),
    savePedidoReview: (orderId, review) => call('savePedidoReview', { orderId, review }),
    gerarEtiqueta: (orderId, overrides) => call('gerarEtiqueta', { orderId, overrides: overrides || {} }),
    gerarEtiquetaLote: (orderIds, overrides) => call('gerarEtiquetaLote', { orderIds, overrides: overrides || {} }),
    listHistorico: (filtros) => call('listHistoricoNuvem', { filtros: filtros || {} }),
    reimprimirEtiquetaPedido: (orderId) => call('reimprimirEtiquetaPedido', { orderId }),
    reimprimirDeclaracaoPedido: (orderId) => call('reimprimirDeclaracaoPedido', { orderId }),
    exportarDocumentosLote: (orderIds, tipo) => call('exportarDocumentosLote', { orderIds, tipo }),
    gerarPlpLote: (orderIds) => call('gerarPlpLote', { orderIds }),
    excluirEtiquetaPedido: (orderId) => call('excluirEtiquetaPedido', { orderId }),
    syncTrackingPedido: (orderIds) => call('syncTrackingPedido', { orderIds: orderIds || [] })
  };
})();
