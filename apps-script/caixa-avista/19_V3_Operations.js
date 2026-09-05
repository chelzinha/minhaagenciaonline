/**
 * CAIXA À VISTA V3
 *
 * Regras operacionais:
 * - Pix pendente faz parte dos movimentos do dia e não bloqueia fechamento.
 * - Pix pode ser confirmado depois do fechamento, inclusive em dia posterior.
 * - Depois do fechamento principal, novos lançamentos permanecem permitidos.
 * - Um novo fechamento no mesmo dia cria um complemento e envia somente
 *   lançamentos ainda não vinculados a fechamento anterior.
 * - Valores já enviados ao Conta Azul nunca são reenfileirados pelo complemento.
 * - A conferência do numerário confirma o valor esperado; o backend não depende
 *   de valor digitado no navegador.
 */

var CAIXA_V3_SUPPLEMENT_SHEET = 'Fechamentos_Complementares';
var CAIXA_V3_SUPPLEMENT_HEADERS = [
  'supplement_id',
  'date_iso',
  'unit_id',
  'unit_name',
  'base_closure_id',
  'sequence',
  'created_at',
  'created_by',
  'created_by_name',
  'status',
  'revenue_cents',
  'expense_cents',
  'net_cents',
  'cash_revenue_cents',
  'cash_expense_cents',
  'expected_cash_cents',
  'counted_cash_cents',
  'closing_withdrawal_cents',
  'carryover_cents',
  'notes',
  'entry_ids_json'
];

function v3SupplementSheet_(env) {
  var sheet = env.ss.getSheetByName(CAIXA_V3_SUPPLEMENT_SHEET);

  if (!sheet) {
    sheet = env.ss.insertSheet(CAIXA_V3_SUPPLEMENT_SHEET);
    sheet.getRange(1, 1, 1, CAIXA_V3_SUPPLEMENT_HEADERS.length)
      .setValues([CAIXA_V3_SUPPLEMENT_HEADERS]);
    sheet.setFrozenRows(1);
  }

  var width = CAIXA_V3_SUPPLEMENT_HEADERS.length;
  var current = sheet.getRange(1, 1, 1, width).getValues()[0];

  if (current.join('|') !== CAIXA_V3_SUPPLEMENT_HEADERS.join('|')) {
    throw appError_(
      'A estrutura de Fechamentos_Complementares está diferente da versão esperada.',
      'V3_SUPPLEMENT_SCHEMA_MISMATCH'
    );
  }

  return sheet;
}

function v3BuildSummary_(env, date, unitId) {
  var entries = v2EntriesByDate_(env, date, unitId);
  var withdrawals = v2WithdrawalsByDate_(env, date, unitId);
  var summary = {
    date: date,
    unitId: unitId,
    revenueCents: 0,
    expenseCents: 0,
    netCents: 0,
    revenueCount: 0,
    expenseCount: 0,
    byPayment: {},
    countByPayment: {},
    cashRevenueCents: 0,
    cashExpenseCents: 0,
    pixPendingCents: 0,
    pixConfirmedCents: 0,
    withdrawalsCents: 0,
    openingCashCents: 0,
    expectedCashCents: 0
  };

  entries.forEach(function(entry) {
    if (entry.type === 'DESPESA') {
      summary.expenseCents += entry.amountCents;
      summary.expenseCount += 1;

      if (entry.paymentId === 'DINHEIRO') {
        summary.cashExpenseCents += entry.amountCents;
      }
      return;
    }

    /*
     * V3: todo lançamento Pix ativo pertence ao movimento do dia,
     * independentemente de o crédito já ter sido confirmado.
     */
    summary.revenueCents += entry.amountCents;
    summary.revenueCount += 1;
    summary.byPayment[entry.paymentId] =
      (summary.byPayment[entry.paymentId] || 0) + entry.amountCents;
    summary.countByPayment[entry.paymentId] =
      (summary.countByPayment[entry.paymentId] || 0) + 1;

    if (entry.paymentId === 'DINHEIRO') {
      summary.cashRevenueCents += entry.amountCents;
    }

    if (entry.paymentContaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO') {
      if (String(entry.pixStatus || '').toUpperCase() === 'CONFIRMADO') {
        summary.pixConfirmedCents += entry.amountCents;
      } else {
        summary.pixPendingCents += entry.amountCents;
      }
    }
  });

  withdrawals.forEach(function(withdrawal) {
    summary.withdrawalsCents += withdrawal.amountCents;
  });

  summary.openingCashCents = v2OpeningBalance_(env, date, unitId);
  summary.expectedCashCents =
    summary.openingCashCents +
    summary.cashRevenueCents -
    summary.cashExpenseCents -
    summary.withdrawalsCents;
  summary.netCents = summary.revenueCents - summary.expenseCents;

  return summary;
}

