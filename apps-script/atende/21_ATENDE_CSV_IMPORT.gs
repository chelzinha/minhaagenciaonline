// ============================================================
// ATENDE - IMPORTACAO E UPSERT DO CSV DIARIO
// ============================================================

function ATENDE_importarArquivoCsv_(file, metaSignature) {
  const parsed = ATENDE_lerCsv_(file);
  const contentHash = ATENDE_sha256_(parsed.text);

  if (ATENDE_hashJaImportado_(contentHash)) {
    ATENDE_marcarMetaProcessada_(metaSignature);
    return {
      fileName: file.getName(), status: 'duplicate_file_content',
      totalRows: parsed.rows.length, added: 0, updated: 0,
      skipped: parsed.rows.length, invalidWithoutObject: 0, hash: contentHash
    };
  }

  const sheet = getSheet();
  normalizeSheetStructure_(sheet);
  const matrix = readSheetMatrix_(sheet);
  const objectIndex = matrix.indexByHeader['Objeto'];
  if (objectIndex == null) throw new Error('Coluna "Objeto" nao encontrada na estrutura canonica do Atende.');

  const rowByObject = new Map();
  matrix.rows.forEach(function(row, index) {
    const code = normalizeObjectCode_(ATENDE_cleanCsvValue_(row[objectIndex]));
    if (code && !rowByObject.has(code)) rowByObject.set(code, index);
  });

  const batchCodes = new Set();
  const changedRowIndexes = new Set();
  const newRecords = [];
  let updatedExisting = 0;
  let unchangedExisting = 0;
  let duplicatePayload = 0;
  let invalidWithoutObject = 0;

  parsed.rows.forEach(function(raw) {
    const record = ATENDE_mapearLinhaCsv_(raw);
    const objectCode = normalizeObjectCode_(record.codObjeto);
    if (!objectCode) { invalidWithoutObject++; return; }
    record.codObjeto = objectCode;

    if (batchCodes.has(objectCode)) { duplicatePayload++; return; }
    batchCodes.add(objectCode);

    if (rowByObject.has(objectCode)) {
      const rowIndex = rowByObject.get(objectCode);
      if (ATENDE_mergeCsvIntoExistingRow_(matrix.rows[rowIndex], record, matrix.indexByHeader)) {
        changedRowIndexes.add(rowIndex);
        updatedExisting++;
      } else {
        unchangedExisting++;
      }
      return;
    }

    newRecords.push(record);
  });

  if (changedRowIndexes.size) {
    writeChangedRowsInBlocks_(sheet, matrix.rows, changedRowIndexes, matrix.headers.length);
  }

  if (newRecords.length) {
    const rows = newRecords.map(function(record) {
      return HEADERS.map(function(key) { return record[key] == null ? '' : record[key]; });
    });
    validarLinhasAntesDeInserir_(newRecords, rows);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADER_LABELS.length).setValues(rows);
    SpreadsheetApp.flush();
  }

  const skipped = unchangedExisting + duplicatePayload + invalidWithoutObject;
  ATENDE_logImportacaoCsv_({
    file: file, hash: contentHash, totalRows: parsed.rows.length,
    totalObjects: parsed.rows.length - invalidWithoutObject,
    added: newRecords.length, updated: updatedExisting, skipped: skipped,
    invalidWithoutObject: invalidWithoutObject,
    unchangedExisting: unchangedExisting, duplicatePayload: duplicatePayload
  });
  ATENDE_marcarMetaProcessada_(metaSignature);

  return {
    fileName: file.getName(), status: 'imported',
    totalRows: parsed.rows.length, totalObjects: parsed.rows.length - invalidWithoutObject,
    added: newRecords.length, updated: updatedExisting, skipped: skipped,
    unchangedExisting: unchangedExisting, duplicatePayload: duplicatePayload,
    invalidWithoutObject: invalidWithoutObject, hash: contentHash
  };
}

function ATENDE_mergeCsvIntoExistingRow_(row, record, indexByHeader) {
  const keys = [
    'dtAtendimento','idAtendente','codigoAtendimento','descricaoAtendimento','categoria',
    'contrato','cartaoPostagem','rem_nome','valorPostagem','formaPagamento','peso',
    'largura','comprimento','altura','diametro','valorDeclarado','rem_cep','dest_nome',
    'dest_cep','tipoAtendimento','formaPagamentoAtendimento'
  ];
  let changed = false;

  keys.forEach(function(key) {
    const def = FIELD_DEFS.find(function(item) { return item[0] === key; });
    if (!def) return;
    const columnIndex = indexByHeader[def[1]];
    const value = record[key];
    if (columnIndex == null || !ATENDE_hasValue_(value)) return;
    if (!ATENDE_valuesEqual_(row[columnIndex], value)) {
      row[columnIndex] = value;
      changed = true;
    }
  });

  // O CSV conhece somente o estado de postagem/estorno. Nao deve rebaixar
  // um rastreio que ja tenha avancado para Em Transito, Entregue etc.
  const statusIndex = indexByHeader['Status'];
  if (statusIndex != null) {
    const csvStatus = record.statusDesc;
    const currentStatus = row[statusIndex];
    const shouldUpdateStatus = csvStatus === 'Estornado' || !ATENDE_hasValue_(currentStatus);
    if (shouldUpdateStatus && !ATENDE_valuesEqual_(currentStatus, csvStatus)) {
      row[statusIndex] = csvStatus;
      changed = true;
    }
  }

  return changed;
}

function ATENDE_hasValue_(value) {
  return value !== '' && value !== null && value !== undefined;
}

function ATENDE_valuesEqual_(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
}
