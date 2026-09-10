// ============================================================
// ATENDE - DASHBOARD V6 (AMBIENTE ISOLADO DE TESTE)
// As funcoes abaixo usam propriedades exclusivas da V6 e nunca alteram
// ATENDE_D1_API_URL / ATENDE_D1_API_TOKEN usados pela producao @102.
// ============================================================

const ATENDE_V6_TEST_CFG = Object.freeze({
  API_URL_PROP: 'ATENDE_D1_API_URL_V6_TEST',
  API_TOKEN_PROP: 'ATENDE_D1_API_TOKEN_V6_TEST'
});

function ATENDE_getD1V6TestConfig_() {
  const props = PropertiesService.getScriptProperties();
  const apiUrl = String(props.getProperty(ATENDE_V6_TEST_CFG.API_URL_PROP) || '').trim().replace(/\/$/, '');
  const token = String(props.getProperty(ATENDE_V6_TEST_CFG.API_TOKEN_PROP) || '').trim();
  if (!apiUrl) throw new Error('Configure a Script Property "' + ATENDE_V6_TEST_CFG.API_URL_PROP + '".');
  if (!token) throw new Error('Configure a Script Property "' + ATENDE_V6_TEST_CFG.API_TOKEN_PROP + '".');
  return { apiUrl: apiUrl, token: token };
}

function ATENDE_fetchD1V6Test_(path, options) {
  const cfg = ATENDE_getD1V6TestConfig_();
  const opts = Object.assign({}, options || {});
  opts.muteHttpExceptions = true;
  opts.headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + cfg.token });

  const response = UrlFetchApp.fetch(cfg.apiUrl + path, opts);
  const code = response.getResponseCode();
  const text = response.getContentText();
  let body = null;
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }

  if (code < 200 || code >= 300 || !body || body.ok !== true) {
    const detail = body && (body.error || body.raw) ? (body.error || body.raw) : text;
    throw new Error('D1 V6 TEST API HTTP ' + code + ': ' + detail);
  }
  return body;
}

function ATENDE_adminGetV6Test_(platformToken, path) {
  const admin = ATENDE_validarAdmin_(platformToken);
  return ATENDE_fetchD1V6Test_(path, {
    method: 'get',
    headers: { 'X-AGF-Admin-User': admin.username }
  });
}

function ATENDE_adminPostV6Test_(platformToken, path, payload) {
  const admin = ATENDE_validarAdmin_(platformToken);
  return ATENDE_fetchD1V6Test_(path, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    headers: { 'X-AGF-Admin-User': admin.username }
  });
}

function ATENDE_testarD1V6() {
  const cfg = ATENDE_getD1V6TestConfig_();
  const response = UrlFetchApp.fetch(cfg.apiUrl + '/health', { muteHttpExceptions: true });
  const result = {
    ok: response.getResponseCode() === 200,
    httpCode: response.getResponseCode(),
    apiUrl: cfg.apiUrl,
    body: response.getContentText()
  };
  console.log('ATENDE - TESTE D1 V6');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_adminBuscarClassificacaoReceita(platformToken, competencia) {
  const mes = String(competencia || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Competência inválida. Use AAAA-MM.');
  return ATENDE_adminGetV6Test_(
    platformToken,
    '/admin/dashboard-revenue-clients?competencia=' + encodeURIComponent(mes)
  );
}

function ATENDE_adminSalvarClassificacaoReceita(platformToken, payload) {
  return ATENDE_adminPostV6Test_(platformToken, '/admin/dashboard-revenue-client', payload || {});
}
