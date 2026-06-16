/**
 * APP ETIQUETAS AGF — 05_CWS_REQUEST.gs
 * Wrapper HTTP para chamadas autenticadas à Correios.
 *
 * Responsabilidades:
 *  - Anexar Bearer token automaticamente
 *  - Retry uma vez em caso de 401 (token expirado no meio)
 *  - Tratar respostas binárias (PDF) e JSON uniformemente
 *  - Logar request/response (com redact) para diagnóstico
 *  - Capturar e propagar erros da Correios em formato legível
 */

/**
 * cwsRequest_(client, opts)
 *
 * opts = {
 *   service: 'PREPOSTAGEM' | 'CEP' | 'PRECO' | 'PRAZO',
 *   path: '/v1/...',           // path relativo ao service
 *   method: 'get' | 'post' | 'put' | 'delete',
 *   body: object | string,     // serializado como JSON se for object
 *   query: object,             // query string params
 *   binary: boolean,           // true se a resposta for PDF/blob
 *   accept: 'application/json' | 'application/pdf'
 * }
 *
 * retorna: {
 *   ok: bool,
 *   code: number,
 *   json: object|null,
 *   text: string,
 *   blob: Blob|null,
 *   contentType: string,
 *   elapsedMs: number
 * }
 */
function cwsRequest_(client, opts) {
  return cwsRequestInner_(client, opts, 0);
}

function cwsRequestInner_(client, opts, attempt) {
  const tokenInfo = cwsGetToken_(client);
  const base = getCwsBase_(client, opts.service);

  // Monta query string
  let url = base + opts.path;
  if (opts.query && Object.keys(opts.query).length) {
    const qsParts = [];
    Object.keys(opts.query).forEach(k => {
      const value = opts.query[k];
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item != null && item !== '') {
            qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(item));
          }
        });
        return;
      }
      if (value != null && value !== '') {
        qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(value));
      }
    });
    const qs = qsParts.join('&');
    if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  // Monta body
  let payload = '';
  let contentType = '';
  if (opts.body != null) {
    if (typeof opts.body === 'string') {
      payload = opts.body;
      contentType = opts.contentType || 'application/json';
    } else {
      payload = JSON.stringify(opts.body);
      contentType = 'application/json';
    }
  }

  const params = {
    method: String(opts.method || 'get').toLowerCase(),
    headers: {
      'Accept': opts.accept || 'application/json',
      'Authorization': 'Bearer ' + tokenInfo.token
    },
    muteHttpExceptions: true,
    followRedirects: true
  };
  if (payload) {
    params.payload = payload;
    params.contentType = contentType;
  }

  const t0 = nowMs_();
  const resp = UrlFetchApp.fetch(url, params);
  const code = resp.getResponseCode();
  const headers = resp.getAllHeaders();
  const respCt = String(headers['Content-Type'] || headers['content-type'] || '');
  const elapsedMs = nowMs_() - t0;

  // Retry uma vez em 401 (token expirado no meio)
  if (code === 401 && attempt === 0) {
    cwsInvalidateToken_(client);
    logEvent_('WARN', 'CWS', 'TOKEN_RENEW_RETRY', {
      service: opts.service, path: opts.path
    });
    return cwsRequestInner_(client, opts, 1);
  }

  // Resposta binária (PDF)
  const isPdf = /application\/pdf/i.test(respCt) || opts.binary;
  let blob = null;
  let text = '';
  let json = null;

  if (isPdf && code >= 200 && code < 300) {
    blob = resp.getBlob();
    text = '[binary ' + blob.getBytes().length + ' bytes]';
  } else {
    text = resp.getContentText();
    json = safeJsonParse_(text);
  }

  // Log estruturado
  logEvent_(
    code >= 200 && code < 300 ? 'INFO' : 'ERRO',
    'CWS',
    (opts.method || 'GET').toUpperCase() + ' ' + opts.service,
    {
      path: opts.path,
      reqQuery: opts.query ? truncate_(safeJsonStringify_(redactSensitive_(opts.query)), 1500) : '',
      httpCode: code,
      elapsedMs: elapsedMs,
      reqBody: payload ? truncate_(safeJsonStringify_(redactSensitive_(safeJsonParse_(payload) || payload)), 1500) : '',
      respBody: blob ? '[PDF binary]' : truncate_(text, 1500)
    }
  );

  if (code < 200 || code >= 300) {
    const errMsg = parseCwsErrorMessage_(text) || ('HTTP ' + code);
    const err = new Error('Correios ' + opts.service + ' ' + (opts.method || 'GET').toUpperCase() +
                          ' falhou (' + code + '): ' + errMsg);
    err.cwsCode = code;
    err.cwsBody = text;
    err.cwsJson = json;
    throw err;
  }

  return {
    ok: true,
    code: code,
    json: json,
    text: text,
    blob: blob,
    contentType: respCt,
    elapsedMs: elapsedMs
  };
}