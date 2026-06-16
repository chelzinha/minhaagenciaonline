var APP_TITLE = 'SLA Correios';
var BASE_SHEET_NAME = 'SLA_Base';
var LOG_SHEET_NAME = 'SLA_Importacoes';

var SPREADSHEET_ID_PROP = 'SLA_CORREIOS_SPREADSHEET_ID';
var LAST_CLIENT_PROP = 'SLA_CORREIOS_LAST_CLIENT';
var LAST_IMPORT_PROP = 'SLA_CORREIOS_LAST_IMPORT';
var LAST_IMPORTED_AT_PROP = 'SLA_CORREIOS_LAST_IMPORTED_AT';

var BASE_HEADERS = [
  'import_id',
  'imported_at',
  'client_name',
  'code',
  'service',
  'service_full',
  'status_group',
  'status_label',
  'predicted_date',
  'actual_date',
  'event_date',
  'delta_days',
  'sla_bucket',
  'city',
  'uf',
  'city_source',
  'open_delay_days',
  'raw_code',
  'raw_description',
  'raw_detail',
  'allow_suspend',
  'allow_change',
  'value',
  'tracking_url'
];

var LOG_HEADERS = [
  'import_id',
  'imported_at',
  'client_name',
  'total_objetos',
  'total_entregues',
  'total_em_acompanhamento',
  'total_abertos_vencidos',
  'total_tentativa_nao_concluida',
  'total_adiantados',
  'pct_adiantados',
  'pct_no_prazo',
  'pct_atrasados'
];

function onOpen() {
  try {
    saveBoundSpreadsheetId_();
    setupSlaSheets_();
    SpreadsheetApp.getUi()
      .createMenu('SLA Correios')
      .addItem('Abrir painel', 'showSlaDialog')
      .addItem('Configurar projeto', 'configurarSlaCorreios')
      .addToUi();
  } catch (err) {
    Logger.log('[SLA Correios][onOpen] ' + err);
  }
}

function configurarSlaCorreios() {
  var ss = saveBoundSpreadsheetId_();
  setupSlaSheets_(ss);
  SpreadsheetApp.getUi().alert(
    'SLA Correios',
    'Projeto configurado para a planilha: ' + ss.getName() + '\n\nAgora publique em Implantar > Nova implantação > Aplicativo da web.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function showSlaDialog() {
  var html = buildHtmlOutput_()
    .setTitle(APP_TITLE)
    .setWidth(1320)
    .setHeight(980);

  SpreadsheetApp.getUi().showModalDialog(html, APP_TITLE);
}

function doGet() {
  return buildHtmlOutput_()
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function buildHtmlOutput_() {
  var ss = resolveSpreadsheet_();
  setupSlaSheets_(ss);

  var tpl = HtmlService.createTemplateFromFile('Index_premium');
  tpl.bootstrapJson = JSON.stringify(getBootstrapData_(ss));
  tpl.appTitle = APP_TITLE;
  return tpl.evaluate();
}

function getBootstrapData() {
  return getBootstrapData_();
}

function importRawPayload(payload) {
  payload = payload || {};

  var raw = String(payload.raw || '').trim();
  var clientName = sanitizeClientName_(payload.clientName || '');
  if (!raw) {
    throw new Error('Cole o conteúdo bruto do JSON ou selecione um arquivo .json/.txt antes de importar.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var ss = resolveSpreadsheet_();
    setupSlaSheets_(ss);

    var parsed = parseRawCorreiosText_(raw);
    var objects = parsed.objects || [];
    if (!objects.length) {
      throw new Error('Nenhum objeto foi encontrado no conteúdo enviado.');
    }

    var importId = Utilities.getUuid();
    var importedAt = new Date();
    var importedAtText = formatDateTime_(importedAt);
    var rows = [];

    for (var i = 0; i < objects.length; i++) {
      rows.push(flattenCorreiosObject_(objects[i], importId, importedAtText, clientName));
    }

    rows.sort(function(a, b) {
      return compareDesc_(a.event_date, b.event_date) || compareAsc_(a.code, b.code);
    });

    writeBaseRows_(ss, rows);
    appendImportLog_(ss, rows, importId, importedAtText, clientName);

    var props = PropertiesService.getScriptProperties();
    props.setProperty(LAST_CLIENT_PROP, clientName);
    props.setProperty(LAST_IMPORT_PROP, importId);
    props.setProperty(LAST_IMPORTED_AT_PROP, importedAtText);

    return getBootstrapData_(ss);
  } catch (err) {
    Logger.log('[SLA Correios][importRawPayload] ' + err);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function getBootstrapData_(ss) {
  ss = ss || resolveSpreadsheet_();

  var rows = readBaseRows_(ss);
  var props = PropertiesService.getScriptProperties();
  var clientName = props.getProperty(LAST_CLIENT_PROP) || '';
  var importId = props.getProperty(LAST_IMPORT_PROP) || '';
  var importedAt = props.getProperty(LAST_IMPORTED_AT_PROP) || '';

  if (!clientName && rows.length) {
    clientName = String(rows[0].client_name || '');
  }
  if (!importedAt && rows.length) {
    importedAt = String(rows[0].imported_at || '');
  }

  return {
    appTitle: APP_TITLE,
    clientName: clientName,
    importId: importId,
    importedAt: importedAt,
    totalRows: rows.length,
    rows: rows
  };
}

function setupSlaSheets() {
  setupSlaSheets_();
}

function setupSlaSheets_(ss) {
  ss = ss || resolveSpreadsheet_();
  ensureSheetWithHeaders_(ss, BASE_SHEET_NAME, BASE_HEADERS);
  ensureSheetWithHeaders_(ss, LOG_SHEET_NAME, LOG_HEADERS);
}

function saveBoundSpreadsheetId_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Este projeto precisa estar vinculado à planilha "SLA Correios".');
  }

  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_PROP, ss.getId());
  return ss;
}

function resolveSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SPREADSHEET_ID_PROP);
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  return saveBoundSpreadsheetId_();
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }

  var existing = sh.getLastRow()
    ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0]
    : [];

  var same = true;
  for (var i = 0; i < headers.length; i++) {
    if (String(existing[i] || '') !== headers[i]) {
      same = false;
      break;
    }
  }

  if (!same) {
    sh.clearContents();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else if (sh.getFrozenRows() !== 1) {
    sh.setFrozenRows(1);
  }

  return sh;
}

