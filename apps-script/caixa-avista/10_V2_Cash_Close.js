function v2BuildSummary_(env,date,unitId) {
  var entries = v2EntriesByDate_(env,date,unitId);
  var withdrawals = v2WithdrawalsByDate_(env,date,unitId);
  var s = { date:date,unitId:unitId,revenueCents:0,expenseCents:0,netCents:0,revenueCount:0,expenseCount:0,byPayment:{},countByPayment:{},cashRevenueCents:0,cashExpenseCents:0,pixPendingCents:0,pixConfirmedCents:0,withdrawalsCents:0,openingCashCents:0,expectedCashCents:0 };
  entries.forEach(function(e){
    if (e.type==='DESPESA') { s.expenseCents+=e.amountCents; s.expenseCount++; if (e.paymentId==='DINHEIRO') s.cashExpenseCents+=e.amountCents; }
    else {
      if (e.paymentContaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO' && e.pixStatus !== 'CONFIRMADO') { s.pixPendingCents+=e.amountCents; return; }
      s.revenueCents+=e.amountCents; s.revenueCount++; s.byPayment[e.paymentId]=(s.byPayment[e.paymentId]||0)+e.amountCents; s.countByPayment[e.paymentId]=(s.countByPayment[e.paymentId]||0)+1;
      if (e.paymentId==='DINHEIRO') s.cashRevenueCents+=e.amountCents;
      if (e.paymentContaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO') s.pixConfirmedCents += e.amountCents;
    }
  });
  withdrawals.forEach(function(w){ s.withdrawalsCents += w.amountCents; });
  var openingInfo = v2OpeningInfo_(env,date,unitId);
  s.openingCashCents = openingInfo.cents;
  s.openingSource = openingInfo.source;
  s.openingReferenceDate = openingInfo.referenceDate;
  s.expectedCashCents = s.openingCashCents + s.cashRevenueCents - s.cashExpenseCents - s.withdrawalsCents;
  s.netCents = s.revenueCents - s.expenseCents;
  return s;
}

/*
 * SALDO INICIAL (correção 2026-09-23)
 *
 * Regra anterior: usava somente o carryover do último dia FECHADO. Dias sem
 * fechamento eram ignorados, então o dinheiro físico desses dias sumia do
 * saldo inicial seguinte (ex.: Metrô abrindo com o mesmo valor por semanas).
 *
 * Regra atual:
 *   saldo inicial = carryover do último dia FECHADO
 *                 + dinheiro dos dias intermediários sem fechamento
 *                   (receitas DINHEIRO - despesas DINHEIRO - sangrias)
 * Se o dia já possui linha em Saldos_Diarios, ela continua sendo a autoridade
 * (inclusive ajuste MANUAL). A linha do dia é criada uma vez e não muda depois.
 */
function v2ComputeOpening_(balanceRows, entryRows, withdrawalRows, date, unitId) {
  var wantedDate = v2SheetDateIso_(date);
  var wantedUnit = String(unitId || '').trim();

  var current = (balanceRows || []).filter(function(item) {
    return (
      String(item.unit_id || '').trim() === wantedUnit &&
      v2SheetDateIso_(item.date_iso) === wantedDate
    );
  })[0];

  if (current) {
    return {
      cents: Number(current.opening_cash_cents || 0),
      source: String(current.opening_source || 'REGISTRADO'),
      referenceDate: wantedDate,
      gapDays: 0,
      persisted: true
    };
  }

  var previous = (balanceRows || [])
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

  var baseDate = previous ? v2SheetDateIso_(previous.date_iso) : '';
  var cents = previous ? Number(previous.carryover_cents || 0) : 0;
  var gap = {};

  function inGap(dateIso) {
    return dateIso < wantedDate && (!baseDate || dateIso > baseDate);
  }

  (entryRows || []).forEach(function(item) {
    var dateIso = v2SheetDateIso_(item.date_iso);
    if (
      String(item.unit_id || '').trim() !== wantedUnit ||
      !inGap(dateIso) ||
      String(item.status || '').toUpperCase() === 'EXCLUIDO' ||
      String(item.payment_id || '') !== 'DINHEIRO'
    ) {
      return;
    }

    var amount = Number(item.amount_cents || 0);
    cents += String(item.type || '').toUpperCase() === 'DESPESA'
      ? -amount
      : amount;
    gap[dateIso] = true;
  });

  (withdrawalRows || []).forEach(function(item) {
    var dateIso = v2SheetDateIso_(item.date_iso);
    if (
      String(item.unit_id || '').trim() !== wantedUnit ||
      !inGap(dateIso)
    ) {
      return;
    }

    cents -= Number(item.amount_cents || 0);
    gap[dateIso] = true;
  });

  var gapDays = Object.keys(gap).length;

  return {
    cents: cents,
    source: gapDays
      ? 'SALDO_ANTERIOR_SEM_FECHAMENTO'
      : (previous ? 'SALDO_ANTERIOR' : 'INICIAL_ZERO'),
    referenceDate: baseDate,
    gapDays: gapDays,
    persisted: false
  };
}

function v2OpeningInfo_(env, date, unitId) {
  var wantedDate = v2SheetDateIso_(date);
  var wantedUnit = String(unitId || '').trim();

  var rows = v2ReadObjects_(
    env.dailyBalances,
    CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
  );

  var hasCurrent = rows.some(function(item) {
    return (
      String(item.unit_id || '').trim() === wantedUnit &&
      v2SheetDateIso_(item.date_iso) === wantedDate
    );
  });

  var info = hasCurrent
    ? v2ComputeOpening_(rows, [], [], wantedDate, wantedUnit)
    : v2ComputeOpening_(
        rows,
        v2ReadObjects_(env.entries, CAIXA_V2_CFG.HEADERS.ENTRIES),
        v2ReadObjects_(env.withdrawals, CAIXA_V2_CFG.HEADERS.WITHDRAWALS),
        wantedDate,
        wantedUnit
      );

  if (!info.persisted) {
    env.dailyBalances.appendRow([
      wantedUnit,
      wantedDate,
      info.cents,
      info.source,
      new Date(),
      'sistema',
      '',
      '',
      '',
      '',
      '',
      'ABERTO'
    ]);
    info.persisted = true;
  }

  return info;
}

function v2OpeningBalance_(env,date,unitId) {
  return v2OpeningInfo_(env, date, unitId).cents;
}

function v2SetOpeningBalance_(dateValue, amountValue, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env, user);
    var date = v2Today_();
    var unitId = String(context.unit.unit_id || '').trim();
    var amount = Math.round(Number(amountValue || 0));

    if (!(amount >= 0) || amount > 99999999) {
      throw appError_('Saldo inicial inválido.', 'INVALID_OPENING');
    }

    var role = String(user && user.role || '').toLowerCase();

    if (
      !context.permissions.close ||
      ['admin', 'manager'].indexOf(role) < 0
    ) {
      throw appError_(
        'Somente gestor com permissão de fechamento pode ajustar o saldo inicial.',
        'FORBIDDEN'
      );
    }

    v2AssertOpen_(env, date, unitId);

    var rows = v2ReadObjects_(
      env.dailyBalances,
      CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
    );

    var found = rows.filter(function(item) {
      return (
        String(item.unit_id || '').trim() === unitId &&
        v2SheetDateIso_(item.date_iso) === date
      );
    })[0];

    if (found) {
      env.dailyBalances
        .getRange(found._sheetRow, 3, 1, 4)
        .setValues([[amount, 'MANUAL', new Date(), user.id]]);
    } else {
      env.dailyBalances.appendRow([
        unitId,date,amount,'MANUAL',new Date(),user.id,
        '','','','','','ABERTO'
      ]);
    }

    return {
      ok:true,
      summary:
        typeof v3BuildSummary_ === 'function'
          ? v3BuildSummary_(env,date,unitId)
          : v2BuildSummary_(env,date,unitId)
    };
  } finally {
    lock.releaseLock();
  }
}

