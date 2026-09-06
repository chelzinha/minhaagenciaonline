// ============================================================
// ATENDE - DESCOBERTA DE ARQUIVOS E IDEMPOTENCIA
// ============================================================

function ATENDE_listarCsvPendentes_() {
  const pasta = DriveApp.getFolderById(ATENDE_getCsvFolderId_());
  const arquivos = ATENDE_coletarArquivosCsv_(pasta);
  const props = PropertiesService.getScriptProperties();
  const processed = new Set(ATENDE_getProcessedMeta_(props));

  // A pasta pode acumular anos de relatorios. Trabalhamos somente sobre a
  // janela operacional recente para que arquivos antigos nunca atrasem o novo.
  return arquivos
    .sort(function(a, b) {
      return b.file.getLastUpdated().getTime() - a.file.getLastUpdated().getTime();
    })
    .slice(0, ATENDE_CSV_DIARIO_CFG.MAX_FOLDER_FILES_TO_SCAN)
    .filter(function(item) { return !processed.has(item.metaSignature); })
    .sort(function(a, b) {
      return a.file.getLastUpdated().getTime() - b.file.getLastUpdated().getTime();
    });
}

function ATENDE_coletarArquivosCsv_(folder) {
  const result = [];
  const iterator = folder.getFiles();

  while (iterator.hasNext()) {
    const file = iterator.next();
    const name = String(file.getName() || '');
    const mime = String(file.getMimeType() || '').toLowerCase();
    if (!/\.csv$/i.test(name) && mime !== 'text/csv') continue;

    result.push({
      file: file,
      metaSignature: [file.getId(), file.getLastUpdated().getTime(), file.getSize()].join('|')
    });
  }
  return result;
}

function ATENDE_getProcessedMeta_(props) {
  try {
    const raw = props.getProperty(ATENDE_CSV_DIARIO_CFG.PROCESSED_META_PROP);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function ATENDE_marcarMetaProcessada_(signature) {
  if (!signature) return;
  const props = PropertiesService.getScriptProperties();
  const list = ATENDE_getProcessedMeta_(props).filter(function(item) { return item !== signature; });
  list.push(signature);
  while (list.length > ATENDE_CSV_DIARIO_CFG.MAX_PROCESSED_META) list.shift();
  props.setProperty(ATENDE_CSV_DIARIO_CFG.PROCESSED_META_PROP, JSON.stringify(list));
}

function ATENDE_hashJaImportado_(hash) {
  if (!hash) return false;
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(ATENDE_CSV_DIARIO_CFG.LOG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;

  return sheet.getRange(2, 10, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .some(function(row) { return String(row[0] || '').trim() === hash; });
}
