/***************************************************************************************
 * SupabaseClient.gs
 * ---------------------------------------------------------------------------------
 * Cliente HTTP reutilizável para o backend Apps Script falar com a API REST
 * (PostgREST) do Supabase, substituindo gradualmente a leitura direta de Sheets.
 *
 * PRINCÍPIOS (decisões fixas da migração AGF -> Supabase):
 *  - A chave usada é SEMPRE a service_role, lida das Script Properties.
 *  - A service_role NUNCA fica no frontend e NUNCA é versionada no repositório.
 *  - O cliente recusa qualquer chave que não seja service_role (proteção explícita).
 *  - RLS está ligado em todas as tabelas (default deny); a service_role ignora RLS,
 *    por isso este cliente só deve rodar em contexto server-side (Apps Script).
 *
 * CONFIGURAÇÃO (Project Settings -> Script Properties):
 *  - SUPABASE_URL                ex.: https://xxxxxxxx.supabase.co
 *  - SUPABASE_SERVICE_ROLE_KEY   chave secreta service_role (legacy JWT) ou sb_secret_*
 *
 * Antes de qualquer migração/uso, rode supabaseHealthCheck() para validar a conexão.
 ***************************************************************************************/

/** Nomes das Script Properties — centralizados para evitar typo. */
var SUPABASE_PROP_URL = 'SUPABASE_URL';
var SUPABASE_PROP_KEY = 'SUPABASE_SERVICE_ROLE_KEY';

/** Schemas expostos na API do Supabase (Project Settings -> API -> Exposed schemas). */
var SUPABASE_SCHEMAS = { CORE: 'core', COLETA: 'coleta', PUBLIC: 'public' };


/**
 * Lê e valida a configuração das Script Properties.
 * Lança erro explícito se faltar config ou se a chave não for service_role.
 * @return {{url: string, key: string}}
 */
function supabaseGetConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty(SUPABASE_PROP_URL) || '').trim();
  var key = (props.getProperty(SUPABASE_PROP_KEY) || '').trim();

  if (!url) {
    throw new Error('[Supabase] Script Property "' + SUPABASE_PROP_URL + '" não configurada.');
  }
  if (!key) {
    throw new Error('[Supabase] Script Property "' + SUPABASE_PROP_KEY + '" não configurada.');
  }
  if (!/^https:\/\/.+\.supabase\.(co|in|net)\/?$/i.test(url)) {
    throw new Error('[Supabase] SUPABASE_URL inválida. Esperado algo como https://<ref>.supabase.co');
  }

  // Proteção crítica: nunca aceitar anon/publishable key.
  if (!supabaseIsServiceRoleKey_(key)) {
    throw new Error(
      '[Supabase] A chave configurada NÃO é uma service_role key. ' +
      'Use exclusivamente a service_role (secret) nas Script Properties. ' +
      'Chaves anon/publishable são proibidas neste cliente server-side.'
    );
  }

  // Normaliza removendo barra final da URL.
  return { url: url.replace(/\/+$/, ''), key: key };
}


/**
 * Detecta se a chave é uma service_role.
 * Suporta os dois formatos do Supabase:
 *  - Novo formato secreto: prefixo "sb_secret_".
 *  - Legacy JWT: payload com "role":"service_role".
 * Rejeita anon (role:anon) e publishable (sb_publishable_*).
 * @param {string} key
 * @return {boolean}
 */
function supabaseIsServiceRoleKey_(key) {
  if (!key) return false;

  // Formato novo (secret key).
  if (key.indexOf('sb_secret_') === 0) return true;
  if (key.indexOf('sb_publishable_') === 0) return false;

  // Formato legacy JWT: header.payload.signature
  var parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    var payloadBytes = Utilities.base64DecodeWebSafe(parts[1]);
    var payloadJson = Utilities.newBlob(payloadBytes).getDataAsString();
    var payload = JSON.parse(payloadJson);
    return payload && payload.role === 'service_role';
  } catch (e) {
    return false;
  }
}


/**
 * Mascara a chave para logs — nunca expõe o valor real.
 * @param {string} key
 * @return {string}
 */
function supabaseMaskKey_(key) {
  if (!key) return '(vazia)';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}


/**
 * Log estruturado (JSON) — nunca inclui a chave em claro.
 * @param {string} level  INFO | WARN | ERROR
 * @param {string} op
 * @param {Object} data
 */
function supabaseLog_(level, op, data) {
  var entry = { ts: new Date().toISOString(), src: 'SupabaseClient', level: level, op: op };
  if (data) {
    Object.keys(data).forEach(function (k) { entry[k] = data[k]; });
  }
  Logger.log(JSON.stringify(entry));
}


/**
 * Núcleo de requisição PostgREST.
 * @param {string} method        GET | POST | PATCH | DELETE
 * @param {string} path          ex.: "/rest/v1/coletadores?select=*"
 * @param {Object} [opts]
 * @param {string} [opts.schema]      schema alvo (core/coleta/public)
 * @param {Object} [opts.payload]     corpo (objeto ou array) — serializado em JSON
 * @param {Object} [opts.extraHeaders] headers adicionais (ex.: Prefer)
 * @return {{status: number, ok: boolean, data: *}}
 */
