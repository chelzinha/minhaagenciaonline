'use strict';

function onClientInput() {
  if (state.selectedClient && el.clientInput.value !== state.selectedClient.name) {
    state.selectedClient = null;
  }
  renderSelectedClient();
  renderClientSuggestions();
  updateAddClientButton();
  updateActionButton();
}

function renderClientSuggestions() {
  const query = el.clientInput.value.trim();
  if (!query) {
    hideSuggestions();
    updateAddClientButton();
    return;
  }

  const results = searchClients(query).slice(0, 10);
  if (!results.length) {
    el.clientSuggestions.innerHTML = '<div class="no-result">Nenhum cadastro encontrado. Use o botão + para cadastrar.</div>';
  } else {
    el.clientSuggestions.innerHTML = results.map((client, index) => (
      `<button type="button" class="suggestion${index === 0 ? ' active' : ''}" role="option" data-client-id="${escapeHtml(client.id)}">${escapeHtml(client.name)}</button>`
    )).join('');
  }
  el.clientSuggestions.classList.remove('hidden');
  updateAddClientButton();
}

function hideSuggestions() {
  el.clientSuggestions.classList.add('hidden');
  el.clientSuggestions.innerHTML = '';
}

function onClientKeydown(event) {
  const options = Array.from(el.clientSuggestions.querySelectorAll('.suggestion'));
  if (!options.length) {
    if (event.key === 'Enter' && !el.btnAddClient.disabled) {
      event.preventDefault();
      addTypedClient();
    }
    return;
  }
  const current = options.findIndex(item => item.classList.contains('active'));
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = (current + delta + options.length) % options.length;
    options.forEach((item, index) => item.classList.toggle('active', index === next));
    options[next].scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const active = options[current >= 0 ? current : 0];
    if (active) selectClientById(active.dataset.clientId);
  }
}

function onSuggestionClick(event) {
  const button = event.target.closest('[data-client-id]');
  if (!button) return;
  selectClientById(button.dataset.clientId);
}

function selectClientById(id) {
  const client = state.clients.find(item => item.id === id);
  if (!client) return;
  state.selectedClient = client;
  el.clientInput.value = client.name;
  hideSuggestions();
  renderSelectedClient();
  updateAddClientButton();
  updateActionButton();
}

async function addTypedClient() {
  const name = cleanDisplayName(el.clientInput.value);
  if (name.length < 2) return;
  const normalized = normalizeText(name);
  const existing = state.clients.find(client => client.normalized === normalized);
  if (existing) {
    selectClientById(existing.id);
    showStatus(el.saleStatus, 'Esse cliente já estava cadastrado e foi selecionado.', 'info');
    return;
  }

  setBusy(true, 'Cadastrando cliente...');
  try {
    const saved = await repositorySaveClient(name);
    const client = sanitizeClient(saved.client || saved);
    state.clients.push(client);
    state.clients.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    persistClientsIfLocal();
    state.selectedClient = client;
    el.clientInput.value = client.name;
    hideSuggestions();
    renderSelectedClient();
    updateAddClientButton();
    updateActionButton();
    showStatus(el.saleStatus, 'Cliente cadastrado e selecionado.', 'success');
  } catch (error) {
    showStatus(el.saleStatus, error.message || 'Não foi possível cadastrar o cliente.', 'error');
  } finally {
    setBusy(false);
  }
}

function renderSelectedClient() {
  const selected = state.selectedClient;
  el.clientSelected.classList.toggle('hidden', !selected);
  if (selected) el.clientSelected.querySelector('span:last-child').textContent = selected.name;
  el.clientInput.setAttribute('aria-invalid', selected ? 'false' : (el.clientInput.value.trim() ? 'true' : 'false'));
}

function updateAddClientButton() {
  const name = cleanDisplayName(el.clientInput.value);
  const normalized = normalizeText(name);
  const exact = state.clients.some(client => client.normalized === normalized);
  el.btnAddClient.disabled = name.length < 2 || exact || Boolean(state.selectedClient);
}

function searchClients(query) {
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (!tokens.length) return [];

  return state.clients
    .filter(client => tokens.every(token => client.normalized.includes(token)))
    .map(client => ({ client, score: clientSearchScore(client.normalized, normalizedQuery, tokens) }))
    .sort((a, b) => a.score - b.score || a.client.name.localeCompare(b.client.name, 'pt-BR'))
    .map(item => item.client);
}

function clientSearchScore(name, query, tokens) {
  if (name === query) return 0;
  if (name.startsWith(query)) return 10 + name.length;
  const fullIndex = name.indexOf(query);
  if (fullIndex >= 0) return 100 + fullIndex + name.length;
  return 500 + tokens.reduce((sum, token) => sum + Math.max(0, name.indexOf(token)), 0) + name.length;
}

function changeQuantity(delta) {
  state.quantity = Math.max(1, Math.min(999, state.quantity + delta));
  renderQuantity();
}

function renderQuantity() { el.qtyValue.textContent = String(state.quantity); }

function bindKeypad(container, target) {
  container.addEventListener('click', event => {
    const key = event.target.closest('[data-key]');
    if (!key) return;
    updateCents(target, key.dataset.key);
  });
}

function updateCents(target, key) {
  const stateKey = target === 'expense' ? 'expenseAmountCents' : 'amountCents';
  let cents = state[stateKey];
  if (/^\d$/.test(key)) {
    cents = Math.min(999999999, (cents * 10) + Number(key));
  } else if (key === 'backspace') {
    cents = Math.floor(cents / 10);
  } else if (key === 'clear') {
    cents = 0;
  }
  state[stateKey] = cents;
  if (target === 'expense') {
    el.expenseAmountDisplay.textContent = formatCents(cents);
  } else {
    renderAmount();
    updateActionButton();
  }
}

function renderAmount() { el.amountDisplay.textContent = formatCents(state.amountCents); }

function updateActionButton() {
  const valid = Boolean(state.paymentMethod && state.selectedClient && state.amountCents > 0 && !state.operationalClosure);
  el.btnCompleteSale.disabled = !valid;
  const isPix = state.paymentMethod === 'PIX';
  el.btnCompleteSale.classList.toggle('pix', isPix);
  el.btnCompleteSale.querySelector('span:last-child').textContent = isPix ? 'Gerar cobrança Pix' : 'Registrar recebimento';
  el.btnCompleteSale.querySelector('.material-symbols-rounded').textContent = isPix ? 'qr_code_2' : 'check_circle';
}