function readBaseRows_(ss) {
  ss = ss || resolveSpreadsheet_();

  var sh = ss.getSheetByName(BASE_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) {
    return [];
  }

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, BASE_HEADERS.length).getDisplayValues();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var row = {};
    for (var j = 0; j < BASE_HEADERS.length; j++) {
      row[BASE_HEADERS[j]] = values[i][j];
    }
    rows.push(row);
  }

  return rows;
}

function writeBaseRows_(ss, rows) {
  ss = ss || resolveSpreadsheet_();

  var sh = ensureSheetWithHeaders_(ss, BASE_SHEET_NAME, BASE_HEADERS);
  sh.clearContents();
  sh.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS]);
  sh.setFrozenRows(1);

  if (!rows.length) {
    return;
  }

  var values = [];
  for (var i = 0; i < rows.length; i++) {
    var line = [];
    for (var j = 0; j < BASE_HEADERS.length; j++) {
      line.push(rows[i][BASE_HEADERS[j]] == null ? '' : rows[i][BASE_HEADERS[j]]);
    }
    values.push(line);
  }

  sh.getRange(2, 1, values.length, BASE_HEADERS.length).setValues(values);
  sh.autoResizeColumns(1, Math.min(BASE_HEADERS.length, 12));
}

function appendImportLog_(ss, rows, importId, importedAtText, clientName) {
  ss = ss || resolveSpreadsheet_();

  var sh = ensureSheetWithHeaders_(ss, LOG_SHEET_NAME, LOG_HEADERS);
  var summary = summarizeRows_(rows);
  var nextRow = Math.max(sh.getLastRow(), 1) + 1;

  sh.getRange(nextRow, 1, 1, LOG_HEADERS.length).setValues([[
    importId,
    importedAtText,
    clientName,
    summary.total,
    summary.delivered,
    summary.openTracking,
    summary.openOverdue,
    summary.attempts,
    summary.early,
    summary.earlyPct,
    summary.onTimePct,
    summary.latePct
  ]]);
}

