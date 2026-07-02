
/* =====================================================
   APP ETIQUETAS - Screen: etiqueta (fluxo direto)
   ===================================================== */

Screens.etiqueta = (function () {
  const $ = id => document.getElementById(id);

  let _state = {
    servico: null,
    tipoObjeto: 'PACOTE',
    autocompleteItems: []
  };

  function getCurrentClient() {
    return Api.getCachedClient() || {};
  }

  function getTipoDocSelecionado() {
    const el = document.querySelector('input[name="etqTipoDocumento"]:checked');
    return (el && el.value ? el.value : 'DC').toUpperCase();
  }

  function syncTipoDocumentoUI() {
    const tipoDoc = getTipoDocSelecionado();
    const cardNF = $('etqCardNF');
    const cardNfeImport = $('etqCardNfeImport');
    const lista = $('etqDcLista');
    if (cardNF) cardNF.hidden = (tipoDoc !== 'NF');
    if (cardNfeImport) cardNfeImport.hidden = false;
    if (lista && lista.children.length === 0) addItemDC();
  }

  function renderHero() {
    const client = getCurrentClient();
    if (!client) return;
    $('heroNomeEtq').textContent = client.NOME_REMETENTE || client.LOGIN_APP || '—';
    $('heroContratoEtq').textContent = client.NUM_CONTRATO ? ('Contrato ' + client.NUM_CONTRATO) : '—';
    $('heroCartaoEtq').textContent = client.CARTAO_POSTAGEM ? ('Cartão ' + client.CARTAO_POSTAGEM) : '—';
  }

  function getServicosDisponiveis() {
    const c = getCurrentClient();
    const out = [];
    if (String(c.COD_SERVICO_PAC || '').trim()) out.push({ servico: 'PAC', codigo: c.COD_SERVICO_PAC, sub: 'Disponível no cartão' });
    if (String(c.COD_SERVICO_SEDEX || '').trim()) out.push({ servico: 'SEDEX', codigo: c.COD_SERVICO_SEDEX, sub: 'Disponível no cartão' });
    return out;
  }

  function renderServicos() {
    const wrap = $('etqServicoSeg');
    if (!wrap) return;
    const items = getServicosDisponiveis();
    if (!items.length) {
      wrap.innerHTML = '<div class="hist-empty">Nenhum serviço habilitado para este cliente.</div>';
      _state.servico = null;
      return;
    }

    const iconByServico = {
      PAC: 'local_shipping',
      SEDEX: 'bolt'
    };

    wrap.innerHTML = items.map((item, idx) => (
      '<label class="seg-item' + (idx === 0 ? ' is-selected' : '') + '">' +
        '<input type="radio" name="etqServico" value="' + item.servico + '" ' + (idx === 0 ? 'checked' : '') + '>' +
        '<span class="material-symbols-rounded">' + (iconByServico[item.servico] || 'local_shipping') + '</span>' +
        '<span class="seg-title">' + item.servico + '</span>' +
        '<span class="seg-sub">' + item.sub + '</span>' +
      '</label>'
    )).join('');

    _state.servico = items[0].servico;
    updateServicoResumo();
    UI.bindSegmented(wrap);
    wrap.querySelectorAll('input[name="etqServico"]').forEach(r => {
      r.addEventListener('change', function () {
        _state.servico = this.value;
        updateServicoResumo();
      });
    });
  }

  function updateServicoResumo() {
    const resumo = $('etqServicoResumo');
    if (!resumo) return;
    resumo.textContent = _state.servico ? (_state.servico + ' - geração direta') : 'Selecione um serviço';
  }


  function renderTipoObjeto() {
    const wrap = $('etqTipoObjetoSeg');
    if (!wrap) return;
    _state.tipoObjeto = (document.querySelector('input[name="etqTipoObjeto"]:checked') || {}).value || 'PACOTE';
    UI.bindSegmented(wrap);
    wrap.querySelectorAll('input[name="etqTipoObjeto"]').forEach(r => {
      r.addEventListener('change', function () {
        _state.tipoObjeto = this.value || 'PACOTE';
      });
    });
  }

  async function buscarCep(opts) {
    opts = opts || {};
    const cep = UI.digitsOnly(($('etqDestCep').value || ''));
    if (cep.length !== 8) {
      if (!opts.silent) UI.toast('CEP precisa ter 8 dígitos', 'error');
      return null;
    }
    const btn = $('etqBtnBuscarCep');
    if (btn) btn.disabled = true;
    if (!opts.silent) UI.showLoading('Buscando CEP...');
    try {
      const data = await Api.cep(cep);
      $('etqDestEndereco').value = data.logradouro || '';
      $('etqDestBairro').value = data.bairro || '';
      $('etqDestCidade').value = data.cidade || '';
      $('etqDestUf').value = (data.uf || '').toUpperCase();
      const hint = $('etqCepHint');
      if (hint) {
        hint.hidden = false;
        hint.textContent = '✓ ' + [data.logradouro, data.bairro, (data.cidade || '') + '/' + (data.uf || '')].filter(Boolean).join(' — ');
        hint.classList.remove('is-error');
      }
      return data;
    } catch (e) {
      const hint = $('etqCepHint');
      if (hint) {
        hint.hidden = false;
        hint.classList.add('is-error');
        hint.textContent = 'CEP não encontrado. Preencha manualmente.';
      }
      if (!opts.silent) UI.toastError(e);
      return null;
    } finally {
      if (!opts.silent) UI.hideLoading();
      if (btn) btn.disabled = false;
    }
  }

  function addItemDC() {
    const tpl = document.getElementById('tpl-item-dc');
    const lista = $('etqDcLista');
    if (!tpl || !lista) return;
    const node = tpl.content.cloneNode(true);
    const item = node.querySelector('.dc-item');
    lista.appendChild(node);
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
    item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', recalcTotalDC));
    recalcTotalDC();
  }

  function recalcTotalDC() {
    const lista = $('etqDcLista');
    if (!lista) return;
    let total = 0;
    lista.querySelectorAll('.dc-item').forEach(item => {
      const qtd = Number(item.querySelector('.dc-qtd').value) || 0;
      const val = Number(item.querySelector('.dc-valor').value) || 0;
      total += qtd * val;
    });
    const el = $('etqDcTotal');
    if (el) el.textContent = UI.fmtMoney(total);
  }

  function coletarItensDC() {
    const lista = $('etqDcLista');
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

  function hideAutocomplete() {
    const ul = $('etqDestAutocomplete');
    if (!ul) return;
    ul.hidden = true;
    ul.innerHTML = '';
    _state.autocompleteItems = [];
  }

  function renderAutocomplete(items) {
    const ul = $('etqDestAutocomplete');
    if (!ul) return;
    if (!items || !items.length) {
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
        '</div>' +
      '</div>'
    ).join('');
    ul.hidden = false;
    ul.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('click', () => selecionarDestinatario(_state.autocompleteItems[Number(el.getAttribute('data-idx'))]));
    });
    _state.autocompleteItems = items;
  }

  function selecionarDestinatario(it) {
    if (!it) return;
    $('etqDestNome').value = it.nome || '';
    $('etqDestCpfCnpj').value = it.cpfCnpj ? UI.fmtCpfCnpj(it.cpfCnpj) : '';
    $('etqDestCelular').value = it.celular ? UI.fmtPhone(it.celular) : '';
    $('etqDestEmail').value = it.email || '';
    $('etqDestCep').value = it.cep ? UI.fmtCep(it.cep) : '';
    $('etqDestEndereco').value = it.logradouro || '';
    $('etqDestNumero').value = it.numero || '';
    $('etqDestComplemento').value = it.complemento || '';
    $('etqDestBairro').value = it.bairro || '';
    $('etqDestCidade').value = it.cidade || '';
    $('etqDestUf').value = (it.uf || '').toUpperCase();
    hideAutocomplete();
    UI.toast('Destinatário carregado', 'success');
  }

  let _autoTimer = null;
  async function onNomeInput() {
    const q = $('etqDestNome').value.trim();
    if (_autoTimer) clearTimeout(_autoTimer);
    if (q.length < APP_CONFIG.AUTOCOMPLETE_MIN_CHARS) {
      hideAutocomplete();
      return;
    }
    _autoTimer = setTimeout(async () => {
      try {
        const data = await Api.buscarDestinatarios(q, 8);
        renderAutocomplete(data.items || []);
      } catch (e) {}
    }, APP_CONFIG.AUTOCOMPLETE_DEBOUNCE_MS);
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!_state.servico) {
      UI.toast('Selecione o tipo de envio', 'error');
      return;
    }

    const req = ['etqDestNome','etqDestCep','etqDestEndereco','etqDestNumero','etqDestBairro','etqDestCidade','etqDestUf'];
    const faltando = req.filter(id => !$(id).value.trim()).map(id => ({
      etqDestNome:'Nome', etqDestCep:'CEP', etqDestEndereco:'Logradouro', etqDestNumero:'Número', etqDestBairro:'Bairro', etqDestCidade:'Cidade', etqDestUf:'UF'
    })[id]);
    if (faltando.length) {
      UI.toast('Preencha: ' + faltando.join(', '), 'error');
      return;
    }

    const payload = {
      servico: _state.servico,
      tipoObjeto: _state.tipoObjeto || 'PACOTE',
      valorDeclarado: UI.parseMoneyInput($('etqValorDeclarado').value || 0),
      ar: (document.querySelector('input[name="etqAr"]:checked') || {}).value || 'NAO',
      maoPropria: (document.querySelector('input[name="etqMaoPropria"]:checked') || {}).value || 'NAO',
      formatoRotulo: (document.querySelector('input[name="etqFormatoEtiqueta"]:checked') || {}).value || 'ET',
      formatoEtiqueta: (document.querySelector('input[name="etqFormatoEtiqueta"]:checked') || {}).value || 'ET',
      tipoDocumento: getTipoDocSelecionado(),
      objetosProibidos: ($('etqObjetoNaoProibido') && $('etqObjetoNaoProibido').checked) ? 'NAO' : 'SIM',
      objetoNaoProibidoConfirmado: ($('etqObjetoNaoProibido') && $('etqObjetoNaoProibido').checked) ? 'S' : 'N',
      destinatarioNome: $('etqDestNome').value.trim(),
      destinatarioCpfCnpj: UI.digitsOnly($('etqDestCpfCnpj').value),
      destinatarioCelular: UI.digitsOnly($('etqDestCelular').value),
      destinatarioEmail: $('etqDestEmail').value.trim(),
      destinatarioCep: UI.digitsOnly($('etqDestCep').value),
      destinatarioEndereco: $('etqDestEndereco').value.trim(),
      destinatarioNumero: $('etqDestNumero').value.trim(),
      destinatarioComplemento: $('etqDestComplemento').value.trim(),
      destinatarioBairro: $('etqDestBairro').value.trim(),
      destinatarioCidade: $('etqDestCidade').value.trim(),
      destinatarioUf: $('etqDestUf').value.trim().toUpperCase()
    };

    if (payload.objetosProibidos !== 'NAO') {
      UI.toast('Marque a confirmação de que o envio não contém objeto proibido.', 'error');
      return;
    }

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

    if (payload.tipoDocumento === 'NF') {
      const nfNum = $('etqNfNumero').value.trim();
      const nfSer = $('etqNfSerie').value.trim();
      const nfVal = UI.parseDecimalMoneyInput($('etqNfValor').value || 0);
      if (!nfNum || !nfSer || nfVal <= 0) {
        UI.toast('Preencha Nota Fiscal: número, série e valor', 'error');
        return;
      }
      const nfChave = UI.digitsOnly(($('etqNfChave') && $('etqNfChave').value) || '');
      if (nfChave && nfChave.length !== 44) {
        UI.toast('Chave NF-e deve ter 44 dígitos', 'error');
        return;
      }
      payload.numeroNotaFiscal = nfNum;
      payload.serieNotaFiscal = nfSer;
      payload.valorNotaFiscal = nfVal;
      payload.chaveNFe = nfChave;
    }

    UI.showLoading('Gerando etiqueta...');
    try {
      const result = await Api.criarEtiquetaDireta(payload);
      UI.hideLoading();
      if (result.declaracaoErro) {
        UI.toast('Rótulo OK mas o documento da remessa falhou: ' + result.declaracaoErro, 'error');
      } else {
        UI.toast('Etiqueta gerada com sucesso!', 'success');
      }
      Router.setSuccessData(result);
      Router.navigate('/sucesso');
    } catch (e) {
      UI.hideLoading();
      UI.toastError(e);
    }
  }

  function mount() {
    _state = { servico: null, tipoObjeto: 'PACOTE', autocompleteItems: [] };
    if (window.NfeImport && NfeImport.clearPreviewState) NfeImport.clearPreviewState();
    renderHero();
    renderServicos();
    renderTipoObjeto();
    UI.bindMask($('etqDestCep'), UI.fmtCep);
    UI.bindMask($('etqDestCpfCnpj'), UI.fmtCpfCnpj);
    UI.bindMask($('etqDestCelular'), UI.fmtPhone);
    UI.bindMask($('etqValorDeclarado'), UI.fmtMoneyInput);
    const vdEtq = $('etqValorDeclarado');
    if (vdEtq) vdEtq.addEventListener('blur', () => { vdEtq.value = UI.fmtMoneyInput(vdEtq.value); });
    const nfValorEtq = $('etqNfValor');
    if (nfValorEtq) nfValorEtq.addEventListener('blur', () => { nfValorEtq.value = UI.fmtDecimalMoneyInput(nfValorEtq.value); });
    UI.bindSegmented(document.getElementById('formEtiquetaDireta'));

    $('etqBtnBuscarCep').addEventListener('click', () => buscarCep());
    $('etqDestCep').addEventListener('input', () => {
      const d = UI.digitsOnly($('etqDestCep').value);
      if (d.length === 8) {
        clearTimeout($('etqDestCep')._autoTimer);
        $('etqDestCep')._autoTimer = setTimeout(() => buscarCep({ silent: true }), 300);
      }
    });
    $('etqBtnAddItemDC').addEventListener('click', addItemDC);
    $('formEtiquetaDireta').addEventListener('submit', submit);
    $('etqDestNome').addEventListener('input', onNomeInput);
    $('etqDestNome').addEventListener('blur', () => setTimeout(hideAutocomplete, 150));
    document.querySelectorAll('input[name="etqTipoDocumento"]').forEach(r => r.addEventListener('change', syncTipoDocumentoUI));

    syncTipoDocumentoUI();
    if (window.NfeImport && NfeImport.attachAppEtiqueta) NfeImport.attachAppEtiqueta();
  }

  return { mount };
})();