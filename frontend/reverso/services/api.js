import { APP_CONFIG } from '../js/config.js';

/* =====================================================
   REVERSO — API Client
   =====================================================
   Comunicação direta com o Web App do Apps Script.

   IMPORTANTE — CORS:
   Não usar application/json. Esse content-type dispara
   preflight OPTIONS no navegador, que o Apps Script não
   responde corretamente.

   O padrão seguro já utilizado nos outros módulos AGF é:
   POST + Content-Type text/plain + JSON serializado.
   O backend lê e.postData.contents e faz JSON.parse.
   ===================================================== */

async function request(action, payload = {}) {
  if (!APP_CONFIG.API_BASE_URL) {
    throw new Error('Configuração de atendimento indisponível.');
  }

  const timeoutMs = Number(APP_CONFIG.API_TIMEOUT_MS || 60000);
  const hasAbortController = typeof AbortController !== 'undefined';
  const controller = hasAbortController ? new AbortController() : null;
  let timeoutId = null;
  let timedOut = false;

  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      try { controller.abort(); } catch (_) {}
    }, timeoutMs);
  }

  let response;
  try {
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow'
    };
    if (controller) options.signal = controller.signal;
    response = await fetch(APP_CONFIG.API_BASE_URL, options);
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') {
      throw new Error('O servidor demorou para responder. Aguarde alguns segundos e tente novamente.');
    }
    throw new Error('Não foi possível conectar ao atendimento agora. ' + (error?.message || error));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    const preview = String(raw || '').trim().slice(0, 160);
    throw new Error(preview
      ? 'Resposta inválida do servidor. Conteúdo recebido: ' + preview
      : 'Resposta vazia ou inválida do servidor.');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Não recebemos resposta do servidor. Tente novamente.');
  }

  if (!response.ok || data.ok === false) {
    const err = new Error(data?.error?.message || data?.message || 'Não foi possível concluir a solicitação.');
    err.payload = data;
    throw err;
  }

  return data.data;
}

export const Api = {
  health() { return request('health'); },
  getUnitBySlug(slug_unidade) { return request('getUnitBySlug', { slug_unidade }); },
  registerOrLoginUser(payload) { return request('registerOrLoginUser', payload); },
  readEtiqueta(payload) { return request('readEtiqueta', payload); },
  confirmDropoff(payload) { return request('confirmDropoff', payload); },
  getUserHistory(usuario_id) { return request('getUserHistory', { usuario_id }); },
  getDashboard() { return request('getDashboard'); },
  getUnitStatus(payload) { return request('getUnitStatus', payload); },
  openColeta(payload) { return request('openColeta', payload); },
  scanEtiquetaColeta(payload) { return request('scanEtiquetaColeta', payload); },
  closeColeta(payload) { return request('closeColeta', payload); },
  markRecebidaAgencia(payload) { return request('markRecebidaAgencia', payload); },
  markPostada(payload) { return request('markPostada', payload); }
};

