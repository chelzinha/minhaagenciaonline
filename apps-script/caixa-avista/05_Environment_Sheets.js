function summaryResponse_(date) {
  var env = environment_();
  var entries = listEntriesByDate_(env.entrySheet, date);
  return { ok: true, entries: entries, summary: buildSummary_(entries, date), closure: findClosureByDate_(env.closureSheet, date) };
}

function environment_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CFG.SPREADSHEET_ID_PROP);
  if (!id) throw appError_('Execute setupCaixaAvista() antes de publicar o Web App.', 'SETUP_REQUIRED');
  var ss = SpreadsheetApp.openById(id);
  return prepareEnvironment_(ss);
}

function prepareEnvironment_(ss) {
  return {
    ss: ss,
    clientSheet: getOrCreateSheet_(ss, CFG.SHEETS.CLIENTS, CFG.CLIENT_HEADERS),
    entrySheet: getOrCreateSheet_(ss, CFG.SHEETS.ENTRIES, CFG.ENTRY_HEADERS),
    closureSheet: getOrCreateSheet_(ss, CFG.SHEETS.CLOSURES, CFG.CLOSURE_HEADERS),
    exportRevenueSheet: getOrCreateSheet_(ss, CFG.SHEETS.EXPORT_REVENUE, CFG.REVENUE_HEADERS),
    exportExpenseSheet: getOrCreateSheet_(ss, CFG.SHEETS.EXPORT_EXPENSE, CFG.EXPENSE_HEADERS),
    exportControlSheet: getOrCreateSheet_(ss, CFG.SHEETS.EXPORT_CONTROL, CFG.EXPORT_CONTROL_HEADERS)
  };
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  ensureSheet_(sheet, headers);
  return sheet;
}

function ensureSheet_(sheet, headers) {
  var width = headers.length;
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  var existing = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (JSON.stringify(existing) !== JSON.stringify(headers)) sheet.getRange(1, 1, 1, width).setValues([headers]);
  sheet.setFrozenRows(1);
}

function listClients_(sheet, bypassCache) {
  var cache = CacheService.getScriptCache();
  if (!bypassCache) {
    var cached = cache.get(CFG.CACHE_CLIENTS_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch (error) {}
    }
  }
  var rows = readBody_(sheet, CFG.CLIENT_HEADERS.length);
  var clients = rows.filter(function (row) { return row[0] && String(row[5]).toLowerCase() !== 'false'; }).map(function (row) {
    return {
      id: String(row[0]), name: String(row[1]), normalized: String(row[2]),
      createdAt: asIso_(row[3]), createdBy: String(row[4] || ''), active: true
    };
  });
  try { cache.put(CFG.CACHE_CLIENTS_KEY, JSON.stringify(clients), CFG.CACHE_SECONDS); } catch (error) {}
  return clients;
}

function clearClientCache_() {
  try { CacheService.getScriptCache().remove(CFG.CACHE_CLIENTS_KEY); } catch (error) {}
}

function ensureDefaultClient_(ss, user) {
  var sheet = getOrCreateSheet_(ss, CFG.SHEETS.CLIENTS, CFG.CLIENT_HEADERS);
  var clients = listClients_(sheet, true);
  if (clients.some(function (client) { return client.normalized === normalizeSearch_('Cliente de Balcão'); })) return;
  appendRows_(sheet, [['cliente-balcao', 'Cliente de Balcão', normalizeSearch_('Cliente de Balcão'), new Date(), user.id, true]]);
  clearClientCache_();
}

function resolveClientForDraft_(clientSheet, draft, user) {
  if (draft.type !== 'RECEITA') return null;
  var clients = listClients_(clientSheet, true);
  var normalized = normalizeSearch_(draft.clientName);
  var existing = clients.filter(function (client) {
    return (draft.clientId && client.id === draft.clientId) || client.normalized === normalized;
  })[0];
  if (existing) return existing;
  var client = {
    id: Utilities.getUuid(), name: draft.clientName, normalized: normalized,
    createdAt: new Date().toISOString(), createdBy: user.id, active: true
  };
  appendRows_(clientSheet, [[client.id, client.name, client.normalized, new Date(), user.id, true]]);
  clearClientCache_();
  return client;
}
