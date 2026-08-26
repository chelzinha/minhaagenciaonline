function centralAgfNormalizeText_(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function centralAgfHeaderMap_(header) {
  const map = {};
  header.forEach(function(name, index) {
    const key = centralAgfNormalizeText_(name);
    if (key) map[key] = index;
  });
  return map;
}

function centralAgfParseDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function centralAgfDateKey_(value) {
  const date = centralAgfParseDate_(value);
  if (!date) return '';
  return Utilities.formatDate(date, CENTRAL_AGF_CFG.TIMEZONE, 'yyyy-MM-dd');
}

function centralAgfFindUniqueFileIdByName_(name) {
  const files = DriveApp.getFilesByName(name);
  const ids = [];
  while (files.hasNext() && ids.length < 3) ids.push(files.next().getId());
  if (ids.length !== 1) {
    throw new Error('Esperado exatamente 1 arquivo com nome "' + name + '", encontrados: ' + ids.length + '.');
  }
  return ids[0];
}

function centralAgfGetRequiredProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('Configuração ausente em Script Properties: ' + key + '. Execute centralAgfAutoConfigurar().');
  return value;
}

function centralAgfEnsureRows_(sheet, requiredRows) {
  const current = sheet.getMaxRows();
  if (requiredRows > current) sheet.insertRowsAfter(current, requiredRows - current);
}

function centralAgfClearBelowHeader_(sheet) {
  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();
  if (maxRows > 1 && maxCols > 0) sheet.getRange(2, 1, maxRows - 1, maxCols).clearContent();
}

function centralAgfSetPanelStatus_(status, detail) {
  try {
    const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(queryId);
    const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.PANEL);
    if (!sheet) return;
    sheet.getRange('A5:B7').setValues([
      ['STATUS', status],
      ['DETALHE', detail || ''],
      ['ATUALIZADO_EM', new Date()]
    ]);
  } catch (err) {
    console.log('Falha ao atualizar painel: ' + err.message);
  }
}

function centralAgfWithScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
