/**
 * AGF — Gate de autenticação para APIs Web App
 * ------------------------------------------------------------
 * Valida o token de sessão (JWT HS256) emitido pelo projeto
 * AGF_AUTH, usando o MESMO segredo compartilhado via Script
 * Property. Nenhuma chamada de rede: verificação local por HMAC.
 *
 * Script Properties usadas neste projeto:
 *   AGF_AUTH_JWT_SECRET  -> copiar o valor do projeto AGF_AUTH
 *   AGF_API_AUTH_MODE    -> 'off' | 'monitor' | 'enforce'
 *                           (ausente/valor inválido = 'monitor')
 *
 * Modos:
 *   off      -> comportamento antigo (não valida nada).
 *   monitor  -> valida e REGISTRA falhas no log, mas deixa passar.
 *               Use nesta fase para confirmar que todos os fronts
 *               já enviam token, sem risco de derrubar ninguém.
 *   enforce  -> bloqueia chamadas sem sessão válida.
 *
 * Rollback imediato: definir AGF_API_AUTH_MODE = 'off'.
 * Segurança: o valor do segredo NUNCA deve aparecer em código,
 * log ou documentação. Fica apenas em Script Properties.
 */

var AGF_GATE_CFG = {
  SECRET_PROP: 'AGF_AUTH_JWT_SECRET',
  MODE_PROP: 'AGF_API_AUTH_MODE'
};

/** Modo atual do gate (com fallback seguro para 'monitor'). */
function agfGateMode_() {
  var mode = '';
  try {
    mode = String(PropertiesService.getScriptProperties().getProperty(AGF_GATE_CFG.MODE_PROP) || '').toLowerCase().trim();
  } catch (e) {}
  if (mode === 'off' || mode === 'enforce' || mode === 'monitor') return mode;
  return 'monitor';
}

/** Comparação em tempo constante (mesma lógica do projeto AGF_AUTH). */
function agfGateTimingSafeEqual_(a, b) {
  var left = String(a || '');
  var right = String(b || '');
  var diff = left.length ^ right.length;
  var max = Math.max(left.length, right.length);
  for (var i = 0; i < max; i += 1) {
    diff |= (left.charCodeAt(i % Math.max(1, left.length)) || 0) ^ (right.charCodeAt(i % Math.max(1, right.length)) || 0);
  }
  return diff === 0;
}

function agfGateB64UrlToString_(value) {
  var text = String(value || '');
  var padLen = (4 - (text.length % 4)) % 4;
  var padded = text;
  for (var i = 0; i < padLen; i += 1) padded += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
}

/**
 * Verifica assinatura e validade do token. Retorna o payload
 * ({sub, role, apps, exp, ...}) ou null se inválido/expirado.
 * Se o segredo ainda não foi configurado neste projeto, retorna
 * null (em modo monitor isso apenas gera log; nada quebra).
 */
function agfGateVerifyToken_(token) {
  try {
    var parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    var secret = PropertiesService.getScriptProperties().getProperty(AGF_GATE_CFG.SECRET_PROP);
    if (!secret) return null;
    var expected = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(parts[0] + '.' + parts[1], secret)
    ).replace(/=+$/g, '');
    if (!agfGateTimingSafeEqual_(expected, parts[2])) return null;
    var payload = JSON.parse(agfGateB64UrlToString_(parts[1]));
    var now = Math.floor(Date.now() / 1000);
    if (!payload || !payload.sub || !payload.role) return null;
    if (!payload.exp || Number(payload.exp) < now) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Ponto único de decisão do gate.
 * @param {string} token   token de sessão vindo do front
 * @param {string} context rótulo para o log (ex.: 'GET get_crm_data')
 * @return {{allowed:boolean, user:Object|null, mode:string}}
 */
function agfGateCheck_(token, context) {
  var mode = agfGateMode_();
  if (mode === 'off') return { allowed: true, user: null, mode: mode };
  var payload = agfGateVerifyToken_(token);
  if (payload) return { allowed: true, user: payload, mode: mode };
  if (mode === 'monitor') {
    try { console.warn('[AGF_GATE][monitor] chamada sem sessão válida: ' + String(context || '')); } catch (e) {}
    return { allowed: true, user: null, mode: mode };
  }
  try { console.warn('[AGF_GATE][enforce] chamada bloqueada: ' + String(context || '')); } catch (e) {}
  return { allowed: false, user: null, mode: mode };
}

/** Resposta padrão de bloqueio (mesmo formato ok/error dos routers). */
function agfGateDeniedResponse_() {
  return {
    ok: false,
    error: 'Sessão necessária. Faça login no Portal AGF e tente novamente.',
    code: 'AUTH_REQUIRED'
  };
}
