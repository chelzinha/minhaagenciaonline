/* =====================================================
   APP ETIQUETAS — Screen: Nova Etiqueta (v2.2.0)
   =====================================================
   Fluxo em 2 etapas:

   ETAPA 1 — Cotação
     Usuário informa CEP destino + tipo + peso + dimensões,
     clica "Cotar". Frontend busca o CEP (ViaCEP→Correios)
     e em paralelo chama Api.cotarTodos() que devolve
     PAC e SEDEX com preço e prazo. Cards de cotação
     aparecem no lugar. Usuário clica em um → etapa 2.

   ETAPA 2 — Dados da etiqueta
     Mostra o resumo do serviço escolhido + form completo
     do destinatário + opcionais + documento da remessa.
     Sem NF, o app segue pelo fluxo de DC-e.
     Com NF, a nota entra como complemento da pré-postagem.

   Botão "Trocar" na etapa 2 volta pra etapa 1 preservando
   os dados já informados.

   Estado local (módulo — não persiste entre navegações):
     _state = {
       cotacao: { opcoes, ... } | null,
       escolha: { servico, codigoServico, preco, prazoDias } | null,
       cepBuscado: { cep, logradouro, bairro, cidade, uf } | null,
       autocompleteItems: [],
       autocompleteIdx: -1
     }
   ===================================================== */

