/**
 * APP ETIQUETAS AGF — 21_BALCAO_HELPERS.gs
 */

function getBalcaoSpreadsheet_() {
  if (typeof CFG === 'undefined' || !CFG.SPREADSHEET_ID) {
    throw new Error('CFG.SPREADSHEET_ID não configurado.');
  }
  return SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
}

function getBalcaoConfig_() {
  const ss = getBalcaoSpreadsheet_();
  const sh = ss.getSheetByName(BCFG.SHEETS.CONFIG);
  const out = Object.assign({}, BCFG.DEFAULTS);
  if (!sh) return out;
  const rows = sheetToObjects_(sh);
  rows.forEach(r => {
    const k = upper_(r.CHAVE);
    if (!k) return;
    out[k] = r.VALOR;
  });
  return out;
}

function sheetToObjects_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(h => upper_(h).replace(/\s+/g, '_'));
  return values
    .filter(row => row.some(v => String(v || '').trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function balcaoMoney_(value) {
  const n = Number(value || 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function balcaoToNumber_(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  s = s.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function balcaoDigits_(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function balcaoIsCep_(cep) {
  return /^\d{8}$/.test(balcaoDigits_(cep));
}

function balcaoNormalizeUf_(uf) {
  return upper_(uf).replace(/[^A-Z]/g, '').slice(0,2);
}

function balcaoNormalizeText_(s) {
  s = String(s == null ? '' : s).trim().toUpperCase();
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Ç/g, 'C');
}

function balcaoIsCapital_(uf, cidade) {
  const cap = BCFG.CAPITAIS[balcaoNormalizeUf_(uf)] || '';
  return cap && balcaoNormalizeText_(cidade) === cap;
}

function balcaoFormatCep_(cep) {
  const d = balcaoDigits_(cep);
  return d.length === 8 ? d.slice(0,5) + '-' + d.slice(5) : d;
}

function balcaoFormatMoneyBR_(value) {
  const n = balcaoMoney_(value);
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function balcaoLog_(nivel, modulo, acao, mensagem, json) {
  try {
    const ss = getBalcaoSpreadsheet_();
    let sh = ss.getSheetByName(BCFG.SHEETS.LOG);
    if (!sh) sh = ensureBalcaoSheet_(ss, BCFG.SHEETS.LOG, ['DATA_HORA','NIVEL','MODULO','ACAO','MENSAGEM','JSON']);
    sh.appendRow([new Date(), nivel, modulo, acao, mensagem || '', json ? JSON.stringify(json).slice(0, 4000) : '']);
  } catch (e) {
    // não quebrar a cotação por falha de log
  }
}

function balcaoBuildQuery_(query) {
  const parts = [];
  Object.keys(query || {}).forEach(k => {
    const v = query[k];
    if (v == null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

function balcaoSafeJson_(text) {
  try { return JSON.parse(text); } catch(e) { return null; }
}

/**
 * Consulta CEP da Calculadora Balcão.
 *
 * REGRA SEM REGRESSÃO:
 * - Não usa a action privada `cep` do /app, porque ela exige sessionToken.
 * - Usa a MESMA função oficial do /app (`buscarCepCorreios_`), porém com
 *   as credenciais isoladas do balcão gravadas por `balcaoConfigurarApiPrazo`.
 * - A função `buscarCepCorreios_` já tenta Correios API primeiro e só usa
 *   ViaCEP como contingência, exatamente como no /app.
 */
function balcaoBuscarCep_(cep) {
  const d = balcaoDigits_(cep);
  if (!balcaoIsCep_(d)) throw new Error('CEP inválido. Informe 8 dígitos.');

  const cache = CacheService.getScriptCache();
  const key = 'BALCAO_CEP_CORREIOS_' + d;
  const cached = cache.get(key);
  if (cached) {
    const parsed = balcaoSafeJson_(cached);
    if (parsed) return parsed;
  }

  const client = balcaoGetCwsClientParaCep_();
  const out = buscarCepCorreios_(client, d);

  // Marca a origem para debug sem alterar o formato consumido pelo front.
  out.fonte = out.fonte ? ('BALCAO_' + out.fonte) : 'BALCAO_CORREIOS';

  cache.put(key, JSON.stringify(out), 60 * 60 * 24);
  return out;
}

/**
 * Monta um "client" compatível com cwsRequest_/cwsGetToken_,
 * usando apenas as propriedades isoladas do módulo balcão.
 */
function balcaoGetCwsClientParaCep_() {
  const props = PropertiesService.getScriptProperties();
  const login = sanitize_(props.getProperty(BCFG.PROPS.PRAZO_LOGIN));
  const tokenApi = sanitize_(props.getProperty(BCFG.PROPS.PRAZO_TOKEN_API));
  const cartao = balcaoDigits_(props.getProperty(BCFG.PROPS.PRAZO_CARTAO));
  const ambiente = upper_(props.getProperty(BCFG.PROPS.PRAZO_AMBIENTE) || 'PRODUCAO');

  if (!login || !tokenApi || !cartao) {
    throw new Error('Busca de CEP do balcão não configurada. Rode balcaoConfigurarApiPrazo(login, senhaApi, cartao, ambiente).');
  }

  return {
    LOGIN_IDCORREIOS: login,
    TOKEN_API: tokenApi,
    CARTAO_POSTAGEM: cartao,
    AMBIENTE_CWS: ambiente
  };
}
