function closeOperational_(dateValue, user) {
  var date = normalizeDate_(dateValue || todayIso_());
  return withLock_(function () {
    var env = environment_();
    var existing = findClosureByDate_(env.closureSheet, date);
    if (existing && existing.status !== 'PROCESSANDO') {
      return { ok: true, closure: existing, alreadyClosed: true };
    }

    var entryRows = readBody_(env.entrySheet, CFG.ENTRY_HEADERS.length);
    var entries = rowsToEntries_(entryRows).filter(function (entry) {
      return entry.date === date && entry.status !== 'EXCLUIDO';
    });
    if (!entries.length) throw appError_('Não há movimentos para fechar.', 'NO_ENTRIES');
    var summary = buildSummary_(entries, date);
    if (summary.pixPendingCents > 0) {
      throw appError_('Ainda existem cobranças Pix aguardando confirmação. Aguarde o Santander ou trate a pendência antes do fechamento.', 'PIX_PENDING');
    }
    var closureId = existing ? existing.id : Utilities.getUuid();

    if (!existing) {
      appendRows_(env.closureSheet, [[
        closureId, date, new Date(), user.id, 'PROCESSANDO', summary.revenueCents,
        summary.expenseCents, summary.balanceCents, summary.pixPendingCents,
        expectedCash_(summary), summary.pixConfirmedCents, '', '', '', '', '', ''
      ]]);
    }

    exportClosureEntries_(env, closureId, entries, date);

    entryRows.forEach(function (row) {
      if (String(row[1]) === date && String(row[14]) !== 'EXCLUIDO') row[17] = closureId;
    });
    writeBody_(env.entrySheet, entryRows, CFG.ENTRY_HEADERS.length);

    var closureRows = readBody_(env.closureSheet, CFG.CLOSURE_HEADERS.length);
    var closureIndex = closureRows.findIndex(function (row) { return String(row[0]) === closureId; });
    if (closureIndex < 0) throw appError_('Falha ao localizar o fechamento criado.', 'CLOSURE_NOT_FOUND');
    closureRows[closureIndex][4] = 'OPERACIONAL_FECHADO';
    writeBody_(env.closureSheet, closureRows, CFG.CLOSURE_HEADERS.length);

    return { ok: true, closure: closureRowToObject_(closureRows[closureIndex]) };
  });
}

function reconcile_(payload, user) {
  if (!payload || typeof payload !== 'object') throw appError_('Dados de conferência ausentes.', 'INVALID_RECONCILIATION');
  var date = normalizeDate_(payload.date || todayIso_());
  var cashCounted = integerCents_(payload.cashCountedCents);
  var pixCounted = integerCents_(payload.pixCountedCents);
  var notes = cleanText_(payload.notes);

  return withLock_(function () {
    var env = environment_();
    var rows = readBody_(env.closureSheet, CFG.CLOSURE_HEADERS.length);
    var index = rows.findIndex(function (row) { return String(row[1]) === date; });
    if (index < 0) throw appError_('Faça primeiro o fechamento operacional.', 'CLOSURE_REQUIRED');
    var row = rows[index];
    if (String(row[4]) === 'PROCESSANDO') throw appError_('O fechamento ainda está em processamento.', 'CLOSURE_PROCESSING');
    var cashExpected = Number(row[9] || 0);
    var pixExpected = Number(row[10] || 0);
    row[4] = 'CONFERIDO';
    row[11] = cashCounted;
    row[12] = pixCounted;
    row[13] = cashCounted - cashExpected;
    row[14] = pixCounted - pixExpected;
    row[15] = notes;
    row[16] = new Date();
    writeBody_(env.closureSheet, rows, CFG.CLOSURE_HEADERS.length);
    console.log('[CAIXA_AVISTA][reconcile] date=' + date + ' user=' + user.id);
    return { ok: true, closure: closureRowToObject_(row) };
  });
}
