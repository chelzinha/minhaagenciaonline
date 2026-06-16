/** AGF NFE PDF EXTRACTOR — 01_NFE_UTILS.gs */

function nfeNowIso_() {
  return Utilities.formatDate(new Date(), NFE_CFG.TIMEZONE || Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function nfeJsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nfeSafeJsonParse_(text) {
  try { return JSON.parse(text || '{}'); }
  catch (e) { return {}; }
}

function nfeSanitize_(v) {
  if (v === null || typeof v === 'undefined') return '';
  return String(v).replace(/\u0000/g, '').trim();
}

function nfeUpper_(v) {
  return nfeSanitize_(v).toUpperCase();
}

function nfeDigitsOnly_(v) {
  return nfeSanitize_(v).replace(/\D+/g, '');
}

function nfeCleanSpaces_(v) {
  return nfeSanitize_(v)
    .replace(/[\t\u00A0]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function nfeNormalizeText_(text) {
  return nfeSanitize_(text)
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function nfeRemoveAccents_(text) {
  return nfeSanitize_(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function nfeNormKey_(text) {
  return nfeRemoveAccents_(text).toUpperCase();
}

function nfeToNumber_(value, fallback) {
  if (fallback === undefined) fallback = 0;
  if (typeof value === 'number') return isFinite(value) ? value : fallback;
  var raw = nfeSanitize_(value);
  if (!raw) return fallback;

  raw = raw.replace(/R\$|\s/g, '');

  // 1.234,56 => 1234.56
  if (/^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(raw)) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  }
  // 1234,56 ou 45,0000 => 1234.56 / 45.0000
  else if (/^[-+]?\d+,\d+$/.test(raw)) {
    raw = raw.replace(',', '.');
  }
  // 1,234.56 => 1234.56
  else if (/^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(raw)) {
    raw = raw.replace(/,/g, '');
  }
  // remove lixo final
  raw = raw.replace(/[^\d.-]/g, '');

  var n = Number(raw);
  return isFinite(n) ? n : fallback;
}

function nfeRound2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function nfeFormatCpfCnpj_(digits) {
  var d = nfeDigitsOnly_(digits);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return nfeSanitize_(digits);
}

function nfeFormatCep_(digits) {
  var d = nfeDigitsOnly_(digits);
  if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, '$1-$2');
  return nfeSanitize_(digits);
}

function nfeFindFirst_(text, regex, groupIndex) {
  var m = regex.exec(text);
  if (!m) return '';
  return nfeSanitize_(m[groupIndex || 1]);
}

function nfeLines_(text) {
  return nfeNormalizeText_(text)
    .split('\n')
    .map(function (l) { return l.replace(/[\t\u00A0]+/g, ' ').replace(/\s+$/g, ''); })
    .filter(function (l) { return nfeSanitize_(l); });
}

function nfeSplitColumns_(line) {
  return nfeSanitize_(line)
    .split(/\s{2,}/)
    .map(nfeSanitize_)
    .filter(Boolean);
}

function nfePushWarning_(warnings, msg) {
  if (warnings.indexOf(msg) < 0) warnings.push(msg);
}

function nfeTruncate_(text, maxLen) {
  var s = nfeSanitize_(text);
  maxLen = maxLen || 500;
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function nfePick_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = obj && obj[keys[i]];
    if (v !== null && typeof v !== 'undefined' && nfeSanitize_(v) !== '') return v;
  }
  return '';
}

function nfeRemoveEmptyDeep_(value) {
  if (Array.isArray(value)) {
    return value.map(nfeRemoveEmptyDeep_).filter(function (v) {
      return !(v === '' || v === null || typeof v === 'undefined');
    });
  }
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function (k) {
      var v = nfeRemoveEmptyDeep_(value[k]);
      var emptyObj = v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
      var emptyArr = Array.isArray(v) && v.length === 0;
      if (!(v === '' || v === null || typeof v === 'undefined' || emptyObj || emptyArr)) out[k] = v;
    });
    return out;
  }
  return value;
}

function nfeLog_(level, stage, payload) {
  var msg = '[' + (level || 'INFO') + '] NFE_EXTRACTOR ' + (stage || '') + ' ' + JSON.stringify(payload || {});
  try { console.log(msg); } catch (e) { Logger.log(msg); }
}
