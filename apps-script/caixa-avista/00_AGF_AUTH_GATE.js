/**
 * Gate de autenticação AGF para Web Apps.
 * Script Properties:
 * AGF_AUTH_JWT_SECRET
 * AGF_API_AUTH_MODE = off | monitor | enforce
 */
var AGF_GATE_CFG = {
  SECRET_PROP: 'AGF_AUTH_JWT_SECRET',
  MODE_PROP: 'AGF_API_AUTH_MODE'
};

function agfGateMode_() {
  var mode = '';
  try {
    mode = String(PropertiesService.getScriptProperties().getProperty(AGF_GATE_CFG.MODE_PROP) || '').toLowerCase().trim();
  } catch (error) {}
  return ['off', 'monitor', 'enforce'].indexOf(mode) >= 0 ? mode : 'monitor';
}

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
  for (var i = 0; i < padLen; i += 1) text += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(text)).getDataAsString('UTF-8');
}

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
    if (!payload || !payload.sub || !payload.role || !payload.exp || Number(payload.exp) < now) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function agfGateCheck_(token, context) {
  var mode = agfGateMode_();
  if (mode === 'off') return { allowed: true, user: null, mode: mode };
  var payload = agfGateVerifyToken_(token);
  if (payload) return { allowed: true, user: payload, mode: mode };
  if (mode === 'monitor') {
    console.warn('[AGF_GATE][monitor] chamada sem sessão válida: ' + String(context || ''));
    return { allowed: true, user: null, mode: mode };
  }
  console.warn('[AGF_GATE][enforce] chamada bloqueada: ' + String(context || ''));
  return { allowed: false, user: null, mode: mode };
}

function agfGateDeniedResponse_() {
  return { ok: false, error: 'Sessão necessária. Faça login no Portal AGF e tente novamente.', code: 'AUTH_REQUIRED' };
}
