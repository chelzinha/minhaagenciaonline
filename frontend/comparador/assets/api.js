/* api.js - cliente do Worker (rotas /api/comparador). Mesmo padrão de sessão do /balcao. */
const CFG = window.AGFCOMPARADOR_CONFIG || {};

async function chamar(caminho, { method = 'GET', body, timeoutMs = 45000, binario = false } = {}, tentativa = 1) {
  if (!CFG.apiUrl) throw new Error('apiUrl não configurada em comparador/config.js.');
  const token = window.AgfAuth ? window.AgfAuth.getToken() : '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(CFG.apiUrl + caminho, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'O servidor demorou demais para responder. Tente de novo.' : 'Sem conexão com o servidor do Comparador.');
  } finally {
    clearTimeout(timer);
  }
  if (resp.status === 401 && window.AgfAuth) {
    let valida = false;
    try { await window.AgfAuth.validate(); valida = true; } catch (e) {
      if (e && e.code === 'rejected') { window.AgfAuth.redirectToLogin('sessao'); throw new Error('Sessão expirada. Entre novamente.'); }
    }
    if (valida && tentativa === 1) return chamar(caminho, { method, body, timeoutMs, binario }, 2);
    throw new Error('Não foi possível confirmar seu acesso agora. Tente de novo em instantes.');
  }
  if (binario && resp.ok) return resp;
  if (binario && !resp.ok && (resp.headers.get('content-type') || '').includes('text/html')) return resp;
  let json = null;
  try { json = await resp.json(); } catch (e) { /* sem JSON */ }
  if (!resp.ok || !json || json.ok === false) {
    const err = new Error((json && json.erro) || ('Erro ' + resp.status + ' no servidor do Comparador.'));
    err.codigo = json && json.codigo; err.status = resp.status;
    throw err;
  }
  return json.data;
}

export const Api = {
  config: () => chamar('/config'),
  lote: (payload) => chamar('/lote', { method: 'POST', body: payload, timeoutMs: 60000 }),
  pdf: (relatorio) => chamar('/pdf', { method: 'POST', body: { relatorio }, timeoutMs: 90000, binario: true }),
  relatorioHtml: (relatorio) => chamar('/relatorio', { method: 'POST', body: { relatorio }, binario: true }),
};
