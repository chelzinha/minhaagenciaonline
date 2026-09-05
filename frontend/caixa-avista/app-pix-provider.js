'use strict';

async function createPixCharge(draft) {
  const mode = String(state.settings.pixProvider || 'auto').toLowerCase();
  if (mode === 'local') return createLocalPixCharge(draft);

  try {
    return await createSantanderPixCharge(draft);
  } catch (error) {
    if (mode !== 'auto') throw error;
    console.warn('[CAIXA_AVISTA][PIX] Santander indisponível; usando fallback local.', error);
    return {
      ...createLocalPixCharge(draft),
      fallbackReason: error.message || 'Integração Santander indisponível.'
    };
  }
}

function createLocalPixCharge(draft) {
  const pixConfig = getPixConfig();
  const copyPaste = buildPixPayload({
    key: pixConfig.key,
    name: pixConfig.name,
    city: pixConfig.city,
    amountCents: draft.amountCents,
    txid: '***'
  });
  return {
    provider: 'local',
    automaticConfirmation: false,
    entryId: draft.entryId,
    txid: '***',
    status: 'PENDENTE',
    amountCents: draft.amountCents,
    copyPaste,
    expiresAt: ''
  };
}

async function createSantanderPixCharge(draft) {
  const token = window.AgfAuth?.getToken ? window.AgfAuth.getToken() : '';
  const response = await fetch(`${pixApiBase()}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      entryId: draft.entryId,
      clientName: draft.clientName,
      objectCount: draft.objectCount,
      amountCents: draft.amountCents,
      description: draft.description
    })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok || !result.charge) {
    const error = new Error(result?.error || `Integração Santander indisponível (${response.status}).`);
    error.code = result?.code || 'SANTANDER_CREATE_FAILED';
    throw error;
  }
  if (!result.charge.copyPaste) throw new Error('O Santander não retornou o Pix Copia e Cola.');
  return result.charge;
}

async function getSantanderPixStatus(txid) {
  const token = window.AgfAuth?.getToken ? window.AgfAuth.getToken() : '';
  const response = await fetch(`${pixApiBase()}/status/${encodeURIComponent(txid)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok || !result.charge) {
    throw new Error(result?.error || `Não foi possível consultar o Pix (${response.status}).`);
  }
  return result.charge;
}

function pixApiBase() {
  return String(state.settings.pixApiBase || '/api/santander/pix').replace(/\/+$/, '');
}

function startPixStatusPolling(charge) {
  stopPixStatusPolling();
  if (!charge?.automaticConfirmation || !charge.txid || charge.txid === '***') return;

  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const updated = await getSantanderPixStatus(charge.txid);
      state.currentPixCharge = { ...state.currentPixCharge, ...updated };
      await applyAutomaticPixStatus(state.currentPixCharge);
      if (isPixTerminalStatus(updated.status) || attempts >= 150) stopPixStatusPolling();
    } catch (error) {
      console.warn('[CAIXA_AVISTA][PIX_POLL]', error);
      if (attempts >= 150) stopPixStatusPolling();
    }
  };

  state.pixPollTimer = window.setInterval(poll, 2500);
  window.setTimeout(poll, 800);
}

function stopPixStatusPolling() {
  if (state.pixPollTimer) window.clearInterval(state.pixPollTimer);
  state.pixPollTimer = null;
}

async function applyAutomaticPixStatus(charge) {
  const status = String(charge.status || '').toUpperCase();
  const entry = state.entries.find(item => item.id === charge.entryId || (charge.txid && item.pixTxid === charge.txid));
  if (!entry) return;

  if (entry.pixStatus !== status || (charge.e2eid && entry.pixE2eid !== charge.e2eid)) {
    const result = await repositorySyncPixPayment({
      entryId: entry.id,
      txid: charge.txid,
      pixStatus: status,
      e2eid: charge.e2eid || '',
      receivedAt: charge.receivedAt || '',
      amountCents: charge.amountCents || entry.amountCents,
      provider: 'santander'
    });
    entry.pixStatus = status;
    entry.pixTxid = charge.txid || entry.pixTxid;
    entry.pixE2eid = charge.e2eid || entry.pixE2eid;
    entry.pixReceivedAt = charge.receivedAt || entry.pixReceivedAt;
    state.summary = result.summary || buildSummary(state.entries, todayIso());
    persistEntriesIfLocal();
    renderAll();
  }

  if (status === 'CONFIRMADO') {
    showStatus(el.pixStatus, 'Pix recebido e confirmado automaticamente pelo Santander.', 'success');
    el.btnPixConfirmed.classList.add('hidden');
    el.btnPixPending.classList.add('hidden');
  } else if (status === 'EXPIRADO') {
    showStatus(el.pixStatus, 'A cobrança Pix expirou sem pagamento.', 'warning');
  } else if (status === 'CANCELADO') {
    showStatus(el.pixStatus, 'A cobrança Pix foi cancelada.', 'warning');
  } else if (status === 'ERRO') {
    showStatus(el.pixStatus, 'O Santander informou uma falha na cobrança.', 'error');
  } else {
    showStatus(el.pixStatus, 'Aguardando a confirmação automática do Santander...', 'info');
  }
}

function isPixTerminalStatus(status) {
  return ['CONFIRMADO', 'EXPIRADO', 'CANCELADO', 'ERRO'].includes(String(status || '').toUpperCase());
}