function v3UnclosedEntries_(env, date, unitId) {
  return v2EntriesByDate_(env, date, unitId).filter(function(entry) {
    return (
      String(entry.status || '').toUpperCase() !== 'EXCLUIDO' &&
      !String(entry.closureId || '').trim()
    );
  });
}

function v3DeltaSummary_(entries) {
  var delta = {
    revenueCents: 0,
    expenseCents: 0,
    netCents: 0,
    cashRevenueCents: 0,
    cashExpenseCents: 0,
    count: entries.length
  };

  entries.forEach(function(entry) {
    if (entry.type === 'DESPESA') {
      delta.expenseCents += entry.amountCents;
      if (entry.paymentId === 'DINHEIRO') {
        delta.cashExpenseCents += entry.amountCents;
      }
    } else {
      delta.revenueCents += entry.amountCents;
      if (entry.paymentId === 'DINHEIRO') {
        delta.cashRevenueCents += entry.amountCents;
      }
    }
  });

  delta.netCents = delta.revenueCents - delta.expenseCents;
  return delta;
}

function v3QueueStatusForClosure_(env, closureId) {
  var queue = v2ReadObjects_(
    env.caQueue,
    CAIXA_V2_CFG.HEADERS.CA_QUEUE
  ).filter(function(item) {
    return String(item.closure_id || '') === String(closureId || '');
  });

  if (!queue.length) return 'SEM_FILA';
  if (queue.every(function(item) { return String(item.status) === 'SINCRONIZADO'; })) {
    return 'SINCRONIZADO';
  }
  if (queue.some(function(item) {
    return ['ERRO', 'CONFIGURACAO_PENDENTE'].indexOf(String(item.status)) >= 0;
  })) {
    return 'COM_ERRO';
  }
  return 'PENDENTE';
}

function v3SupplementHistory_(env, date, unitId) {
  var sheet = v3SupplementSheet_(env);
  var last = sheet.getLastRow();
  if (last < 2) return [];

  var rows = sheet
    .getRange(2, 1, last - 1, CAIXA_V3_SUPPLEMENT_HEADERS.length)
    .getValues();

  return rows
    .filter(function(row) {
      return (
        v2SheetDateIso_(row[1]) === v2SheetDateIso_(date) &&
        String(row[2] || '') === String(unitId || '')
      );
    })
    .map(function(row) {
      return {
        id: String(row[0]),
        date: v2SheetDateIso_(row[1]),
        unitId: String(row[2]),
        baseClosureId: String(row[4]),
        sequence: Number(row[5] || 0),
        createdAt: v2Iso_(row[6]),
        createdByName: String(row[8] || ''),
        revenueCents: Number(row[10] || 0),
        expenseCents: Number(row[11] || 0),
        netCents: Number(row[12] || 0),
        expectedCashCents: Number(row[15] || 0),
        carryoverCents: Number(row[18] || 0),
        notes: String(row[19] || ''),
        contaAzulStatus: v3QueueStatusForClosure_(env, row[0])
      };
    })
    .sort(function(a, b) { return a.sequence - b.sequence; });
}

