function saveEntry_(payload, user) {
  return withLock_(function () {
    var env = environment_();
    var draft = validateEntryPayload_(payload);
    assertDateOpen_(env.closureSheet, draft.date);
    var client = resolveClientForDraft_(env.clientSheet, draft, user);
    var entry = buildEntry_(draft, client, user);
    appendRows_(env.entrySheet, [entryToRow_(entry)]);
    var entries = listEntriesByDate_(env.entrySheet, draft.date);
    return { ok: true, entry: entry, summary: buildSummary_(entries, draft.date) };
  });
}

function saveBatch_(payloads, user) {
  if (!Array.isArray(payloads) || !payloads.length) throw appError_('O lote está vazio.', 'EMPTY_BATCH');
  if (payloads.length > CFG.MAX_BATCH_SIZE) throw appError_('O lote aceita no máximo ' + CFG.MAX_BATCH_SIZE + ' linhas.', 'BATCH_TOO_LARGE');

  return withLock_(function () {
    var env = environment_();
    var drafts = payloads.map(validateEntryPayload_);
    var dates = unique_(drafts.map(function (draft) { return draft.date; }));
    if (dates.length !== 1) throw appError_('Todos os itens do lote devem ter a mesma data.', 'MIXED_BATCH_DATES');
    assertDateOpen_(env.closureSheet, dates[0]);

    var clients = listClients_(env.clientSheet, true);
    var clientByNormalized = {};
    clients.forEach(function (client) { clientByNormalized[client.normalized] = client; });
    var newClientRows = [];
    var newClients = [];

    drafts.forEach(function (draft) {
      if (draft.type !== 'RECEITA') return;
      var normalized = normalizeSearch_(draft.clientName);
      if (!clientByNormalized[normalized]) {
        var client = {
          id: Utilities.getUuid(), name: draft.clientName, normalized: normalized,
          createdAt: new Date().toISOString(), createdBy: user.id, active: true
        };
        clientByNormalized[normalized] = client;
        newClients.push(client);
        newClientRows.push([client.id, client.name, client.normalized, new Date(), user.id, true]);
      }
    });

    if (newClientRows.length) {
      appendRows_(env.clientSheet, newClientRows);
      clearClientCache_();
    }

    var entries = drafts.map(function (draft) {
      var client = draft.type === 'RECEITA' ? clientByNormalized[normalizeSearch_(draft.clientName)] : null;
      return buildEntry_(draft, client, user);
    });

    appendRows_(env.entrySheet, entries.map(entryToRow_));
    var dateEntries = listEntriesByDate_(env.entrySheet, dates[0]);
    return {
      ok: true,
      entries: entries,
      clients: clients.concat(newClients),
      summary: buildSummary_(dateEntries, dates[0])
    };
  });
}

function updatePixStatus_(entryIdValue, statusValue, dateValue, user) {
  var entryId = cleanText_(entryIdValue);
  var status = cleanText_(statusValue).toUpperCase();
  if (!entryId) throw appError_('Lançamento não informado.', 'ENTRY_REQUIRED');
  if (['PENDENTE', 'CONFIRMADO'].indexOf(status) < 0) throw appError_('Status Pix inválido.', 'INVALID_PIX_STATUS');

  return withLock_(function () {
    var env = environment_();
    var data = readBody_(env.entrySheet, CFG.ENTRY_HEADERS.length);
    var index = findEntryIndex_(data, entryId);
    if (index < 0) throw appError_('Lançamento não encontrado.', 'ENTRY_NOT_FOUND');
    var row = data[index];
    if (String(row[8]) !== 'PIX') throw appError_('Este lançamento não é Pix.', 'NOT_PIX');
    if (cleanText_(row[17])) throw appError_('O lançamento pertence a um caixa já fechado.', 'ENTRY_CLOSED');
    if (String(row[14]) === 'EXCLUIDO') throw appError_('O lançamento foi excluído.', 'ENTRY_DELETED');
    row[9] = status;
    writeBody_(env.entrySheet, data, CFG.ENTRY_HEADERS.length);
    var date = normalizeDate_(dateValue || row[1]);
    return { ok: true, summary: buildSummary_(listEntriesByDate_(env.entrySheet, date), date), updatedBy: user.id };
  });
}

function deleteEntry_(entryIdValue, dateValue, user) {
  var entryId = cleanText_(entryIdValue);
  if (!entryId) throw appError_('Lançamento não informado.', 'ENTRY_REQUIRED');

  return withLock_(function () {
    var env = environment_();
    var data = readBody_(env.entrySheet, CFG.ENTRY_HEADERS.length);
    var index = findEntryIndex_(data, entryId);
    if (index < 0) throw appError_('Lançamento não encontrado.', 'ENTRY_NOT_FOUND');
    var row = data[index];
    if (cleanText_(row[17])) throw appError_('O lançamento pertence a um caixa já fechado.', 'ENTRY_CLOSED');
    row[14] = 'EXCLUIDO';
    row[15] = new Date();
    row[16] = user.id;
    writeBody_(env.entrySheet, data, CFG.ENTRY_HEADERS.length);
    var date = normalizeDate_(dateValue || row[1]);
    return { ok: true, summary: buildSummary_(listEntriesByDate_(env.entrySheet, date), date) };
  });
}
