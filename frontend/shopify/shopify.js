(function () {
  'use strict';

  const state = {
    initialized: false,
    customers: [],
    selectedCustomerId: '',
    selectedShop: ''
  };

  const els = {};

  function bindElements() {
    els.currentUser = document.getElementById('currentUser');
    els.pageMessage = document.getElementById('pageMessage');
    els.customerSelect = document.getElementById('customerSelect');
    els.shopInput = document.getElementById('shopInput');
    els.connectBtn = document.getElementById('connectBtn');
    els.refreshBtn = document.getElementById('refreshBtn');
    els.connectionsEmpty = document.getElementById('connectionsEmpty');
    els.connectionsList = document.getElementById('connectionsList');
    els.refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
    els.ordersShopLabel = document.getElementById('ordersShopLabel');
    els.ordersEmpty = document.getElementById('ordersEmpty');
    els.ordersList = document.getElementById('ordersList');
  }

  function showMessage(message, type) {
    els.pageMessage.textContent = message || '';
    els.pageMessage.className = 'message' + (type ? ' ' + type : '');
    els.pageMessage.hidden = !message;
  }

  function currentUserLabel() {
    const session = window.AgfAuth && window.AgfAuth.getLocalSession ? window.AgfAuth.getLocalSession() : null;
    const user = session && (session.user || session.payload);
    if (!user) return '';
    return user.displayName || user.name || user.email || user.username || 'Administrador';
  }

  function customerName(customer) {
    return customer.trade_name || customer.legal_name || customer.id;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
  }

  function formatMoney(money) {
    if (!money) return '—';
    const amount = Number(money.amount);
    if (!Number.isFinite(amount)) return String(money.amount || '—');
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: money.currencyCode || 'BRL'
      }).format(amount);
    } catch {
      return amount.toFixed(2) + ' ' + (money.currencyCode || '');
    }
  }

  function statusLabel(value) {
    return String(value || '—')
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^./, (char) => char.toUpperCase());
  }

  async function loadEligibleCustomers() {
    els.customerSelect.disabled = true;
    els.customerSelect.innerHTML = '<option value="">Carregando clientes...</option>';

    const list = await window.AgfCore.listCustomers('status=ACTIVE&limit=100');
    const rows = Array.isArray(list.customers) ? list.customers : [];

    const details = await Promise.all(rows.map(async (row) => {
      try {
        return await window.AgfCore.getCustomer(row.id);
      } catch {
        return null;
      }
    }));

    state.customers = details
      .filter(Boolean)
      .filter((detail) => {
        const module = (detail.modules || []).find((item) => item.code === 'SHOPIFY');
        return module && ['ACTIVE', 'TRIAL'].includes(module.customer_status);
      })
      .map((detail) => detail.customer);

    els.customerSelect.innerHTML = '<option value="">Selecione um cliente</option>';
    for (const customer of state.customers) {
      const option = document.createElement('option');
      option.value = customer.id;
      option.textContent = customerName(customer);
      els.customerSelect.appendChild(option);
    }

    els.customerSelect.disabled = false;

    if (state.customers.length === 1) {
      els.customerSelect.value = state.customers[0].id;
      state.selectedCustomerId = state.customers[0].id;
      await loadConnections();
    }

    if (!state.customers.length) {
      showMessage('Nenhum cliente ativo possui o módulo Conector Shopify habilitado.', 'error');
    }
  }

  function renderConnections(shops) {
    els.connectionsList.innerHTML = '';

    if (!shops.length) {
      els.connectionsList.hidden = true;
      els.connectionsEmpty.hidden = false;
      els.connectionsEmpty.textContent = 'Nenhuma loja Shopify conectada para este cliente.';
      resetOrders();
      return;
    }

    els.connectionsEmpty.hidden = true;
    els.connectionsList.hidden = false;

    for (const shop of shops) {
      const row = document.createElement('div');
      row.className = 'connection-row';

      const main = document.createElement('div');
      main.className = 'connection-main';

      const title = document.createElement('strong');
      title.textContent = shop.shop_name || shop.shop_domain;

      const domain = document.createElement('span');
      domain.textContent = shop.shop_domain;

      main.append(title, domain);

      const meta = document.createElement('div');
      meta.className = 'connection-meta';

      const status = document.createElement('span');
      status.className = 'connection-status';
      status.textContent = shop.credential_ready === 0 ? 'CREDENCIAL PENDENTE' : (shop.status || '—');

      const ordersBtn = document.createElement('button');
      ordersBtn.type = 'button';
      ordersBtn.className = 'btn-secondary';
      ordersBtn.textContent = 'Ver pedidos';
      ordersBtn.disabled = shop.status !== 'ACTIVE' || shop.credential_ready === 0;
      ordersBtn.addEventListener('click', () => loadOrders(shop.shop_domain));

      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'btn-secondary';
      testBtn.textContent = 'Testar conexão';
      testBtn.addEventListener('click', () => testConnection(shop.shop_domain, testBtn));

      meta.append(status, ordersBtn, testBtn);
      row.append(main, meta);
      els.connectionsList.appendChild(row);
    }
  }

  function resetOrders() {
    state.selectedShop = '';
    els.refreshOrdersBtn.disabled = true;
    els.ordersShopLabel.textContent = 'Selecione uma loja vinculada para carregar os pedidos.';
    els.ordersList.innerHTML = '';
    els.ordersList.hidden = true;
    els.ordersEmpty.hidden = false;
    els.ordersEmpty.textContent = 'Nenhuma loja selecionada.';
  }

  function renderOrders(orders) {
    els.ordersList.innerHTML = '';

    if (!orders.length) {
      els.ordersList.hidden = true;
      els.ordersEmpty.hidden = false;
      els.ordersEmpty.textContent = 'Nenhum pedido recente foi retornado pela Shopify.';
      return;
    }

    els.ordersEmpty.hidden = true;
    els.ordersList.hidden = false;

    for (const order of orders) {
      const row = document.createElement('article');
      row.className = 'order-row';

      const header = document.createElement('div');
      header.className = 'order-header';

      const identity = document.createElement('div');
      const number = document.createElement('strong');
      number.textContent = order.name || order.id;
      const date = document.createElement('span');
      date.textContent = formatDate(order.createdAt);
      identity.append(number, date);

      const total = document.createElement('strong');
      total.className = 'order-total';
      total.textContent = formatMoney(order.total);

      header.append(identity, total);

      const status = document.createElement('div');
      status.className = 'order-statuses';
      status.innerHTML = '<span>Financeiro: <strong>' + statusLabel(order.financialStatus) + '</strong></span>' +
        '<span>Expedição: <strong>' + statusLabel(order.fulfillmentStatus) + '</strong></span>';

      const items = document.createElement('div');
      items.className = 'order-items';
      const lines = Array.isArray(order.lineItems) ? order.lineItems : [];
      if (!lines.length) {
        items.textContent = 'Sem itens retornados.';
      } else {
        items.textContent = lines.map((item) => {
          const sku = item.sku ? ' · SKU ' + item.sku : '';
          return item.quantity + '× ' + (item.name || 'Item') + sku;
        }).join(' | ');
      }

      row.append(header, status, items);
      els.ordersList.appendChild(row);
    }
  }

  async function loadConnections() {
    state.selectedCustomerId = els.customerSelect.value || '';

    if (!state.selectedCustomerId) {
      els.connectionsList.hidden = true;
      els.connectionsEmpty.hidden = false;
      els.connectionsEmpty.textContent = 'Selecione um cliente para consultar as lojas conectadas.';
      resetOrders();
      return;
    }

    els.refreshBtn.disabled = true;
    try {
      const data = await window.AgfShopify.listConnections(state.selectedCustomerId);
      const shops = Array.isArray(data.shops) ? data.shops : [];
      renderConnections(shops);

      const active = shops.filter((shop) => shop.status === 'ACTIVE' && shop.credential_ready !== 0);
      if (active.length === 1) {
        await loadOrders(active[0].shop_domain);
      } else if (!active.some((shop) => shop.shop_domain === state.selectedShop)) {
        resetOrders();
      }
    } catch (error) {
      renderConnections([]);
      showMessage(error.message || 'Não foi possível consultar as conexões Shopify.', 'error');
    } finally {
      els.refreshBtn.disabled = false;
    }
  }

  async function loadOrders(shopOverride) {
    const shop = shopOverride || state.selectedShop;
    if (!shop) {
      resetOrders();
      return;
    }

    state.selectedShop = shop;
    els.ordersShopLabel.textContent = shop + ' · últimos pedidos disponíveis para o app';
    els.refreshOrdersBtn.disabled = true;
    els.ordersEmpty.hidden = false;
    els.ordersEmpty.textContent = 'Carregando pedidos...';
    els.ordersList.hidden = true;

    try {
      const data = await window.AgfShopify.listOrders(shop, 20);
      renderOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      els.ordersList.hidden = true;
      els.ordersEmpty.hidden = false;
      els.ordersEmpty.textContent = error.message || 'Não foi possível carregar os pedidos da Shopify.';
    } finally {
      els.refreshOrdersBtn.disabled = false;
    }
  }

  async function startConnection() {
    const customerId = els.customerSelect.value || '';
    const shop = String(els.shopInput.value || '').trim().toLowerCase();

    if (!customerId) {
      showMessage('Selecione o cliente que será vinculado à loja Shopify.', 'error');
      return;
    }
    if (!shop) {
      showMessage('Informe o domínio permanente da loja Shopify.', 'error');
      els.shopInput.focus();
      return;
    }

    els.connectBtn.disabled = true;
    showMessage('Conectando à Shopify...');

    try {
      const data = await window.AgfShopify.startOAuth(customerId, shop);

      if (data.connected) {
        const connectedName = data.shop && data.shop.name ? data.shop.name : shop;
        showMessage('Loja ' + connectedName + ' conectada com sucesso.', 'success');
        await loadConnections();
        els.connectBtn.disabled = false;
        return;
      }

      if (!data.authorizeUrl) throw new Error('A Shopify não retornou uma URL de autorização.');
      window.location.assign(data.authorizeUrl);
    } catch (error) {
      showMessage(error.message || 'Não foi possível iniciar a conexão Shopify.', 'error');
      els.connectBtn.disabled = false;
    }
  }

  async function testConnection(shop, button) {
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Testando...';

    try {
      const data = await window.AgfShopify.testConnection(shop);
      const name = data.shop && data.shop.name ? data.shop.name : shop;
      showMessage('Conexão com ' + name + ' confirmada pela Shopify.', 'success');
      await loadConnections();
    } catch (error) {
      showMessage(error.message || 'Falha ao testar a conexão Shopify.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function handleCallbackMessage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== '1') return;

    const shop = params.get('shop') || 'a loja';
    showMessage('Loja ' + shop + ' conectada com sucesso.', 'success');

    params.delete('connected');
    params.delete('shop');
    const query = params.toString();
    const cleanUrl = window.location.pathname + (query ? '?' + query : '');
    window.history.replaceState({}, '', cleanUrl);
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    bindElements();
    els.currentUser.textContent = currentUserLabel();

    els.customerSelect.addEventListener('change', loadConnections);
    els.connectBtn.addEventListener('click', startConnection);
    els.refreshBtn.addEventListener('click', loadConnections);
    els.refreshOrdersBtn.addEventListener('click', () => loadOrders());
    els.shopInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        startConnection();
      }
    });

    handleCallbackMessage();
    resetOrders();

    try {
      await loadEligibleCustomers();
    } catch (error) {
      showMessage(error.message || 'Não foi possível carregar os clientes do AGF Core.', 'error');
      els.customerSelect.innerHTML = '<option value="">Falha ao carregar clientes</option>';
    }
  }

  window.addEventListener('agf:auth-ready', init);
})();
