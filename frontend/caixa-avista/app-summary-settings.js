'use strict';

function renderSummary() {
  const summary = state.summary || emptySummary();
  el.sideRevenue.textContent = formatCents(summary.revenueCents || 0);
  el.sideExpense.textContent = formatCents(summary.expenseCents || 0);
  el.sideBalance.textContent = formatCents(summary.balanceCents || 0);
  el.footerRevenue.textContent = formatCents(summary.revenueCents || 0);
  el.footerExpense.textContent = formatCents(summary.expenseCents || 0);
  el.footerBalance.textContent = formatCents(summary.balanceCents || 0);
  const byPayment = summary.byPayment || {};
  el.paymentBreakdown.innerHTML = PAYMENT_METHODS.map(method => (
    `<div class="payment-line"><span>${escapeHtml(shortPayment(method))}</span><strong>${formatCents(byPayment[method] || 0)}</strong></div>`
  )).join('');
}

function renderClose() {
  const summary = state.summary || emptySummary();
  el.closeOperationalTotal.textContent = formatCents(summary.balanceCents || 0);
  el.closePixPending.textContent = formatCents(summary.pixPendingCents || 0);
  el.btnOperationalClose.disabled = Boolean(state.operationalClosure) || ((summary.revenueCount || 0) + (summary.expenseCount || 0) === 0);
  el.btnOperationalClose.innerHTML = state.operationalClosure
    ? '<span class="material-symbols-rounded">lock</span>Movimento já fechado'
    : '<span class="material-symbols-rounded">lock</span>Fechar movimento operacional';
  updateReconciliationDifference();
  updateActionButton();
}

async function operationalClose() {
  if (state.operationalClosure) return;
  const pending = state.summary.pixPendingCents || 0;
  const message = pending > 0
    ? `Existem ${formatCents(pending)} em Pix pendentes. O fechamento operacional pode continuar e as pendências ficarão registradas. Continuar?`
    : 'Fechar o movimento operacional de hoje? Depois disso os lançamentos não poderão ser alterados.';
  if (!window.confirm(message)) return;

  setBusy(true, 'Fechando movimento...');
  try {
    const result = await repositoryOperationalClose(todayIso());
    state.operationalClosure = result.closure || result;
    state.entries.forEach(entry => {
      if (entry.date === todayIso() && entry.status !== 'EXCLUIDO') entry.closed = true;
    });
    persistEntriesIfLocal();
    persistClosureIfLocal(state.operationalClosure);
    renderAll();
    showStatus(el.closeStatus, 'Movimento operacional fechado e snapshot financeiro criado.', 'success');
  } catch (error) {
    showStatus(el.closeStatus, error.message || 'Não foi possível fechar o movimento.', 'error');
  } finally {
    setBusy(false);
  }
}

async function saveReconciliation() {
  if (!state.operationalClosure) {
    showStatus(el.closeStatus, 'Faça primeiro o fechamento do movimento operacional.', 'warning');
    return;
  }
  const cashCountedCents = Math.round(parseMoney(el.cashCounted.value) * 100);
  const pixCountedCents = Math.round(parseMoney(el.pixConfirmedCounted.value) * 100);
  const notes = el.reconciliationNotes.value.trim();

  setBusy(true, 'Salvando conferência...');
  try {
    const result = await repositoryReconcile({
      date: todayIso(), cashCountedCents, pixCountedCents, notes
    });
    state.operationalClosure = result.closure || result;
    persistClosureIfLocal(state.operationalClosure);
    renderClose();
    showStatus(el.closeStatus, 'Conferência financeira salva.', 'success');
  } catch (error) {
    showStatus(el.closeStatus, error.message || 'Não foi possível salvar a conferência.', 'error');
  } finally {
    setBusy(false);
  }
}

function updateReconciliationDifference() {
  const summary = state.summary || emptySummary();
  const expectedCash = Math.max(0, (summary.byPayment?.Dinheiro || 0) - (summary.expenseCents || 0));
  const expectedPix = summary.pixConfirmedCents || 0;
  const countedCash = Math.round(parseMoney(el.cashCounted?.value || '') * 100);
  const countedPix = Math.round(parseMoney(el.pixConfirmedCounted?.value || '') * 100);
  const cashDiff = countedCash - expectedCash;
  const pixDiff = countedPix - expectedPix;
  if (el.reconciliationDifference) {
    el.reconciliationDifference.textContent = `Dinheiro: ${formatSignedCents(cashDiff)} | Pix: ${formatSignedCents(pixDiff)}`;
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const focusable = modal.querySelector('input, select, textarea, button');
  setTimeout(() => focusable?.focus(), 20);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function fillSettingsForm() {
  el.settingApiUrl.value = state.settings.apiUrl || '';
  el.settingPixKey.value = state.settings.pixKey || '';
  el.settingPixName.value = state.settings.pixName || '';
  el.settingPixCity.value = state.settings.pixCity || 'FORTALEZA';
}

async function saveSettings() {
  const settings = {
    apiUrl: el.settingApiUrl.value.trim(),
    pixKey: el.settingPixKey.value.trim(),
    pixName: cleanDisplayName(el.settingPixName.value).toUpperCase(),
    pixCity: cleanDisplayName(el.settingPixCity.value).toUpperCase()
  };
  if (settings.apiUrl && !/^https:\/\/script\.google\.com\/macros\/s\//.test(settings.apiUrl)) {
    return showStatus(el.settingsStatus, 'Informe uma URL válida de Web App do Apps Script ou deixe vazio.', 'error');
  }
  state.settings = settings;
  localStorage.setItem(STORAGE.SETTINGS, JSON.stringify(settings));
  updateModePill();
  showStatus(el.settingsStatus, 'Configurações salvas.', 'success');
  setTimeout(() => { closeModal('settingsModal'); refreshAll(false); }, 450);
}

function getPixConfig() {
  const key = String(state.settings.pixKey || '').trim();
  const name = sanitizePixText(state.settings.pixName, 25);
  const city = sanitizePixText(state.settings.pixCity, 15);
  if (!key || !name || !city) throw new Error('Configure a chave Pix, o nome do recebedor e a cidade.');
  return { key, name, city };
}

function updateModePill() {
  const remote = isRemoteMode();
  el.modePill.textContent = remote ? 'CONECTADO' : 'HOMOLOGAÇÃO LOCAL';
}

function setBusy(value, text) {
  state.busy = value;
  el.loadingOverlay.classList.toggle('hidden', !value);
  if (text) el.loadingText.textContent = text;
}

function showStatus(node, message, type) {
  if (!node) return;
  node.textContent = message;
  node.className = `status-box show ${type || 'info'}`;
}

function hideStatus(node) {
  if (!node) return;
  node.className = 'status-box';
  node.textContent = '';
}

function formatCents(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function formatSignedCents(cents) {
  const sign = cents > 0 ? '+' : '';
  return sign + formatCents(cents);
}

function shortPayment(method) {
  return method.replace('Cartão de ', '').replace(/^./, char => char.toUpperCase());
}

function parseMoney(value) {
  const text = String(value ?? '').trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!text) return 0;
  let normalized = text;
  if (text.includes(',') && text.includes('.')) normalized = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) normalized = text.replace(',', '.');
  normalized = normalized.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}