function v3SupplementState_(env, date, unitId, baseClosure) {
  if (!baseClosure) {
    return {
      hasBaseClosure: false,
      pendingCount: 0,
      pendingRevenueCents: 0,
      pendingExpenseCents: 0,
      pendingNetCents: 0,
      supplementCount: 0
    };
  }

  var entries = v3UnclosedEntries_(env, date, unitId);
  var delta = v3DeltaSummary_(entries);
  var history = v3SupplementHistory_(env, date, unitId);

  return {
    hasBaseClosure: true,
    pendingCount: entries.length,
    pendingRevenueCents: delta.revenueCents,
    pendingExpenseCents: delta.expenseCents,
    pendingNetCents: delta.netCents,
    supplementCount: history.length,
    history: history
  };
}

function v3PendingPixBacklog_(env, currentDate, unitId) {
  return v2ReadObjects_(
    env.entries,
    CAIXA_V2_CFG.HEADERS.ENTRIES
  )
    .filter(function(item) {
      var date = v2SheetDateIso_(item.date_iso);
      var pixStatus = String(item.pix_status || '').toUpperCase();
      return (
        String(item.unit_id || '') === String(unitId || '') &&
        date < v2SheetDateIso_(currentDate) &&
        String(item.status || '').toUpperCase() !== 'EXCLUIDO' &&
        String(item.payment_ca_method || '') === 'PIX_PAGAMENTO_INSTANTANEO' &&
        ['CRIANDO', 'ATIVA', 'PENDENTE'].indexOf(pixStatus) >= 0
      );
    })
    .map(function(item) {
      return v2RowEntry_(item._row);
    });
}

function v3DecorateClosure_(closure, summary) {
  if (!closure) return null;
  var copy = {};
  Object.keys(closure).forEach(function(key) { copy[key] = closure[key]; });
  copy.originalCarryoverCents = Number(closure.carryoverCents || 0);
  copy.carryoverCents = Number(summary.expectedCashCents || 0);
  return copy;
}

function v3Init_(dateValue, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var env = v2Environment_();
    v2SeedLibrary_(env);

    var context = v2ResolveContext_(env, user);
    var date = v2Today_();
    var unitId = String(context.unit.unit_id);
    var summary = v3BuildSummary_(env, date, unitId);
    var baseClosure = v2FindClosure_(env, date, unitId);
    var todayEntries = v2EntriesByDate_(env, date, unitId);
    var backlog = v3PendingPixBacklog_(env, date, unitId);

    return {
      ok: true,
      version: 'V3',
      serverDate: date,
      timezone: CAIXA_V2_CFG.TIMEZONE,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      },
      library: v2Library_(env, context),
      clients: v2ListClients_(env),
      entries: todayEntries.concat(backlog),
      withdrawals: v2WithdrawalsByDate_(env, date, unitId),
      summary: summary,
      closure: v3DecorateClosure_(baseClosure, summary),
      supplementState: v3SupplementState_(env, date, unitId, baseClosure),
      pendingPixBacklogCount: backlog.length
    };
  } finally {
    lock.releaseLock();
  }
}

function v3SaveEntry_(payload, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env, user);
    var library = v2Library_(env, context);
    var draft = v2ValidateDraft_(payload, context, library);
    var existingRecord = v2FindEntryRecordById_(env, draft.entryId);

    if (existingRecord) {
      var existingEntry = v2AssertIdempotentEntry_(existingRecord, draft);
      var existingSummary = v3BuildSummary_(env, draft.date, draft.unitId);
      var existingClosure = v2FindClosure_(env, draft.date, draft.unitId);
      return {
        ok: true,
        idempotent: true,
        entry: existingEntry,
        summary: existingSummary,
        supplementState: v3SupplementState_(
          env,
          draft.date,
          draft.unitId,
          existingClosure
        )
      };
    }

    /* V3: não bloqueia novo lançamento só porque já houve fechamento no dia. */
    var entry = v2BuildEntry_(draft, user, context, library, '', 1);
    env.entries.appendRow(v2EntryRow_(entry));

    var summary = v3BuildSummary_(env, draft.date, draft.unitId);
    var baseClosure = v2FindClosure_(env, draft.date, draft.unitId);

    return {
      ok: true,
      entry: entry,
      summary: summary,
      supplementState: v3SupplementState_(
        env,
        draft.date,
        draft.unitId,
        baseClosure
      )
    };
  } finally {
    lock.releaseLock();
  }
}

