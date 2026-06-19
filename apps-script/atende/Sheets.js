// ============================================================
//  GOOGLE SHEETS - LEITURA, ESCRITA E UPSERT EM LOTE
// ============================================================

function ensureSheetWithHeaders_(spreadsheet, name, desiredHeaders) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  var headers = desiredHeaders.slice();
  ensureGridSize_(sheet, 1, headers.length);

  var current = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(safe_)
    : [];

  var normalized = normalizeExistingHeaders_(current, headers);
  if (!headersMatch_(normalized, headers) || !headersMatch_(current, headers)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  if (sheet.getMaxColumns() > headers.length) {
    sheet.deleteColumns(headers.length + 1, sheet.getMaxColumns() - headers.length);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#00416B')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  return sheet;
}

function normalizeExistingHeaders_(headers, desiredHeaders) {
  var desired = {};
  desiredHeaders.forEach(function(header) { desired[header] = header; });
  Object.keys(ATENDE_SOURCE_ALIASES).forEach(function(finalHeader) {
    ATENDE_SOURCE_ALIASES[finalHeader].forEach(function(alias) {
      desired[alias] = finalHeader;
    });
  });
  return headers.map(function(header) { return desired[header] || header; });
}

function applyPostagensFormatting_(sheet) {
  if (!sheet) return;
  var headers = ATENDE_POSTAGENS_HEADERS;
  headers.forEach(function(header, index) {
    var col = index + 1;
    sheet.setColumnWidth(col, ATENDE_COLUMN_WIDTHS[header] || 130);
    if (ATENDE_TEXT_COLUMNS.indexOf(header) >= 0) {
      sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    }
  });

  setColumnFormat_(sheet, headers, 'Data', 'dd/MM/yyyy HH:mm');
  setColumnFormat_(sheet, headers, 'Valor', '#,##0.00');
  setColumnFormat_(sheet, headers, 'VD', '#,##0.00');
}

function setColumnFormat_(sheet, headers, header, format) {
  var index = headers.indexOf(header);
  if (index < 0) return;
  sheet.getRange(2, index + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat(format);
}

function readSheetMatrix_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = lastCol
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(safe_)
    : [];
  var rows = lastRow >= 2 && headers.length
    ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    : [];
  var indexByHeader = {};
  headers.forEach(function(header, index) { indexByHeader[header] = index; });
  return { headers: headers, rows: rows, indexByHeader: indexByHeader };
}

function readSheetRowsAsObjects_(sheet) {
  var matrix = readSheetMatrix_(sheet);
  return matrix.rows.map(function(row) {
    var obj = {};
    matrix.headers.forEach(function(header, index) { obj[header] = row[index]; });
    return obj;
  });
}

function upsertPostagens_(records) {
  if (!records.length) {
    return { created: 0, updated: 0, skipped: 0, total: 0 };
  }

  var spreadsheet = getAtendeSpreadsheet_();
  ensureAtendeStructure_(spreadsheet);
  var sheet = spreadsheet.getSheetByName(ATENDE_CONFIG.SHEETS.POSTAGENS);
  var matrix = readSheetMatrix_(sheet);
  var objectIndex = matrix.indexByHeader['Objeto'];
  if (objectIndex == null) throw new Error('Coluna "Objeto" nao encontrada na aba Postagens.');

  var rowByObject = {};
  matrix.rows.forEach(function(row, index) {
    var objectCode = normalizeObjectCode_(row[objectIndex]);
    if (objectCode) rowByObject[objectCode] = index;
  });

  var createdRows = [];
  var changedIndexes = {};
  var created = 0;
  var updated = 0;
  var skipped = 0;

  records.forEach(function(record) {
    var normalized = normalizePostagemRecord_(record);
    var objectCode = normalizeObjectCode_(normalized['Objeto']);
    if (!objectCode) {
      skipped++;
      return;
    }

    if (rowByObject[objectCode] == null) {
      var newRow = matrix.headers.map(function(header) { return normalized[header] || ''; });
      createdRows.push(newRow);
      rowByObject[objectCode] = matrix.rows.length + createdRows.length - 1;
      created++;
      return;
    }

    var rowIndex = rowByObject[objectCode];
    var row = matrix.rows[rowIndex];
    var changed = false;
    matrix.headers.forEach(function(header, colIndex) {
      if (header === 'Objeto') return;
      var nextValue = normalized[header];
      if (!isMeaningful_(nextValue)) return;
      var currentValue = row[colIndex];
      if (!valuesEquivalent_(currentValue, nextValue)) {
        row[colIndex] = nextValue;
        changed = true;
      }
    });

    if (changed) {
      changedIndexes[rowIndex] = true;
      updated++;
    } else {
      skipped++;
    }
  });

  writeChangedRows_(sheet, matrix.rows, changedIndexes, matrix.headers.length);
  if (createdRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, createdRows.length, matrix.headers.length).setValues(createdRows);
  }

  clearAtendeCache_();
  return {
    created: created,
    updated: updated,
    skipped: skipped,
    total: records.length,
  };
}

function writeChangedRows_(sheet, rows, changedIndexes, columnCount) {
  var indexes = Object.keys(changedIndexes).map(Number).sort(function(a, b) { return a - b; });
  if (!indexes.length) return;

  var blockStart = indexes[0];
  var previous = indexes[0];
  for (var i = 1; i <= indexes.length; i++) {
    var current = indexes[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    var block = rows.slice(blockStart, previous + 1);
    sheet.getRange(blockStart + 2, 1, block.length, columnCount).setValues(block);
    blockStart = current;
    previous = current;
  }
}

function appendRows_(sheetName, rows) {
  if (!rows.length) return;
  var spreadsheet = getAtendeSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Aba nao encontrada: ' + sheetName);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function ensureGridSize_(sheet, minRows, minCols) {
  if (sheet.getMaxRows() < minRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), minRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < minCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), minCols - sheet.getMaxColumns());
  }
}

function headersMatch_(currentHeaders, desiredHeaders) {
  if (currentHeaders.length < desiredHeaders.length) return false;
  for (var i = 0; i < desiredHeaders.length; i++) {
    if (currentHeaders[i] !== desiredHeaders[i]) return false;
  }
  return true;
}
