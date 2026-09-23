(function (global) {
  'use strict';

  const cfg = global.AGF_CORE_CONFIG || {};

  function apiUrl() {
    const value = String(cfg.apiUrl || '').replace(/\/$/, '');
    if (!value || /PREENCHER/i.test(value)) throw new Error('AGF Core API ainda não configurada.');
    return value;
  }

  async function request(path, options) {
    const token = global.AgfAuth && global.AgfAuth.getToken ? global.AgfAuth.getToken() : '';
    if (!token) throw new Error('Faça login novamente.');

    const response = await fetch(apiUrl() + path, {
      method: (options && options.method) || 'GET',
      headers: Object.assign({
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }, (options && options.headers) || {}),
      body: options && Object.prototype.hasOwnProperty.call(options, 'body')
        ? JSON.stringify(options.body)
        : undefined
    });

    let data = null;
    try { data = await response.json(); } catch (err) {}
    if (!response.ok || !data || data.ok === false) {
      const error = new Error((data && data.error) || 'Não foi possível concluir a operação.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  global.AgfCore = Object.freeze({
    request,
    listModules: () => request('/api/modules'),
    listCustomers: (query) => request('/api/customers' + (query ? '?' + query : '')),
    getCustomer: (id) => request('/api/customers/' + encodeURIComponent(id)),
    createCustomer: (body) => request('/api/customers', { method: 'POST', body }),
    updateCustomer: (id, body) => request('/api/customers/' + encodeURIComponent(id), { method: 'PATCH', body }),
    setCustomerModules: (id, modules) => request('/api/customers/' + encodeURIComponent(id) + '/modules', {
      method: 'PUT',
      body: { modules }
    })
  });
})(window);
