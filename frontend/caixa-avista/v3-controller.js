'use strict';

(() => {
  const API_URL =
    'https://script.google.com/macros/s/AKfycbxH-9PPg_R5i5YGYuZOgizOK-_i9XssRvvoA21XFnxt0nZr9SF87jFysf4s3bhNVSIe/exec';
  const TIMEZONE = 'America/Fortaleza';
  const baseFetch = window.fetch.bind(window);

  const runtime = {
    snapshot: null,
    supplementState: null,
    selectingDefaultClient: false,
    defaultClientSuppressed: false,
    domPatchQueued: false
  };

  const normalize = value =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const centsToInput = cents =>
    (Number(cents || 0) / 100)
      .toFixed(2)
      .replace('.', ',');

  const token = () =>
    String(window.AgfAuth?.getToken?.() || '').trim();

  function mergeEntry(entry) {
    if (!entry) return;
    runtime.snapshot = runtime.snapshot || { entries: [] };
    runtime.snapshot.entries = Array.isArray(runtime.snapshot.entries)
      ? runtime.snapshot.entries
      : [];

    const index = runtime.snapshot.entries.findIndex(item => item.id === entry.id);
    if (index >= 0) runtime.snapshot.entries[index] = entry;
    else runtime.snapshot.entries.push(entry);
  }

  function absorbResult(action, data) {
    if (!data || typeof data !== 'object' || data.ok === false) return;

    if (action === 'init' || action === 'summary') {
      runtime.snapshot = data;
      runtime.supplementState = data.supplementState || null;
    } else {
      runtime.snapshot = runtime.snapshot || {};
      if (data.entry) mergeEntry(data.entry);
      if (Array.isArray(data.entries)) data.entries.forEach(mergeEntry);
      if (data.summary) runtime.snapshot.summary = data.summary;
      if (data.closure !== undefined) runtime.snapshot.closure = data.closure;
      if (data.serverDate) runtime.snapshot.serverDate = data.serverDate;
      if (data.supplementState) {
        runtime.supplementState = data.supplementState;
        runtime.snapshot.supplementState = data.supplementState;
      }
    }

    queueDomPatch();
  }

  window.fetch = async function(input, init = {}) {
    const response = await baseFetch(input, init);

    try {
      const target = typeof input === 'string'
        ? input
        : String(input?.url || '');
      const method = String(init.method || input?.method || 'GET').toUpperCase();

      if (
        target === API_URL &&
        method === 'POST' &&
        typeof init.body === 'string'
      ) {
        const request = JSON.parse(init.body);
        const action = String(request?.action || '');
        const clone = response.clone();
        clone.json()
          .then(data => absorbResult(action, data))
          .catch(() => {});
      }
    } catch (_) {}

    return response;
  };

  async function post(action, data = {}) {
    const response = await baseFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        st: token(),
        ...data
      })
    });

    const result = await response.json();
    if (!result?.ok) {
      throw new Error(result?.message || result?.error || 'Não foi possível concluir a operação.');
    }

    absorbResult(action, result);
    return result;
  }

  function setMovementLabel() {
    const label = document.querySelector('[data-view="movements"] small');
    if (label && label.textContent !== 'Movimentos') {
      label.textContent = 'Movimentos';
    }
  }

  function hideManualCountedCash() {
    const input = document.getElementById('countedCash');
    if (!input) return;

    const expected = Number(runtime.snapshot?.summary?.expectedCashCents || 0);
    const wanted = centsToInput(expected);

    if (input.value !== wanted) {
      input.value = wanted;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const label = input.closest('label');
    if (label) label.style.display = 'none';
  }

  function applyCurrentCashValue() {
    const node = document.getElementById('cashExpected');
    const summary = runtime.snapshot?.summary;
    if (!node || !summary) return;

    node.textContent = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(summary.expectedCashCents || 0) / 100);
  }

  function releasePixCloseLock() {
    const snapshot = runtime.snapshot;
    const button = document.getElementById('btnCloseCash');
    const closeState = document.getElementById('closeState');

    if (!snapshot || !button || snapshot.closure) return;

    /* Pix pendente não bloqueia o fechamento na V3. */
    button.disabled = false;
    button.classList.remove('hidden');
    if (closeState && closeState.textContent === 'Pix pendente') {
      closeState.textContent = 'Aberto';
    }
  }

  function supplementSummaryText(state) {
    const count = Number(state?.pendingCount || 0);
    if (!count) return '';

    const net = Number(state.pendingNetCents || 0);
    const formatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(net / 100);

    return `${count} novo${count === 1 ? '' : 's'} movimento${count === 1 ? '' : 's'} · adicional líquido ${formatted}`;
  }

  function renderSupplementAction() {
    const snapshot = runtime.snapshot;
    const original = document.getElementById('btnCloseCash');
    if (!snapshot || !original) return;

    let button = document.getElementById('btnV3Supplement');
    let info = document.getElementById('v3SupplementInfo');

    if (!snapshot.closure) {
      original.classList.remove('hidden');
      button?.remove();
      info?.remove();
      return;
    }

    original.classList.add('hidden');

    const state = runtime.supplementState || snapshot.supplementState || {};
    const pendingCount = Number(state.pendingCount || 0);

    if (!info) {
      info = document.createElement('div');
      info.id = 'v3SupplementInfo';
      info.className = 'status-box show info';
      original.insertAdjacentElement('afterend', info);
    }

    if (!pendingCount) {
      info.textContent = state.supplementCount
        ? `Caixa consolidado. ${state.supplementCount} complemento${state.supplementCount === 1 ? '' : 's'} registrado${state.supplementCount === 1 ? '' : 's'}.`
        : 'Caixa consolidado. Nenhum movimento novo após o fechamento.';
      button?.remove();
      return;
    }

    info.textContent = `Fechamento já realizado. ${supplementSummaryText(state)}.`;

    if (!button) {
      button = document.createElement('button');
      button.id = 'btnV3Supplement';
      button.type = 'button';
      button.className = 'primary-action';
      button.innerHTML = '<span class="material-symbols-rounded">sync</span><span>Atualizar fechamento</span>';
      info.insertAdjacentElement('afterend', button);
      button.addEventListener('click', updateSupplement);
    }
  }

  async function updateSupplement() {
    const state = runtime.supplementState || {};
    const count = Number(state.pendingCount || 0);
    if (!count) return;

    const confirmed = window.confirm(
      `Atualizar o fechamento com ${count} novo${count === 1 ? '' : 's'} movimento${count === 1 ? '' : 's'}?\n\nSomente os lançamentos novos serão enviados ao Conta Azul.`
    );
    if (!confirmed) return;

    const button = document.getElementById('btnV3Supplement');
    if (button) button.disabled = true;

    try {
      const result = await post('closeCash', {
        payload: {
          declarationConfirmed: true,
          countedCashCents: Number(runtime.snapshot?.summary?.expectedCashCents || 0),
          closingWithdrawalCents: 0,
          withdrawalDestination: 'Financeiro',
          notes: 'Fechamento complementar V3'
        }
      });

      const status = String(
        result?.contaAzulDispatch?.ok === false
          ? 'PENDENTE'
          : 'processado'
      );

      window.alert(
        `Fechamento atualizado. ${count} movimento${count === 1 ? '' : 's'} adicional${count === 1 ? '' : 'is'} enviado${count === 1 ? '' : 's'} para processamento no Conta Azul (${status}).`
      );
      window.location.reload();
    } catch (error) {
      window.alert(error.message || 'Não foi possível atualizar o fechamento.');
      if (button) button.disabled = false;
    }
  }

  function renderPendingBacklogNotice() {
    const view = document.getElementById('viewMovements');
    const list = document.getElementById('movementList');
    if (!view || !list) return;

    let notice = document.getElementById('v3PendingPixBacklog');
    const count = Number(runtime.snapshot?.pendingPixBacklogCount || 0);

    if (!count) {
      notice?.remove();
      return;
    }

    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'v3PendingPixBacklog';
      notice.className = 'status-box show warning';
      list.insertAdjacentElement('beforebegin', notice);
    }

    notice.textContent =
      `Há ${count} Pix pendente${count === 1 ? '' : 's'} de dia${count === 1 ? '' : 's'} anterior${count === 1 ? '' : 'es'}. Abra a cobrança abaixo para conferir e dar baixa no recebimento.`;
  }

  function renamePendingPixButtons() {
    document.querySelectorAll('#movementList button').forEach(button => {
      const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
      if (text === 'Abrir cobrança') {
        const icon = button.querySelector('.material-symbols-rounded');
        button.textContent = '';
        if (icon) button.appendChild(icon);
        button.appendChild(document.createTextNode(' Conferir / dar baixa'));
      }
    });
  }

  function sortedMovementDescriptors() {
    const entries = Array.isArray(runtime.snapshot?.entries)
      ? runtime.snapshot.entries
      : [];
    const withdrawals = Array.isArray(runtime.snapshot?.withdrawals)
      ? runtime.snapshot.withdrawals
      : [];

    return [
      ...entries.map(entry => ({ kind: 'ENTRY', createdAt: entry.createdAt, data: entry })),
      ...withdrawals.map(withdrawal => ({ kind: 'WITHDRAWAL', createdAt: withdrawal.createdAt, data: withdrawal }))
    ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function addPostCloseDeleteButtons() {
    if (!runtime.snapshot?.closure) return;

    const articles = Array.from(
      document.querySelectorAll('#movementList article.movement-item')
    );
    const descriptors = sortedMovementDescriptors();

    articles.forEach((article, index) => {
      const descriptor = descriptors[index];
      if (!descriptor || descriptor.kind !== 'ENTRY') return;

      const entry = descriptor.data;
      const caStatus = String(entry.contaAzulStatus || '').toUpperCase();
      const canDelete =
        !entry.closureId &&
        String(entry.status || '').toUpperCase() !== 'EXCLUIDO' &&
        ['', 'NAO_ENVIADO', 'CANCELADO'].includes(caStatus);

      if (!canDelete || article.querySelector('[data-v3-delete-entry]')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'movement-delete-action';
      button.dataset.v3DeleteEntry = entry.id;
      button.innerHTML = '<span class="material-symbols-rounded">delete</span> Excluir';

      const target = article.querySelector('div') || article;
      target.appendChild(button);
    });
  }

  async function deletePostCloseEntry(entryId) {
    const entry = (runtime.snapshot?.entries || []).find(item => item.id === entryId);
    if (!entry || entry.closureId) return;

    const reason = window.prompt(
      'Motivo da exclusão deste lançamento:',
      'Correção antes do fechamento complementar'
    );
    if (reason === null) return;
    if (String(reason).trim().length < 3) {
      window.alert('Informe um motivo para manter a auditoria do lançamento.');
      return;
    }

    if (!window.confirm('Excluir este lançamento dos movimentos e dos totais?')) return;

    try {
      await post('deleteEntry', {
        payload: {
          entryId,
          reason: String(reason).trim()
        }
      });
      window.location.reload();
    } catch (error) {
      window.alert(error.message || 'Não foi possível excluir o lançamento.');
    }
  }

  function clientDefaultCandidate() {
    return (runtime.snapshot?.clients || []).find(client =>
      normalize(client.name) === 'cliente de balcao'
    ) || null;
  }

  function inAttendanceMode() {
    return (
      String(document.body.dataset.entryType || '').toUpperCase() === 'RECEITA' &&
      Boolean(document.querySelector('#modeSwitch [data-mode="ATENDIMENTO"].active'))
    );
  }

  function autoSelectWalkInClient() {
    if (
      runtime.defaultClientSuppressed ||
      runtime.selectingDefaultClient ||
      !inAttendanceMode()
    ) return;

    const input = document.getElementById('clientInput');
    const chip = document.getElementById('clientChip');
    const candidate = clientDefaultCandidate();

    if (!input || !chip || !candidate) return;
    if (!chip.classList.contains('hidden')) return;
    if (String(input.value || '').trim()) return;

    runtime.selectingDefaultClient = true;
    input.value = candidate.name;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
      const buttons = Array.from(
        document.querySelectorAll('#clientSuggestions [data-client-id]')
      );
      const target = buttons.find(button =>
        String(button.dataset.clientId || '') === String(candidate.id)
      ) || buttons.find(button => normalize(button.textContent) === 'cliente de balcao');

      if (target) target.click();
      runtime.selectingDefaultClient = false;
    }, 0);
  }

  function fortalezaToday() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(part => { if (part.type !== 'literal') map[part.type] = part.value; });
    return `${map.year}-${map.month}-${map.day}`;
  }

  function checkDateRollover() {
    const serverDate = String(runtime.snapshot?.serverDate || '');
    if (!serverDate) return;
    if (fortalezaToday() !== serverDate) {
      window.location.reload();
    }
  }

  function patchDom() {
    runtime.domPatchQueued = false;
    setMovementLabel();
    hideManualCountedCash();
    applyCurrentCashValue();
    releasePixCloseLock();
    renderSupplementAction();
    renderPendingBacklogNotice();
    renamePendingPixButtons();
    addPostCloseDeleteButtons();
    autoSelectWalkInClient();
  }

  function queueDomPatch() {
    if (runtime.domPatchQueued) return;
    runtime.domPatchQueued = true;
    requestAnimationFrame(patchDom);
  }

  const observer = new MutationObserver(queueDomPatch);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'disabled', 'data-entry-type']
  });

  document.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-v3-delete-entry]');
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      deletePostCloseEntry(deleteButton.dataset.v3DeleteEntry);
      return;
    }

    if (event.target.closest('#clientChip button')) {
      runtime.defaultClientSuppressed = true;
      return;
    }

    const clientOption = event.target.closest('#clientSuggestions [data-client-id]');
    if (clientOption) {
      const defaultClient = clientDefaultCandidate();
      runtime.defaultClientSuppressed = Boolean(
        defaultClient &&
        String(clientOption.dataset.clientId || '') !== String(defaultClient.id)
      );
      return;
    }

    if (event.target.closest('[data-entry-type]')) {
      runtime.defaultClientSuppressed = false;
    }

    if (event.target.closest('#btnSaveSingle, #btnSaveBatch')) {
      setTimeout(() => {
        runtime.defaultClientSuppressed = false;
        queueDomPatch();
      }, 700);
    }
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'closeDeclaration' && event.target.checked) {
      hideManualCountedCash();
    }
  }, true);

  window.CaixaV3 = {
    getSnapshot() {
      return runtime.snapshot;
    },
    getSupplementState() {
      return runtime.supplementState;
    },
    refreshUi: queueDomPatch
  };

  setInterval(checkDateRollover, 30000);
  queueDomPatch();
})();
