function extractFulfillmentOrdersRaw_(order) {
  if (Array.isArray(order.fulfillment_orders) && order.fulfillment_orders.length) {
    return order.fulfillment_orders;
  }
  if (Array.isArray(order.fulfillments) && order.fulfillments.length) {
    return order.fulfillments;
  }
  return [];
}

function cleanShippingText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeShippingService_(rawText) {
  const txt = cleanShippingText_(rawText).toUpperCase();
  if (!txt) return '';
  if (txt.indexOf('SEDEX') >= 0) return 'SEDEX';
  if (txt.indexOf('PAC') >= 0) return 'PAC';
  return '';
}

function extractShippingFields_(order) {
  const fulfillmentOrders = extractFulfillmentOrdersRaw_(order);

  for (let i = 0; i < fulfillmentOrders.length; i++) {
    const fo = fulfillmentOrders[i] || {};
    const shipping = fo.shipping || {};
    const option = shipping.option || {};
    const carrier = shipping.carrier || {};

    const optionCode = cleanShippingText_(option.code) || cleanShippingText_(fo.shipping_option_code);
    const optionName = cleanShippingText_(option.name) || cleanShippingText_(fo.shipping_option) || cleanShippingText_(fo.shipping_option_name);
    const carrierCode = cleanShippingText_(carrier.code) || cleanShippingText_(fo.shipping_carrier_code);
    const carrierName = cleanShippingText_(carrier.name) || cleanShippingText_(shipping.carrier_name) || cleanShippingText_(fo.shipping_carrier_name);

    if (optionCode || optionName || carrierCode || carrierName) {
      const raw = optionName || optionCode || carrierName || carrierCode || '';
      return {
        shippingMethodRaw: raw,
        shippingService: normalizeShippingService_(optionCode || optionName),
        shippingOptionCode: optionCode,
        shippingOptionName: optionName,
        shippingCarrierCode: carrierCode,
        shippingCarrierName: carrierName
      };
    }
  }

  const legacyShipping = order.shipping || {};
  const legacyCarrier = legacyShipping.carrier || {};
  const legacyOptionCode = cleanShippingText_(order.shipping_option_code);
  const legacyOptionName = cleanShippingText_(order.shipping_option_name || order.shipping_option);
  const legacyCarrierCode = cleanShippingText_(legacyCarrier.code || legacyCarrier.id);
  const legacyCarrierName = cleanShippingText_(legacyCarrier.name);
  const legacyRaw = legacyOptionName || legacyOptionCode || legacyCarrierName || legacyCarrierCode || '';

  return {
    shippingMethodRaw: legacyRaw,
    shippingService: normalizeShippingService_(legacyOptionCode || legacyOptionName),
    shippingOptionCode: legacyOptionCode,
    shippingOptionName: legacyOptionName,
    shippingCarrierCode: legacyCarrierCode,
    shippingCarrierName: legacyCarrierName
  };
}

