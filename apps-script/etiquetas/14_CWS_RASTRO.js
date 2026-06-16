/**
 * APP ETIQUETAS AGF — 14_CWS_RASTRO.gs
 * Integração com a API Rastro dos Correios.
 *
 * Implementação isolada para não mexer no fluxo de emissão.
 * Consulta um objeto por vez e devolve o JSON bruto da API.
 */

function getCwsRastroBase_(client) {
  const ambiente = resolveCwsAmbiente_(client);
  return ambiente === 'HOMOLOGACAO'
    ? 'https://apihom.correios.com.br/srorastro'
    : 'https://api.correios.com.br/srorastro';
}

function cwsRastroConsultarObjeto_(client, codigoObjeto, opts) {
  const codigo = upper_(sanitize_(codigoObjeto)).replace(/\s+/g, '');
  if (!codigo) throw new Error('Código do objeto obrigatório.');

  const tokenInfo = cwsGetToken_(client);
  const resultado = sanitize_(opts && opts.resultado) || 'T';
  const url = getCwsRastroBase_(client) + '/v1/objetos/' + encodeURIComponent(codigo) + '?resultado=' + encodeURIComponent(resultado);

  const params = {
    method: 'get',
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + tokenInfo.token
    },
    muteHttpExceptions: true,
    followRedirects: true
  };

  const t0 = nowMs_();
  const resp = UrlFetchApp.fetch(url, params);
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  const elapsedMs = nowMs_() - t0;
  const json = safeJsonParse_(text);

  logEvent_('INFO', 'CWS', 'RASTRO_REQ', {
    codigoObjeto: codigo,
    httpCode: code,
    elapsedMs: elapsedMs,
    ok: code >= 200 && code < 300,
    respBody: truncate_(text, 1200)
  });

  if (code < 200 || code >= 300) {
    const errMsg = parseCwsErrorMessage_(text) || ('HTTP ' + code);
    const err = new Error('Correios RASTRO GET falhou (' + code + '): ' + errMsg);
    err.cwsCode = code;
    err.cwsBody = text;
    throw err;
  }

  return json || {};
}