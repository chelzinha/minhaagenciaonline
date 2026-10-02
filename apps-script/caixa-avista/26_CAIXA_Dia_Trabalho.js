/**
 * CAIXA BALCÃO - CAIXA POR DIA (2026-10-01)
 *
 * O frontend envia `workDate` (yyyy-MM-dd) em todas as chamadas.
 * O router aplica essa data uma vez por requisição e v2Today_() passa a
 * devolver o "dia de trabalho". Assim TODAS as rotinas existentes (init,
 * lançar, lote, excluir, fechar, complemento, resumo) funcionam no dia
 * escolhido sem duplicar regra de negócio.
 *
 * Regras de dia passado (decididas pela Rachel em 01/10/2026):
 * - qualquer usuário com acesso ao Caixa pode consultar e alterar;
 * - dinheiro físico é bloqueado: sem receita/despesa em DINHEIRO,
 *   sem sangria, sem sangria no fechamento, sem ajuste de saldo inicial,
 *   sem excluir lançamento em DINHEIRO;
 * - Pix Santander (QR local) não é gerado em dia passado;
 * - toda alteração em dia passado é registrada em Auditoria_Retroativa.
 *
 * Execuções sem requisição (gatilhos, editor) não têm override:
 * v2Today_() continua sendo o dia real.
 */

var CAIXA_WORK_DATE_OVERRIDE = '';

var CAIXA_RETRO_CFG = Object.freeze({
  AUDIT_SHEET: 'Auditoria_Retroativa',
  AUDIT_HEADERS: [
    'created_at',
    'work_date',
    'unit_id',
    'user_id',
    'user_name',
    'action',
    'ref_id',
    'amount_cents',
    'detail'
  ],
  WRITE_ACTIONS: {
    saveEntry: true,
    saveBatch: true,
    deleteEntry: true,
    closeCash: true,
    syncPixPayment: true,
    repairSupplementPdf: false
  },
  BLOCKED_ACTIONS: {
    createWithdrawal: 'Sangria só pode ser registrada no dia atual.',
    setOpeningBalance: 'O saldo inicial só pode ser ajustado no dia atual.'
  }
});

function caixaRealToday_() {
  return Utilities.formatDate(
    new Date(),
    CAIXA_V2_CFG.TIMEZONE,
    'yyyy-MM-dd'
  );
}

function caixaIsRetro_() {
  return Boolean(
    CAIXA_WORK_DATE_OVERRIDE &&
    CAIXA_WORK_DATE_OVERRIDE < caixaRealToday_()
  );
}

function caixaIsCashPayment_(payment) {
  return Boolean(
    payment &&
    (
      String(payment.id || payment.payment_id || '') === 'DINHEIRO' ||
      String(payment.contaAzulMethod || payment.conta_azul_method || '') === 'DINHEIRO'
    )
  );
}

/**
 * Valida e aplica a data de trabalho da requisição.
 * Vazio ou hoje = sem override. Data futura ou inválida = erro.
 */
function caixaApplyWorkDate_(value) {
  CAIXA_WORK_DATE_OVERRIDE = '';

  var text = String(value || '').trim();
  if (!text) return '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw appError_('Data do caixa inválida.', 'INVALID_WORK_DATE');
  }

  var parsed = new Date(text + 'T12:00:00Z');
  if (
    isNaN(parsed.getTime()) ||
    Utilities.formatDate(parsed, 'UTC', 'yyyy-MM-dd') !== text
  ) {
    throw appError_('Data do caixa inválida.', 'INVALID_WORK_DATE');
  }

  var today = caixaRealToday_();

  if (text > today) {
    throw appError_('Não é possível abrir o caixa de uma data futura.', 'FUTURE_WORK_DATE');
  }

  if (text < today) {
    CAIXA_WORK_DATE_OVERRIDE = text;
  }

  return CAIXA_WORK_DATE_OVERRIDE;
}

/** Bloqueios de dia passado aplicados antes de executar a ação. */
function caixaAssertRetroAllowed_(action, request) {
  if (!caixaIsRetro_()) return;

  var blocked = CAIXA_RETRO_CFG.BLOCKED_ACTIONS[action];
  if (blocked) {
    throw appError_(blocked, 'RETRO_CASH_BLOCKED');
  }

  if (action === 'closeCash') {
    var payload = request && request.payload || {};
    if (Math.round(Number(payload.closingWithdrawalCents || 0)) > 0) {
      throw appError_(
        'Sangria no fechamento só pode ser feita no dia atual.',
        'RETRO_CASH_BLOCKED'
      );
    }
  }
}

