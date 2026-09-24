(function (global) {
  'use strict';

  const cfg = global.AGF_SHOPIFY_CONFIG || {};

  function apiUrl() {
    const value = String(cfg.apiUrl || '').replace(/\/$/, '');
    if (!value) throw new Error('API do Conector Shopify não configurada.');
    return value;
  }

  async function request(path, options) {
    const token = global.AgfAuth && global.AgfAuth.getToken ? global.AgfAuth.getToken() : '';
    if (!token) throw new Error('Faça login novamente.');

    const response = await fetch(apiUrl() + path, {
      method: (options && options.method) || 'GET',
      headers: Object.assign({
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      }, (options && options.headers) || {}),
      body: options && Object.prototype.hasOwnProperty.call(options, 'body')
        ? JSON.stringify(options.body)
        : undefined
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok === false) {
      const error = new Error((data && data.error) || 'Não foi possível concluir a operação.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  global.AgfShopify = Object.freeze({
    startOAuth: (customerId, shop) => request('/api/shopify/auth/start', {
      method: 'POST',
      body: { customerId, shop }
    }),
    listConnections: (customerId) => request('/api/shopify/connections?customer_id=' + encodeURIComponent(customerId)),
    listOrders: (shop, limit) => request(
      '/api/shopify/orders?shop=' + encodeURIComponent(shop) + '&limit=' + encodeURIComponent(limit || 20)
    ),
    getOrder: (shop, orderId) => request(
      '/api/shopify/order?shop=' + encodeURIComponent(shop) + '&order_id=' + encodeURIComponent(orderId)
    ),
    testConnection: (shop) => request('/api/shopify/test', {
      method: 'POST',
      body: { shop }
    })
  });
})(window);
