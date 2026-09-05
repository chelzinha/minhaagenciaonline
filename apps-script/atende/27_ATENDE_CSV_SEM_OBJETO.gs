// ============================================================
// ATENDE - INDICE TECNICO PARA ATENDIMENTOS SEM CODIGO DE OBJETO
// Mantem Objeto vazio no painel e usa o ATENDIMENTO real do CSV como chave.
// ============================================================

var ATENDE_CSV_NO_OBJECT_SHEET = 'IDX_CSV_ATENDIMENTOS';
var ATENDE_CSV_NO_OBJECT_HEADERS = ['AtendimentoId', 'PostagensRow', 'Data', 'AtualizadoEm'];

function ATENDE_getNoObjectKeyIndex_() {
  const ss = getSpreadsheet();
  const sheet = ATENDE_getOrCreateNoObjectKeySheet_(ss);
  const map = new Map();
  if (sheet.getLastRow() < 2) return { sheet: sheet, map: map };

  sheet.getRange(2, 1, sheet.getLastRow() - 1, ATENDE_CSV_NO_OBJECT_HEADERS.length)
    .getValues()
    .forEach(function(row, index) {
      const id = ATENDE_cleanCsvValue_(row[0]);
      const postagensRow = Number(row[1]);
      if (!id || !postagensRow) return;
      map.set(id, { postagensRow: postagensRow, indexRow: index + 2 });
    });
  return { sheet: sheet, map: map };
}

function ATENDE_getOrCreateNoObjectKeySheet_(ss) {
  let sheet = ss.getSheetByName(ATENDE_CSV_NO_OBJECT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ATENDE_CSV_NO_OBJECT_SHEET);
    sheet.getRange(1, 1, 1, ATENDE_CSV_NO_OBJECT_HEADERS.length)
      .setValues([ATENDE_CSV_NO_OBJECT_HEADERS]);
    sheet.setFrozenRows(1);
    try { sheet.hideSheet(); } catch (_) {}
  }
  return sheet;
}

function ATENDE_appendNoObjectKeys_(entries) {
  if (!entries || !entries.length) return;
  const ss = getSpreadsheet();
  const sheet = ATENDE_getOrCreateNoObjectKeySheet_(ss);
  const rows = entries.map(function(entry) {
    return [entry.atendimentoId, entry.postagensRow, entry.data || '', new Date()];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  SpreadsheetApp.flush();
}
