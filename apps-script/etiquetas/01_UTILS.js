/**
 * APP ETIQUETAS AGF — 01_UTILS.gs
 * Helpers puros sem dependência de outros módulos.
 */

// ============ STRINGS ============
function sanitize_(v) { return String(v == null ? '' : v).trim(); }
function digitsOnly_(v) { return String(v || '').replace(/\D/g, ''); }
function upper_(v) { return sanitize_(v).toUpperCase(); }
function lower_(v) { return sanitize_(v).toLowerCase(); }
function nonEmpty_(v) { return sanitize_(v).length > 0; }

function truncate_(v, max) {
  const s = sanitize_(v);
  if (!max || s.length <= max) return s;
  return s.slice(0, max) + '...[truncado]';
}

function padLeft_(v, len, ch) {
  const s = String(v || '');
  if (s.length >= len) return s;
  return new Array(len - s.length + 1).join(ch || '0') + s;
}

// ============ CARTÃO DE POSTAGEM ============
/**
 * Normaliza o número do cartão de postagem para o formato aceito pela
 * API dos Correios: SEMPRE 10 dígitos, com zeros à esquerda se faltar.
 *
 * Por que existe este helper: o Google Sheets interpreta "0078976197"
 * como número e come os zeros à esquerda, salvando "78976197". Quando
 * o backend manda esse valor truncado pra Correios, ela devolve:
 *   TOK-003: Cartão de postagem não localizado: 78976197
 * Porque internamente o cartão está cadastrado como "0078976197".
 *
 * O manual V2.4 capítulo 5 especifica 10 dígitos. Esta função aceita
 * qualquer formato de entrada (com pontos, traços, zeros ou não) e
 * devolve sempre 10 dígitos. Se passar de 10 dígitos, lança erro claro.
 */
function normalizeCartaoPostagem_(v) {
  const d = digitsOnly_(v);
  if (!d) throw new Error('Cartão de postagem não informado.');
  if (d.length > 10) {
    throw new Error('Cartão de postagem inválido (' + d.length + ' dígitos, esperado 10): ' + d);
  }
  return padLeft_(d, 10, '0');
}

/**
 * Normaliza o código de serviço (coProduto) para o formato aceito pela
 * API dos Correios: SEMPRE 5 dígitos, com zeros à esquerda se faltar.
 *
 * Mesmo problema do cartão de postagem: o Sheets come zeros à esquerda,
 * então "03220" vira "3220" e a API rejeita com "código inválido".
 * O manual V2.4 (capítulos 13 e 15) mostra todos os exemplos como 5
 * dígitos: SEDEX=03220, PAC=03298, SEDEX10=03158, SEDEX12=03140,
 * SEDEX VAREJO=04014, PAC VAREJO=04510, etc.
 *
 * Aceita qualquer formato de entrada e devolve sempre 5 dígitos.
 * Se passar de 5 dígitos, lança erro claro.
 */
function normalizeCodigoServico_(v) {
  const d = digitsOnly_(v);
  if (!d) throw new Error('Código de serviço não informado.');
  if (d.length > 5) {
    throw new Error('Código de serviço inválido (' + d.length + ' dígitos, esperado 5): ' + d);
  }
  return padLeft_(d, 5, '0');
}

// ============ NÚMEROS ============
function toNumber_(v, fallback) {
  if (v == null || v === '') return fallback || 0;
  const s = String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = Number(s);
  return isNaN(n) ? (fallback || 0) : n;
}

function toIntStr_(v) {
  const n = toNumber_(v, 0);
  return String(Math.round(n));
}

// ============ TELEFONE ============
function splitPhoneBr_(value) {
  const d = digitsOnly_(value);
  if (!d) return { ddd: '', numero: '' };
  if (d.length <= 2) return { ddd: d, numero: '' };
  // BR: 2 dígitos DDD + 8 ou 9 dígitos
  return { ddd: d.slice(0, 2), numero: d.slice(2) };
}

// ============ DATA / TEMPO ============
function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function nowMs_() { return new Date().getTime(); }

function parseExpiraEm_(s) {
  // Correios devolve "2024-03-19T10:26:51" sem timezone (UTC-3 implícito).
  if (!s) return null;
  try {
    const txt = String(s).replace(/Z$/, '');
    // Adiciona timezone explícito se faltar
    const hasTz = /[+-]\d{2}:?\d{2}$/.test(txt);
    const iso = hasTz ? txt : (txt + '-03:00');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) { return null; }
}

// ============ IDs ============
function uid_(prefix) {
  return (prefix || 'ID') + '_' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

// ============ JSON SAFE ============
function safeJsonParse_(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

function safeJsonStringify_(obj) {
  try { return JSON.stringify(obj); } catch (e) { return String(obj); }
}

// ============ EXTRAÇÃO DEFENSIVA DE CAMPOS ============
// A API da Correios às vezes muda nomes entre versões. Estes helpers
// procuram um campo por uma lista de chaves possíveis em qualquer
// profundidade do objeto.

function pickFirst_(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (let i = 0; i < keys.length; i++) {
    const v = deepFind_(obj, keys[i]);
    if (v !== '' && v != null) return v;
  }
  return '';
}

function deepFind_(obj, wantedKey) {
  if (obj == null) return '';
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = deepFind_(obj[i], wantedKey);
      if (r !== '' && r != null) return r;
    }
    return '';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    const want = String(wantedKey).toLowerCase();
    for (let k = 0; k < keys.length; k++) {
      if (String(keys[k]).toLowerCase() === want) return obj[keys[k]];
    }
    for (let j = 0; j < keys.length; j++) {
      const nested = deepFind_(obj[keys[j]], wantedKey);
      if (nested !== '' && nested != null) return nested;
    }
  }
  return '';
}

// ============ REDACT ============
// Remove campos sensíveis antes de gravar em log.
function redactSensitive_(obj) {
  if (obj == null) return obj;
  if (typeof obj === 'string') {
    // Trunca tokens JWT longos
    if (/^eyJ[A-Za-z0-9_-]+\.eyJ/.test(obj)) return '[JWT_REDACTED]';
    if (obj.length > 200) return obj.slice(0, 200) + '...[len=' + obj.length + ']';
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(redactSensitive_);
  if (typeof obj === 'object') {
    const out = {};
    Object.keys(obj).forEach(k => {
      const lk = k.toLowerCase();
      if (lk === 'token' || lk === 'jwt' || lk === 'authorization' ||
          lk === 'senha' || lk === 'password' || lk === 'tokenapi' ||
          lk === 'token_api' || lk === 'codigoacessoapi' || lk === 'basic') {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitive_(obj[k]);
      }
    });
    return out;
  }
  return obj;
}

// ============ VALIDAÇÃO BÁSICA ============
function isValidCep_(cep) {
  const d = digitsOnly_(cep);
  return d.length === 8;
}

function isValidUF_(uf) {
  const u = upper_(uf);
  if (u.length !== 2) return false;
  return ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
          'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP',
          'TO'].indexOf(u) >= 0;
}

function isValidEmail_(email) {
  const e = sanitize_(email);
  if (!e) return true;  // opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isValidCpfCnpj_(v) {
  const d = digitsOnly_(v);
  return d.length === 11 || d.length === 14;
}

// ============ HEADERS HTTP ============
function buildJsonHeaders_(bearerToken, extra) {
  const h = { 'Accept': 'application/json' };
  if (bearerToken) h['Authorization'] = 'Bearer ' + bearerToken;
  if (extra) Object.keys(extra).forEach(k => h[k] = extra[k]);
  return h;
}