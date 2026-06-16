/* =====================================================
   APP ETIQUETAS — API Client
   =====================================================
   Cliente HTTP que conversa com o Apps Script Web App.

   IMPORTANTE — CORS:
   Apps Script Web App não suporta preflight CORS. Qualquer
   request com Content-Type 'application/json' dispara
   preflight OPTIONS, que o GAS não responde, e o navegador
   bloqueia.

   A solução padrão (e oficial pela documentação do GAS) é
   usar Content-Type 'text/plain' e enviar JSON serializado
   no body. O backend lê de e.postData.contents e parseia.
   Sem preflight, sem header customizado, sem CORS bloqueado.
   ===================================================== */

const Api = (function () {

  function getSessionToken() {
    return localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SESSION_TOKEN) || '';
  }
  function setSessionToken(token) {
    if (token) localStorage.setItem(APP_CONFIG.STORAGE_KEYS.SESSION_TOKEN, token);
    else localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
  }
  function getCachedClient() {
    try {
      const raw = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CLIENT);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setCachedClient(client) {
    if (client) localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CLIENT, JSON.stringify(client));
    else localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.CLIENT);
  }

  /**
   * Chamada genérica ao backend.
   * @param {string} action - nome da action no roteador
   * @param {object} params - parâmetros adicionais (sessionToken é injetado)
   * @returns {Promise<object>} resposta.data ou throw com erro
   */
  async function call(action, params, options) {
    if (!APP_CONFIG.GAS_WEBAPP_URL || APP_CONFIG.GAS_WEBAPP_URL.indexOf('__COLE_AQUI') >= 0) {
      throw new Error('GAS_WEBAPP_URL não configurada em js/config.js');
    }

    const body = Object.assign({
      action: action,
      sessionToken: getSessionToken()
    }, params || {});

    const timeoutMs = Number((options && options.timeoutMs) || APP_CONFIG.API_TIMEOUT_MS || 120000);
    const hasAbort = typeof AbortController !== 'undefined';
    const controller = hasAbort ? new AbortController() : null;
    let timeoutId = null;
    let timedOut = false;

    if (controller && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        try { controller.abort(); } catch (e) {}
      }, timeoutMs);
    }

    let resp;
    try {
      const fetchOpts = {
        method: 'POST',
        // text/plain evita preflight CORS
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      };
      if (controller) fetchOpts.signal = controller.signal;
      resp = await fetch(APP_CONFIG.GAS_WEBAPP_URL, fetchOpts);
    } catch (e) {
      if (timedOut || (e && e.name === 'AbortError')) {
        throw new Error('O servidor demorou demais para responder. Tente novamente. Se for reimpressão, verifique se o PDF está salvo no Drive.');
      }
      throw new Error('Falha de rede ao contatar o servidor: ' + (e.message || e));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    let json;
    try {
      json = await resp.json();
    } catch (e) {
      throw new Error('Resposta inválida do servidor (não é JSON).');
    }

    if (!json || typeof json !== 'object') {
      throw new Error('Resposta vazia do servidor.');
    }

    if (json.ok === false) {
      const err = new Error(json.error || 'Erro desconhecido');
      err.action = action;
      err.cwsCode = json.cwsCode;
      err.validationErrors = json.validationErrors;

      // Sessão expirada -> limpa storage e reload
      if (json.error && /sess[ãa]o.*(inv[áa]lida|expir)/i.test(json.error)) {
        setSessionToken('');
        setCachedClient('');
      }
      throw err;
    }

    return json.data;
  }

  // ============ ATALHOS POR AÇÃO ============
  return {
    getSessionToken,
    setSessionToken,
    getCachedClient,
    setCachedClient,

    ping: () => call('ping'),

    login: async (login, senha) => {
      const data = await call('login', { login: login, senha: senha });
      setSessionToken(data.sessionToken);
      setCachedClient(data.client);
      return data;
    },

    me: () => call('me'),

    logout: async () => {
      try { await call('logout'); } catch (e) {}
      setSessionToken('');
      setCachedClient('');
    },

    cep: (cep) => call('cep', { cep: cep }),

    cotar: (payload) => call('cotar', { payload: payload }),

    cotarTodos: (payload) => call('cotarTodos', { payload: payload }),

    criarEtiqueta: (payload) => call('criarEtiqueta', { payload: payload }),

    criarEtiquetaDireta: (payload) => call('criarEtiquetaDireta', { payload: payload }),

    cancelarEtiqueta: (idRegistro) => call('cancelarEtiqueta', { idRegistro: idRegistro }),

    reimprimirEtiqueta: (idRegistro) => call('reimprimirEtiqueta', { idRegistro: idRegistro }, { timeoutMs: APP_CONFIG.REIMPRIMIR_TIMEOUT_MS || 115000 }),

    listarHistorico: (filtros) => call('listarHistorico', { filtros: filtros || {} }),

    detalheEtiqueta: (idRegistro) => call('detalheEtiqueta', { idRegistro: idRegistro }),

    rastrearObjeto: (codigoObjeto) => call('rastrearObjeto', { codigoObjeto: codigoObjeto }),

    buscarDestinatarios: (q, limit, uf) => call('buscarDestinatarios', { q: q, limit: limit || 10, uf: uf || '' }),

    listarDestinatarios: (filtros) => call('listarDestinatarios', { filtros: filtros || {} }),

    salvarDestinatario: (payload) => call('salvarDestinatario', { payload: payload || {} }),

    excluirDestinatario: (idDestinatario) => call('excluirDestinatario', { idDestinatario: idDestinatario }),

    importarDestinatariosCsv: (items) => call('importarDestinatariosCsv', { items: items || [] }, { timeoutMs: 120000 }),

    testarTokenCws: () => call('testarTokenCws'),

    diagnostico: () => call('diagnostico')
  };
})();