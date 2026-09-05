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
      skipped: parsed.rows.length, withoutObject: 0, invalidMissingKey: 0,
      hash: contentHash
    };
  }

  const sheet = getSheet();
  normalizeSheetStructure_(sheet);
  const objectColumn = HEADER_LABELS.indexOf('Objeto') + 1;
  if (objectColumn <= 0) throw new Error('Coluna "Objeto" nao encontrada na estrutura canonica do Atende.');

  // Le somente Objeto + notas para classificar o lote. A matriz completa da
  // planilha so e carregada se houver linhas existentes que precisem de update.
  const rowKeys = ATENDE_readCsvRowKeys_(sheet, objectColumn);
  const batchKeys = new Set();
  const existingOps = [];
  const newRecords = [];
  let withoutObject = 0;
  let invalidMissingKey = 0;
  let duplicatePayload = 0;

  parsed.rows.forEach(function(raw) {
    const record = ATENDE_mapearLinhaCsv_(raw);
    const objectCode = normalizeObjectCode_(record.codObjeto);
    const attendanceId = ATENDE_cleanCsvValue_(record.csvAtendimentoId);
    let batchKey = '';
    let sheetRow = 0;

    if (objectCode) {
      record.codObjeto = objectCode;
      batchKey = 'OBJ:' + objectCode;
      sheetRow = Number(rowKeys.byObject.get(objectCode) || 0);
    } else {
      withoutObject++;
      if (!attendanceId) {
        invalidMissingKey++;
        return;
      }
      batchKey = 'ATD:' + attendanceId;
      sheetRow = Number(rowKeys.byAttendance.get(attendanceId) || 0);
    }

    if (batchKeys.has(batchKey)) {
      duplicatePayload++;
      return;
    }
    batchKeys.add(batchKey);

    if (sheetRow >= 2) existingOps.push({ sheetRow: sheetRow, record: record });
    else newRecords.push(record);
  });

  let updatedExisting = 0;
  let unchangedExisting = 0;

  if (existingOps.length) {
    const matrix = readSheetMatrix_(sheet);
    const changedRowIndexes = new Set();

    existingOps.forEach(function(op) {
      const rowIndex = op.sheetRow - 2;
      if (rowIndex < 0 || rowIndex >= matrix.rows.length) {
        throw new Error('Indice interno do CSV aponta para uma linha inexistente em Postagens.');
      }
      if (ATENDE_mergeCsvIntoExistingRow_(matrix.rows[rowIndex], op.record, matrix.indexByHeader)) {
        changedRowIndexes.add(rowIndex);
        updatedExisting++;
      } else {
        unchangedExisting++;
      }
    });

    if (changedRowIndexes.size) {
      writeChangedRowsInBlocks_(sheet, matrix.rows, changedRowIndexes, matrix.headers.length);
    }
  }

  if (newRecords.length) {
    const rows = newRecords.map(function(record) {
      return HEADERS.map(function(key) { return record[key] == null ? '' : record[key]; });
    });

    const trackedRecords = [];
    const trackedRows = [];
    newRecords.forEach(function(record, index) {
      if (!record.codObjeto) return;
      trackedRecords.push(record);
      trackedRows.push(rows[index]);
    });
    if (trackedRecords.length) validarLinhasAntesDeInserir_(trackedRecords, trackedRows);

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, HEADER_LABELS.length).setValues(rows);
    ATENDE_setCsvNotesForNewRows_(sheet, startRow, newRecords, objectColumn);
    SpreadsheetApp.flush();
  }

  const skipped = unchangedExisting + duplicatePayload + invalidMissingKey;
  ATENDE_logImportacaoCsv_({
    file: file, hash: contentHash, totalRows: parsed.rows.length,
    totalObjects: parsed.rows.length - withoutObject,
    added: newRecords.length, updated: updatedExisting, skipped: skipped,
    withoutObject: withoutObject, invalidMissingKey: invalidMissingKey,
    unchangedExisting: unchangedExisting, duplicatePayload: duplicatePayload
  });
  ATENDE_marcarMetaProcessada_(metaSignature);

  return {
    fileName: file.getName(), status: 'imported',
    totalRows: parsed.rows.length, totalObjects: parsed.rows.length - withoutObject,
    added: newRecords.length, updated: updatedExisting, skipped: skipped,
    withoutObject: withoutObject, invalidMissingKey: invalidMissingKey,
    unchangedExisting: unchangedExisting, duplicatePayload: duplicatePayload,
    hash: contentHash
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

  // Para objetos que ja existiam por JSON, preserva Tipo Postagem anterior
  // (A Coletar/Coletado/Rastreamento). Para registros novos, o CSV usa o
  // sistema operacional (SARA/CORREIOS ATENDE) como melhor origem disponivel.
  return changed;
}

function ATENDE_hasValue_(value) {
  return value !== '' && value !== null && value !== undefined;
}

function ATENDE_valuesEqual_(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
}
