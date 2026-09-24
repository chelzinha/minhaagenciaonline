/**
 * Configuracao do CRM.
 * O backend do CRM agora e o Worker agf-cadastros-api (Cloudflare D1), rota /api/crm,
 * com dados do Visao 360. Nao usa mais planilha nem Apps Script.
 * localhost / 127.0.0.1 -> Worker local (npx wrangler dev na pasta cloudflare/cadastros-api).
 */
(function () {
  var API_PRODUCAO = 'https://agf-cadastros-api.chelzinha.workers.dev/api/crm';
  var API_LOCAL = 'http://127.0.0.1:8787/api/crm';
  var host = String(location.hostname || '').toLowerCase();
  var local = host === 'localhost' || host === '127.0.0.1';
  window.CRM_AMBIENTE = local ? 'local' : 'producao';
  window.CRM_APP_CONFIG = Object.freeze({
    apiUrl: local ? API_LOCAL : API_PRODUCAO,
    ambiente: window.CRM_AMBIENTE,
    defaultView: 'home',
    weekStartsOn: 1,
    requestTimeoutMs: 60000,
    bootstrapTimeoutMs: 90000,
    legacyTimeoutMs: 150000
  });
})();
