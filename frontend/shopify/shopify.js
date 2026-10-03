(function () {
  'use strict';

  const state = {
    initialized: false,
    customers: [],
    selectedCustomerId: '',
    selectedShop: '',
    selectedOrderId: '',
    statusFilter: '',
    search: '',
    offset: 0,
    total: 0,
    importing: false,
    autoImported: {}
  };

  const PAGE_SIZE = 50;
  const MAX_IMPORT_ROUNDS = 20;

  // tone: ok | info | warn | error | muted
  const STATUS_META = {
    AGUARDANDO_PAGAMENTO: { label: 'Aguardando pagamento', tone: 'muted' },
    AGUARDANDO_XML: { label: 'Aguardando XML', tone: 'info' },
    DADOS_INCOMPLETOS: { label: 'Dados incompletos', tone: 'warn' },
    XML_VINCULADO: { label: 'XML vinculado', tone: 'info' },
    FISCAL_COM_ERRO: { label: 'Erro fiscal', tone: 'error' },
    PRONTO_PARA_EMITIR: { label: 'Pronto para emitir', tone: 'ok' },
    EMITINDO: { label: 'Emitindo', tone: 'info' },
    ETIQUETA_EMITIDA: { label: 'Etiqueta emitida', tone: 'ok' },
    RASTREIO_PENDENTE: { label: 'Rastreio pendente', tone: 'warn' },
    RASTREIO_SINCRONIZADO: { label: 'Rastreio enviado', tone: 'ok' },
    ERRO_RASTREIO: { label: 'Erro no rastreio', tone: 'error' },
    CANCELADO: { label: 'Cancelado', tone: 'muted' },
    SEM_ENVIO: { label: 'Sem envio', tone: 'muted' },
    ENVIADO_FORA_AGF: { label: 'Enviado fora do AGF', tone: 'muted' }
  };
  const STATUS_ORDER = Object.keys(STATUS_META);

  let searchTimer = null;

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
    els.importOrdersBtn = document.getElementById('importOrdersBtn');
    els.ordersToolbar = document.getElementById('ordersToolbar');
    els.ordersFilters = document.getElementById('ordersFilters');
    els.ordersSearch = document.getElementById('ordersSearch');
    els.ordersSyncInfo = document.getElementById('ordersSyncInfo');
    els.ordersMoreBtn = document.getElementById('ordersMoreBtn');
    els.ordersShopLabel = document.getElementById('ordersShopLabel');
    els.ordersEmpty = document.getElementById('ordersEmpty');
    els.ordersList = document.getElementById('ordersList');
    els.orderDetailCard = document.getElementById('orderDetailCard');
    els.orderDetailTitle = document.getElementById('orderDetailTitle');
    els.orderDetailContent = document.getElementById('orderDetailContent');
    els.closeOrderDetailBtn = document.getElementById('closeOrderDetailBtn');
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

  function appendText(parent, tag, text, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text == null || text === '' ? '—' : String(text);
    parent.appendChild(node);
    return node;
  }

  function detailBlock(title, fields) {
    const block = document.createElement('section');
    block.className = 'detail-block';
    appendText(block, 'h3', title);

    const grid = document.createElement('div');
    grid.className = 'detail-grid';

    for (const field of fields) {
      const item = document.createElement('div');
      item.className = 'detail-field';
      appendText(item, 'span', field.label, 'detail-label');
      appendText(item, 'strong', field.value, 'detail-value');
      grid.appendChild(item);
    }

    block.appendChild(grid);
    return block;
  }

  function closeOrderDetail() {
    state.selectedOrderId = '';
    els.orderDetailCard.hidden = true;
    els.orderDetailContent.innerHTML = '';
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
    state.statusFilter = '';
    state.search = '';
    state.offset = 0;
    state.total = 0;
    els.refreshOrdersBtn.disabled = true;
    els.importOrdersBtn.disabled = true;
    els.ordersShopLabel.textContent = 'Selecione uma loja vinculada para carregar os pedidos.';
    els.ordersToolbar.hidden = true;
    els.ordersSyncInfo.hidden = true;
    els.ordersSearch.value = '';
    els.ordersFilters.innerHTML = '';
    els.ordersMoreBtn.hidden = true;
    els.ordersList.innerHTML = '';
    els.ordersList.hidden = true;
    els.ordersEmpty.hidden = false;
    els.ordersEmpty.textContent = 'Nenhuma loja selecionada.';
    closeOrderDetail();
  }

  function statusMeta(code) {
    return STATUS_META[code] || { label: statusLabel(code), tone: 'muted' };
  }

  function createBadge(code) {
    const meta = statusMeta(code);
    const badge = document.createElement('span');
    badge.className = 'agf-badge agf-badge-' + meta.tone;
    badge.textContent = meta.label;
    return badge;
  }

  function renderFilters(counts) {
    els.ordersFilters.innerHTML = '';
    const total = Object.values(counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);

    const chips = [{ code: '', label: 'Todos', count: total }].concat(
      STATUS_ORDER
        .filter((code) => counts && counts[code])
        .map((code) => ({ code, label: statusMeta(code).label, count: counts[code] }))
    );

    for (const chip of chips) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip' + (state.statusFilter === chip.code ? ' active' : '');
      button.setAttribute('aria-pressed', state.statusFilter === chip.code ? 'true' : 'false');
      button.textContent = chip.label + ' (' + chip.count + ')';
      button.addEventListener('click', () => {
        if (state.statusFilter === chip.code) return;
        state.statusFilter = chip.code;
        loadOrders();
      });
      els.ordersFilters.appendChild(button);
    }
  }

  function renderSyncInfo(sync) {
    if (!sync) {
      els.ordersSyncInfo.hidden = true;
      return;
    }
    let text = sync.lastOrdersSyncAt
      ? 'Última importação: ' + formatDate(sync.lastOrdersSyncAt)
      : 'Esta loja ainda não teve pedidos importados.';
    if (sync.syncing) text += ' · importação em andamento';
    els.ordersSyncInfo.textContent = text;
    els.ordersSyncInfo.hidden = false;
  }

  function emptyOrdersText() {
    if (state.search || state.statusFilter) return 'Nenhum pedido encontrado com esse filtro.';
    return 'Nenhum pedido importado ainda. Clique em "Importar da Shopify".';
  }

  function renderOrders(orders, append) {
    if (!append) els.ordersList.innerHTML = '';

    if (!orders.length && !append) {
      els.ordersList.hidden = true;
      els.ordersEmpty.hidden = false;
      els.ordersEmpty.textContent = emptyOrdersText();
      els.ordersMoreBtn.hidden = true;
      closeOrderDetail();
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
      const titleLine = document.createElement('div');
      titleLine.className = 'order-title';
      const number = document.createElement('strong');
      number.textContent = order.name || order.id;
      titleLine.append(number, createBadge(order.agfStatus));
      const date = document.createElement('span');
      const place = [order.recipientName, [order.city, order.provinceCode].filter(Boolean).join('/')]
        .filter(Boolean)
        .join(' · ');
      date.textContent = formatDate(order.createdAt) + (place ? ' · ' + place : '');
      identity.append(titleLine, date);

      const total = document.createElement('strong');
      total.className = 'order-total';
      total.textContent = formatMoney(order.total);

      header.append(identity, total);
      row.appendChild(header);

      if (order.alert) appendText(row, 'div', order.alert, 'order-alert');
      if (order.statusReason) appendText(row, 'div', order.statusReason, 'order-reason');

      const status = document.createElement('div');
      status.className = 'order-statuses';
      const financial = document.createElement('span');
      financial.append('Financeiro: ');
      appendText(financial, 'strong', statusLabel(order.financialStatus));
      const fulfillment = document.createElement('span');
      fulfillment.append('Expedição Shopify: ');
      appendText(fulfillment, 'strong', statusLabel(order.fulfillmentStatus));
      const shipping = document.createElement('span');
      shipping.append('Frete: ');
      appendText(shipping, 'strong', order.shippingTitle || 'Não informado');
      status.append(financial, fulfillment, shipping);

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

      const actions = document.createElement('div');
      actions.className = 'order-actions';
      const detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.className = 'btn-secondary';
      detailBtn.textContent = 'Abrir pedido';
      detailBtn.addEventListener('click', () => loadOrderDetail(order.id, detailBtn));
      actions.appendChild(detailBtn);

      row.append(status, items, actions);
      els.ordersList.appendChild(row);
    }

    const shown = els.ordersList.children.length;
    els.ordersMoreBtn.hidden = shown >= state.total;
  }

  function renderOrderDetail(data) {
    const order = data.order || {};
    const draft = data.shipmentDraft || {};
    const recipient = draft.recipient || {};
    const address = draft.address || {};
    const shipping = draft.shipping || {};
    const packageData = draft.package || {};
    const documentData = recipient.document || null;

    els.orderDetailTitle.textContent = (order.name || 'Pedido') + ' · prévia de expedição';
    els.orderDetailContent.innerHTML = '';

    const statusBlock = detailBlock('Pedido', [
      { label: 'Criado em', value: formatDate(order.createdAt) },
      { label: 'Financeiro', value: statusLabel(order.financialStatus) },
      { label: 'Expedição', value: statusLabel(order.fulfillmentStatus) },
      { label: 'Total', value: formatMoney(order.total) },
      { label: 'Peso total', value: packageData.weightGrams ? packageData.weightGrams + ' g' : 'Não informado' },
      { label: 'Dimensões', value: packageData.dimensions ? String(packageData.dimensions) : 'Não fornecidas pela Shopify' }
    ]);

    const documentLabel = documentData
      ? ((documentData.type ? documentData.type + ': ' : '') + (documentData.value || documentData.digits || '—'))
      : 'Não encontrado';

    const recipientBlock = detailBlock('Destinatário', [
      { label: 'Nome', value: recipient.name || 'Não informado' },
      { label: 'CPF/CNPJ', value: documentLabel },
      { label: 'E-mail', value: recipient.email || 'Não informado' },
      { label: 'Telefone', value: recipient.phone || 'Não informado' }
    ]);

    const addressBlock = detailBlock('Endereço de entrega', [
      { label: 'Endereço', value: address.address1 || 'Não informado' },
      { label: 'Complemento', value: address.address2 || '—' },
      { label: 'Cidade', value: address.city || 'Não informado' },
      { label: 'UF', value: address.provinceCode || address.province || 'Não informado' },
      { label: 'CEP', value: address.postalCode || 'Não informado' },
      { label: 'País', value: address.countryCode || address.country || 'Não informado' }
    ]);

    const shippingBlock = detailBlock('Frete Shopify', [
      { label: 'Opção', value: shipping.title || 'Não informado' },
      { label: 'Código', value: shipping.code || '—' },
      { label: 'Origem da tarifa', value: shipping.source || '—' },
      { label: 'Valor do frete', value: formatMoney(shipping.price) }
    ]);

    const itemsBlock = document.createElement('section');
    itemsBlock.className = 'detail-block detail-block-wide';
    appendText(itemsBlock, 'h3', 'Itens');
    const itemsList = document.createElement('div');
    itemsList.className = 'detail-items';
    const items = Array.isArray(draft.items) ? draft.items : [];

    if (!items.length) {
      appendText(itemsList, 'div', 'Nenhum item retornado.', 'detail-item');
    } else {
      for (const item of items) {
        const itemRow = document.createElement('div');
        itemRow.className = 'detail-item';
        const itemMain = document.createElement('div');
        appendText(itemMain, 'strong', item.quantity + '× ' + (item.name || item.title || 'Item'));
        appendText(itemMain, 'span', item.sku ? 'SKU ' + item.sku : 'SKU não informado', 'detail-item-meta');
        appendText(itemRow, 'strong', formatMoney(item.unitPrice), 'detail-item-price');
        itemRow.prepend(itemMain);
        itemsList.appendChild(itemRow);
      }
    }
    itemsBlock.appendChild(itemsList);

    const warning = document.createElement('div');
    warning.className = 'detail-warning';
    warning.textContent = 'Esta tela apenas confere os dados recebidos da Shopify. Ainda não cria PPN, PLP ou etiqueta nos Correios.';

    els.orderDetailContent.append(statusBlock, recipientBlock, addressBlock, shippingBlock, itemsBlock, warning);
    els.orderDetailCard.hidden = false;
    els.orderDetailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadOrderDetail(orderId, button) {
    if (!state.selectedShop || !orderId) return;

    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Abrindo...';
    state.selectedOrderId = orderId;

    try {
      const data = await window.AgfShopify.getOrder(state.selectedShop, orderId);
      renderOrderDetail(data);
    } catch (error) {
      showMessage(error.message || 'Não foi possível abrir o pedido.', 'error');
      closeOrderDetail();
    } finally {
      button.disabled = false;
      button.textContent = previous;
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

  async function loadOrders(shopOverride, options) {
    const opts = options || {};
    const shop = shopOverride || state.selectedShop;
    if (!shop) {
      resetOrders();
      return;
    }

    if (state.selectedShop !== shop) {
      closeOrderDetail();
      state.statusFilter = '';
      state.search = '';
      els.ordersSearch.value = '';
    }
    state.selectedShop = shop;
    state.offset = opts.append ? state.offset + PAGE_SIZE : 0;

    els.ordersShopLabel.textContent = shop + ' · pedidos salvos na Plataforma AGF (últimos 60 dias)';
    els.refreshOrdersBtn.disabled = true;
    els.importOrdersBtn.disabled = state.importing;
    els.ordersMoreBtn.disabled = true;

    if (!opts.append) {
      els.ordersEmpty.hidden = false;
      els.ordersEmpty.textContent = 'Carregando pedidos...';
      els.ordersList.hidden = true;
    }

    try {
      const data = await window.AgfShopify.listLocalOrders(shop, {
        status: state.statusFilter,
        q: state.search,
        limit: PAGE_SIZE,
        offset: state.offset
      });
      if (state.selectedShop !== shop) return;

      state.total = Number(data.total || 0);
      els.ordersToolbar.hidden = false;
      renderFilters(data.statusCounts || {});
      renderSyncInfo(data.sync);
      renderOrders(Array.isArray(data.orders) ? data.orders : [], Boolean(opts.append));

      const neverImported = data.sync && !data.sync.lastOrdersSyncAt && !data.sync.syncing;
      if (neverImported && !state.autoImported[shop] && !state.importing) {
        state.autoImported[shop] = true;
        importOrders();
      }
    } catch (error) {
      if (!opts.append) {
        els.ordersList.hidden = true;
        els.ordersEmpty.hidden = false;
        els.ordersEmpty.textContent = error.message || 'Não foi possível carregar os pedidos.';
      } else {
        state.offset = Math.max(state.offset - PAGE_SIZE, 0);
        showMessage(error.message || 'Não foi possível carregar mais pedidos.', 'error');
      }
    } finally {
      els.refreshOrdersBtn.disabled = false;
      els.importOrdersBtn.disabled = state.importing;
      els.ordersMoreBtn.disabled = false;
    }
  }

  async function importOrders() {
    const shop = state.selectedShop;
    if (!shop || state.importing) return;

    state.importing = true;
    els.importOrdersBtn.disabled = true;
    const previous = els.importOrdersBtn.textContent;
    els.importOrdersBtn.textContent = 'Importando...';

    let inserted = 0;
    let updated = 0;
    let complete = false;

    try {
      for (let round = 1; round <= MAX_IMPORT_ROUNDS; round += 1) {
        showMessage('Importando pedidos da Shopify... ' + (inserted + updated) + ' processados.');
        const result = await window.AgfShopify.syncOrders(shop);
        inserted += Number(result.inserted || 0);
        updated += Number(result.updated || 0);
        if (result.complete) {
          complete = true;
          break;
        }
        if (result.partialReason === 'THROTTLED') await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (complete) {
        const summary = inserted + ' novo(s), ' + updated + ' atualizado(s).';
        showMessage('Importação concluída: ' + summary, 'success');
      } else {
        showMessage('Importação parcial: ' + (inserted + updated) + ' pedidos processados. Clique em "Importar da Shopify" para continuar.', 'error');
      }
    } catch (error) {
      const busy = error.status === 409;
      showMessage(busy
        ? 'Já existe uma importação em andamento para esta loja. Aguarde e clique em "Atualizar lista".'
        : (error.message || 'Não foi possível importar os pedidos.'), 'error');
    } finally {
      state.importing = false;
      els.importOrdersBtn.textContent = previous;
      els.importOrdersBtn.disabled = false;
      if (state.selectedShop === shop) await loadOrders(shop);
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
    els.importOrdersBtn.addEventListener('click', () => importOrders());
    els.ordersMoreBtn.addEventListener('click', () => loadOrders(null, { append: true }));
    els.ordersSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const value = String(els.ordersSearch.value || '').trim();
        if (value === state.search) return;
        state.search = value;
        loadOrders();
      }, 350);
    });
    els.closeOrderDetailBtn.addEventListener('click', closeOrderDetail);
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
