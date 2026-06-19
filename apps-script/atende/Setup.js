// ============================================================
//  SETUP INICIAL
// ============================================================

function setupInicial() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var spreadsheet = getOrCreateAtendeSpreadsheet_();
    ensureAtendeStructure_(spreadsheet);
    registrarLogImportacao_('setupInicial', {
      status: 'ok',
      mensagem: 'Estrutura do Atende criada/validada.',
    });
    return {
      ok: true,
      spreadsheetId: spreadsheet.getId(),
      url: spreadsheet.getUrl(),
      sheets: Object.keys(ATENDE_CONFIG.SHEETS).map(function(key) {
        return ATENDE_CONFIG.SHEETS[key];
      }),
    };
  } catch (err) {
    registrarErro_('setupInicial', err, {});
    return erroResposta_(err);
  } finally {
    releaseLockQuietly_(lock);
  }
}

function ensureAtendeStructure_(spreadsheet) {
  ensureConfigSheet_(spreadsheet);
  ensureSheetWithHeaders_(spreadsheet, ATENDE_CONFIG.SHEETS.RAW_ATENDIMENTOS, [
    'Timestamp', 'Origem', 'Hash', 'Resumo', 'JSON',
  ]);
  ensureSheetWithHeaders_(spreadsheet, ATENDE_CONFIG.SHEETS.RAW_OBJETOS_CAPTADOS, [
    'Timestamp', 'Origem', 'Hash', 'Resumo', 'JSON',
  ]);
  ensureSheetWithHeaders_(spreadsheet, ATENDE_CONFIG.SHEETS.POSTAGENS, ATENDE_POSTAGENS_HEADERS);
  ensureSheetWithHeaders_(spreadsheet, ATENDE_CONFIG.SHEETS.EVENTOS_OBJETOS, [
    'Timestamp Importacao', 'Objeto', 'Codigo Evento', 'Descricao Evento',
    'Data Evento', 'Unidade', 'Cidade', 'UF', 'Fonte',
  ]);
  ensureSheetWithHeaders_(spreadsheet, ATENDE_CONFIG.SHEETS.LOG_IMPORTACOES, [
    'Timestamp', 'Tipo', 'Status', 'Resumo', 'Total Atendimentos',
    'Total Objetos', 'Criados', 'Atualizados', 'Ignorados', 'Hash',
  ]);
  ensureSheetWithHeaders_(spreadsheet, ATENDE_CONFIG.SHEETS.ERROS, [
    'Timestamp', 'Contexto', 'Mensagem', 'Detalhe Seguro',
  ]);
  applyPostagensFormatting_(spreadsheet.getSheetByName(ATENDE_CONFIG.SHEETS.POSTAGENS));
}

function ensureConfigSheet_(spreadsheet) {
  var sheet = ensureSheetWithHeaders_(spreadsheet, ATENDE_CONFIG.SHEETS.CONFIG, [
    'Chave', 'Valor', 'Observacao',
  ]);
  var values = readSheetRowsAsObjects_(sheet);
  if (values.length) return sheet;

  sheet.getRange(2, 1, 4, 3).setValues([
    ['SPREADSHEET_ID', spreadsheet.getId(), 'Gerenciado pelo setupInicial().'],
    ['INGEST_TOKEN', '', 'Cadastrar apenas em PropertiesService, nao na planilha.'],
    ['CACHE_SECONDS', String(ATENDE_CONFIG.CACHE_SECONDS), 'Cache curto do endpoint de consulta.'],
    ['ATENCAO', 'SENSIVEL', 'Dados pessoais de remetente/destinatario.'],
  ]);
  return sheet;
}

function getOrCreateAtendeSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(ATENDE_CONFIG.PROP_SPREADSHEET_ID)
    || props.getProperty(ATENDE_CONFIG.PROP_LEGACY_SPREADSHEET_ID);

  if (id) {
    var existing = SpreadsheetApp.openById(id);
    props.setProperty(ATENDE_CONFIG.PROP_SPREADSHEET_ID, existing.getId());
    return existing;
  }

  var spreadsheet = SpreadsheetApp.create(ATENDE_CONFIG.APP_NAME);
  props.setProperty(ATENDE_CONFIG.PROP_SPREADSHEET_ID, spreadsheet.getId());
  return spreadsheet;
}

function getAtendeSpreadsheet_() {
  return getOrCreateAtendeSpreadsheet_();
}

function getSpreadsheet() {
  return getAtendeSpreadsheet_();
}

function getSheet() {
  var spreadsheet = getAtendeSpreadsheet_();
  ensureAtendeStructure_(spreadsheet);
  return spreadsheet.getSheetByName(ATENDE_CONFIG.SHEETS.POSTAGENS);
}

function getSpreadsheetUrl() {
  try {
    var spreadsheet = getAtendeSpreadsheet_();
    return { ok: true, url: spreadsheet.getUrl() };
  } catch (err) {
    registrarErro_('getSpreadsheetUrl', err, {});
    return erroResposta_(err);
  }
}
