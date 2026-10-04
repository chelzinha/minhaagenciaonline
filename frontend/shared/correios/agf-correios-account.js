/* Credenciais CWS e simulação de frete do cliente (Gateway Correios AGF).
   Montado dentro do cadastro do cliente (/admin/cadastros). */
(function (global) {
  'use strict';

  const DEFAULT_CODES = { SEDEX: '03220', PAC: '03298', MINI_ENVIOS: '04227' };
  const SERVICE_LABELS = { SEDEX: 'SEDEX', PAC: 'PAC', MINI_ENVIOS: 'Mini Envios' };

  const state = { customerId: '', account: null, core: null, busy: false };
  const els = {};

  // ---------------------------------------------------------- API

  function apiUrl() {
    const cfg = global.AGF_CORREIOS_CONFIG || {};
    const value = String(cfg.apiUrl || '').replace(/\/$/, '');
    if (!value) throw new Error('Gateway Correios não configurado.');
    return value;
  }

  async function request(path, options) {
    const token = global.AgfAuth && global.AgfAuth.getToken ? global.AgfAuth.getToken() : '';
    if (!token) throw new Error('Faça login novamente.');
    const response = await fetch(apiUrl() + path, {
      method: (options && options.method) || 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: options && options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok === false) {
      const error = new Error((data && data.error) || 'Não foi possível concluir a operação.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  const accountPath = (id) => '/api/correios/accounts/' + encodeURIComponent(id);

  // ---------------------------------------------------------- UI

  function field(label, name, attrs) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const input = document.createElement(attrs && attrs.tag === 'select' ? 'select' : 'input');
    input.dataset.cws = name;
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === 'tag' || key === 'options') return;
      input.setAttribute(key, value);
    });
    if (attrs && attrs.options) {
      attrs.options.forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        input.appendChild(option);
      });
    }
    wrap.appendChild(input);
    els[name] = input;
    return wrap;
  }

  function button(text, primary) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = primary ? 'cws-btn cws-btn-primary' : 'cws-btn';
    node.textContent = text;
    return node;
  }

  function build() {
    if (els.section) return true;
    els.section = document.getElementById('correiosGatewaySection');
    if (!els.section) return false;

    els.section.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'section-title';
    title.innerHTML = '<h3>Credenciais CWS e cotação</h3>' +
      '<p>Guardadas criptografadas no Gateway Correios AGF e usadas por todos os canais (Shopify, Nuvemshop, Balcão). O código de acesso nunca volta para a tela.</p>';

    els.status = document.createElement('div');
    els.status.className = 'cws-status';

    const grid = document.createElement('div');
    grid.className = 'form-grid';
    grid.append(
      field('Login idCorreios', 'login', { autocomplete: 'off', maxlength: '80' }),
      field('Código de acesso à API', 'accessCode', { type: 'password', autocomplete: 'new-password', maxlength: '200' }),
      field('Ambiente', 'environment', { tag: 'select', options: [['PRODUCAO', 'Produção'], ['HOMOLOGACAO', 'Homologação']] }),
      field('Número da DR (nuDR)', 'drNumber', { inputmode: 'numeric', maxlength: '3' }),
      field('CEP de origem (remetente)', 'originCep', { inputmode: 'numeric', maxlength: '9' }),
      field('Código SEDEX', 'codeSEDEX', { inputmode: 'numeric', maxlength: '5', placeholder: DEFAULT_CODES.SEDEX }),
      field('Código PAC', 'codePAC', { inputmode: 'numeric', maxlength: '5', placeholder: DEFAULT_CODES.PAC }),
      field('Código Mini Envios', 'codeMINI_ENVIOS', { inputmode: 'numeric', maxlength: '5', placeholder: DEFAULT_CODES.MINI_ENVIOS })
    );

    const hint = document.createElement('p');
    hint.className = 'integration-note';
    hint.textContent = 'Códigos de serviço e DR constam no contrato. Contrato e cartão vêm do bloco "Conta Correios" acima.';

    const actions = document.createElement('div');
    actions.className = 'cws-actions';
    els.saveBtn = button('Salvar e testar credenciais', true);
    els.checkBtn = button('Testar novamente', false);
    actions.append(els.saveBtn, els.checkBtn);

    // Simulador
    const sim = document.createElement('div');
    sim.className = 'cws-sim';
    const simTitle = document.createElement('strong');
    simTitle.textContent = 'Simular frete com o contrato';
    const simGrid = document.createElement('div');
    simGrid.className = 'cws-sim-grid';
    simGrid.append(
      field('CEP de destino', 'simCep', { inputmode: 'numeric', maxlength: '9' }),
      field('Peso (g)', 'simWeight', { type: 'number', min: '1', max: '30000', value: '300' }),
      field('Formato', 'simFormat', { tag: 'select', options: [['CAIXA', 'Caixa'], ['ENVELOPE', 'Envelope']] }),
      field('C (cm)', 'simLength', { type: 'number', min: '15', max: '100', value: '20' }),
      field('L (cm)', 'simWidth', { type: 'number', min: '10', max: '100', value: '15' }),
      field('A (cm)', 'simHeight', { type: 'number', min: '1', max: '100', value: '10' })
    );
    els.simBtn = button('Simular', true);
    els.simResult = document.createElement('div');
    els.simResult.className = 'cws-sim-result';
    sim.append(simTitle, simGrid, els.simBtn, els.simResult);

    els.section.append(title, els.status, grid, hint, actions, sim);

    els.section.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
    });
    els.saveBtn.addEventListener('click', save);
    els.checkBtn.addEventListener('click', check);
    els.simBtn.addEventListener('click', simulate);
    return true;
  }

  function setStatus(text, tone) {
    els.status.textContent = text || '';
    els.status.className = 'cws-status' + (tone ? ' cws-' + tone : '');
    els.status.hidden = !text;
  }

  function setBusy(busy) {
    state.busy = busy;
    [els.saveBtn, els.checkBtn, els.simBtn].forEach((node) => { node.disabled = busy; });
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function updateCoreNote(account) {
    const note = document.getElementById('correiosCredentialNote');
    if (!note) return;
    if (!account || !account.credentialsConfigured) {
      note.textContent = 'Credenciais CWS ainda não configuradas no Gateway Correios.';
    } else if (account.checkStatus === 'OK') {
      note.textContent = 'Credenciais CWS validadas no Gateway Correios.';
    } else {
      note.textContent = 'Credenciais CWS cadastradas, mas com problema. Veja o bloco abaixo.';
    }
  }

  function render() {
    const account = state.account;
    const coreCorreios = state.core && state.core.correios;
    const form = document.getElementById('customerForm');
    const customerCep = form && form.elements.postalCode ? digits(form.elements.postalCode.value) : '';

    els.login.value = '';
    els.login.placeholder = account && account.loginHint ? 'Salvo: ' + account.loginHint + ' (deixe em branco para manter)' : '';
    els.accessCode.value = '';
    els.accessCode.placeholder = account && account.credentialsConfigured ? 'Salvo (deixe em branco para manter)' : '';
    els.environment.value = (account && account.environment) || 'PRODUCAO';
    els.drNumber.value = (account && account.drNumber) || digits(coreCorreios && coreCorreios.dr).slice(0, 3);
    els.originCep.value = (account && account.originCep) || customerCep;
    ['SEDEX', 'PAC', 'MINI_ENVIOS'].forEach((service) => {
      els['code' + service].value = (account && account.services && account.services[service]) || DEFAULT_CODES[service];
    });
    els.simResult.innerHTML = '';

    if (!coreCorreios || !coreCorreios.contractNumber || !coreCorreios.postingCard) {
      setStatus('Preencha contrato e cartão em "Conta Correios" e salve o cliente antes das credenciais.', 'warn');
    } else if (!account) {
      setStatus('Credenciais ainda não cadastradas.', 'warn');
    } else if (account.checkStatus === 'OK') {
      const apis = account.apis && account.apis.length ? ' APIs liberadas no cartão: ' + account.apis.join(', ') + '.' : '';
      setStatus('Conectado. ' + (account.checkMessage || '') + apis, 'ok');
    } else if (account.checkStatus === 'ERROR') {
      setStatus('Erro: ' + (account.checkMessage || 'falha ao validar.'), 'error');
    } else {
      setStatus(account.checkMessage || 'Credenciais pendentes de teste.', 'warn');
    }
    els.checkBtn.hidden = !account;
    updateCoreNote(account);
  }

  async function load(customerId) {
    if (!build()) return;
    state.customerId = customerId || '';
    state.account = null;
    state.core = null;
    els.section.hidden = !state.customerId;
    if (!state.customerId) return;

    setStatus('Carregando credenciais...', '');
    setBusy(true);
    try {
      const data = await request(accountPath(state.customerId));
      if (state.customerId !== customerId) return;
      state.account = data.account;
      state.core = data.core;
      render();
    } catch (error) {
      setStatus(error.message || 'Gateway Correios indisponível.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function payload() {
    const services = {};
    ['SEDEX', 'PAC', 'MINI_ENVIOS'].forEach((service) => {
      services[service] = digits(els['code' + service].value) || DEFAULT_CODES[service];
    });
    return {
      login: els.login.value.trim(),
      accessCode: els.accessCode.value.trim(),
      environment: els.environment.value,
      drNumber: digits(els.drNumber.value),
      originCep: digits(els.originCep.value),
      services
    };
  }

  async function save() {
    if (!state.customerId || state.busy) return;
    setBusy(true);
    setStatus('Salvando e testando com os Correios...', '');
    try {
      const data = await request(accountPath(state.customerId), { method: 'PUT', body: payload() });
      state.account = data.account;
      render();
    } catch (error) {
      setStatus(error.message || 'Não foi possível salvar as credenciais.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!state.customerId || state.busy) return;
    setBusy(true);
    setStatus('Testando com os Correios...', '');
    try {
      const data = await request(accountPath(state.customerId) + '/check', { method: 'POST' });
      state.account = data.account;
      render();
    } catch (error) {
      setStatus(error.message || 'Falha ao testar.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function money(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }

  async function simulate() {
    if (!state.customerId || state.busy) return;
    setBusy(true);
    els.simResult.textContent = 'Consultando os Correios...';
    try {
      const data = await request('/api/correios/quote', {
        method: 'POST',
        body: {
          customerId: state.customerId,
          cepDestino: digits(els.simCep.value),
          weightGrams: els.simWeight.value,
          format: els.simFormat.value,
          lengthCm: els.simLength.value,
          widthCm: els.simWidth.value,
          heightCm: els.simHeight.value,
          services: ['SEDEX', 'PAC', 'MINI_ENVIOS'],
          fresh: true
        }
      });
      els.simResult.innerHTML = '';
      for (const item of data.quotes || []) {
        const row = document.createElement('div');
        row.className = 'cws-sim-row' + (item.ok ? '' : ' is-error');
        const name = document.createElement('strong');
        name.textContent = (SERVICE_LABELS[item.service] || item.service) + ' (' + item.code + ')';
        const value = document.createElement('span');
        value.textContent = item.ok
          ? money(item.price) + ' · ' + (item.days ? item.days + ' dia(s) úteis' : 'prazo indisponível')
          : item.error;
        row.append(name, value);
        els.simResult.appendChild(row);
      }
    } catch (error) {
      els.simResult.textContent = error.message || 'Falha na simulação.';
    } finally {
      setBusy(false);
    }
  }

  // Chamado pelo cadastro depois de salvar a Conta Correios no AGF Core.
  async function syncAfterCoreSave(customerId) {
    if (!customerId) return;
    try {
      await request(accountPath(customerId) + '/sync', { method: 'POST' });
    } catch (error) {
      console.warn('[AGF_CORREIOS] sync:', error && error.message);
    }
  }

  global.AgfCorreiosAccount = Object.freeze({ load, syncAfterCoreSave });
})(window);