function summarizeRows_(rows) {
  var total = rows.length;
  var delivered = 0;
  var openTracking = 0;
  var openOverdue = 0;
  var attempts = 0;
  var early = 0;
  var onTime = 0;
  var late = 0;
  var slaMeasured = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var statusGroup = String(row.status_group || '');

    if (statusGroup === 'delivered') {
      delivered++;
    }

    if (isRowCountedInSla_(row)) {
      slaMeasured++;
      var delta = parseInt(row.delta_days, 10);
      if (delta < 0) {
        early++;
      } else if (delta === 0) {
        onTime++;
      } else if (delta > 0) {
        late++;
      }
      continue;
    }

    if (statusGroup === 'attempt') {
      attempts++;
    } else {
      var delay = parseInt(row.open_delay_days || '0', 10);
      if (delay > 0) {
        openOverdue++;
      } else {
        openTracking++;
      }
    }
  }

  return {
    total: total,
    delivered: delivered,
    openTracking: openTracking,
    openOverdue: openOverdue,
    attempts: attempts,
    early: early,
    earlyPct: slaMeasured ? round1_(early / slaMeasured * 100) : 0,
    onTimePct: slaMeasured ? round1_(onTime / slaMeasured * 100) : 0,
    latePct: slaMeasured ? round1_(late / slaMeasured * 100) : 0
  };
}

function isStatusCountedInSla_(statusGroup) {
  return statusGroup === 'delivered' || statusGroup === 'in_transfer';
}

function resolveSlaReferenceDate_(statusGroup, actualDate, eventDate) {
  if (statusGroup === 'delivered') {
    return formatDateOnly_(actualDate || eventDate);
  }
  if (statusGroup === 'in_transfer') {
    return formatDateOnly_(eventDate);
  }
  return '';
}

function isRowCountedInSla_(row) {
  row = row || {};
  var statusGroup = String(row.status_group || '');
  if (!isStatusCountedInSla_(statusGroup)) {
    return false;
  }
  if (!String(row.predicted_date || '')) {
    return false;
  }
  return String(row.delta_days || '') !== '';
}

function flattenCorreiosObject_(obj, importId, importedAtText, clientName) {
  obj = obj || {};

  var event = resolveLatestEvent_(obj.eventos);
  var description = normalizeText_(event.descricao || '');
  var detail = normalizeText_(event.detalhe || '');
  var statusInfo = classifyStatus_(description, event.codigo || '');
  var predictedDate = formatDateOnly_(obj.dtPrevista);
  var eventDate = formatDateTimeText_(event.dtHrCriado);
  var actualDate = statusInfo.group === 'delivered' ? formatDateOnly_(event.dtHrCriado) : '';
  var slaReferenceDate = resolveSlaReferenceDate_(statusInfo.group, actualDate, event.dtHrCriado);
  var deltaDays = '';

  if (slaReferenceDate && predictedDate) {
    deltaDays = String(diffDaysBetweenKeys_(slaReferenceDate, predictedDate));
  }

  var cityInfo = resolveCityInfo_(statusInfo.group, event);
  var openDelayDays = '';
  if (statusInfo.group !== 'delivered' && predictedDate) {
    var delay = diffDaysBetweenKeys_(todayKey_(), predictedDate);
    openDelayDays = delay > 0 ? String(delay) : '0';
  }

  var serviceShort = resolveServiceShort_(obj.tipoPostal);
  var serviceFull = normalizeText_((obj.tipoPostal && obj.tipoPostal.categoria) || '');
  var slaBucket = resolveSlaBucket_(statusInfo.group, predictedDate, slaReferenceDate, deltaDays, openDelayDays);

  return {
    import_id: importId,
    imported_at: importedAtText,
    client_name: clientName,
    code: String(obj.codObjeto || ''),
    service: serviceShort,
    service_full: serviceFull,
    status_group: statusInfo.group,
    status_label: statusInfo.label,
    predicted_date: predictedDate,
    actual_date: actualDate,
    event_date: eventDate,
    delta_days: deltaDays,
    sla_bucket: slaBucket,
    city: cityInfo.city,
    uf: cityInfo.uf,
    city_source: cityInfo.source,
    open_delay_days: openDelayDays,
    raw_code: String(event.codigo || ''),
    raw_description: description,
    raw_detail: detail,
    allow_suspend: obj.permiteSuspensao ? 'SIM' : 'NÃO',
    allow_change: obj.permiteAlteracao ? 'SIM' : 'NÃO',
    value: normalizeText_(obj.valorRecebido || ''),
    tracking_url: 'https://rastreamento.correios.com.br/app/index.php?objetos=' + encodeURIComponent(String(obj.codObjeto || ''))
  };
}

