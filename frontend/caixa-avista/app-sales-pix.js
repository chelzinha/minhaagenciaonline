'use strict';

async function completeSale() {
  const validation = validateSaleDraft();
  if (!validation.ok) {
    showStatus(el.saleStatus, validation.message, 'error');
    return;
  }

  const draft = buildSaleDraft();
  if (state.paymentMethod === 'PIX') {
    try {
      const pixConfig = getPixConfig();
      state.currentPixPayload = buildPixPayload({
        key: pixConfig.key,
        name: pixConfig.name,
        city: pixConfig.city,
        amountCents: state.amountCents,
        txid: '***'
      });
      state.currentPixDraft = draft;
      renderPixModal();
      openModal('pixModal');
    } catch (error) {
      showStatus(el.saleStatus, error.message || 'Não foi possível gerar a cobrança Pix.', 'error');
      openModal('settingsModal');
    }
    return;
  }

  await saveEntryAndReset(draft);
}

function validateSaleDraft() {
  if (!state.paymentMethod) return { ok: false, message: 'Selecione a forma de pagamento.' };
  if (!state.selectedClient) return { ok: false, message: 'Selecione um cliente cadastrado ou use o botão +.' };
  if (!(state.amountCents > 0)) return { ok: false, message: 'Digite um valor maior que zero.' };
  if (state.operationalClosure) return { ok: false, message: 'O movimento de hoje já foi fechado.' };
  return { ok: true };
}

function buildSaleDraft() {
  return {
    type: 'RECEITA',
    date: todayIso(),
    clientId: state.selectedClient.id,
    clientName: state.selectedClient.name,
    objectCount: state.quantity,
    amountCents: state.amountCents,
    paymentMethod: state.paymentMethod,
    pixStatus: state.paymentMethod === 'PIX' ? 'PENDENTE' : '',
    description: `Atendimento de balcão - ${state.paymentMethod}`
  };
}

async function savePixDraft(status) {
  if (!state.currentPixDraft) return;
  const draft = { ...state.currentPixDraft, pixStatus: status };
  closeModal('pixModal');
  await saveEntryAndReset(draft);
}

async function saveEntryAndReset(draft) {
  setBusy(true, 'Salvando lançamento...');
  try {
    const result = await repositorySaveEntry(draft);
    const entry = sanitizeEntry(result.entry || result);
    state.entries.push(entry);
    persistEntriesIfLocal();
    state.summary = result.summary || buildSummary(state.entries, todayIso());
    resetSaleForm();
    renderAll();
    showStatus(el.saleStatus, 'Recebimento registrado com sucesso.', 'success');
  } catch (error) {
    console.error('[CAIXA_AVISTA][saveEntry]', error);
    showStatus(el.saleStatus, error.message || 'Não foi possível salvar o recebimento.', 'error');
  } finally {
    setBusy(false);
  }
}

function resetSaleForm() {
  state.selectedClient = null;
  state.paymentMethod = '';
  state.quantity = 1;
  state.amountCents = 0;
  state.currentPixDraft = null;
  state.currentPixPayload = '';
  el.clientInput.value = '';
  hideSuggestions();
  renderSelectedClient();
  updateAddClientButton();
}

function renderPixModal() {
  el.pixModalAmount.textContent = formatCents(state.amountCents);
  el.pixCode.value = state.currentPixPayload;
  el.pixQr.innerHTML = '';
  hideStatus(el.pixStatus);
  if (typeof window.QRCode === 'function') {
    try {
      new window.QRCode(el.pixQr, {
        text: state.currentPixPayload,
        width: 280,
        height: 280,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } catch (error) {
      console.error('[CAIXA_AVISTA][QR]', error);
      showStatus(el.pixStatus, 'O código Pix foi gerado, mas o QR Code não pôde ser desenhado. Use Copiar Pix.', 'warning');
    }
  } else {
    showStatus(el.pixStatus, 'O código Pix foi gerado, mas o componente de QR Code não carregou. Use Copiar Pix.', 'warning');
  }
}

async function copyPixCode() {
  try {
    await copyText(state.currentPixPayload);
    showStatus(el.pixStatus, 'Pix Copia e Cola copiado.', 'success');
  } catch (error) {
    showStatus(el.pixStatus, 'Não foi possível copiar automaticamente. Selecione o código manualmente.', 'error');
  }
}

async function sharePix() {
  if (!state.currentPixPayload || !state.currentPixDraft) return;
  const message = [
    'Olá! Segue a cobrança Pix da sua postagem.',
    '',
    `Valor: ${formatCents(state.currentPixDraft.amountCents)}`,
    '',
    'Pix Copia e Cola:',
    state.currentPixPayload
  ].join('\n');

  try {
    if (navigator.share) {
      await navigator.share({ title: 'Cobrança Pix', text: message });
    } else {
      const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    showStatus(el.pixStatus, 'Cobrança preparada para compartilhamento.', 'success');
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    try {
      await copyText(message);
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } catch (fallbackError) {
      showStatus(el.pixStatus, 'Não foi possível abrir o compartilhamento.', 'error');
    }
  }
}