function v2RecordWithdrawal_(env, context, user, data) {
  var id = data.id || Utilities.getUuid();
  var created = data.createdAt || new Date();
  var before = Math.round(Number(data.balanceBeforeCents || 0));
  var amount = Math.round(Number(data.amountCents || 0));
  var after = before - amount;
  env.withdrawals.appendRow([
    id, data.date, created, String(context.unit.unit_id), user.id, user.name, amount,
    String(data.destination || 'Financeiro'), String(data.notes || ''), before, after,
    CAIXA_V2_CFG.WITHDRAWAL_DECLARATION_VERSION, CAIXA_V2_CFG.WITHDRAWAL_DECLARATION,
    true, created, String(data.closureId || ''), 'PENDENTE', '', ''
  ]);
  var pdf = v2GenerateWithdrawalPdf_(env, id, context);
  v2UpdateWithdrawalPdf_(env, id, pdf);
  return {
    id:id,
    date:v2SheetDateIso_(data.date),
    createdAt:v2Iso_(created),
    unitId:String(context.unit.unit_id),
    operatorId:String(user.id || ''),
    operatorName:String(user.name || ''),
    amountCents:amount,
    destination:String(data.destination || 'Financeiro'),
    notes:String(data.notes || ''),
    balanceBeforeCents:before,
    balanceAfterCents:after,
    closureId:String(data.closureId || ''),
    confirmed:true,
    pdfStatus:pdf.status,
    pdfUrl:pdf.url || ''
  };
}

