/**
 * Fechamento V3 com semântica correta de sangria.
 *
 * O valor conferido é sempre o esperado ANTES da sangria de fechamento.
 * A sangria reduz somente o carryover/físico que permanecerá no caixa.
 */
function v3CloseCashSafe_(payload, user) {
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
      throw appError_(
        'Usuário sem permissão para fechar o caixa.',
        'FORBIDDEN'
      );
    }

    var date = v2Today_();
    var unitId = String(context.unit.unit_id);
    var baseClosure = v2FindClosure_(env, date, unitId);
    var summaryBefore = v3BuildSummary_(env, date, unitId);
    var newEntries = v3UnclosedEntries_(env, date, unitId);

    if (!baseClosure && !newEntries.length) {
      throw appError_('Não há movimentos para fechar.', 'NO_ENTRIES');
    }

    if (baseClosure && !newEntries.length) {
      return {
        ok: true,
        alreadyClosed: true,
        noNewMovements: true,
        closure: v3DecorateClosure_(baseClosure, summaryBefore),
        summary: summaryBefore,
        supplementState: v3SupplementState_(
          env,
          date,
          unitId,
          baseClosure
        )
      };
    }

    /*
     * O checkbox "Conferi o numerário" confirma o valor esperado.
     * Não usamos valor digitado pelo navegador para definir diferença.
     */
    var counted = Math.round(
      Number(summaryBefore.expectedCashCents || 0)
    );

    var closingWithdrawal = Math.round(
      Number(payload.closingWithdrawalCents || 0)
    );

    if (
      closingWithdrawal < 0 ||
      closingWithdrawal > counted
    ) {
      throw appError_(
        'Sangria do fechamento inválida.',
        'INVALID_CLOSING_WITHDRAWAL'
      );
    }

    var carryover = counted - closingWithdrawal;
    var notes = String(payload.notes || '').trim();
    var now = new Date();
    var closureId = Utilities.getUuid();
    var entryIds = newEntries.map(function(entry) {
      return entry.id;
    });

    dispatchClosureId = closureId;

    if (closingWithdrawal > 0) {
      v2RecordWithdrawal_(env, context, user, {
        date: date,
        amountCents: closingWithdrawal,
        balanceBeforeCents: counted,
        destination:
          payload.withdrawalDestination ||
          'Financeiro',
        notes:
          payload.withdrawalNotes ||
          'Sangria realizada no fechamento',
        closureId: closureId
      });
    }

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
        summaryBefore.revenueCents,
        summaryBefore.expenseCents,
        summaryBefore.netCents,
        JSON.stringify(summaryBefore.byPayment),
        JSON.stringify(summaryBefore.countByPayment),
        summaryBefore.openingCashCents,
        summaryBefore.cashRevenueCents,
        summaryBefore.cashExpenseCents,
        summaryBefore.withdrawalsCents,
        summaryBefore.expectedCashCents,
        counted,
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

      v3MarkEntriesWithClosure_(
        env,
        entryIds,
        closureId
      );

      v2UpdateDailyBalanceClose_(
        env,
        date,
        unitId,
        summaryBefore,
        counted,
        0,
        closingWithdrawal,
        carryover,
        user
      );

      var pdf = v2GenerateClosingPdf_(
        env,
        closureId,
        context
      );

      v2UpdateClosurePdf_(env, closureId, pdf);
    } else {
      var history = v3SupplementHistory_(
        env,
        date,
        unitId
      );

      var delta = v3DeltaSummary_(newEntries);

      v3WriteSupplement_(env, {
        id: closureId,
        date: date,
        unitId: unitId,
        unitName: String(context.unit.name || unitId),
        baseClosureId: baseClosure.id,
        sequence: history.length + 1,
        createdAt: now,
        user: user,
        delta: delta,
        summary: summaryBefore,
        closingWithdrawalCents: closingWithdrawal,
        carryoverCents: carryover,
        notes: notes,
        entryIds: entryIds
      });

      v3MarkEntriesWithClosure_(
        env,
        entryIds,
        closureId
      );

      v2UpdateDailyBalanceClose_(
        env,
        date,
        unitId,
        summaryBefore,
        counted,
        0,
        closingWithdrawal,
        carryover,
        user
      );
    }

    /*
     * Somente os lançamentos vinculados ao fechamento/complemento recém-criado
     * são colocados na fila. Um lançamento já sincronizado nunca é reenfileirado.
     */
    var entriesForDispatch = v3EntriesForClosure_(
      env,
      closureId
    );

    v2EnqueueContaAzul_(
      env,
      closureId,
      entriesForDispatch
    );

    var refreshedSummary = v3BuildSummary_(
      env,
      date,
      unitId
    );

    var refreshedBase =
      v2FindClosure_(env, date, unitId) ||
      baseClosure;

    result = {
      ok: true,
      mode: baseClosure
        ? 'SUPPLEMENT'
        : 'INITIAL',
      supplementId: baseClosure
        ? closureId
        : '',
      closure: v3DecorateClosure_(
        refreshedBase,
        refreshedSummary
      ),
      summary: refreshedSummary,
      supplementState: v3SupplementState_(
        env,
        date,
        unitId,
        refreshedBase
      )
    };
  } finally {
    lock.releaseLock();
  }

  /* Chamada externa nunca ocorre enquanto mantemos o lock da planilha. */
  try {
    result.contaAzulDispatch =
      processContaAzulQueueV2(
        20,
        dispatchClosureId
      );
  } catch (error) {
    result.contaAzulDispatch = {
      ok: false,
      error: String(
        error && error.message
          ? error.message
          : error
      )
    };
  }

  /* Atualiza o retorno com o estado persistido após o processamento da fila. */
  try {
    var finalEnv = v2Environment_();
    var finalDate = v2Today_();
    var finalUnitId = String(
      result.summary.unitId || ''
    );
    var finalSummary = v3BuildSummary_(
      finalEnv,
      finalDate,
      finalUnitId
    );
    var finalClosure = v2FindClosure_(
      finalEnv,
      finalDate,
      finalUnitId
    );

    result.summary = finalSummary;
    result.closure = v3DecorateClosure_(
      finalClosure,
      finalSummary
    );
    result.supplementState =
      v3SupplementState_(
        finalEnv,
        finalDate,
        finalUnitId,
        finalClosure
      );
  } catch (_) {}

  return result;
}
