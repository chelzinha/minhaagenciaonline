'use strict';

(() => {
  const DEFAULT_API_URL =
    'https://script.google.com/macros/s/AKfycbxH-9PPg_R5i5YGYuZOgizOK-_i9XssRvvoA21XFnxt0nZr9SF87jFysf4s3bhNVSIe/exec';

  const API_OVERRIDE_KEY = 'caixa_avista_v3_api_url';
  const DEFAULT_UNIT_KEY = 'caixa_avista_v3_default_unit';
  const USER_UNIT_PREFIX = 'caixa_avista_v3_default_unit:';
  const USER_UNITS_PREFIX = 'caixa_avista_v3_units:';
  const FORCE_SELECTION_KEY = 'caixa_avista_v3_force_unit_selection';
  const LEGACY_UNIT_PREFIX = 'caixa_avista_v2_selected_unit:';
  const APP_VERSION = '20260905011500';

  const originalFetch = window.fetch.bind(window);

  let selectedUnitId = '';
  let currentUsername = '';
  let availableUnits = [];
  let fetchWrapped = false;
  let appLoaded = false;

  function validApiUrl(value) {
    const url = String(value || '').trim();
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)
      ? url
      : '';
  }

  function apiUrl() {
    try {
      return validApiUrl(localStorage.getItem(API_OVERRIDE_KEY)) || DEFAULT_API_URL;
    } catch (_) {
      return DEFAULT_API_URL;
    }
  }

  const authToken = () => String(window.AgfAuth?.getToken?.() || '').trim();

  function normalizeUser(value) {
    return String(value || '').trim().toLowerCase();
  }

  function userUnitKey(username) {
    return USER_UNIT_PREFIX + normalizeUser(username);
  }

  function userUnitsKey(username) {
    return USER_UNITS_PREFIX + normalizeUser(username);
  }

  function legacyUnitKey(username) {
    return LEGACY_UNIT_PREFIX + normalizeUser(username);
  }

  function localUsername() {
    try {
      const session = window.AgfAuth?.getLocalSession?.();
      const payload = session?.payload || {};
      const cached = session?.user || window.AgfAuth?.getCachedUser?.() || {};
      return normalizeUser(
        payload.sub ||
        cached.username ||
        cached.id ||
        cached.user ||
        ''
      );
    } catch (_) {
      return '';
    }
  }

  function readDefaultUnit(username) {
    try {
      const userKey = username ? userUnitKey(username) : '';
      const userValue = userKey ? localStorage.getItem(userKey) : '';
      if (userValue) return String(userValue).trim();

      /*
       * O fallback global só é usado quando ainda não conhecemos o usuário.
       * Isso evita reaproveitar a unidade de outro usuário no mesmo navegador.
       */
      if (!username) {
        return String(localStorage.getItem(DEFAULT_UNIT_KEY) || '').trim();
      }
    } catch (_) {}
    return '';
  }

  function readCachedUnits(username) {
    if (!username) return [];
    try {
      const raw = localStorage.getItem(userUnitsKey(username));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function rememberUnits(username, units) {
    if (!username || !Array.isArray(units)) return;
    try {
      localStorage.setItem(userUnitsKey(username), JSON.stringify(units));
    } catch (_) {}
  }

  function rememberUnit(username, unitId) {
    const id = String(unitId || '').trim();
    if (!id) return;

    try {
      localStorage.setItem(DEFAULT_UNIT_KEY, id);
      if (username) localStorage.setItem(userUnitKey(username), id);
    } catch (_) {}

    try {
      if (username) sessionStorage.setItem(legacyUnitKey(username), id);
    } catch (_) {}
  }

  function forgetUnit(username) {
    try {
      if (!username || normalizeUser(username) === currentUsername) {
        localStorage.removeItem(DEFAULT_UNIT_KEY);
      }
      if (username) localStorage.removeItem(userUnitKey(username));
    } catch (_) {}

    try {
      if (username) sessionStorage.removeItem(legacyUnitKey(username));
    } catch (_) {}
  }

  function forceSelectionOnNextLoad() {
    try {
      sessionStorage.setItem(FORCE_SELECTION_KEY, '1');
    } catch (_) {}
  }

  function consumeForceSelection() {
    try {
      const forced = sessionStorage.getItem(FORCE_SELECTION_KEY) === '1';
      sessionStorage.removeItem(FORCE_SELECTION_KEY);
      return forced;
    } catch (_) {
      return false;
    }
  }

  async function waitForToken(timeoutMs = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const token = authToken();
      if (token) return token;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return '';
  }

  async function requestUnitAccess(unitId = '') {
    const response = await originalFetch(apiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'unitAccess',
        st: authToken(),
        unitId: String(unitId || '').trim()
      })
    });

    if (!response.ok) {
      throw new Error('Não foi possível consultar as unidades.');
    }

    return response.json();
  }

  function refreshSwitchButton() {
    const switchButton = document.getElementById('btnSwitchUnit');
    if (!switchButton) return;
    switchButton.classList.toggle('hidden', availableUnits.length <= 1);
  }

  function installUnitFetchContext() {
    if (fetchWrapped) return;

    window.fetch = async function(input, init = {}) {
      const target = typeof input === 'string'
        ? input
        : String(input?.url || '');
      const method = String(
        init.method || input?.method || 'GET'
      ).toUpperCase();

      const currentApiUrl = apiUrl();
      const isCaixaApi =
        target === currentApiUrl ||
        target === DEFAULT_API_URL;

      if (
        selectedUnitId &&
        isCaixaApi &&
        method === 'POST' &&
        typeof init.body === 'string'
      ) {
        try {
          const payload = JSON.parse(init.body);
          if (payload && typeof payload === 'object') {
            payload.unitId = selectedUnitId;
            return originalFetch(currentApiUrl, {
              ...init,
              body: JSON.stringify(payload)
            });
          }
        } catch (_) {}
      }

      if (isCaixaApi && target !== currentApiUrl) {
        return originalFetch(currentApiUrl, init);
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
      getApiUrl() {
        return apiUrl();
      },
      canSwitchUnit() {
        return availableUnits.length > 1;
      },
      clearSelection() {
        forgetUnit(currentUsername);
        forceSelectionOnNextLoad();
        window.location.reload();
      }
    };
  }

  function loadCaixaApplication() {
    if (appLoaded) return;
    appLoaded = true;

    const script = document.createElement('script');
    script.src = `/caixa-avista/app.js?v=${APP_VERSION}`;
    script.async = false;
    script.dataset.caixaApplication = 'true';
    script.onerror = () => showGateError(
      'Não foi possível carregar o aplicativo.'
    );
    document.body.appendChild(script);
  }

  function injectStyles() {
    if (document.getElementById('caixaUnitSelectorStyles')) return;

    const style = document.createElement('style');
    style.id = 'caixaUnitSelectorStyles';
    style.textContent = `
      body.caixa-unit-gate-active { overflow: hidden; }
      body.caixa-unit-gate-active .app-shell { visibility: hidden; }
      .caixa-unit-gate {
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        background: radial-gradient(circle at top,#eaf4ff 0,#f6f9fc 42%,#edf2f7 100%);
        font-family: "Source Sans 3",system-ui,sans-serif;
      }
      .caixa-unit-card {
        width: min(100%,520px); padding: 30px;
        border: 1px solid rgba(15,110,232,.12); border-radius: 28px;
        background: #fff; box-shadow: 0 24px 70px rgba(15,56,97,.18);
        text-align: center;
      }
      .caixa-unit-symbol {
        display: inline-flex; width: 68px; height: 68px;
        align-items: center; justify-content: center; margin-bottom: 14px;
        border-radius: 22px; background: #0f6ee8; color: #fff;
      }
      .caixa-unit-symbol .material-symbols-rounded { font-size: 36px; }
      .caixa-unit-card h1 { margin: 0; color: #17324d; font-size: 28px; }
      .caixa-unit-card > p { margin: 10px 0 24px; color: #62758a; font-size: 17px; }
      .caixa-unit-options { display: grid; gap: 14px; }
      .caixa-unit-button {
        display: grid; grid-template-columns: 58px minmax(0,1fr) 28px;
        align-items: center; min-height: 88px; padding: 14px 18px;
        border: 2px solid #dce8f5; border-radius: 20px;
        background: #fff; color: #17324d; cursor: pointer; text-align: left;
      }
      .caixa-unit-button:hover { border-color: #0f6ee8; box-shadow: 0 12px 28px rgba(15,110,232,.13); }
      .caixa-unit-button:disabled { opacity: .55; cursor: wait; }
      .unit-icon {
        display: inline-flex; width: 48px; height: 48px;
        align-items: center; justify-content: center; border-radius: 16px;
        background: #eaf4ff; color: #0f6ee8;
      }
      .unit-icon .material-symbols-rounded { font-size: 28px; }
      .caixa-unit-button strong { display: block; font-size: 20px; }
      .caixa-unit-button small { display: block; margin-top: 2px; color: #718399; font-size: 14px; }
      .unit-arrow { color: #0f6ee8; font-size: 26px; }
      .caixa-unit-status {
        display: none; margin-top: 18px; padding: 13px 15px;
        border-radius: 14px; font-size: 15px;
      }
      .caixa-unit-status.show { display: block; }
      .caixa-unit-status.error { background: #fff0f0; color: #a72929; }
      .caixa-unit-status.loading { background: #eef6ff; color: #175a9d; }
      .caixa-unit-retry {
        display: none; width: 100%; margin-top: 12px; padding: 13px 18px;
        border: 0; border-radius: 14px; background: #17324d; color: #fff;
        font: inherit; font-weight: 700; cursor: pointer;
      }
      .caixa-unit-retry.show { display: block; }
      @media (max-width:560px) {
        .caixa-unit-gate { align-items: stretch; padding: 14px; }
        .caixa-unit-card { display: flex; flex-direction: column; justify-content: center; padding: 24px 18px; }
      }
    `;
    document.head.appendChild(style);
  }

  function mountGate() {
    injectStyles();
    document.body.classList.add('caixa-unit-gate-active');

    let gate = document.getElementById('caixaUnitGate');
    if (gate) return gate;

    gate = document.createElement('div');
    gate.id = 'caixaUnitGate';
    gate.className = 'caixa-unit-gate';
    gate.innerHTML = `
      <section class="caixa-unit-card" role="dialog" aria-modal="true" aria-labelledby="caixaUnitTitle">
        <div class="caixa-unit-symbol"><span class="material-symbols-rounded">point_of_sale</span></div>
        <h1 id="caixaUnitTitle">Caixa Balcão</h1>
        <p id="caixaUnitSubtitle">Escolha a unidade deste computador.</p>
        <div id="caixaUnitOptions" class="caixa-unit-options"></div>
        <div id="caixaUnitStatus" class="caixa-unit-status"></div>
        <button id="caixaUnitRetry" class="caixa-unit-retry" type="button">Tentar novamente</button>
      </section>`;
    document.body.appendChild(gate);
    document.getElementById('caixaUnitRetry')?.addEventListener('click', () => window.location.reload());
    return gate;
  }

  function gateElement(id) {
    return document.getElementById(id);
  }

  function setGateMessage(message, type = 'loading') {
    const node = gateElement('caixaUnitStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `caixa-unit-status ${type} show`;
  }

  function showGateError(message) {
    mountGate();
    setGateMessage(message, 'error');
    gateElement('caixaUnitRetry')?.classList.add('show');
  }

  function removeGate() {
    document.getElementById('caixaUnitGate')?.remove();
    document.body.classList.remove('caixa-unit-gate-active');
  }

  function unitIcon(unitId) {
    return unitId === 'SHOPPING_METRO' ? 'subway' : 'storefront';
  }

  function renderUnitButtons(units) {
    mountGate();
    const options = gateElement('caixaUnitOptions');
    options.innerHTML = '';

    const status = gateElement('caixaUnitStatus');
    if (status) status.className = 'caixa-unit-status';
    gateElement('caixaUnitRetry')?.classList.remove('show');

    units.forEach(unit => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'caixa-unit-button';
      button.dataset.unitId = unit.id;
      button.innerHTML = `
        <span class="unit-icon"><span class="material-symbols-rounded">${unitIcon(unit.id)}</span></span>
        <span><strong></strong><small></small></span>
        <span class="material-symbols-rounded unit-arrow">arrow_forward</span>`;
      button.querySelector('strong').textContent = unit.name;
      button.querySelector('small').textContent =
        unit.id === 'SHOPPING_METRO' ? 'Caixa do Shopping Metrô' : 'Caixa da AGF';
      button.addEventListener('click', () => chooseUnit(unit));
      options.appendChild(button);
    });
  }

  async function activateUnit(username, unit) {
    currentUsername = normalizeUser(username || currentUsername);
    selectedUnitId = String(unit.id || '').trim();
    rememberUnit(currentUsername, selectedUnitId);
    exposeUnitContext();
    installUnitFetchContext();
    removeGate();
    loadCaixaApplication();
  }

  async function chooseUnit(unit) {
    document.querySelectorAll('.caixa-unit-button').forEach(button => {
      button.disabled = true;
    });
    setGateMessage(`Abrindo ${unit.name}...`, 'loading');

    try {
      const result = await requestUnitAccess(unit.id);
      currentUsername = normalizeUser(result.username || currentUsername);
      availableUnits = Array.isArray(result.units) ? result.units : availableUnits;
      rememberUnits(currentUsername, availableUnits);

      if (!result.ok || !result.selectedUnit) {
        throw new Error(result.message || 'A unidade não foi autorizada.');
      }

      await activateUnit(currentUsername, result.selectedUnit);
    } catch (error) {
      document.querySelectorAll('.caixa-unit-button').forEach(button => {
        button.disabled = false;
      });
      showGateError(error.message || 'Não foi possível abrir a unidade.');
    }
  }

  async function validateRememberedUnit(unitId) {
    try {
      const result = await requestUnitAccess(unitId);
      const resolvedUsername = normalizeUser(result.username || currentUsername);
      const units = Array.isArray(result.units) ? result.units : [];

      if (!result.ok || !result.selectedUnit) {
        forgetUnit(resolvedUsername || currentUsername);
        rememberUnits(resolvedUsername || currentUsername, units);
        forceSelectionOnNextLoad();
        window.location.reload();
        return;
      }

      currentUsername = resolvedUsername || currentUsername;
      selectedUnitId = String(result.selectedUnit.id || unitId).trim();
      availableUnits = units;
      rememberUnit(currentUsername, selectedUnitId);
      rememberUnits(currentUsername, availableUnits);
      exposeUnitContext();
      refreshSwitchButton();
    } catch (error) {
      /*
       * Falha de rede não derruba uma sessão que já abriu. O próprio backend
       * valida a unidade em init e em cada gravação do Caixa.
       */
      console.warn('[CAIXA_V3_UNIT_BACKGROUND_VALIDATION]', error);
    }
  }

  async function start() {
    exposeUnitContext();

    try {
      const auth = await waitForToken();
      if (!auth) {
        throw new Error('Sua sessão não ficou disponível a tempo. Atualize a página.');
      }

      currentUsername = localUsername();
      const forceSelection = consumeForceSelection();
      const remembered = forceSelection ? '' : readDefaultUnit(currentUsername);

      /*
       * V3 rápida: se já existe unidade padrão deste usuário, o frontend abre
       * imediatamente. A validação de acesso roda em paralelo e o backend ainda
       * valida a unidade no init e em todas as operações, portanto não há atalho
       * de segurança. Eliminamos apenas a espera visual por uma chamada redundante.
       */
      if (remembered) {
        selectedUnitId = remembered;
        availableUnits = readCachedUnits(currentUsername);
        exposeUnitContext();
        installUnitFetchContext();
        removeGate();
        loadCaixaApplication();
        validateRememberedUnit(remembered);
        return;
      }

      const result = await requestUnitAccess('');
      currentUsername = normalizeUser(result.username || currentUsername);
      availableUnits = Array.isArray(result.units) ? result.units : [];
      rememberUnits(currentUsername, availableUnits);

      if (!result.ok) {
        throw new Error(result.message || 'Não foi possível validar o acesso ao Caixa.');
      }

      if (result.selectedUnit) {
        await activateUnit(currentUsername, result.selectedUnit);
        return;
      }

      if (availableUnits.length === 1) {
        await chooseUnit(availableUnits[0]);
        return;
      }

      if (!availableUnits.length) {
        throw new Error('Seu usuário não possui unidade disponível no Caixa.');
      }

      renderUnitButtons(availableUnits);
    } catch (error) {
      showGateError(error.message || 'Não foi possível iniciar o Caixa.');
    }
  }

  window.addEventListener('DOMContentLoaded', start, { once: true });
})();