// ============================================================
// ATENDE - BASE CSV FIEL + PROJECAO DO PAINEL
// Mantem as 26 colunas originais do relatorio em uma aba propria e
// entrega ao front somente as 14 colunas escolhidas pela operacao.
// ============================================================

const ATENDE_CSV_BASE_SHEET = 'ATENDE_CSV';

const ATENDE_CSV_SOURCE_HEADERS = Object.freeze([
  'ATENDIMENTO',
  'ALTURA',
  'CEP_DESTINATARIO',
  'CEP_REMETENTE',
  'MCU',
  'CODIGO_OBJETO',
  'CODIGO_SERVICO',
  'COMPRIMENTO',
  'DATA_POSTAGEM',
  'DIAMETRO',
  'LARGURA',
  'NOME_DESTINATARIO',
  'NOME_REMETENTE',
  'NOME_SERVICO',
  'CARTAO_POSTAGEM',
  'NUMERO_CONTRATO',
  'NUMERO_PLP',
  'SISTEMA_POSTAGEM',
  'PESO',
  'PESO_TARIFADO',
  'VALOR_ATENDIMENTO',
  'VALOR_DECLARADO',
  'ESTORNO',
  'CPF_MATRICULA_ATENDENTE',
  'MODALIDADE_PAGAMENTO',
  'FORMA_PAGAMENTO'
]);

const ATENDE_CSV_PANEL_COLUMNS = Object.freeze([
  { source: 'DATA_POSTAGEM', key: 'DATA', label: 'DATA', width: 98, type: 'date' },
  { source: 'CEP_DESTINATARIO', key: 'CEP DESTINATARIO', label: 'CEP DESTINATARIO', width: 125, mono: true },
  { source: 'CEP_REMETENTE', key: 'CEP REMETENTE', label: 'CEP REMETENTE', width: 115, mono: true },
  { source: 'CODIGO_OBJETO', key: 'SRO', label: 'SRO', width: 135, mono: true },
  { source: 'CODIGO_SERVICO', key: 'SERVICO', label: 'SERVICO', width: 90, mono: true },
  { source: 'NOME_REMETENTE', key: 'NOME REMETENTE', label: 'NOME REMETENTE', width: 190 },
  { source: 'CARTAO_POSTAGEM', key: 'CARTAO POSTAGEM', label: 'CARTAO POSTAGEM', width: 125, mono: true },
  { source: 'NUMERO_CONTRATO', key: 'CONTRATO', label: 'CONTRATO', width: 115, mono: true },
  { source: 'SISTEMA_POSTAGEM', key: 'SISTEMA', label: 'SISTEMA', width: 130 },
  { source: 'VALOR_ATENDIMENTO', key: 'VALOR', label: 'VALOR', width: 105, numeric: true, type: 'money' },
  { source: 'ESTORNO', key: 'ESTORNO', label: 'ESTORNO', width: 82 },
  { source: 'CPF_MATRICULA_ATENDENTE', key: 'ATENDENTE', label: 'ATENDENTE', width: 145, mono: true },
  { source: 'MODALIDADE_PAGAMENTO', key: 'MODALIDADE PAGAMENTO', label: 'MODALIDADE PAGAMENTO', width: 165 },
  { source: 'FORMA_PAGAMENTO', key: 'FORMA PAGAMENTO', label: 'FORMA PAGAMENTO', width: 145 }
]);

