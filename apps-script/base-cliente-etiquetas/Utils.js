function sanitizeText_(value) {
  return String(value == null ? '' : value).trim();
}

function digitsOnly_(value) {
  return String(value || '').replace(/\D/g, '');
}

function upper_(value) {
  return sanitizeText_(value).toUpperCase();
}

function toMoneyNumber_(value) {
  if (value == null || value === '') return 0;
  const txt = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const num = Number(txt);
  return isNaN(num) ? 0 : num;
}

function splitPhoneBr_(value) {
  const d = digitsOnly_(value);
  if (!d) return { ddd: '', numero: '' };
  if (d.length <= 2) return { ddd: d, numero: '' };
  return {
    ddd: d.slice(0, 2),
    numero: d.slice(2)
  };
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function uid_(prefix) {
  return prefix + '_' + Utilities.getUuid().slice(0, 8);
}

function truncate_(value, maxLen) {
  const txt = sanitizeText_(value);
  return txt.length > maxLen ? txt.slice(0, maxLen) + '...' : txt;
}

function getDataObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getDisplayValues();
  if (!values.length) return [];

  const headers = values[0].map(h => String(h).trim());

  return values
    .slice(1)
    .filter(r => r.some(v => String(v).trim() !== ''))
    .map((row, idx) => {
      const obj = { _row: idx + 2 };
      headers.forEach((h, i) => obj[h] = row[i] ?? '');
      return obj;
    });
}

function findClientByLogin_(login) {
  const rows = getDataObjects_(CFG.SHEETS.CLIENTES);
  const needle = sanitizeText_(login).toLowerCase();
  return rows.find(r => sanitizeText_(r.LOGIN_APP).toLowerCase() === needle) || null;
}

function findClientRowByLogin_(loginApp) {
  const sh = getSheet_(CFG.SHEETS.CLIENTES);
  const data = sh.getDataRange().getDisplayValues();
  if (!data.length) return null;
  const headers = data[0];
  const idx = headers.indexOf('LOGIN_APP');
  if (idx < 0) return null;

  const target = sanitizeText_(loginApp).toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (sanitizeText_(data[i][idx]).toLowerCase() === target) return i + 1;
  }
  return null;
}

function buildSessionPayload_(client) {
  return {
    ID_CRM: client.ID_CRM,
    LOGIN_APP: client.LOGIN_APP,
    NOME_REMETENTE: client.NOME_REMETENTE,
    NOME_FANTASIA: client.NOME_FANTASIA,
    CNPJ_CPF: client.CNPJ_CPF,
    EMAIL: client.EMAIL,
    WHATSAPP: client.WHATSAPP,
    CONTATO: client.CONTATO,
    ENDERECO: client.ENDERECO,
    NUMERO: client.NUMERO,
    BAIRRO: client.BAIRRO,
    CEP: client.CEP,
    CIDADE_REMETENTE: client.CIDADE_REMETENTE || 'FORTALEZA',
    UF_REMETENTE: client.UF_REMETENTE || 'CE',
    NUM_CONTRATO: client.NUM_CONTRATO,
    CARTAO_POSTAGEM: client.CARTAO_POSTAGEM,
    SEGMENTO: client.SEGMENTO,
    LOGIN_IDCORREIOS: client.LOGIN_IDCORREIOS,
    STATUS_TESTE_CWS: client.STATUS_TESTE_CWS,
    AMBIENTE_CWS: client.AMBIENTE_CWS || ''
  };
}

function writeLog_(tipo, modulo, acao, payload) {
  const sh = getSheet_(CFG.SHEETS.LOG);
  sh.appendRow([
    nowIso_(),
    sanitizeText_(tipo),
    sanitizeText_(modulo),
    sanitizeText_(acao),
    sanitizeText_(payload && payload.idCrm),
    sanitizeText_(payload && payload.login),
    sanitizeText_(payload && payload.referencia),
    sanitizeText_(payload && payload.status),
    sanitizeText_(payload && payload.mensagem),
    sanitizeText_(payload && payload.detalhes)
  ]);
}

function safeJsonFromResponse_(resp) {
  if (!resp) return null;
  if (resp.json) return resp.json;
  const txt = sanitizeText_(resp.text);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function extractFirstValueByKeys_(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (var i = 0; i < keys.length; i++) {
    var direct = deepFindByKey_(obj, keys[i]);
    if (direct !== '' && direct != null) return String(direct);
  }
  return '';
}

function deepFindByKey_(obj, wantedKey) {
  if (obj == null) return '';

  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      var foundArr = deepFindByKey_(obj[i], wantedKey);
      if (foundArr !== '' && foundArr != null) return foundArr;
    }
    return '';
  }

  if (typeof obj === 'object') {
    var keys = Object.keys(obj);

    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (String(key).toLowerCase() === String(wantedKey).toLowerCase()) {
        return obj[key];
      }
    }

    for (var j = 0; j < keys.length; j++) {
      var nested = deepFindByKey_(obj[keys[j]], wantedKey);
      if (nested !== '' && nested != null) return nested;
    }
  }

  return '';
}
