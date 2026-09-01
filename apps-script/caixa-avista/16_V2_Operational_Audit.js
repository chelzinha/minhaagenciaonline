/**
 * Auditoria de lançamentos, datas e totalizadores.
 * Não grava ou altera dados na planilha.
 */
function auditarResumoCaixaV2(dateValue) {
  var env = v2Environment_();

  var date = v2SheetDateIso_(
    v2Date_(
      dateValue || v2Today_()
    )
  );

  var balanceRows = v2ReadObjects_(
    env.dailyBalances,
    CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
  );

  var closureRows = v2ReadObjects_(
    env.closures,
    CAIXA_V2_CFG.HEADERS.CLOSURES
  );

  var errors = [];

  var unitIds = [
    'AGF',
    'SHOPPING_METRO'
  ];

  var units = unitIds.map(function(unitId) {
    var entries = v2EntriesByDate_(
      env,
      date,
      unitId
    );

    var withdrawals = v2WithdrawalsByDate_(
      env,
      date,
      unitId
    );

    var currentBalances =
      balanceRows.filter(function(item) {
        return (
          String(item.unit_id || '').trim() ===
            unitId &&
          v2SheetDateIso_(item.date_iso) ===
            date
        );
      });

    var previousBalance = balanceRows
      .filter(function(item) {
        return (
          String(item.unit_id || '').trim() ===
            unitId &&
          v2SheetDateIso_(item.date_iso) <
            date &&
          String(item.status || '') ===
            'FECHADO'
        );
      })
      .sort(function(a,b) {
        return v2SheetDateIso_(b.date_iso)
          .localeCompare(
            v2SheetDateIso_(a.date_iso)
          );
      })[0];

    var closures =
      closureRows.filter(function(item) {
        return (
          String(item.unit_id || '').trim() ===
            unitId &&
          v2SheetDateIso_(item.date_iso) ===
            date
        );
      });

    if (currentBalances.length > 1) {
      errors.push(
        unitId +
        ': existem ' +
        currentBalances.length +
        ' linhas de saldo para ' +
        date +
        '.'
      );
    }

    if (closures.length > 1) {
      errors.push(
        unitId +
        ': existem ' +
        closures.length +
        ' fechamentos para ' +
        date +
        '.'
      );
    }

    var summary = {
      revenueCents: 0,
      expenseCents: 0,
      netCents: 0,
      cashRevenueCents: 0,
      cashExpenseCents: 0,
      pixPendingCents: 0,
      withdrawalsCents: 0,
      openingCashCents: currentBalances.length
        ? Number(
            currentBalances[0]
              .opening_cash_cents || 0
          )
        : (
            previousBalance
              ? Number(
                  previousBalance
                    .carryover_cents || 0
                )
              : 0
          ),
      expectedCashCents: 0
    };

    entries.forEach(function(entry) {
      if (entry.type === 'DESPESA') {
        summary.expenseCents +=
          entry.amountCents;

        if (entry.paymentId === 'DINHEIRO') {
          summary.cashExpenseCents +=
            entry.amountCents;
        }

        return;
      }

      if (
        entry.paymentContaAzulMethod ===
          'PIX_PAGAMENTO_INSTANTANEO' &&
        entry.pixStatus !== 'CONFIRMADO'
      ) {
        summary.pixPendingCents +=
          entry.amountCents;

        return;
      }

      summary.revenueCents +=
        entry.amountCents;

      if (entry.paymentId === 'DINHEIRO') {
        summary.cashRevenueCents +=
          entry.amountCents;
      }
    });

    withdrawals.forEach(function(withdrawal) {
      summary.withdrawalsCents +=
        withdrawal.amountCents;
    });

    summary.netCents =
      summary.revenueCents -
      summary.expenseCents;

    summary.expectedCashCents =
      summary.openingCashCents +
      summary.cashRevenueCents -
      summary.cashExpenseCents -
      summary.withdrawalsCents;

    return {
      unitId: unitId,
      entries: entries.length,
      withdrawals: withdrawals.length,
      dailyBalanceRows:
        currentBalances.length,
      closureRows:
        closures.length,
      summary: summary,
      movements: entries.map(
        function(entry) {
          return {
            id: entry.id,
            date: entry.date,
            type: entry.type,
            mode: entry.mode,
            amountCents:
              entry.amountCents,
            paymentId:
              entry.paymentId,
            clientName:
              entry.clientName
          };
        }
      )
    };
  });

  return {
    ok: errors.length === 0,
    seguroParaTeste:
      errors.length === 0,
    date: date,
    errors: errors,
    units: units
  };
}
