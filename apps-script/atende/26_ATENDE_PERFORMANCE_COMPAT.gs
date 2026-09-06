// ============================================================
// ATENDE - COMPATIBILIDADE DO PATCH DE PERFORMANCE VERSIONADO
// Mantem o projeto GitHub autocontido, sem depender de helpers externos.
// ============================================================

var ATENDE_CONFIG = {
  SHEETS: { POSTAGENS: 'Postagens' },
  REQUIRE_FRONT_DATE_FILTER: false
};

var ATENDE_POSTAGENS_HEADERS = [
  'Data','Atendente','Objeto','codigo','descricao','Categoria','Contrato','Cartão Postagem',
  'Remetente','Rem. Documento','Valor','Forma Pagamento','Peso (kg)','Larg. (cm)',
  'Comp. (cm)','Alt. (cm)','Diâm. (cm)','VD','Formato','Rem. CEP','Rem. Logradouro',
  'Rem. Número','Rem. Comp','Rem. Bairro','Rem. Cidade','Rem. UF','Rem. Telefone',
  'Dest. Nome','Dest. Documento','Dest. CEP','Dest. Logradouro','Dest. Número',
  'Dest. Complemento','Dest. Bairro','Dest. Cidade','Dest. UF','Tipo Postagem','Status',
  'Prev. Entrega','tipo','formaPagamento'
];

function safe_(value) { return safe(value); }
function getAtendeSpreadsheet_() { return getSpreadsheet(); }

function ensureAtendeStructure_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = getSheet();
  normalizeSheetStructure_(sheet);
  return sheet;
}

function formatCellForFront_(value, header) { return formatCell_(value, header); }

function registrarErro_(contexto, err, details) {
  try {
    const message = err && err.message ? err.message : String(err);
    console.error('[ATENDE] ' + contexto + ': ' + message);
  } catch (_) {}
}

function erroResposta_(err) {
  return { ok: false, error: err && err.message ? err.message : String(err) };
}

function salvarCacheSeguro_(key, payload, enabled) {
  if (!enabled || !key || !payload) return;
  try {
    const text = JSON.stringify(payload);
    if (text.length <= 90000) CacheService.getScriptCache().put(key, text, 300);
  } catch (_) {}
}
