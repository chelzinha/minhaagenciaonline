/* =====================================================
   CALCULADORA BALCÃO AGF — API Client (Worker agf-balcao-api)
   Mesmos métodos da versão Apps Script: config, cep, cotar, salvarRascunho.
   ===================================================== */

const BalcaoApi = (function () {
  async function call(caminho, opcoes, tentativa) {
    opcoes = opcoes || {};
    tentativa = tentativa || 1;
    if (!BALCAO_CONFIG.API_URL) throw new Error('API_URL não configurada em balcao/js/config.js');

    const token = window.AgfAuth ? window.AgfAuth.getToken() : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs || 30000);
    let resp;
    try {
      resp = await fetch(BALCAO_CONFIG.API_URL + caminho, {
        method: opcoes.method || 'GET',
        headers: Object.assign({ Authorization: 'Bearer ' + token }, opcoes.body ? { 'Content-Type': 'application/json' } : {}),
        body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
        signal: controller.signal
      });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? 'O servidor demorou demais para responder. Tente novamente.' : 'Sem conexão com o servidor do Balcão.');
    } finally {
      clearTimeout(timer);
    }

    let json = null;
    try { json = await resp.json(); } catch (e) { /* resposta sem JSON */ }

    // 401: só volta ao login se o controle de acesso confirmar que a sessão acabou.
    if (resp.status === 401 && window.AgfAuth) {
      let sessaoValida = false;
      try { await window.AgfAuth.validate(); sessaoValida = true; }
      catch (e) {
        if (e && e.code === 'rejected') { window.AgfAuth.redirectToLogin('sessao'); throw new Error('Sessão expirada. Entre novamente.'); }
      }
      if (sessaoValida && tentativa === 1) return call(caminho, opcoes, 2);
      throw new Error('Não foi possível confirmar seu acesso agora. Tente de novo em instantes.');
    }
    if (!resp.ok || !json || json.ok === false) throw new Error((json && json.erro) || ('Erro ' + resp.status + ' no servidor do Balcão.'));
    return json.data;
  }

  return {
    config: () => call('/config'),
    cep: (cep) => call('/cep?cep=' + encodeURIComponent(String(cep || '').replace(/\D/g, ''))),
    cotar: (payload) => call('/cotar', { method: 'POST', body: { payload: payload }, timeoutMs: 45000 }),
    salvarRascunho: (payload) => call('/rascunhos', { method: 'POST', body: { payload: payload } })
  };
})();
