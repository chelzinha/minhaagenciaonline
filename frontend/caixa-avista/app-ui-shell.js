'use strict';

async function boot() {
  cacheElements();
  bindEvents();
  setDateLabels();
  fillSettingsForm();
  await refreshAll(true);
}

function cacheElements() {
  const ids = [
    'heroGreeting', 'heroDate', 'modePill', 'btnSettings', 'btnRefresh',
    'paymentGrid', 'clientCombobox', 'clientInput', 'btnAddClient', 'clientSuggestions', 'clientSelected',
    'btnQtyMinus', 'btnQtyPlus', 'qtyValue', 'amountDisplay', 'saleKeypad', 'btnCompleteSale', 'btnOpenExpense', 'saleStatus',
    'summaryDate', 'sideRevenue', 'sideExpense', 'sideBalance', 'paymentBreakdown',
    'entriesList', 'movementStatus', 'btnFilterAll', 'btnFilterPixPending', 'btnBatch',
    'closeOperationalTotal', 'closePixPending', 'btnOperationalClose', 'cashCounted', 'pixConfirmedCounted',
    'reconciliationNotes', 'reconciliationDifference', 'btnReconcile', 'closeStatus',
    'footerRevenue', 'footerExpense', 'footerBalance',
    'pixModal', 'pixModalAmount', 'pixQr', 'pixCode', 'btnCopyPix', 'btnSharePix', 'btnPixConfirmed', 'btnPixPending', 'pixStatus',
    'expenseModal', 'expenseCategory', 'expenseDescription', 'expenseAmountDisplay', 'expenseKeypad', 'btnSaveExpense', 'expenseStatus',
    'batchModal', 'batchText', 'btnSaveBatch', 'batchStatus',
    'settingsModal', 'settingApiUrl', 'settingPixKey', 'settingPixName', 'settingPixCity', 'btnSaveSettings', 'settingsStatus',
    'loadingOverlay', 'loadingText', 'viewSale', 'viewMovements', 'viewClose'
  ];
  ids.forEach(id => { el[id] = document.getElementById(id); });
  el.viewTabs = Array.from(document.querySelectorAll('.view-tab'));
  el.closeModalButtons = Array.from(document.querySelectorAll('[data-close-modal]'));
}

function bindEvents() {
  el.viewTabs.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  el.btnSettings.addEventListener('click', () => openModal('settingsModal'));
  el.btnRefresh.addEventListener('click', () => refreshAll(false));
  el.closeModalButtons.forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });

  el.paymentGrid.addEventListener('click', onPaymentClick);
  el.clientInput.addEventListener('input', onClientInput);
  el.clientInput.addEventListener('focus', renderClientSuggestions);
  el.clientInput.addEventListener('keydown', onClientKeydown);
  el.clientSuggestions.addEventListener('click', onSuggestionClick);
  el.btnAddClient.addEventListener('click', addTypedClient);
  document.addEventListener('click', event => {
    if (!el.clientCombobox.contains(event.target)) hideSuggestions();
  });

  el.btnQtyMinus.addEventListener('click', () => changeQuantity(-1));
  el.btnQtyPlus.addEventListener('click', () => changeQuantity(1));
  bindKeypad(el.saleKeypad, 'sale');
  bindKeypad(el.expenseKeypad, 'expense');
  el.btnCompleteSale.addEventListener('click', completeSale);
  el.btnOpenExpense.addEventListener('click', openExpenseModal);

  el.btnCopyPix.addEventListener('click', copyPixCode);
  el.btnSharePix.addEventListener('click', sharePix);
  el.btnPixConfirmed.addEventListener('click', () => savePixDraft('CONFIRMADO'));
  el.btnPixPending.addEventListener('click', () => savePixDraft('PENDENTE'));

  el.btnSaveExpense.addEventListener('click', saveExpense);
  el.btnFilterAll.addEventListener('click', () => setMovementFilter('all'));
  el.btnFilterPixPending.addEventListener('click', () => setMovementFilter('pix-pending'));
  el.btnBatch.addEventListener('click', () => openModal('batchModal'));
  el.btnSaveBatch.addEventListener('click', saveBatch);
  el.entriesList.addEventListener('click', onEntryAction);

  el.btnOperationalClose.addEventListener('click', operationalClose);
  el.cashCounted.addEventListener('input', updateReconciliationDifference);
  el.pixConfirmedCounted.addEventListener('input', updateReconciliationDifference);
  el.btnReconcile.addEventListener('click', saveReconciliation);

  el.btnSaveSettings.addEventListener('click', saveSettings);

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const open = document.querySelector('.modal-backdrop:not(.hidden)');
      if (open) closeModal(open.id);
    }
  });
}

async function refreshAll(initial) {
  setBusy(true, initial ? 'Preparando o caixa...' : 'Atualizando...');
  try {
    const response = await repositoryInit();
    state.clients = sanitizeClients(response.clients || []);
    ensureWalkInClient();
    state.entries = sanitizeEntries(response.entries || []);
    state.summary = response.summary || buildSummary(state.entries, todayIso());
    state.operationalClosure = response.closure || getLocalClosure(todayIso());

    if (response.pix) {
      state.settings = {
        ...state.settings,
        pixKey: response.pix.key || state.settings.pixKey,
        pixName: response.pix.name || state.settings.pixName,
        pixCity: response.pix.city || state.settings.pixCity
      };
    }

    renderAll();
    showStatus(el.saleStatus, initial ? 'Caixa pronto para uso.' : 'Dados atualizados.', 'success');
  } catch (error) {
    console.error('[CAIXA_AVISTA][refresh]', error);
    showStatus(el.saleStatus, error.message || 'Não foi possível carregar os dados.', 'error');
  } finally {
    setBusy(false);
  }
}

function renderAll() {
  renderPaymentSelection();
  renderSelectedClient();
  renderQuantity();
  renderAmount();
  renderSummary();
  renderEntries();
  renderClose();
  updateActionButton();
  updateModePill();
}

function setDateLabels() {
  const date = new Date();
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).format(date);
  el.heroDate.textContent = capitalize(formatted);
  el.summaryDate.textContent = new Intl.DateTimeFormat('pt-BR').format(date);
}

function setView(view) {
  state.currentView = view;
  el.viewSale.classList.toggle('hidden', view !== 'sale');
  el.viewMovements.classList.toggle('hidden', view !== 'movements');
  el.viewClose.classList.toggle('hidden', view !== 'close');
  el.viewTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  const labels = { sale: 'Novo atendimento', movements: 'Movimentos do dia', close: 'Fechamento do dia' };
  el.heroGreeting.textContent = labels[view] || 'Caixa à Vista';
  if (view === 'movements') renderEntries();
  if (view === 'close') renderClose();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onPaymentClick(event) {
  const button = event.target.closest('[data-method]');
  if (!button) return;
  state.paymentMethod = button.dataset.method;
  renderPaymentSelection();
  updateActionButton();
}

function renderPaymentSelection() {
  el.paymentGrid.querySelectorAll('[data-method]').forEach(btn => {
    const selected = btn.dataset.method === state.paymentMethod;
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}