function supabaseRequest_(method, path, opts) {
  opts = opts || {};
  var cfg = supabaseGetConfig_();

  var headers = {
    'apikey': cfg.key,
    'Authorization': 'Bearer ' + cfg.key,
    'Content-Type': 'application/json'
  };

  // Seleção de schema: Accept-Profile p/ leitura, Content-Profile p/ escrita.
  if (opts.schema) {
    if (method === 'GET' || method === 'HEAD') {
      headers['Accept-Profile'] = opts.schema;
    } else {
      headers['Content-Profile'] = opts.schema;
    }
  }
  if (opts.extraHeaders) {
    Object.keys(opts.extraHeaders).forEach(function (k) { headers[k] = opts.extraHeaders[k]; });
  }

  var params = {
    method: method.toLowerCase(),
    headers: headers,
    muteHttpExceptions: true,
    contentType: 'application/json'
  };
  if (opts.payload !== undefined && opts.payload !== null) {
    params.payload = JSON.stringify(opts.payload);
  }

  var url = cfg.url + path;
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, params);
  } catch (e) {
    supabaseLog_('ERROR', method + ' ' + path, { key: supabaseMaskKey_(cfg.key), error: String(e) });
    throw new Error('[Supabase] Falha de rede ao chamar ' + path + ': ' + e);
  }

  var status = resp.getResponseCode();
  var body = resp.getContentText();
  var parsed = null;
  if (body) {
    try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
  }

  var ok = status >= 200 && status < 300;
  if (!ok) {
    // Loga sem expor a chave; inclui mensagem do PostgREST para diagnóstico.
    supabaseLog_('ERROR', method + ' ' + path, {
      status: status,
      key: supabaseMaskKey_(cfg.key),
      response: parsed
    });
    var msg = (parsed && parsed.message) ? parsed.message : ('HTTP ' + status);
    throw new Error('[Supabase] ' + method + ' ' + path + ' falhou (' + status + '): ' + msg);
  }

  supabaseLog_('INFO', method + ' ' + path, { status: status });
  return { status: status, ok: ok, data: parsed };
}


/**
 * SELECT (GET) em uma tabela/view.
 * @param {string} schema
 * @param {string} table
 * @param {string} [query]  query string PostgREST sem "?" (ex.: "select=*&status=eq.ativo&order=nome")
 * @return {Array<Object>}
 */
function supabaseSelect(schema, table, query) {
  var qs = query ? ('?' + query) : '?select=*';
  var res = supabaseRequest_('GET', '/rest/v1/' + table + qs, { schema: schema });
  return res.data;
}


/**
 * INSERT (POST). Retorna as linhas inseridas (return=representation).
 * @param {string} schema
 * @param {string} table
 * @param {Object|Array<Object>} rows
 * @return {Array<Object>}
 */
function supabaseInsert(schema, table, rows) {
  var res = supabaseRequest_('POST', '/rest/v1/' + table, {
    schema: schema,
    payload: rows,
    extraHeaders: { 'Prefer': 'return=representation' }
  });
  return res.data;
}


/**
 * UPSERT (POST com resolution=merge-duplicates). Em conflito na coluna onConflict,
 * atualiza a linha existente. Retorna as linhas resultantes.
 * @param {string} schema
 * @param {string} table
 * @param {Object|Array<Object>} rows
 * @param {string} onConflict  coluna(s) de conflito (ex.: "objeto")
 * @return {Array<Object>}
 */
function supabaseUpsert(schema, table, rows, onConflict) {
  if (!onConflict) {
    throw new Error('[Supabase] supabaseUpsert requer onConflict (coluna de conflito).');
  }
  var path = '/rest/v1/' + table + '?on_conflict=' + encodeURIComponent(onConflict);
  var res = supabaseRequest_('POST', path, {
    schema: schema,
    payload: rows,
    extraHeaders: { 'Prefer': 'resolution=merge-duplicates,return=representation' }
  });
  return res.data;
}


/**
 * UPDATE (PATCH) filtrado por query PostgREST.
 * @param {string} schema
 * @param {string} table
 * @param {Object} patch  campos a atualizar
 * @param {string} filter query string de filtro sem "?" (ex.: "objeto=eq.PA123456789BR")
 * @return {Array<Object>}
 */
function supabaseUpdate(schema, table, patch, filter) {
  if (!filter) {
    throw new Error('[Supabase] supabaseUpdate requer filtro para evitar update em massa acidental.');
  }
  var res = supabaseRequest_('PATCH', '/rest/v1/' + table + '?' + filter, {
    schema: schema,
    payload: patch,
    extraHeaders: { 'Prefer': 'return=representation' }
  });
  return res.data;
}


/**
 * RPC — chama uma função SQL exposta (POST /rest/v1/rpc/<fn>).
 * @param {string} schema
 * @param {string} fn
 * @param {Object} [args]
 * @return {*}
 */
function supabaseRpc(schema, fn, args) {
  var res = supabaseRequest_('POST', '/rest/v1/rpc/' + fn, {
    schema: schema,
    payload: args || {}
  });
  return res.data;
}


/**
 * Health check — valida conexão + chave service_role ANTES de qualquer migração/uso.
 *
 * Nota técnica: o PostgREST do Supabase não expõe `information_schema` por padrão,
 * portanto um "select count em information_schema.tables" via REST não é possível em
 * um projeto recém-criado. Para validar de forma confiável conectividade + autenticação
 * num projeto zerado, fazemos um GET autenticado no endpoint REST raiz (/rest/v1/),
 * que responde 200 quando URL + service_role estão corretos.
 *
 * Quando as migrations já tiverem criado a função RPC de contagem (opcional), este
 * health check pode ser estendido para chamar supabaseRpc('core','contar_tabelas').
 *
 * @return {{ok: boolean, status: number, url: string}}
 */
function supabaseHealthCheck() {
  var cfg = supabaseGetConfig_();
  supabaseLog_('INFO', 'healthcheck:start', { url: cfg.url, key: supabaseMaskKey_(cfg.key) });

  var res = supabaseRequest_('GET', '/rest/v1/', {});
  var result = { ok: res.ok, status: res.status, url: cfg.url };

  supabaseLog_('INFO', 'healthcheck:done', result);
  return result;
}
