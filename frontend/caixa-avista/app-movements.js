'use strict';

function openExpenseModal() {
  if (state.operationalClosure) {
    showStatus(el.saleStatus, 'O movimento de hoje já foi fechado.', 'warning');
    return;
  }
  state.expenseAmountCents = 0;
  el.expenseAmountDisplay.textContent = formatCents(0);
  el.expenseCategory.value = '';
  el.expenseDescription.value = '';
  hideStatus(el.expenseStatus);
  openModal('expenseModal');
}

async function saveExpense() {
  const category = el.expenseCategory.value;
  const description = cleanDisplayName(el.expenseDescription.value);
  if (!category) return showStatus(el.expenseStatus, 'Selecione a categoria.', 'error');
  if (!description) return showStatus(el.expenseStatus, 'Informe uma descrição.', 'error');
  if (!(state.expenseAmountCents > 0)) return showStatus(el.expenseStatus, 'Digite o valor da despesa.', 'error');

  setBusy(true, 'Salvando despesa...');
  try {
    const result = await repositorySaveEntry({
      type: 'DESPESA',
      date: todayIso(),
      clientId: '',
      clientName: 'GAS SHOPPING METRO',
      objectCount: 0,
      amountCents: state.expenseAmountCents,
      paymentMethod: 'Dinheiro',
      pixStatus: '',
      expenseCategory: category,
      description
    });
    state.entries.push(sanitizeEntry(result.entry || result));
    persistEntriesIfLocal();
    state.summary = result.summary || buildSummary(state.entries, todayIso());
    closeModal('expenseModal');
    renderAll();
    showStatus(el.saleStatus, 'Despesa registrada com sucesso.', 'success');
  } catch (error) {
    showStatus(el.expenseStatus, error.message || 'Não foi possível salvar a despesa.', 'error');
  } finally {
    setBusy(false);
  }
}

function setMovementFilter(filter) {
  state.movementFilter = filter;
  renderEntries();
}

function renderEntries() {
  let entries = state.entries.filter(entry => entry.date === todayIso() && entry.status !== 'EXCLUIDO');
  if (state.movementFilter === 'pix-pending') {
    entries = entries.filter(entry => entry.paymentMethod === 'PIX' && entry.pixStatus === 'PENDENTE');
  }
  entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  if (!entries.length) {
    el.entriesList.innerHTML = '<div class="empty">Nenhum movimento encontrado para este filtro.</div>';
    return;
  }

  el.entriesList.innerHTML = entries.map(entry => {
    const isExpense = entry.type === 'DESPESA';
    const pixTag = entry.paymentMethod === 'PIX'
      ? `<span class="tag ${entry.pixStatus === 'PENDENTE' ? 'pix-pending' : 'pix-confirmed'}">Pix ${entry.pixStatus === 'PENDENTE' ? 'pendente' : 'confirmado'}</span>`
      : '';
    const action = entry.paymentMethod === 'PIX' && entry.pixStatus === 'PENDENTE' && !entry.closed
      ? `<button class="mini-btn" type="button" data-action="confirm-pix" data-entry-id="${escapeHtml(entry.id)}">Confirmar Pix</button>`
      : '';
    const deleteAction = !entry.closed
      ? `<button class="mini-btn" type="button" data-action="delete" data-entry-id="${escapeHtml(entry.id)}">Excluir</button>`
      : '';
    return `
      <article class="entry-card">
        <div class="entry-top">
          <div><div class="entry-client">${escapeHtml(isExpense ? entry.description : entry.clientName)}</div><div class="entry-meta"><span class="tag">${isExpense ? 'Despesa' : escapeHtml(entry.paymentMethod)}</span>${pixTag}${entry.objectCount > 0 ? `<span class="tag">${entry.objectCount} objeto${entry.objectCount > 1 ? 's' : ''}</span>` : ''}${entry.closed ? '<span class="tag">Fechado</span>' : ''}</div></div>
          <div class="entry-value">${isExpense ? '- ' : ''}${formatCents(entry.amountCents)}</div>
        </div>
        ${(action || deleteAction) ? `<div class="entry-actions">${action}${deleteAction}</div>` : ''}
      </article>`;
  }).join('');
}

