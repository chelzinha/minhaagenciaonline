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

  const supplementRuntime = {
    hasBaseClosure: false,
    pendingCount: 0,
    pendingEntryCount: 0,
    pendingWithdrawalCount: 0,
    pendingWithdrawalCents: 0,
    pendingRevenueCents: 0,
    pendingExpenseCents: 0,
    pendingNetCents: 0,
    supplementCount: 0,
    busy: false
  };

  const previousFetch = window.fetch.bind(window);

  function selectedUnitId() {
    return String(
      window.CaixaUnitContext?.getSelectedUnitId?.() || ''
    ).trim();
  }

  function authToken() {
    return String(
      window.AgfAuth?.getToken?.() || ''
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

  function activeUnclosedEntries(entries) {
    return (Array.isArray(entries) ? entries : []).filter(entry => {
      return (
        String(entry?.status || '').toUpperCase() !== 'EXCLUIDO' &&
        !String(entry?.closureId || '').trim()
      );
    });
  }

  function deltaFromEntries(entries) {
    return activeUnclosedEntries(entries).reduce(
      (delta, entry) => {
        const amount = Number(entry?.amountCents || 0);

        if (String(entry?.type || '').toUpperCase() === 'DESPESA') {
          delta.expenseCents += amount;
          delta.netCents -= amount;
        } else {
          delta.revenueCents += amount;
          delta.netCents += amount;
        }

        delta.count += 1;
        return delta;
      },
      {
        count: 0,
        revenueCents: 0,
        expenseCents: 0,
        netCents: 0
      }
    );
  }

  function applySupplementState(state) {
    const next = state && typeof state === 'object'
      ? state
      : {};

    supplementRuntime.hasBaseClosure =
      Boolean(next.hasBaseClosure);

    supplementRuntime.pendingCount =
      Number(next.pendingCount || 0);

    supplementRuntime.pendingRevenueCents =
      Number(next.pendingRevenueCents || 0);

    supplementRuntime.pendingExpenseCents =
      Number(next.pendingExpenseCents || 0);

    supplementRuntime.pendingNetCents =
      Number(next.pendingNetCents || 0);

    supplementRuntime.supplementCount =
      Number(next.supplementCount || 0);

    queueSupplementUi();
  }

  function captureSupplementState(data) {
    if (!data || typeof data !== 'object') {
      return;
    }

    const hasClosure = Boolean(data.closure);

    if (!hasClosure) {
      applySupplementState({
        hasBaseClosure: false,
        pendingCount: 0,
        pendingRevenueCents: 0,
        pendingExpenseCents: 0,
        pendingNetCents: 0,
        supplementCount: 0
      });
      return;
    }

    if (data.supplementState) {
      applySupplementState(data.supplementState);
    } else {
      const delta = deltaFromEntries(data.entries);

      applySupplementState({
        hasBaseClosure: true,
        pendingCount: delta.count,
        pendingRevenueCents: delta.revenueCents,
        pendingExpenseCents: delta.expenseCents,
        pendingNetCents: delta.netCents,
        supplementCount: supplementRuntime.supplementCount
      });
    }

    /*
     * A V2 mantém no fechamento o carryover original. Para a interface pós-
     * fechamento, exibimos a posição física atual calculada pelo resumo.
     * Nada é alterado no registro persistido do fechamento principal.
     */
    if (
      data.closure &&
      data.summary &&
      Number.isFinite(Number(data.summary.expectedCashCents))
    ) {
      data.closure = {
        ...data.closure,
        originalCarryoverCents:
          Number(data.closure.carryoverCents || 0),
        carryoverCents:
          Number(data.summary.expectedCashCents || 0)
      };
    }
  }

  async function rewriteInitResponse(response) {
    try {
      const data = await response.clone().json();

      includePendingPixInSummary(data);
      captureSupplementState(data);

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

  function baseClosureExists() {
    if (supplementRuntime.hasBaseClosure) {
      return true;
    }

    return String(
      document.getElementById('closeState')?.textContent || ''
    ).trim() === 'Fechado';
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

  function formatMoney(cents) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(cents || 0) / 100);
  }

  function syncExpectedCashConfirmation() {
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

  function syncVisibleExpectedCash(expectedCents) {
    const value = formatMoney(expectedCents);
    const cashExpected = document.getElementById('cashExpected');
    const closeExpected = document.getElementById('closeExpected');

    if (cashExpected) {
      cashExpected.textContent = value;
    }

    if (closeExpected) {
      closeExpected.textContent = value;
    }

    syncExpectedCashConfirmation();
  }

  function updateRuntimeFromV3Result(action, data) {
    if (!data || typeof data !== 'object' || data.ok === false) {
      return;
    }

    if (data.supplementState) {
      applySupplementState(data.supplementState);
    } else if (
      action === 'closeCash' &&
      data.closure
    ) {
      applySupplementState({
        hasBaseClosure: true,
        pendingCount: 0,
        pendingRevenueCents: 0,
        pendingExpenseCents: 0,
        pendingNetCents: 0,
        supplementCount: supplementRuntime.supplementCount
      });
    }

    if (
      data.summary &&
      Number.isFinite(Number(data.summary.expectedCashCents))
    ) {
      window.setTimeout(
        () => syncVisibleExpectedCash(
          Number(data.summary.expectedCashCents || 0)
        ),
        0
      );
    }
  }

  async function observeV3Response(action, response) {
    try {
      const data = await response.clone().json();
      updateRuntimeFromV3Result(action, data);
    } catch (_) {}

    return response;
  }

  async function observeCloseResponse(response) {
    try {
      const data = await response.clone().json();

      if (data?.ok && data?.closure) {
        supplementRuntime.hasBaseClosure = true;

        if (data.supplementState) {
          applySupplementState(data.supplementState);
        } else {
          supplementRuntime.pendingCount = 0;
          supplementRuntime.pendingRevenueCents = 0;
          supplementRuntime.pendingExpenseCents = 0;
          supplementRuntime.pendingNetCents = 0;
          queueSupplementUi();
        }
      }
    } catch (_) {}

    return response;
  }

  async function postV3(action, data = {}) {
    const controller =
      typeof AbortController === 'function'
        ? new AbortController()
        : null;

    const timer = controller
      ? window.setTimeout(() => controller.abort(), 25000)
      : null;

    try {
      const response = await previousFetch(
        V3_API,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({
            action,
            st: authToken(),
            unitId: selectedUnitId(),
            ...data
          }),
          signal: controller
            ? controller.signal
            : undefined
        }
      );

      if (!response.ok) {
        throw new Error(
          'Falha de comunicação ao atualizar o fechamento.'
        );
      }

      const result = await response.json();

      if (!result?.ok) {
        const error = new Error(
          result?.error ||
          result?.message ||
          'Operação não concluída.'
        );

        error.code = result?.code || '';
        throw error;
      }

      updateRuntimeFromV3Result(action, result);
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(
          'O servidor demorou para responder. Atualize a página antes de tentar novamente.'
        );
      }

      throw error;
    } finally {
      if (timer) {
        window.clearTimeout(timer);
      }
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
     * Depois do fechamento principal, somente as gravações novas são
     * encaminhadas ao backend V3, que permite lançamentos pós-fechamento e
     * mantém esses registros sem closure_id até o complemento.
     *
     * O bootstrap continua V2. Assim evitamos reintroduzir a regressão
     * "Carregando..." que ocorreu quando todo o Caixa foi promovido à V3.
     */
    if (
      ['saveEntry', 'saveBatch'].includes(request.action) &&
      baseClosureExists()
    ) {
      request.unitId = selectedUnitId();

      const response = await previousFetch(V3_API, {
        ...init,
        body: JSON.stringify(request)
      });

      return observeV3Response(request.action, response);
    }

    /*
     * O checkbox "Conferi e contei o numerário" confirma exatamente o valor
     * esperado na gaveta. O atendente não precisa digitar esse mesmo valor.
     */
    if (request.action === 'closeCash') {
      request.payload = {
        ...(request.payload || {}),
        countedCashCents: expectedCashCentsFromUi()
      };
    }

    /*
     * A confirmação do Pix usa o backend V3 para continuar permitida mesmo
     * depois do fechamento principal.
     */
    if (request.action === 'syncPixPayment') {
      request.unitId = selectedUnitId();

      const response = await previousFetch(V3_API, {
        ...init,
        body: JSON.stringify(request)
      });

      return observeV3Response(request.action, response);
    }

    /*
     * O fechamento V3 continua sendo usado quando há Pix pendente.
     * Sem Pix pendente, o primeiro fechamento permanece no V2 estável.
     */
    if (request.action === 'closeCash' && shouldUseV3ForClose()) {
      request.unitId = selectedUnitId();

      const response = await previousFetch(V3_API, {
        ...init,
        body: JSON.stringify(request)
      });

      return observeCloseResponse(response);
    }

    const response = await previousFetch(input, {
      ...init,
      body: JSON.stringify(request)
    });

    if (request.action === 'init' || request.action === 'summary') {
      return rewriteInitResponse(response);
    }

    if (request.action === 'closeCash') {
      return observeCloseResponse(response);
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
        '.caixa-v21-auto-count{display:none!important;}',
        '#v21SupplementInfo{margin-top:12px;}',
        '#btnV21Supplement{margin-top:12px;}'
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

  function supplementSummaryText() {
    const count = supplementRuntime.pendingCount;
    const net = supplementRuntime.pendingNetCents;

    return (
      count +
      ' novo' +
      (count === 1 ? '' : 's') +
      ' movimento' +
      (count === 1 ? '' : 's') +
      ' · adicional líquido ' +
      formatMoney(net)
    );
  }

  function queueSupplementUi() {
    window.setTimeout(renderSupplementUi, 0);
  }

  function renderSupplementUi() {
    const original = document.getElementById('btnCloseCash');

    if (!original) {
      return;
    }

    let info = document.getElementById('v21SupplementInfo');
    let button = document.getElementById('btnV21Supplement');

    if (!supplementRuntime.hasBaseClosure) {
      original.classList.remove('hidden');
      info?.remove();
      button?.remove();
      return;
    }

    original.classList.add('hidden');

    if (!info) {
      info = document.createElement('div');
      info.id = 'v21SupplementInfo';
      info.className = 'status-box show info';
      original.insertAdjacentElement('afterend', info);
    }

    const count = Number(supplementRuntime.pendingCount || 0);

    if (!count) {
      info.textContent = supplementRuntime.supplementCount
        ? (
            'Caixa consolidado. ' +
            supplementRuntime.supplementCount +
            ' complemento' +
            (supplementRuntime.supplementCount === 1 ? '' : 's') +
            ' registrado' +
            (supplementRuntime.supplementCount === 1 ? '' : 's') +
            '.'
          )
        : 'Caixa fechado. Nenhum movimento novo aguardando complemento.';

      button?.remove();
      return;
    }

    info.textContent =
      'Fechamento principal já realizado. ' +
      supplementSummaryText() +
      '.';

    if (!button) {
      button = document.createElement('button');
      button.id = 'btnV21Supplement';
      button.type = 'button';
      button.className = 'primary-action';
      button.innerHTML =
        '<span class="material-symbols-rounded">sync</span>' +
        '<span>Atualizar fechamento</span>';

      info.insertAdjacentElement('afterend', button);

      button.addEventListener(
        'click',
        updateSupplement
      );
    }

    button.disabled = supplementRuntime.busy;
  }

  async function updateSupplement() {
    const count = Number(
      supplementRuntime.pendingCount || 0
    );

    if (!count || supplementRuntime.busy) {
      return;
    }

    const confirmed = window.confirm(
      [
        'Atualizar o fechamento com ' +
          count +
          ' novo' +
          (count === 1 ? '' : 's') +
          ' movimento' +
          (count === 1 ? '' : 's') +
          '?',
        '',
        'Somente os lançamentos novos serão enviados ao Conta Azul.'
      ].join('\n')
    );

    if (!confirmed) {
      return;
    }

    supplementRuntime.busy = true;
    renderSupplementUi();

    const info = document.getElementById('v21SupplementInfo');

    if (info) {
      info.textContent = 'Atualizando fechamento...';
      info.className = 'status-box show info';
    }

    try {
      const result = await postV3(
        'closeCash',
        {
          payload: {
            declarationConfirmed: true,
            countedCashCents: expectedCashCentsFromUi(),
            closingWithdrawalCents: 0,
            withdrawalDestination: 'Financeiro',
            notes: 'Fechamento complementar'
          }
        }
      );

      const dispatchOk =
        result?.contaAzulDispatch?.ok !== false;

      if (info) {
        info.textContent = dispatchOk
          ? 'Fechamento atualizado. Os novos movimentos foram enviados para processamento no Conta Azul.'
          : 'Fechamento atualizado. O envio ao Conta Azul ficou pendente para nova tentativa.';

        info.className = dispatchOk
          ? 'status-box show success'
          : 'status-box show warning';
      }

      window.setTimeout(
        () => window.location.reload(),
        900
      );
    } catch (error) {
      supplementRuntime.busy = false;
      renderSupplementUi();

      if (info) {
        info.textContent =
          error?.message ||
          'Não foi possível atualizar o fechamento.';

        info.className = 'status-box show error';
      }
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
    new MutationObserver(() => {
      releasePendingPixCloseLock();
      queueSupplementUi();
    }).observe(closeState, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (closeButton) {
    new MutationObserver(() => {
      releasePendingPixCloseLock();
      queueSupplementUi();
    }).observe(closeButton, {
      attributes: true,
      attributeFilter: ['disabled', 'class']
    });
  }
})();
