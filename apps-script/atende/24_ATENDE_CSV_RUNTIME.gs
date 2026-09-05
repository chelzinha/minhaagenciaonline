// ============================================================
// ATENDE - LOG, CACHE E INDICE DO CSV DIARIO
// ============================================================

function ATENDE_logImportacaoCsv_(info) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(ATENDE_CSV_DIARIO_CFG.LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ATENDE_CSV_DIARIO_CFG.LOG_SHEET);
    sheet.getRange(1, 1, 1, 10).setValues([[
      'Timestamp', 'Tipo', 'Status', 'Resumo', 'Total Atendimentos',
      'Total Objetos', 'Criados', 'Atualizados', 'Ignorados', 'Hash'
    ]]);
    sheet.setFrozenRows(1);
  }

  const resumo = [
    'arquivo=' + info.file.getName(),
    'sem objeto=' + Number(info.invalidWithoutObject || 0),
    'existentes sem mudanca=' + Number(info.unchangedExisting || 0),
    'duplicados no arquivo=' + Number(info.duplicatePayload || 0)
  ].join(' | ');

  sheet.appendRow([
    new Date(), 'csv_drive', 'ok', resumo,
    Number(info.totalRows || 0), Number(info.totalObjects || 0),
    Number(info.added || 0), Number(info.updated || 0),
    Number(info.skipped || 0), info.hash || ''
  ]);
}

function ATENDE_invalidarCacheEIndice_() {
  PropertiesService.getScriptProperties()
    .setProperty(ATENDE_CSV_DIARIO_CFG.CACHE_VERSION_PROP, String(Date.now()));

  if (typeof rebuildPostagensDateIndex_ !== 'function') return;
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (sheet) rebuildPostagensDateIndex_(ss, sheet);
  } catch (err) {
    console.warn('[ATENDE CSV] Indice nao reconstruido: ' + (err.message || err));
  }
}

function ATENDE_registrarErroCsv_(err) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('ERROS');
    if (!sheet) return;
    const message = err && err.message ? err.message : String(err);
    sheet.appendRow([new Date(), 'csv_drive', message.substring(0, 800), '']);
  } catch (_) {}
}
