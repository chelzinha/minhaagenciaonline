function setupCaixaAvista() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CFG.SPREADSHEET_ID_PROP);
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('CAIXA À VISTA - AGF JOSÉ BONIFÁCIO');
    props.setProperty(CFG.SPREADSHEET_ID_PROP, ss.getId());
  }
  prepareEnvironment_(ss);
  ensureDefaultClient_(ss, { id: 'setup', name: 'Configuração' });
  console.log('[CAIXA_AVISTA][setup] Planilha: ' + ss.getUrl());
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    requiredProperties: [
      CFG.PIX_KEY_PROP, CFG.PIX_NAME_PROP, CFG.PIX_CITY_PROP,
      'AGF_AUTH_JWT_SECRET', 'AGF_API_AUTH_MODE'
    ]
  };
}

function init_(dateValue, user) {
  var date = normalizeDate_(dateValue || todayIso_());
  var env = environment_();
  ensureDefaultClient_(env.ss, user);
  var clients = listClients_(env.clientSheet);
  var entries = listEntriesByDate_(env.entrySheet, date);
  var closure = findClosureByDate_(env.closureSheet, date);
  return {
    ok: true,
    date: date,
    clients: clients,
    entries: entries,
    summary: buildSummary_(entries, date),
    closure: closure,
    paymentOptions: CFG.PAYMENT_OPTIONS,
    expenseCategories: CFG.EXPENSE_CATEGORIES,
    pix: publicPixConfig_()
  };
}

function saveClient_(nameValue, user) {
  var name = validateClientName_(nameValue);
  var normalized = normalizeSearch_(name);
  return withLock_(function () {
    var env = environment_();
    var clients = listClients_(env.clientSheet, true);
    var existing = clients.filter(function (item) { return item.normalized === normalized; })[0];
    if (existing) return { ok: true, client: existing, duplicate: true };

    var client = {
      id: Utilities.getUuid(),
      name: name,
      normalized: normalized,
      createdAt: new Date().toISOString(),
      createdBy: user.id,
      active: true
    };
    appendRows_(env.clientSheet, [[client.id, client.name, client.normalized, new Date(), user.id, true]]);
    clearClientCache_();
    return { ok: true, client: client, duplicate: false };
  });
}
