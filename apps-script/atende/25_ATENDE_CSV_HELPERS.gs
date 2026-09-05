// ============================================================
// ATENDE - HELPERS DO CSV DIARIO
// ============================================================

function ATENDE_cleanCsvValue_(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || /^(null|undefined)$/i.test(text)) return '';
  return text;
}

function ATENDE_parseCsvDate_(value) {
  const clean = ATENDE_cleanCsvValue_(value);
  if (!clean) return '';
  const parsed = parseDateTimeValue_(clean);
  if (!parsed) throw new Error('DATA_POSTAGEM invalida no CSV: ' + clean);
  return parsed;
}

function ATENDE_toNumber_(value) {
  const clean = ATENDE_cleanCsvValue_(value);
  if (!clean) return 0;
  if (clean.indexOf(',') >= 0) return Number(clean.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(clean) || 0;
}

function ATENDE_gramasParaKg_(value) {
  const grams = ATENDE_toNumber_(value);
  return grams ? grams / 1000 : 0;
}

function ATENDE_digits_(value) {
  return ATENDE_cleanCsvValue_(value).replace(/\D/g, '');
}

function ATENDE_categoriaServico_(serviceName) {
  const text = ATENDE_cleanCsvValue_(serviceName).toUpperCase();
  if (!text) return '';
  if (text.indexOf('SEDEX') >= 0) return 'SEDEX';
  if (text.indexOf('PAC') >= 0) return 'ENCOMENDA PAC';
  if (text.indexOf('CARTA') >= 0) return 'CARTA';
  if (text.indexOf('MINI ENVIOS') >= 0) return 'MINI ENVIOS';
  return text;
}

function ATENDE_sha256_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}
