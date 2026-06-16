/* =====================================================
   APP ETIQUETAS — Screen: destinatarios
   Cadastro, edição, filtro por UF e CEP automático.
   ===================================================== */
Screens.destinatarios = (function () {
  const $ = id => document.getElementById(id);
  let _items = [];
  let _timer = null;

  function radioValue(name, fallback) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return (el && el.value) || fallback || '';
  }

  function setRadio(name, value, fallback) {
    const wanted = String(value || fallback || '');
    document.querySelectorAll('input[name="' + name + '"]').forEach(input => {
      input.checked = false;
      const label = input.closest('.seg-item'); if (label) label.classList.remove('is-selected');
    });
    const el = document.querySelector('input[name="' + name + '"][value="' + wanted + '"]');
    if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  function showForm(item) {
    const card = $('destCadastroCard');
    if (!card) return;
    card.hidden = false;
    $('destCadTitulo').textContent = item ? 'Editar destinatário' : 'Novo destinatário';
    $('destCadId').value = item ? (item.idDestinatario || '') : '';
    $('destCadNome').value = item ? (item.nome || '') : '';
    $('destCadCpfCnpj').value = item && item.cpfCnpj ? UI.fmtCpfCnpj(item.cpfCnpj) : '';
    $('destCadCelular').value = item && item.celular ? UI.fmtPhone(item.celular) : '';
    $('destCadEmail').value = item ? (item.email || '') : '';
    $('destCadCep').value = item && item.cep ? UI.fmtCep(item.cep) : '';
    $('destCadLogradouro').value = item ? (item.logradouro || '') : '';
    $('destCadNumero').value = item ? (item.numero || '') : '';
    $('destCadComplemento').value = item ? (item.complemento || '') : '';
    $('destCadBairro').value = item ? (item.bairro || '') : '';
    $('destCadCidade').value = item ? (item.cidade || '') : '';
    $('destCadUf').value = item ? (item.uf || '') : '';
    $('destCadEnvioNf').checked = !!(item && item.envioNf === 'SIM');
    $('destCadEnvioDc').checked = !!(item && item.envioDeclaracaoConteudo === 'SIM');
    setRadio('destCadSempreVd', item && item.sempreValorDeclarado, 'NAO');
    setRadio('destCadPagamento', item && item.formaPagamentoPreferencial, '');
    setRadio('destCadFreteConta', item && item.fretePorConta, '');
    $('destCadCepHint').hidden = true;
    try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  function hideForm() {
    const card = $('destCadastroCard');
    if (card) card.hidden = true;
  }

  async function buscarCep(opts) {
    opts = opts || {};
    const cep = UI.digitsOnly($('destCadCep').value || '');
    if (cep.length !== 8) { if (!opts.silent) UI.toast('CEP precisa ter 8 dígitos', 'error'); return null; }
    const btn = $('destCadBtnBuscarCep'); if (btn) btn.disabled = true;
    if (!opts.silent) UI.showLoading('Buscando CEP...');
    try {
      const data = await Api.cep(cep);
      $('destCadLogradouro').value = data.logradouro || '';
      $('destCadBairro').value = data.bairro || '';
      $('destCadCidade').value = data.cidade || '';
      $('destCadUf').value = (data.uf || '').toUpperCase();
      const hint = $('destCadCepHint');
      hint.hidden = false; hint.classList.remove('is-error');
      hint.textContent = '✓ ' + [data.logradouro, data.bairro, (data.cidade || '') + '/' + (data.uf || '')].filter(Boolean).join(' — ');
      return data;
    } catch (e) {
      const hint = $('destCadCepHint'); hint.hidden = false; hint.classList.add('is-error'); hint.textContent = 'CEP não encontrado. Preencha o endereço manualmente.';
      if (!opts.silent) UI.toastError(e);
      return null;
    } finally { if (!opts.silent) UI.hideLoading(); if (btn) btn.disabled = false; }
  }

  function payloadForm() {
    return {
      idDestinatario: $('destCadId').value,
      nome: $('destCadNome').value.trim(),
      cpfCnpj: UI.digitsOnly($('destCadCpfCnpj').value),
      celular: UI.digitsOnly($('destCadCelular').value),
      email: $('destCadEmail').value.trim(),
      cep: UI.digitsOnly($('destCadCep').value),
      logradouro: $('destCadLogradouro').value.trim(),
      numero: $('destCadNumero').value.trim(),
      complemento: $('destCadComplemento').value.trim(),
      bairro: $('destCadBairro').value.trim(),
      cidade: $('destCadCidade').value.trim(),
      uf: $('destCadUf').value.trim().toUpperCase(),
      envioNf: $('destCadEnvioNf').checked ? 'SIM' : 'NAO',
      envioDeclaracaoConteudo: $('destCadEnvioDc').checked ? 'SIM' : 'NAO',
      sempreValorDeclarado: radioValue('destCadSempreVd', 'NAO'),
      formaPagamentoPreferencial: radioValue('destCadPagamento', ''),
      fretePorConta: radioValue('destCadFreteConta', ''),
      origemCadastro: 'MANUAL'
    };
  }

  async function salvar(ev) {
    ev.preventDefault();
    UI.showLoading('Salvando destinatário...');
    try {
      await Api.salvarDestinatario(payloadForm());
      UI.toast('Destinatário salvo', 'success'); hideForm(); await carregar();
    } catch (e) { UI.toastError(e); }
    finally { UI.hideLoading(); }
  }

  async function excluir(item) {
    const ok = await UI.confirm({ title: 'Excluir destinatário?', body: 'O cadastro será removido da sua lista. As etiquetas já geradas continuam no histórico.', confirmText: 'Excluir', cancelText: 'Voltar', danger: true });
    if (!ok) return;
    UI.showLoading('Excluindo...');
    try { await Api.excluirDestinatario(item.idDestinatario); UI.toast('Destinatário excluído', 'success'); await carregar(); }
    catch (e) { UI.toastError(e); }
    finally { UI.hideLoading(); }
  }

  function renderUfOptions(ufs) {
    const el = $('destFiltroUf'); if (!el) return;
    const current = el.value || '';
    el.innerHTML = '<option value="">Todas as UFs</option>' + (ufs || []).map(uf => '<option value="' + UI.escapeHtml(uf) + '">' + UI.escapeHtml(uf) + '</option>').join('');
    el.value = current;
  }

  function badge(label, value) { return value ? '<span class="dest-tag">' + UI.escapeHtml(label) + '</span>' : ''; }

  function render(items) {
    const list = $('destLista'); if (!list) return;
    _items = items || [];
    if (!_items.length) { list.innerHTML = '<div class="hist-empty">Nenhum destinatário cadastrado.</div>'; return; }
    list.innerHTML = _items.map((it, idx) => {
      const endereco = UI.joinNonEmpty([it.logradouro, it.numero, it.complemento, it.bairro, UI.joinNonEmpty([it.cidade, it.uf], '/')], ' • ');
      return '<article class="dest-control-item">' +
        '<div class="dest-control-main"><div class="dest-control-name">' + UI.escapeHtml(it.nome || '—') + '</div>' +
        '<div class="dest-control-meta">' + UI.escapeHtml(UI.joinNonEmpty([it.cpfCnpj ? UI.fmtCpfCnpj(it.cpfCnpj) : '', it.celular ? UI.fmtPhone(it.celular) : '', it.email], ' • ')) + '</div>' +
        '<div class="dest-control-address">' + UI.escapeHtml(endereco) + '</div>' +
        '<div class="dest-control-tags">' + badge('NF', it.envioNf === 'SIM') + badge('DC', it.envioDeclaracaoConteudo === 'SIM') + badge('Usar VD', it.sempreValorDeclarado === 'SIM') + badge(it.formaPagamentoPreferencial, !!it.formaPagamentoPreferencial) + badge(it.fretePorConta, !!it.fretePorConta) + '</div></div>' +
        '<div class="dest-control-actions"><button type="button" class="btn btn-ghost btn-sm" data-edit="' + idx + '"><span class="material-symbols-rounded">edit</span>Editar</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-del="' + idx + '"><span class="material-symbols-rounded">delete</span>Excluir</button></div>' +
      '</article>';
    }).join('');
    list.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => showForm(_items[Number(btn.getAttribute('data-edit'))])));
    list.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => excluir(_items[Number(btn.getAttribute('data-del'))])));
  }

  async function carregar() {
    const list = $('destLista'); if (list) list.innerHTML = '<div class="hist-empty">Carregando...</div>';
    try {
      const data = await Api.listarDestinatarios({ busca: $('destBusca').value.trim(), uf: $('destFiltroUf').value || '', limit: 1000 });
      renderUfOptions(data.ufs || []); render(data.items || []);
      $('destTotal').textContent = String(data.total || 0);
    } catch (e) { UI.toastError(e); if (list) list.innerHTML = '<div class="hist-empty">Falha ao carregar destinatários.</div>'; }
  }


  function normalizeCsvHeader_(value) {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().trim()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function parseCsvLine_(line, delimiter) {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (ch === '"') {
        if (quoted && line.charAt(i + 1) === '"') { current += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        out.push(current.trim()); current = '';
      } else current += ch;
    }
    out.push(current.trim());
    return out;
  }

  function parseCsvText_(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const delimiter = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
    const headers = parseCsvLine_(lines[0], delimiter).map(normalizeCsvHeader_);
    return lines.slice(1).map((line, idx) => {
      const values = parseCsvLine_(line, delimiter);
      const row = {};
      headers.forEach((header, col) => { if (header) row[header] = values[col] == null ? '' : values[col]; });
      row.__linhaCsv = idx + 2;
      return row;
    }).filter(row => Object.keys(row).some(key => key !== '__linhaCsv' && String(row[key] || '').trim()));
  }

  async function importarCsv_(file) {
    if (!file) return;
    let rows;
    try { rows = parseCsvText_(await file.text()); }
    catch (e) { UI.toast('Não foi possível ler o CSV.', 'error'); return; }
    if (!rows.length) { UI.toast('O CSV não contém destinatários.', 'error'); return; }
    if (rows.length > 500) { UI.toast('Importe no máximo 500 destinatários por arquivo.', 'error'); return; }

    const confirmar = await UI.confirm({
      title: 'Importar destinatários?',
      body: 'O arquivo possui ' + rows.length + ' linha(s). Cadastros existentes serão atualizados quando houver CPF/CNPJ ou Nome + CEP correspondentes.',
      confirmText: 'Importar CSV',
      cancelText: 'Voltar'
    });
    if (!confirmar) return;

    UI.showLoading('Importando destinatários...');
    try {
      const result = await Api.importarDestinatariosCsv(rows);
      const resumo = (result.importados || 0) + ' importado(s): ' + (result.criados || 0) + ' novo(s) e ' + (result.atualizados || 0) + ' atualizado(s).';
      UI.toast(resumo + (result.erros && result.erros.length ? ' Algumas linhas não foram importadas; consulte o console.' : ''), result.importados ? 'success' : 'error');
      if (result.erros && result.erros.length) {
        console.warn('Linhas não importadas:', result.erros);
      }
      await carregar();
    } catch (e) { UI.toastError(e); }
    finally { UI.hideLoading(); }
  }

  function mount() {
    UI.bindMask($('destCadCep'), UI.fmtCep); UI.bindMask($('destCadCpfCnpj'), UI.fmtCpfCnpj); UI.bindMask($('destCadCelular'), UI.fmtPhone);
    UI.bindSegmented($('destCadastroForm'));
    $('destNovo').addEventListener('click', () => showForm(null));
    $('destImportarCsv').addEventListener('click', () => $('destCsvFile').click());
    $('destCsvFile').addEventListener('change', async ev => { const file = ev.target.files && ev.target.files[0]; await importarCsv_(file); ev.target.value = ''; });
    $('destCadCancelar').addEventListener('click', hideForm);
    $('destCadastroForm').addEventListener('submit', salvar);
    $('destCadBtnBuscarCep').addEventListener('click', () => buscarCep());
    $('destCadCep').addEventListener('input', () => { const d = UI.digitsOnly($('destCadCep').value); clearTimeout($('destCadCep')._t); if (d.length === 8) $('destCadCep')._t = setTimeout(() => buscarCep({ silent: true }), 300); });
    $('destFiltroUf').addEventListener('change', carregar);
    $('destBusca').addEventListener('input', () => { clearTimeout(_timer); _timer = setTimeout(carregar, 300); });
    carregar();
  }
  return { mount };
})();
