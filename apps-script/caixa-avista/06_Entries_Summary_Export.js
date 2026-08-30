function buildEntry_(draft, client, user) {
  return {
    id: draft.entryId || Utilities.getUuid(), date: draft.date, createdAt: new Date().toISOString(), type: draft.type,
    clientId: client ? client.id : '', clientName: client ? client.name : CFG.DEFAULT_SUPPLIER,
    objectCount: draft.objectCount, amountCents: draft.amountCents, paymentMethod: draft.paymentMethod,
    pixStatus: draft.pixStatus, expenseCategory: draft.expenseCategory, description: draft.description,
    operatorId: user.id, operatorName: user.name, status: 'ATIVO', deletedAt: '', deletedBy: '', closureId: '', closed: false,
    pixTxid: draft.pixTxid || '', pixE2eid: '', pixReceivedAt: '', pixProvider: draft.pixProvider || ''
  };
}

function entryToRow_(entry) {
  return [
    entry.id, entry.date, new Date(entry.createdAt), entry.type, entry.clientId, entry.clientName,
    entry.objectCount, entry.amountCents, entry.paymentMethod, entry.pixStatus, entry.expenseCategory,
    entry.description, entry.operatorId, entry.operatorName, entry.status, entry.deletedAt,
    entry.deletedBy, entry.closureId, entry.pixTxid, entry.pixE2eid, entry.pixReceivedAt, entry.pixProvider
  ];
}

function rowsToEntries_(rows) {
  return rows.filter(function (row) { return row[0]; }).map(function (row) {
    return {
      id: String(row[0]), date: String(row[1]), createdAt: asIso_(row[2]), type: String(row[3]),
      clientId: String(row[4] || ''), clientName: String(row[5] || ''), objectCount: Number(row[6] || 0),
      amountCents: Number(row[7] || 0), paymentMethod: String(row[8] || ''), pixStatus: String(row[9] || ''),
      expenseCategory: String(row[10] || ''), description: String(row[11] || ''), operatorId: String(row[12] || ''),
      operatorName: String(row[13] || ''), status: String(row[14] || 'ATIVO'), deletedAt: asIso_(row[15]),
      deletedBy: String(row[16] || ''), closureId: String(row[17] || ''), closed: Boolean(row[17]),
      pixTxid: String(row[18] || ''), pixE2eid: String(row[19] || ''), pixReceivedAt: asIso_(row[20]),
      pixProvider: String(row[21] || '')
    };
  });
}

function listEntriesByDate_(sheet, date) {
  return rowsToEntries_(readBody_(sheet, CFG.ENTRY_HEADERS.length)).filter(function (entry) { return entry.date === date; });
}

function buildSummary_(entries, date) {
  var summary = {
    date: date, revenueCents: 0, expenseCents: 0, balanceCents: 0,
    revenueCount: 0, expenseCount: 0, pixPendingCents: 0, pixConfirmedCents: 0, byPayment: {}
  };
  entries.filter(function (entry) { return entry.status !== 'EXCLUIDO'; }).forEach(function (entry) {
    if (entry.type === 'DESPESA') {
      summary.expenseCents += entry.amountCents;
      summary.expenseCount += 1;
      return;
    }
    summary.revenueCents += entry.amountCents;
    summary.revenueCount += 1;
    summary.byPayment[entry.paymentMethod] = (summary.byPayment[entry.paymentMethod] || 0) + entry.amountCents;
    if (entry.paymentMethod === 'PIX') {
      if (entry.pixStatus === 'CONFIRMADO') summary.pixConfirmedCents += entry.amountCents;
      else summary.pixPendingCents += entry.amountCents;
    }
  });
  summary.balanceCents = summary.revenueCents - summary.expenseCents;
  return summary;
}

function expectedCash_(summary) {
  return Math.max(0, Number(summary.byPayment.Dinheiro || 0) - Number(summary.expenseCents || 0));
}

