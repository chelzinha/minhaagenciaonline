/**
 * CAIXA À VISTA V3 - bootstrap rápido e cliente padrão.
 *
 * Objetivos:
 * - o carregamento inicial é somente leitura e não usa ScriptLock;
 * - não executa v2Environment_()/v2SeedLibrary_() no init, evitando validar
 *   e reconfigurar todas as abas a cada abertura;
 * - cada aba dinâmica é lida no máximo uma vez por bootstrap;
 * - biblioteca estática e clientes usam CacheService com TTL curto;
 * - Cliente de Balcão é o fallback oficial do atendimento quando o front
 *   não envia outro cliente explicitamente.
 *
 * Escritas continuam usando as rotinas V2/V3 existentes, com locks,
 * validações de unidade e idempotência.
 */

var CAIXA_V3_FAST = Object.freeze({
  LIBRARY_CACHE_PREFIX: 'CAIXA_V3_FAST_LIBRARY_V2:',
  CLIENTS_CACHE_KEY: 'CAIXA_V3_FAST_CLIENTS_V2',
  LIBRARY_TTL_SECONDS: 120,
  CLIENTS_TTL_SECONDS: 60,
  DEFAULT_CLIENT_ID: 'cliente-balcao',
  DEFAULT_CLIENT_NAME: 'Cliente de Balcão'
});

function v3FastRequireSheet_(sheetMap, name) {
  var sheet = sheetMap[name];
  if (!sheet) {
    throw appError_(
      'A aba obrigatória "' + name + '" não foi encontrada. Execute a preparação do Caixa antes de publicar.',
      'V3_FAST_SCHEMA_REQUIRED'
    );
  }
  return sheet;
}

function v3FastEnvironment_() {
  var id = PropertiesService
    .getScriptProperties()
    .getProperty(CAIXA_V2_CFG.DB_PROP);

  if (!id) {
    throw appError_(
      'Execute setupCaixaAvistaV2() antes de publicar.',
      'SETUP_REQUIRED'
    );
  }

  var ss = SpreadsheetApp.openById(id);
  var sheetMap = {};

  ss.getSheets().forEach(function(sheet) {
    sheetMap[sheet.getName()] = sheet;
  });

  var names = CAIXA_V2_CFG.SHEETS;

  return {
    ss: ss,
    units: v3FastRequireSheet_(sheetMap, names.UNITS),
    users: v3FastRequireSheet_(sheetMap, names.USERS),
    accounts: v3FastRequireSheet_(sheetMap, names.ACCOUNTS),
    payments: v3FastRequireSheet_(sheetMap, names.PAYMENTS),
    revenues: v3FastRequireSheet_(sheetMap, names.REVENUES),
    expenses: v3FastRequireSheet_(sheetMap, names.EXPENSES),
    clients: v3FastRequireSheet_(sheetMap, names.CLIENTS),
    entries: v3FastRequireSheet_(sheetMap, names.ENTRIES),
    dailyBalances: v3FastRequireSheet_(sheetMap, names.DAILY_BALANCES),
    withdrawals: v3FastRequireSheet_(sheetMap, names.WITHDRAWALS),
    closures: v3FastRequireSheet_(sheetMap, names.CLOSURES),
    caQueue: v3FastRequireSheet_(sheetMap, names.CA_QUEUE),
    supplements: sheetMap[CAIXA_V3_SUPPLEMENT_SHEET] || null
  };
}

