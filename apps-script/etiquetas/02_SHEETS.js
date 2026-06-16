/**
 * APP ETIQUETAS AGF — 02_SHEETS.gs
 * Acesso à planilha com cache local de execução.
 *
 * Por que cache local? SpreadsheetApp.openById() é caro e cada chamada
 * conta na quota. Em uma única execução de doPost, podemos abrir a SS
 * dezenas de vezes. Cache no escopo da execução resolve sem complicar
 * (cada execução é stateless, então não há risco de stale data).
 */

let __SS_CACHE = null;
let __SHEET_CACHE = {};

function getSs_() {
  if (!__SS_CACHE) {
    __SS_CACHE = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  }
  return __SS_CACHE;
}

function getSheet_(name) {
  if (__SHEET_CACHE[name]) return __SHEET_CACHE[name];
  const sh = getSs_().getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada na planilha: ' + name);
  __SHEET_CACHE[name] = sh;
  return sh;
}

/**
 * Versão tolerante do getSheet_: se a aba não existir, cria.
 *
 * Use nas funções ensure*Headers_ ou em qualquer ponto onde a aba
 * possa ainda não ter sido criada manualmente. Para leituras comuns
 * (que esperam dados já populados), prefira getSheet_ — que falha
 * fast se a aba estiver faltando.
 *
 * Observação: o getSheet_ antes desta função também usava erro para
 * sinalizar aba faltando. Preservamos esse comportamento intocado
 * em getSheet_ (zero regressão) e criamos esta variante para os
 * casos onde auto-criar é o comportamento desejado.
 */
function getOrCreateSheet_(name) {
  if (__SHEET_CACHE[name]) return __SHEET_CACHE[name];
  const ss = getSs_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    // Move pro final (não vira a aba ativa — menos confuso pro usuário)
    try { ss.setActiveSheet(ss.getSheets()[0]); } catch (e) {}
  }
  __SHEET_CACHE[name] = sh;
  return sh;
}

/**
 * Lê todas as linhas da aba como objetos { coluna: valor }.
 * Adiciona _row com o número da linha (1-indexed) para writes posteriores.
 */
function readSheetAsObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const headers = values[0].map(h => String(h).trim());

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row.some(v => String(v).trim() !== '')) continue;
    const obj = { _row: i + 1 };
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c] || '';
    }
    out.push(obj);
  }
  return out;
}

/**
 * Encontra o índice (1-based) da coluna pelo header.
 */
function getColIndex_(sheetName, headerName) {
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === headerName) return i + 1;
  }
  return -1;
}

/**
 * Atualiza uma única célula pela coluna nomeada.
 */
function updateCellByHeader_(sheetName, row, headerName, value) {
  const col = getColIndex_(sheetName, headerName);
  if (col < 0) {
    console.warn('Coluna não encontrada: ' + headerName + ' na aba ' + sheetName);
    return;
  }
  getSheet_(sheetName).getRange(row, col).setValue(value);
}

/**
 * Atualiza várias células de uma vez (batch).
 * patch = { 'NOME_COLUNA': valor, ... }
 */
function updateRowByHeader_(sheetName, row, patch) {
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  Object.keys(patch).forEach(headerName => {
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === headerName) {
        sh.getRange(row, i + 1).setValue(patch[headerName]);
        return;
      }
    }
  });
}

/**
 * Append em batch usando os headers da aba como mapa.
 * Aceita um objeto { COLUNA: valor } e respeita a ordem dos headers.
 * Mais seguro do que appendRow([...]) porque não depende da ordem.
 */
function appendByHeaders_(sheetName, obj) {
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const row = headers.map(h => {
    const key = String(h).trim();
    return key && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : '';
  });
  sh.appendRow(row);
  return sh.getLastRow();
}

/**
 * Lock helper. Use sempre que escrever em planilha vinda de doPost.
 * Wrapper de LockService que libera no finally automaticamente.
 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(SYS.LOCK_TIMEOUT_MS);
  } catch (e) {
    throw new Error('Sistema ocupado, tente novamente em alguns segundos.');
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}