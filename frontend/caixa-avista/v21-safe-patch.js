'use strict';

(() => {
  const V2_API =
    'https://script.google.com/macros/s/AKfycbxH-9PPg_R5i5YGYuZOgizOK-_i9XssRvvoA21XFnxt0nZr9SF87jFysf4s3bhNVSIe/exec';

  const V3_API =
    'https://script.google.com/macros/s/AKfycbxRaTJeaXhGTC0Lbyqf_Osnr_HsOyUnlOWjwtGMvkvPY1d98H0RthjJPCkLJRkP1x8o/exec';

  const DEFAULT_CLIENT = Object.freeze({
    id: 'cliente-balcao',
    name: 'Cliente de Balcão'
  });

  const previousFetch = window.fetch.bind(window);

  function selectedUnitId() {
    return String(
      window.CaixaUnitContext?.getSelectedUnitId?.() || ''
    ).trim();
  }

  function isRevenuePayload(payload) {
    return String(payload?.type || '').toUpperCase() === 'RECEITA';
  }

  function applyDefaultClient(payload) {
    if (!payload || typeof payload !== 'object' || !isRevenuePayload(payload)) {
      return payload;
    }

    return {
      ...payload,
      clientId: DEFAULT_CLIENT.id,
      clientName: DEFAULT_CLIENT.name
    };
  }

  function pendingPixEntries(entries) {
    return (Array.isArray(entries) ? entries : []).filter(entry => {
      const status = String(entry?.status || '').toUpperCase();
      const pixStatus = String(entry?.pixStatus || '').toUpperCase();
      const method = String(entry?.paymentContaAzulMethod || '').toUpperCase();
      const paymentId = String(entry?.paymentId || '').toUpperCase();

      return (
        status !== 'EXCLUIDO' &&
        (
          method === 'PIX_PAGAMENTO_INSTANTANEO' ||
          /^PIX(?:_|$)/.test(paymentId)
        ) &&
        ['CRIANDO', 'ATIVA', 'PENDENTE'].includes(pixStatus)
      );
    });
  }

  function includePendingPixInSummary(data) {
    if (!data || typeof data !== 'object') return data;

    // Enquanto a base mestre não estiver pronta, a interface trabalha somente
    // com o cliente operacional padrão. O backend V2 continua intacto.
    if (Array.isArray(data.clients)) {
      data.clients = [{ ...DEFAULT_CLIENT }];
    }

    const summary = data.summary;
    const pending = pendingPixEntries(data.entries);

    if (!summary || !pending.length || summary.__v21PendingIncluded) {
      return data;
    }

    const pendingCents = pending.reduce(
      (total, entry) => total + Number(entry?.amountCents || 0),
      0
    );

    summary.revenueCents = Number(summary.revenueCents || 0) + pendingCents;
    summary.revenueCount = Number(summary.revenueCount || 0) + pending.length;
    summary.netCents = Number(summary.netCents || 0) + pendingCents;
    summary.byPayment = { ...(summary.byPayment || {}) };
    summary.countByPayment = { ...(summary.countByPayment || {}) };

    pending.forEach(entry => {
      const paymentId = String(entry?.paymentId || 'PIX').trim() || 'PIX';
      const amount = Number(entry?.amountCents || 0);

      summary.byPayment[paymentId] =
        Number(summary.byPayment[paymentId] || 0) + amount;

      summary.countByPayment[paymentId] =
        Number(summary.countByPayment[paymentId] || 0) + 1;
    });

    summary.__v21PendingIncluded = true;
    return data;
  }

  async function rewriteInitResponse(response) {
    try {
      const data = await response.clone().json();
      includePendingPixInSummary(data);

      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json;charset=utf-8');

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  }

  function shouldUseV3ForClose() {
    return String(
      document.getElementById('closeState')?.textContent || ''
    ).trim() === 'Pix pendente';
  }

  function parseDisplayedMoneyToCents(value) {
    const normalized = String(value || '')
      .replace(/R\$/gi, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

    const amount = Number(normalized);

    return Number.isFinite(amount)
      ? Math.round(amount * 100)
      : 0;
  }

  function expectedCashCentsFromUi() {
    return parseDisplayedMoneyToCents(
      document.getElementById('closeExpected')?.textContent || ''
    );
  }

  function formatCentsForInput(cents) {
    return (Number(cents || 0) / 100)
      .toFixed(2)
      .replace('.', ',');
  }

  function syncExpectedCashConfirmation() {
    const closeState = String(
      document.getElementById('closeState')?.textContent || ''
    ).trim();

    if (closeState === 'Fechado') {
      return;
    }

    const input = document.getElementById('countedCash');

    if (!input) {
      return;
    }

    const expectedCents = expectedCashCentsFromUi();
    const nextValue = formatCentsForInput(expectedCents);

    if (input.value !== nextValue) {
      input.value = nextValue;
      input.dispatchEvent(
        new Event('input', { bubbles: true })
      );
    }
  }

  window.fetch = async function patchedCaixaFetch(input, init = {}) {
    const target =
      typeof input === 'string'
        ? input
        : String(input?.url || '');

    const method = String(
      init.method || input?.method || 'GET'
    ).toUpperCase();

    if (
      target !== V2_API ||
      method !== 'POST' ||
      typeof init.body !== 'string'
    ) {
      return previousFetch(input, init);
    }

    let request;

    try {
      request = JSON.parse(init.body);
    } catch (_) {
      return previousFetch(input, init);
    }

    if (!request || typeof request !== 'object') {
      return previousFetch(input, init);
    }

    if (request.action === 'saveEntry') {
      request.payload = applyDefaultClient(request.payload);
    }

    if (request.action === 'saveBatch' && Array.isArray(request.payloads)) {
      request.payloads = request.payloads.map(applyDefaultClient);
    }

    /*
     * Regra operacional V2.1:
     * o checkbox "Conferi e contei o numerário" confirma exatamente o valor
     * esperado na gaveta. O atendente não precisa digitar esse mesmo valor.
     *
     * Mantemos o backend V2 estável, mas enviamos explicitamente o valor
     * esperado para impedir regressão do campo manual.
     */
    if (request.action === 'closeCash') {
      request.payload = {
        ...(request.payload || {}),
        countedCashCents: expectedCashCentsFromUi()
      };
    }

    // A V3 já homologou confirmação de Pix após fechamento. As demais ações
    // permanecem no V2 estável para reduzir a superfície de alteração.
    if (request.action === 'syncPixPayment') {
      request.unitId = selectedUnitId();

      return previousFetch(V3_API, {
        ...init,
        body: JSON.stringify(request)
      });
    }

    // Fechamento V3 é usado somente quando o V2 bloquearia por Pix pendente.
    // Sem Pix pendente, o fluxo de fechamento continua 100% V2.
    if (request.action === 'closeCash' && shouldUseV3ForClose()) {
      request.unitId = selectedUnitId();

      return previousFetch(V3_API, {
        ...init,
        body: JSON.stringify(request)
      });
    }

    const response = await previousFetch(input, {
      ...init,
      body: JSON.stringify(request)
    });

    if (request.action === 'init' || request.action === 'summary') {
      return rewriteInitResponse(response);
    }

    return response;
  };

  function installBalcaoUi() {
    let style = document.getElementById('caixaV21SafeStyles');

    if (!style) {
      style = document.createElement('style');
      style.id = 'caixaV21SafeStyles';
      style.textContent = [
        '#clientSection{display:none!important;}',
        '.caixa-v21-auto-count{display:none!important;}'
      ].join('');
      document.head.appendChild(style);
    }

    const clientSection = document.getElementById('clientSection');
    if (clientSection) clientSection.setAttribute('aria-hidden', 'true');

    const observation = document.getElementById('descriptionInput');
    if (observation) {
      observation.placeholder = 'Nome do cliente ou observação (opcional)';
    }

    const countedCash = document.getElementById('countedCash');
    const countedCashLabel = countedCash?.closest('label');

    if (countedCashLabel) {
      countedCashLabel.classList.add('caixa-v21-auto-count');
      countedCashLabel.setAttribute('aria-hidden', 'true');
    }

    const closingNotes = document.getElementById('closingNotes');
    if (closingNotes) {
      closingNotes.placeholder = 'Opcional';
    }

    syncExpectedCashConfirmation();
  }

  function releasePendingPixCloseLock() {
    const state = String(
      document.getElementById('closeState')?.textContent || ''
    ).trim();

    const button = document.getElementById('btnCloseCash');

    if (state === 'Pix pendente' && button?.disabled) {
      button.disabled = false;
      button.title = 'Fechamento permitido com Pix pendente';
    }
  }

  installBalcaoUi();
  releasePendingPixCloseLock();

  const closeState = document.getElementById('closeState');
  const closeButton = document.getElementById('btnCloseCash');
  const closeExpected = document.getElementById('closeExpected');
  const closeDeclaration = document.getElementById('closeDeclaration');

  if (closeExpected) {
    new MutationObserver(syncExpectedCashConfirmation).observe(closeExpected, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (closeDeclaration) {
    closeDeclaration.addEventListener(
      'change',
      syncExpectedCashConfirmation
    );
  }

  if (closeButton) {
    closeButton.addEventListener(
      'click',
      syncExpectedCashConfirmation,
      true
    );
  }

  if (closeState) {
    new MutationObserver(releasePendingPixCloseLock).observe(closeState, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (closeButton) {
    new MutationObserver(releasePendingPixCloseLock).observe(closeButton, {
      attributes: true,
      attributeFilter: ['disabled']
    });
  }
})();