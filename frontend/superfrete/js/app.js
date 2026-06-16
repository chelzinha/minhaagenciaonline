/* Minhas Postagens — Portal do Cliente */
(function () {
  const $ = (id) => document.getElementById(id);
  const state = {
    session: null,
    dashboard: null,
    bootstrap: null,
    quotePayload: null,
    selectedQuote: null,
    lastCepData: null,
    activeScreen: 'quote',
    history: [],
    finance: null
  };

  document.addEventListener('DOMContentLoaded', init);

  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      const input = $(button.dataset.passwordToggle);
      const icon = button.querySelector('.material-symbols-rounded');
      if (!input || button.dataset.passwordReady === '1') return;
      button.dataset.passwordReady = '1';
      button.addEventListener('click', () => {
        const shouldShow = input.type === 'password';
        input.type = shouldShow ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(shouldShow));
        button.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
        button.setAttribute('title', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
        if (icon) icon.textContent = shouldShow ? 'visibility_off' : 'visibility';
        input.focus({ preventScroll: true });
      });
    });
  }

  function init() {
    initPasswordToggles();
    $('loginUser').value = localStorage.getItem(SF_CLIENT_CONFIG.STORAGE_KEYS.LAST_LOGIN) || '';
    bindGlobal();
    bindForms();
    bindFinanceTabs();
    addItemRow({ descricao: 'Produto', quantidade: 1, valor_unitario: 25 });
    if (SfClientApi.getSessionToken()) bootSession();
  }

  function bindGlobal() {
    safeBind('btnLogout', 'click', () => logout());
    safeBind('btnHome', 'click', () => showScreen('quote'));
    safeBind('btnRefreshAll', 'click', () => refreshAll(true));
    document.querySelectorAll('.mp-bottom-nav button').forEach(btn => {
      btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    });
    safeBind('btnLookupCepQuote', 'click', () => lookupCep('quote'));
    safeBind('btnLookupCepLabel', 'click', () => lookupCep('label'));
    safeBind('btnAddItem', 'click', () => addItemRow());
    safeBind('btnLoadHistory', 'click', () => loadHistory(true));
    if (window.SfNfeImport && SfNfeImport.attach) SfNfeImport.attach();
  }

  function bindForms() {
    safeBind('loginForm', 'submit', async (ev) => { ev.preventDefault(); await doLogin(); });
    safeBind('quoteForm', 'submit', async (ev) => { ev.preventDefault(); await quoteFreight(); });
    safeBind('labelForm', 'submit', async (ev) => { ev.preventDefault(); await emitLabel(); });
  }

  function bindFinanceTabs() {
    document.querySelectorAll('[data-fin-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.finTab;
        document.querySelectorAll('[data-fin-tab]').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.mp-fin-panel').forEach(p => p.classList.toggle('active', p.id === 'fin-' + tab));
      });
    });
  }

  async function doLogin() {
    try {
      loading(true, 'Entrando...');
      const data = await SfClientApi.login($('loginUser').value.trim(), $('loginPass').value.trim());
      state.session = data;
      await refreshAll(false);
      $('loginView').classList.add('hidden');
      $('appView').classList.remove('hidden');
      toast('Login realizado.', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally { loading(false); }
  }

  async function bootSession() {
    try {
      loading(true, 'Restaurando sessão...');
      await refreshAll(false);
      $('loginView').classList.add('hidden');
      $('appView').classList.remove('hidden');
    } catch (e) {
      SfClientApi.logout();
      $('loginView').classList.remove('hidden');
      $('appView').classList.add('hidden');
      toast(e.message, 'warn');
    } finally { loading(false); }
  }

  function logout() {
    SfClientApi.logout();
    state.session = null;
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    const pass = $('loginPass');
    if (pass) pass.value = '';
    toast('Você saiu do portal.', 'ok');
  }

  async function refreshAll(showToast) {
    const data = await SfClientApi.dashboard();
    state.dashboard = data;
    state.bootstrap = await SfClientApi.bootstrap();
    renderHero();
    await Promise.all([loadHistory(false), loadFinance(false)]);
    if (showToast) toast('Dados atualizados.', 'ok');
  }

  function renderHero() {
    const c = state.dashboard && state.dashboard.cliente || {};
    const conta = state.dashboard && state.dashboard.conta || {};
    const saldo = number(conta.SALDO_CONTA || 0);
    const limite = number(conta.LIMITE_CREDITO || 0);
    const disp = number(conta.DISPONIVEL_EMISSAO || 0);

    setText('clientName', c.NOME_EXIBICAO || c.RAZAO_SOCIAL || 'Cliente');
    setText('clientCreditLine', 'Minhas Postagens');
    setText('topbarSubtitle', 'AGF JOSÉ BONIFÁCIO');

    const logo = c.LOGO_DATA_URL || c.LOGO_URL;
    if (logo) $('clientLogoBox').innerHTML = '<img src="' + escapeAttr(logo) + '" alt="Logo do cliente" />';

    const heroChips = $('clientHeroChips');
    if (heroChips) {
      heroChips.innerHTML =
        '<span class="chip chip-ok"><span class="material-symbols-rounded">verified</span><span>Conta ativa</span></span>' +
        '<span class="chip chip-blue"><span class="material-symbols-rounded">local_shipping</span><span>Minhas Postagens</span></span>';
    }

    const reservado = number(conta.VALOR_RESERVADO || 0);
    const heroStrip = $('heroCreditStrip');
    if (heroStrip) {
      heroStrip.innerHTML = buildHeroFinanceCards_(saldo, limite, reservado, disp);
    }
  }

  function showScreen(name) {
    state.activeScreen = name;
    document.querySelectorAll('.mp-screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.querySelectorAll('.mp-bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
    const screen = $('screen-' + name);
    setText('topbarTitle', screen ? screen.dataset.title || 'Minhas Postagens' : 'Minhas Postagens');
    if (name === 'history') loadHistory(false);
    if (name === 'finance') loadFinance(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function lookupCep(where) {
    const cepInput = where === 'quote' ? $('qCep') : $('dCep');
    try {
      loading(true, 'Buscando CEP...');
      const cep = digits(cepInput.value);
      const data = await SfClientApi.lookupCep(cep);
      state.lastCepData = data;
      if (where === 'quote') {
        $('qCepHint').textContent = [data.logradouro, data.bairro, data.cidade + '/' + data.uf].filter(Boolean).join(' • ');
        fillDestAddress(data, false);
      } else {
        fillDestAddress(data, true);
      }
      toast('Endereço encontrado.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  }

  function fillDestAddress(data, force) {
    if (!data) return;
    $('dCep').value = maskCep(data.cep || $('qCep').value);
    if (force || !$('dEndereco').value) $('dEndereco').value = data.logradouro || '';
    if (force || !$('dBairro').value) $('dBairro').value = data.bairro || '';
    if (force || !$('dCidade').value) $('dCidade').value = data.cidade || '';
    if (force || !$('dUf').value) $('dUf').value = data.uf || '';
    if (force || !$('dComplemento').value) $('dComplemento').value = data.complemento || '';
  }

  async function quoteFreight() {
    try {
      loading(true, 'Simulando envio...');
      const payload = buildQuotePayload();
      const data = await SfClientApi.quote(payload);
      state.quotePayload = payload;
      renderQuotes(data.quotes || []);
      toast('Simulação concluída.', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally { loading(false); }
  }

  function buildQuotePayload() {
    return {
      destinatario: { cep: digits($('qCep').value) },
      pacote: {
        pesoG: number($('qPesoG').value),
        altura: number($('qAltura').value),
        largura: number($('qLargura').value),
        comprimento: number($('qComprimento').value)
      },
      options: {
        valorDeclarado: number($('qValorDeclarado').value),
        AR: $('qAr').checked ? 'SIM' : 'NAO',
        MAO_PROPRIA: $('qMp').checked ? 'SIM' : 'NAO'
      },
      servicos: '1,2,17'
    };
  }

  function renderQuotes(quotes) {
    const box = $('quoteResults');
    if (!quotes.length) {
      box.innerHTML = '<div class="mp-list-empty">Nenhuma opção retornada para esta simulação.</div>';
      return;
    }
    box.innerHTML = quotes.map((q, idx) => {
      if (q.error && !q.price) {
        return '<article class="mp-quote-card"><div><div class="mp-quote-title"><span class="material-symbols-rounded">error</span>' + escapeHtml(q.serviceName || 'Serviço') + '</div><div class="mp-quote-meta">' + statusChip(q.error, 'warn') + '</div></div></article>';
      }
      return '<article class="mp-quote-card">' +
        '<div><div class="mp-quote-title"><span class="material-symbols-rounded">local_shipping</span>' + escapeHtml(q.serviceName || 'Serviço') + '</div>' +
        '<div class="mp-quote-meta">' + statusChip(q.carrier || 'Correios', 'info') + statusChip('Prazo: ' + formatPrazo(q), 'muted') + '</div></div>' +
        '<div><div class="mp-price">' + money(q.price) + '</div><button class="mp-action-chip primary" type="button" data-quote-index="' + idx + '"><span class="material-symbols-rounded">check_circle</span>Usar</button></div>' +
        '</article>';
    }).join('');
    box.querySelectorAll('[data-quote-index]').forEach(btn => {
      btn.addEventListener('click', () => selectQuote(quotes[Number(btn.dataset.quoteIndex)]));
    });
  }

  function selectQuote(q) {
    state.selectedQuote = q;
    if (state.lastCepData) fillDestAddress(state.lastCepData, false);
    $('dCep').value = maskCep(digits($('qCep').value));
    renderSelectedQuote();
    showScreen('label');
    toast('Frete selecionado. Complete os dados da etiqueta.', 'ok');
  }

  function renderSelectedQuote() {
    const q = state.selectedQuote;
    const box = $('selectedQuoteBox');
    if (!q) {
      box.innerHTML = '<header class="card-head"><span class="material-symbols-rounded">local_shipping</span><h2>Frete escolhido</h2></header><p class="mp-muted-text">Faça uma simulação e selecione uma opção para continuar.</p>';
      return;
    }
    box.innerHTML = '<header class="card-head"><span class="material-symbols-rounded">local_shipping</span><h2>Frete escolhido</h2></header>' +
      '<div class="mp-label-top"><div><div class="mp-label-name">' + escapeHtml(q.serviceName || 'Serviço') + '</div><div class="mp-label-meta">' + statusChip(q.carrier || 'Correios', 'info') + statusChip('Prazo: ' + formatPrazo(q), 'muted') + '</div></div><div class="mp-price">' + money(q.price) + '</div></div>';
  }

  async function emitLabel() {
    if (!state.selectedQuote || !state.quotePayload) {
      toast('Faça uma simulação e escolha uma opção antes de emitir.', 'warn');
      showScreen('quote');
      return;
    }
    if (!confirm('Confirmar geração da etiqueta? O valor final será registrado na sua conta.')) return;
    try {
      loading(true, 'Gerando etiqueta...');
      const payload = buildEmissionPayload();
      const result = await SfClientApi.emit(payload);
      toast('Etiqueta gerada com sucesso.', 'ok');
      state.selectedQuote = null;
      await refreshAll(false);
      showScreen('history');
      if (result && result.etiqueta && result.etiqueta.PDF_OFICIAL_URL) {
        // Mantém fallback oficial após emissão, sem expor botão com esse nome no histórico.
        window.open(result.etiqueta.PDF_OFICIAL_URL, '_blank', 'noopener');
      }
    } catch (e) {
      toast(e.message, 'err');
    } finally { loading(false); }
  }

  function buildEmissionPayload() {
    const q = state.selectedQuote;
    const base = state.quotePayload || buildQuotePayload();
    const serviceName = q.serviceName || (q.serviceCode === '1' ? 'PAC' : q.serviceCode === '17' ? 'MINI ENVIOS' : 'SEDEX');
    return {
      confirmacaoCliente: 'EMITIR_ETIQUETA',
      servico: serviceName,
      valorCotado: number(q.price),
      valorRealSuperFrete: number(q.price),
      destinatario: {
        nome: $('dNome').value.trim(),
        documento: digits($('dDocumento').value),
        cep: digits($('dCep').value),
        endereco: $('dEndereco').value.trim(),
        numero: $('dNumero').value.trim(),
        complemento: $('dComplemento').value.trim(),
        bairro: $('dBairro').value.trim(),
        cidade: $('dCidade').value.trim(),
        uf: $('dUf').value.trim().toUpperCase()
      },
      pacote: base.pacote,
      options: mergeOptionsWithImportedNfe_(base.options),
      itens: getItems(),
      notaFiscal: getImportedNfeInfo_()
    };
  }

  function getImportedNfeInfo_() {
    const patch = (window.SfNfeImport && SfNfeImport.getPatch && SfNfeImport.getPatch()) || (window.SF_CLIENT_NFE_IMPORT && window.SF_CLIENT_NFE_IMPORT.patch) || null;
    if (!patch) return null;
    return {
      numero: patch.numeroNotaFiscal || '',
      serie: patch.serieNotaFiscal || '',
      chave: patch.chaveNFe || '',
      valor: number(patch.valorNotaFiscal || patch.valorDeclaradoSugerido || 0)
    };
  }

  function mergeOptionsWithImportedNfe_(baseOptions) {
    const out = Object.assign({}, baseOptions || {});
    const patch = (window.SfNfeImport && SfNfeImport.getPatch && SfNfeImport.getPatch()) || (window.SF_CLIENT_NFE_IMPORT && window.SF_CLIENT_NFE_IMPORT.patch) || null;
    if (patch && patch.valorDeclaradoSugerido && !out.valorDeclarado) {
      out.valorDeclarado = number(patch.valorDeclaradoSugerido);
    }
    return out;
  }

  function addItemRow(item) {
    const box = $('itemsBox');
    const row = document.createElement('div');
    row.className = 'mp-item-row';
    row.innerHTML = '<div class="mp-item-grid">' +
      '<label>Descrição<input class="item-desc" value="' + escapeAttr(item && item.descricao || '') + '" placeholder="Produto" required /></label>' +
      '<label>Qtd<input class="item-qtd" type="number" min="1" step="1" value="' + escapeAttr(item && item.quantidade || 1) + '" required /></label>' +
      '<label>Valor unit. R$<input class="item-valor" type="number" min="0.01" step="0.01" value="' + escapeAttr(item && item.valor_unitario || '') + '" required /></label>' +
      '<button class="mp-remove-item" type="button" title="Remover"><span class="material-symbols-rounded">delete</span></button>' +
      '</div>';
    row.querySelector('.mp-remove-item').addEventListener('click', () => {
      if ($('itemsBox').children.length <= 1) { toast('A declaração precisa ter pelo menos 1 item.', 'warn'); return; }
      row.remove();
    });
    box.appendChild(row);
  }

  function getItems() {
    return Array.from($('itemsBox').children).map(row => ({
      descricao: row.querySelector('.item-desc').value.trim(),
      quantidade: number(row.querySelector('.item-qtd').value),
      valor_unitario: number(row.querySelector('.item-valor').value)
    }));
  }

  async function loadHistory(showToast) {
    try {
      const labels = await SfClientApi.history();
      state.history = labels || [];
      renderHistory(state.history);
      if (showToast) toast('Histórico atualizado.', 'ok');
    } catch (e) { if (showToast !== false) toast(e.message, 'err'); }
  }

  function renderHistory(labels) {
    const box = $('historyList');
    if (!labels.length) {
      box.innerHTML = '<div class="mp-list-empty">Nenhuma etiqueta emitida ainda.</div>';
      return;
    }
    box.innerHTML = labels.map(e => {
      const value = money(e.VALOR_COBRADO_CLIENTE || e.VALOR_REAL_SUPERFRETE || 0);
      const tracking = e.TRACKING ? String(e.TRACKING) : '';
      const destino = [e.DESTINATARIO_CIDADE, e.DESTINATARIO_UF].filter(Boolean).join('/');
      const date = compactDate(e.EMITIDO_EM || e.CRIADO_EM || '');
      const labelInfo = getEtiquetaStatusInfo(e.STATUS_LOGISTICO, tracking);
      const finInfo = getFinanceStatusInfo(e.STATUS_FINANCEIRO);
      const operationalAlert = tracking ? '' : statusChip('SRO pendente', 'warn', 'pending');
      const trackingChip = tracking
        ? '<button class="mp-sro-chip" type="button" data-track-order="' + escapeAttr(e.ORDER_ID_AGF) + '"><span class="material-symbols-rounded">local_shipping</span><span>' + escapeHtml(tracking) + '</span></button>'
        : '';
      const reprintHref = e.PDF_OFICIAL_URL && tracking ? './etiqueta-overlay.html?orderId=' + encodeURIComponent(e.ORDER_ID_AGF) : (e.PDF_OFICIAL_URL || '#');
      const reprintDisabled = e.PDF_OFICIAL_URL ? '' : ' aria-disabled="true" data-disabled="true"';
      return '<article class="mp-label-card mp-history-card-v5">' +
        '<div class="mp-history-card-grid">' +
          '<div class="mp-history-left">' +
            '<div class="mp-history-line-one">' +
              '<span class="mp-label-icon material-symbols-rounded">inventory_2</span>' +
              '<span class="mp-label-name">' + escapeHtml(e.DESTINATARIO_NOME || 'Destinatário') + '</span>' +
              statusChip(labelInfo.label, labelInfo.kind, labelInfo.icon) +
              operationalAlert +
            '</div>' +
            '<div class="mp-history-line-two">' +
              metaItem(e.SERVICO || 'Serviço', 'near_me') +
              (destino ? metaItem(destino, 'location_on') : '') +
              trackingChip +
            '</div>' +
          '</div>' +
          '<div class="mp-history-right">' +
            '<div class="mp-price">' + value + '</div>' +
            miniStatus('', finInfo.label, finInfo.kind, finInfo.icon) +
            (date ? '<div class="mp-label-date">' + escapeHtml(date) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mp-card-actions"><a class="mp-action-chip yellow" href="' + escapeAttr(reprintHref) + '" target="_blank" rel="noopener"' + reprintDisabled + '><span class="material-symbols-rounded">print</span>Reimprimir</a><button class="mp-action-chip" data-refresh-order="' + escapeAttr(e.ORDER_ID_AGF) + '" type="button"><span class="material-symbols-rounded">refresh</span>Atualizar</button></div>' +
        '</article>';
    }).join('');

    box.querySelectorAll('[data-refresh-order]').forEach(btn => btn.addEventListener('click', async () => {
      try { loading(true, 'Atualizando etiqueta...'); await SfClientApi.refreshOrder(btn.dataset.refreshOrder); await loadHistory(false); toast('Etiqueta atualizada.', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
      finally { loading(false); }
    }));
    box.querySelectorAll('[data-track-order]').forEach(btn => btn.addEventListener('click', () => {
      const label = state.history.find(x => String(x.ORDER_ID_AGF) === String(btn.dataset.trackOrder));
      openTrackingModal(label || { TRACKING: btn.textContent.trim() });
    }));
    box.querySelectorAll('[data-disabled="true"]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); toast('Etiqueta ainda não disponível para reimpressão.', 'warn'); }));
  }

  async function loadFinance(showToast) {
    try {
      const data = await SfClientApi.finance();
      state.finance = data || {};
      renderFinance(state.finance);
      if (showToast) toast('Financeiro atualizado.', 'ok');
    } catch (e) { if (showToast !== false) toast(e.message, 'err'); }
  }

  function renderFinance(data) {
    const conta = data && data.conta || {};
    const saldo = number(conta.SALDO_CONTA || 0);
    const limite = number(conta.LIMITE_CREDITO || 0);
    const reservado = number(conta.VALOR_RESERVADO || 0);
    const disponivel = number(conta.DISPONIVEL_EMISSAO || 0);
    const usado = Math.max(0, -saldo);
    const pct = limite > 0 ? Math.min(100, Math.max(0, (usado + reservado) / limite * 100)) : 0;
    const saldoLabel = saldo < 0 ? 'Valor em aberto para pagamento' : (saldo > 0 ? 'Saldo positivo para próximas emissões' : 'Sem valor em aberto');
    const contaKind = saldo < 0 ? 'warn' : 'ok';
    const contaIcon = saldo < 0 ? 'account_balance_wallet' : 'check_circle';
    const contaText = saldo < 0 ? 'Financeiro: em aberto' : 'Financeiro: em dia';

    $('financeSummary').innerHTML = '<section class="mp-balance-card">' +
      '<div class="mp-balance-head"><div><h3>Conta corrente</h3><div class="mp-balance-value ' + (saldo < 0 ? 'negative' : '') + '">' + money(saldo) + '</div><div class="mp-balance-sub">' + escapeHtml(saldoLabel) + '</div></div>' + miniStatus('', contaText, contaKind, contaIcon) + '</div>' +
      '<div class="mp-progress-wrap"><div class="mp-progress-line"><div class="mp-progress-fill" style="width:' + pct.toFixed(0) + '%"></div></div><div class="mp-progress-labels"><span>Uso do limite: ' + pct.toFixed(0) + '%</span><span>Pode emitir até: ' + money(disponivel) + '</span></div></div>' +
      '</section>';

    const lanc = data.lancamentos || [];
    $('ledgerList').innerHTML = lanc.length ? lanc.map(l => {
      const sign = String(l.SINAL || '');
      const cls = sign === '+' ? 'mp-positive' : (sign === '-' ? 'mp-negative' : '');
      const icon = sign === '+' ? 'add_circle' : (sign === '-' ? 'remove_circle' : 'info');
      const tipo = humanizeFinanceType(l.TIPO);
      return '<div class="mp-ledger-row"><div><strong><span class="material-symbols-rounded mp-row-icon">' + icon + '</span> ' + escapeHtml(tipo) + '</strong><small>' + escapeHtml(l.CRIADO_EM || '') + (l.MOTIVO ? ' · ' + escapeHtml(l.MOTIVO) : '') + '</small></div><strong class="' + cls + '">' + (sign === '+' ? '+' : sign === '-' ? '-' : '') + money(l.VALOR || 0) + '</strong></div>';
    }).join('') : '<div class="mp-list-empty">Nenhum uso registrado ainda.</div>';

    const cobrancas = data.cobrancas || [];
    const pagamentos = data.pagamentos || [];
    const pixHtml = [];
    cobrancas.forEach(c => {
      const cls = classForStatus(c.STATUS || '');
      const link = c.CHECKOUT_URL ? '<a class="mp-action-chip primary" target="_blank" rel="noopener" href="' + escapeAttr(c.CHECKOUT_URL) + '"><span class="material-symbols-rounded">qr_code_2</span>Pagar</a>' : '';
      pixHtml.push('<div class="mp-pix-row"><div><strong>' + miniStatus('Pix', normalizePixStatus(c.STATUS), cls, iconForStatus(c.STATUS)) + '</strong><small>' + escapeHtml(c.COBRANCA_ID || 'Cobrança') + ' · ' + escapeHtml(c.CRIADO_EM || '') + '</small></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end"><strong>' + money(c.VALOR_TOTAL || 0) + '</strong>' + link + '</div></div>');
    });
    pagamentos.forEach(p => {
      pixHtml.push('<div class="mp-pix-row"><div><strong>' + miniStatus('Pix', 'Pago', 'ok', 'check_circle') + '</strong><small>' + escapeHtml(p.PAGO_EM || p.CRIADO_EM || '') + '</small></div><strong class="mp-positive">' + money(p.VALOR_PAGO || p.VALOR_ESPERADO || 0) + '</strong></div>');
    });
    $('pixList').innerHTML = pixHtml.length ? pixHtml.join('') : '<div class="mp-list-empty">Nenhuma cobrança Pix registrada ainda.</div>';
  }

  function ensureTrackModal_() {
    let modal = document.getElementById('trackModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'trackModal';
    modal.className = 'track-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = [
      '<div class="track-modal-card" role="dialog" aria-modal="true" aria-labelledby="trackTitle" tabindex="-1">',
      '  <div class="track-modal-head">',
      '    <div><div class="track-modal-title" id="trackTitle">Rastreamento</div><div class="track-modal-code" id="trackCodigo">—</div></div>',
      '    <button class="icon-btn" type="button" id="trackClose" aria-label="Fechar"><span class="material-symbols-rounded">close</span></button>',
      '  </div>',
      '  <div class="track-summary"><div class="track-label"><span class="material-symbols-rounded">local_shipping</span><span>Código de rastreio</span></div><div class="track-summary-meta" id="trackResumo"></div></div>',
      '  <div class="track-timeline" id="trackTimeline"></div>',
      '  <div class="track-modal-actions">',
      '    <button class="btn btn-ghost btn-block" type="button" id="trackAtualizar"><span class="material-symbols-rounded">refresh</span>Atualizar</button>',
      '    <a class="btn btn-primary btn-block" id="trackAbrirCorreios" target="_blank" rel="noopener"><span class="material-symbols-rounded">open_in_new</span>Abrir rastreio</a>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeTrackingModal(); });
    modal.querySelector('#trackClose').addEventListener('click', closeTrackingModal);
    modal.querySelector('#trackAtualizar').addEventListener('click', async () => {
      const orderId = modal.getAttribute('data-order-id');
      if (!orderId) return;
      try { loading(true, 'Atualizando rastreio...'); await SfClientApi.refreshOrder(orderId); await loadHistory(false); const fresh = state.history.find(x => String(x.ORDER_ID_AGF) === String(orderId)); renderTrackingData(fresh); toast('Rastreio atualizado.', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
      finally { loading(false); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('show')) closeTrackingModal(); });
    return modal;
  }

  function openTrackingModal(label) {
    const modal = ensureTrackModal_();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('data-order-id', label && label.ORDER_ID_AGF || '');
    document.body.classList.add('modal-open');
    renderTrackingData(label);
  }

  function closeTrackingModal() {
    const modal = document.getElementById('trackModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function renderTrackingData(label) {
    label = label || {};
    const code = label.TRACKING || '—';
    setText('trackCodigo', code);
    setText('trackResumo', [label.DESTINATARIO_NOME, [label.DESTINATARIO_CIDADE, label.DESTINATARIO_UF].filter(Boolean).join('/'), label.EMITIDO_EM || label.CRIADO_EM].filter(Boolean).join(' • '));
    $('trackAbrirCorreios').href = code && code !== '—' ? SF_CLIENT_CONFIG.TRACKING_URL + encodeURIComponent(code) : '#';
    const events = [];
    if (label.EMITIDO_EM || label.CRIADO_EM) events.push({ date: label.EMITIDO_EM || label.CRIADO_EM, title: 'Etiqueta gerada', detail: 'Objeto registrado para postagem.', place: 'Minhas Postagens' });
    if (code && code !== '—') events.push({ date: '', title: 'Código de rastreio disponível', detail: code, place: 'Correios' });
    $('trackTimeline').innerHTML = events.length ? events.map(ev => '<div class="track-event"><div class="track-event-dot"></div><div class="track-event-body"><div class="track-event-date">' + escapeHtml(ev.date || '') + '</div><div class="track-event-title">' + escapeHtml(ev.title) + '</div><div class="track-event-detail">' + escapeHtml(ev.detail || '') + '</div><div class="track-event-place">' + escapeHtml(ev.place || '') + '</div></div></div>').join('') : '<div class="track-empty">Nenhum evento de rastreio disponível.</div>';
  }

  function buildHeroFinanceCards_(saldo, limite, reservado, disponivel) {
    const consumido = Math.max(0, -number(saldo));
    const cards = [
      { icon:'account_balance_wallet', label:'Consumido', val: money(consumido), hint: consumido > 0 ? 'Valor em aberto' : 'Nenhum valor em aberto', kind: consumido > 0 ? 'used warn' : 'used ok' },
      { icon:'credit_score', label:'Limite total', val: money(limite), hint:'Crédito liberado', kind:'limit' },
      { icon:'hourglass_top', label:'Reservado', val: money(reservado), hint:'Temporariamente', kind:'reserved' }
    ];
    return cards.map(c => '<div class="mp-hero-fin-card ' + c.kind + '"><span class="material-symbols-rounded">' + c.icon + '</span><div><span>' + c.label + '</span><strong>' + c.val + '</strong><small>' + c.hint + '</small></div></div>').join('');
  }

  function metaItem(label, icon) {
    if (!label) return '';
    return '<span class="mp-meta-item"><span class="material-symbols-rounded">' + icon + '</span><span>' + escapeHtml(label) + '</span></span>';
  }

  function statusChip(label, kind, icon) {
    if (!label) return '';
    return '<span class="mp-status-chip ' + (kind || 'info') + '">' + (icon ? '<span class="material-symbols-rounded">' + icon + '</span>' : '') + '<span>' + escapeHtml(label) + '</span></span>';
  }

  function miniStatus(prefix, label, kind, icon) {
    if (!label) return '';
    return '<span class="mp-mini-status ' + (kind || 'info') + '">' + (icon ? '<span class="material-symbols-rounded">' + icon + '</span>' : '') + '<span>' + (prefix ? '<small>' + escapeHtml(prefix) + '</small>' : '') + '<strong>' + escapeHtml(label) + '</strong></span></span>';
  }

  function getEtiquetaStatusInfo(status, tracking) {
    const t = upper_(status);
    if (/CANCEL/.test(t)) return { label:'Cancelada', kind:'err', icon:'cancel' };
    if (/ERRO|FALHA/.test(t)) return { label:'Erro na emissão', kind:'err', icon:'error' };
    if (/RELEASED|EMITIDA|CONCLUID/.test(t) || tracking) return { label:'Etiqueta gerada', kind:'ok', icon:'check_circle' };
    if (/PENDING|RESERVADA|AGUARD/.test(t)) return { label:'Aguardando emissão', kind:'warn', icon:'schedule' };
    if (/POSTADA/.test(t)) return { label:'Postada', kind:'info', icon:'outbox' };
    return { label:'Aguardando emissão', kind:'warn', icon:'schedule' };
  }

  function getFinanceStatusInfo(status) {
    const t = upper_(status);
    if (/PAGA|PAGO|QUITAD/.test(t)) return { label:'Pago', kind:'ok', icon:'check_circle' };
    if (/ABERTO|COBRANCA/.test(t)) return { label:'Em aberto', kind:'warn', icon:'account_balance_wallet' };
    if (/RESERV/.test(t)) return { label:'Reservado', kind:'warn', icon:'schedule' };
    if (/CANCEL/.test(t)) return { label:'Cancelado', kind:'err', icon:'cancel' };
    if (/ESTORN/.test(t)) return { label:'Estornado', kind:'info', icon:'undo' };
    return { label:'Em aberto', kind:'warn', icon:'account_balance_wallet' };
  }

  function normalizeLogStatus(s) {
    return getEtiquetaStatusInfo(s, '').label;
  }
  function normalizeFinStatus(s) {
    return getFinanceStatusInfo(s).label;
  }
  function normalizePixStatus(s) {
    const t = upper_(s);
    if (/PAGA|PAGO/.test(t)) return 'Pago';
    if (/AGUARD|PEND/.test(t)) return 'Pendente';
    if (/EXPIR/.test(t)) return 'Expirado';
    if (/CANCEL/.test(t)) return 'Cancelado';
    return s || 'Pendente';
  }
  function classForStatus(s) {
    const t = upper_(s);
    if (/RELEASED|EMITIDA|CONCLUID|PAGA|PAGO|ENTREG/.test(t)) return 'ok';
    if (/PENDING|RESERV|AGUARD|ABERTO|COBRANCA|EXPIR/.test(t)) return 'warn';
    if (/CANCEL|ERRO|FALHA/.test(t)) return 'err';
    return 'info';
  }
  function iconForStatus(s) {
    const t = upper_(s);
    if (/RELEASED|EMITIDA|CONCLUID|PAGA|PAGO|ENTREG/.test(t)) return 'check_circle';
    if (/ABERTO|COBRANCA/.test(t)) return 'account_balance_wallet';
    if (/PENDING|RESERV|AGUARD|EXPIR/.test(t)) return 'schedule';
    if (/CANCEL/.test(t)) return 'cancel';
    if (/ERRO|FALHA/.test(t)) return 'error';
    return 'info';
  }
  function humanizeFinanceType(t) {
    return String(t || '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  }

  function compactDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return m[3] + '/' + m[2] + ' ' + m[4] + ':' + m[5];
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
    if (br) return br[1] + '/' + br[2] + ' ' + br[4] + ':' + br[5];
    return raw.length > 16 ? raw.slice(0, 16) : raw;
  }

  function formatPrazo(q) {
    if (!q) return '—';
    if (q.deliveryMin && q.deliveryMax && q.deliveryMin !== q.deliveryMax) return q.deliveryMin + ' a ' + q.deliveryMax + ' dias úteis';
    if (q.deliveryMax || q.deliveryMin) return (q.deliveryMax || q.deliveryMin) + ' dias úteis';
    return 'Consultar';
  }

  function loading(on, text) {
    const overlay = $('loading');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !on);
    const textEl = $('loadingText');
    if (text && textEl) textEl.textContent = text;
  }
  function toast(msg, type) {
    const el = $('toast');
    if (!el) {
      console.log('[Minhas Postagens]', type || 'info', msg);
      return;
    }
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, 3600);
  }
  function setText(id, value) { const el = $(id); if (el) el.textContent = value == null ? '' : String(value); }
  function safeBind(id, event, handler) { const el = $(id); if (el) el.addEventListener(event, handler); }
  function money(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function number(v) { const n = Number(String(v || '').replace(',', '.')); return isNaN(n) ? 0 : n; }
  function digits(v) { return String(v || '').replace(/\D+/g, ''); }
  function maskCep(v) { const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
  function upper_(v) { return String(v || '').toUpperCase(); }
  function escapeHtml(str) { return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function escapeAttr(str) { return escapeHtml(str); }
})();
