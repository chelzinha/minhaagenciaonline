'use strict';

(() => {
  const API_STORAGE = 'caixa_avista_v2_api_url';
  const UNIT_STORAGE_PREFIX =
    'caixa_avista_v2_selected_unit:';

  const originalFetch = window.fetch.bind(window);

  let selectedUnitId = '';
  let fetchWrapped = false;
  let appLoaded = false;
  let currentUsername = '';

  const apiUrl = () =>
    String(
      localStorage.getItem(API_STORAGE) || ''
    ).trim();

  const authToken = () =>
    String(
      window.AgfAuth?.getToken?.() || ''
    ).trim();

  function selectedUnitStorageKey(username) {
    return (
      UNIT_STORAGE_PREFIX +
      String(username || '').trim().toLowerCase()
    );
  }

  function rememberUnit(username, unitId) {
    sessionStorage.setItem(
      selectedUnitStorageKey(username),
      unitId
    );
  }

  function rememberedUnit(username) {
    return String(
      sessionStorage.getItem(
        selectedUnitStorageKey(username)
      ) || ''
    ).trim();
  }

  function forgetUnit(username) {
    sessionStorage.removeItem(
      selectedUnitStorageKey(username)
    );
  }

  async function waitForToken(timeoutMs = 10000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const token = authToken();

      if (token) {
        return token;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 100)
      );
    }

    return '';
  }

  async function requestUnitAccess(unitId = '') {
    const response = await originalFetch(apiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type':
          'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'unitAccess',
        st: authToken(),
        unitId
      })
    });

    if (!response.ok) {
      throw new Error(
        'Não foi possível consultar as unidades.'
      );
    }

    return response.json();
  }

  function installUnitFetchContext() {
    if (fetchWrapped) {
      return;
    }

    window.fetch = async function(input, init = {}) {
      const target =
        typeof input === 'string'
          ? input
          : String(input?.url || '');

      const method = String(
        init.method ||
        input?.method ||
        'GET'
      ).toUpperCase();

      if (
        selectedUnitId &&
        target === apiUrl() &&
        method === 'POST' &&
        typeof init.body === 'string'
      ) {
        try {
          const payload = JSON.parse(init.body);

          if (
            payload &&
            typeof payload === 'object'
          ) {
            payload.unitId = selectedUnitId;

            return originalFetch(input, {
              ...init,
              body: JSON.stringify(payload)
            });
          }
        } catch (_) {
          // Mantém a requisição original.
        }
      }

      return originalFetch(input, init);
    };

    fetchWrapped = true;
  }

  function exposeUnitContext() {
    window.CaixaUnitContext = {
      getSelectedUnitId() {
        return selectedUnitId;
      },

      getUsername() {
        return currentUsername;
      },

      clearSelection() {
        if (currentUsername) {
          forgetUnit(currentUsername);
        }

        window.location.reload();
      }
    };
  }

  function loadCaixaApplication() {
    if (appLoaded) {
      return;
    }

    appLoaded = true;

    const script = document.createElement('script');

    script.src = '/caixa-avista/app.js?v=20260901135833';
    script.async = false;
    script.dataset.caixaApplication = 'true';

    script.onerror = () => {
      showGateError(
        'Não foi possível carregar o aplicativo.'
      );
    };

    document.body.appendChild(script);
  }

  function injectStyles() {
    if (
      document.getElementById(
        'caixaUnitSelectorStyles'
      )
    ) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'caixaUnitSelectorStyles';
    style.textContent = `
      body.caixa-unit-gate-active {
        overflow: hidden;
      }

      body.caixa-unit-gate-active .app-shell {
        visibility: hidden;
      }

      .caixa-unit-gate {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
          radial-gradient(
            circle at top,
            #eaf4ff 0,
            #f6f9fc 42%,
            #edf2f7 100%
          );
        font-family:
          "Source Sans 3",
          system-ui,
          sans-serif;
      }

      .caixa-unit-card {
        width: min(100%, 520px);
        padding: 30px;
        border: 1px solid
          rgba(15, 110, 232, 0.12);
        border-radius: 28px;
        background: #ffffff;
        box-shadow:
          0 24px 70px
          rgba(15, 56, 97, 0.18);
        text-align: center;
      }

      .caixa-unit-symbol {
        display: inline-flex;
        width: 68px;
        height: 68px;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
        border-radius: 22px;
        background: #0f6ee8;
        color: #ffffff;
      }

      .caixa-unit-symbol
      .material-symbols-rounded {
        font-size: 36px;
      }

      .caixa-unit-card h1 {
        margin: 0;
        color: #17324d;
        font-size: 28px;
        line-height: 1.1;
      }

      .caixa-unit-card > p {
        margin: 10px 0 24px;
        color: #62758a;
        font-size: 17px;
      }

      .caixa-unit-options {
        display: grid;
        gap: 14px;
      }

      .caixa-unit-button {
        display: grid;
        grid-template-columns:
          58px minmax(0, 1fr) 28px;
        align-items: center;
        min-height: 88px;
        padding: 14px 18px;
        border: 2px solid #dce8f5;
        border-radius: 20px;
        background: #ffffff;
        color: #17324d;
        cursor: pointer;
        text-align: left;
        transition:
          transform 150ms ease,
          border-color 150ms ease,
          box-shadow 150ms ease;
      }

      .caixa-unit-button:hover {
        transform: translateY(-2px);
        border-color: #0f6ee8;
        box-shadow:
          0 12px 28px
          rgba(15, 110, 232, 0.13);
      }

      .caixa-unit-button:disabled {
        opacity: 0.55;
        cursor: wait;
        transform: none;
      }

      .caixa-unit-button
      .unit-icon {
        display: inline-flex;
        width: 48px;
        height: 48px;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        background: #eaf4ff;
        color: #0f6ee8;
      }

      .caixa-unit-button
      .unit-icon
      .material-symbols-rounded {
        font-size: 28px;
      }

      .caixa-unit-button strong {
        display: block;
        font-size: 20px;
      }

      .caixa-unit-button small {
        display: block;
        margin-top: 2px;
        color: #718399;
        font-size: 14px;
      }

      .caixa-unit-button
      .unit-arrow {
        color: #0f6ee8;
        font-size: 26px;
      }

      .caixa-unit-status {
        display: none;
        margin-top: 18px;
        padding: 13px 15px;
        border-radius: 14px;
        font-size: 15px;
        line-height: 1.35;
      }

      .caixa-unit-status.show {
        display: block;
      }

      .caixa-unit-status.error {
        background: #fff0f0;
        color: #a72929;
      }

      .caixa-unit-status.loading {
        background: #eef6ff;
        color: #175a9d;
      }

      .caixa-unit-retry {
        display: none;
        width: 100%;
        margin-top: 12px;
        padding: 13px 18px;
        border: 0;
        border-radius: 14px;
        background: #17324d;
        color: #ffffff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .caixa-unit-retry.show {
        display: block;
      }

      @media (max-width: 560px) {
        .caixa-unit-gate {
          align-items: stretch;
          padding: 14px;
        }

        .caixa-unit-card {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 24px 18px;
          border-radius: 24px;
        }

        .caixa-unit-button {
          min-height: 82px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function mountGate() {
    injectStyles();

    document.body.classList.add(
      'caixa-unit-gate-active'
    );

    const gate = document.createElement('div');

    gate.id = 'caixaUnitGate';
    gate.className = 'caixa-unit-gate';

    gate.innerHTML = `
      <section
        class="caixa-unit-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="caixaUnitTitle"
      >
        <div class="caixa-unit-symbol">
          <span class="material-symbols-rounded">
            point_of_sale
          </span>
        </div>

        <h1 id="caixaUnitTitle">
          Caixa Balcão
        </h1>

        <p id="caixaUnitSubtitle">
          Verificando suas unidades...
        </p>

        <div
          id="caixaUnitOptions"
          class="caixa-unit-options"
        ></div>

        <div
          id="caixaUnitStatus"
          class="caixa-unit-status loading show"
        >
          Aguarde um momento.
        </div>

        <button
          id="caixaUnitRetry"
          class="caixa-unit-retry"
          type="button"
        >
          Tentar novamente
        </button>
      </section>
    `;

    document.body.appendChild(gate);

    document
      .getElementById('caixaUnitRetry')
      .addEventListener('click', () => {
        window.location.reload();
      });
  }

  function gateElement(id) {
    return document.getElementById(id);
  }

  function setGateMessage(
    message,
    type = 'loading'
  ) {
    const status =
      gateElement('caixaUnitStatus');

    if (!status) {
      return;
    }

    status.textContent = message;
    status.className =
      `caixa-unit-status ${type} show`;
  }

  function showGateError(message) {
    setGateMessage(message, 'error');

    gateElement('caixaUnitRetry')
      ?.classList.add('show');
  }

  function setButtonsDisabled(disabled) {
    document
      .querySelectorAll('.caixa-unit-button')
      .forEach(button => {
        button.disabled = disabled;
      });
  }

  function removeGate() {
    document
      .getElementById('caixaUnitGate')
      ?.remove();

    document.body.classList.remove(
      'caixa-unit-gate-active'
    );
  }

  function unitIcon(unitId) {
    return unitId === 'SHOPPING_METRO'
      ? 'subway'
      : 'storefront';
  }

  function renderUnitButtons(units) {
    const options =
      gateElement('caixaUnitOptions');

    const subtitle =
      gateElement('caixaUnitSubtitle');

    const status =
      gateElement('caixaUnitStatus');

    subtitle.textContent =
      'Em qual unidade você vai trabalhar agora?';

    status.className = 'caixa-unit-status';
    status.textContent = '';

    options.innerHTML = '';

    units.forEach(unit => {
      const button =
        document.createElement('button');

      button.type = 'button';
      button.className = 'caixa-unit-button';
      button.dataset.unitId = unit.id;

      const icon = document.createElement('span');
      icon.className = 'unit-icon';
      icon.innerHTML = `
        <span class="material-symbols-rounded">
          ${unitIcon(unit.id)}
        </span>
      `;

      const copy = document.createElement('span');
      const title = document.createElement('strong');
      const detail = document.createElement('small');

      title.textContent = unit.name;
      detail.textContent =
        unit.id === 'SHOPPING_METRO'
          ? 'Caixa do Shopping Metrô'
          : 'Caixa da AGF';

      copy.append(title, detail);

      const arrow =
        document.createElement('span');

      arrow.className =
        'material-symbols-rounded unit-arrow';

      arrow.textContent = 'arrow_forward';

      button.append(icon, copy, arrow);

      button.addEventListener('click', () => {
        chooseUnit(unit);
      });

      options.appendChild(button);
    });
  }

  async function activateUnit(
    username,
    unit
  ) {
    currentUsername = username;
    selectedUnitId = unit.id;

    rememberUnit(username, unit.id);
    exposeUnitContext();
    installUnitFetchContext();

    removeGate();
    loadCaixaApplication();
  }

  async function chooseUnit(unit) {
    try {
      setButtonsDisabled(true);

      setGateMessage(
        `Abrindo ${unit.name}...`,
        'loading'
      );

      const result =
        await requestUnitAccess(unit.id);

      if (
        !result.ok ||
        !result.selectedUnit
      ) {
        throw new Error(
          result.message ||
          'A unidade não foi autorizada.'
        );
      }

      await activateUnit(
        result.username,
        result.selectedUnit
      );
    } catch (error) {
      setButtonsDisabled(false);

      showGateError(
        error.message ||
        'Não foi possível abrir a unidade.'
      );
    }
  }

  async function start() {
    exposeUnitContext();

    /*
     * Sem URL configurada, mantém o modo local
     * usado na homologação.
     */
    if (!apiUrl()) {
      loadCaixaApplication();
      return;
    }

    mountGate();

    try {
      const token = await waitForToken();

      if (!token) {
        throw new Error(
          'Sua sessão do Portal AGF não foi encontrada.'
        );
      }

      const access =
        await requestUnitAccess('');

      if (!access.ok) {
        throw new Error(
          access.message ||
          'Seu usuário não possui acesso ao Caixa Balcão.'
        );
      }

      currentUsername = access.username;

      const storedUnitId =
        rememberedUnit(access.username);

      if (
        storedUnitId &&
        access.units.some(
          unit => unit.id === storedUnitId
        )
      ) {
        const storedAccess =
          await requestUnitAccess(
            storedUnitId
          );

        if (
          storedAccess.ok &&
          storedAccess.selectedUnit
        ) {
          await activateUnit(
            storedAccess.username,
            storedAccess.selectedUnit
          );

          return;
        }

        forgetUnit(access.username);
      }

      if (access.selectedUnit) {
        await activateUnit(
          access.username,
          access.selectedUnit
        );

        return;
      }

      if (
        access.requiresUnitSelection &&
        access.units.length
      ) {
        renderUnitButtons(access.units);
        return;
      }

      throw new Error(
        'Nenhuma unidade disponível para este usuário.'
      );
    } catch (error) {
      showGateError(
        error.message ||
        'Não foi possível verificar seu acesso.'
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );
  } else {
    start();
  }
})();