function v3FastContext_(user, requestedUnitId, unitRows, userRows) {
  var username = v2UnitAccessUsername_(user);
  var requested = String(requestedUnitId || '').trim();
  var activeUnits = {};

  unitRows.forEach(function(unit) {
    var unitId = String(unit.unit_id || '').trim();
    if (unitId && v2Bool_(unit.active)) {
      activeUnits[unitId] = unit;
    }
  });

  var byUnit = {};

  userRows.forEach(function(mapping) {
    if (!v2Bool_(mapping.active)) return;

    var mappedUsername = String(mapping.username || '')
      .trim()
      .toLowerCase();

    if (!mappedUsername || mappedUsername === '*' || mappedUsername !== username) {
      return;
    }

    var unitId = String(mapping.unit_id || '').trim();
    if (!activeUnits[unitId]) return;

    if (!byUnit[unitId]) {
      byUnit[unitId] = {
        id: unitId,
        name: String(activeUnits[unitId].name || unitId),
        permissions: {
          revenue: false,
          expense: false,
          close: false,
          withdraw: false
        }
      };
    }

    byUnit[unitId].permissions.revenue =
      byUnit[unitId].permissions.revenue || v2Bool_(mapping.can_revenue);
    byUnit[unitId].permissions.expense =
      byUnit[unitId].permissions.expense || v2Bool_(mapping.can_expense);
    byUnit[unitId].permissions.close =
      byUnit[unitId].permissions.close || v2Bool_(mapping.can_close);
    byUnit[unitId].permissions.withdraw =
      byUnit[unitId].permissions.withdraw || v2Bool_(mapping.can_withdraw);
  });

  var accessible = Object.keys(byUnit)
    .map(function(unitId) { return byUnit[unitId]; })
    .sort(function(a, b) { return a.name.localeCompare(b.name); });

  if (!accessible.length) {
    throw appError_('Usuário sem unidade autorizada.', 'UNIT_MAPPING_REQUIRED');
  }

  var selected = null;

  if (requested) {
    selected = byUnit[requested] || null;
    if (!selected) {
      throw appError_('Usuário sem acesso à unidade solicitada.', 'UNIT_NOT_ALLOWED');
    }
  } else if (accessible.length === 1) {
    selected = accessible[0];
  } else {
    throw appError_('Escolha a unidade antes de continuar.', 'UNIT_SELECTION_REQUIRED');
  }

  var unit = activeUnits[selected.id];

  return {
    user: user,
    unit: unit,
    permissions: {
      revenue: Boolean(selected.permissions.revenue),
      expense: Boolean(selected.permissions.expense),
      close: Boolean(selected.permissions.close),
      withdraw: Boolean(selected.permissions.withdraw)
    },
    accessibleUnits: accessible
  };
}

function v3FastLibraryCacheKey_(unitId) {
  return CAIXA_V3_FAST.LIBRARY_CACHE_PREFIX + String(unitId || '');
}

