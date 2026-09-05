// ============================================================
// ATENDE - IMPORTACAO DO CSV DIARIO
// ============================================================

function ATENDE_importarArquivoCsv_(file, metaSignature) {
  const parsed = ATENDE_lerCsv_(file);
  const contentHash = ATENDE_sha256_(parsed.text);

  if (ATENDE_hashJaImportado_(contentHash)) {
    ATENDE_marcarMetaProcessada_(metaSignature);
    return {
      fileId: file.getId(), fileName: file.getName(), status: 'duplicate_file_content',
      totalRows: parsed.rows.length, added: 0, skipped: parsed.rows.length,
      invalidWithoutObject: 0, hash: contentHash
    };
  }

  const sheet = getSheet();
  normalizeSheetStructure_(sheet);
  const objectColumn = HEADER_LABELS.indexOf('Objeto') + 1;
  if (objectColumn <= 0) throw new Error('Coluna "Objeto" nao encontrada na estrutura canonica do Atende.');

  const existingCodes = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, objectColumn, lastRow - 1, 1).getDisplayValues().forEach(function(row) {
      const code = normalizeObjectCode_(ATENDE_cleanCsvValue_(row[0]));
      if (code) existingCodes.add(code);
    });
  }

  const batchCodes = new Set();
  const newRecords = [];
  let duplicateExisting = 0;
  let duplicatePayload = 0;
  let invalidWithoutObject = 0;

  parsed.rows.forEach(function(raw) {
    const record = ATENDE_mapearLinhaCsv_(raw);
    const objectCode = normalizeObjectCode_(record.codObjeto);
    if (!objectCode) { invalidWithoutObject++; return; }
    record.codObjeto = objectCode;
    if (batchCodes.has(objectCode)) { duplicatePayload++; return; }
    batchCodes.add(objectCode);
    if (existingCodes.has(objectCode)) { duplicateExisting++; return; }
    newRecords.push(record);
    existingCodes.add(objectCode);
  });

  if (newRecords.length) {
    const rows = newRecords.map(function(record) {
      return HEADERS.map(function(key) { return record[key] == null ? '' : record[key]; });
    });
    validarLinhasAntesDeInserir_(newRecords, rows);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADER_LABELS.length).setValues(rows);
    SpreadsheetApp.flush();
  }

  const skipped = duplicateExisting + duplicatePayload + invalidWithoutObject;
  ATENDE_logImportacaoCsv_({
    file: file, hash: contentHash, totalRows: parsed.rows.length,
    totalObjects: parsed.rows.length - invalidWithoutObject,
    added: newRecords.length, skipped: skipped,
    invalidWithoutObject: invalidWithoutObject,
    duplicateExisting: duplicateExisting, duplicatePayload: duplicatePayload
  });
  ATENDE_marcarMetaProcessada_(metaSignature);

  return {
    fileId: file.getId(), fileName: file.getName(), status: 'imported',
    totalRows: parsed.rows.length, totalObjects: parsed.rows.length - invalidWithoutObject,
    added: newRecords.length, skipped: skipped,
    duplicateExisting: duplicateExisting, duplicatePayload: duplicatePayload,
    invalidWithoutObject: invalidWithoutObject, hash: contentHash
  };
}