function v2CreateWithdrawal_(payload,user) {
  if (!payload || !v2Bool_(payload.confirmed)) {
    throw appError_(
      'Confirme a conferência da sangria.',
      'DECLARATION_REQUIRED'
    );
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env,user);

    var date = v2Today_();
    var unitId = String(context.unit.unit_id);
    var amount = Math.round(Number(payload.amountCents || 0));
    var withdrawalId = String(payload.withdrawalId || '').trim();

    if (!withdrawalId || withdrawalId.length > 100) {
      throw appError_(
        'Identificador seguro da sangria ausente.',
        'WITHDRAWAL_ID_REQUIRED'
      );
    }

    if (!(amount > 0)) {
      throw appError_('Valor da sangria inválido.','INVALID_AMOUNT');
    }

    var existing = v2ReadObjects_(
      env.withdrawals,
      CAIXA_V2_CFG.HEADERS.WITHDRAWALS
    ).filter(function(item){
      return String(item.withdrawal_id || '') === withdrawalId;
    })[0];

    if (existing) {
      if (
        String(existing.unit_id || '') !== unitId ||
        v2SheetDateIso_(existing.date_iso) !== date ||
        Number(existing.amount_cents || 0) !== amount
      ) {
        throw appError_(
          'O identificador desta sangria já foi usado com dados diferentes.',
          'IDEMPOTENCY_CONFLICT'
        );
      }

      return {
        ok:true,
        idempotent:true,
        withdrawal:{
          id:String(existing.withdrawal_id),
          date:v2SheetDateIso_(existing.date_iso),
          createdAt:v2Iso_(existing.created_at),
          unitId:String(existing.unit_id || ''),
          operatorId:String(existing.operator_id || ''),
          operatorName:String(existing.operator_name || ''),
          amountCents:Number(existing.amount_cents || 0),
          balanceBeforeCents:Number(existing.balance_before_cents || 0),
          balanceAfterCents:Number(existing.balance_after_cents || 0),
          destination:String(existing.destination || 'Financeiro'),
          notes:String(existing.notes || ''),
          closureId:String(existing.closure_id || ''),
          confirmed:v2Bool_(existing.confirmed),
          pdfStatus:String(existing.pdf_status || ''),
          pdfUrl:String(existing.pdf_url || '')
        },
        summary:v2BuildSummary_(env,date,unitId),
        supplementState:
          typeof v3SupplementState_ === 'function'
            ? v3SupplementState_(
                env,
                date,
                unitId,
                v2FindClosure_(env,date,unitId)
              )
            : null
      };
    }

    var summary = v2BuildSummary_(env,date,unitId);

    if (amount > summary.expectedCashCents) {
      throw appError_(
        'A sangria não pode ser maior que o saldo esperado em dinheiro.',
        'WITHDRAWAL_EXCEEDS_CASH'
      );
    }

    var withdrawal = v2RecordWithdrawal_(env, context, user, {
      id:withdrawalId,
      date:date,
      amountCents:amount,
      balanceBeforeCents:summary.expectedCashCents,
      destination:'Financeiro',
      notes:'',
      closureId:''
    });

    return {
      ok:true,
      withdrawal:withdrawal,
      summary:v2BuildSummary_(env,date,unitId),
      supplementState:
        typeof v3SupplementState_ === 'function'
          ? v3SupplementState_(
              env,
              date,
              unitId,
              v2FindClosure_(env,date,unitId)
            )
          : null
    };
  } finally {
    lock.releaseLock();
  }
}