function ATENDE_getOrCreateCsvBase_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(ATENDE_CSV_BASE_SHEET);
  if (!sheet) sheet = ss.insertSheet(ATENDE_CSV_BASE_SHEET);

  if (typeof ensureGridWidth_ === 'function') {
    ensureGridWidth_(sheet, ATENDE_CSV_SOURCE_HEADERS.length);
  } else if (sheet.getMaxColumns() < ATENDE_CSV_SOURCE_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), ATENDE_CSV_SOURCE_HEADERS.length - sheet.getMaxColumns());
  }

  const currentLastCol = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet.getRange(1, 1, 1, currentLastCol).getDisplayValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  const hasContent = currentHeaders.some(Boolean) || sheet.getLastRow() > 1;
  const exact = currentHeaders.slice(0, ATENDE_CSV_SOURCE_HEADERS.length).join('|') === ATENDE_CSV_SOURCE_HEADERS.join('|')
    && currentHeaders.slice(ATENDE_CSV_SOURCE_HEADERS.length).every(function(value) { return !value; });

  if (hasContent && !exact) {
    throw new Error('A aba ' + ATENDE_CSV_BASE_SHEET + ' existe com cabecalho diferente. A gravacao foi bloqueada por seguranca.');
  }

  if (!hasContent) {
    sheet.getRange(1, 1, 1, ATENDE_CSV_SOURCE_HEADERS.length).setValues([ATENDE_CSV_SOURCE_HEADERS]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, ATENDE_CSV_SOURCE_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#00416B')
    .setFontColor('#FFFFFF');
  return sheet;
}

function ATENDE_csvRawKey_(raw) {
  const objectCode = normalizeObjectCode_(ATENDE_cleanCsvValue_(raw.CODIGO_OBJETO));
  if (objectCode) return 'OBJ:' + objectCode;
  const attendanceId = ATENDE_cleanCsvValue_(raw.ATENDIMENTO);
  return attendanceId ? 'ATD:' + attendanceId : '';
}

function ATENDE_csvRawRow_(raw) {
  return ATENDE_CSV_SOURCE_HEADERS.map(function(header) {
    return ATENDE_cleanCsvValue_(raw[header]);
  });
}

function ATENDE_writeCsvRawBlocks_(sheet, updates) {
  if (!updates.length) return;
  updates.sort(function(a, b) { return a.sheetRow - b.sheetRow; });

  let startRow = updates[0].sheetRow;
  let previousRow = updates[0].sheetRow;
  let values = [updates[0].values];

  function flushBlock_() {
    const range = sheet.getRange(startRow, 1, values.length, ATENDE_CSV_SOURCE_HEADERS.length);
    range.setNumberFormat('@');
    range.setValues(values);
  }

  for (let i = 1; i < updates.length; i++) {
    const item = updates[i];
    if (item.sheetRow === previousRow + 1) {
      values.push(item.values);
      previousRow = item.sheetRow;
      continue;
    }
    flushBlock_();
    startRow = item.sheetRow;
    previousRow = item.sheetRow;
    values = [item.values];
  }
  flushBlock_();
}

function ATENDE_upsertCsvBase_(parsed) {
  const missing = ATENDE_CSV_SOURCE_HEADERS.filter(function(header) {
    return parsed.headers.indexOf(header) < 0;
  });
  if (missing.length) {
    throw new Error('CSV sem colunas necessarias para a base fiel: ' + missing.join(', '));
  }

  const sheet = ATENDE_getOrCreateCsvBase_();
  const lastRow = sheet.getLastRow();
  const existing = new Map();

  if (lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 6).getDisplayValues();
    keys.forEach(function(row, index) {
      const raw = { ATENDIMENTO: row[0], CODIGO_OBJETO: row[5] };
      const key = ATENDE_csvRawKey_(raw);
      if (key && !existing.has(key)) existing.set(key, index + 2);
    });
  }

  const seen = new Set();
  const updates = [];
  const appends = [];
  let skipped = 0;

  parsed.rows.forEach(function(raw) {
    const key = ATENDE_csvRawKey_(raw);
    if (!key || seen.has(key)) {
      skipped++;
      return;
    }
    seen.add(key);

    const values = ATENDE_csvRawRow_(raw);
    const sheetRow = Number(existing.get(key) || 0);
    if (sheetRow >= 2) updates.push({ sheetRow: sheetRow, values: values });
    else appends.push(values);
  });

  ATENDE_writeCsvRawBlocks_(sheet, updates);

  if (appends.length) {
    const startRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(startRow, 1, appends.length, ATENDE_CSV_SOURCE_HEADERS.length);
    range.setNumberFormat('@');
    range.setValues(appends);
  }

  if (updates.length || appends.length) {
    PropertiesService.getScriptProperties()
      .setProperty(ATENDE_CSV_DIARIO_CFG.CACHE_VERSION_PROP, String(Date.now()));
    SpreadsheetApp.flush();
  }

  return { added: appends.length, updated: updates.length, skipped: skipped };
}

function ATENDE_formatPanelDate_(value) {
  const text = ATENDE_cleanCsvValue_(value);
  if (!text) return '';

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[3] + '/' + match[2] + '/' + match[1];

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return match[1] + '/' + match[2] + '/' + match[3];

  const parsed = parseDateTimeValue_(text);
  return parsed ? Utilities.formatDate(parsed, CONFIG.TZ, 'dd/MM/yyyy') : text;
}

