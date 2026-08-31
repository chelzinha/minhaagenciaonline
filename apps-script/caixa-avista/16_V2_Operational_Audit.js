/**
 * Auditoria de lançamentos e totalizadores.
 * Esta função não altera a planilha.
 */

function auditarResumoCaixaV2(dateValue) {
  var env = v2Environment_();

  var date = v2Date_(
    dateValue || v2Today_()
  );

  var unitIds = [
    'AGF',
    'SHOPPING_METRO'
  ];

  var details = unitIds.map(function(unitId) {
    var entries = v2EntriesByDate_(
      env,
      date,
      unitId
    );

    var summary = v2BuildSummary_(
      env,
      date,
      unitId
    );

    return {
      unitId: unitId,
      entries: entries.length,
      revenueCents:
        summary.revenueCents,
      expenseCents:
        summary.expenseCents,
      netCents:
        summary.netCents,
      expectedCashCents:
        summary.expectedCashCents,
      pixPendingCents:
        summary.pixPendingCents,
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
    ok: true,
    date: date,
    units: details
  };
}