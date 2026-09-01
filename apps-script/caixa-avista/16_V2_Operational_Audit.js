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

  var result = {
    ok: errors.length === 0,
    seguroParaTeste:
      errors.length === 0,
    date: date,
    errors: errors,
    units: units
  };

  var output = JSON.stringify(
    result,
    null,
    2
  );

  console.log(output);
  Logger.log(output);

  return result;
}
/**
 * Lista linhas de saldo sem alterar a planilha.
 */
function inspecionarSaldosDuplicadosV2(
  dateValue,
  unitValue
) {
  var env = v2Environment_();

  var date = v2SheetDateIso_(
    dateValue || v2Today_()
  );

  var unitId = String(
    unitValue || 'SHOPPING_METRO'
  ).trim();

  var rows = v2ReadObjects_(
    env.dailyBalances,
    CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
  )
    .filter(function(item) {
      return (
        String(item.unit_id || '').trim() ===
          unitId &&
        v2SheetDateIso_(item.date_iso) ===
          date
      );
    })
    .map(function(item) {
      return {
        sheetRow: item._sheetRow,
        unitId: String(item.unit_id || ''),
        date: v2SheetDateIso_(
          item.date_iso
        ),
        openingCashCents: Number(
          item.opening_cash_cents || 0
        ),
        openingSource: String(
          item.opening_source || ''
        ),
        createdAt: v2Iso_(
          item.created_at
        ),
        createdBy: String(
          item.created_by || ''
        ),
        expectedCashCents: Number(
          item.expected_cash_cents || 0
        ),
        countedCashCents: Number(
          item.counted_cash_cents || 0
        ),
        differenceCents: Number(
          item.difference_cents || 0
        ),
        closingWithdrawalCents: Number(
          item.closing_withdrawal_cents || 0
        ),
        carryoverCents: Number(
          item.carryover_cents || 0
        ),
        status: String(
          item.status || ''
        )
      };
    });

  var result = {
    ok: true,
    date: date,
    unitId: unitId,
    total: rows.length,
    rows: rows
  };

  var output = JSON.stringify(
    result,
    null,
    2
  );

  console.log(output);
  Logger.log(output);

  return result;
}
/**
 * Remove somente saldos diários duplicados considerados seguros.
 *
 * Mantém a primeira linha e exclui as demais apenas quando:
 * - não existe fechamento para a data;
 * - todas as linhas estão abertas;
 * - todos os valores financeiros estão zerados;
 * - a origem é INICIAL_ZERO;
 * - a criação foi feita pelo sistema.
 */
function corrigirSaldosDuplicadosSeguroV2(
  dateValue,
  unitValue
) {
  var lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    var env = v2Environment_();

    var date = v2SheetDateIso_(
      dateValue || v2Today_()
    );

    var unitId = String(
      unitValue || 'SHOPPING_METRO'
    ).trim();

    var closures = v2ReadObjects_(
      env.closures,
      CAIXA_V2_CFG.HEADERS.CLOSURES
    ).filter(function(item) {
      return (
        String(item.unit_id || '').trim() ===
          unitId &&
        v2SheetDateIso_(item.date_iso) ===
          date
      );
    });

    if (closures.length) {
      throw new Error(
        'A limpeza foi bloqueada porque existe ' +
        'fechamento para esta data e unidade.'
      );
    }

    var rows = v2ReadObjects_(
      env.dailyBalances,
      CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
    )
      .filter(function(item) {
        return (
          String(item.unit_id || '').trim() ===
            unitId &&
          v2SheetDateIso_(item.date_iso) ===
            date
        );
      })
      .sort(function(a,b) {
        return a._sheetRow - b._sheetRow;
      });

    if (rows.length <= 1) {
      var nothingResult = {
        ok: true,
        altered: false,
        date: date,
        unitId: unitId,
        message:
          'Não existem saldos duplicados.',
        remainingRows: rows.length
      };

      console.log(
        JSON.stringify(
          nothingResult,
          null,
          2
        )
      );

      return nothingResult;
    }

    var unsafeRows = rows.filter(function(item) {
      return (
        String(item.status || '') !==
          'ABERTO' ||
        String(item.opening_source || '') !==
          'INICIAL_ZERO' ||
        String(item.created_by || '') !==
          'sistema' ||
        Number(item.opening_cash_cents || 0) !==
          0 ||
        Number(item.expected_cash_cents || 0) !==
          0 ||
        Number(item.counted_cash_cents || 0) !==
          0 ||
        Number(item.difference_cents || 0) !==
          0 ||
        Number(
          item.closing_withdrawal_cents || 0
        ) !== 0 ||
        Number(item.carryover_cents || 0) !==
          0
      );
    });

    if (unsafeRows.length) {
      throw new Error(
        'A limpeza foi bloqueada porque ' +
        unsafeRows.length +
        ' linha(s) possuem dados que não são ' +
        'duplicatas vazias e abertas.'
      );
    }

    var keptRow = rows[0]._sheetRow;

    var rowsToDelete = rows
      .slice(1)
      .map(function(item) {
        return item._sheetRow;
      })
      .sort(function(a,b) {
        return b - a;
      });

    rowsToDelete.forEach(function(sheetRow) {
      env.dailyBalances.deleteRow(sheetRow);
    });

    SpreadsheetApp.flush();

    var remainingRows = v2ReadObjects_(
      env.dailyBalances,
      CAIXA_V2_CFG.HEADERS.DAILY_BALANCES
    ).filter(function(item) {
      return (
        String(item.unit_id || '').trim() ===
          unitId &&
        v2SheetDateIso_(item.date_iso) ===
          date
      );
    });

    var result = {
      ok: remainingRows.length === 1,
      altered: true,
      date: date,
      unitId: unitId,
      keptOriginalSheetRow: keptRow,
      deletedRows: rowsToDelete,
      deletedCount: rowsToDelete.length,
      remainingRows: remainingRows.length
    };

    var output = JSON.stringify(
      result,
      null,
      2
    );

    console.log(output);
    Logger.log(output);

    return result;
  } finally {
    lock.releaseLock();
  }
}