function parseNfeListValue_(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function extractInvoiceFieldsFromValue_(value) {
  const invoiceList = parseNfeListValue_(value);

  if (invoiceList.length) {
    const first = invoiceList[0] || {};
    return {
      docType: 'NFE',
      docSource: 'METAFIELD_NFE_LIST',
      invoiceKey: String(first.key || ''),
      invoiceLink: String(first.link || ''),
      invoiceJson: JSON.stringify(invoiceList)
    };
  }

  return {
    docType: 'DCE',
    docSource: 'ORDER_ITEMS',
    invoiceKey: '',
    invoiceLink: '',
    invoiceJson: '[]'
  };
}

function extractInvoiceFields_(storeId, orderId) {
  const metafields = getOrderNfeMetafields_(storeId, orderId);
  const row = Array.isArray(metafields) && metafields.length ? metafields[0] : null;
  return extractInvoiceFieldsFromValue_(row ? row.value : '');
}

/**
 * Busca, em poucas chamadas, os metafields de NF-e de TODOS os pedidos da loja
 * e devolve um mapa owner_id -> value. Evita 1 chamada por pedido no sync.
 * Retorna null se a busca em lote falhar (o chamador faz fallback por pedido).
 */
function getAllOrderNfeMetafieldMap_(storeId, perPage) {
  try {
    const map = {};
    const pp = Math.min(Math.max(Number(perPage) || 200, 50), 200);
    let page = 1;
    for (let i = 0; i < 5; i++) { // teto de segurança: 5 páginas (até 1000 NFs)
      const list = nuvemFetch_(storeId, 'get', '/metafields/orders', null, {
        namespace: 'nfe', key: 'list', per_page: pp, page: page, fields: 'owner_id,value'
      });
      const arr = Array.isArray(list) ? list : (list.items || []);
      if (!arr.length) break;
      arr.forEach(function(mf) {
        if (mf && mf.owner_id != null) map[String(mf.owner_id)] = mf.value;
      });
      if (arr.length < pp) break;
      page++;
    }
    return map;
  } catch (err) {
    appendLog_('WARN', 'sync.metafields.batch', storeId, '', 'Falha ao buscar metafields NF em lote; usando fallback por pedido', { error: err.message || String(err) });
    return null;
  }
}

function buildDeclarationItemsFromOrder_(order) {
  const items = Array.isArray(order.products) ? order.products : [];
  return items.map(function(item, idx) {
    return {
      line: idx + 1,
      sku: item.sku || '',
      description: item.name || '',
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.price || 0),
      total_price: Number(item.quantity || 0) * Number(item.price || 0),
      weight: Number(item.weight || 0),
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      depth: Number(item.depth || 0)
    };
  });
}

function normalizeOrder_(storeId, order, invoiceFields) {
  const customer = order.customer || {};
  const shippingAddress = order.shipping_address || {};
  const products = Array.isArray(order.products) ? order.products : [];
  const fulfillmentOrdersRaw = extractFulfillmentOrdersRaw_(order);
  const shippingFields = extractShippingFields_(order);
  const declarationItems = buildDeclarationItemsFromOrder_(order);

  // Pedidos novos (Nuvem Envio) trazem o destinatário em fulfillment_orders[].recipient,
  // não em order.shipping_address. Usamos como fallback para não perder telefone/nome.
  const fulfillmentRecipient = (fulfillmentOrdersRaw[0] && fulfillmentOrdersRaw[0].recipient) || {};

  const customerName = order.contact_name || shippingAddress.name || customer.name || fulfillmentRecipient.name || order.billing_name || '';
  const customerEmail = order.contact_email || customer.email || fulfillmentRecipient.email || '';
  const customerPhone = order.contact_phone || shippingAddress.phone || customer.phone || fulfillmentRecipient.phone || order.billing_phone || '';
  const customerDocument = order.contact_identification || customer.identification || fulfillmentRecipient.identifier || '';

  return {
    STORE_ID: String(storeId),
    ORDER_ID: String(order.id || ''),
    ORDER_NUMBER: String(order.number || ''),
    CREATED_AT: order.created_at || '',
    UPDATED_AT: order.updated_at || '',
    STATUS: order.status || '',
    PAYMENT_STATUS: order.payment_status || '',
    SHIPPING_STATUS: order.shipping_status || '',
    CUSTOMER_NAME: customerName,
    CUSTOMER_EMAIL: customerEmail,
    CUSTOMER_PHONE: customerPhone,
    CUSTOMER_DOCUMENT: customerDocument,
    SHIPPING_NAME: shippingAddress.name || fulfillmentRecipient.name || customerName,
    SHIPPING_PHONE: shippingAddress.phone || fulfillmentRecipient.phone || customerPhone,
    ZIP: shippingAddress.zipcode || shippingAddress.zip || order.billing_zipcode || '',
    ADDRESS: shippingAddress.address || order.billing_address || '',
    NUMBER: shippingAddress.number || order.billing_number || '',
    FLOOR: shippingAddress.floor || order.billing_floor || '',
    LOCALITY: shippingAddress.locality || order.billing_locality || '',
    CITY: shippingAddress.city || order.billing_city || '',
    PROVINCE: shippingAddress.province || order.billing_province || '',
    TOTAL: order.total || '',
    CURRENCY: order.currency || '',
    ORDER_WEIGHT: order.weight || '',
    ITEMS_COUNT: products.length,
    SHIPPING_METHOD_RAW: shippingFields.shippingMethodRaw || '',
    SHIPPING_SERVICE: shippingFields.shippingService || '',
    SHIPPING_OPTION_CODE: shippingFields.shippingOptionCode || '',
    SHIPPING_OPTION_NAME: shippingFields.shippingOptionName || '',
    SHIPPING_CARRIER_CODE: shippingFields.shippingCarrierCode || '',
    SHIPPING_CARRIER_NAME: shippingFields.shippingCarrierName || '',
    DOC_TYPE: invoiceFields.docType || 'DCE',
    DOC_SOURCE: invoiceFields.docSource || 'ORDER_ITEMS',
    INVOICE_KEY: invoiceFields.invoiceKey || '',
    INVOICE_LINK: invoiceFields.invoiceLink || '',
    INVOICE_JSON: invoiceFields.invoiceJson || '[]',
    DECLARATION_ITEMS_JSON: JSON.stringify(declarationItems),
    FULFILLMENTS_JSON: JSON.stringify(fulfillmentOrdersRaw),
    FULFILLMENT_ORDER_ID: String((fulfillmentOrdersRaw[0] && fulfillmentOrdersRaw[0].id) || ''),
    RAW_JSON: JSON.stringify(order),
    LAST_SYNC_AT: nowIso_()
  };
}

