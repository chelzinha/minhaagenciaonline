function validateEntryPayload_(payload) {
  if (!payload || typeof payload !== 'object') throw appError_('Dados do lançamento ausentes.', 'INVALID_PAYLOAD');
  var type = cleanText_(payload.type).toUpperCase();
  if (['RECEITA', 'DESPESA'].indexOf(type) < 0) throw appError_('Tipo de lançamento inválido.', 'INVALID_TYPE');
  var date = normalizeDate_(payload.date || todayIso_());
  var amountCents = integerCents_(payload.amountCents);
  if (!(amountCents > 0)) throw appError_('O valor deve ser maior que zero.', 'INVALID_AMOUNT');

  var draft = {
    type: type, date: date, amountCents: amountCents,
    clientId: cleanText_(payload.clientId), clientName: cleanText_(payload.clientName),
    objectCount: Math.max(0, Math.min(999, parseInt(payload.objectCount, 10) || 0)),
    paymentMethod: cleanText_(payload.paymentMethod), pixStatus: cleanText_(payload.pixStatus).toUpperCase(),
    expenseCategory: cleanText_(payload.expenseCategory), description: cleanText_(payload.description)
  };

  if (type === 'RECEITA') {
    draft.clientName = validateClientName_(draft.clientName);
    if (CFG.PAYMENT_OPTIONS.indexOf(draft.paymentMethod) < 0) throw appError_('Forma de pagamento inválida.', 'INVALID_PAYMENT');
    if (draft.paymentMethod === 'PIX') {
      if (['PENDENTE', 'CONFIRMADO'].indexOf(draft.pixStatus) < 0) throw appError_('Informe se o Pix está pendente ou confirmado.', 'INVALID_PIX_STATUS');
    } else {
      draft.pixStatus = '';
    }
    if (!draft.description) draft.description = 'Atendimento de balcão - ' + draft.paymentMethod;
    if (!(draft.objectCount > 0)) draft.objectCount = 1;
  } else {
    if (CFG.EXPENSE_CATEGORIES.indexOf(draft.expenseCategory) < 0) throw appError_('Categoria de despesa inválida.', 'INVALID_EXPENSE_CATEGORY');
    if (!draft.description) throw appError_('Informe a descrição da despesa.', 'DESCRIPTION_REQUIRED');
    draft.paymentMethod = 'Dinheiro';
    draft.pixStatus = '';
    draft.clientName = CFG.DEFAULT_SUPPLIER;
    draft.objectCount = 0;
  }
  return draft;
}

function validateClientName_(value) {
  var name = cleanText_(value);
  if (name.length < 2) throw appError_('Informe pelo menos 2 caracteres no nome do cliente.', 'INVALID_CLIENT_NAME');
  if (name.length > 120) throw appError_('O nome do cliente pode ter no máximo 120 caracteres.', 'INVALID_CLIENT_NAME');
  return name;
}

function normalizeSearch_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function accountForPayment_(payment) {
  if (payment === 'Dinheiro') return propertyOrDefault_(CFG.ACCOUNT_CASH_PROP, 'CAIXA À VISTA');
  if (payment === 'PIX') return propertyOrDefault_(CFG.ACCOUNT_PIX_PROP, 'SANTANDER AGUANAMBI');
  return propertyOrDefault_(CFG.ACCOUNT_CARD_PROP, 'Cloudwalk Instituição de Pagamento');
}

function publicPixConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    key: props.getProperty(CFG.PIX_KEY_PROP) || '',
    name: props.getProperty(CFG.PIX_NAME_PROP) || '',
    city: props.getProperty(CFG.PIX_CITY_PROP) || 'FORTALEZA'
  };
}

function propertyOrDefault_(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback;
}

function normalizeUser_(payload) {
  if (!payload) return { id: 'sem-sessao-monitor', name: 'Usuário não identificado', role: '' };
  return {
    id: String(payload.sub || payload.email || 'usuario'),
    name: String(payload.name || payload.email || payload.sub || 'Usuário'),
    role: String(payload.role || '')
  };
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) throw appError_('Corpo da requisição ausente.', 'EMPTY_REQUEST');
  try { return JSON.parse(e.postData.contents); }
  catch (error) { throw appError_('JSON inválido.', 'INVALID_JSON'); }
}

function withLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return callback(); }
  finally { lock.releaseLock(); }
}

function appendRows_(sheet, rows) {
  if (!rows || !rows.length) return;
  var start = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function readBody_(sheet, width) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function writeBody_(sheet, rows, width) {
  var current = Math.max(0, sheet.getLastRow() - 1);
  if (current > rows.length) sheet.getRange(rows.length + 2, 1, current - rows.length, width).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, width).setValues(rows);
}

function findEntryIndex_(rows, entryId) {
  for (var i = 0; i < rows.length; i += 1) if (String(rows[i][0]) === entryId) return i;
  return -1;
}

function integerCents_(value) {
  var number = Number(value);
  if (!isFinite(number)) return 0;
  return Math.round(Math.abs(number));
}

function cleanText_(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function normalizeDate_(value) {
  var date = cleanText_(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw appError_('Data inválida.', 'INVALID_DATE');
  return date;
}
function todayIso_() { return Utilities.formatDate(new Date(), CFG.TIMEZONE, 'yyyy-MM-dd'); }
function isoToBr_(iso) { var parts = iso.split('-'); return parts[2] + '/' + parts[1] + '/' + parts[0]; }
function centsToBr_(cents) { return (Number(cents || 0) / 100).toFixed(2).replace('.', ','); }
function asIso_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value.toISOString();
  return String(value);
}
function unique_(items) { return items.filter(function (item, index) { return items.indexOf(item) === index; }); }
function jsonOutput_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function fail_(message, code) { return { ok: false, error: message, code: code || 'ERROR' }; }
function appError_(message, code) { var error = new Error(message); error.code = code; return error; }