function v3SaveBatch_(payloads, user) {
  if (!Array.isArray(payloads) || !payloads.length) {
    throw appError_('Lote vazio.', 'EMPTY_BATCH');
  }
  if (payloads.length > CAIXA_V2_CFG.MAX_BATCH) {
    throw appError_('O lote aceita no máximo 100 itens.', 'BATCH_TOO_LARGE');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env, user);
    var library = v2Library_(env, context);
    var drafts = payloads.map(function(payload) {
      return v2ValidateDraft_(payload, context, library);
    });
    var date = drafts[0].date;
    var unitId = drafts[0].unitId;

    drafts.forEach(function(draft) {
      if (draft.date !== date || draft.unitId !== unitId) {
        throw appError_(
          'Todos os itens do lote devem ter a mesma data e unidade.',
          'MIXED_BATCH'
        );
      }
    });

    var existingById = {};
    v2ReadObjects_(env.entries, CAIXA_V2_CFG.HEADERS.ENTRIES)
      .forEach(function(item) {
        var id = String(item.entry_id || '').trim();
        if (id) existingById[id] = item;
      });

    var batchId = '';
    var outputEntries = new Array(drafts.length);
    var missing = [];

    drafts.forEach(function(draft, index) {
      var record = existingById[draft.entryId];
      if (record) {
        var existing = v2AssertIdempotentEntry_(record, draft);
        outputEntries[index] = existing;
        if (!batchId && existing.batchId) batchId = existing.batchId;
        return;
      }
      missing.push({ draft: draft, index: index });
    });

    if (missing.length) {
      if (!batchId) batchId = Utilities.getUuid();
      var newEntries = missing.map(function(item) {
        var entry = v2BuildEntry_(
          item.draft,
          user,
          context,
          library,
          batchId,
          item.index + 1
        );
        outputEntries[item.index] = entry;
        return entry;
      });

      env.entries
        .getRange(
          env.entries.getLastRow() + 1,
          1,
          newEntries.length,
          CAIXA_V2_CFG.HEADERS.ENTRIES.length
        )
        .setValues(newEntries.map(v2EntryRow_));
    }

    var summary = v3BuildSummary_(env, date, unitId);
    var baseClosure = v2FindClosure_(env, date, unitId);

    return {
      ok: true,
      idempotent: missing.length === 0,
      batchId: batchId || (outputEntries[0] && outputEntries[0].batchId) || '',
      entries: outputEntries,
      summary: summary,
      supplementState: v3SupplementState_(env, date, unitId, baseClosure)
    };
  } finally {
    lock.releaseLock();
  }
}

function v3MarkEntriesWithClosure_(env, entryIds, closureId) {
  if (!entryIds.length) return;
  var wanted = {};
  entryIds.forEach(function(id) { wanted[String(id)] = true; });

  var last = env.entries.getLastRow();
  if (last < 2) return;

  var values = env.entries
    .getRange(2, 1, last - 1, CAIXA_V2_CFG.HEADERS.ENTRIES.length)
    .getValues();
  var changed = false;

  values.forEach(function(row) {
    if (
      wanted[String(row[0])] &&
      String(row[32] || '').toUpperCase() !== 'EXCLUIDO' &&
      !String(row[33] || '').trim()
    ) {
      row[33] = closureId;
      changed = true;
    }
  });

  if (changed) {
    env.entries
      .getRange(2, 1, values.length, values[0].length)
      .setValues(values);
  }
}

function v3EntriesForClosure_(env, closureId) {
  return v2ReadObjects_(env.entries, CAIXA_V2_CFG.HEADERS.ENTRIES)
    .filter(function(item) {
      return (
        String(item.closure_id || '') === String(closureId || '') &&
        String(item.status || '').toUpperCase() !== 'EXCLUIDO'
      );
    })
    .map(function(item) { return v2RowEntry_(item._row); });
}