function ATENDE_buscarDadosPainelCsv_(params) {
  const startMs = Date.now();
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(ATENDE_CSV_BASE_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      ok: true,
      rows: [],
      columns: ATENDE_CSV_PANEL_COLUMNS.map(function(column) { return Object.assign({}, column); }),
      meta: {
        modoLeitura: 'atende_csv_vazio',
        mensagem: 'Base ATENDE_CSV ainda nao foi reconstruida.',
        tempoMs: Date.now() - startMs
      }
    };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  const index = {};
  headers.forEach(function(header, position) { index[header] = position; });

  const missing = ATENDE_CSV_PANEL_COLUMNS
    .map(function(column) { return column.source; })
    .filter(function(header) { return index[header] == null; });
  if (missing.length) throw new Error('Base ATENDE_CSV sem colunas do painel: ' + missing.join(', '));

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
  const rows = values.map(function(row) {
    const obj = {};
    ATENDE_CSV_PANEL_COLUMNS.forEach(function(column) {
      let value = row[index[column.source]];
      if (column.source === 'DATA_POSTAGEM') value = ATENDE_formatPanelDate_(value);
      if (column.source === 'VALOR_ATENDIMENTO') value = ATENDE_toNumber_(value);
      obj[column.key] = value;
    });

    // Compatibilidade interna com o front atual. Estes aliases nao viram
    // colunas porque a lista visual e enviada separadamente em columns.
    obj.Data = obj.DATA;
    obj.Valor = obj.VALOR;
    return obj;
  });

  return {
    ok: true,
    rows: rows,
    columns: ATENDE_CSV_PANEL_COLUMNS.map(function(column) { return Object.assign({}, column); }),
    meta: {
      modoLeitura: 'atende_csv_selecionado',
      totalPlanilha: rows.length,
      totalRetornado: rows.length,
      tempoMs: Date.now() - startMs
    }
  };
}

function ATENDE_reconstruirBasePainelCsv() {
  const lock = LockService.getScriptLock();
  const startMs = Date.now();

  try {
    lock.waitLock(ATENDE_CSV_DIARIO_CFG.LOCK_TIMEOUT_MS);
    const folder = DriveApp.getFolderById(ATENDE_getCsvFolderId_());
    const files = ATENDE_coletarArquivosCsv_(folder)
      .sort(function(a, b) { return a.file.getLastUpdated().getTime() - b.file.getLastUpdated().getTime(); });

    if (!files.length) throw new Error('Nenhum CSV encontrado na pasta configurada.');

    const byKey = new Map();
    let sourceRows = 0;
    let invalidWithoutKey = 0;

    files.forEach(function(item) {
      const parsed = ATENDE_lerCsv_(item.file);
      const missing = ATENDE_CSV_SOURCE_HEADERS.filter(function(header) {
        return parsed.headers.indexOf(header) < 0;
      });
      if (missing.length) {
        throw new Error('Arquivo ' + item.file.getName() + ' sem colunas: ' + missing.join(', '));
      }

      parsed.rows.forEach(function(raw) {
        sourceRows++;
        const key = ATENDE_csvRawKey_(raw);
        if (!key) {
          invalidWithoutKey++;
          return;
        }
        byKey.set(key, raw);
      });
    });

    const sheet = ATENDE_getOrCreateCsvBase_();
    sheet.clearContents();
    sheet.getRange(1, 1, 1, ATENDE_CSV_SOURCE_HEADERS.length).setValues([ATENDE_CSV_SOURCE_HEADERS]);
    sheet.getRange(1, 1, 1, ATENDE_CSV_SOURCE_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#00416B')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    const rows = Array.from(byKey.values())
      .sort(function(a, b) {
        return ATENDE_cleanCsvValue_(b.DATA_POSTAGEM).localeCompare(ATENDE_cleanCsvValue_(a.DATA_POSTAGEM));
      })
      .map(ATENDE_csvRawRow_);

    if (rows.length) {
      const range = sheet.getRange(2, 1, rows.length, ATENDE_CSV_SOURCE_HEADERS.length);
      range.setNumberFormat('@');
      range.setValues(rows);
    }

    PropertiesService.getScriptProperties()
      .setProperty(ATENDE_CSV_DIARIO_CFG.CACHE_VERSION_PROP, String(Date.now()));
    SpreadsheetApp.flush();

    const result = {
      ok: true,
      filesRead: files.length,
      sourceRows: sourceRows,
      uniqueRows: rows.length,
      invalidWithoutKey: invalidWithoutKey,
      sheet: ATENDE_CSV_BASE_SHEET,
      elapsedMs: Date.now() - startMs
    };
    console.log('ATENDE - RECONSTRUCAO BASE CSV DO PAINEL');
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const result = {
      ok: false,
      error: err && err.message ? err.message : String(err),
      elapsedMs: Date.now() - startMs
    };
    console.error(JSON.stringify(result, null, 2));
    return result;
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