Screens.nova = (function () {

  const $ = id => document.getElementById(id);

  let _state = {
    cotacao: null,
    escolha: null,
    cepBuscado: null,
    autocompleteItems: [],
    autocompleteIdx: -1
  };

  let _idemKey = '';

  // ============================================================
  // ESTADO DO FORM
  // ============================================================
  function resetState() {
    _state = {
      cotacao: null,
      escolha: null,
      cepBuscado: null,
      autocompleteItems: [],
      autocompleteIdx: -1
    };
    // Idempotência: nova chave a cada montagem/limpeza do formulário.
    _idemKey = 'REQ_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function getCurrentClient() {
    return Api.getCachedClient() || {};
  }

  function getTipoDocSelecionado() {
    const el = document.querySelector('input[name="tipoDocumento"]:checked');
    return (el && el.value ? el.value : 'DC').toUpperCase();
  }

  function syncTipoDocumentoUI() {
    const cardTipo = $('cardTipoDocumento');
    const cardNF = $('cardNF');
    const cardNfeImport = $('cardNfeImport');
    const cardDC = $('cardDC');

    if (cardTipo) cardTipo.hidden = false;
    if (cardDC) cardDC.hidden = false;

    const tipoDoc = getTipoDocSelecionado();
    if (cardNF) cardNF.hidden = (tipoDoc !== 'NF');
    if (cardNfeImport) cardNfeImport.hidden = false;

    const lista = $('dcLista');
    if (lista && lista.children.length === 0) {
      addItemDC();
    }
  }

  function getTipoObjetoSelecionado() {
    const el = document.querySelector('input[name="tipoObjeto"]:checked');
    return ((el && el.value) || 'CAIXA').toUpperCase();
  }

  function formatPrazoDias(dias) {
    const n = Number(dias || 0);
    return n + ' ' + (n === 1 ? 'dia útil' : 'dias úteis');
  }

  function formatDimensoesResumo(tipo) {
    const comprimento = Number($('comprimentoCm') && $('comprimentoCm').value || 0);
    const largura = Number($('larguraCm') && $('larguraCm').value || 0);
    const altura = Number($('alturaCm') && $('alturaCm').value || 0);
    const diametro = Number($('diametroCm') && $('diametroCm').value || 0);
    if (tipo === 'ROLO' || tipo === 'CILINDRO') {
      return 'Comprimento ' + comprimento + ' × diâmetro ' + diametro + ' cm';
    }
    if (tipo === 'ENVELOPE') {
      return 'Medidas ' + largura + ' × ' + comprimento + ' cm';
    }
    return 'Medidas ' + altura + ' × ' + largura + ' × ' + comprimento + ' cm';
  }

  function moneyToNumber_(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    const txt = String(value).trim();
    if (!txt) return 0;
    const normalized = txt
      .replace(/R\$|\s/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const n = Number(normalized);
    return isFinite(n) ? n : 0;
  }

  function getValorDeclaradoAtual_() {
    const el = $('valorDeclarado');
    return el ? UI.parseMoneyInput(el.value || 0) : 0;
  }

  function hasArSelecionado_() {
    return ((document.querySelector('input[name="ar"]:checked') || {}).value || 'NAO') === 'SIM';
  }

  function hasMaoPropriaSelecionada_() {
    return ((document.querySelector('input[name="maoPropria"]:checked') || {}).value || 'NAO') === 'SIM';
  }

  function renderResumoCotacao(opcaoSelecionada) {
    const el = $('cotacaoMiniResumo');
    if (!el) return;

    const cep = UI.fmtCep(UI.digitsOnly(($('destCep') && $('destCep').value) || ''));
    const cidade = _state.cepBuscado && _state.cepBuscado.cidade ? _state.cepBuscado.cidade : '';
    const uf = _state.cepBuscado && _state.cepBuscado.uf ? _state.cepBuscado.uf : '';
    const tipo = getTipoObjetoSelecionado();
    const peso = Number(($('pesoG') && $('pesoG').value) || 0);
    const valorDeclarado = getValorDeclaradoAtual_();

    const linhas = [];
    linhas.push(['CEP de destino: ' + cep, UI.joinNonEmpty([cidade, uf], ' - ')].filter(Boolean).join(' • '));
    linhas.push('Peso ' + peso + ' g • ' + formatDimensoesResumo(tipo));

    if (valorDeclarado > 0) {
      linhas.push('Valor Declarado: ' + UI.fmtMoney(valorDeclarado));
    }

    if (opcaoSelecionada && opcaoSelecionada.ok) {
      const valorTotal = moneyToNumber_(opcaoSelecionada.preco);
      const valorServico = moneyToNumber_(opcaoSelecionada.precoBase) || valorTotal;
      const valorAdicional = Math.max(0, valorTotal - valorServico);
      const adicionalLabel = (valorDeclarado > 0 && !hasArSelecionado_() && !hasMaoPropriaSelecionada_()) ? 'VD' : 'Adicionais';

      linhas.push(
        'Valor do Serviço: ' + UI.fmtMoney(valorServico) +
        ' • ' + adicionalLabel + ': ' + UI.fmtMoney(valorAdicional) +
        ' • Valor Total: ' + UI.fmtMoney(valorTotal)
      );
    }

    el.innerHTML = linhas.map(l => '<div>' + UI.escapeHtml(l) + '</div>').join('');
    el.hidden = false;
  }

  function applyTipoObjetoUI(tipo) {
    const comprimentoField = $('comprimentoField');
    const larguraField = $('larguraField');
    const alturaField = $('alturaField');
    const diametroField = $('diametroField');
    const hint = $('dimensoesHint');

    const isRolo = (tipo === 'ROLO' || tipo === 'CILINDRO');
    const isEnvelope = (tipo === 'ENVELOPE');

    if (comprimentoField) comprimentoField.hidden = false;
    if (larguraField) larguraField.hidden = isRolo;
    if (alturaField) alturaField.hidden = (isRolo || isEnvelope);
    if (diametroField) diametroField.hidden = !isRolo;

    if (hint) {
      hint.textContent = isRolo
        ? 'Rolo: comprimento e diâmetro.'
        : (isEnvelope
          ? 'Envelope: comprimento e largura.'
          : 'Caixa/Pacote: altura, largura e comprimento.');
    }

    if (isRolo) {
      if ($('larguraCm')) $('larguraCm').value = '';
      if ($('alturaCm')) $('alturaCm').value = '';
    } else if (isEnvelope) {
      if ($('alturaCm')) $('alturaCm').value = '';
      if ($('diametroCm')) $('diametroCm').value = '';
    } else {
      if ($('diametroCm')) $('diametroCm').value = '';
    }

    if (_state.cotacao) renderResumoCotacao();
  }

  // ============================================================
  // ETAPA 1 — BUSCAR CEP
  // ============================================================
  async function buscarCep(opts) {
    opts = opts || {};
    const cepEl = $('destCep');
    const cep = UI.digitsOnly(cepEl.value);
    if (cep.length !== 8) {
      if (!opts.silent) UI.toast('CEP precisa ter 8 dígitos', 'error');
      return null;
    }
    const btn = $('btnBuscarCep');
    if (btn) btn.disabled = true;
    if (!opts.silent) UI.showLoading('Buscando CEP...');

    try {
      const data = await Api.cep(cep);

      // Preenche os campos (podem estar escondidos na etapa 2 — tudo bem)
      const setIfEl = (id, val) => {
        const el = $(id);
        if (el) el.value = val || '';
      };
      setIfEl('destEndereco', data.logradouro);
      setIfEl('destBairro',   data.bairro);
      setIfEl('destCidade',   data.cidade);
      setIfEl('destUf',       (data.uf || '').toUpperCase());

      _state.cepBuscado = data;

      // Detecta resposta sem dados (CEP existe mas veio vazio)
      const temLogradouro = data.logradouro && data.logradouro.trim();
      const temCidade = data.cidade && data.cidade.trim();
      const hint = $('cepHint');
      if (hint) {
        hint.hidden = false;
        if (temLogradouro) {
          hint.textContent = '✓ ' + data.logradouro + ', ' + (data.bairro || '') + ' — ' + (data.cidade || '') + '/' + (data.uf || '');
          hint.classList.remove('is-error');
        } else if (temCidade) {
          hint.textContent = 'Atenção: CEP válido mas sem logradouro — ' + data.cidade + '/' + data.uf + '. Preencha manualmente na etapa 2.';
          hint.classList.add('is-error');
        } else {
          hint.textContent = 'Atenção: CEP encontrado mas sem dados de endereço. Preencha manualmente na etapa 2.';
          hint.classList.add('is-error');
        }
      }

      if (!opts.silent) UI.toast('CEP encontrado (' + (data.fonte || '—') + ')', 'success');
      return data;

    } catch (e) {
      if (!opts.silent) UI.toastError(e);
      const hint = $('cepHint');
      if (hint) {
        hint.hidden = false;
        hint.classList.add('is-error');
        hint.textContent = 'CEP não encontrado. Preencha manualmente na etapa 2.';
      }
      return null;
    } finally {
      if (!opts.silent) UI.hideLoading();
      if (btn) btn.disabled = false;
    }
  }

  // ============================================================
  // ETAPA 1 — VALIDAÇÃO LOCAL ANTES DE COTAR
  // ============================================================
  function validarEtapa1() {
    const erros = [];
    const cep = UI.digitsOnly($('destCep').value);
    if (cep.length !== 8) erros.push('CEP de destino (8 dígitos)');

    const tipo = getTipoObjetoSelecionado();
    const peso = Number($('pesoG').value);
    if (!peso || peso < 1) erros.push('Peso (em gramas)');

    if (tipo === 'CAIXA' || tipo === 'PACOTE') {
      const c = Number($('comprimentoCm').value);
      const l = Number($('larguraCm').value);
      const a = Number($('alturaCm').value);
      if (!c || !l || !a) erros.push('Dimensões (comprimento, largura, altura)');
    }
    if (tipo === 'ROLO' || tipo === 'CILINDRO') {
      const d = Number($('diametroCm').value);
      const c = Number($('comprimentoCm').value);
      if (!d || !c) erros.push('Diâmetro e comprimento');
    }
    return erros;
  }

  // ============================================================
  // ETAPA 1 — COTAR (busca CEP + cotarTodos em paralelo)
  // ============================================================
  async function cotar() {
    const erros = validarEtapa1();
    if (erros.length) {
      UI.toast('Preencha: ' + erros.join(', '), 'error');
      return;
    }

    const cep = UI.digitsOnly($('destCep').value);
    const tipo = getTipoObjetoSelecionado();
    const payload = {
      destinatarioCep: cep,
      tipoObjeto: tipo,
      pesoG: Number($('pesoG').value),
      comprimentoCm: Number($('comprimentoCm').value || 0),
      larguraCm: Number($('larguraCm').value || 0),
      alturaCm: Number($('alturaCm').value || 0),
      diametroCm: Number($('diametroCm').value || 0),
      valorDeclarado: UI.parseMoneyInput(($('valorDeclarado') && $('valorDeclarado').value) || 0),
      ar: (document.querySelector('input[name="ar"]:checked') || {}).value || 'NAO',
      maoPropria: (document.querySelector('input[name="maoPropria"]:checked') || {}).value || 'NAO'
    };

    UI.showLoading('Cotando preço e prazo...');
    try {
      // Busca CEP em paralelo com a cotação (se ainda não foi buscado)
      const promiseCep = (!_state.cepBuscado || _state.cepBuscado.cep !== cep)
        ? buscarCep({ silent: true })
        : Promise.resolve(_state.cepBuscado);

      const [_, cotacao] = await Promise.all([
        promiseCep,
        Api.cotarTodos(payload)
      ]);

      _state.cotacao = cotacao;
      renderOpcoesCotacao(cotacao);
      renderResumoCotacao();

      if (cotacao.totalOk === 0) {
        UI.toast('Nenhum serviço disponível — veja os detalhes nos cards', 'error');
      } else {
        // Rola até o card de cotação
        const card = $('cotacaoCard');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {
      UI.toastError(e);
    } finally {
      UI.hideLoading();
    }
  }

  // ============================================================
  // ETAPA 1 — RENDER DAS OPÇÕES DE COTAÇÃO
  // ============================================================
  function renderOpcoesCotacao(cotacao) {
    const card = $('cotacaoCard');
    const wrap = $('opcoesCotacao');
    if (!card || !wrap) return;

    card.hidden = false;

    const iconByServico = {
      'PAC':    'inventory_2',
      'SEDEX':  'bolt',
      'SEDEX10':'bolt',
      'SEDEX12':'bolt'
    };

    const html = (cotacao.opcoes || []).map((op, idx) => {
      if (!op.ok) {
        return '<div class="opcao-card disabled">' +
          '<div class="opcao-header">' +
          '<span class="material-symbols-rounded">cancel</span>' +
          '<span class="opcao-servico">' + UI.escapeHtml(op.servico) + '</span>' +
          '</div>' +
          '<div class="opcao-erro">' + UI.escapeHtml(op.erro || 'Indisponível') + '</div>' +
          '</div>';
      }
      const precoNum = Number(String(op.preco).replace(',', '.')) || 0;
      const precoFmt = UI.fmtMoney(precoNum);
      const prazoFmt = formatPrazoDias(op.prazoDias);
      const icon = iconByServico[(op.servico || '').toUpperCase()] || 'local_shipping';

      return '<button type="button" class="opcao-card" data-idx="' + idx + '">' +
        '<div class="opcao-header">' +
        '<span class="material-symbols-rounded">' + icon + '</span>' +
        '<span class="opcao-servico">' + UI.escapeHtml(op.servico) + '</span>' +
        '</div>' +
        '<div class="opcao-preco">' + precoFmt + '</div>' +
        '<div class="opcao-prazo">' + prazoFmt + '</div>' +
        '<div class="opcao-escolher">Escolher</div>' +
        '</button>';
    }).join('');

    wrap.innerHTML = html || '<div class="hist-empty">Nenhuma opção disponível</div>';

    // Bind nos cards clicáveis
    wrap.querySelectorAll('.opcao-card:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        escolherOpcao(idx);
      });
    });
  }

  // ============================================================
  // ETAPA 1 → 2 — ESCOLHER UMA COTAÇÃO
  // ============================================================
  function escolherOpcao(idx) {
    if (!_state.cotacao) return;
    const op = _state.cotacao.opcoes[idx];
    if (!op || !op.ok) return;

    _state.escolha = op;

    // Destaque visual da opção escolhida
    document.querySelectorAll('#opcoesCotacao .opcao-card').forEach((c, i) => {
      c.classList.toggle('is-selected', i === idx);
    });

    // Monta o resumo na etapa 2
    const precoNum = Number(String(op.preco).replace(',', '.')) || 0;
    const resumoEl = $('escolhaValor');
    if (resumoEl) {
      resumoEl.textContent = op.servico + ' — ' + UI.fmtMoney(precoNum) +
        ' • ' + formatPrazoDias(op.prazoDias);
    }

    renderResumoCotacao(op);

    // Revela etapa 2
    const etapa2 = $('etapa2Wrap');
    if (etapa2) {
      etapa2.hidden = false;

      syncTipoDocumentoUI();

      // Esconde o botão "Cotar" da etapa 1 (já cotou)
      const stickyE1 = $('stickyEtapa1');
      if (stickyE1) stickyE1.hidden = true;

      // Rola até a etapa 2
      setTimeout(() => {
        etapa2.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  // ============================================================
  // ETAPA 2 → 1 — TROCAR COTAÇÃO
  // ============================================================
  function trocarCotacao() {
    _state.escolha = null;
    const etapa2 = $('etapa2Wrap');
    if (etapa2) etapa2.hidden = true;

    const stickyE1 = $('stickyEtapa1');
    if (stickyE1) stickyE1.hidden = false;

    // Remove destaque visual das opções
    document.querySelectorAll('#opcoesCotacao .opcao-card').forEach(c => {
      c.classList.remove('is-selected');
    });

    const card = $('cotacaoCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ============================================================
  // DC — REPEATER DE ITENS
  // ============================================================
  function addItemDC() {
    const tpl = document.getElementById('tpl-item-dc');
    const lista = $('dcLista');
    if (!tpl || !lista) return;

    const node = tpl.content.cloneNode(true);
    const item = node.querySelector('.dc-item');
    lista.appendChild(node);

    // Bind do botão remover deste item
    const btnRemove = item.querySelector('.dc-remove');
    if (btnRemove) {
      btnRemove.addEventListener('click', () => {
        if (lista.children.length > 1) {
          item.remove();
          recalcTotalDC();
        } else {
          UI.toast('Precisa ter pelo menos 1 item', 'error');
        }
      });
    }

    // Bind recalcula total quando qualquer campo muda
    item.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', recalcTotalDC);
    });

    recalcTotalDC();
  }

  function recalcTotalDC() {
    const lista = $('dcLista');
    if (!lista) return;
    let total = 0;
    lista.querySelectorAll('.dc-item').forEach(item => {
      const qtd = Number(item.querySelector('.dc-qtd').value) || 0;
      const val = Number(item.querySelector('.dc-valor').value) || 0;
      total += qtd * val;
    });
    const el = $('dcTotal');
    if (el) el.textContent = UI.fmtMoney(total);
  }

  function coletarItensDC() {
    const lista = $('dcLista');
    const out = [];
    if (!lista) return out;
    lista.querySelectorAll('.dc-item').forEach(item => {
      out.push({
        descricao: item.querySelector('.dc-desc').value.trim(),
        quantidade: Number(item.querySelector('.dc-qtd').value) || 1,
        valor: Number(item.querySelector('.dc-valor').value) || 0
      });
    });
    return out;
  }

  // ============================================================
  // AUTOCOMPLETE DE DESTINATÁRIOS
  // ============================================================
  function hideAutocomplete() {
    const ul = $('destAutocomplete');
    if (ul) {
      ul.hidden = true;
      ul.innerHTML = '';
    }
    _state.autocompleteItems = [];
    _state.autocompleteIdx = -1;
  }

  function renderAutocomplete(items) {
    const ul = $('destAutocomplete');
    if (!ul) return;
    if (!items || items.length === 0) {
      ul.innerHTML = '<div class="autocomplete-empty">Nenhum destinatário encontrado</div>';
      ul.hidden = false;
      return;
    }
    ul.innerHTML = items.map((it, idx) =>
      '<div class="autocomplete-item" data-idx="' + idx + '">' +
        '<div class="autocomplete-item-nome">' + UI.escapeHtml(it.nome) + '</div>' +
        '<div class="autocomplete-item-sub">' +
          UI.escapeHtml(UI.joinNonEmpty([it.cidade, it.uf], '/')) +
          (it.cep ? ' • CEP ' + UI.fmtCep(it.cep) : '') +
          (it.totalUsos ? ' • usado ' + it.totalUsos + 'x' : '') +
        '</div>' +
      '</div>'
    ).join('');
    ul.hidden = false;
    ul.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-idx'));
        selecionarDestinatario(_state.autocompleteItems[idx]);
      });
    });
    _state.autocompleteItems = items;
  }

  function selecionarDestinatario(it) {
    if (!it) return;
    $('destNome').value        = it.nome || '';
    $('destCpfCnpj').value     = it.cpfCnpj ? UI.fmtCpfCnpj(it.cpfCnpj) : '';
    $('destCelular').value     = it.celular ? UI.fmtPhone(it.celular) : '';
    $('destEmail').value       = it.email || '';
    $('destCep').value         = it.cep ? UI.fmtCep(it.cep) : '';
    $('destEndereco').value    = it.logradouro || '';
    $('destNumero').value      = it.numero || '';
    $('destComplemento').value = it.complemento || '';
    $('destBairro').value      = it.bairro || '';
    $('destCidade').value      = it.cidade || '';
    $('destUf').value          = (it.uf || '').toUpperCase();
    hideAutocomplete();
    UI.toast('Destinatário carregado', 'success');
  }

  let _autoTimer = null;
  async function onNomeInput() {
    const q = $('destNome').value.trim();
    if (_autoTimer) clearTimeout(_autoTimer);
    if (q.length < APP_CONFIG.AUTOCOMPLETE_MIN_CHARS) {
      hideAutocomplete();
      return;
    }
    _autoTimer = setTimeout(async () => {
      try {
        const data = await Api.buscarDestinatarios(q, 8);
        renderAutocomplete(data.items || []);
      } catch (e) { /* ignora erro de autocomplete */ }
    }, APP_CONFIG.AUTOCOMPLETE_DEBOUNCE_MS);
  }

  // ============================================================
  // SUBMIT — GERAR ETIQUETA
  // ============================================================
  async function submit(ev) {
    ev.preventDefault();

    if (!_state.escolha) {
      UI.toast('Primeiro cote e escolha um serviço', 'error');
      return;
    }

    // Validação local etapa 2
    const req = ['destNome','destCep','destEndereco','destNumero','destBairro','destCidade','destUf'];
    const faltando = req.filter(id => !$(id).value.trim()).map(id => ({
      destNome: 'Nome', destCep: 'CEP', destEndereco: 'Logradouro',
      destNumero: 'Número', destBairro: 'Bairro', destCidade: 'Cidade', destUf: 'UF'
    })[id]);
    if (faltando.length) {
      UI.toast('Preencha: ' + faltando.join(', '), 'error');
      return;
    }

    const tipoDoc = getTipoDocSelecionado();
    const escolha = _state.escolha;
    const formato = (document.querySelector('input[name="formatoEtiqueta"]:checked') || {}).value || 'ET';

    // Monta payload base
    const payload = {
      servico:                  escolha.servico,
      codigoServico:            escolha.codigoServico,
      precoCotado:              escolha.preco,
      prazoDias:                escolha.prazoDias,
      tipoObjeto:               getTipoObjetoSelecionado(),
      pesoG:                    Number($('pesoG').value),
      comprimentoCm:            Number($('comprimentoCm').value || 0),
      larguraCm:                Number($('larguraCm').value || 0),
      alturaCm:                 Number($('alturaCm').value || 0),
      diametroCm:               Number($('diametroCm').value || 0),
      valorDeclarado:           UI.parseMoneyInput($('valorDeclarado').value || 0),
      ar:                       (document.querySelector('input[name="ar"]:checked') || {}).value || 'NAO',
      maoPropria:               (document.querySelector('input[name="maoPropria"]:checked') || {}).value || 'NAO',
      formatoRotulo:            formato,
      tipoDocumento:            tipoDoc,
      objetosProibidos:         ($('objetoNaoProibido') && $('objetoNaoProibido').checked) ? 'NAO' : 'SIM',
      objetoNaoProibidoConfirmado: ($('objetoNaoProibido') && $('objetoNaoProibido').checked) ? 'S' : 'N',

      destinatarioNome:         $('destNome').value.trim(),
      destinatarioCpfCnpj:      UI.digitsOnly($('destCpfCnpj').value),
      destinatarioCelular:      UI.digitsOnly($('destCelular').value),
      destinatarioEmail:        $('destEmail').value.trim(),
      destinatarioCep:          UI.digitsOnly($('destCep').value),
      destinatarioEndereco:     $('destEndereco').value.trim(),
      destinatarioNumero:       $('destNumero').value.trim(),
      destinatarioComplemento:  $('destComplemento').value.trim(),
      destinatarioBairro:       $('destBairro').value.trim(),
      destinatarioCidade:       $('destCidade').value.trim(),
      destinatarioUf:           $('destUf').value.trim().toUpperCase(),
      idRequisicao:             _idemKey
    };

    if (payload.objetosProibidos !== 'NAO') {
      UI.toast('Marque a confirmação de que o envio não contém objeto proibido.', 'error');
      return;
    }

    // Declaração de conteúdo permanece sempre no fluxo
    const itens = coletarItensDC();
    const errosDc = [];
    if (itens.length === 0) errosDc.push('Adicione ao menos 1 item');
    itens.forEach((it, i) => {
      if (!it.descricao) errosDc.push('Item ' + (i+1) + ': descrição obrigatória');
      if (it.descricao && it.descricao.length < 5) errosDc.push('Item ' + (i+1) + ': descrição com mínimo de 5 caracteres');
      if (it.valor <= 0) errosDc.push('Item ' + (i+1) + ': valor > 0');
      if (it.quantidade < 1) errosDc.push('Item ' + (i+1) + ': quantidade ≥ 1');
    });
    if (errosDc.length) {
      UI.toast('Declaração de Conteúdo: ' + errosDc.join(' | '), 'error');
      return;
    }
    payload.itensDeclaracao = itens;

    if (tipoDoc === 'NF') {
      const nfNum = $('nfNumero').value.trim();
      const nfSer = $('nfSerie').value.trim();
      const nfVal = UI.parseDecimalMoneyInput($('nfValor').value || 0);
      if (!nfNum || !nfSer || nfVal <= 0) {
        UI.toast('Preencha Nota Fiscal: número, série e valor', 'error');
        return;
      }
      const nfChave = UI.digitsOnly(($('nfChave') && $('nfChave').value) || '');
      if (nfChave && nfChave.length !== 44) {
        UI.toast('Chave NF-e deve ter 44 dígitos', 'error');
        return;
      }
      payload.numeroNotaFiscal = nfNum;
      payload.serieNotaFiscal = nfSer;
      payload.valorNotaFiscal = nfVal;
      payload.chaveNFe = nfChave;
    }

    UI.showLoading('Gerando etiqueta... (pode levar até 15s)');
    try {
      const result = await Api.criarEtiqueta(payload);
      UI.hideLoading();

      // Aviso se a DC falhou (raro)
      if (result.declaracaoErro) {
        UI.toast('Rótulo OK mas o documento da remessa falhou: ' + result.declaracaoErro, 'error');
      } else {
        UI.toast('Etiqueta gerada com sucesso!', 'success');
      }

      Router.setSuccessData(result);
      _idemKey = 'REQ_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      Router.navigate('/sucesso');
    } catch (e) {
      UI.hideLoading();
      UI.toastError(e);
    }
  }

  // ============================================================
  // MOUNT
  // ============================================================
  function mount() {
    resetState();

    // Bind máscaras
    UI.bindMask($('destCep'), UI.fmtCep);
    UI.bindMask($('destCpfCnpj'), UI.fmtCpfCnpj);
    UI.bindMask($('destCelular'), UI.fmtPhone);
    UI.bindMask($('valorDeclarado'), UI.fmtMoneyInput);
    const vdEl = $('valorDeclarado');
    if (vdEl) vdEl.addEventListener('blur', () => { vdEl.value = UI.fmtMoneyInput(vdEl.value); });
    const nfValorEl = $('nfValor');
    if (nfValorEl) nfValorEl.addEventListener('blur', () => { nfValorEl.value = UI.fmtDecimalMoneyInput(nfValorEl.value); });

    // Bind segmented controls (marca is-selected)
    UI.bindSegmented(document.getElementById('formNova'));

    // Tipo do objeto — ajusta dimensões dinamicamente
    document.querySelectorAll('input[name="tipoObjeto"]').forEach(r => {
      r.addEventListener('change', () => applyTipoObjetoUI(r.value));
    });
    applyTipoObjetoUI(getTipoObjetoSelecionado());

    // Botão buscar CEP
    const btnCep = $('btnBuscarCep');
    if (btnCep) btnCep.addEventListener('click', () => buscarCep());

    // Auto busca CEP quando preencher 8 dígitos (opcional mas bom UX)
    const cepEl = $('destCep');
    if (cepEl) {
      cepEl.addEventListener('input', () => {
        const d = UI.digitsOnly(cepEl.value);
        if (d.length === 8) {
          // Debounce de 300ms pra não buscar a cada tecla
          clearTimeout(cepEl._autoTimer);
          cepEl._autoTimer = setTimeout(() => buscarCep({ silent: true }), 300);
        }
      });
    }

    // Botão cotar
    const btnCotar = $('btnCotar');
    if (btnCotar) btnCotar.addEventListener('click', cotar);

    // Botão recotar (dentro do card de cotação)
    const btnRecotar = $('btnRecotar');
    if (btnRecotar) btnRecotar.addEventListener('click', () => {
      _state.cotacao = null;
      _state.escolha = null;
      const card = $('cotacaoCard');
      if (card) card.hidden = true;
      const mini = $('cotacaoMiniResumo');
      if (mini) mini.hidden = true;
      const etapa2 = $('etapa2Wrap');
      if (etapa2) etapa2.hidden = true;
      const stickyE1 = $('stickyEtapa1');
      if (stickyE1) stickyE1.hidden = false;
      cotar();
    });

    // Botão trocar cotação (na etapa 2)
    const btnTrocar = $('btnTrocarCotacao');
    if (btnTrocar) btnTrocar.addEventListener('click', trocarCotacao);

    // Botão + Adicionar item DC
    const btnAddDC = $('btnAddItemDC');
    if (btnAddDC) btnAddDC.addEventListener('click', addItemDC);

    document.querySelectorAll('input[name="tipoDocumento"]').forEach(r => {
      r.addEventListener('change', syncTipoDocumentoUI);
    });

    syncTipoDocumentoUI();

    if (window.NfeImport && NfeImport.attachAppNova) NfeImport.attachAppNova();

    // Autocomplete destinatário
    const nomeEl = $('destNome');
    if (nomeEl) {
      nomeEl.addEventListener('input', onNomeInput);
      nomeEl.addEventListener('blur', () => setTimeout(hideAutocomplete, 180));
    }

    // Submit
    const form = document.getElementById('formNova');
    if (form) form.addEventListener('submit', submit);

    // Atualiza hero com dados do cliente
    App.renderHero();
  }

  return { mount };
})();
