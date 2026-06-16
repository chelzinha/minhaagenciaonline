import { APP_CONFIG } from '../js/config.js';

async function request(action, payload = {}) {
  if (!APP_CONFIG.API_BASE_URL) throw new Error('URL da API não configurada.');
  const authToken = window.AgfAuth?.getToken?.() || '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APP_CONFIG.API_TIMEOUT_MS || 60000);
  try {
    const response = await fetch(APP_CONFIG.API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, auth_token: authToken, ...payload }),
      redirect: 'follow',
      signal: controller.signal
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('Resposta inválida do servidor.'); }
    if (!response.ok || data?.ok === false) throw new Error(data?.error?.message || data?.message || 'Erro ao processar requisição.');
    return data.data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('A solicitação demorou mais do que o esperado. Tente novamente.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const Api = {
  getDashboard() { return request('getDashboard'); },
  getAdminBootstrap(payload = {}) { return request('getAdminBootstrap', payload); },
  listUnidades(payload = {}) { return request('listUnidades', payload); },
  createUnidade(payload) { return request('createUnidade', payload); },
  updateUnidade(payload) { return request('updateUnidade', payload); },
  listLotes(payload = {}) { return request('listLotes', payload); },
  generateLoteEtiquetas(payload) { return request('generateLoteEtiquetas', payload); },
  getLotePrintData(lote_id) { return request('getLotePrintData', { lote_id }); },
  getEtiquetaPrintData(etiqueta_id) { return request('getEtiquetaPrintData', { etiqueta_id }); },
  listEtiquetas(payload = {}) { return request('listEtiquetas', payload); },
  listReversas(payload = {}) { return request('listReversas', payload); },
  getReversaDetail(reversa_id) { return request('getReversaDetail', { reversa_id }); },
  listExpedicao(payload = {}) { return request('listExpedicao', payload); },
  receiveObjetoAgencia(payload) { return request('receiveObjetoAgencia', payload); },
  postObjeto(payload) { return request('postObjeto', payload); },
  resendPostedEmail(payload) { return request('resendPostedEmail', payload); },
  markWhatsAppSent(payload) { return request('markWhatsAppSent', payload); },
  getColetaDetail(coleta_id) { return request('getColetaDetail', { coleta_id }); },
  listColetas(payload = {}) { return request('listColetas', payload); },
  openColeta(payload) { return request('openColeta', payload); },
  closeColeta(payload) { return request('closeColeta', payload); },
  transferColeta(payload) { return request('transferColeta', payload); },
  markRecebidaAgencia(payload) { return request('markRecebidaAgencia', payload); },
  markPostada(payload) { return request('markPostada', payload); },
  listDivergencias(payload = {}) { return request('listDivergencias', payload); },
  createDivergencia(payload) { return request('createDivergencia', payload); },
  listParametros() { return request('listParametros'); },
  updateParametro(payload) { return request('updateParametro', payload); }
};