function v2Close_(payload,user) {
  if (!payload || !v2Bool_(payload.declarationConfirmed)) {
    throw appError_(
      'Confirme a declaração de conferência.',
      'DECLARATION_REQUIRED'
    );
  }

  var result;
  var closureId = '';
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env,user);

    if (!context.permissions.close) {
      throw appError_('Usuário sem permissão para fechar o caixa.','FORBIDDEN');
    }

    var date = v2Today_();
    var unitId = String(context.unit.unit_id);
    var existing = v2FindClosure_(env,date,unitId);

    if (existing) {
      return {
        ok:true,
        closure:existing,
        alreadyClosed:true,
        summary:v2BuildSummary_(env,date,unitId)
      };
    }

    var summary = v2BuildSummary_(env,date,unitId);

    if (
      (summary.revenueCount + summary.expenseCount) === 0 &&
      Number(summary.withdrawalsCents || 0) === 0
    ) {
      throw appError_('Não há movimentos para fechar.','NO_ENTRIES');
    }

    if (summary.pixPendingCents > 0) {
      throw appError_('Há Pix aguardando confirmação.','PIX_PENDING');
    }

    var counted = Math.round(Number(payload.countedCashCents || 0));

    if (counted < 0) {
      throw appError_('Contagem inválida.','INVALID_COUNT');
    }

    var difference = counted - summary.expectedCashCents;
    var notes = String(payload.notes || '').trim();

    if (difference !== 0 && !notes) {
      throw appError_(
        'Informe a justificativa da diferença.',
        'DIFFERENCE_NOTE_REQUIRED'
      );
    }

    var closingWithdrawal = Math.round(
      Number(payload.closingWithdrawalCents || 0)
    );

    if (closingWithdrawal < 0 || closingWithdrawal > counted) {
      throw appError_(
        'Sangria do fechamento inválida.',
        'INVALID_CLOSING_WITHDRAWAL'
      );
    }

    closureId = Utilities.getUuid();
    var now = new Date();
    var carryover = counted - closingWithdrawal;

    if (closingWithdrawal > 0) {
      v2RecordWithdrawal_(env, context, user, {
        date:date,
        amountCents:closingWithdrawal,
        balanceBeforeCents:counted,
        destination:payload.withdrawalDestination || 'Financeiro',
        notes:payload.withdrawalNotes || 'Sangria realizada no fechamento',
        closureId:closureId
      });
    }

    var paymentTotals = summary.byPayment;
    var paymentCounts = summary.countByPayment;

    env.closures.appendRow([
      closureId,date,unitId,String(context.unit.name || unitId),
      String(context.unit.cost_center_ca_id || ''),
      String(context.unit.cost_center_name || ''),
      now,user.id,user.name,'FECHADO',
      summary.revenueCents,summary.expenseCents,summary.netCents,
      JSON.stringify(paymentTotals),JSON.stringify(paymentCounts),
      summary.openingCashCents,summary.cashRevenueCents,
      summary.cashExpenseCents,summary.withdrawalsCents,
      summary.expectedCashCents,counted,difference,
      closingWithdrawal,carryover,notes,
      CAIXA_V2_CFG.CASH_DECLARATION_VERSION,
      CAIXA_V2_CFG.CASH_DECLARATION,
      true,now,'PENDENTE','','','PENDENTE'
    ]);

    v2MarkEntriesClosed_(env,date,unitId,closureId);

    if (typeof v3MarkWithdrawalsWithClosure_ === 'function') {
      var withdrawalIdsToClose =
        v2WithdrawalsByDate_(env,date,unitId)
          .filter(function(withdrawal) {
            return !String(withdrawal.closureId || '').trim();
          })
          .map(function(withdrawal) {
            return withdrawal.id;
          });

      v3MarkWithdrawalsWithClosure_(
        env,
        withdrawalIdsToClose,
        closureId
      );
    }

    v2UpdateDailyBalanceClose_(
      env,date,unitId,summary,counted,difference,
      closingWithdrawal,carryover,user
    );

    v2EnqueueContaAzul_(
      env,
      closureId,
      v2EntriesByDate_(env,date,unitId)
    );

    var pdf = v2GenerateClosingPdf_(env,closureId,context);
    v2UpdateClosurePdf_(env,closureId,pdf);

    result = {
      ok:true,
      closure:v2FindClosure_(env,date,unitId),
      summary:v2BuildSummary_(env,date,unitId)
    };
  } finally {
    lock.releaseLock();
  }

  try {
    result.contaAzulDispatch = processContaAzulQueueV2(20, closureId);
  } catch (error) {
    result.contaAzulDispatch = {
      ok:false,
      error:String(error && error.message ? error.message : error)
    };
  }

  try {
    var refreshedEnv = v2Environment_();
    result.closure = v2FindClosure_(
      refreshedEnv,
      result.closure.date,
      result.closure.unitId
    );
  } catch (_) {}

  return result;
}

