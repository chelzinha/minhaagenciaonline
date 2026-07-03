/* =====================================================
   Nuvemshop — sincronização incremental de pedidos pagos
   -----------------------------------------------------
   Mantém a importação rápida e evita trazer pedidos cancelados
   ou sem pagamento confirmado para a fila de geração de etiqueta.
   ===================================================== */

function isPaidNuvemOrder_(order) {
  var paymentStatus = String((order && order.payment_status) || '').toLowerCase();
  var status = String((order && order.status) || '').toLowerCase();

  if (paymentStatus !== 'paid') return false;
  if (status === 'cancelled' || status === 'canceled') return false;

  return true;
}

function getIncrementalUpdatedAtMin_(storeRow) {
  var raw = String((storeRow && storeRow.LAST_SYNC_AT) || '').trim();
  if (!raw) return '';

  var date = new Date(raw);
  if (isNaN(date.getTime())) return '';

  // Margem de segurança para evitar perder pedido atualizado no mesmo minuto.
  date.setMinutes(date.getMinutes() - 15);
  return date.toISOString();
}

function listPaidOrdersForSync_(storeId, perPage, updatedAtMin) {
  var query = {
    per_page: Math.min(Math.max(Number(perPage) || 40, 1), 200),
    page: 1,
    aggregates: 'fulfillment_orders',
    payment_status: 'paid'
  };

  if (updatedAtMin) query.updated_at_min = updatedAtMin;

  return nuvemFetch_(storeId, 'get', '/orders', null, query);
}

function syncPaidOrderById_(storeId, orderId) {
  appendLog_('INFO', 'sync.paid.order.start', storeId, orderId, 'Iniciando sync pago do pedido', { orderId: orderId });

  var order = getOrder_(storeId, orderId);
  if (!isPaidNuvemOrder_(order)) {
    appendLog_('INFO', 'sync.paid.order.ignored', storeId, orderId, 'Pedido ignorado por não estar pago ou estar cancelado', {
      status: order && order.status,
      paymentStatus: order && order.payment_status
    });
    return {
      ok: true,
      ignored: true,
      reason: 'ORDER_NOT_PAID_OR_CANCELLED',
      orderId: String(orderId || '')
    };
  }

  var invoiceFields = extractInvoiceFields_(storeId, orderId);
  var orderRow = normalizeOrder_(storeId, order, invoiceFields);
  var itemRows = normalizeOrderItems_(storeId, order);

  upsertOrder_(orderRow);
  replaceOrderItems_(storeId, orderRow.ORDER_ID, itemRows);

  appendLog_('INFO', 'sync.paid.order.done', storeId, orderRow.ORDER_ID, 'Pedido pago sincronizado', {
    items: itemRows.length,
    shippingService: orderRow.SHIPPING_SERVICE || '',
    docType: orderRow.DOC_TYPE || '',
    invoiceKey: orderRow.INVOICE_KEY || ''
  });

  return {
    ok: true,
    orderId: orderRow.ORDER_ID,
    items: itemRows.length,
    shippingService: orderRow.SHIPPING_SERVICE || '',
    docType: orderRow.DOC_TYPE || '',
    invoiceKey: orderRow.INVOICE_KEY || ''
  };
}

function syncLatestPaidOrders_(storeId, perPage) {
  var store = getStoreById_(storeId);
  var updatedAtMin = getIncrementalUpdatedAtMin_(store);
  var limit = Math.min(Math.max(Number(perPage) || 40, 1), 200);

  appendLog_('INFO', 'sync.paid.latest.start', storeId, '', 'Iniciando syncLatestPaidOrders_', {
    storeId: storeId,
    perPage: limit,
    updatedAtMin: updatedAtMin || ''
  });

  var result = listPaidOrdersForSync_(storeId, limit, updatedAtMin);
  var orders = Array.isArray(result) ? result : (result.orders || []);
  var ids = orders.map(function(o) { return o && o.id; }).filter(Boolean);

  appendLog_('INFO', 'sync.paid.latest.list', storeId, '', 'Listagem de pedidos pagos recebida', {
    count: orders.length,
    orderIds: ids
  });

  var nfeMap = getAllOrderNfeMetafieldMap_(storeId, limit);
  var count = 0;
  var skipped = [];
  var processed = [];
  var failed = [];

  orders.forEach(function(orderSummary) {
    var orderId = orderSummary && orderSummary.id;
    if (!orderId) return;

    try {
      if (!isPaidNuvemOrder_(orderSummary)) {
        skipped.push({ orderId: String(orderId), reason: 'ORDER_NOT_PAID_OR_CANCELLED' });
        return;
      }

      var fullOrder = (Array.isArray(orderSummary.products) && orderSummary.products.length)
        ? orderSummary
        : getOrder_(storeId, orderId);

      if (!isPaidNuvemOrder_(fullOrder)) {
        skipped.push({ orderId: String(orderId), reason: 'ORDER_NOT_PAID_OR_CANCELLED_AFTER_FETCH' });
        return;
      }

      var invoiceFields = nfeMap
        ? extractInvoiceFieldsFromValue_(nfeMap[String(orderId)])
        : extractInvoiceFields_(storeId, orderId);
      var orderRow = normalizeOrder_(storeId, fullOrder, invoiceFields);
      var itemRows = normalizeOrderItems_(storeId, fullOrder);

      upsertOrder_(orderRow);
      replaceOrderItems_(storeId, orderRow.ORDER_ID, itemRows);

      processed.push({
        orderId: orderRow.ORDER_ID,
        orderNumber: orderRow.ORDER_NUMBER,
        customer: orderRow.CUSTOMER_NAME,
        shippingService: orderRow.SHIPPING_SERVICE || '',
        docType: orderRow.DOC_TYPE || '',
        invoiceKey: orderRow.INVOICE_KEY || ''
      });
      count++;
    } catch (err) {
      failed.push({ orderId: String(orderId), error: err.message });
      appendLog_('ERROR', 'sync.paid.latest.item', storeId, orderId, 'Falha ao sincronizar pedido pago', { error: err.message });
    }
  });

  if (store) {
    upsertStore_({
      USER_ID: store.USER_ID,
      UPDATED_AT: nowIso_(),
      LAST_SYNC_AT: nowIso_(),
      LAST_SYNC_COUNT: count,
      LAST_ERROR: failed.length ? JSON.stringify(failed) : ''
    });
  }

  appendLog_('INFO', 'sync.paid.latest.done', storeId, '', 'Sincronização de pedidos pagos concluída', {
    listed: orders.length,
    count: count,
    skipped: skipped.length,
    failed: failed.length
  });

  return {
    ok: failed.length === 0,
    mode: 'paid_incremental',
    count: count,
    listed: orders.length,
    skipped: skipped,
    processed: processed,
    failed: failed
  };
}
