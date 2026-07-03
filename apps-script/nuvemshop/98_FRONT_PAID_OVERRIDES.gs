/* =====================================================
   Nuvemshop — overrides de frontend para pedidos pagos
   -----------------------------------------------------
   Este arquivo fica antes do 99_ROUTER para que as actions abaixo
   sejam registradas já com a regra de elegibilidade paga.
   ===================================================== */

function isEligiblePaidOrderRow_(row) {
  var paymentStatus = String((row && row.PAYMENT_STATUS) || '').toLowerCase();
  var status = String((row && row.STATUS) || '').toLowerCase();

  if (paymentStatus !== 'paid') return false;
  if (status === 'cancelled' || status === 'canceled') return false;

  return true;
}

function assertEligiblePaidOrderRow_(row) {
  if (!isEligiblePaidOrderRow_(row)) {
    throw new Error('Este pedido não está pago ou foi cancelado na Nuvemshop. A etiqueta não pode ser gerada.');
  }
}

function action_listPedidos_(params) {
  var storeId = _sessionStoreId_(params);
  var filtros = params.filtros || {};
  var bucket = String(filtros.bucket || 'fila').toLowerCase();
  var q = String(filtros.q || '').trim().toLowerCase();
  var service = String(filtros.service || '').trim().toUpperCase();
  var docType = String(filtros.docType || '').trim().toUpperCase();
  var limit = Math.min(Math.max(Number(filtros.limit || 100), 1), 500);

  var rows = sheetRowsAsObjects_(CFG.SHEETS.ORDERS).filter(function(r) {
    return String(r.STORE_ID || '') === storeId && isEligiblePaidOrderRow_(r);
  });

  rows = rows.filter(function(r) {
    var ps = String(r.POSTAGENS_STATUS || '').toUpperCase();
    if (bucket === 'fila') return !ps || ps === 'ERRO';
    if (bucket === 'emitidos') return ps === 'CONCLUIDO';
    if (bucket === 'erros') return ps === 'ERRO';
    return true;
  });

  if (service) {
    rows = rows.filter(function(r) { return String(r.SHIPPING_SERVICE || '').toUpperCase() === service; });
  }
  if (docType) {
    rows = rows.filter(function(r) { return String(r.DOC_TYPE || '').toUpperCase() === docType; });
  }
  if (q) {
    rows = rows.filter(function(r) {
      return [r.ORDER_NUMBER, r.ORDER_ID, r.CUSTOMER_NAME, r.CUSTOMER_DOCUMENT, r.CITY, r.POSTAGENS_CODIGO_OBJETO]
        .some(function(v) { return String(v || '').toLowerCase().indexOf(q) >= 0; });
    });
  }

  rows.sort(function(a, b) {
    return new Date(b.CREATED_AT || 0).getTime() - new Date(a.CREATED_AT || 0).getTime();
  });

  return {
    total: rows.length,
    items: rows.slice(0, limit).map(sanitizeOrderListItem_)
  };
}

function action_syncPedidos_(params) {
  var storeId = _sessionStoreId_(params);
  var limit = Math.min(Math.max(Number(params.limit || 40), 1), 200);
  return syncLatestPaidOrders_(storeId, limit);
}

function action_gerarEtiqueta_(params) {
  var storeId = _sessionStoreId_(params);
  var orderId = String(params.orderId || '').trim();
  if (!orderId) throw new Error('orderId obrigatório.');
  var row = getOrderRowById_(orderId);
  if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');

  assertEligiblePaidOrderRow_(row);

  var merged = mergeReviewOverrides_(row, params.overrides || {});
  return sendOrderToPostagensByOrderId_(orderId, merged);
}

function action_gerarEtiquetaLote_(params) {
  var storeId = _sessionStoreId_(params);
  var orderIds = Array.isArray(params.orderIds) ? params.orderIds : [];
  var overrides = params.overrides || {};
  var results = [];
  var errors = [];
  var sessionTokenPostagens = loginPostagensAppByStoreId_(storeId);

  orderIds.forEach(function(orderId) {
    try {
      var row = getOrderRowById_(orderId);
      if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Sem permissão.');
      assertEligiblePaidOrderRow_(row);
      var merged = mergeReviewOverrides_(row, overrides);
      var result = sendOrderToPostagensByOrderId_(orderId, merged, sessionTokenPostagens);
      results.push({ orderId: String(orderId), ok: true, result: result.result });
    } catch (err) {
      errors.push({ orderId: String(orderId), ok: false, error: err.message || String(err) });
    }
  });

  return {
    total: orderIds.length,
    success: results.length,
    failed: errors.length,
    results: results,
    errors: errors
  };
}