function v3WriteSupplement_(env, data) {
  var sheet = v3SupplementSheet_(env);
  sheet.appendRow([
    data.id,
    data.date,
    data.unitId,
    data.unitName,
    data.baseClosureId,
    data.sequence,
    data.createdAt,
    data.user.id,
    data.user.name,
    'FECHADO',
    data.delta.revenueCents,
    data.delta.expenseCents,
    data.delta.netCents,
    data.delta.cashRevenueCents,
    data.delta.cashExpenseCents,
    data.summary.expectedCashCents,
    data.summary.expectedCashCents,
    data.closingWithdrawalCents,
    data.carryoverCents,
    data.notes,
    JSON.stringify(data.entryIds)
  ]);
}

function v3CloseCash_(payload, user) {
  payload = payload || {};

  if (!v2Bool_(payload.declarationConfirmed)) {
    throw appError_(
      'Confirme a declaração de conferência.',
      'DECLARATION_REQUIRED'
    );
  }

  var result;
  var dispatchClosureId = '';
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env, user);

    if (!context.permissions.close) {
      throw appError_('Usuário sem permissão para fechar o caixa.', 'FORBIDDEN');
    }

    var date = v2Today_();
    var unitId = String(context.unit.unit_id);
    var baseClosure = v2FindClosure_(env, date, unitId);
    var summary = v3BuildSummary_(env, date, unitId);
    var newEntries = v3UnclosedEntries_(env, date, unitId);

    if (!baseClosure && !newEntries.length) {
      throw appError_('Não há movimentos para fechar.', 'NO_ENTRIES');
    }

    if (baseClosure && !newEntries.length) {
      return {
        ok: true,
        alreadyClosed: true,
        noNewMovements: true,
        closure: v3DecorateClosure_(baseClosure, summary),
        summary: summary,
        supplementState: v3SupplementState_(env, date, unitId, baseClosure)
      };
    }

    /*
     * V3: marcar "Conferi o numerário" significa confirmar exatamente
     * o valor esperado. countedCashCents vindo do browser é ignorado.
     */
    var counted = Math.round(Number(summary.expectedCashCents || 0));
    var closingWithdrawal = Math.round(Number(payload.closingWithdrawalCents || 0));

    if (closingWithdrawal < 0 || closingWithdrawal > counted) {
      throw appError_(
        'Sangria do fechamento inválida.',
        'INVALID_CLOSING_WITHDRAWAL'
      );
    }

    var now = new Date();
    var carryover = counted - closingWithdrawal;
    var notes = String(payload.notes || '').trim();
    var closureId = Utilities.getUuid();
    dispatchClosureId = closureId;

    if (closingWithdrawal > 0) {
      v2RecordWithdrawal_(env, context, user, {
        date: date,
        amountCents: closingWithdrawal,
        balanceBeforeCents: counted,
        destination: payload.withdrawalDestination || 'Financeiro',
        notes: payload.withdrawalNotes || 'Sangria realizada no fechamento',
        closureId: closureId
      });
      summary = v3BuildSummary_(env, date, unitId);
      counted = Math.round(Number(summary.expectedCashCents || 0));
      carryover = counted;
    }

    var entryIds = newEntries.map(function(entry) { return entry.id; });

    if (!baseClosure) {
      env.closures.appendRow([
        closureId,
        date,
        unitId,
        String(context.unit.name || unitId),
        String(context.unit.cost_center_ca_id || ''),
        String(context.unit.cost_center_name || ''),
        now,
        user.id,
        user.name,
        'FECHADO',
        summary.revenueCents,
        summary.expenseCents,
        summary.netCents,
        JSON.stringify(summary.byPayment),
        JSON.stringify(summary.countByPayment),
        summary.openingCashCents,
        summary.cashRevenueCents,
        summary.cashExpenseCents,
        summary.withdrawalsCents,
        summary.expectedCashCents,
        summary.expectedCashCents,
        0,
        closingWithdrawal,
        carryover,
        notes,
        CAIXA_V2_CFG.CASH_DECLARATION_VERSION,
        CAIXA_V2_CFG.CASH_DECLARATION,
        true,
        now,
        'PENDENTE',
        '',
        '',
        'PENDENTE'
      ]);

      v3MarkEntriesWithClosure_(env, entryIds, closureId);
      v2UpdateDailyBalanceClose_(
        env,
        date,
        unitId,
        summary,
        summary.expectedCashCents,
        0,
        closingWithdrawal,
        carryover,
        user
      );

      var pdf = v2GenerateClosingPdf_(env, closureId, context);
      v2UpdateClosurePdf_(env, closureId, pdf);
    } else {
      var history = v3SupplementHistory_(env, date, unitId);
      var delta = v3DeltaSummary_(newEntries);
      var sequence = history.length + 1;

      v3WriteSupplement_(env, {
        id: closureId,
        date: date,
        unitId: unitId,
        unitName: String(context.unit.name || unitId),
        baseClosureId: baseClosure.id,
        sequence: sequence,
        createdAt: now,
        user: user,
        delta: delta,
        summary: summary,
        closingWithdrawalCents: closingWithdrawal,
        carryoverCents: carryover,
        notes: notes,
        entryIds: entryIds
      });

      v3MarkEntriesWithClosure_(env, entryIds, closureId);
      v2UpdateDailyBalanceClose_(
        env,
        date,
        unitId,
        summary,
        summary.expectedCashCents,
        0,
        closingWithdrawal,
        carryover,
        user
      );
    }

    var entriesForDispatch = v3EntriesForClosure_(env, closureId);
    v2EnqueueContaAzul_(env, closureId, entriesForDispatch);

    var refreshedBase = v2FindClosure_(env, date, unitId) || baseClosure;
    var refreshedSummary = v3BuildSummary_(env, date, unitId);

    result = {
      ok: true,
      mode: baseClosure ? 'SUPPLEMENT' : 'INITIAL',
      supplementId: baseClosure ? closureId : '',
      closure: v3DecorateClosure_(refreshedBase, refreshedSummary),
      summary: refreshedSummary,
      supplementState: v3SupplementState_(env, date, unitId, refreshedBase)
    };
  } finally {
    lock.releaseLock();
  }

  try {
    result.contaAzulDispatch = processContaAzulQueueV2(20, dispatchClosureId);
  } catch (error) {
    result.contaAzulDispatch = {
      ok: false,
      error: String(error && error.message ? error.message : error)
    };
  }

  try {
    var refreshedEnv = v2Environment_();
    var refreshedDate = v2Today_();
    var refreshedUnitId = String(result.summary.unitId || '');
    var refreshedClosure = v2FindClosure_(refreshedEnv, refreshedDate, refreshedUnitId);
    var finalSummary = v3BuildSummary_(refreshedEnv, refreshedDate, refreshedUnitId);
    result.summary = finalSummary;
    result.closure = v3DecorateClosure_(refreshedClosure, finalSummary);
    result.supplementState = v3SupplementState_(
      refreshedEnv,
      refreshedDate,
      refreshedUnitId,
      refreshedClosure
    );
  } catch (_) {}

  return result;
}