function v2FindClosure_(env,date,unitId) {
  var wantedDate = v2SheetDateIso_(date);
  var wantedUnit = String(
    unitId || ''
  ).trim();

  var closure = v2ReadObjects_(
    env.closures,
    CAIXA_V2_CFG.HEADERS.CLOSURES
  ).filter(function(item) {
    return (
      v2SheetDateIso_(item.date_iso) ===
        wantedDate &&
      String(item.unit_id || '').trim() ===
        wantedUnit
    );
  })[0];

  if (!closure) {
    return null;
  }

  return {
    id: String(closure.closure_id),
    date: v2SheetDateIso_(
      closure.date_iso
    ),
    unitId: String(closure.unit_id),
    unitName: String(closure.unit_name),
    status: String(closure.status),
    createdAt: v2Iso_(
      closure.created_at
    ),
    createdBy: String(
      closure.created_by
    ),
    createdByName: String(
      closure.created_by_name
    ),
    revenueCents: Number(
      closure.revenue_cents || 0
    ),
    expenseCents: Number(
      closure.expense_cents || 0
    ),
    netCents: Number(
      closure.net_cents || 0
    ),
    openingCashCents: Number(
      closure.opening_cash_cents || 0
    ),
    cashRevenueCents: Number(
      closure.cash_revenue_cents || 0
    ),
    cashExpenseCents: Number(
      closure.cash_expense_cents || 0
    ),
    withdrawalsBeforeCloseCents: Number(
      closure.withdrawals_before_close_cents ||
        0
    ),
    expectedCashCents: Number(
      closure.expected_cash_cents || 0
    ),
    countedCashCents: Number(
      closure.counted_cash_cents || 0
    ),
    differenceCents: Number(
      closure.difference_cents || 0
    ),
    closingWithdrawalCents: Number(
      closure.closing_withdrawal_cents || 0
    ),
    carryoverCents: Number(
      closure.carryover_cents || 0
    ),
    notes: String(
      closure.notes || ''
    ),
    declarationConfirmed:
      v2Bool_(
        closure.declaration_confirmed
      ),
    pdfStatus: String(
      closure.pdf_status || ''
    ),
    pdfUrl: String(
      closure.pdf_url || ''
    ),
    contaAzulStatus: String(
      closure.conta_azul_status || ''
    )
  };
}

