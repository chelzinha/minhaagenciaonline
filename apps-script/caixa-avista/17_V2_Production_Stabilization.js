/**
 * Estabilização de produção do Caixa Balcão.
 * Não grava chaves ou segredos no código.
 */

function v2ProductionPaymentIds_() {
  return [
    'DINHEIRO',
    'PIX_SANTANDER',
    'DEBITO_CIELO',
    'CREDITO_CIELO',
    'DEBITO_INFINITY',
    'CREDITO_INFINITY'
  ];
}

function auditarPreProducaoCaixaV2() {
  var env = v2Environment_();
  var props = PropertiesService.getScriptProperties();
  var errors = [];
  var warnings = [];

  var authMode = agfGateMode_();
  var jwtConfigured = Boolean(
    String(
      props.getProperty(AGF_GATE_CFG.SECRET_PROP) || ''
    ).trim()
  );

  if (!jwtConfigured) {
    errors.push(
      'AGF_AUTH_JWT_SECRET não está configurado no projeto do Caixa.'
    );
  }

  if (authMode !== 'enforce') {
    errors.push(
      'AGF_API_AUTH_MODE precisa estar como enforce.'
    );
  }

  var wanted = v2ProductionPaymentIds_();
  var paymentRows = v2ReadObjects_(
    env.payments,
    CAIXA_V2_CFG.HEADERS.PAYMENTS
  );

  ['AGF','SHOPPING_METRO'].forEach(function(unitId) {
    var unitRows = paymentRows.filter(function(item) {
      return String(item.unit_id || '') === unitId;
    });

    wanted.forEach(function(paymentId) {
      var item = unitRows.filter(function(row) {
        return String(row.payment_id || '') === paymentId;
      })[0];

      if (!item || !v2Bool_(item.active)) {
        errors.push(
          unitId + ': forma de pagamento ativa ausente: ' + paymentId
        );
      }
    });

    unitRows.forEach(function(item) {
      var paymentId = String(item.payment_id || '');
      var isPix = String(item.conta_azul_method || '') ===
        'PIX_PAGAMENTO_INSTANTANEO';

      if (isPix && paymentId !== 'PIX_SANTANDER' && v2Bool_(item.active)) {
        errors.push(
          unitId + ': Pix não autorizado permanece ativo: ' + paymentId
        );
      }

      if (paymentId === 'PIX_SANTANDER') {
        if (
          !v2Bool_(item.pix_active) ||
          String(item.pix_mode || '').toUpperCase() !== 'LOCAL_STATIC' ||
          !String(item.pix_key || '').trim() ||
          !String(item.pix_receiver_name || '').trim() ||
          !String(item.pix_city || '').trim()
        ) {
          errors.push(
            unitId + ': Pix Santander está incompleto.'
          );
        }

        if (v2Bool_(item.allow_batch)) {
          errors.push(
            unitId + ': Pix Santander não pode aceitar lote.'
          );
        }

        if (v2Bool_(item.allow_expense)) {
          errors.push(
            unitId + ': Pix Santander não deve aparecer em despesas.'
          );
        }
      }
    });
  });

  var handlers = ScriptApp.getProjectTriggers().map(function(trigger) {
    return trigger.getHandlerFunction();
  });

  ['processContaAzulQueueV2','retryPendingPdfsV2'].forEach(function(handler) {
    if (handlers.indexOf(handler) < 0) {
      errors.push('Trigger ausente: ' + handler);
    }
  });

  var queue = v2ReadObjects_(
    env.caQueue,
    CAIXA_V2_CFG.HEADERS.CA_QUEUE
  );

  var queueErrors = queue.filter(function(item) {
    return ['ERRO','CONFIGURACAO_PENDENTE'].indexOf(
      String(item.status || '')
    ) >= 0;
  }).length;

  if (queueErrors) {
    warnings.push(
      'Existem ' + queueErrors + ' item(ns) com erro na fila do Conta Azul.'
    );
  }

  return {
    ok: errors.length === 0,
    seguroParaHomologar: errors.length === 0,
    authMode: authMode,
    jwtSecretConfigured: jwtConfigured,
    errors: errors,
    warnings: warnings,
    triggers: handlers,
    queueErrors: queueErrors
  };
}

function prepararProducaoCaixaV2() {
  var props = PropertiesService.getScriptProperties();

  if (
    !String(
      props.getProperty(AGF_GATE_CFG.SECRET_PROP) || ''
    ).trim()
  ) {
    throw new Error(
      'Configure AGF_AUTH_JWT_SECRET antes de ativar a produção.'
    );
  }

  var env = v2Environment_();
  var headers = CAIXA_V2_CFG.HEADERS.PAYMENTS;
  var rows = v2ReadObjects_(env.payments, headers);

  var idx = {};
  headers.forEach(function(name, index) {
    idx[name] = index;
  });

  rows.forEach(function(item) {
    var row = item._row.slice();
    var paymentId = String(item.payment_id || '');
    var isPix = String(item.conta_azul_method || '') ===
      'PIX_PAGAMENTO_INSTANTANEO';

    if (paymentId === 'DINHEIRO') {
      row[idx.active] = true;
    }

    if (
      ['DEBITO_CIELO','CREDITO_CIELO','DEBITO_INFINITY','CREDITO_INFINITY']
        .indexOf(paymentId) >= 0
    ) {
      row[idx.active] = true;
    }

    if (paymentId === 'PIX_SANTANDER') {
      row[idx.active] = true;
      row[idx.allow_revenue] = true;
      row[idx.allow_expense] = false;
      row[idx.allow_batch] = false;
      row[idx.generate_pix] = true;
      row[idx.pix_mode] = 'LOCAL_STATIC';
      row[idx.pix_active] = true;
      if (!row[idx.pix_city]) row[idx.pix_city] = 'FORTALEZA';
    } else if (isPix) {
      row[idx.active] = false;
      row[idx.allow_expense] = false;
      row[idx.allow_batch] = false;
      row[idx.generate_pix] = false;
      row[idx.pix_active] = false;
    }

    env.payments
      .getRange(item._sheetRow,1,1,headers.length)
      .setValues([row]);
  });

  v2EnsureTriggers_();

  props.setProperty(
    AGF_GATE_CFG.MODE_PROP,
    'enforce'
  );

  SpreadsheetApp.flush();

  return auditarPreProducaoCaixaV2();
}