function resolveLatestEvent_(events) {
  if (!events || !events.length) {
    return {};
  }

  var latest = events[0] || {};
  for (var i = 1; i < events.length; i++) {
    var candidate = events[i] || {};
    if (compareDesc_(String(candidate.dtHrCriado || ''), String(latest.dtHrCriado || '')) < 0) {
      latest = candidate;
    }
  }

  return latest;
}

function resolveServiceShort_(tipoPostal) {
  tipoPostal = tipoPostal || {};

  var sigla = normalizeText_(tipoPostal.sigla || '');
  var categoria = normalizeText_(tipoPostal.categoria || '');

  if (sigla) {
    if (sigla === 'QN') return 'PAC';
    if (sigla === 'OY') return 'SEDEX';
    return sigla;
  }
  if (/SEDEX/i.test(categoria)) return 'SEDEX';
  if (/PAC/i.test(categoria)) return 'PAC';

  return categoria || 'OUTRO';
}

function resolveCityInfo_(statusGroup, event) {
  event = event || {};

  var unitAddress = event.unidade && event.unidade.endereco ? event.unidade.endereco : {};
  var destAddress = event.unidadeDestino && event.unidadeDestino.endereco ? event.unidadeDestino.endereco : {};

  var unitCity = normalizeText_(unitAddress.cidade || '');
  var unitUf = normalizeText_(unitAddress.uf || '');
  var destCity = normalizeText_(destAddress.cidade || '');
  var destUf = normalizeText_(destAddress.uf || '');

  if (statusGroup === 'in_transfer' && destCity) {
    return { city: destCity, uf: destUf, source: 'destino_explícito' };
  }

  if (unitCity) {
    return { city: unitCity, uf: unitUf, source: 'unidade_evento' };
  }

  if (destCity) {
    return { city: destCity, uf: destUf, source: 'destino_explícito' };
  }

  return { city: '', uf: '', source: '' };
}

function classifyStatus_(description, code) {
  var desc = String(description || '').toLowerCase();
  var rawCode = String(code || '').toUpperCase();

  if (/objeto entregue ao destinat[aá]rio/.test(desc)) {
    return { group: 'delivered', label: 'Entrega concluída' };
  }
  if (/objeto n[aã]o entregue/.test(desc)) {
    return { group: 'attempt', label: 'Tentativa não concluída' };
  }
  if (/saiu para entrega/.test(desc)) {
    return { group: 'out_for_delivery', label: 'Saiu para entrega' };
  }
  if (/aguardando retirada/.test(desc)) {
    return { group: 'awaiting_pickup', label: 'Aguardando retirada' };
  }
  if (/em transfer[eê]ncia/.test(desc) || rawCode === 'RO') {
    return { group: 'in_transfer', label: 'Em transferência' };
  }

  return { group: 'other_open', label: rawCode ? ('Evento ' + rawCode) : 'Em acompanhamento' };
}

function resolveSlaBucket_(statusGroup, predictedDate, slaReferenceDate, deltaDays, openDelayDays) {
  if (isStatusCountedInSla_(statusGroup)) {
    if (!predictedDate || !slaReferenceDate) return statusGroup === 'delivered' ? 'delivered_without_prediction' : 'transfer_without_reference';

    var delta = parseInt(deltaDays || '0', 10);
    if (delta < 0) return 'early';
    if (delta === 0) return 'on_time';
    return 'late';
  }

  if (statusGroup === 'attempt') {
    return 'attempt_not_completed';
  }

  if (!predictedDate) {
    return 'open_without_prediction';
  }

  var delay = parseInt(openDelayDays || '0', 10);
  return delay > 0 ? 'open_overdue' : 'open_tracking';
}

