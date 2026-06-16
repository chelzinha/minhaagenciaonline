function agfGetRuntimeConfig_() {
  const props = PropertiesService.getScriptProperties();
  const defaultUf = agfNormalizeUf_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.DEFAULT_UF)) || AGF_ADDRESS_CONFIG.DEFAULT_UF;
  const defaultCidade = agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.DEFAULT_CIDADE)) || AGF_ADDRESS_CONFIG.DEFAULT_CIDADE;
  const correiosEnabled = String(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED) || '').toLowerCase() === 'true';
  const hasManualToken = !!agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN));
  const hasCredentials = !!(
    agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_LOGIN)) &&
    agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_API_CODE)) &&
    agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CONTRATO))
  );

  return {
    version: AGF_ADDRESS_CONFIG.VERSION,
    defaultUf,
    defaultCidade,
    maxResults: AGF_ADDRESS_CONFIG.MAX_RESULTS,
    cacheTtlSeconds: AGF_ADDRESS_CONFIG.CACHE_TTL_SECONDS,
    correiosCepEnabled: correiosEnabled,
    correiosCepReady: correiosEnabled && (hasManualToken || hasCredentials),
    correiosHasCredentials: hasCredentials,
    correiosHasManualToken: hasManualToken,
    correiosCepBaseUrl: agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_BASE_URL)) || AGF_ADDRESS_CONFIG.CORREIOS_CEP_BASE_URL
  };
}

function agfJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function agfSuccess_(data) {
  return Object.assign({ ok: true }, data || {});
}

function agfError_(code, message, extra) {
  return Object.assign({
    ok: false,
    code,
    message,
    results: []
  }, extra || {});
}

function agfLog_(message, data) {
  const suffix = data === undefined ? '' : ' ' + JSON.stringify(data);
  console.log(`${AGF_ADDRESS_CONFIG.LOG_PREFIX} ${message}${suffix}`);
}

