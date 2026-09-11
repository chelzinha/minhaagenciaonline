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

    // A interface não precisa receber a base completa enquanto o cadastro
    // mestre de clientes não estiver definido.
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

    // A V3 já homologou a transição de Pix após fechamento. Mantemos todas as
    // demais operações no backend V2 estável para reduzir superfície de risco.
    if (request.action === 'syncPixPayment') {
      request.unitId = selectedUnitId();

      return previousFetch(V3_API, {
        ...init,
        body: JSON.stringify(request)
      });
    }

    // Só usamos o fechamento V3 quando o bloqueio existente é Pix pendente.
    // Fechamentos comuns continuam exatamente no fluxo V2 já homologado.
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
      style.textContent = '#clientSection{display:none!important;}';
      document.head.appendChild(style);
    }

    const clientSection = document.getElementById('clientSection');
    if (clientSection) clientSection.setAttribute('aria-hidden', 'true');

    const observation = document.getElementById('descriptionInput');
    if (observation) {
      observation.placeholder = 'Nome do cliente ou observação (opcional)';
    }
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

  const observer = new MutationObserver(() => {
    installBalcaoUi();
    releasePendingPixCloseLock();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled', 'class']
  });
})();
