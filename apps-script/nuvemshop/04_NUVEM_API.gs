function nuvemFetch_(storeId, method, path, payload, query) {
  const cfg = getConfig_();
  const store = getStoreById_(storeId);

  if (!store) throw new Error('Loja não encontrada na base local: ' + storeId);
  if (!store.ACCESS_TOKEN) throw new Error('Loja sem access token salvo. Reinstale/reautorize o app nesta loja.');

  const base = cfg.apiBaseUrl.replace(/\/$/, '');
  const finalPath = path.startsWith('/') ? path : '/' + path;
  const url = base + '/' + encodeURIComponent(storeId) + finalPath + qs_(query || {});

  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: {
      'Authentication': 'bearer ' + store.ACCESS_TOKEN,
      'User-Agent': cfg.contactUa,
      'Content-Type': 'application/json'
    }
  };

  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  const resp = UrlFetchApp.fetch(url, options);
  const status = resp.getResponseCode();
  const text = resp.getContentText();

  if (status < 200 || status >= 300) {
    appendLog_('ERROR', 'api.fetch', storeId, '', 'HTTP ' + status + ' ' + finalPath, text);
    throw new Error('Nuvemshop API ' + status + ': ' + text);
  }

  return text ? JSON.parse(text) : {};
}

function listProducts_(storeId, perPage) {
  return nuvemFetch_(storeId, 'get', '/products', null, {
    per_page: perPage || 20,
    page: 1
  });
}

function listOrders_(storeId, perPage) {
  return nuvemFetch_(storeId, 'get', '/orders', null, {
    per_page: perPage || 50,
    page: 1,
    aggregates: 'fulfillment_orders'
  });
}

function getOrder_(storeId, orderId) {
  const order = nuvemFetch_(storeId, 'get', '/orders/' + encodeURIComponent(orderId), null, {
    aggregates: 'fulfillment_orders'
  });

  appendLog_('INFO', 'api.getOrder', storeId, orderId, 'Pedido completo carregado', {
    hasFulfillmentOrders: Array.isArray(order.fulfillment_orders),
    fulfillmentOrdersLength: Array.isArray(order.fulfillment_orders) ? order.fulfillment_orders.length : 0,
    shippingStatus: order.shipping_status || ''
  });

  return order;
}

function getOrderNfeMetafields_(storeId, orderId) {
  return nuvemFetch_(storeId, 'get', '/metafields/orders', null, {
    owner_id: orderId,
    namespace: 'nfe',
    key: 'list',
    per_page: 1,
    page: 1,
    fields: 'id,value'
  });
}

function listFulfillmentOrders_(storeId, orderId) {
  return nuvemFetch_(storeId, 'get', '/orders/' + encodeURIComponent(orderId) + '/fulfillment-orders');
}

function getFulfillmentOrder_(storeId, orderId, fulfillmentOrderId) {
  return nuvemFetch_(storeId, 'get', '/orders/' + encodeURIComponent(orderId) + '/fulfillment-orders/' + encodeURIComponent(fulfillmentOrderId));
}

function patchFulfillmentOrder_(storeId, orderId, fulfillmentOrderId, payload) {
  return nuvemFetch_(storeId, 'patch', '/orders/' + encodeURIComponent(orderId) + '/fulfillment-orders/' + encodeURIComponent(fulfillmentOrderId), payload || {});
}

function buildCorreiosTrackingUrl_(codigoObjeto) {
  const codigo = String(codigoObjeto || '').trim();
  return codigo ? 'https://rastreamento.correios.com.br/app/index.php?objetos=' + encodeURIComponent(codigo) : '';
}

function buildConnectorTrackingUrl_(codigoObjeto) {
  const cfg = getConfig_();
  const codigo = String(codigoObjeto || '').trim();
  if (!cfg.webappUrl || !codigo) return '';
  return cfg.webappUrl + '?route=trackPublic&codigo=' + encodeURIComponent(codigo);
}

function pickBestFulfillmentOrder_(order, fulfillmentOrders) {
  const list = Array.isArray(fulfillmentOrders) ? fulfillmentOrders : [];
  if (!list.length) return null;
  for (var i = 0; i < list.length; i++) {
    var fo = list[i] || {};
    var status = String(fo.status || '').toUpperCase();
    if (status !== 'CANCELLED' && status !== 'DELIVERED') return fo;
  }
  return list[0] || null;
}

function syncOrderTrackingToNuvemshop_(storeId, orderId, trackingCode, trackingUrl, opts) {
  const options = opts || {};
  const order = getOrder_(storeId, orderId);
  var fulfillmentOrders = Array.isArray(order.fulfillment_orders) ? order.fulfillment_orders : [];
  if (!fulfillmentOrders.length) {
    try {
      var listed = listFulfillmentOrders_(storeId, orderId);
      fulfillmentOrders = Array.isArray(listed) ? listed : (listed.items || listed.fulfillment_orders || []);
    } catch (e) {}
  }
  if (!fulfillmentOrders.length) throw new Error('Pedido sem fulfillment_orders para sincronizar rastreio.');

  const fo = pickBestFulfillmentOrder_(order, fulfillmentOrders) || {};
  const fulfillmentOrderId = String(fo.id || '').trim();
  if (!fulfillmentOrderId) throw new Error('Fulfillment Order sem ID.');

  const payload = {
    status: String(options.status || 'DISPATCHED').toUpperCase(),
    tracking_info: {
      code: String(trackingCode || ''),
      url: String(trackingUrl || buildCorreiosTrackingUrl_(trackingCode) || ''),
      notify_customer: options.notifyCustomer !== false
    }
  };

  const patched = patchFulfillmentOrder_(storeId, orderId, fulfillmentOrderId, payload);
  appendLog_('INFO', 'api.patchFulfillmentOrder', storeId, orderId, 'Tracking sincronizado na Nuvemshop', {
    fulfillmentOrderId: fulfillmentOrderId,
    trackingCode: payload.tracking_info.code,
    status: payload.status,
    trackingUrl: payload.tracking_info.url
  });

  return {
    fulfillmentOrderId: fulfillmentOrderId,
    requestPayload: payload,
    response: patched
  };
}

function listWebhooks_(storeId) {
  return nuvemFetch_(storeId, 'get', '/webhooks');
}

function createWebhook_(storeId, eventName, url) {
  return nuvemFetch_(storeId, 'post', '/webhooks', {
    event: eventName,
    url: url
  });
}