function v3FastReadCachedJson_(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function v3FastPutCachedJson_(key, value, ttl) {
  try {
    CacheService.getScriptCache().put(
      key,
      JSON.stringify(value),
      ttl
    );
  } catch (_) {}
}

function v3FastLibrary_(env, context) {
  var unitId = String(context.unit.unit_id || '');
  var cacheKey = v3FastLibraryCacheKey_(unitId);
  var cached = v3FastReadCachedJson_(cacheKey);
  var structural;

  if (cached) {
    structural = cached;
  } else {
    var accounts = v2ActiveForUnit_(
      v2ReadObjects_(env.accounts, CAIXA_V2_CFG.HEADERS.ACCOUNTS),
      unitId
    );
    var payments = v2ActiveForUnit_(
      v2ReadObjects_(env.payments, CAIXA_V2_CFG.HEADERS.PAYMENTS),
      unitId
    );
    var revenues = v2ActiveForUnit_(
      v2ReadObjects_(env.revenues, CAIXA_V2_CFG.HEADERS.REVENUES),
      unitId
    );
    var expenses = v2ActiveForUnit_(
      v2ReadObjects_(env.expenses, CAIXA_V2_CFG.HEADERS.EXPENSES),
      unitId
    );

    structural = {
      unit: {
        id: unitId,
        name: String(context.unit.name || unitId),
        costCenterName: String(context.unit.cost_center_name || ''),
        costCenterContaAzulId: String(context.unit.cost_center_ca_id || '')
      },
      accounts: accounts.map(function(x) {
        return {
          id: String(x.account_id),
          name: String(x.name_front),
          contaAzulName: String(x.name_conta_azul || ''),
          contaAzulId: String(x.conta_azul_id || '')
        };
      }),
      payments: payments.map(function(x) {
        return {
          id: String(x.payment_id),
          name: String(x.name_front),
          contaAzulMethod: String(x.conta_azul_method || ''),
          accountId: String(x.account_id || ''),
          allowRevenue: v2Bool_(x.allow_revenue),
          allowExpense: v2Bool_(x.allow_expense),
          allowBatch: v2Bool_(x.allow_batch),
          generatePix: v2Bool_(x.generate_pix),
          pixMode: String(x.pix_mode || ''),
          pixKey: String(x.pix_key || ''),
          pixReceiverName: String(x.pix_receiver_name || ''),
          pixCity: String(x.pix_city || ''),
          pixActive: v2Bool_(x.pix_active),
          pixShareMessage: String(x.pix_share_message || ''),
          icon: String(x.icon || 'payments'),
          color: String(x.color || '#1677ff')
        };
      }),
      revenueTypes: revenues.map(function(x) {
        return {
          id: String(x.revenue_type_id),
          name: String(x.name_front),
          descriptionDefault: String(x.description_default || ''),
          categoryName: String(x.category_name || ''),
          categoryContaAzulId: String(x.category_ca_id || ''),
          allowAttendance: v2Bool_(x.allow_attendance),
          allowSingle: v2Bool_(x.allow_single),
          allowBatch: v2Bool_(x.allow_batch),
          requireClient: v2Bool_(x.require_client),
          requireDescription: v2Bool_(x.require_description),
          icon: String(x.icon || 'point_of_sale'),
          color: String(x.color || '#1677ff')
        };
      }),
      expenseTypes: expenses.map(function(x) {
        return {
          id: String(x.expense_type_id),
          name: String(x.name_front),
          descriptionDefault: String(x.description_default || ''),
          categoryName: String(x.category_name || ''),
          categoryContaAzulId: String(x.category_ca_id || ''),
          defaultPaymentId: String(x.default_payment_id || ''),
          defaultAccountId: String(x.default_account_id || ''),
          allowBatch: v2Bool_(x.allow_batch),
          requireDescription: v2Bool_(x.require_description),
          icon: String(x.icon || 'remove_circle'),
          color: String(x.color || '#ef4444')
        };
      })
    };

    v3FastPutCachedJson_(
      cacheKey,
      structural,
      CAIXA_V3_FAST.LIBRARY_TTL_SECONDS
    );
  }

  return {
    unit: structural.unit,
    permissions: context.permissions,
    accounts: structural.accounts || [],
    payments: structural.payments || [],
    revenueTypes: structural.revenueTypes || [],
    expenseTypes: structural.expenseTypes || []
  };
}

function v3FastClients_(env) {
  var cached = v3FastReadCachedJson_(CAIXA_V3_FAST.CLIENTS_CACHE_KEY);
  if (cached && Array.isArray(cached)) return cached;

  var clients = v2ReadObjects_(
    env.clients,
    CAIXA_V2_CFG.HEADERS.CLIENTS
  )
    .filter(function(item) { return v2Bool_(item.active); })
    .map(function(item) {
      return {
        id: String(item.client_id),
        name: String(item.name)
      };
    });

  v3FastPutCachedJson_(
    CAIXA_V3_FAST.CLIENTS_CACHE_KEY,
    clients,
    CAIXA_V3_FAST.CLIENTS_TTL_SECONDS
  );

  return clients;
}

function v3FastClearClientsCache_() {
  try {
    CacheService.getScriptCache().remove(CAIXA_V3_FAST.CLIENTS_CACHE_KEY);
  } catch (_) {}
}

function v3FastOpeningBalance_(balanceRows, date, unitId) {
  var wantedDate = v2SheetDateIso_(date);
  var wantedUnit = String(unitId || '').trim();

  var current = balanceRows.filter(function(item) {
    return (
      String(item.unit_id || '').trim() === wantedUnit &&
      v2SheetDateIso_(item.date_iso) === wantedDate
    );
  })[0];

  if (current) {
    return Number(current.opening_cash_cents || 0);
  }

  var previous = balanceRows
    .filter(function(item) {
      return (
        String(item.unit_id || '').trim() === wantedUnit &&
        v2SheetDateIso_(item.date_iso) < wantedDate &&
        String(item.status || '') === 'FECHADO'
      );
    })
    .sort(function(a, b) {
      return v2SheetDateIso_(b.date_iso)
        .localeCompare(v2SheetDateIso_(a.date_iso));
    })[0];

  return previous ? Number(previous.carryover_cents || 0) : 0;
}

function v3FastWithdrawal_(item) {
  return {
    id: String(item.withdrawal_id),
    date: v2SheetDateIso_(item.date_iso),
    createdAt: v2Iso_(item.created_at),
    unitId: String(item.unit_id),
    operatorId: String(item.operator_id),
    operatorName: String(item.operator_name),
    amountCents: Number(item.amount_cents || 0),
    destination: String(item.destination || ''),
    notes: String(item.notes || ''),
    balanceBeforeCents: Number(item.balance_before_cents || 0),
    balanceAfterCents: Number(item.balance_after_cents || 0),
    confirmed: v2Bool_(item.confirmed),
    pdfStatus: String(item.pdf_status || ''),
    pdfUrl: String(item.pdf_url || '')
  };
}

function v3FastSummary_(entries, withdrawals, openingCashCents, date, unitId) {
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
    openingCashCents: Number(openingCashCents || 0),
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

  summary.expectedCashCents =
    summary.openingCashCents +
    summary.cashRevenueCents -
    summary.cashExpenseCents -
    summary.withdrawalsCents;

  summary.netCents = summary.revenueCents - summary.expenseCents;
  return summary;
}

function v3FastClosure_(item) {
  if (!item) return null;

  return {
    id: String(item.closure_id),
    date: v2SheetDateIso_(item.date_iso),
    unitId: String(item.unit_id),
    unitName: String(item.unit_name),
    status: String(item.status),
    createdAt: v2Iso_(item.created_at),
    createdBy: String(item.created_by),
    createdByName: String(item.created_by_name),
    revenueCents: Number(item.revenue_cents || 0),
    expenseCents: Number(item.expense_cents || 0),
    netCents: Number(item.net_cents || 0),
    openingCashCents: Number(item.opening_cash_cents || 0),
    cashRevenueCents: Number(item.cash_revenue_cents || 0),
    cashExpenseCents: Number(item.cash_expense_cents || 0),
    withdrawalsBeforeCloseCents: Number(item.withdrawals_before_close_cents || 0),
    expectedCashCents: Number(item.expected_cash_cents || 0),
    countedCashCents: Number(item.counted_cash_cents || 0),
    differenceCents: Number(item.difference_cents || 0),
    closingWithdrawalCents: Number(item.closing_withdrawal_cents || 0),
    carryoverCents: Number(item.carryover_cents || 0),
    notes: String(item.notes || ''),
    declarationConfirmed: v2Bool_(item.declaration_confirmed),
    pdfStatus: String(item.pdf_status || ''),
    pdfUrl: String(item.pdf_url || ''),
    contaAzulStatus: String(item.conta_azul_status || '')
  };
}

function v3FastQueueStatus_(queueRows, closureId) {
  var relevant = queueRows.filter(function(item) {
    return String(item.closure_id || '') === String(closureId || '');
  });

  if (!relevant.length) return 'SEM_FILA';
  if (relevant.every(function(item) {
    return String(item.status || '') === 'SINCRONIZADO';
  })) return 'SINCRONIZADO';

  if (relevant.some(function(item) {
    return ['ERRO', 'CONFIGURACAO_PENDENTE']
      .indexOf(String(item.status || '')) >= 0;
  })) return 'COM_ERRO';

  return 'PENDENTE';
}

function v3FastSupplementHistory_(supplementRows, queueRows, date, unitId) {
  return supplementRows
    .filter(function(item) {
      return (
        v2SheetDateIso_(item.date_iso) === v2SheetDateIso_(date) &&
        String(item.unit_id || '') === String(unitId || '')
      );
    })
    .map(function(item) {
      return {
        id: String(item.supplement_id || ''),
        date: v2SheetDateIso_(item.date_iso),
        unitId: String(item.unit_id || ''),
        baseClosureId: String(item.base_closure_id || ''),
        sequence: Number(item.sequence || 0),
        createdAt: v2Iso_(item.created_at),
        createdByName: String(item.created_by_name || ''),
        revenueCents: Number(item.revenue_cents || 0),
        expenseCents: Number(item.expense_cents || 0),
        netCents: Number(item.net_cents || 0),
        expectedCashCents: Number(item.expected_cash_cents || 0),
        carryoverCents: Number(item.carryover_cents || 0),
        notes: String(item.notes || ''),
        contaAzulStatus: v3FastQueueStatus_(
          queueRows,
          item.supplement_id
        )
      };
    })
    .sort(function(a, b) { return a.sequence - b.sequence; });
}

function v3FastInit_(dateValue, user) {
  var startedAt = Date.now();
  var env = v3FastEnvironment_();

  var unitRows = v2ReadObjects_(
    env.units,
    CAIXA_V2_CFG.HEADERS.UNITS
  );
  var userRows = v2ReadObjects_(
    env.users,
    CAIXA_V2_CFG.HEADERS.USERS
  );

  var context = v3FastContext_(
    user,
    user && user.requestedUnitId,
    unitRows,
    userRows
  );

  var date = v2Today_();
  var unitId = String(context.unit.unit_id || '');
  var library = v3FastLibrary_(env, context);
  var clients = v3FastClients_(env);

  var rawEntries = v2ReadObjects_(
    env.entries,
    CAIXA_V2_CFG.HEADERS.ENTRIES
  );
  var allEntries = rawEntries
    .map(function(item) { return v2RowEntry_(item._row); })
    .filter(function(entry) {
      return (
        String(entry.unitId || '') === unitId &&
        String(entry.status || '').toUpperCase() !== 'EXCLUIDO'
      );
    });

  var todayEntries = allEntries.filter(function(entry) {
    return v2SheetDateIso_(entry.date) === date;
  });

  var backlog = allEntries.filter(function(entry) {
    var entryDate = v2SheetDateIso_(entry.date);
    var pixStatus = String(entry.pixStatus || '').toUpperCase();
    return (
      entryDate < date &&
      entry.paymentContaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO' &&
      ['CRIANDO', 'ATIVA', 'PENDENTE'].indexOf(pixStatus) >= 0
    );
  });

  var withdrawalRows = v2ReadObjects_(
    env.withdrawals,
    CAIXA_V2_CFG.HEADERS.WITHDRAWALS
  );
  var withdrawals = withdrawalRows
    .filter(function(item) {
      return (
        v2SheetDateIso_(item.date_iso) === date &&
        String(item.unit_id || '') === unitId
      );
    })
    .map(v3FastWithdrawal_);

  var balanceRows = v2ReadObjects_(
    env.dailyBalances,
    CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
  );
  var openingCash = v3FastOpeningBalance_(
    balanceRows,
    date,
    unitId
  );

  var summary = v3FastSummary_(
    todayEntries,
    withdrawals,
    openingCash,
    date,
    unitId
  );

  var closureRows = v2ReadObjects_(
    env.closures,
    CAIXA_V2_CFG.HEADERS.CLOSURES
  );
  var baseClosureRow = closureRows.filter(function(item) {
    return (
      v2SheetDateIso_(item.date_iso) === date &&
      String(item.unit_id || '') === unitId
    );
  })[0] || null;
  var baseClosure = v3FastClosure_(baseClosureRow);

  var supplementRows = env.supplements
    ? v2ReadObjects_(env.supplements, CAIXA_V3_SUPPLEMENT_HEADERS)
    : [];

  var relevantSupplementRows = supplementRows.filter(function(item) {
    return (
      v2SheetDateIso_(item.date_iso) === date &&
      String(item.unit_id || '') === unitId
    );
  });

  var queueRows = relevantSupplementRows.length
    ? v2ReadObjects_(env.caQueue, CAIXA_V2_CFG.HEADERS.CA_QUEUE)
    : [];

  var history = v3FastSupplementHistory_(
    relevantSupplementRows,
    queueRows,
    date,
    unitId
  );

  var unclosedEntries = todayEntries.filter(function(entry) {
    return !String(entry.closureId || '').trim();
  });
  var delta = v3DeltaSummary_(unclosedEntries);

  var supplementState = baseClosure
    ? {
        hasBaseClosure: true,
        pendingCount: unclosedEntries.length,
        pendingRevenueCents: delta.revenueCents,
        pendingExpenseCents: delta.expenseCents,
        pendingNetCents: delta.netCents,
        supplementCount: history.length,
        history: history
      }
    : {
        hasBaseClosure: false,
        pendingCount: 0,
        pendingRevenueCents: 0,
        pendingExpenseCents: 0,
        pendingNetCents: 0,
        supplementCount: 0
      };

  return {
    ok: true,
    version: 'V3-FAST',
    serverDate: date,
    timezone: CAIXA_V2_CFG.TIMEZONE,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    },
    library: library,
    clients: clients,
    entries: todayEntries.concat(backlog),
    withdrawals: withdrawals,
    summary: summary,
    closure: v3DecorateClosure_(baseClosure, summary),
    supplementState: supplementState,
    pendingPixBacklogCount: backlog.length,
    bootstrapMs: Date.now() - startedAt
  };
}