function parseRawCorreiosText_(text) {
  text = String(text || '').trim();
  if (!text) {
    throw new Error('Conteúdo vazio.');
  }

  var collected = [];
  var single = tryParseJson_(text);
  if (single && Array.isArray(single.objetos)) {
    collected = collected.concat(single.objetos);
  }

  if (!collected.length) {
    var blocks = extractJsonBlocks_(text);
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i] && Array.isArray(blocks[i].objetos)) {
        collected = collected.concat(blocks[i].objetos);
      }
    }
  }

  if (!collected.length) {
    collected = extractItemsFromObjetosArrays_(text);
  }

  if (!collected.length) {
    throw new Error('Não foi possível identificar objetos no conteúdo enviado. Use o JSON completo ou um .txt com o conteúdo bruto.');
  }

  return { objects: dedupeByCode_(collected) };
}

function tryParseJson_(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function extractJsonBlocks_(text) {
  var blocks = [];
  var depth = 0;
  var start = -1;
  var inString = false;
  var escaped = false;

  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start > -1) {
        var candidate = text.slice(start, i + 1);
        var parsed = tryParseJson_(candidate);
        if (parsed) {
          blocks.push(parsed);
        }
        start = -1;
      }
    }
  }

  return blocks;
}

function extractItemsFromObjetosArrays_(text) {
  var items = [];
  var cursor = 0;

  while (cursor < text.length) {
    var keyIndex = text.indexOf('"objetos"', cursor);
    if (keyIndex === -1) break;

    var arrayStart = text.indexOf('[', keyIndex);
    if (arrayStart === -1) break;

    var i = arrayStart + 1;
    var inString = false;
    var escaped = false;

    while (i < text.length) {
      var ch = text.charAt(i);

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        i++;
        continue;
      }

      if (ch === '"') {
        inString = true;
        i++;
        continue;
      }

      if (ch === ']') {
        i++;
        break;
      }

      if (ch === '{') {
        var start = i;
        var depth = 1;
        i++;
        var innerString = false;
        var innerEscaped = false;

        while (i < text.length && depth > 0) {
          var c = text.charAt(i);
          if (innerString) {
            if (innerEscaped) {
              innerEscaped = false;
            } else if (c === '\\') {
              innerEscaped = true;
            } else if (c === '"') {
              innerString = false;
            }
          } else {
            if (c === '"') innerString = true;
            else if (c === '{') depth++;
            else if (c === '}') depth--;
          }
          i++;
        }

        var candidate = text.slice(start, i);
        var parsed = tryParseJson_(candidate);
        if (parsed && parsed.codObjeto) {
          items.push(parsed);
        }
        continue;
      }

      i++;
    }

    cursor = i;
  }

  return items;
}

function dedupeByCode_(objects) {
  var map = {};
  var order = [];

  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i] || {};
    var code = String(obj.codObjeto || '').trim();
    if (!code) continue;

    if (!map[code]) {
      order.push(code);
    }
    map[code] = obj;
  }

  var result = [];
  for (var j = 0; j < order.length; j++) {
    result.push(map[order[j]]);
  }

  return result;
}

function sanitizeClientName_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalizeText_(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text || /^null$/i.test(text) || /^undefined$/i.test(text)) {
    return '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

function formatDateOnly_(value) {
  if (!value) return '';

  var text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : '';
}

function formatDateTimeText_(value) {
  if (!value) return '';

  var text = String(value).replace('T', ' ');
  return text.length >= 19 ? text.slice(0, 19) : text;
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'America/Fortaleza', 'yyyy-MM-dd HH:mm:ss');
}

function todayKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Fortaleza', 'yyyy-MM-dd');
}

function diffDaysBetweenKeys_(leftKey, rightKey) {
  var left = dateKeyToUtc_(leftKey);
  var right = dateKeyToUtc_(rightKey);
  if (!left || !right) return 0;

  return Math.round((left - right) / 86400000);
}

function dateKeyToUtc_(key) {
  var text = String(key || '').slice(0, 10);
  var m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  return Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function compareDesc_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a === b) return 0;

  return a > b ? -1 : 1;
}

function compareAsc_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a === b) return 0;

  return a < b ? -1 : 1;
}

function round1_(value) {
  return Math.round(value * 10) / 10;
}