function v3SyncPix_(payload, user) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var env = v2Environment_();
    var context = user ? v2ResolveContext_(env, user) : null;
    var last = env.entries.getLastRow();

    if (last < 2) {
      throw appError_('Lançamento Pix não encontrado.', 'ENTRY_NOT_FOUND');
    }

    var status = String(payload.status || payload.pixStatus || '')
      .toUpperCase()
      .trim();
    var allowed = [
      'CRIANDO', 'ATIVA', 'PENDENTE', 'CONFIRMADO',
      'EXPIRADO', 'CANCELADO', 'ERRO'
    ];

    if (allowed.indexOf(status) < 0) {
      throw appError_('Status Pix inválido.', 'INVALID_PIX_STATUS');
    }

    var rows = env.entries
      .getRange(2, 1, last - 1, CAIXA_V2_CFG.HEADERS.ENTRIES.length)
      .getValues();
    var entryId = String(payload.entryId || '').trim();
    var txid = String(payload.txid || '').trim();
    var index = -1;

    if (entryId) {
      rows.some(function(row, rowIndex) {
        if (String(row[0]) === entryId) {
          index = rowIndex;
          return true;
        }
        return false;
      });
    } else if (txid && txid !== '***') {
      rows.some(function(row, rowIndex) {
        if (String(row[28]) === txid) {
          index = rowIndex;
          return true;
        }
        return false;
      });
    } else {
      throw appError_(
        'Informe o identificador da cobrança Pix.',
        'PIX_REFERENCE_REQUIRED'
      );
    }

    if (index < 0) {
      throw appError_('Lançamento Pix não encontrado.', 'ENTRY_NOT_FOUND');
    }

    var row = rows[index];

    if (String(row[17]) !== 'PIX_PAGAMENTO_INSTANTANEO') {
      throw appError_('O lançamento não é Pix.', 'NOT_PIX');
    }

    if (context) {
      if (!context.permissions.revenue) {
        throw appError_('Usuário sem permissão para confirmar Pix.', 'FORBIDDEN');
      }
      if (String(row[7] || '') !== String(context.unit.unit_id || '')) {
        throw appError_(
          'A cobrança Pix pertence a outra unidade.',
          'UNIT_MISMATCH'
        );
      }
    }

    var currentStatus = String(row[27] || '').toUpperCase().trim();
    var entryStatus = String(row[32] || '').toUpperCase().trim();
    var closureId = String(row[33] || '').trim();

    if (
      (entryStatus === 'EXCLUIDO' || currentStatus === 'CANCELADO') &&
      status !== 'CANCELADO'
    ) {
      throw appError_('Esta cobrança Pix foi cancelada.', 'PIX_CANCELLED');
    }

    if (currentStatus === 'CONFIRMADO' && status !== 'CONFIRMADO') {
      throw appError_('Este Pix já foi confirmado.', 'PIX_ALREADY_CONFIRMED');
    }

    /*
     * V3: após fechamento, somente a baixa PENDENTE/ATIVA/CRIANDO -> CONFIRMADO
     * é permitida. Nenhuma outra mutação retroativa do lançamento fechado é aceita.
     */
    if (
      closureId &&
      status !== currentStatus &&
      !(
        status === 'CONFIRMADO' &&
        ['CRIANDO', 'ATIVA', 'PENDENTE'].indexOf(currentStatus) >= 0
      )
    ) {
      throw appError_(
        'Após o fechamento, esta cobrança só pode ser confirmada como recebida.',
        'CLOSED_PIX_TRANSITION_NOT_ALLOWED'
      );
    }

    var received = Math.round(Number(payload.amountCents || 0));
    if (status === 'CONFIRMADO' && received !== Number(row[14])) {
      throw appError_('Valor Pix divergente.', 'PIX_AMOUNT_MISMATCH');
    }

    row[27] = status;
    if (txid && txid !== '***') row[28] = txid;
    if (payload.e2eid) row[29] = payload.e2eid;
    if (status === 'CONFIRMADO') row[30] = new Date();
    else if (payload.receivedAt) row[30] = payload.receivedAt;
    if (payload.provider) row[31] = payload.provider;

    if (status === 'CANCELADO') {
      row[32] = 'EXCLUIDO';
      row[34] = 'CANCELADO';
    }
    if (status === 'CONFIRMADO' && entryStatus !== 'EXCLUIDO') {
      row[32] = 'ATIVO';
    }

    env.entries
      .getRange(index + 2, 1, 1, row.length)
      .setValues([row]);

    var entry = v2RowEntry_(row);
    var currentDate = v2Today_();
    var currentUnitId = context
      ? String(context.unit.unit_id)
      : entry.unitId;

    return {
      ok: true,
      entry: entry,
      summary: v3BuildSummary_(env, currentDate, currentUnitId),
      confirmedEntryDate: entry.date,
      supplementState: v3SupplementState_(
        env,
        currentDate,
        currentUnitId,
        v2FindClosure_(env, currentDate, currentUnitId)
      )
    };
  } finally {
    lock.releaseLock();
  }
}
