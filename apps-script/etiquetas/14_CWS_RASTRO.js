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

function buildCwsRastroRequest_(client, codigoObjeto, opts, tokenInfo) {
  const codigo = upper_(sanitize_(codigoObjeto)).replace(/\s+/g, '');
  if (!codigo) throw new Error('Codigo do objeto obrigatorio.');

  const resultado = sanitize_(opts && opts.resultado) || 'T';
  return {
    codigoObjeto: codigo,
    url: getCwsRastroBase_(client) + '/v1/objetos/' + encodeURIComponent(codigo) + '?resultado=' + encodeURIComponent(resultado),
    params: {
      method: 'get',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + tokenInfo.token
      },
      muteHttpExceptions: true,
      followRedirects: true
    }
  };
}

function parseCwsRastroResponse_(resp, codigo, elapsedMs) {
  const code = resp.getResponseCode();
  const body = resp.getContentText();
  const json = safeJsonParse_(body);

  if (code < 200 || code >= 300) {
    return {
      codigoObjeto: codigo,
      ok: false,
      httpCode: code,
      elapsedMs: elapsedMs,
      error: parseCwsErrorMessage_(body) || ('HTTP ' + code)
    };
  }

  return {
    codigoObjeto: codigo,
    ok: true,
    httpCode: code,
    elapsedMs: elapsedMs,
    raw: json || {}
  };
}

/**
 * Consulta varios objetos com UrlFetchApp.fetchAll em blocos controlados.
 * Uma falha individual nao derruba o painel inteiro.
 */
function cwsRastroConsultarObjetosEmLote_(client, codigosObjeto, opts) {
  const unicos = [];
  const vistos = {};
  (codigosObjeto || []).forEach(function (value) {
    const codigo = upper_(sanitize_(value)).replace(/\s+/g, '');
    if (!/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(codigo) || vistos[codigo]) return;
    vistos[codigo] = true;
    unicos.push(codigo);
  });
  if (!unicos.length) return [];

  const tokenInfo = cwsGetToken_(client);
  const loteMax = 40;
  const out = [];
  const inicioGeral = nowMs_();

  for (let ini = 0; ini < unicos.length; ini += loteMax) {
    const bloco = unicos.slice(ini, ini + loteMax).map(function (codigo) {
      return buildCwsRastroRequest_(client, codigo, opts, tokenInfo);
    });
    const t0 = nowMs_();

    try {
      const respostas = UrlFetchApp.fetchAll(bloco.map(function (req) {
        return Object.assign({ url: req.url }, req.params);
      }));
      const elapsed = nowMs_() - t0;
      respostas.forEach(function (resp, i) {
        out.push(parseCwsRastroResponse_(resp, bloco[i].codigoObjeto, elapsed));
      });
    } catch (err) {
      const msg = sanitize_(err && err.message) || 'Falha de rede no rastreio em lote.';
      bloco.forEach(function (req) {
        out.push({ codigoObjeto: req.codigoObjeto, ok: false, httpCode: 0, elapsedMs: nowMs_() - t0, error: msg });
      });
    }
  }

  logEvent_('INFO', 'CWS', 'RASTRO_LOTE', {
    quantidade: unicos.length,
    sucesso: out.filter(function (item) { return item.ok; }).length,
    falha: out.filter(function (item) { return !item.ok; }).length,
    elapsedMs: nowMs_() - inicioGeral
  });
  return out;
}
