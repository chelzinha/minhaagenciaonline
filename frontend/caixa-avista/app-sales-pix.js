'use strict';

async function completeSale() {
  const validation = validateSaleDraft();
  if (!validation.ok) {
    showStatus(el.saleStatus, validation.message, 'error');
    return;
  }

  const draft = buildSaleDraft();
  if (state.paymentMethod === 'PIX') {
    await beginPixSale(draft);
    return;
  }

  await saveEntryAndReset(draft);
}

async function beginPixSale(baseDraft) {
  const draft = { ...baseDraft, entryId: uuid() };
  setBusy(true, 'Criando cobrança Pix...');
  try {
    const charge = await createPixCharge(draft);
    state.currentPixCharge = charge;
    state.currentPixPayload = charge.copyPaste;
    state.currentPixDraft = {
      ...draft,
      pixStatus: charge.status || 'PENDENTE',
      pixTxid: charge.txid || '',
      pixProvider: charge.provider || 'local'
    };

    if (charge.automaticConfirmation) {
      const result = await repositorySaveEntry(state.currentPixDraft);
      const entry = sanitizeEntry(result.entry || result);
      state.entries.push(entry);
      state.summary = result.summary || buildSummary(state.entries, todayIso());
      state.currentPixCharge = { ...charge, entryId: entry.id };
      state.currentPixDraft = { ...state.currentPixDraft, entryId: entry.id };
      persistEntriesIfLocal();
      renderAll();
    }

    renderPixModal();
    openModal('pixModal');

    if (charge.automaticConfirmation) {
      showStatus(el.pixStatus, 'Aguardando a confirmação automática do Santander...', 'info');
      resetSaleForm({ preservePix: true });
      renderAll();
      startPixStatusPolling(state.currentPixCharge);
    } else if (charge.fallbackReason) {
      showStatus(el.pixStatus, 'Santander ainda indisponível. A cobrança foi gerada no modo Pix local.', 'warning');
    }
  } catch (error) {
    console.error('[CAIXA_AVISTA][PIX_CREATE]', error);
    showStatus(el.saleStatus, error.message || 'Não foi possível gerar a cobrança Pix.', 'error');
    if (String(state.settings.pixProvider || 'auto').toLowerCase() === 'local') openModal('settingsModal');
  } finally {
    setBusy(false);
  }
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
    pixTxid: '',
    pixProvider: state.paymentMethod === 'PIX' ? 'local' : '',
    description: `Atendimento de balcão - ${state.paymentMethod}`
  };
}

async function savePixDraft(status) {
  if (!state.currentPixDraft || state.currentPixCharge?.automaticConfirmation) return;
  const draft = {
    ...state.currentPixDraft,
    pixStatus: status,
    pixTxid: state.currentPixCharge?.txid || '',
    pixProvider: state.currentPixCharge?.provider || 'local'
  };
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

function resetSaleForm(options = {}) {
  const preservePix = Boolean(options.preservePix);
  state.selectedClient = null;
  state.paymentMethod = '';
  state.quantity = 1;
  state.amountCents = 0;
  if (!preservePix) {
    stopPixStatusPolling();
    state.currentPixDraft = null;
    state.currentPixPayload = '';
    state.currentPixCharge = null;
  }
  el.clientInput.value = '';
  hideSuggestions();
  renderSelectedClient();
  updateAddClientButton();
}

function renderPixModal() {
  const charge = state.currentPixCharge || {};
  el.pixModalAmount.textContent = formatCents(charge.amountCents || state.currentPixDraft?.amountCents || state.amountCents);
  el.pixCode.value = charge.copyPaste || state.currentPixPayload;
  el.pixQr.innerHTML = '';
  hideStatus(el.pixStatus);

  const automatic = Boolean(charge.automaticConfirmation);
  el.btnPixConfirmed.classList.toggle('hidden', automatic);
  el.btnPixPending.classList.toggle('hidden', automatic);

  if (typeof window.QRCode === 'function') {
    try {
      new window.QRCode(el.pixQr, {
        text: charge.copyPaste || state.currentPixPayload,
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
    await copyText(state.currentPixCharge?.copyPaste || state.currentPixPayload);
    showStatus(el.pixStatus, 'Pix Copia e Cola copiado.', 'success');
  } catch (error) {
    showStatus(el.pixStatus, 'Não foi possível copiar automaticamente. Selecione o código manualmente.', 'error');
  }
}

async function sharePix() {
  const code = state.currentPixCharge?.copyPaste || state.currentPixPayload;
  const draft = state.currentPixDraft;
  if (!code || !draft) return;
  const message = [
    'Olá! Segue a cobrança Pix da sua postagem.',
    '',
    `Valor: ${formatCents(draft.amountCents)}`,
    '',
    'Pix Copia e Cola:',
    code
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
