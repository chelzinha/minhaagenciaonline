(function () {
  'use strict';

  const state = {
    customers: [],
    modules: [],
    currentId: '',
    busy: false,
    searchTimer: null
  };

  const $ = (selector) => document.querySelector(selector);
  const els = {};

  function cacheElements() {
    els.currentUser = $('#currentUser');
    els.customerCount = $('#customerCount');
    els.customerList = $('#customerList');
    els.searchInput = $('#searchInput');
    els.statusFilter = $('#statusFilter');
    els.newCustomerBtn = $('#newCustomerBtn');
    els.emptyState = $('#emptyState');
    els.customerForm = $('#customerForm');
    els.formEyebrow = $('#formEyebrow');
    els.formTitle = $('#formTitle');
    els.customerId = $('#customerId');
    els.formMessage = $('#formMessage');
    els.moduleGrid = $('#moduleGrid');
    els.cancelBtn = $('#cancelBtn');
    els.saveBtn = $('#saveBtn');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function statusLabel(status) {
    return {
      ACTIVE: 'Ativo',
      PROSPECT: 'Prospect',
      SUSPENDED: 'Suspenso',
      INACTIVE: 'Inativo'
    }[status] || status || '';
  }

  function showMessage(message, type) {
    els.formMessage.hidden = !message;
    els.formMessage.textContent = message || '';
    els.formMessage.className = 'message ' + (type || '');
  }

  function setBusy(value) {
    state.busy = Boolean(value);
    els.saveBtn.disabled = state.busy;
    els.newCustomerBtn.disabled = state.busy;
    els.saveBtn.textContent = state.busy ? 'Salvando...' : 'Salvar cliente';
  }

  function customerDisplayName(customer) {
    return customer.trade_name || customer.legal_name || 'Cliente';
  }

  function renderCustomerList() {
    els.customerCount.textContent = String(state.customers.length);
    if (!state.customers.length) {
      els.customerList.innerHTML = '<div class="no-results">Nenhum cliente encontrado.</div>';
      return;
    }

    els.customerList.innerHTML = state.customers.map((customer) => {
      const active = customer.id === state.currentId ? ' active' : '';
      const statusClass = String(customer.status || '').toLowerCase();
      const document = customer.document_number ? ` • ${escapeHtml(customer.document_number)}` : '';
      const moduleCount = Number(customer.active_modules || 0);
      return `
        <button type="button" class="customer-item${active}" data-customer-id="${escapeHtml(customer.id)}">
          <strong>${escapeHtml(customerDisplayName(customer))}</strong>
          <span>${escapeHtml(customer.legal_name || '')}${document}</span>
          <div class="customer-meta">
            <span class="badge badge-${escapeHtml(statusClass)}">${escapeHtml(statusLabel(customer.status))}</span>
            <span>${moduleCount} módulo${moduleCount === 1 ? '' : 's'}</span>
          </div>
        </button>`;
    }).join('');

    els.customerList.querySelectorAll('[data-customer-id]').forEach((button) => {
      button.addEventListener('click', () => openCustomer(button.dataset.customerId));
    });
  }

  function renderModules(assignments) {
    const statusByCode = new Map((assignments || []).map((item) => [item.code, item.customer_status]));
    els.moduleGrid.innerHTML = state.modules.map((module) => {
      const checked = ['ACTIVE', 'TRIAL'].includes(statusByCode.get(module.code)) ? ' checked' : '';
      return `
        <label class="module-card">
          <input type="checkbox" name="modules" value="${escapeHtml(module.code)}"${checked} />
          <span>
            <strong>${escapeHtml(module.name)}</strong>
            <small>${escapeHtml(module.description || module.category || '')}</small>
          </span>
        </label>`;
    }).join('');
  }

  function resetForm() {
    els.customerForm.reset();
    els.customerForm.elements.status.value = 'ACTIVE';
    els.customerForm.elements.documentType.value = 'CNPJ';
    renderModules([]);
    showMessage('', '');
  }

  function showEditor() {
    els.emptyState.hidden = true;
    els.customerForm.hidden = false;
  }

  function hideEditor() {
    state.currentId = '';
    els.customerForm.hidden = true;
    els.emptyState.hidden = false;
    renderCustomerList();
  }

  function startNewCustomer() {
    state.currentId = '';
    resetForm();
    showEditor();
    els.formEyebrow.textContent = 'Novo cliente';
    els.formTitle.textContent = 'Cadastrar cliente';
    els.customerId.textContent = '';
    renderCustomerList();
    els.customerForm.elements.legalName.focus();
  }

  function fillForm(customer, modules) {
    const form = els.customerForm.elements;
    form.legalName.value = customer.legal_name || '';
    form.tradeName.value = customer.trade_name || '';
    form.status.value = customer.status || 'ACTIVE';
    form.documentType.value = customer.document_type || '';
    form.documentNumber.value = customer.document_number || '';
    form.email.value = customer.email || '';
    form.phone.value = customer.phone || '';
    form.postalCode.value = customer.postal_code || '';
    form.addressLine1.value = customer.address_line1 || '';
    form.addressNumber.value = customer.address_number || '';
    form.addressComplement.value = customer.address_complement || '';
    form.district.value = customer.district || '';
    form.city.value = customer.city || '';
    form.state.value = customer.state || '';
    form.notes.value = customer.notes || '';
    renderModules(modules || []);
  }

  async function openCustomer(id) {
    if (!id || state.busy) return;
    state.currentId = id;
    renderCustomerList();
    showEditor();
    showMessage('', '');
    els.formEyebrow.textContent = 'Cliente';
    els.formTitle.textContent = 'Carregando...';
    els.customerId.textContent = id;
    try {
      const data = await window.AgfCore.getCustomer(id);
      fillForm(data.customer, data.modules);
      els.formTitle.textContent = customerDisplayName(data.customer);
    } catch (error) {
      showMessage(error.message || 'Não foi possível carregar o cliente.', 'error');
    }
  }

  function buildQuery() {
    const params = new URLSearchParams();
    const q = els.searchInput.value.trim();
    const status = els.statusFilter.value.trim();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    params.set('limit', '100');
    return params.toString();
  }

  async function loadCustomers() {
    els.customerList.innerHTML = '<div class="loading">Carregando clientes...</div>';
    try {
      const data = await window.AgfCore.listCustomers(buildQuery());
      state.customers = data.customers || [];
      renderCustomerList();
    } catch (error) {
      state.customers = [];
      els.customerCount.textContent = '0';
      els.customerList.innerHTML = `<div class="no-results">${escapeHtml(error.message || 'Não foi possível carregar os clientes.')}</div>`;
    }
  }

  function formPayload() {
    const form = new FormData(els.customerForm);
    return {
      legalName: form.get('legalName'),
      tradeName: form.get('tradeName'),
      status: form.get('status'),
      documentType: form.get('documentType'),
      documentNumber: form.get('documentNumber'),
      email: form.get('email'),
      phone: form.get('phone'),
      postalCode: form.get('postalCode'),
      addressLine1: form.get('addressLine1'),
      addressNumber: form.get('addressNumber'),
      addressComplement: form.get('addressComplement'),
      district: form.get('district'),
      city: form.get('city'),
      state: form.get('state'),
      country: 'BR',
      notes: form.get('notes')
    };
  }

  function selectedModules() {
    return Array.from(els.customerForm.querySelectorAll('input[name="modules"]:checked')).map((input) => input.value);
  }

  async function saveCustomer(event) {
    event.preventDefault();
    if (state.busy) return;
    setBusy(true);
    showMessage('', '');

    try {
      const payload = formPayload();
      const saved = state.currentId
        ? await window.AgfCore.updateCustomer(state.currentId, payload)
        : await window.AgfCore.createCustomer(payload);

      state.currentId = saved.customer.id;
      const withModules = await window.AgfCore.setCustomerModules(state.currentId, selectedModules());
      fillForm(withModules.customer, withModules.modules);
      els.formEyebrow.textContent = 'Cliente';
      els.formTitle.textContent = customerDisplayName(withModules.customer);
      els.customerId.textContent = withModules.customer.id;
      showMessage('Cadastro salvo com sucesso.', 'ok');
      await loadCustomers();
    } catch (error) {
      showMessage(error.message || 'Não foi possível salvar o cadastro.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function boot() {
    cacheElements();
    const user = window.AgfAuth && window.AgfAuth.getCachedUser ? window.AgfAuth.getCachedUser() : null;
    els.currentUser.textContent = user ? (user.displayName || user.username || '') : '';

    els.newCustomerBtn.addEventListener('click', startNewCustomer);
    els.cancelBtn.addEventListener('click', hideEditor);
    els.customerForm.addEventListener('submit', saveCustomer);
    els.statusFilter.addEventListener('change', loadCustomers);
    els.searchInput.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(loadCustomers, 300);
    });

    try {
      const data = await window.AgfCore.listModules();
      state.modules = (data.modules || []).filter((module) => Number(module.active) === 1);
      renderModules([]);
      await loadCustomers();
    } catch (error) {
      els.customerList.innerHTML = `<div class="no-results">${escapeHtml(error.message || 'AGF Core indisponível.')}</div>`;
    }
  }

  window.addEventListener('agf:auth-ready', boot, { once: true });
})();
