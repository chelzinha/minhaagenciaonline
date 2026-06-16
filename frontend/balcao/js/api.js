/* =====================================================
   CALCULADORA BALCÃO AGF — API Client
   ===================================================== */

const BalcaoApi = (function () {
  async function call(action, params, options) {
    if (!BALCAO_CONFIG.GAS_WEBAPP_URL || BALCAO_CONFIG.GAS_WEBAPP_URL.indexOf('__COLE_AQUI') >= 0) {
      throw new Error('GAS_WEBAPP_URL não configurada em balcao/js/config.js');
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
      resp = await fetch(BALCAO_CONFIG.GAS_WEBAPP_URL, {
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

  return {
    config: () => call('balcaoConfig'),
    // /balcao usa action pública e isolada. Não usar action 'cep' do /app, pois ela exige sessão de cliente.
    cep: (cep) => call('balcaoCep', { cep: cep }),
    cotar: (payload) => call('balcaoCotar', { payload: payload }, { timeoutMs: 150000 }),
    salvarRascunho: (payload) => call('balcaoSalvarRascunho', { payload: payload })
  };
})();
