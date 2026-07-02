/* =====================================================
   AGF - Importador de NF-e em PDF + previa DANFE 10x15
   O PDF alimenta a postagem; a previa fiscal permanece em modo de teste.
   ===================================================== */
window.NfeImport = (function () {
  const $ = id => document.getElementById(id);
  const PREVIEW_STORAGE_KEY = 'agf_danfe_simplificado_preview_v2';

  function getUrl() {
    const cfg = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG) || window.APP_CONFIG || {};
    return cfg.NFE_WEBAPP_URL ? String(cfg.NFE_WEBAPP_URL).trim() : '';
  }

  function getSessionToken() {
    try { return Api && Api.getSessionToken ? Api.getSessionToken() : ''; }
    catch (e) { return ''; }
  }

  function setStatus(id, message, kind) {
    const el = $(id);
    if (!el) return;
    el.hidden = false;
    el.className = 'nfe-status ' + (kind || 'info');
    el.textContent = message || '';
  }

  function moneyNumber(v) {
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) v = s.replace(/\./g, '').replace(',', '.');
      else if (/^\d+,\d{1,2}$/.test(s)) v = s.replace(',', '.');
    }
    const n = Number(v || 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function moneyBr(v) {
    return moneyNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('Não foi possível ler o PDF selecionado.'));
      fr.readAsDataURL(file);
    });
  }

  async function callNfeParser(file, portal) {
    const url = getUrl();
    if (!url || url.indexOf('__COLE_AQUI') >= 0) throw new Error('NFE_WEBAPP_URL não configurada em js/config.js.');
    if (!file) throw new Error('Selecione um PDF da NF-e.');
    if (!/\.pdf$/i.test(file.name || '')) throw new Error('Envie somente arquivo PDF.');
    if (file.size > 10 * 1024 * 1024) throw new Error('PDF muito grande. Use um DANFE menor, até 10 MB.');

    const dataUrl = await readFileAsDataUrl(file);
    const body = {
      action: 'parseNfePdf', portal: portal || 'app', sessionToken: getSessionToken(),
      sessionAction: portal === 'superfrete' ? 'sfClientDashboard' : 'me', fileName: file.name, pdfBase64: dataUrl
    };
    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), redirect: 'follow'
    });
    let json;
    try { json = await resp.json(); }
    catch (e) { throw new Error('Extrator de NF-e retornou resposta inválida.'); }
    if (!json || json.ok === false) throw new Error((json && json.error) || 'Erro ao importar NF-e.');
    return json.data || {};
  }

  function chooseRadio(name, value) {
    const el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (!el) return;
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try {
      const wrap = el.closest('.seg');
      if (wrap) {
        wrap.querySelectorAll('.seg-item').forEach(x => x.classList.remove('is-selected'));
        const label = el.closest('.seg-item');
        if (label) label.classList.add('is-selected');
      }
    } catch (e) {}
  }

  function setValue(id, value, opts) {
    const el = $(id);
    if (!el) return;
    el.value = value == null ? '' : String(value);
    if (!(opts && opts.silent)) el.dispatchEvent(new Event('input', { bubbles: true }));
    if (opts && opts.change) el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function hideRecipientAutocomplete() {
    ['destAutocomplete', 'etqDestAutocomplete'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.hidden = true;
      el.innerHTML = '';
    });
  }

  function normalizePatch(parsed) {
    return {
      nota: parsed.nota || {}, destinatario: parsed.destinatario || {}, declaracao: parsed.declaracao || {},
      patch: parsed.appPayloadPatch || {}, warnings: parsed.warnings || [], confidence: parsed.confidence || 0, source: parsed.source || {}
    };
  }

  function applyDest(ids, patch) {
    if (!ids) return;
    setValue(ids.nome, patch.destinatarioNome || '', { silent: true });
    setValue(ids.doc, patch.destinatarioCpfCnpj || '');
    setValue(ids.celular, patch.destinatarioCelular || '');
    setValue(ids.email, patch.destinatarioEmail || '');
    setValue(ids.cep, patch.destinatarioCep || '');
    setValue(ids.endereco, patch.destinatarioEndereco || '');
    setValue(ids.numero, patch.destinatarioNumero || '');
    setValue(ids.complemento, patch.destinatarioComplemento || '');
    setValue(ids.bairro, patch.destinatarioBairro || '');
    setValue(ids.cidade, patch.destinatarioCidade || '');
    setValue(ids.uf, patch.destinatarioUf || '');
    hideRecipientAutocomplete();
    setTimeout(hideRecipientAutocomplete, 0);
  }

  async function saveImportedRecipient(patch) {
    if (!patch || !patch.destinatarioNome || !window.Api || !Api.salvarDestinatario) return;
    try {
      await Api.salvarDestinatario(Object.assign({}, patch, { origemCadastro: 'NFE_IMPORT' }));
    } catch (e) {
      try { console.warn('Cadastro automático do destinatário importado não concluído:', e && e.message ? e.message : e); } catch (ignore) {}
    }
  }

  function applyNf(ids, patch) {
    if (!ids) return;
    setValue(ids.numero, patch.numeroNotaFiscal || '');
    setValue(ids.serie, patch.serieNotaFiscal || '');
    setValue(ids.valor, patch.valorNotaFiscal != null && patch.valorNotaFiscal !== '' ? moneyBr(patch.valorNotaFiscal) : '');
    setValue(ids.chave, patch.chaveNFe || '');
  }

  function normalizeItem(it, index) {
    it = it || {};
    const descricao = String(it.descricao || it.descricaoItem || it.nome || it.produto || it.xProd || '').trim();
    const quantidade = Number(it.quantidade || it.qtd || it.qCom || 1) || 1;
    const valorUnitario = moneyNumber(it.valor || it.valorUnitario || it.valor_unitario || it.vUnCom || 0);
    const valorTotal = moneyNumber(it.valorTotal || it.valor_total || it.vProd || 0);
    const valor = valorUnitario || (valorTotal && quantidade ? moneyNumber(valorTotal / quantidade) : 0);
    return { descricao: descricao || ('Item importado da NF-e ' + (index + 1)), quantidade: quantidade, valor: valor };
  }

  function getItensDeclaracao(parsed, patch) {
    parsed = parsed || {};
    patch = patch || {};
    const dec = parsed.declaracao || {};
    const nota = parsed.nota || {};
    const fontes = [patch.itensDeclaracao, patch.declaracaoItens, dec.itens, dec.items, parsed.itensDeclaracao, parsed.produtos, nota.produtos, nota.itens];
    for (let i = 0; i < fontes.length; i++) {
      if (Array.isArray(fontes[i]) && fontes[i].length) {
        const itens = fontes[i].map(normalizeItem).filter(it => it.descricao || it.valor > 0);
        if (itens.length) return itens;
      }
    }
    const valorNota = moneyNumber(patch.valorNotaFiscal || patch.valorDeclaradoSugerido || nota.valorTotal || (parsed.totais && parsed.totais.valorTotalNota) || dec.valorTotalItens || 0);
    if (valorNota > 0) return [{ descricao: 'Produtos conforme NF-e ' + (patch.numeroNotaFiscal || nota.numero || ''), quantidade: 1, valor: valorNota }];
    return [];
  }

  function clearAndFillDc(opts, itens) {
    const lista = $(opts.dcListId);
    if (!lista) return;
    lista.innerHTML = '';
    const arr = (itens || []).slice(0, 80);
    if (!arr.length) arr.push({ descricao: '', quantidade: 1, valor: 0 });
    arr.forEach((it, index) => {
      it = normalizeItem(it, index);
      let row;
      const tpl = $('tpl-item-dc');
      if (tpl && tpl.content) {
        const frag = tpl.content.cloneNode(true);
        row = frag.querySelector('.dc-item');
        lista.appendChild(frag);
      } else {
        row = document.createElement('div');
        row.className = 'dc-item';
        row.innerHTML = '<div class="dc-item-grid"><div class="field"><label class="field-label">Quantidade</label><div class="field-input"><input type="number" class="dc-qtd" min="1" step="1" value="1" required></div></div><div class="field dc-desc-field"><label class="field-label">Descrição do item</label><div class="field-input"><input type="text" class="dc-desc" required></div></div><div class="field"><label class="field-label">Valor (R$)</label><div class="field-input"><input type="number" class="dc-valor" min="0" step="0.01" required></div></div></div><button type="button" class="dc-remove"><span class="material-symbols-rounded">delete</span></button>';
        lista.appendChild(row);
      }
      if (!row) return;
      const desc = row.querySelector('.dc-desc');
      const qtd = row.querySelector('.dc-qtd');
      const val = row.querySelector('.dc-valor');
      if (desc) desc.value = it.descricao || '';
      if (qtd) qtd.value = it.quantidade || 1;
      if (val) val.value = moneyNumber(it.valor || 0);
      const remove = row.querySelector('.dc-remove');
      if (remove) remove.addEventListener('click', () => {
        if (lista.children.length <= 1) return;
        row.remove(); updateDcTotal(opts.dcListId, opts.dcTotalId);
      });
      row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => updateDcTotal(opts.dcListId, opts.dcTotalId)));
    });
    updateDcTotal(opts.dcListId, opts.dcTotalId);
  }

  function updateDcTotal(dcListId, dcTotalId) {
    const lista = $(dcListId); const totalEl = $(dcTotalId);
    if (!lista || !totalEl) return;
    let total = 0;
    lista.querySelectorAll('.dc-item').forEach(row => {
      total += Number((row.querySelector('.dc-qtd') || {}).value || 0) * Number((row.querySelector('.dc-valor') || {}).value || 0);
    });
    totalEl.textContent = 'R$ ' + moneyBr(total);
  }

  function buildSummary(parsed) {
    const p = normalizePatch(parsed).patch;
    const nf = p.numeroNotaFiscal ? 'NF ' + p.numeroNotaFiscal : 'NF importada';
    const dest = p.destinatarioNome || 'destinatário não identificado';
    const itens = getItensDeclaracao(parsed, p).length;
    return nf + ' · ' + dest + ' · ' + itens + (itens === 1 ? ' item preenchido' : ' itens preenchidos');
  }

  function storePreviewState(parsed, file) {
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({
        portal: 'app', parsed: parsed, webAppUrl: getUrl(), sessionToken: getSessionToken(),
        sessionAction: 'me', fileName: (file && file.name) || (parsed.source && parsed.source.fileName) || 'danfe.pdf', createdAt: new Date().toISOString()
      }));
    } catch (e) {}
  }

  function getPreviewState() {
    try { const raw = localStorage.getItem(PREVIEW_STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  function hasPreviewState() {
    const st = getPreviewState();
    return !!(st && st.parsed);
  }

  function clearPreviewState() {
    try { localStorage.removeItem(PREVIEW_STORAGE_KEY); } catch (e) {}
  }

  function openPreview() {
    window.open('/danfe-simplificado/?portal=app', '_blank');
  }

  function hidePreviewButton(id) {
    const btn = $(id);
    if (btn) btn.hidden = true;
  }

  function showPreviewButton(id) {
    const btn = $(id); if (!btn) return;
    btn.hidden = false;
    if (!btn._danfeBound) {
      btn._danfeBound = true;
      btn.addEventListener('click', openPreview);
    }
  }

  async function handleImport(config) {
    const fileEl = $(config.fileId); const file = fileEl && fileEl.files && fileEl.files[0];
    try {
      setStatus(config.statusId, 'Lendo PDF da NF-e...', 'loading');
      if (window.UI && UI.showLoading) UI.showLoading('Importando NF-e...');
      const parsed = await callNfeParser(file, config.portal || 'app');
      const patch = normalizePatch(parsed).patch || {};
      if (config.tipoRadioName) chooseRadio(config.tipoRadioName, 'NF');
      applyDest(config.destIds, patch); applyNf(config.nfIds, patch);
      await saveImportedRecipient(patch);
      if (config.valorDeclaradoId && patch.valorDeclaradoSugerido) {
        const el = $(config.valorDeclaradoId);
        if (el) { el.value = el.type === 'number' ? String(moneyNumber(patch.valorDeclaradoSugerido)) : moneyBr(patch.valorDeclaradoSugerido); el.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      clearAndFillDc(config, getItensDeclaracao(parsed, patch));
      storePreviewState(parsed, file);
      if (config.deferPreviewToSuccess) hidePreviewButton(config.previewBtnId);
      else showPreviewButton(config.previewBtnId);
      setStatus(config.statusId, 'NF-e importada com sucesso! Revise os dados preenchidos antes de gerar a etiqueta. ' + buildSummary(parsed), 'success');
      if (window.UI && UI.toast) UI.toast('NF-e importada. Revise os dados antes de continuar.', 'success');
      return parsed;
    } catch (e) {
      setStatus(config.statusId, e.message || String(e), 'error');
      if (window.UI && UI.toastError) UI.toastError(e);
      return null;
    } finally { if (window.UI && UI.hideLoading) UI.hideLoading(); }
  }

  function attachAppNova() {
    const btn = $('btnNfeImportNova'); if (!btn || btn._nfeBound) return;
    btn._nfeBound = true;
    btn.addEventListener('click', () => handleImport({
      portal:'app', fileId:'nfePdfNova', statusId:'nfeStatusNova', previewBtnId:'btnNfeDanfePreviewNova', tipoRadioName:'tipoDocumento',
      valorDeclaradoId:'valorDeclarado', dcListId:'dcLista', dcTotalId:'dcTotal',
      destIds:{nome:'destNome',doc:'destCpfCnpj',celular:'destCelular',email:'destEmail',cep:'destCep',endereco:'destEndereco',numero:'destNumero',complemento:'destComplemento',bairro:'destBairro',cidade:'destCidade',uf:'destUf'},
      nfIds:{numero:'nfNumero',serie:'nfSerie',valor:'nfValor',chave:'nfChave'}
    }));
  }

  function attachAppEtiqueta() {
    const btn = $('btnNfeImportEtq'); if (!btn || btn._nfeBound) return;
    btn._nfeBound = true;
    btn.addEventListener('click', () => handleImport({
      portal:'app', fileId:'nfePdfEtq', statusId:'nfeStatusEtq', previewBtnId:'btnNfeDanfePreviewEtq', tipoRadioName:'etqTipoDocumento', deferPreviewToSuccess:true,
      valorDeclaradoId:'etqValorDeclarado', dcListId:'etqDcLista', dcTotalId:'etqDcTotal',
      destIds:{nome:'etqDestNome',doc:'etqDestCpfCnpj',celular:'etqDestCelular',email:'etqDestEmail',cep:'etqDestCep',endereco:'etqDestEndereco',numero:'etqDestNumero',complemento:'etqDestComplemento',bairro:'etqDestBairro',cidade:'etqDestCidade',uf:'etqDestUf'},
      nfIds:{numero:'etqNfNumero',serie:'etqNfSerie',valor:'etqNfValor',chave:'etqNfChave'}
    }));
  }

  return { attachAppNova, attachAppEtiqueta, _callNfeParser: callNfeParser, hasPreviewState, clearPreviewState, openPreview };
})();