function v2MarkEntriesClosed_(
  env,
  date,
  unitId,
  closureId
) {
  var last = env.entries.getLastRow();

  if (last < 2) {
    return;
  }

  var wantedDate = v2SheetDateIso_(date);

  var wantedUnit = String(
    unitId || ''
  ).trim();

  var values = env.entries
    .getRange(
      2,
      1,
      last - 1,
      CAIXA_V2_CFG.HEADERS.ENTRIES.length
    )
    .getValues();

  values.forEach(function(row) {
    if (
      v2SheetDateIso_(row[3]) ===
        wantedDate &&
      String(row[7] || '').trim() ===
        wantedUnit &&
      String(row[32] || '') !==
        'EXCLUIDO'
    ) {
      row[33] = closureId;
    }
  });

  env.entries
    .getRange(
      2,
      1,
      values.length,
      values[0].length
    )
    .setValues(values);
}

function v2UpdateDailyBalanceClose_(
  env,
  date,
  unitId,
  summary,
  counted,
  difference,
  closingWithdrawal,
  carryover,
  user
) {
  var wantedDate = v2SheetDateIso_(date);

  var wantedUnit = String(
    unitId || ''
  ).trim();

  var rows = v2ReadObjects_(
    env.dailyBalances,
    CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
  );

  var found = rows.filter(function(item) {
    return (
      String(item.unit_id || '').trim() ===
        wantedUnit &&
      v2SheetDateIso_(item.date_iso) ===
        wantedDate
    );
  })[0];

  var row = [
    wantedUnit,
    wantedDate,
    summary.openingCashCents,
    'FECHAMENTO',
    new Date(),
    user.id,
    summary.expectedCashCents,
    counted,
    difference,
    closingWithdrawal,
    carryover,
    'FECHADO'
  ];

  if (found) {
    env.dailyBalances
      .getRange(
        found._sheetRow,
        1,
        1,
        row.length
      )
      .setValues([row]);
  } else {
    env.dailyBalances.appendRow(row);
  }
}

function v2AssertOpen_(env,date,unitId) { if(v2FindClosure_(env,date,unitId)) throw appError_('O caixa desta data já foi fechado.','DATE_CLOSED'); }

