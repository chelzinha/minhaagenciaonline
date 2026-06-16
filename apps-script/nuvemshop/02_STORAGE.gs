function getSpreadsheet_() {
  const cfg = getConfig_();
  if (cfg.spreadsheetId) return SpreadsheetApp.openById(cfg.spreadsheetId);

  const active = SpreadsheetApp.getActive();
  if (active) {
    PropertiesService.getScriptProperties().setProperty(CFG.PROP.SPREADSHEET_ID, active.getId());
    return active;
  }

  const ss = SpreadsheetApp.create('Nuvemshop Connector');
  PropertiesService.getScriptProperties().setProperty(CFG.PROP.SPREADSHEET_ID, ss.getId());
  return ss;
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (!lastRow || !lastCol) {
    sh.clearContents();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }

  const currentHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });

  const existingSet = {};
  currentHeaders.forEach(function(h) {
    if (h) existingSet[h] = true;
  });

  const missing = headers.filter(function(h) { return !existingSet[h]; });
  if (missing.length) {
    const newHeaders = currentHeaders.concat(missing);
    sh.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  }

  sh.setFrozenRows(1);
  return sh;
}

function getSheetHeaderMap_(sheetName) {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Aba não encontrada: ' + sheetName);
  if (sh.getLastRow() < 1) throw new Error('Aba sem cabeçalho: ' + sheetName);

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });

  const map = {};
  headers.forEach(function(h, i) {
    if (!(h in map)) map[h] = i;
  });

  return { sh: sh, headers: headers, map: map };
}

function setupConnector_() {
  const ss = getSpreadsheet_();
  ensureSheet_(ss, CFG.SHEETS.STORES, CFG.HEADERS.STORES);
  ensureSheet_(ss, CFG.SHEETS.ORDERS, CFG.HEADERS.ORDERS);
  ensureSheet_(ss, CFG.SHEETS.ORDER_ITEMS, CFG.HEADERS.ORDER_ITEMS);
  ensureSheet_(ss, CFG.SHEETS.WEBHOOKS, CFG.HEADERS.WEBHOOKS);
  ensureSheet_(ss, CFG.SHEETS.LOGS, CFG.HEADERS.LOGS);
  return ss.getUrl();
}

function runSetupConnector() {
  return setupConnector_();
}

function sheetRowsAsObjects_(sheetName) {
  const meta = getSheetHeaderMap_(sheetName);
  const sh = meta.sh;
  if (sh.getLastRow() < 2) return [];

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, meta.headers.length).getValues();
  return values.map(function(row) {
    const obj = {};
    meta.headers.forEach(function(h, i) {
      obj[h] = row[i];
    });
    return obj;
  });
}

function appendLog_(level, eventName, storeId, orderId, message, details) {
  const ss = getSpreadsheet_();
  const sh = ensureSheet_(ss, CFG.SHEETS.LOGS, CFG.HEADERS.LOGS);
  sh.appendRow([
    nowIso_(),
    level || 'INFO',
    eventName || '',
    storeId || '',
    orderId || '',
    message || '',
    typeof details === 'string' ? details : stringifySafe_(details || {})
  ]);
}

function upsertStore_(record) {
  const meta = getSheetHeaderMap_(CFG.SHEETS.STORES);
  const sh = meta.sh;
  const headers = meta.headers;
  const map = meta.map;
  const dataRows = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues() : [];
  const keyCol = map.USER_ID;
  if (keyCol === undefined) throw new Error('Coluna USER_ID não encontrada em STORES.');

  const rowIndex = dataRows.findIndex(function(r) {
    return String(r[keyCol]) === String(record.USER_ID);
  });

  if (rowIndex >= 0) {
    const existing = dataRows[rowIndex].slice();
    headers.forEach(function(h, i) {
      if (record[h] !== undefined) existing[i] = record[h];
    });
    sh.getRange(rowIndex + 2, 1, 1, headers.length).setValues([existing]);
  } else {
    const rowData = headers.map(function(h) {
      return record[h] !== undefined ? record[h] : '';
    });
    sh.appendRow(rowData);
  }
}

function getStoreById_(storeId) {
  return sheetRowsAsObjects_(CFG.SHEETS.STORES).find(function(r) {
    return String(r.USER_ID) === String(storeId);
  }) || null;
}

function getFirstActiveStore_() {
  return sheetRowsAsObjects_(CFG.SHEETS.STORES).find(function(r) {
    return String(r.STATUS || '').toUpperCase() === 'ACTIVE';
  }) || null;
}

function upsertOrder_(record) {
  const meta = getSheetHeaderMap_(CFG.SHEETS.ORDERS);
  const sh = meta.sh;
  const headers = meta.headers;
  const map = meta.map;
  const dataRows = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues() : [];
  const storeCol = map.STORE_ID;
  const orderCol = map.ORDER_ID;
  if (storeCol === undefined || orderCol === undefined) throw new Error('Colunas STORE_ID/ORDER_ID não encontradas em ORDERS.');

  const rowIndex = dataRows.findIndex(function(r) {
    return String(r[storeCol]) === String(record.STORE_ID) && String(r[orderCol]) === String(record.ORDER_ID);
  });

  if (rowIndex >= 0) {
    const existing = dataRows[rowIndex].slice();
    headers.forEach(function(h, i) {
      if (record[h] !== undefined) existing[i] = record[h];
    });
    sh.getRange(rowIndex + 2, 1, 1, headers.length).setValues([existing]);
  } else {
    const rowData = headers.map(function(h) {
      return record[h] !== undefined ? record[h] : '';
    });
    sh.appendRow(rowData);
  }
}

function replaceOrderItems_(storeId, orderId, items) {
  const meta = getSheetHeaderMap_(CFG.SHEETS.ORDER_ITEMS);
  const sh = meta.sh;
  const headers = meta.headers;
  const map = meta.map;
  const dataRows = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues() : [];
  const storeCol = map.STORE_ID;
  const orderCol = map.ORDER_ID;

  const keepRows = dataRows.filter(function(r) {
    return !(String(r[storeCol]) === String(storeId) && String(r[orderCol]) === String(orderId));
  });

  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (keepRows.length) {
    sh.getRange(2, 1, keepRows.length, headers.length).setValues(keepRows);
  }

  if (items && items.length) {
    const startRow = sh.getLastRow() + 1;
    const rows = items.map(function(item) {
      return headers.map(function(h) {
        return item[h] !== undefined ? item[h] : '';
      });
    });
    sh.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  }

  sh.setFrozenRows(1);
}

function upsertWebhookRow_(record) {
  const meta = getSheetHeaderMap_(CFG.SHEETS.WEBHOOKS);
  const sh = meta.sh;
  const headers = meta.headers;
  const map = meta.map;
  const dataRows = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues() : [];

  const storeCol = map.STORE_ID;
  const eventCol = map.EVENT;
  const urlCol = map.URL;

  const rowIndex = dataRows.findIndex(function(r) {
    return String(r[storeCol]) === String(record.STORE_ID) &&
      String(r[eventCol]) === String(record.EVENT) &&
      String(r[urlCol]) === String(record.URL);
  });

  if (rowIndex >= 0) {
    const existing = dataRows[rowIndex].slice();
    headers.forEach(function(h, i) {
      if (record[h] !== undefined) existing[i] = record[h];
    });
    sh.getRange(rowIndex + 2, 1, 1, headers.length).setValues([existing]);
  } else {
    const rowData = headers.map(function(h) {
      return record[h] !== undefined ? record[h] : '';
    });
    sh.appendRow(rowData);
  }
}