/** Chamado por v2ValidateDraft_ depois de resolver a forma de pagamento. */
function caixaAssertRetroPayment_(payment) {
  if (!caixaIsRetro_()) return;

  if (caixaIsCashPayment_(payment)) {
    throw appError_(
      'Em dia anterior só é possível lançar Pix Infinity ou cartão. Dinheiro altera a gaveta e fica bloqueado.',
      'RETRO_CASH_BLOCKED'
    );
  }

  var isPix = String(payment && payment.contaAzulMethod || '') === 'PIX_PAGAMENTO_INSTANTANEO';
  var isTerminalPix = typeof v2IsTerminalPixPayment_ === 'function' && v2IsTerminalPixPayment_(payment);

  if (isPix && !isTerminalPix) {
    throw appError_(
      'Pix Santander (cobrança com QR) não pode ser gerado em dia anterior.',
      'RETRO_PIX_BLOCKED'
    );
  }
}

/** Chamado por v2DeleteEntry_: dinheiro de dia passado não pode ser excluído. */
function caixaAssertDeleteAllowed_(item) {
  var entryDate = v2SheetDateIso_(item && item.date_iso);
  var isCash = String(item && item.payment_id || '') === 'DINHEIRO' ||
    String(item && item.payment_ca_method || '') === 'DINHEIRO';

  if (isCash && entryDate && entryDate < caixaRealToday_()) {
    throw appError_(
      'Lançamento em dinheiro de dia anterior não pode ser excluído, porque altera a gaveta.',
      'RETRO_CASH_BLOCKED'
    );
  }
}

function caixaRetroAuditSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(CAIXA_V2_CFG.DB_PROP);
  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(CAIXA_RETRO_CFG.AUDIT_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CAIXA_RETRO_CFG.AUDIT_SHEET);
    sheet
      .getRange(1, 1, 1, CAIXA_RETRO_CFG.AUDIT_HEADERS.length)
      .setValues([CAIXA_RETRO_CFG.AUDIT_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/** Registra alteração em dia passado. Nunca derruba a operação. */
function caixaLogRetro_(action, request, user, response) {
  try {
    if (!caixaIsRetro_() || !CAIXA_RETRO_CFG.WRITE_ACTIONS[action]) return;
    if (!response || response.ok === false) return;

    var payload = request && request.payload || {};
    var rows = [];
    var now = new Date();
    var unitId = String(
      (response.entry && response.entry.unitId) ||
      (response.summary && response.summary.unitId) ||
      (user && user.requestedUnitId) ||
      ''
    );

    function push(refId, amount, detail) {
      rows.push([
        now,
        CAIXA_WORK_DATE_OVERRIDE,
        unitId,
        String(user && user.id || ''),
        String(user && user.name || ''),
        action,
        String(refId || ''),
        Math.round(Number(amount || 0)),
        String(detail || '').slice(0, 500)
      ]);
    }

    if (action === 'saveEntry' && response.entry) {
      push(response.entry.id, response.entry.amountCents, response.entry.type + ' | ' + response.entry.paymentId);
    } else if (action === 'saveBatch' && Array.isArray(response.entries)) {
      response.entries.forEach(function(entry) {
        if (entry) push(entry.id, entry.amountCents, 'LOTE ' + (response.batchId || '') + ' | ' + entry.paymentId);
      });
    } else if (action === 'deleteEntry') {
      push(payload.entryId, response.entry && response.entry.amountCents, 'Motivo: ' + String(payload.reason || ''));
    } else if (action === 'closeCash') {
      push(response.supplementId || (response.closure && response.closure.id), 0, response.mode || 'FECHAMENTO');
    } else if (action === 'syncPixPayment') {
      push(payload.entryId, payload.amountCents, 'Pix ' + String(payload.status || ''));
    }

    if (!rows.length) return;

    var sheet = caixaRetroAuditSheet_();
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);
  } catch (error) {
    console.warn('[CAIXA_RETRO_AUDIT] ' + (error && error.message ? error.message : error));
  }
}

/** Informações de data devolvidas ao frontend junto do init/summary. */
function caixaDateInfo_() {
  return {
    todayDate: caixaRealToday_(),
    workDate: CAIXA_WORK_DATE_OVERRIDE || caixaRealToday_(),
    isRetro: caixaIsRetro_()
  };
}