function v2SyncPix_(payload, user) {
  payload = payload || {};

  var lock =
    LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    var env =
      v2Environment_();

    var last =
      env.entries.getLastRow();

    if (last < 2) {
      throw appError_(
        'Lançamento Pix não encontrado.',
        'ENTRY_NOT_FOUND'
      );
    }

    var status = String(
      payload.status ||
      payload.pixStatus ||
      ''
    ).toUpperCase().trim();

    var allowedStatuses = [
      'CRIANDO',
      'ATIVA',
      'PENDENTE',
      'CONFIRMADO',
      'EXPIRADO',
      'CANCELADO',
      'ERRO'
    ];

    if (
      allowedStatuses.indexOf(status) <
      0
    ) {
      throw appError_(
        'Status Pix inválido.',
        'INVALID_PIX_STATUS'
      );
    }

    var rows = env.entries
      .getRange(
        2,
        1,
        last - 1,
        CAIXA_V2_CFG
          .HEADERS
          .ENTRIES
          .length
      )
      .getValues();

    var entryId = String(
      payload.entryId || ''
    ).trim();

    var txid = String(
      payload.txid || ''
    ).trim();

    var index = -1;

    /*
     * O entryId sempre tem prioridade.
     * Nunca combinamos entryId com busca por txid.
     */
    if (entryId) {
      rows.some(function(row, rowIndex) {
        if (
          String(row[0]) === entryId
        ) {
          index = rowIndex;
          return true;
        }

        return false;
      });
    } else if (
      txid &&
      txid !== '***'
    ) {
      rows.some(function(row, rowIndex) {
        if (
          String(row[28]) === txid
        ) {
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
      throw appError_(
        'Lançamento Pix não encontrado.',
        'ENTRY_NOT_FOUND'
      );
    }

    var row = rows[index];

    if (
      String(row[17]) !==
      'PIX_PAGAMENTO_INSTANTANEO'
    ) {
      throw appError_(
        'O lançamento não é Pix.',
        'NOT_PIX'
      );
    }

    /*
     * Nas ações feitas pelo aplicativo,
     * o lançamento precisa pertencer à unidade
     * atualmente selecionada pelo usuário.
     *
     * Webhooks internos continuam protegidos
     * pelo segredo interno do router.
     */
    if (user) {
      var context =
        v2ResolveContext_(env, user);

      var rowUnit = String(
        row[7] || ''
      ).trim();

      var contextUnit = String(
        context.unit.unit_id || ''
      ).trim();

      if (
        !context.permissions.revenue
      ) {
        throw appError_(
          'Usuário sem permissão para confirmar Pix.',
          'FORBIDDEN'
        );
      }

      if (
        rowUnit !== contextUnit
      ) {
        throw appError_(
          'A cobrança Pix pertence a outra unidade.',
          'UNIT_MISMATCH'
        );
      }
    }

    var currentStatus = String(
      row[27] || ''
    ).toUpperCase().trim();

    var entryStatus = String(
      row[32] || ''
    ).toUpperCase().trim();

    var closureId = String(
      row[33] || ''
    ).trim();

    /*
     * Repetições da mesma confirmação são aceitas.
     * Alterações após o fechamento não são aceitas.
     */
    if (
      closureId &&
      status !== currentStatus
    ) {
      throw appError_(
        'O caixa deste lançamento já foi fechado.',
        'DATE_CLOSED'
      );
    }

    if (
      (
        entryStatus === 'EXCLUIDO' ||
        currentStatus === 'CANCELADO'
      ) &&
      status !== 'CANCELADO'
    ) {
      throw appError_(
        'Esta cobrança Pix foi cancelada.',
        'PIX_CANCELLED'
      );
    }

    if (
      currentStatus === 'CONFIRMADO' &&
      status !== 'CONFIRMADO'
    ) {
      throw appError_(
        'Este Pix já foi confirmado.',
        'PIX_ALREADY_CONFIRMED'
      );
    }

    var received = Math.round(
      Number(
        payload.amountCents || 0
      )
    );

    if (
      status === 'CONFIRMADO' &&
      received !== Number(row[14])
    ) {
      throw appError_(
        'Valor Pix divergente.',
        'PIX_AMOUNT_MISMATCH'
      );
    }

    row[27] = status;

    if (txid) {
      row[28] = txid;
    }

    if (payload.e2eid) {
      row[29] = payload.e2eid;
    }

    if (status === 'CONFIRMADO') {
      row[30] = new Date();
    } else if (payload.receivedAt) {
      row[30] = payload.receivedAt;
    }

    if (payload.provider) {
      row[31] = payload.provider;
    }

    if (status === 'CANCELADO') {
      row[32] = 'EXCLUIDO';
      row[34] = 'CANCELADO';
    }

    if (
      status === 'CONFIRMADO' &&
      entryStatus !== 'EXCLUIDO'
    ) {
      row[32] = 'ATIVO';
    }

    env.entries
      .getRange(
        index + 2,
        1,
        1,
        row.length
      )
      .setValues([row]);

    var entry =
      v2RowEntry_(row);

    return {
      ok: true,
      entry: entry,
      summary: v2BuildSummary_(
        env,
        entry.date,
        entry.unitId
      )
    };
  } finally {
    lock.releaseLock();
  }
}
