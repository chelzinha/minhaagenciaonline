/* =====================================================
   AGF SuperFrete Admin — App
   Etapa 7C: upload de logo do cliente e overlay PDF oficial.
   ===================================================== */

const SfAdminApp = (function () {
  const state = {
    user: null,
    clients: [],
    selectedClientId: '',
    currentScreen: 'dashboard',
    emission: null,
    sfConfig: null,
    lastQuotes: []
  };

  const $ = (id) => document.getElementById(id);
  const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function money(v) {
    const n = Number(v || 0);
    return moneyFmt.format(isNaN(n) ? 0 : n);
  }

  function parseMoney(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
    if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
    return Number(s) || 0;
  }

  function digitsOnly(v) {
    return String(v == null ? '' : v).replace(/\D/g, '');
  }

  function parseWeightGrams(v) {
    const n = parseMoney(v);
    return n > 0 ? Math.round(n) : 0;
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  function setLogoUploadStatus(message, cls) {
    const el = $('logoUploadStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'field-hint ' + (cls || '');
  }

  function updateLogoPreview(url, name) {
    const img = $('logoPreviewImg');
    const text = $('logoPreviewText');
    const cleanUrl = String(url || '').trim();
    const fallbackName = String(name || $('NOME_EXIBICAO')?.value || 'Logo do cliente').trim();
    if (!img || !text) return;

    function showText(message) {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      img.classList.add('hidden');
      text.classList.remove('hidden');
      text.textContent = message || fallbackName || 'Sem logo';
    }

    if (!cleanUrl) {
      showText(fallbackName ? fallbackName : 'Sem logo');
      return;
    }

    text.classList.remove('hidden');
    text.textContent = 'Carregando prévia...';
    img.classList.add('hidden');

    img.onload = () => {
      text.classList.add('hidden');
      text.textContent = '';
      img.classList.remove('hidden');
    };
    img.onerror = () => {
      const isDataUrl = cleanUrl.indexOf('data:image/') === 0;
      showText(fallbackName || 'Logo cadastrada');
      if (!isDataUrl) {
        setLogoUploadStatus('Logo salva, mas o link público do Drive não abriu na prévia. A etiqueta AGF usa uma cópia segura em base64 quando necessário.', 'warn');
      }
    };
    img.src = cleanUrl;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo da logo.'));
      reader.readAsDataURL(file);
    });
  }

  function getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUrl;
    });
  }

  async function handleLogoFilePreview() {
    const input = $('LOGO_FILE');
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type || '')) {
      input.value = '';
      setLogoUploadStatus('Use PNG, JPG ou WEBP. PNG transparente é o ideal.', 'error');
      return;
    }
    if (file.size > 1024 * 1024) {
      input.value = '';
      setLogoUploadStatus('Arquivo muito grande. Use uma imagem de até 1 MB.', 'error');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    const dim = await getImageDimensions(dataUrl);
    updateLogoPreview(dataUrl, file.name);
    const ratio = dim.width && dim.height ? (dim.width / dim.height) : 0;
    const hint = dim.width ? `Imagem selecionada: ${dim.width} × ${dim.height}px. ` : '';
    const ratioWarn = ratio && (ratio < 1.8 || ratio > 3.4) ? 'A proporção ideal é horizontal, perto de 2,5:1. ' : '';
    setLogoUploadStatus(hint + ratioWarn + 'Clique em Enviar logo para salvar no Drive.', ratioWarn ? 'warn' : 'ok');
  }

  async function uploadClientLogo() {
    const input = $('LOGO_FILE');
    const file = input && input.files && input.files[0];
    if (!file) return toast('Selecione uma imagem antes de enviar.', 'error');
    await safeRun(async () => {
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type || '')) throw new Error('Use PNG, JPG ou WEBP. PNG transparente é o ideal.');
      if (file.size > 1024 * 1024) throw new Error('Arquivo muito grande. Use uma imagem de até 1 MB.');
      const dataUrl = await readFileAsDataUrl(file);
      const dim = await getImageDimensions(dataUrl);
      const res = await SfAdminApi.uploadClientLogo({
        clienteId: $('CLIENTE_ID').value.trim(),
        nomeCliente: $('NOME_EXIBICAO').value.trim(),
        fileName: file.name,
        mimeType: file.type,
        base64: dataUrl,
        width: dim.width,
        height: dim.height
      });
      $('LOGO_DRIVE_ID').value = res.LOGO_DRIVE_ID || '';
      $('LOGO_URL').value = res.LOGO_URL || '';
      updateLogoPreview(res.previewDataUrl || res.LOGO_URL || dataUrl, $('NOME_EXIBICAO').value.trim());
      setLogoUploadStatus(`Logo salva no Drive (${dim.width || '?'} × ${dim.height || '?'}px). Ela será usada na Etiqueta AGF.`, 'ok');
      if (state.selectedClientId) await loadClients();
      return res;
    }, 'Logo enviada com sucesso.');
  }


  function fmtCepPlain(v) {
    return digitsOnly(v).slice(0, 8);
  }

  function fmtTracking(v) {
    const raw = String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
    if (raw.length === 13) return raw.slice(0, 2) + ' ' + raw.slice(2, 5) + ' ' + raw.slice(5, 8) + ' ' + raw.slice(8, 11) + ' ' + raw.slice(11);
    return raw;
  }

  function joinParts(parts, sep) {
    return (parts || []).map(v => String(v == null ? '' : v).trim()).filter(Boolean).join(sep || ' ');
  }

  function joinAddress(obj) {
    const street = joinParts([obj && (obj.ENDERECO || obj.endereco), obj && (obj.NUMERO || obj.numero)], ', ');
    return street;
  }

  function joinComplementBairro(obj) {
    const comp = obj && (obj.COMPLEMENTO || obj.complemento);
    const bairro = obj && (obj.BAIRRO || obj.bairro);
    return joinParts([comp ? 'Complemento: ' + comp : '', bairro ? 'Bairro: ' + bairro : ''], ' | ');
  }

  function joinCepCidadeUf(obj) {
    return joinParts([fmtCepPlain(obj && (obj.CEP || obj.cep)), joinParts([obj && (obj.CIDADE || obj.cidade), obj && (obj.UF || obj.uf)], '/')], ' ');
  }

  function buildCode128Svg(text, opts) {
    const value = String(text == null ? '' : text).replace(/\s+/g, '').toUpperCase();
    if (!value) return '';
    opts = opts || {};
    const height = Number(opts.height || 58);
    const mode = opts.mode || (/^\d+$/.test(value) && value.length % 2 === 0 ? 'C' : 'B');
    const patterns = [
      '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
      '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
      '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
      '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
      '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
      '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
      '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
      '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
      '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
      '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
      '114131','311141','411131','211412','211214','211232','2331112'
    ];
    const values = [];
    if (mode === 'C' && /^\d+$/.test(value) && value.length % 2 === 0) {
      values.push(105);
      for (let i = 0; i < value.length; i += 2) values.push(Number(value.slice(i, i + 2)));
    } else {
      values.push(104);
      for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 32 || code > 127) continue;
        values.push(code - 32);
      }
    }
    let checksum = values[0];
    for (let i = 1; i < values.length; i++) checksum += values[i] * i;
    values.push(checksum % 103, 106);

    let x = 8;
    const bars = [];
    values.forEach(v => {
      const pattern = patterns[v];
      if (!pattern) return;
      for (let i = 0; i < pattern.length; i++) {
        const w = Number(pattern.charAt(i));
        if (i % 2 === 0) bars.push('<rect x="' + x + '" y="0" width="' + w + '" height="' + height + '"></rect>');
        x += w;
      }
    });
    const total = x + 8;
    return '<svg class="agf-barcode" viewBox="0 0 ' + total + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="Código de barras ' + escapeHtml(value) + '"><rect x="0" y="0" width="' + total + '" height="' + height + '" fill="#fff"></rect><g fill="#000">' + bars.join('') + '</g></svg>';
  }

  function toast(message, type) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, 3600);
  }

  function setLoading(on) {
    document.body.classList.toggle('loading', !!on);
  }

  async function safeRun(fn, successMsg) {
    try {
      setLoading(true);
      const res = await fn();
      if (successMsg) toast(successMsg, 'success');
      return res;
    } catch (e) {
      toast(e.message || String(e), 'error');
      throw e;
    } finally {
      setLoading(false);
    }
  }

  function showDebug(obj) {
    const el = $('loginDebug');
    el.textContent = JSON.stringify(obj, null, 2);
    el.classList.add('has-content');
  }

  function saveSession(loginData) {
    localStorage.setItem(SF_ADMIN_CONFIG.STORAGE_KEYS.SESSION_TOKEN, loginData.sessionToken);
    localStorage.setItem(SF_ADMIN_CONFIG.STORAGE_KEYS.USER, JSON.stringify(loginData.user || {}));
    state.user = loginData.user || null;
  }

  function clearSession() {
    localStorage.removeItem(SF_ADMIN_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(SF_ADMIN_CONFIG.STORAGE_KEYS.USER);
    state.user = null;
  }

  function readStoredUser() {
    try { return JSON.parse(localStorage.getItem(SF_ADMIN_CONFIG.STORAGE_KEYS.USER) || 'null'); }
    catch (e) { return null; }
  }

  function showApp() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    $('appVersion').textContent = SF_ADMIN_CONFIG.VERSION;
    $('userLabel').textContent = state.user ? `${state.user.NOME || 'Admin'} • ${state.user.LOGIN || ''}` : 'Admin';
  }

  function showLogin() {
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
  }

  function switchScreen(screen) {
    state.currentScreen = screen;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === screen));
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === `screen-${screen}`));
    const titles = { dashboard: 'Dashboard', clientes: 'Clientes', emissao: 'Emitir etiqueta', cadastro: 'Cadastro de cliente', financeiro: 'Conta corrente' };
    $('screenTitle').textContent = titles[screen] || 'Painel';
    if (screen === 'dashboard') loadDashboard();
    if (screen === 'clientes') loadClients();
    if (screen === 'emissao') loadEmission();
    if (screen === 'financeiro') renderFinanceSelector();
  }

  function metric(label, value, hint) {
    return `<article class="metric-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div>${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}</article>`;
  }

  async function loadDashboard() {
    await safeRun(async () => {
      const [snap, clients] = await Promise.all([SfAdminApi.snapshot(), SfAdminApi.listClients()]);
      state.clients = clients || [];
      $('dashboardCards').innerHTML = [
        metric('Saldo SuperFrete estimado', money(snap.superfrete && snap.superfrete.saldoEstimado), 'Controle espelho da carteira AGF'),
        metric('Limite total clientes', money(snap.clientes && snap.clientes.limiteTotal), `${snap.clientes && snap.clientes.qtdContas || 0} conta(s)`),
        metric('Saldo clientes', money(snap.clientes && snap.clientes.saldoClientes), 'Positivo ou negativo'),
        metric('Disponível para emissão', money(snap.clientes && snap.clientes.disponivelEmissao), 'Soma dos limites disponíveis')
      ].join('');
      renderDashboardClients();
    });
  }

  function renderDashboardClients() {
    const clients = [...state.clients].sort((a, b) => Number(a.DISPONIVEL_EMISSAO || 0) - Number(b.DISPONIVEL_EMISSAO || 0)).slice(0, 8);
    $('dashboardClients').innerHTML = clients.length ? clients.map(c => `
      <div class="compact-item">
        <div><strong>${escapeHtml(c.NOME_EXIBICAO)}</strong><small>${escapeHtml(c.RAZAO_SOCIAL || c.DOCUMENTO || '')}</small></div>
        <div><span class="badge ${Number(c.DISPONIVEL_EMISSAO || 0) <= 0 ? 'block' : Number(c.DISPONIVEL_EMISSAO || 0) < 50 ? 'warn' : 'ok'}">${money(c.DISPONIVEL_EMISSAO)}</span></div>
      </div>
    `).join('') : '<p>Nenhum cliente cadastrado.</p>';
  }

  async function loadClients() {
    await safeRun(async () => {
      state.clients = await SfAdminApi.listClients();
      renderClientsTable();
      renderFinanceSelector();
    });
  }

  function statusBadge(status) {
    const s = String(status || '').toUpperCase();
    const cls = s === 'ATIVO' ? 'ok' : s === 'BLOQUEADO' ? 'block' : 'warn';
    return `<span class="badge ${cls}">${escapeHtml(s || '-')}</span>`;
  }

  function renderClientsTable() {
    const q = ($('clientSearch').value || '').toLowerCase().trim();
    const filtered = (state.clients || []).filter(c => {
      const blob = `${c.NOME_EXIBICAO || ''} ${c.RAZAO_SOCIAL || ''} ${c.DOCUMENTO || ''} ${c.EMAIL || ''}`.toLowerCase();
      return !q || blob.includes(q);
    });

    $('clientsTbody').innerHTML = filtered.length ? filtered.map(c => `
      <tr>
        <td><strong>${escapeHtml(c.NOME_EXIBICAO)}</strong><br><small>${escapeHtml(c.RAZAO_SOCIAL || c.DOCUMENTO || '')}</small></td>
        <td>${statusBadge(c.STATUS)}</td>
        <td>${escapeHtml(c.QTD_REMETENTES || 0)}</td>
        <td>${money(c.LIMITE_CREDITO)}</td>
        <td>${money(c.SALDO_CONTA)}</td>
        <td><strong>${money(c.DISPONIVEL_EMISSAO)}</strong></td>
        <td class="row-actions">
          <button class="action-link" data-edit="${escapeHtml(c.CLIENTE_ID)}">Editar</button>
          <button class="action-link" data-fin="${escapeHtml(c.CLIENTE_ID)}">Financeiro</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="7">Nenhum cliente encontrado.</td></tr>';

    document.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => editClient(btn.dataset.edit)));
    document.querySelectorAll('[data-fin]').forEach(btn => btn.addEventListener('click', () => openFinance(btn.dataset.fin)));
  }

  function clearForm() {
    $('clientForm').reset();
    ['CLIENTE_ID','REMETENTE_ID','USUARIO_ID','LOGO_DRIVE_ID'].forEach(id => $(id).value = '');
    $('CLIENTE_STATUS').value = 'ATIVO';
    $('REM_STATUS').value = 'ATIVO';
    $('USER_STATUS').value = 'ATIVO';
    $('STATUS_CREDITO').value = 'ATIVO';
    $('BLOQUEAR_EMISSAO').value = 'NAO';
    $('VALOR_RESERVADO').value = '0';
    $('SALDO_CONTA').value = '0';
    $('formTitle').textContent = 'Novo cliente';
    $('LOGO_URL').value = '';
    const logoFile = $('LOGO_FILE');
    if (logoFile) logoFile.value = '';
    updateLogoPreview('', 'Sem logo');
    setLogoUploadStatus('Recomendado: PNG transparente, 600 × 240 px. Fundo branco #FFFFFF apenas se não houver transparência. Máx. 1 MB.', '');
  }

  async function editClient(clienteId) {
    await safeRun(async () => {
      const data = await SfAdminApi.getClient(clienteId);
      fillForm(data);
      switchScreen('cadastro');
    });
  }

  function fillForm(data) {
    const c = data.cliente || {};
    const r = (data.remetentes && data.remetentes[0]) || {};
    const conta = data.conta || {};
    const u = (data.usuarios && data.usuarios[0]) || {};

    $('CLIENTE_ID').value = c.CLIENTE_ID || '';
    $('CLIENTE_STATUS').value = c.STATUS || 'ATIVO';
    $('NOME_EXIBICAO').value = c.NOME_EXIBICAO || '';
    $('CLIENTE_RAZAO_SOCIAL').value = c.RAZAO_SOCIAL || '';
    $('CLIENTE_DOCUMENTO').value = c.DOCUMENTO || '';
    $('CLIENTE_EMAIL').value = c.EMAIL || '';
    $('CLIENTE_TELEFONE').value = c.TELEFONE || '';
    $('LOGO_DRIVE_ID').value = c.LOGO_DRIVE_ID || '';
    $('LOGO_URL').value = c.LOGO_URL || '';
    const logoFile = $('LOGO_FILE');
    if (logoFile) logoFile.value = '';
    updateLogoPreview(c.LOGO_DATA_URL || c.LOGO_URL || '', c.NOME_EXIBICAO || 'Sem logo');
    setLogoUploadStatus(c.LOGO_URL ? 'Logo cadastrada. Para trocar, selecione uma nova imagem e clique em Enviar logo.' : 'Recomendado: PNG transparente, 600 × 240 px. Fundo branco #FFFFFF apenas se não houver transparência. Máx. 1 MB.', c.LOGO_URL ? 'ok' : '');
    $('OBS_INTERNA').value = c.OBS_INTERNA || '';

    $('REMETENTE_ID').value = r.REMETENTE_ID || '';
    $('REM_STATUS').value = r.STATUS || 'ATIVO';
    $('NOME_REMETENTE').value = r.NOME_REMETENTE || '';
    $('REM_RAZAO_SOCIAL').value = r.RAZAO_SOCIAL || '';
    $('CNPJ_CPF').value = r.CNPJ_CPF || '';
    $('REM_EMAIL').value = r.EMAIL || '';
    $('REM_TELEFONE').value = r.TELEFONE || '';
    $('CEP').value = r.CEP || '';
    $('ENDERECO').value = r.ENDERECO || '';
    $('NUMERO').value = r.NUMERO || '';
    $('COMPLEMENTO').value = r.COMPLEMENTO || '';
    $('BAIRRO').value = r.BAIRRO || '';
    $('CIDADE').value = r.CIDADE || '';
    $('UF').value = r.UF || '';

    $('USUARIO_ID').value = u.USUARIO_ID || '';
    $('USER_STATUS').value = u.STATUS || 'ATIVO';
    $('USER_NOME').value = u.NOME || c.NOME_EXIBICAO || '';
    $('USER_LOGIN').value = u.LOGIN || '';
    $('USER_SENHA').value = '';

    $('LIMITE_CREDITO').value = conta.LIMITE_CREDITO || 0;
    $('SALDO_CONTA').value = conta.SALDO_CONTA || 0;
    $('VALOR_RESERVADO').value = conta.VALOR_RESERVADO || 0;
    $('STATUS_CREDITO').value = conta.STATUS_CREDITO || 'ATIVO';
    $('BLOQUEAR_EMISSAO').value = conta.BLOQUEAR_EMISSAO || 'NAO';

    $('formTitle').textContent = c.CLIENTE_ID ? `Editar ${c.NOME_EXIBICAO || c.CLIENTE_ID}` : 'Novo cliente';
  }

  function collectForm() {
    const clienteId = $('CLIENTE_ID').value.trim();
    const remetenteId = $('REMETENTE_ID').value.trim();
    const usuarioId = $('USUARIO_ID').value.trim();
    const senha = $('USER_SENHA').value.trim();

    return {
      cliente: {
        CLIENTE_ID: clienteId,
        STATUS: $('CLIENTE_STATUS').value,
        NOME_EXIBICAO: $('NOME_EXIBICAO').value.trim(),
        RAZAO_SOCIAL: $('CLIENTE_RAZAO_SOCIAL').value.trim(),
        DOCUMENTO: $('CLIENTE_DOCUMENTO').value.trim(),
        EMAIL: $('CLIENTE_EMAIL').value.trim(),
        TELEFONE: $('CLIENTE_TELEFONE').value.trim(),
        LOGO_DRIVE_ID: $('LOGO_DRIVE_ID').value.trim(),
        LOGO_URL: $('LOGO_URL').value.trim(),
        OBS_INTERNA: $('OBS_INTERNA').value.trim()
      },
      remetente: {
        REMETENTE_ID: remetenteId,
        STATUS: $('REM_STATUS').value,
        NOME_REMETENTE: $('NOME_REMETENTE').value.trim(),
        RAZAO_SOCIAL: $('REM_RAZAO_SOCIAL').value.trim(),
        CNPJ_CPF: $('CNPJ_CPF').value.trim(),
        EMAIL: $('REM_EMAIL').value.trim(),
        TELEFONE: $('REM_TELEFONE').value.trim(),
        CEP: $('CEP').value.trim(),
        ENDERECO: $('ENDERECO').value.trim(),
        NUMERO: $('NUMERO').value.trim(),
        COMPLEMENTO: $('COMPLEMENTO').value.trim(),
        BAIRRO: $('BAIRRO').value.trim(),
        CIDADE: $('CIDADE').value.trim(),
        UF: $('UF').value.trim(),
        PADRAO: 'SIM'
      },
      usuario: {
        USUARIO_ID: usuarioId,
        STATUS: $('USER_STATUS').value,
        NOME: $('USER_NOME').value.trim() || $('NOME_EXIBICAO').value.trim(),
        LOGIN: $('USER_LOGIN').value.trim(),
        SENHA_NOVA: senha,
        PERMISSOES: 'CLIENTE'
      },
      conta: {
        LIMITE_CREDITO: parseMoney($('LIMITE_CREDITO').value),
        SALDO_CONTA: parseMoney($('SALDO_CONTA').value),
        VALOR_RESERVADO: parseMoney($('VALOR_RESERVADO').value),
        STATUS_CREDITO: $('STATUS_CREDITO').value,
        BLOQUEAR_EMISSAO: $('BLOQUEAR_EMISSAO').value
      }
    };
  }

  async function saveClient(ev) {
    ev.preventDefault();
    await safeRun(async () => {
      const payload = collectForm();
      if (!payload.cliente.NOME_EXIBICAO) throw new Error('Informe o nome de exibição do cliente.');
      if (!payload.remetente.NOME_REMETENTE) throw new Error('Informe o nome do remetente.');
      if (payload.usuario.LOGIN && !payload.usuario.USUARIO_ID && !payload.usuario.SENHA_NOVA) {
        throw new Error('Informe uma senha para criar o login do cliente.');
      }
      const saved = await SfAdminApi.saveClient(payload);
      fillForm(saved);
      await loadClients();
      return saved;
    }, 'Cliente salvo com sucesso.');
  }

  function renderFinanceSelector() {
    const sel = $('financeClientSelect');
    sel.innerHTML = '<option value="">Selecione um cliente</option>' + (state.clients || []).map(c => `<option value="${escapeHtml(c.CLIENTE_ID)}">${escapeHtml(c.NOME_EXIBICAO)} — ${money(c.DISPONIVEL_EMISSAO)}</option>`).join('');
    if (state.selectedClientId) sel.value = state.selectedClientId;
    if (state.selectedClientId) loadFinance(state.selectedClientId);
  }

  async function openFinance(clienteId) {
    state.selectedClientId = clienteId;
    switchScreen('financeiro');
  }

  async function loadFinance(clienteId) {
    if (!clienteId) {
      $('financeCards').innerHTML = '';
      $('financeTbody').innerHTML = '<tr><td colspan="7">Selecione um cliente.</td></tr>';
      return;
    }
    await safeRun(async () => {
      const data = await SfAdminApi.getClientFinancial(clienteId);
      const conta = data.conta || {};
      $('financeCards').innerHTML = [
        metric('Saldo da conta', money(conta.SALDO_CONTA), 'Pode ser positivo ou negativo'),
        metric('Limite de crédito', money(conta.LIMITE_CREDITO), 'Negativo máximo permitido'),
        metric('Disponível para emissão', money(conta.DISPONIVEL_EMISSAO), `Reservado: ${money(conta.VALOR_RESERVADO)}`)
      ].join('');
      $('financeTbody').innerHTML = (data.lancamentos || []).length ? data.lancamentos.map(l => `
        <tr>
          <td>${escapeHtml(l.CRIADO_EM)}</td>
          <td>${escapeHtml(l.TIPO)}</td>
          <td>${escapeHtml(l.SINAL)}</td>
          <td>${money(l.VALOR)}</td>
          <td>${money(l.SALDO_ANTES)}</td>
          <td>${money(l.SALDO_DEPOIS)}</td>
          <td>${escapeHtml(l.MOTIVO)}</td>
        </tr>
      `).join('') : '<tr><td colspan="7">Sem lançamentos para este cliente.</td></tr>';
    });
  }

  async function adjustBalance() {
    const clienteId = $('financeClientSelect').value;
    if (!clienteId) return toast('Selecione um cliente.', 'error');
    await safeRun(async () => {
      await SfAdminApi.adjustClientBalance({
        clienteId,
        tipo: $('adjustTipo').value,
        sinal: $('adjustSinal').value,
        valor: parseMoney($('adjustValor').value),
        motivo: $('adjustMotivo').value.trim()
      });
      $('adjustValor').value = '';
      $('adjustMotivo').value = '';
      await loadFinance(clienteId);
      await loadClients();
    }, 'Ajuste lançado com sucesso.');
  }


  async function loadEmission() {
    await safeRun(async () => {
      const [data, cfg] = await Promise.all([
        SfAdminApi.emissionBootstrap(),
        SfAdminApi.getSuperFreteConfig()
      ]);
      state.emission = data;
      state.sfConfig = cfg;
      renderSuperFreteConfig(cfg);
      renderEmissionSelectors();
      renderEmissionCards();
      renderDceItemsIfEmpty();
      updateEmissionPreview();
      await loadLabels();
    });
  }

  function renderEmissionSelectors() {
    const data = state.emission || { clientes: [], remetentes: [], contasByCliente: {} };
    const activeClients = (data.clientes || []).filter(c => String(c.STATUS || '').toUpperCase() === 'ATIVO');
    const sel = $('emissionClientSelect');
    const previous = sel.value;
    sel.innerHTML = '<option value="">Selecione o cliente</option>' + activeClients.map(c => {
      const conta = data.contasByCliente && data.contasByCliente[c.CLIENTE_ID] || {};
      return `<option value="${escapeHtml(c.CLIENTE_ID)}">${escapeHtml(c.NOME_EXIBICAO)} — disponível ${money(conta.DISPONIVEL_EMISSAO)}</option>`;
    }).join('');
    if (previous && activeClients.some(c => c.CLIENTE_ID === previous)) sel.value = previous;
    if (!sel.value && activeClients[0]) sel.value = activeClients[0].CLIENTE_ID;
    renderRemetenteSelector();
  }

  function renderRemetenteSelector() {
    const data = state.emission || { remetentes: [] };
    const clienteId = $('emissionClientSelect').value;
    const rems = (data.remetentes || []).filter(r => r.CLIENTE_ID === clienteId && String(r.STATUS || '').toUpperCase() === 'ATIVO');
    const sel = $('emissionRemetenteSelect');
    const previous = sel.value;
    sel.innerHTML = rems.length ? rems.map(r => `<option value="${escapeHtml(r.REMETENTE_ID)}">${escapeHtml(r.NOME_REMETENTE)} — ${escapeHtml(r.CIDADE || '')}/${escapeHtml(r.UF || '')}</option>`).join('') : '<option value="">Nenhum remetente ativo</option>';
    if (previous && rems.some(r => r.REMETENTE_ID === previous)) sel.value = previous;
    renderEmissionCards();
    updateEmissionPreview();
  }

  function getSelectedEmissionClient() {
    const data = state.emission || { clientes: [] };
    const id = $('emissionClientSelect').value;
    return (data.clientes || []).find(c => c.CLIENTE_ID === id) || null;
  }

  function getSelectedEmissionConta() {
    const data = state.emission || { contasByCliente: {} };
    const id = $('emissionClientSelect').value;
    return data.contasByCliente && data.contasByCliente[id] || null;
  }

  function getSelectedEmissionRemetente() {
    const data = state.emission || { remetentes: [] };
    const id = $('emissionRemetenteSelect').value;
    return (data.remetentes || []).find(r => r.REMETENTE_ID === id) || null;
  }

  function renderEmissionCards() {
    const conta = getSelectedEmissionConta() || {};
    const rem = getSelectedEmissionRemetente() || {};
    const carteira = state.emission && state.emission.carteiraSuperFrete || {};
    const margem = state.emission && state.emission.margemSeguranca || 0;
    $('emissionCards').innerHTML = [
      metric('Disponível do cliente', money(conta.DISPONIVEL_EMISSAO), `Saldo: ${money(conta.SALDO_CONTA)} • Limite: ${money(conta.LIMITE_CREDITO)}`),
      metric('Saldo SuperFrete estimado', money(carteira.saldoEstimado), `${carteira.qtdLancamentos || 0} lançamento(s)`),
      metric('Remetente selecionado', rem.NOME_REMETENTE || '-', `${rem.CEP || ''} ${rem.CIDADE || ''}/${rem.UF || ''}`),
      metric('Margem segurança', money(margem), 'Aplicada sobre o valor cotado')
    ].join('');
  }


  function renderSuperFreteConfig(cfg) {
    cfg = cfg || {};
    $('sfAmbiente').value = cfg.ambiente || 'SANDBOX';
    $('sfUserAgent').value = cfg.userAgent || 'AGF SuperFrete/0.4 (suporte@minhaagenciaonline.com.br)';
    $('sfTokenSandbox').value = '';
    $('sfTokenProducao').value = '';
    const active = cfg.ambiente === 'PRODUCAO' ? cfg.tokenProducaoConfigured : cfg.tokenSandboxConfigured;
    const status = $('sfApiStatus');
    status.className = 'badge ' + (active ? 'ok' : 'warn');
    status.textContent = `${cfg.ambiente || 'SANDBOX'} • token ${active ? 'configurado' : 'pendente'}`;
  }

  async function loadSuperFreteConfig() {
    await safeRun(async () => {
      const cfg = await SfAdminApi.getSuperFreteConfig();
      state.sfConfig = cfg;
      renderSuperFreteConfig(cfg);
      return cfg;
    }, 'Status da integração atualizado.');
  }

  async function saveSuperFreteConfig() {
    await safeRun(async () => {
      const cfg = await SfAdminApi.saveSuperFreteConfig({
        ambiente: $('sfAmbiente').value,
        userAgent: $('sfUserAgent').value.trim(),
        tokenSandbox: $('sfTokenSandbox').value.trim(),
        tokenProducao: $('sfTokenProducao').value.trim()
      });
      state.sfConfig = cfg;
      renderSuperFreteConfig(cfg);
      return cfg;
    }, 'Configuração SuperFrete salva.');
  }

  function addDceItem(item) {
    const tbody = $('dceItemsTbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="dce-descricao" placeholder="Produto" value="${escapeHtml(item && item.descricao || '')}" /></td>
      <td><input class="dce-qtd" inputmode="decimal" value="${escapeHtml(item && item.quantidade || 1)}" /></td>
      <td><input class="dce-valor" inputmode="decimal" placeholder="35,50" value="${escapeHtml(item && item.valor_unitario || '')}" /></td>
      <td><input class="dce-unidade" value="${escapeHtml(item && item.unidade || 'UN')}" /></td>
      <td><button type="button" class="action-link dce-remove">Remover</button></td>
    `;
    tr.querySelector('.dce-remove').addEventListener('click', () => {
      tr.remove();
      renderDceItemsIfEmpty();
    });
    tbody.appendChild(tr);
  }

  function renderDceItemsIfEmpty() {
    if (!$('dceItemsTbody').children.length) {
      addDceItem({ descricao: 'Produto', quantidade: 1, valor_unitario: '25,00', unidade: 'UN' });
    }
  }

  function collectDceItems() {
    return Array.from($('dceItemsTbody').querySelectorAll('tr')).map(tr => ({
      descricao: tr.querySelector('.dce-descricao').value.trim(),
      quantidade: parseMoney(tr.querySelector('.dce-qtd').value),
      valor_unitario: parseMoney(tr.querySelector('.dce-valor').value),
      unidade: tr.querySelector('.dce-unidade').value.trim() || 'UN'
    })).filter(item => item.descricao || item.quantidade || item.valor_unitario);
  }

  function updateEmissionPreview() {
    const valorCotado = parseMoney($('valorCotado').value);
    const valorReal = parseMoney($('valorReal').value);
    const diff = valorReal - valorCotado;
    const conta = getSelectedEmissionConta() || {};
    const margem = Number(state.emission && state.emission.margemSeguranca || 0);
    const minimo = Math.max(valorReal || 0, (valorCotado || 0) + margem);
    const disponivel = Number(conta.DISPONIVEL_EMISSAO || 0);
    const status = disponivel >= minimo ? 'OK' : 'limite insuficiente';
    $('emissionFinancialPreview').value = `Diferença: ${money(diff)} • Necessário: ${money(minimo)} • Disponível: ${money(disponivel)} • ${status}`;
  }

  function collectEmissionPayload() {
    return {
      clienteId: $('emissionClientSelect').value,
      remetenteId: $('emissionRemetenteSelect').value,
      servico: $('emissionServico').value,
      valorCotado: parseMoney($('valorCotado').value),
      valorRealSuperFrete: parseMoney($('valorReal').value),
      destinatario: {
        nome: $('destNome').value.trim(),
        documento: $('destDocumento').value.trim(),
        cep: $('destCep').value.trim(),
        endereco: $('destEndereco').value.trim(),
        numero: $('destNumero').value.trim(),
        complemento: $('destComplemento').value.trim(),
        bairro: $('destBairro').value.trim(),
        cidade: $('destCidade').value.trim(),
        uf: $('destUf').value.trim()
      },
      pacote: {
        pesoG: parseWeightGrams($('pkgPeso').value),
        altura: parseMoney($('pkgAltura').value),
        largura: parseMoney($('pkgLargura').value),
        comprimento: parseMoney($('pkgComprimento').value)
      },
      options: {
        valorDeclarado: parseMoney($('valorDeclarado').value),
        AR: $('optAr').value,
        MAO_PROPRIA: $('optMp').value
      },
      itens: collectDceItems()
    };
  }

  function collectQuotePayload() {
    const payload = collectEmissionPayload();
    payload.servicos = $('quoteServicos').value;
    return payload;
  }

  async function quoteSuperFrete() {
    await safeRun(async () => {
      const payload = collectQuotePayload();
      const data = await SfAdminApi.quoteSuperFrete(payload);
      state.lastQuotes = data.quotes || [];
      renderQuoteResults(data);
      return data;
    }, 'Cotação SuperFrete realizada.');
  }

  async function lookupDestCep() {
    const cep = digitsOnly($('destCep').value);
    const status = $('destCepStatus');
    if (status) {
      status.className = 'field-hint';
      status.textContent = 'Buscando endereço...';
    }
    if (cep.length !== 8) {
      if (status) {
        status.className = 'field-hint error';
        status.textContent = 'Informe um CEP com 8 dígitos.';
      }
      return;
    }
    await safeRun(async () => {
      const data = await SfAdminApi.lookupCep(cep);
      $('destCep').value = data.cep || cep;
      if (data.logradouro) $('destEndereco').value = data.logradouro;
      if (data.complemento && !$('destComplemento').value) $('destComplemento').value = data.complemento;
      if (data.bairro) $('destBairro').value = data.bairro;
      if (data.cidade) $('destCidade').value = data.cidade;
      if (data.uf) $('destUf').value = String(data.uf).toUpperCase();
      if (status) {
        status.className = 'field-hint ok';
        status.textContent = `Endereço preenchido (${data.fonte || 'base CEP'}). Complete número e complemento se necessário.`;
      }
      return data;
    }, 'Endereço localizado pelo CEP.');
  }

  function renderQuoteResults(data) {
    const box = $('quoteResults');
    box.classList.remove('hidden');
    const quotes = data && data.quotes || [];
    if (!quotes.length) {
      box.innerHTML = '<div class="notice-box warn-inline">A SuperFrete respondeu, mas nenhuma opção de frete com preço foi normalizada. Veja o log do backend ou a resposta bruta.</div>';
      return;
    }
    box.innerHTML = quotes.map((q, idx) => `
      <article class="quote-card ${q.error ? 'has-error' : ''}">
        <div>
          <strong>${escapeHtml(q.serviceName || q.serviceCode || 'Serviço')}</strong>
          <small>${escapeHtml(q.carrier || 'SuperFrete')} ${q.deliveryMax ? '• prazo até ' + escapeHtml(q.deliveryMax) + ' dia(s)' : ''}</small>
          ${q.error ? `<small class="error-text">${escapeHtml(q.error)}</small>` : ''}
        </div>
        <div class="quote-price">${money(q.price)}</div>
        <button class="btn btn-muted btn-use-quote" type="button" data-quote-index="${idx}" ${q.price <= 0 ? 'disabled' : ''}>Usar</button>
      </article>
    `).join('');
    box.querySelectorAll('[data-quote-index]').forEach(btn => btn.addEventListener('click', () => useQuote(Number(btn.dataset.quoteIndex))));
  }

  function useQuote(index) {
    const q = state.lastQuotes[index];
    if (!q || !q.price) return;
    const name = String(q.serviceName || '').toUpperCase();
    if (name.includes('PAC')) $('emissionServico').value = 'PAC';
    else if (name.includes('MINI')) $('emissionServico').value = 'MINI ENVIOS';
    else if (name.includes('SEDEX')) $('emissionServico').value = 'SEDEX';
    $('valorCotado').value = String(q.price).replace('.', ',');
    $('valorReal').value = String(q.price).replace('.', ',');
    updateEmissionPreview();
    toast('Valor da cotação aplicado. Próximo passo: 1) enviar para o carrinho SuperFrete; 2) emitir frete/checkout real.', 'success');
  }

  async function createSimulatedLabel(ev) {
    ev.preventDefault();
    await safeRun(async () => {
      const payload = collectEmissionPayload();
      const data = await SfAdminApi.createSimulatedLabel(payload);
      renderLastEmissionResult(data, 'simulada');
      await loadEmission();
      await loadClients();
      await loadLabels();
      await loadDashboard();
      return data;
    }, 'Etiqueta simulada gerada e lançada no financeiro.');
  }

  function getActiveSuperFreteAmbiente() {
    return String((state.sfConfig && state.sfConfig.ambiente) || $('sfAmbiente').value || 'SANDBOX').toUpperCase();
  }

  function confirmRealCartOrder() {
    const ambiente = getActiveSuperFreteAmbiente();
    if (ambiente === 'PRODUCAO') {
      const texto = prompt('ATENÇÃO: você está no ambiente PRODUÇÃO. Este botão cria um pedido real no carrinho da SuperFrete, mas ainda NÃO faz checkout e NÃO consome saldo. Para continuar, digite exatamente: PRODUCAO');
      if (texto !== 'PRODUCAO') throw new Error('Criação em produção cancelada.');
      return 'CRIAR_PEDIDO_PRODUCAO_SEM_CHECKOUT';
    }
    const ok = confirm('Enviar pedido para o carrinho SuperFrete Sandbox? Esta ação ainda NÃO emite a etiqueta. Depois você precisa clicar em Emitir frete / checkout real.');
    if (!ok) throw new Error('Criação cancelada.');
    return '';
  }

  async function createRealCartOrder() {
    let confirmacaoProducao = '';
    try {
      confirmacaoProducao = confirmRealCartOrder();
    } catch (e) {
      toast(e.message || 'Criação cancelada.', 'error');
      return;
    }
    await safeRun(async () => {
      const payload = collectEmissionPayload();
      payload.confirmacaoProducao = confirmacaoProducao;
      payload.ambientePainel = getActiveSuperFreteAmbiente();
      const data = await SfAdminApi.createRealCartOrder(payload);
      renderLastEmissionResult(data, 'real-cart');
      await loadEmission();
      await loadClients();
      await loadLabels();
      return data;
    }, 'Pedido enviado para o carrinho SuperFrete. Agora clique em Emitir frete / checkout real para liberar a etiqueta.');
  }

  function renderLastEmissionResult(data, mode) {
    const e = data && data.etiqueta || {};
    const box = $('lastEmissionResult');
    box.classList.remove('hidden');
    const isReal = mode === 'real-cart';
    box.innerHTML = `
      <strong>${mode === 'checkout' ? 'Frete emitido / checkout concluído:' : isReal ? 'Pedido enviado para o carrinho SuperFrete:' : 'Etiqueta simulada gerada:'}</strong>
      <span>AGF: ${escapeHtml(e.ORDER_ID_AGF || '')}</span>
      <span>SuperFrete: <b>${escapeHtml(e.ORDER_ID_SUPERFRETE || '')}</b></span>
      <span>Status: <b>${escapeHtml(e.STATUS_LOGISTICO || '')}</b> / <b>${escapeHtml(e.STATUS_FINANCEIRO || '')}</b></span>
      <span>Valor: <b>${money(e.VALOR_REAL_SUPERFRETE)}</b></span>
      <span>Diferença cotação: <b>${money(e.DIFERENCA_COTACAO)}</b></span>
      ${e.PDF_OFICIAL_URL ? `<span><a href="${escapeHtml(e.PDF_OFICIAL_URL)}" target="_blank" rel="noopener">Abrir PDF oficial</a></span>` : ''}
      ${mode === 'checkout' && e.ORDER_ID_AGF ? `<button class="btn btn-muted btn-sm" type="button" id="btnPrintAgfLastOrder">Imprimir etiqueta AGF</button><small>Versão experimental com logo do cliente. Mantenha o PDF oficial como fallback.</small>` : ''}
      ${isReal && e.ORDER_ID_AGF ? `<button class="btn btn-danger btn-sm" type="button" id="btnCheckoutLastOrder">Emitir frete / checkout real</button><small>Este é o passo que substitui o clique em “Emitir Frete” dentro da plataforma SuperFrete.</small>` : ''}
      ${data && data.aviso ? `<span class="error-text">${escapeHtml(data.aviso)}</span>` : ''}
    `;
    const printAgfBtn = $('btnPrintAgfLastOrder');
    if (printAgfBtn && e.ORDER_ID_AGF) {
      printAgfBtn.addEventListener('click', () => printAgfLabel(e.ORDER_ID_AGF));
    }
    const checkoutBtn = $('btnCheckoutLastOrder');
    if (checkoutBtn && e.ORDER_ID_AGF) {
      checkoutBtn.addEventListener('click', () => checkoutRealOrder(e.ORDER_ID_AGF));
    }
  }


  async function printAgfLabel(orderIdAgf) {
    const orderId = String(orderIdAgf || '').trim();
    if (!orderId) {
      toast('ORDER_ID_AGF não informado para gerar etiqueta AGF.', 'error');
      return;
    }
    const targetUrl = './etiqueta-overlay.html?orderId=' + encodeURIComponent(orderId);
    const printWin = window.open(targetUrl, '_blank');
    if (!printWin) {
      toast('O navegador bloqueou a janela da etiqueta. Permita pop-ups para este site.', 'error');
      return;
    }
    toast('Abrindo etiqueta AGF por overlay do PDF oficial.', 'success');
  }


  function buildAgfLabelPrintHtml(data) {
    const e = data && data.etiqueta || {};
    const cliente = data && data.cliente || {};
    const rem = data && data.remetente || {};
    const dest = data && data.destinatario || {};
    const trackingRaw = String(e.TRACKING || '').replace(/\s+/g, '').toUpperCase();
    const trackingDisplay = fmtTracking(trackingRaw || e.ORDER_ID_SUPERFRETE || '');
    const cepDest = fmtCepPlain(dest.CEP);
    const logoUrl = String(cliente.LOGO_URL || '').trim();
    const logoHtml = logoUrl
      ? '<img class="client-logo" src="' + escapeHtml(logoUrl) + '" alt="Logo do cliente" />'
      : '<div class="client-logo-text">' + escapeHtml(cliente.NOME_EXIBICAO || rem.NOME_REMETENTE || 'Cliente') + '</div>';
    const contratoHtml = e.CONTRATO ? '<b>' + escapeHtml(e.CONTRATO) + '</b>' : '<span class="muted">-</span>';
    const cepBarcode = cepDest.length === 8 ? buildCode128Svg(cepDest, { mode: 'C', height: 42 }) : '';
    const sroBarcode = trackingRaw ? buildCode128Svg(trackingRaw, { mode: 'B', height: 74 }) : '';
    const peso = Number(e.PESO_G || 0) > 0 ? Math.round(Number(e.PESO_G)) : '';
    const correiosLogo = '/assets/correios-logo-2.png';
    const warning = !trackingRaw ? '<div class="agf-warning">Sem SRO retornado. Atualize a SuperFrete antes de imprimir.</div>' : '';

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Etiqueta AGF ${escapeHtml(e.ORDER_ID_AGF || '')}</title>
<style>
  @page { size: 105mm 148mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f5f7; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .sheet { width: 105mm; height: 148mm; margin: 0 auto; background: #fff; border: 1px solid #000; overflow: hidden; }
  .top { height: 45mm; padding: 4.5mm 5mm 2mm; border-bottom: 1px solid #000; }
  .top-grid { display: grid; grid-template-columns: 35mm 1fr 28mm; gap: 4mm; align-items: start; }
  .logo-box { min-height: 23mm; display: flex; align-items: center; justify-content: center; }
  .client-logo { max-width: 31mm; max-height: 22mm; object-fit: contain; }
  .client-logo-text { font-size: 13pt; font-weight: 800; text-align: center; line-height: 1.05; color: #00416B; }
  .meta-left { font-size: 8.4pt; line-height: 1.15; margin-top: 1mm; }
  .qr-placeholder { height: 24mm; border: 1px dashed #777; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7pt; color: #555; padding: 2mm; }
  .contract { text-align: center; font-size: 8.6pt; margin-top: 1.2mm; line-height: 1.1; }
  .service { text-align: center; font-size: 9.5pt; font-weight: 900; }
  .right-brand { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
  .agf-mark { width: 22mm; height: 18mm; border-radius: 50% 50% 42% 42%; background: #FFD400; position: relative; }
  .agf-mark:after { content: ''; position: absolute; left: 5mm; right: 5mm; bottom: 4mm; height: 6mm; background: #fff; border-radius: 50% 50% 0 0; }
  .vol { font-size: 8.5pt; line-height: 1.15; text-align: center; }
  .tracking { text-align: center; font-size: 14pt; font-weight: 900; margin-top: 1.5mm; letter-spacing: .02em; }
  .main-barcode { height: 18mm; margin: .8mm 0 1.2mm; }
  .agf-barcode { width: 100%; height: 100%; display: block; }
  .receipt { font-size: 8.3pt; line-height: 1.4; }
  .line { display: inline-block; border-bottom: 1px solid #000; height: 4mm; vertical-align: bottom; }
  .line.rec { width: 79mm; } .line.ass { width: 31mm; } .line.doc { width: 31mm; }
  .dest { height: 43.5mm; border-bottom: 1px solid #000; position: relative; }
  .dest-head { height: 8mm; display: flex; justify-content: space-between; align-items: center; }
  .dest-title { background: #000; color: #fff; font-size: 10pt; font-weight: 900; padding: 1.3mm 5mm 1.1mm; letter-spacing: .02em; }
  .correios-logo { max-width: 25mm; max-height: 7mm; margin-right: 8mm; object-fit: contain; }
  .dest-body { padding: 1.5mm 5mm 0; font-size: 10.3pt; line-height: 1.22; }
  .dest-name { font-size: 10.8pt; margin-bottom: .6mm; }
  .dest-cep { font-weight: 900; }
  .cep-barcode-wrap { width: 42mm; height: 15mm; margin-top: 1.6mm; }
  .rem { height: 41mm; padding: 4mm 5mm; font-size: 10.2pt; line-height: 1.25; }
  .rem-title { margin-bottom: 1mm; }
  .rem-title b, .rem-cep { font-weight: 900; }
  .agf-warning { position: absolute; left: 5mm; right: 5mm; bottom: 2mm; background: #fff3cd; border: 1px solid #d8a100; padding: 1mm 2mm; font-size: 7.5pt; font-weight: 700; }
  .muted { color: #555; }
  .footer-note { position: fixed; left: 0; right: 0; bottom: 0; text-align: center; font-size: 7pt; color: #666; display: none; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; border: 1px solid #000; page-break-after: always; }
    .footer-note { display: none; }
  }
</style>
</head>
<body>
  <section class="sheet">
    <div class="top">
      <div class="top-grid">
        <div>
          <div class="logo-box">${logoHtml}</div>
          <div class="meta-left">NF: ${escapeHtml(e.NF || '0000000000')}<br>Pedido: ${escapeHtml(e.ORDER_ID_SUPERFRETE || '')}</div>
        </div>
        <div>
          <div class="qr-placeholder">QR/2D oficial não reproduzido<br><b>use PDF oficial como fallback</b></div>
          <div class="contract">Contrato: ${contratoHtml}</div>
          <div class="service">${escapeHtml(e.SERVICO || '')}</div>
        </div>
        <div class="right-brand">
          <div class="agf-mark" aria-hidden="true"></div>
          <div class="vol">Volume: ${escapeHtml(e.VOLUME || '1/1')}<br>Peso (g): <b>${escapeHtml(peso || '')}</b></div>
        </div>
      </div>
      <div class="tracking">${escapeHtml(trackingDisplay)}</div>
      <div class="main-barcode">${sroBarcode}</div>
      <div class="receipt">Recebedor:<span class="line rec"></span><br>Assinatura:<span class="line ass"></span>Documento:<span class="line doc"></span></div>
    </div>

    <div class="dest">
      <div class="dest-head"><span class="dest-title">DESTINATÁRIO</span><img class="correios-logo" src="${correiosLogo}" alt="Correios" /></div>
      <div class="dest-body">
        <div class="dest-name">${escapeHtml(dest.NOME || '')}</div>
        <div>${escapeHtml(joinAddress(dest))}</div>
        <div>${escapeHtml(joinComplementBairro(dest))}</div>
        <div><span class="dest-cep">${escapeHtml(cepDest)}</span> ${escapeHtml(joinParts([dest.CIDADE, dest.UF], '/'))}</div>
        <div class="cep-barcode-wrap">${cepBarcode}</div>
      </div>
      ${warning}
    </div>

    <div class="rem">
      <div class="rem-title"><b>Remetente:</b> ${escapeHtml(rem.NOME_REMETENTE || cliente.NOME_EXIBICAO || '')}</div>
      <div>${escapeHtml(joinAddress(rem))}</div>
      <div>${escapeHtml(joinComplementBairro(rem))}</div>
      <div><span class="rem-cep">${escapeHtml(fmtCepPlain(rem.CEP))}</span> ${escapeHtml(joinParts([rem.CIDADE, rem.UF], '/'))}</div>
    </div>
  </section>
</body>
</html>`;
  }

  async function loadLabels() {
    await safeRun(async () => {
      const labels = await SfAdminApi.listLabels({ limit: 60 });
      const clientsById = Object.fromEntries((state.clients || []).map(c => [c.CLIENTE_ID, c.NOME_EXIBICAO]));
      $('labelsTbody').innerHTML = labels.length ? labels.map(e => {
        const canRelease = String(e.STATUS_FINANCEIRO || '').toUpperCase() === 'RESERVADA';
        const canCheckout = canRelease && !!e.ORDER_ID_SUPERFRETE && ['PENDING_SUPERFRETE','PEDIDO_CRIADO_SUPERFRETE'].includes(String(e.STATUS_LOGISTICO || '').toUpperCase());
        const pdfUrl = String(e.PDF_OFICIAL_URL || '').trim();
        const canRefresh = !!e.ORDER_ID_SUPERFRETE;
        const canAgfLabel = !!e.ORDER_ID_AGF && ['RELEASED_SUPERFRETE','POSTADA','ENTREGUE'].includes(String(e.STATUS_LOGISTICO || '').toUpperCase());
        const actions = [
          canCheckout ? `<button class="action-link danger" data-checkout-order="${escapeHtml(e.ORDER_ID_AGF)}">Emitir frete / checkout</button>` : '',
          canRelease ? `<button class="action-link" data-release-order="${escapeHtml(e.ORDER_ID_AGF)}">Liberar reserva</button>` : '',
          canRefresh ? `<button class="action-link" data-refresh-sf="${escapeHtml(e.ORDER_ID_AGF)}">Atualizar SF</button>` : '',
          canAgfLabel ? `<button class="action-link" data-agf-label="${escapeHtml(e.ORDER_ID_AGF)}">Etiqueta AGF</button>` : '',
          pdfUrl ? `<button class="action-link" data-open-pdf="${escapeHtml(pdfUrl)}">PDF oficial</button>` : ''
        ].filter(Boolean).join(' ');
        return `
        <tr>
          <td>${escapeHtml(e.EMITIDO_EM || e.CRIADO_EM || '')}</td>
          <td>${escapeHtml(clientsById[e.CLIENTE_ID] || e.CLIENTE_ID || '')}</td>
          <td>${escapeHtml(e.DESTINATARIO_NOME || '')}<br><small>${escapeHtml(e.DESTINATARIO_CIDADE || '')}/${escapeHtml(e.DESTINATARIO_UF || '')}</small></td>
          <td>${escapeHtml(e.SERVICO || '')}</td>
          <td><strong>${escapeHtml(e.TRACKING || e.ORDER_ID_SUPERFRETE || '')}</strong></td>
          <td>${money(e.VALOR_REAL_SUPERFRETE)}</td>
          <td>${statusBadge(e.STATUS_LOGISTICO)} ${statusBadge(e.STATUS_FINANCEIRO)}</td>
          <td>${actions}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="8">Nenhuma etiqueta registrada ainda.</td></tr>';
      document.querySelectorAll('[data-checkout-order]').forEach(btn => btn.addEventListener('click', () => checkoutRealOrder(btn.dataset.checkoutOrder)));
      document.querySelectorAll('[data-release-order]').forEach(btn => btn.addEventListener('click', () => releasePendingOrderLocal(btn.dataset.releaseOrder)));
      document.querySelectorAll('[data-refresh-sf]').forEach(btn => btn.addEventListener('click', () => refreshSuperFreteOrder(btn.dataset.refreshSf)));
      document.querySelectorAll('[data-agf-label]').forEach(btn => btn.addEventListener('click', () => printAgfLabel(btn.dataset.agfLabel)));
      document.querySelectorAll('[data-open-pdf]').forEach(btn => btn.addEventListener('click', () => window.open(btn.dataset.openPdf, '_blank', 'noopener')));
    });
  }

  function confirmCheckoutOrder() {
    const ambiente = getActiveSuperFreteAmbiente();
    if (ambiente === 'PRODUCAO') {
      const texto = prompt('ATENÇÃO: CHECKOUT REAL EM PRODUÇÃO. Esta ação consome saldo real da SuperFrete e gera etiqueta válida para postagem. Para continuar, digite exatamente: CHECKOUT');
      if (texto !== 'CHECKOUT') throw new Error('Checkout em produção cancelado.');
      return 'CONFIRMAR_CHECKOUT_PRODUCAO';
    }
    const ok = confirm('Fazer checkout no Sandbox? Isso finalizará o pedido de teste, tentará gerar tracking/SRO de teste e buscará o PDF oficial de teste.');
    if (!ok) throw new Error('Checkout cancelado.');
    return 'CONFIRMAR_CHECKOUT_SANDBOX';
  }

  async function checkoutRealOrder(orderIdAgf) {
    let confirmacaoCheckout = '';
    try {
      confirmacaoCheckout = confirmCheckoutOrder();
    } catch (e) {
      toast(e.message || 'Checkout cancelado.', 'error');
      return;
    }
    await safeRun(async () => {
      const data = await SfAdminApi.checkoutRealOrder({ orderIdAgf, confirmacaoCheckout });
      renderLastEmissionResult(data, 'checkout');
      await loadEmission();
      await loadClients();
      await loadLabels();
      await loadDashboard();
      return data;
    }, 'Frete emitido. Verifique tracking/SRO e PDF oficial no histórico.');
  }

  async function refreshSuperFreteOrder(orderIdAgf) {
    await safeRun(async () => {
      const data = await SfAdminApi.refreshSuperFreteOrder(orderIdAgf);
      renderLastEmissionResult(data, 'checkout');
      await loadEmission();
      return data;
    }, 'Informações atualizadas pela SuperFrete.');
  }

  async function releasePendingOrderLocal(orderIdAgf) {
    const ok = confirm('Liberar a reserva local desta etiqueta? Isso NÃO cancela o pedido dentro da SuperFrete nesta etapa, apenas libera o limite interno do cliente.');
    if (!ok) return;
    await safeRun(async () => {
      const data = await SfAdminApi.releasePendingOrderLocal(orderIdAgf);
      await loadEmission();
      await loadClients();
      return data;
    }, 'Reserva local liberada.');
  }

  async function registerRecharge() {
    await safeRun(async () => {
      const valor = parseMoney($('rechargeValor').value);
      const motivo = $('rechargeMotivo').value.trim() || 'Recarga registrada no painel admin';
      await SfAdminApi.registerSuperFreteRecharge({ valor, motivo });
      $('rechargeValor').value = '';
      $('rechargeMotivo').value = '';
      await loadEmission();
      await loadDashboard();
    }, 'Recarga registrada na carteira SuperFrete.');
  }

  async function login(ev) {
    ev.preventDefault();
    await safeRun(async () => {
      const login = $('loginInput').value.trim();
      const senha = $('senhaInput').value;
      const data = await SfAdminApi.login(login, senha);
      saveSession(data);
      localStorage.setItem(SF_ADMIN_CONFIG.STORAGE_KEYS.LAST_LOGIN, login);
      showApp();
      await loadClients();
      switchScreen('dashboard');
      return data;
    }, 'Login realizado.');
  }

  async function tryRestoreSession() {
    const token = localStorage.getItem(SF_ADMIN_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
    const stored = readStoredUser();
    if (!token || !stored) return showLogin();
    state.user = stored;
    try {
      await SfAdminApi.me();
      showApp();
      await loadClients();
      switchScreen('dashboard');
    } catch (e) {
      clearSession();
      showLogin();
    }
  }

  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      const input = $(button.dataset.passwordToggle);
      const icon = button.querySelector('.material-symbols-rounded');
      if (!input || button.dataset.passwordReady === '1') return;
      button.dataset.passwordReady = '1';
      button.addEventListener('click', () => {
        const shouldShow = input.type === 'password';
        const isToken = String(button.getAttribute('aria-label') || '').toLowerCase().includes('token');
        input.type = shouldShow ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(shouldShow));
        button.setAttribute('aria-label', shouldShow ? (isToken ? 'Ocultar token' : 'Ocultar senha') : (isToken ? 'Mostrar token' : 'Mostrar senha'));
        button.setAttribute('title', shouldShow ? (isToken ? 'Ocultar token' : 'Ocultar senha') : (isToken ? 'Mostrar token' : 'Mostrar senha'));
        if (icon) icon.textContent = shouldShow ? 'visibility_off' : 'visibility';
        input.focus({ preventScroll: true });
      });
    });
  }

  function bindEvents() {
    // Binding tolerante: evita travar todo o painel se o navegador mantiver HTML antigo em cache
    // enquanto carrega um app.js novo, ou se algum bloco opcional ainda não existir na tela.
    const on = (id, eventName, handler) => {
      const el = $(id);
      if (!el) {
        console.warn('[AGF SuperFrete] Elemento não encontrado para bind:', id);
        return null;
      }
      el.addEventListener(eventName, handler);
      return el;
    };

    const webappUrlEl = $('webappUrl');
    if (webappUrlEl) webappUrlEl.value = SfAdminApi.getWebAppUrl();

    const loginInputEl = $('loginInput');
    if (loginInputEl) loginInputEl.value = localStorage.getItem(SF_ADMIN_CONFIG.STORAGE_KEYS.LAST_LOGIN) || 'admin';

    on('btnSaveUrl', 'click', () => {
      try {
        const url = $('webappUrl') ? $('webappUrl').value : '';
        SfAdminApi.setWebAppUrl(url);
        toast('URL salva.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    });

    on('btnHealth', 'click', () => safeRun(async () => {
      const url = $('webappUrl') ? $('webappUrl').value : '';
      SfAdminApi.setWebAppUrl(url);
      const data = await SfAdminApi.health();
      showDebug(data);
      return data;
    }, 'Conexão OK.'));

    on('loginForm', 'submit', login);
    on('btnLogout', 'click', () => { clearSession(); showLogin(); });
    on('btnRefresh', 'click', () => switchScreen(state.currentScreen));
    on('btnNewClientTop', 'click', () => { clearForm(); switchScreen('cadastro'); });
    on('btnNewClient', 'click', clearForm);
    on('clientForm', 'submit', saveClient);
    on('LOGO_FILE', 'change', () => safeRun(handleLogoFilePreview));
    on('btnUploadLogo', 'click', uploadClientLogo);
    on('clientSearch', 'input', renderClientsTable);
    on('financeClientSelect', 'change', (ev) => { state.selectedClientId = ev.target.value; loadFinance(state.selectedClientId); });
    on('btnAdjustBalance', 'click', adjustBalance);
    on('btnReloadEmission', 'click', loadEmission);
    on('btnReloadLabels', 'click', loadLabels);
    on('btnRegisterRecharge', 'click', registerRecharge);
    on('btnLoadSfConfig', 'click', loadSuperFreteConfig);
    on('btnSaveSfConfig', 'click', saveSuperFreteConfig);
    on('btnQuoteSuperFrete', 'click', quoteSuperFrete);
    on('btnLookupDestCep', 'click', lookupDestCep);

    on('destCep', 'blur', () => {
      const cepEl = $('destCep');
      if (cepEl && digitsOnly(cepEl.value).length === 8) lookupDestCep();
    });
    on('destCep', 'input', () => {
      const status = $('destCepStatus');
      if (status) {
        status.className = 'field-hint';
        status.textContent = 'Digite o CEP para buscar o endereço.';
      }
    });

    const realCartBtn = $('btnCreateRealCartOrder');
    if (realCartBtn) {
      realCartBtn.disabled = false;
      realCartBtn.addEventListener('click', createRealCartOrder);
      // Fallback explícito para evitar botão sem ação em caso de rebind parcial do navegador.
      realCartBtn.onclick = createRealCartOrder;
    }

    on('emissionClientSelect', 'change', () => { renderRemetenteSelector(); });
    on('emissionRemetenteSelect', 'change', () => { renderEmissionCards(); updateEmissionPreview(); });
    ['valorCotado','valorReal','valorDeclarado','pkgPeso'].forEach(id => on(id, 'input', updateEmissionPreview));
    on('btnAddDceItem', 'click', () => addDceItem({ quantidade: 1, unidade: 'UN' }));
    on('emissionForm', 'submit', createSimulatedLabel);

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
    });
  }

  function init() {
    initPasswordToggles();
    bindEvents();
    clearForm();
    renderDceItemsIfEmpty();
    tryRestoreSession();
  }

  window.__AGF_SF_ADMIN_VERSION = '0.7.6-etapa7c-v2-preview-logo';
  return { init };
})();

document.addEventListener('DOMContentLoaded', SfAdminApp.init);