function v3DefaultClientPayload_(payload) {
  var copy = {};
  Object.keys(payload || {}).forEach(function(key) {
    copy[key] = payload[key];
  });

  var type = String(copy.type || '').toUpperCase();
  var mode = String(copy.mode || '').toUpperCase();
  var clientName = String(copy.clientName || '').trim();

  if (
    type === 'RECEITA' &&
    mode === 'ATENDIMENTO' &&
    !clientName
  ) {
    copy.clientId = CAIXA_V3_FAST.DEFAULT_CLIENT_ID;
    copy.clientName = CAIXA_V3_FAST.DEFAULT_CLIENT_NAME;
  }

  return copy;
}

function v3SaveEntryDefaultClient_(payload, user) {
  return v3SaveEntry_(v3DefaultClientPayload_(payload || {}), user);
}

function v3SaveClientFast_(nameValue, user) {
  var result = v2SaveClient_(nameValue, user);
  v3FastClearClientsCache_();
  return result;
}

function v3InvalidateFastCaches_() {
  var cache = CacheService.getScriptCache();
  try { cache.remove(CAIXA_V3_FAST.CLIENTS_CACHE_KEY); } catch (_) {}

  ['AGF', 'SHOPPING_METRO', 'PADRAO'].forEach(function(unitId) {
    try { cache.remove(v3FastLibraryCacheKey_(unitId)); } catch (_) {}
  });

  return { ok: true };
}

/**
 * Auditoria sem gravação para confirmar que o bootstrap rápido conserva os
 * contratos essenciais do init. Útil antes de promover a V3.
 */
function auditarBootstrapRapidoV3() {
  var env = v3FastEnvironment_();
  var required = [
    env.units,
    env.users,
    env.accounts,
    env.payments,
    env.revenues,
    env.expenses,
    env.clients,
    env.entries,
    env.dailyBalances,
    env.withdrawals,
    env.closures,
    env.caQueue
  ];

  return {
    ok: required.every(Boolean),
    service: 'caixa-v3-fast-bootstrap',
    spreadsheetId: env.ss.getId(),
    sheetsChecked: required.length,
    cache: {
      librarySeconds: CAIXA_V3_FAST.LIBRARY_TTL_SECONDS,
      clientsSeconds: CAIXA_V3_FAST.CLIENTS_TTL_SECONDS
    }
  };
}