async function onEntryAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const entry = state.entries.find(item => item.id === button.dataset.entryId);
  if (!entry) return;

  if (button.dataset.action === 'confirm-pix') {
    await updatePixStatus(entry, 'CONFIRMADO');
    return;
  }

  if (button.dataset.action === 'delete') {
    const confirmed = window.confirm('Excluir este lançamento?');
    if (!confirmed) return;
    await deleteEntry(entry);
  }
}

async function updatePixStatus(entry, status) {
  setBusy(true, 'Atualizando Pix...');
  try {
    const result = await repositoryUpdatePixStatus(entry.id, status);
    entry.pixStatus = status;
    state.summary = result.summary || buildSummary(state.entries, todayIso());
    persistEntriesIfLocal();
    renderAll();
    showStatus(el.movementStatus, 'Pix confirmado.', 'success');
  } catch (error) {
    showStatus(el.movementStatus, error.message || 'Não foi possível atualizar o Pix.', 'error');
  } finally {
    setBusy(false);
  }
}

async function deleteEntry(entry) {
  setBusy(true, 'Excluindo lançamento...');
  try {
    const result = await repositoryDeleteEntry(entry.id);
    entry.status = 'EXCLUIDO';
    state.summary = result.summary || buildSummary(state.entries, todayIso());
    persistEntriesIfLocal();
    renderAll();
    showStatus(el.movementStatus, 'Lançamento excluído.', 'success');
  } catch (error) {
    showStatus(el.movementStatus, error.message || 'Não foi possível excluir o lançamento.', 'error');
  } finally {
    setBusy(false);
  }
}

async function saveBatch() {
  const text = el.batchText.value.trim();
  if (!text) return showStatus(el.batchStatus, 'Cole pelo menos uma linha.', 'error');
  let drafts;
  try {
    drafts = parseBatch(text);
  } catch (error) {
    return showStatus(el.batchStatus, error.message, 'error');
  }

  setBusy(true, 'Salvando lote...');
  try {
    const result = await repositorySaveBatch(drafts);
    const savedEntries = (result.entries || result).map(sanitizeEntry);
    state.entries.push(...savedEntries);
    if (result.clients) state.clients = sanitizeClients(result.clients);
    state.summary = result.summary || buildSummary(state.entries, todayIso());
    persistClientsIfLocal();
    persistEntriesIfLocal();
    el.batchText.value = '';
    closeModal('batchModal');
    renderAll();
    showStatus(el.movementStatus, `${savedEntries.length} lançamentos salvos em lote.`, 'success');
  } catch (error) {
    showStatus(el.batchStatus, error.message || 'O lote não foi salvo.', 'error');
  } finally {
    setBusy(false);
  }
}

function parseBatch(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 100) throw new Error('O lote aceita no máximo 100 linhas por vez.');
  const allowed = new Map([
    ['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['debito', 'Cartão de débito'], ['cartao de debito', 'Cartão de débito'],
    ['credito', 'Cartão de crédito'], ['cartao de credito', 'Cartão de crédito']
  ]);

  return lines.map((line, index) => {
    const parts = line.split(';').map(part => part.trim());
    if (parts.length < 3) throw new Error(`Linha ${index + 1}: use cliente;valor;pagamento;objetos.`);
    const clientName = cleanDisplayName(parts[0]);
    const amount = parseMoney(parts[1]);
    const payment = allowed.get(normalizeText(parts[2]));
    const objectCount = Math.max(1, Number.parseInt(parts[3] || '1', 10) || 1);
    if (!clientName) throw new Error(`Linha ${index + 1}: cliente vazio.`);
    if (!(amount > 0)) throw new Error(`Linha ${index + 1}: valor inválido.`);
    if (!payment) throw new Error(`Linha ${index + 1}: pagamento inválido.`);
    return {
      type: 'RECEITA', date: todayIso(), clientName, clientId: '', objectCount,
      amountCents: Math.round(amount * 100), paymentMethod: payment,
      pixStatus: payment === 'PIX' ? 'CONFIRMADO' : '',
      description: `Atendimento de balcão - ${payment}`
    };
  });
}