function exportClosureEntries_(env, closureId, entries, date) {
  var controls = readBody_(env.exportControlSheet, CFG.EXPORT_CONTROL_HEADERS.length);
  var exported = {};
  controls.forEach(function (row) { if (row[1]) exported[String(row[1])] = true; });
  var revenueRows = [];
  var expenseRows = [];
  var controlRows = [];

  entries.forEach(function (entry) {
    if (exported[entry.id]) return;
    if (entry.type === 'DESPESA') expenseRows.push(buildExpenseExportRow_(entry, date));
    else revenueRows.push(buildRevenueExportRow_(entry, date));
    controlRows.push([closureId, entry.id, entry.type, new Date()]);
  });

  if (revenueRows.length) appendRows_(env.exportRevenueSheet, revenueRows);
  if (expenseRows.length) appendRows_(env.exportExpenseSheet, expenseRows);
  if (controlRows.length) appendRows_(env.exportControlSheet, controlRows);
}

function buildRevenueExportRow_(entry, date) {
  var dateBr = isoToBr_(date);
  var money = centsToBr_(entry.amountCents);
  var description = entry.description || ('Atendimento de balcão - ' + entry.paymentMethod);
  var account = accountForPayment_(entry.paymentMethod);
  var costCenter = propertyOrDefault_(CFG.COST_CENTER_PROP, 'Metro (Projeto Rachel)');
  var pixAudit = entry.paymentMethod === 'PIX'
    ? ' | TXID: ' + (entry.pixTxid || '-') + ' | E2EID: ' + (entry.pixE2eid || '-')
    : '';
  return [
    '', entry.clientName, entry.id, dateBr, dateBr, dateBr, 'Sem recorrência', '', description,
    'Lançamento Financeiro', 'Em aberto', '-', money, entry.paymentMethod, money, '0,00', '0,00',
    '0,00', '0,00', money, '0,00', '0,00', '0,00', money, account, dateBr, '',
    description + (entry.objectCount ? ' | Objetos: ' + entry.objectCount : '') + pixAudit, CFG.REVENUE_CATEGORY,
    money, costCenter, money
  ];
}

function buildExpenseExportRow_(entry, date) {
  var dateBr = isoToBr_(date);
  var money = centsToBr_(entry.amountCents);
  var category = CFG.EXPENSE_CATEGORY_MAP[entry.expenseCategory] || CFG.EXPENSE_CATEGORY_MAP.Outros;
  var costCenter = propertyOrDefault_(CFG.COST_CENTER_PROP, 'Metro (Projeto Rachel)');
  return [
    '', CFG.DEFAULT_SUPPLIER, entry.id, dateBr, dateBr, dateBr, 'Sem recorrência', '', entry.description,
    'Lançamento Financeiro', 'Em aberto', '-', money, 'Dinheiro', money, '0,00', '0,00', '0,00',
    '0,00', money, '0,00', '0,00', '0,00', money, accountForPayment_('Dinheiro'), dateBr, '',
    entry.description, category, money, costCenter, money
  ];
}

function findClosureByDate_(sheet, date) {
  var rows = readBody_(sheet, CFG.CLOSURE_HEADERS.length);
  var row = rows.filter(function (item) { return String(item[1]) === date; })[0];
  return row ? closureRowToObject_(row) : null;
}

function closureRowToObject_(row) {
  return {
    id: String(row[0]), date: String(row[1]), createdAt: asIso_(row[2]), createdBy: String(row[3] || ''),
    status: String(row[4] || ''), revenueCents: Number(row[5] || 0), expenseCents: Number(row[6] || 0),
    balanceCents: Number(row[7] || 0), pixPendingCents: Number(row[8] || 0), cashExpectedCents: Number(row[9] || 0),
    pixConfirmedExpectedCents: Number(row[10] || 0), cashCountedCents: Number(row[11] || 0),
    pixCountedCents: Number(row[12] || 0), cashDifferenceCents: Number(row[13] || 0),
    pixDifferenceCents: Number(row[14] || 0), notes: String(row[15] || ''), reconciledAt: asIso_(row[16])
  };
}

function assertDateOpen_(closureSheet, date) {
  var closure = findClosureByDate_(closureSheet, date);
  if (closure) throw appError_('O movimento desta data já foi fechado.', 'DATE_CLOSED');
}