function agfCleanText_(value) {
  return String(value || '')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function agfStripAccents_(value) {
  return agfCleanText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function agfOnlyDigits_(value) {
  return String(value || '').replace(/\D+/g, '');
}

function agfNormalizeForKey_(value) {
  return agfStripAccents_(value).toUpperCase();
}

function agfNormalizeForCompare_(value) {
  return agfNormalizeForKey_(value)
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function agfNormalizeCep_(value) {
  const digits = agfOnlyDigits_(value);
  return digits.length === 8 ? digits : '';
}

function agfFormatCep_(value) {
  const cep = agfNormalizeCep_(value);
  return cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : agfCleanText_(value);
}

function agfNormalizeUf_(value) {
  const uf = agfNormalizeForKey_(value);
  return AGF_VALID_UFS.indexOf(uf) >= 0 ? uf : '';
}

function agfUfFromText_(value) {
  const normalized = agfNormalizeForCompare_(value);
  const tokens = normalized.split(' ').filter(Boolean);

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (AGF_VALID_UFS.indexOf(token) >= 0) return token;
  }

  const names = Object.keys(AGF_UF_NAME_TO_SIGLA);
  for (let j = 0; j < names.length; j += 1) {
    const name = names[j];
    if (normalized.indexOf(name) >= 0) return AGF_UF_NAME_TO_SIGLA[name];
  }

  return '';
}

function agfToInt_(value, fallback) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function agfClamp_(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function agfSafeParseJson_(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function agfNowIso_() {
  return new Date().toISOString();
}

function agfDaysBetween_(dateA, dateB) {
  const ms = Math.abs(dateA.getTime() - dateB.getTime());
  return ms / 86400000;
}

function agfFirst_(array) {
  return Array.isArray(array) && array.length ? array[0] : null;
}

function agfLimitResults_(results, maxResults) {
  const max = agfClamp_(agfToInt_(maxResults, AGF_ADDRESS_CONFIG.MAX_RESULTS), 1, 50);
  return Array.isArray(results) ? results.slice(0, max) : [];
}

function agfUniqueStrings_(values) {
  const seen = new Set();
  const output = [];
  (values || []).forEach(value => {
    const clean = agfCleanText_(value);
    const key = agfNormalizeForKey_(clean);
    if (!clean || seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  });
  return output;
}

function agfEscapeRegExp_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function agfRemoveWordInsensitive_(text, word) {
  const clean = agfCleanText_(text);
  const normalizedClean = agfNormalizeForCompare_(clean);
  const normalizedWord = agfNormalizeForCompare_(word);
  if (!normalizedWord || normalizedClean.indexOf(normalizedWord) < 0) return clean;

  const originalParts = clean.split(' ');
  const filtered = originalParts.filter(part => agfNormalizeForCompare_(part) !== normalizedWord);
  return agfCleanText_(filtered.join(' '));
}

function agfRemovePhraseInsensitive_(text, phrase) {
  const clean = agfCleanText_(text);
  const normalizedPhrase = agfNormalizeForCompare_(phrase);
  if (!normalizedPhrase) return clean;

  const originalParts = clean.split(' ');
  const phraseTokens = normalizedPhrase.split(' ').filter(Boolean);
  if (!phraseTokens.length) return clean;

  const output = [];
  for (let i = 0; i < originalParts.length; i += 1) {
    const windowTokens = originalParts.slice(i, i + phraseTokens.length).map(agfNormalizeForCompare_);
    if (windowTokens.join(' ') === phraseTokens.join(' ')) {
      i += phraseTokens.length - 1;
      continue;
    }
    output.push(originalParts[i]);
  }

  return agfCleanText_(output.join(' '));
}

function agfExtractTrailingNumber_(text) {
  const clean = agfCleanText_(text);
  const match = clean.match(/(?:^|\s)(\d{1,6})(?:\s*)$/);
  if (!match) return { text: clean, number: '' };

  return {
    text: agfCleanText_(clean.slice(0, clean.length - match[1].length)),
    number: match[1]
  };
}

function agfRemoveStreetTypePrefix_(text) {
  const clean = agfCleanText_(text);
  const parts = clean.split(' ');
  if (!parts.length) return clean;

  const first = agfNormalizeForCompare_(parts[0]).replace(/\.$/, '');
  const prefixes = AGF_STREET_TYPE_PREFIXES.map(agfNormalizeForCompare_);
  if (prefixes.indexOf(first) >= 0) {
    return agfCleanText_(parts.slice(1).join(' '));
  }

  return clean;
}

function agfBuildAddressQueryVariants_(logradouro) {
  const clean = agfCleanText_(logradouro);
  const noNumber = agfExtractTrailingNumber_(clean).text;
  const noType = agfRemoveStreetTypePrefix_(noNumber);
  const accentless = agfStripAccents_(noNumber);
  const accentlessNoType = agfStripAccents_(noType);

  const base = agfUniqueStrings_([
    noNumber,
    noType,
    accentless,
    accentlessNoType
  ]).filter(item => item.length >= 3);

  const expanded = [];
  base.forEach(item => {
    expanded.push(item);
    agfBuildPortugueseAccentVariants_(item).forEach(variant => expanded.push(variant));
  });

  return agfUniqueStrings_(expanded).filter(item => item.length >= 3);
}

function agfBuildPortugueseAccentVariants_(text) {
  const clean = agfCleanText_(text);
  if (!clean) return [];

  const replacements = [
    [/\bTomasia\b/gi, 'Tomásia'],
    [/\bJoao\b/gi, 'João'],
    [/\bJose\b/gi, 'José'],
    [/\bAntonio\b/gi, 'Antônio'],
    [/\bSao\b/gi, 'São'],
    [/\bBrasilia\b/gi, 'Brasília'],
    [/\bCeara\b/gi, 'Ceará'],
    [/\bGoias\b/gi, 'Goiás'],
    [/\bPara\b/gi, 'Pará'],
    [/\bParana\b/gi, 'Paraná'],
    [/\bPiaui\b/gi, 'Piauí'],
    [/\bMaranhao\b/gi, 'Maranhão'],
    [/\bRondonia\b/gi, 'Rondônia'],
    [/\bEspirito\b/gi, 'Espírito']
  ];

  const variants = [];
  replacements.forEach(pair => {
    const next = clean.replace(pair[0], pair[1]);
    if (next !== clean) variants.push(next);
  });

  return agfUniqueStrings_(variants);
}

function agfAppendQueryParam_(url, key, value) {
  if (value === undefined || value === null || String(value).trim() === '') return url;
  const separator = url.indexOf('?') >= 0 ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}

function agfParseDateMaybe_(value) {
  const clean = agfCleanText_(value);
  if (!clean) return null;
  const date = new Date(clean);
  return Number.isNaN(date.getTime()) ? null : date;
}

function agfSecondsUntil_(date) {
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.floor((date.getTime() - Date.now()) / 1000);
}

function agfTitleCase_(value) {
  return agfCleanText_(value)
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function agfIsTemporaryProviderError_(message) {
  const clean = agfCleanText_(message).toLowerCase();
  return (
    clean.indexOf('http_408') >= 0 ||
    clean.indexOf('http_429') >= 0 ||
    /http_5\d\d/.test(clean) ||
    clean.indexOf('gtw-005') >= 0 ||
    clean.indexOf('timeout') >= 0 ||
    clean.indexOf('tempo limite') >= 0 ||
    clean.indexOf('service unavailable') >= 0 ||
    clean.indexOf('temporarily unavailable') >= 0
  );
}

function agfMovePreferredToFront_(values, preferred) {
  const cleanPreferred = agfNormalizeForKey_(preferred);
  const list = agfUniqueStrings_(values || []);
  if (!cleanPreferred) return list;

  const preferredItems = [];
  const otherItems = [];
  list.forEach(item => {
    if (agfNormalizeForKey_(item) === cleanPreferred) preferredItems.push(item);
    else otherItems.push(item);
  });

  return preferredItems.concat(otherItems);
}

function agfChunkArray_(values, size) {
  const chunkSize = Math.max(1, agfToInt_(size, 10));
  const list = Array.isArray(values) ? values : [];
  const chunks = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize));
  }
  return chunks;
}

function agfNormalizeStreetTypeForCorreios_(value) {
  const normalized = agfNormalizeForCompare_(value).replace(/\.$/, '');
  const map = {
    R: 'Rua',
    RUA: 'Rua',
    AV: 'Avenida',
    AVENIDA: 'Avenida',
    TV: 'Travessa',
    TRAVESSA: 'Travessa',
    AL: 'Alameda',
    ALAMEDA: 'Alameda',
    ROD: 'Rodovia',
    RODOVIA: 'Rodovia',
    EST: 'Estrada',
    ESTRADA: 'Estrada',
    PC: 'Praça',
    PRACA: 'Praça',
    PRAÇA: 'Praça',
    LARGO: 'Largo',
    VIELA: 'Viela',
    PASSAGEM: 'Passagem',
    PASSARELA: 'Passarela',
    BECO: 'Beco',
    LADEIRA: 'Ladeira',
    VIA: 'Via'
  };
  return map[normalized] || '';
}

