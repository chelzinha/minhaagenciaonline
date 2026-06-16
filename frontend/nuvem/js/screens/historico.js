window.Screens = window.Screens || {};
Screens.emitidas = (function () {
  let _items = [];
  let _selected = new Set();
  const SRO_BASE = 'https://rastreamento.correios.com.br/app/index.php?objetos=';

  function badge(text, cls) { return '<span class="badge ' + cls + '">' + UI.escapeHtml(text) + '</span>'; }
  function statusBadge(item) {
    const st = String(item.postagensStatus || '').toUpperCase();
    if (st === 'CONCLUIDO') return badge('Concluída', 'badge-ok');
    if (st === 'CANCELADO') return badge('Excluída', 'badge-muted');
    if (st === 'ERRO') return badge('Erro', 'badge-err');
    if (st === 'PROCESSANDO') return badge('Processando', 'badge-info');
    return badge('Pendente', 'badge-muted');
  }
  function metaBadges(item) {
    const parts = [];
    if (item.shippingService) parts.push(badge(item.shippingService, 'badge-info'));
    if (item.docType) parts.push(badge(item.docType === 'NFE' ? 'NF' : 'DC-e', item.docType === 'NFE' ? 'badge-ok' : 'badge-muted'));
    if (String(item.nuvemshopTrackingSyncStatus || '').toUpperCase() === 'SINCRONIZADO') parts.push(badge('Nuvemshop OK', 'badge-ok'));
    return parts.join('');
  }
  function sroChip(item) {
    const codigo = String(item.codigoObjeto || '').trim();
    if (!codigo) return '';
    return '<a class="track-chip" href="' + SRO_BASE + encodeURIComponent(codigo) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="material-symbols-rounded">local_shipping</span>SRO ' + UI.escapeHtml(codigo) + '</a>';
  }
  function render() {
    const mount = document.getElementById('histList');
    if (!mount) return;
    if (!_items.length) {
      mount.innerHTML = '<div class="hist-empty">Nenhuma etiqueta emitida.</div>';
      return;
    }
    mount.innerHTML = _items.map(item => {
      const checked = _selected.has(item.orderId) ? 'checked' : '';
      const location = [item.customerName || '—', item.city && item.uf ? item.city + '/' + item.uf : ''].filter(Boolean).join(' • ');
      const date = UI.fmtDateTimeBr(item.updatedAt || item.createdAt || '');
      return '<article class="hist-item hist-item-inline">' +
        '<label class="pedido-check hist-check"><input type="checkbox" data-id="' + UI.escapeHtml(item.orderId) + '" ' + checked + '><span></span></label>' +
        '<div class="hist-item-main">' +
          '<div class="hist-item-head hist-item-head-inline">' +
            '<div class="hist-item-titleline">' +
              '<div class="hist-item-nome">Pedido #' + UI.escapeHtml(item.orderNumber) + '</div>' +
              sroChip(item) +
            '</div>' +
            '<div class="hist-item-badges">' + statusBadge(item) + metaBadges(item) + '</div>' +
          '</div>' +
          '<div class="hist-item-subline">' + UI.escapeHtml(location) + '<span class="hist-item-date">' + UI.escapeHtml(date) + '</span></div>' +
          '<div class="hist-item-actions hist-item-actions-inline">' +
            '<button class="btn btn-ghost btn-sm" data-act="etiqueta" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">picture_as_pdf</span>Etiqueta</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="dc" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">description</span>DC-e</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="tracking" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">sync</span>Sincronizar</button>' +
            '<button class="btn btn-danger btn-sm" data-act="excluir" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">delete</span>Excluir</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    mount.querySelectorAll('input[type="checkbox"]').forEach(el => el.addEventListener('change', e => {
      const id = e.target.dataset.id; if (e.target.checked) _selected.add(id); else _selected.delete(id); syncToolbar();
    }));
    mount.querySelectorAll('button[data-act="etiqueta"]').forEach(btn=>btn.addEventListener('click',()=>baixarDocs([btn.dataset.id],'etiqueta')));
    mount.querySelectorAll('button[data-act="dc"]').forEach(btn=>btn.addEventListener('click',()=>baixarDocs([btn.dataset.id],'declaracao')));
    mount.querySelectorAll('button[data-act="tracking"]').forEach(btn=>btn.addEventListener('click',()=>sincronizarTracking([btn.dataset.id])));
    mount.querySelectorAll('button[data-act="excluir"]').forEach(btn=>btn.addEventListener('click',()=>excluir(btn.dataset.id)));
    syncToolbar();
  }
  function syncToolbar(){ const total=_selected.size; const el=document.getElementById('histCount'); if(el) el.textContent= total? total+' selecionado(s)':'Nenhum selecionado'; document.querySelectorAll('[data-hbulk]').forEach(b=>b.disabled=!total); }
  async function carregar(){ UI.showLoading('Carregando emitidas...'); try{ const d=await Api.listHistorico({bucket:'emitidos', q:document.getElementById('histBusca').value.trim(), limit:200}); _items=d.items||[]; _selected=new Set(); render(); UI.hideLoading(); }catch(e){UI.hideLoading();UI.toastError(e);} }
  async function baixarDocs(orderIds,tipo){ UI.showLoading('Preparando PDFs...'); try{ const d=await Api.exportarDocumentosLote(orderIds,tipo); UI.hideLoading(); if(d.errors&&d.errors.length) UI.toast('Alguns pedidos falharam no preparo', 'error'); if(!d.docs||!d.docs.length) throw new Error('Nenhum documento disponível.'); const name = tipo==='declaracao' ? 'declaracoes_lote.pdf' : 'etiquetas_lote.pdf'; await UI.mergeAndDownloadPdfs(d.docs,name); }catch(e){UI.hideLoading();UI.toastError(e);} }
  async function baixarSelecionadas(tipo){ return baixarDocs(Array.from(_selected), tipo); }
  async function gerarPlp(){ UI.showLoading('Gerando lista de postagem...'); try{ const d=await Api.gerarPlpLote(Array.from(_selected)); UI.hideLoading(); UI.openPrintHtml(d.html); }catch(e){ UI.hideLoading(); UI.toastError(e);} }
  async function sincronizarTracking(orderIds){ UI.showLoading('Sincronizando rastreio...'); try{ const res = await Api.syncTrackingPedido(orderIds); UI.hideLoading(); UI.toast('Rastreio sincronizado: ' + (res.success || 0) + ' sucesso(s)', 'success'); carregar(); }catch(e){ UI.hideLoading(); UI.toastError(e);} }
  async function excluir(orderId){
    const ok = await UI.confirm({ title:'Excluir etiqueta?', body:'A etiqueta será cancelada no app de Postagens e sairá da lista de emitidas. Deseja continuar?', confirmText:'Excluir etiqueta', cancelText:'Voltar', danger:true });
    if(!ok) return;
    UI.showLoading('Excluindo etiqueta...');
    try{ await Api.excluirEtiquetaPedido(orderId); UI.hideLoading(); UI.toast('Etiqueta excluída com sucesso', 'success'); carregar(); }catch(e){ UI.hideLoading(); UI.toastError(e);} }
  function bind(){
    const refresh = document.getElementById('navRefresh');
    if (refresh) refresh.classList.add('hidden');
    document.getElementById('btnBuscarHist').addEventListener('click', carregar);
    document.getElementById('btnHistEtiqueta').addEventListener('click', ()=>baixarSelecionadas('etiqueta'));
    document.getElementById('btnHistDc').addEventListener('click', ()=>baixarSelecionadas('declaracao'));
    document.getElementById('btnHistPlp').addEventListener('click', gerarPlp);
    document.getElementById('btnHistTracking').addEventListener('click', ()=>sincronizarTracking(Array.from(_selected)));
    document.getElementById('btnHistTodos').addEventListener('click', ()=>{ _selected=new Set(_items.map(x=>x.orderId)); render(); });
    document.getElementById('btnHistLimpar').addEventListener('click', ()=>{ _selected=new Set(); render(); });
    document.getElementById('histBusca').addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); carregar(); }});
  }
  return { mount(){ bind(); carregar(); } };
})();