function normalizeOrderItems_(storeId, order) {
  const items = Array.isArray(order.products) ? order.products : [];
  return items.map(function(item, idx) {
    return {
      STORE_ID: String(storeId),
      ORDER_ID: String(order.id || ''),
      LINE_KEY: String(item.id || item.product_id || idx + 1),
      SKU: item.sku || '',
      NAME: item.name || '',
      QUANTITY: item.quantity || '',
      PRICE: item.price || '',
      WEIGHT: item.weight || '',
      WIDTH: item.width || '',
      HEIGHT: item.height || '',
      DEPTH: item.depth || '',
      RAW_JSON: JSON.stringify(item),
      LAST_SYNC_AT: nowIso_()
    };
  });
}

function syncOrderById_(storeId, orderId) {
  appendLog_('INFO', 'sync.order.start', storeId, orderId, 'Iniciando sync do pedido', { orderId: orderId });

  const order = getOrder_(storeId, orderId);
  const invoiceFields = extractInvoiceFields_(storeId, orderId);
  const orderRow = normalizeOrder_(storeId, order, invoiceFields);
  const itemRows = normalizeOrderItems_(storeId, order);

  upsertOrder_(orderRow);
  replaceOrderItems_(storeId, orderRow.ORDER_ID, itemRows);

  appendLog_('INFO', 'sync.order.done', storeId, orderRow.ORDER_ID, 'Pedido sincronizado', {
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

function syncLatestOrders_(storeId, perPage) {
  appendLog_('INFO', 'sync.orders.latest.start', storeId, '', 'Iniciando syncLatestOrders_', {
    storeId: storeId,
    perPage: perPage || 50
  });

  const result = listOrders_(storeId, perPage || 50);
  const orders = Array.isArray(result) ? result : (result.orders || []);
  const ids = orders.map(function(o) { return o && o.id; }).filter(Boolean);

  appendLog_('INFO', 'sync.orders.latest.list', storeId, '', 'Resposta da listagem recebida', {
    resultType: Array.isArray(result) ? 'array' : typeof result,
    count: orders.length,
    orderIds: ids
  });

  // Busca os metafields de NF de todos os pedidos de uma vez (1-2 chamadas)
  // em vez de 1 por pedido. nfeMap = null sinaliza fallback por pedido.
  const nfeMap = getAllOrderNfeMetafieldMap_(storeId, perPage);

  let count = 0;
  const processed = [];
  const failed = [];

  orders.forEach(function(orderSummary) {
    const orderId = orderSummary && orderSummary.id;
    if (!orderId) return;

    try {
      // A listagem /orders já retorna o pedido completo (products, customer,
      // shipping_address) com aggregates=fulfillment_orders. Só refazemos a
      // chamada por pedido se o resumo vier sem itens.
      const fullOrder = (Array.isArray(orderSummary.products) && orderSummary.products.length)
        ? orderSummary
        : getOrder_(storeId, orderId);
      const invoiceFields = nfeMap
        ? extractInvoiceFieldsFromValue_(nfeMap[String(orderId)])
        : extractInvoiceFields_(storeId, orderId);
      const orderRow = normalizeOrder_(storeId, fullOrder, invoiceFields);
      const itemRows = normalizeOrderItems_(storeId, fullOrder);

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
      appendLog_('ERROR', 'sync.orders.latest.item', storeId, orderId, 'Falha ao sincronizar pedido', { error: err.message });
    }
  });

  const store = getStoreById_(storeId);
  if (store) {
    upsertStore_({
      USER_ID: store.USER_ID,
      UPDATED_AT: nowIso_(),
      LAST_SYNC_AT: nowIso_(),
      LAST_SYNC_COUNT: count,
      LAST_ERROR: failed.length ? JSON.stringify(failed) : ''
    });
  }

  appendLog_('INFO', 'sync.orders.latest.done', storeId, '', 'Sincronização concluída', {
    count: count,
    processed: processed,
    failed: failed
  });

  return {
    ok: failed.length === 0,
    count: count,
    listed: orders.length,
    processed: processed,
    failed: failed
  };
}

function testListProductsFirstStore_() {
  const store = getFirstActiveStore_();
  if (!store) throw new Error('Nenhuma loja ativa encontrada.');
  const products = listProducts_(store.USER_ID, 20);
  Logger.log(JSON.stringify(products, null, 2));
  return products;
}

function syncLatestOrdersFirstStore_() {
  const store = getFirstActiveStore_();
  if (!store) throw new Error('Nenhuma loja ativa encontrada.');
  return syncLatestOrders_(store.USER_ID, 50);
}

function runDebugListOrdersFirstStore() {
  const store = getFirstActiveStore_();
  if (!store) throw new Error('Nenhuma loja ativa encontrada.');

  const result = listOrders_(store.USER_ID, 10);
  Logger.log(JSON.stringify(result, null, 2));
  const orders = Array.isArray(result) ? result : (result.orders || []);

  return {
    storeId: store.USER_ID,
    resultType: Array.isArray(result) ? 'array' : typeof result,
    count: orders.length,
    orderIds: orders.map(function(o) { return o && o.id; }).filter(Boolean),
    firstOrder: orders.length ? orders[0] : null
  };
}

function runDebugFirstOrderRaw() {
  const store = getFirstActiveStore_();
  if (!store) throw new Error('Nenhuma loja ativa encontrada.');

  const result = listOrders_(store.USER_ID, 10);
  const orders = Array.isArray(result) ? result : (result.orders || []);
  if (!orders.length) throw new Error('Nenhum pedido encontrado.');

  const firstId = orders[0].id;
  const fullOrder = getOrder_(store.USER_ID, firstId);

  Logger.log(JSON.stringify(fullOrder, null, 2));
  return fullOrder;
}

function runDebugSyncLatestOrdersFirstStore() {
  const store = getFirstActiveStore_();
  if (!store) throw new Error('Nenhuma loja ativa encontrada.');

  const result = syncLatestOrders_(store.USER_ID, 50);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runTestListProductsFirstStore() {
  return testListProductsFirstStore_();
}

function runSyncLatestOrdersFirstStore() {
  return syncLatestOrdersFirstStore_();
}
