/* =====================================================
   CALCULADORA BALCÃO AGF — Page Controller
   ===================================================== */

const BalcaoPage = (function () {
  const $ = id => document.getElementById(id);

  const state = {
    config: null,
    origem: null,
    destino: null,
    cotacao: null,
    selecionada: null,
    origemDefault: {
      cep: BALCAO_CONFIG.CEP_ORIGEM_FALLBACK,
      cidade: BALCAO_CONFIG.CIDADE_ORIGEM_FALLBACK,
      uf: BALCAO_CONFIG.UF_ORIGEM_FALLBACK
    }
  };

  function digits(value) { return String(value == null ? '' : value).replace(/\D/g, ''); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function fmtCep(value) {
    const d = digits(value).slice(0, 8);
    return d.length <= 5 ? d : d.slice(0, 5) + '-' + d.slice(5);
  }
  function fmtMoney(value) {
    const n = Number(value || 0);
    if (!isFinite(n)) return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function fmtMoneyInput(value) {
    const d = digits(value);
    if (!d) return '';
    const cents = (parseInt(d, 10) / 100).toFixed(2);
    const parts = cents.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts[0] + ',' + parts[1];
  }
  function parseMoney(value) {
    if (value == null || value === '') return 0;
    const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(normalized);
    return isFinite(n) ? n : 0;
  }
  function fmtCpfCnpj(value) {
    const d = digits(value).slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, function (_, a, b, c, e) {
        let s = a;
        if (b) s += '.' + b;
        if (c) s += '.' + c;
        if (e) s += '-' + e;
        return s;
      });
    }
    return d.replace(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*/, function (_, a, b, c, e, f) {
      let s = a;
      if (b) s += '.' + b;
      if (c) s += '.' + c;
      if (e) s += '/' + e;
      if (f) s += '-' + f;
      return s;
    });
  }
  function fmtPhone(value) {
    const d = digits(value).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function showLoading(text) {
    const el = $('loading');
    const tx = $('loadingText');
    if (tx) tx.textContent = text || 'Processando...';
    if (el) el.classList.add('show');
  }
  function hideLoading() {
    const el = $('loading');
    if (el) el.classList.remove('show');
  }
  let toastTimer = null;
  function toast(message, type) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'toast show' + (type ? ' ' + type : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
  }
  function toastError(err) { toast((err && err.message) || String(err || 'Erro inesperado'), 'error'); }

  function bindMask(id, formatter) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const start = el.selectionStart;
      const before = el.value;
      const after = formatter(before);
      if (after !== before) {
        el.value = after;
        try { el.setSelectionRange(start + (after.length - before.length), start + (after.length - before.length)); } catch (e) {}
      }
    });
  }

  function bindSegmented(container) {
    if (!container) return;
    container.querySelectorAll('input[type="radio"]').forEach(input => {
      input.addEventListener('change', () => {
        container.querySelectorAll('.seg-item').forEach(label => label.classList.remove('is-selected'));
        const label = input.closest('.seg-item');
        if (label) label.classList.add('is-selected');
        if (input.name === 'tipoObjeto') syncTipoObjeto();
      });
    });
  }

  async function loadConfig() {
    try {
      const cfg = await BalcaoApi.config();
      state.config = cfg || {};
      state.origemDefault = {
        cep: digits(cfg.cepOrigemDefault || BALCAO_CONFIG.CEP_ORIGEM_FALLBACK),
        cidade: cfg.cidadeOrigemDefault || BALCAO_CONFIG.CIDADE_ORIGEM_FALLBACK,
        uf: (cfg.ufOrigemDefault || BALCAO_CONFIG.UF_ORIGEM_FALLBACK).toUpperCase()
      };
      $('apiPrazoStatus').textContent = cfg.apiPrazoConfigurada ? 'Prazo via API Correios configurado' : 'Prazo não configurado';
      $('apiPrazoStatus').className = 'field-hint ' + (cfg.apiPrazoConfigurada ? 'ok' : 'warn');
    } catch (e) {
      $('apiPrazoStatus').textContent = 'Não consegui carregar a configuração';
      $('apiPrazoStatus').className = 'field-hint error';
      toastError(e);
    }

    aplicarOrigemDefault();
  }

  function aplicarOrigemDefault() {
    const o = state.origemDefault;
    $('cepOrigem').value = fmtCep(o.cep);
    state.origem = Object.assign({}, o);
    if ($('summaryOrigemHero')) $('summaryOrigemHero').textContent = [fmtCep(o.cep), o.cidade, o.uf].filter(Boolean).join(' • ');
    updateCepHint('origemHint', o, 'CEP padrão da agência');
    updateSummary();
  }

  function updateCepHint(id, data, prefix) {
    const el = $(id);
    if (!el) return;
    if (!data || !data.cep) {
      el.textContent = '—';
      el.className = 'field-hint';
      return;
    }
    el.textContent = (prefix ? prefix + ': ' : '') + [fmtCep(data.cep), data.cidade, data.uf].filter(Boolean).join(' • ');
    el.className = 'field-hint ok';
  }

  function normalizeCepData(data, fallbackCep) {
    data = data || {};
    const cep = digits(data.cep || data.CEP || fallbackCep || '');
    return {
      cep: cep,
      logradouro: data.logradouro || data.endereco || data.address || '',
      bairro: data.bairro || data.district || '',
      cidade: data.cidade || data.localidade || data.municipio || data.city || '',
      uf: String(data.uf || data.estado || data.state || '').toUpperCase(),
      fonte: data.fonte || data.source || ''
    };
  }

  async function buscarCep(tipo, silent) {
    const id = tipo === 'origem' ? 'cepOrigem' : 'cepDestino';
    const hintId = tipo === 'origem' ? 'origemHint' : 'destinoHint';
    const cep = digits($(id).value);
    if (cep.length !== 8) {
      if (!silent) toast('CEP precisa ter 8 dígitos', 'error');
      return null;
    }

    showLoading('Buscando CEP...');
    try {
      const data = normalizeCepData(await BalcaoApi.cep(cep), cep);
      if (tipo === 'origem') state.origem = data;
      else {
        state.destino = data;
        preencherEndereco('dest', data);
      }
      updateCepHint(hintId, data, tipo === 'origem' ? 'Origem' : 'Destino');
      updateSummary();
      if (!silent) toast('CEP encontrado', 'success');
      return data;
    } catch (e) {
      const hint = $(hintId);
      if (hint) {
        hint.textContent = 'CEP não encontrado. Confira ou preencha manualmente depois.';
        hint.className = 'field-hint error';
      }
      if (!silent) toastError(e);
      return null;
    } finally {
      hideLoading();
    }
  }

  function preencherEndereco(prefix, data) {
    const map = {
      logradouro: prefix + 'Endereco',
      bairro: prefix + 'Bairro',
      cidade: prefix + 'Cidade',
      uf: prefix + 'Uf'
    };
    if ($(map.logradouro)) $(map.logradouro).value = data.logradouro || '';
    if ($(map.bairro)) $(map.bairro).value = data.bairro || '';
    if ($(map.cidade)) $(map.cidade).value = data.cidade || '';
    if ($(map.uf)) $(map.uf).value = (data.uf || '').toUpperCase();
  }

  function getTipoObjeto() {
    const el = document.querySelector('input[name="tipoObjeto"]:checked');
    return (el && el.value) || 'PACOTE';
  }
  function syncTipoObjeto() {
    const tipo = getTipoObjeto();
    const isRolo = tipo === 'ROLO';
    const isEnvelope = tipo === 'ENVELOPE';
    $('fieldAltura').hidden = isRolo || isEnvelope;
    $('fieldLargura').hidden = false;
    $('fieldComprimento').hidden = false;
    $('fieldDiametro').hidden = !isRolo;
    if (isRolo) {
      $('dimensoesHint').textContent = 'Rolo: informe comprimento e diâmetro.';
      $('alturaCm').value = '';
    } else if (isEnvelope) {
      $('dimensoesHint').textContent = 'Envelope: informe comprimento e largura.';
      $('alturaCm').value = '';
      $('diametroCm').value = '';
    } else {
      $('dimensoesHint').textContent = 'Pacote: informe altura, largura e comprimento.';
      $('diametroCm').value = '';
    }
    updateSummary();
  }

  function coletarEntrada() {
    const tipoObjeto = getTipoObjeto();
    const payload = {
      cepOrigem: digits($('cepOrigem').value),
      cepDestino: digits($('cepDestino').value),
      origem: state.origem || null,
      destino: state.destino || null,
      tipoObjeto: tipoObjeto,
      pesoG: Number($('pesoG').value || 0),
      alturaCm: Number($('alturaCm').value || 0),
      larguraCm: Number($('larguraCm').value || 0),
      comprimentoCm: Number($('comprimentoCm').value || 0),
      diametroCm: Number($('diametroCm').value || 0),
      valorDeclarado: parseMoney($('valorDeclarado').value || 0),
      ar: $('ar').checked ? 'SIM' : 'NAO',
      maoPropria: $('maoPropria').checked ? 'SIM' : 'NAO'
    };

    if (payload.cepOrigem.length !== 8) throw new Error('Informe um CEP de origem válido.');
    if (payload.cepDestino.length !== 8) throw new Error('Informe um CEP de destino válido.');
    if (payload.pesoG <= 0) throw new Error('Informe o peso em gramas.');
    if (tipoObjeto === 'ROLO') {
      if (payload.comprimentoCm <= 0 || payload.diametroCm <= 0) throw new Error('Para rolo, informe comprimento e diâmetro.');
      payload.larguraCm = payload.diametroCm;
      payload.alturaCm = payload.diametroCm;
    } else if (tipoObjeto === 'ENVELOPE') {
      if (payload.comprimentoCm <= 0 || payload.larguraCm <= 0) throw new Error('Para envelope, informe comprimento e largura.');
      payload.alturaCm = 1;
    } else {
      if (payload.alturaCm <= 0 || payload.larguraCm <= 0 || payload.comprimentoCm <= 0) {
        throw new Error('Informe altura, largura e comprimento.');
      }
    }
    return payload;
  }

  async function cotar(ev) {
    ev.preventDefault();
    let payload;
    try { payload = coletarEntrada(); } catch (e) { toastError(e); return; }

    showLoading('Calculando opções de balcão...');
    try {
      const data = await BalcaoApi.cotar(payload);
      state.cotacao = data;
      state.selecionada = null;
      renderResults(data);
      updateSummary();
      $('etiquetaSection').classList.add('hidden');
      const okCount = (data.opcoes || []).filter(o => o.ok).length;
      toast(okCount ? 'Cotação calculada' : 'Nenhuma opção disponível para esses dados', okCount ? 'success' : 'error');
    } catch (e) {
      state.cotacao = null;
      state.selecionada = null;
      renderResults(null, e);
      updateSummary();
      toastError(e);
    } finally {
      hideLoading();
    }
  }

  function renderResults(data, err) {
    const wrap = $('results');
    if (!wrap) return;
    if (err) {
      wrap.innerHTML = '<div class="empty-state"><strong>Não foi possível calcular.</strong><br>' + escapeHtml(err.message || err) + '</div>';
      return;
    }
    if (!data || !Array.isArray(data.opcoes) || !data.opcoes.length) {
      wrap.innerHTML = '<div class="empty-state">Preencha os dados e clique em Calcular opções.</div>';
      return;
    }

    wrap.innerHTML = data.opcoes.map((op, idx) => {
      if (!op.ok) {
        return '<article class="result-card is-error">' +
          '<div class="result-top"><div><div class="result-name">' + escapeHtml(op.nome || op.servico || 'Serviço') + '</div>' +
          '<div class="result-code">Código ' + escapeHtml(op.codigoServico || '') + '</div></div></div>' +
          '<div class="result-error">' + escapeHtml(op.erro || 'Indisponível para os dados informados.') + '</div>' +
        '</article>';
      }
      const prazoLabel = op.prazo && op.prazo.ok
        ? ((op.prazoDias || 0) + ' dia(s) útil(eis)')
        : (op.prazo && op.prazo.erro ? 'Não retornou' : '—');
      return '<article class="result-card is-ok" data-idx="' + idx + '">' +
        '<div class="result-top">' +
          '<div><div class="result-name">' + escapeHtml(op.nome || op.servico) + '</div>' +
          '<div class="result-code">Código ' + escapeHtml(op.codigoServico || '') + ' • Peso tarifado ' + escapeHtml(op.pesoTarifadoG || '') + ' g</div></div>' +
          '<div class="result-price">' + fmtMoney(op.total) + '</div>' +
        '</div>' +
        '<div class="result-grid">' +
          '<div class="result-mini"><small>Serviço</small><strong>' + fmtMoney(op.precoBase) + '</strong></div>' +
          '<div class="result-mini"><small>VD</small><strong>' + fmtMoney(op.vdAdicional) + '</strong></div>' +
          '<div class="result-mini"><small>Prazo</small><strong>' + escapeHtml(prazoLabel) + '</strong></div>' +
          '<div class="result-mini"><small>AR</small><strong>' + fmtMoney(op.arValor) + '</strong></div>' +
          '<div class="result-mini"><small>Mão Própria</small><strong>' + fmtMoney(op.mpValor) + '</strong></div>' +
          '<div class="result-mini"><small>Faixa</small><strong>' + escapeHtml(op.faixa || '—') + '</strong></div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-block" data-select="' + idx + '"><span class="material-symbols-rounded">check_circle</span>Selecionar para Etiqueta</button>' +
      '</article>';
    }).join('');

    wrap.querySelectorAll('[data-select]').forEach(btn => {
      btn.addEventListener('click', () => selecionarOpcao(Number(btn.getAttribute('data-select'))));
    });
  }

  function selecionarOpcao(idx) {
    const op = state.cotacao && state.cotacao.opcoes ? state.cotacao.opcoes[idx] : null;
    if (!op || !op.ok) return;
    state.selecionada = op;
    document.querySelectorAll('.result-card').forEach(c => c.classList.remove('is-selected'));
    const card = document.querySelector('.result-card[data-idx="' + idx + '"]');
    if (card) card.classList.add('is-selected');

    preencherFichaComCotacao();
    $('etiquetaSection').classList.remove('hidden');
    updateSummary();
    setTimeout(() => {
      try { $('etiquetaSection').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }, 60);
  }

  function preencherFichaComCotacao() {
    if (state.destino) preencherEndereco('dest', state.destino);
    if ($('destCep')) $('destCep').value = fmtCep($('cepDestino').value);
  }

  function formatDims(payload) {
    if (!payload) payload = safeEntrada();
    const tipo = payload.tipoObjeto || getTipoObjeto();
    if (tipo === 'ROLO') return 'Compr. ' + (payload.comprimentoCm || 0) + ' cm • Diâm. ' + (payload.diametroCm || 0) + ' cm';
    if (tipo === 'ENVELOPE') return (payload.comprimentoCm || 0) + ' × ' + (payload.larguraCm || 0) + ' cm';
    return (payload.alturaCm || 0) + ' × ' + (payload.larguraCm || 0) + ' × ' + (payload.comprimentoCm || 0) + ' cm';
  }

  function safeEntrada() {
    try { return coletarEntrada(); } catch (e) { return {}; }
  }

  function updateSummary() {
    const entrada = state.cotacao && state.cotacao.entrada ? state.cotacao.entrada : safeEntrada();
    const op = state.selecionada;
    const origem = state.origem || entrada || {};
    const destino = state.destino || entrada || {};

    $('summaryOrigem').textContent = [fmtCep(entrada.cepOrigem || $('cepOrigem').value), origem.cidade || entrada.cidadeOrigem, origem.uf || entrada.ufOrigem].filter(Boolean).join(' • ') || '—';
    $('summaryDestino').textContent = [fmtCep(entrada.cepDestino || $('cepDestino').value), destino.cidade || entrada.cidadeDestino, destino.uf || entrada.ufDestino].filter(Boolean).join(' • ') || '—';
    $('summaryObjeto').textContent = [entrada.tipoObjeto || getTipoObjeto(), (entrada.pesoG || $('pesoG').value || '0') + ' g', formatDims(entrada)].filter(Boolean).join(' • ');
    $('summaryVd').textContent = fmtMoney(entrada.valorDeclarado || parseMoney($('valorDeclarado').value || 0));
    $('summaryServico').textContent = op ? (op.nome + ' • ' + fmtMoney(op.total)) : 'Nenhum serviço selecionado';
  }

  function coletarFicha() {
    if (!state.selecionada) throw new Error('Selecione uma opção de serviço antes.');
    const remetenteNome = $('remNome').value.trim();
    const remetenteCep = digits($('remCep').value);
    const remetenteEndereco = $('remEndereco').value.trim();
    const remetenteNumero = $('remNumero').value.trim();
    const remetenteBairro = $('remBairro').value.trim();
    const remetenteCidade = $('remCidade').value.trim();
    const remetenteUf = $('remUf').value.trim().toUpperCase();
    const destNome = $('destNome').value.trim();
    const destCep = digits($('destCep').value || $('cepDestino').value);
    const destEndereco = $('destEndereco').value.trim();
    const destNumero = $('destNumero').value.trim();
    const destBairro = $('destBairro').value.trim();
    const destCidade = $('destCidade').value.trim();
    const destUf = $('destUf').value.trim().toUpperCase();

    const faltando = [];
    if (!remetenteNome) faltando.push('nome do remetente');
    if (remetenteCep.length !== 8) faltando.push('CEP do remetente');
    if (!remetenteEndereco) faltando.push('logradouro do remetente');
    if (!remetenteNumero) faltando.push('número do remetente');
    if (!remetenteBairro) faltando.push('bairro do remetente');
    if (!remetenteCidade) faltando.push('cidade do remetente');
    if (!remetenteUf) faltando.push('UF do remetente');
    if (!destNome) faltando.push('nome do destinatário');
    if (destCep.length !== 8) faltando.push('CEP do destinatário');
    if (!destEndereco) faltando.push('logradouro do destinatário');
    if (!destNumero) faltando.push('número do destinatário');
    if (!destBairro) faltando.push('bairro do destinatário');
    if (!destCidade) faltando.push('cidade do destinatário');
    if (!destUf) faltando.push('UF do destinatário');
    if (faltando.length) throw new Error('Preencha: ' + faltando.join(', ') + '.');

    return {
      remetente: {
        nome: remetenteNome,
        cpfCnpj: digits($('remCpfCnpj').value),
        celular: digits($('remCelular').value),
        email: $('remEmail').value.trim(),
        cep: remetenteCep,
        endereco: remetenteEndereco,
        numero: remetenteNumero,
        complemento: $('remComplemento').value.trim(),
        bairro: remetenteBairro,
        cidade: remetenteCidade,
        uf: remetenteUf
      },
      destinatario: {
        nome: destNome,
        cpfCnpj: digits($('destCpfCnpj').value),
        celular: digits($('destCelular').value),
        email: $('destEmail').value.trim(),
        cep: destCep,
        endereco: destEndereco,
        numero: destNumero,
        complemento: $('destComplemento').value.trim(),
        bairro: destBairro,
        cidade: destCidade,
        uf: destUf
      },
      observacao: $('observacao').value.trim()
    };
  }

  async function salvarRascunho() {
    let ficha;
    try { ficha = coletarFicha(); } catch (e) { toastError(e); return; }

    const payload = {
      origem: 'BALCAO_WEB',
      entrada: state.cotacao ? state.cotacao.entrada : safeEntrada(),
      opcao: state.selecionada,
      ficha: ficha,
      criadoEm: new Date().toISOString()
    };

    showLoading('Salvando rascunho...');
    try {
      const result = await BalcaoApi.salvarRascunho(payload);
      toast('Rascunho salvo: ' + (result.id || ''), 'success');
      $('rascunhoId').textContent = result.id || 'salvo';
      $('rascunhoIdWrap').classList.remove('hidden');
    } catch (e) {
      toastError(e);
    } finally {
      hideLoading();
    }
  }

  function imprimirFicha() {
    let ficha;
    try { ficha = coletarFicha(); } catch (e) { toastError(e); return; }

    const entrada = state.cotacao ? state.cotacao.entrada : safeEntrada();
    const op = state.selecionada;
    const print = $('printArea');
    print.innerHTML = buildPrintHtml(entrada, op, ficha);
    setTimeout(() => window.print(), 100);
  }

  function joinEnderecoPessoa_(p) {
    const endereco = [p.endereco, p.numero].filter(Boolean).join(', ');
    return endereco || '';
  }

  function joinLinhaEndereco_(p) {
    return [joinEnderecoPessoa_(p), p.complemento, p.bairro].filter(Boolean).join('  ');
  }

  function joinCidadeUf_(p) {
    return [p.cidade, p.uf].filter(Boolean).join('/');
  }

  function buildCepBoxes_(cep) {
    const d = digits(cep).slice(0, 8).padEnd(8, ' ');
    return d.split('').map(ch => '<span>' + escapeHtml(ch.trim()) + '</span>').join('');
  }

  function buildCode128CepSvg_(cep) {
    const d = digits(cep).slice(0, 8);
    if (d.length !== 8) return '';

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

    const values = [105]; // Code 128 C
    for (let i = 0; i < d.length; i += 2) values.push(Number(d.slice(i, i + 2)));

    let checksum = values[0];
    for (let i = 1; i < values.length; i++) checksum += values[i] * i;
    values.push(checksum % 103, 106);

    let x = 8;
    const bars = [];
    values.forEach(value => {
      const pattern = patterns[value];
      for (let i = 0; i < pattern.length; i++) {
        const w = Number(pattern.charAt(i));
        if (i % 2 === 0) bars.push('<rect x="' + x + '" y="0" width="' + w + '" height="42"></rect>');
        x += w;
      }
    });

    const total = x + 8;
    return '<svg class="cep-barcode" viewBox="0 0 ' + total + ' 42" preserveAspectRatio="none" role="img" aria-label="Código de barras do CEP ' + escapeHtml(fmtCep(d)) + '">' +
      '<rect x="0" y="0" width="' + total + '" height="42" fill="#fff"></rect>' +
      '<g fill="#000">' + bars.join('') + '</g>' +
    '</svg>';
  }

  function buildPrintHtml(entrada, op, ficha) {
    const rem = ficha.remetente || {};
    const dest = ficha.destinatario || {};
    const observacao = ficha.observacao || '';
    const servico = op && (op.nome || op.servico || op.codigoServico) ? (op.nome || op.servico || op.codigoServico) : 'Balcão';
    const peso = entrada && entrada.pesoG ? String(entrada.pesoG) + ' g' : '';
    const cepBarcode = buildCode128CepSvg_(dest.cep || '');

    return '<section class="print-label-sheet">' +
      '<div class="sro-placeholder">' +
        '<span class="corner corner-tl"></span>' +
        '<span class="corner corner-tr"></span>' +
        '<span class="corner corner-bl"></span>' +
        '<span class="corner corner-br"></span>' +
        '<div class="sro-inner">' +
          '<div class="sro-title">USO EXCLUSIVO DOS CORREIOS</div>' +
          '<div class="sro-subtitle">Cole aqui a etiqueta física com o código identificador da encomenda</div>' +
          '<div class="sro-meta">' +
            '<span>Serviço: <strong>' + escapeHtml(servico) + '</strong></span>' +
            (peso ? '<span>Peso: <strong>' + escapeHtml(peso) + '</strong></span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="receipt-lines">' +
        '<div class="receipt-row receipt-row-date"><span>Recebedor:</span><i></i></div>' +
        '<div class="receipt-row"><span>Assinatura:</span><i></i><span>Documento:</span><i></i></div>' +
      '</div>' +

      '<div class="neighbor-box">' +
        '<div class="neighbor-title">AUTORIZA A ENTREGA NO VIZINHO?</div>' +
        '<div class="neighbor-options"><span class="check"></span><span>NÃO</span><span class="check"></span><span>SIM</span><span class="neighbor-number">NÚMERO</span></div>' +
      '</div>' +

      '<div class="dest-box">' +
        '<div class="section-head"><span>DESTINATÁRIO</span><strong>Correios</strong></div>' +
        '<div class="dest-content">' +
          '<div class="dest-name">' + escapeHtml(dest.nome || '') + '</div>' +
          '<div class="dest-line">' + escapeHtml(joinLinhaEndereco_(dest)) + '</div>' +
          '<div class="dest-city-line"><strong>' + escapeHtml(fmtCep(dest.cep || '')) + '</strong><span>' + escapeHtml(joinCidadeUf_(dest)) + '</span></div>' +
          '<div class="dest-bottom-grid">' +
            '<div class="cep-barcode-wrap">' + cepBarcode + '<div class="cep-boxes">' + buildCepBoxes_(dest.cep || '') + '</div></div>' +
            '<div class="dest-obs"><strong>Obs:</strong> ' + escapeHtml(observacao) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="rem-box">' +
        '<div class="rem-title"><strong>Remetente:</strong> ' + escapeHtml(rem.nome || '') + '</div>' +
        '<div>' + escapeHtml(joinLinhaEndereco_(rem)) + '</div>' +
        '<div><strong>' + escapeHtml(fmtCep(rem.cep || '')) + '</strong> ' + escapeHtml(joinCidadeUf_(rem)) + '</div>' +
      '</div>' +
    '</section>';
  }

  async function buscarCepPessoa(prefix) {
    const cep = digits($(prefix + 'Cep').value);
    if (cep.length !== 8) {
      toast('CEP precisa ter 8 dígitos', 'error');
      return;
    }
    showLoading('Buscando CEP...');
    try {
      const data = normalizeCepData(await BalcaoApi.cep(cep), cep);
      preencherEndereco(prefix, data);
      toast('CEP encontrado', 'success');
    } catch (e) {
      toastError(e);
    } finally {
      hideLoading();
    }
  }

  function bindEvents() {
    bindMask('cepOrigem', fmtCep);
    bindMask('cepDestino', fmtCep);
    bindMask('remCep', fmtCep);
    bindMask('destCep', fmtCep);
    bindMask('remCpfCnpj', fmtCpfCnpj);
    bindMask('destCpfCnpj', fmtCpfCnpj);
    bindMask('remCelular', fmtPhone);
    bindMask('destCelular', fmtPhone);
    bindMask('valorDeclarado', fmtMoneyInput);

    ['valorDeclarado'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('blur', () => { el.value = fmtMoneyInput(el.value); updateSummary(); });
    });

    ['pesoG','alturaCm','larguraCm','comprimentoCm','diametroCm','cepOrigem','cepDestino'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', updateSummary);
    });
    ['ar','maoPropria'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', updateSummary);
    });

    bindSegmented($('tipoObjetoSeg'));
    $('btnOrigemDefault').addEventListener('click', aplicarOrigemDefault);
    $('btnBuscarOrigem').addEventListener('click', () => buscarCep('origem'));
    $('btnBuscarDestino').addEventListener('click', () => buscarCep('destino'));
    $('cepOrigem').addEventListener('input', () => autoCep('origem'));
    $('cepDestino').addEventListener('input', () => autoCep('destino'));
    $('formCotacao').addEventListener('submit', cotar);
    $('btnLimpar').addEventListener('click', limparCotacao);
    $('btnBuscarRemCep').addEventListener('click', () => buscarCepPessoa('rem'));
    $('btnBuscarDestCep').addEventListener('click', () => buscarCepPessoa('dest'));
    $('btnSalvarRascunho').addEventListener('click', salvarRascunho);
    $('btnImprimirFicha').addEventListener('click', imprimirFicha);
  }

  function autoCep(tipo) {
    const id = tipo === 'origem' ? 'cepOrigem' : 'cepDestino';
    const el = $(id);
    const d = digits(el.value);
    clearTimeout(el._t);
    if (d.length === 8) {
      el._t = setTimeout(() => buscarCep(tipo, true), 450);
    }
  }

  function limparCotacao() {
    ['cepDestino','pesoG','alturaCm','larguraCm','comprimentoCm','diametroCm','valorDeclarado'].forEach(id => { if ($(id)) $(id).value = ''; });
    $('ar').checked = false;
    $('maoPropria').checked = false;
    state.destino = null;
    state.cotacao = null;
    state.selecionada = null;
    $('destinoHint').textContent = 'Digite o CEP para carregar cidade e UF.';
    $('destinoHint').className = 'field-hint';
    renderResults(null);
    $('etiquetaSection').classList.add('hidden');
    updateSummary();
  }

  async function init() {
    document.title = BALCAO_CONFIG.APP_NAME;
    $('versionText').textContent = 'v' + BALCAO_CONFIG.VERSION;
    bindEvents();
    syncTipoObjeto();
    renderResults(null);
    await loadConfig();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', BalcaoPage.init);
