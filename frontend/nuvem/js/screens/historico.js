window.Screens = window.Screens || {};
Screens.emitidas = (function () {
  let _items = [];
  let _selected = new Set();
  let _chipLoadToken = 0;
  const SRO_BASE = 'https://rastreamento.correios.com.br/app/index.php?objetos=';
  const RASTRO_CACHE_PREFIX = 'ns_rastro_v1_';
  const RASTRO_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — idêntico ao Minhas Postagens

  function badge(text, cls) { return '<span class="badge ' + cls + '">' + UI.escapeHtml(text) + '</span>'; }
  function statusBadge(item) {
    const st = String(item.postagensStatus || '').toUpperCase();
    if (st === 'CONCLUIDO') return badge('Concluída', 'badge-ok');
    if (st === 'CANCELADO') return badge('Excluída', 'badge-muted');
    if (st === 'ERRO') return badge('Erro', 'badge-err');
    if (st === 'PROCESSANDO') return badge('Processando', 'badge-info');
    return badge('Pendente', 'badge-muted');
  }

  // ─── Chips de serviço (SEDEX/PAC) ────────────────────────────────────────────
  function serviceChip(item) {
    const svc = String(item.shippingService || '').trim();
    if (!svc) return '';
    const up = svc.toUpperCase();
    let cls = 'hist-service-outro';
    if (up.indexOf('SEDEX') >= 0) cls = 'hist-service-sedex';
    else if (up.indexOf('PAC') >= 0) cls = 'hist-service-pac';
    return '<span class="hist-service-chip ' + cls + '">' + UI.escapeHtml(svc) + '</span>';
  }

  function metaBadges(item) {
    const parts = [];
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

  // ─── Cache de status de rastreio (sessionStorage) ────────────────────────────
  function getCachedStatusRastro_(codigo) {
    try {
      const raw = sessionStorage.getItem(RASTRO_CACHE_PREFIX + codigo);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.t || (Date.now() - obj.t) > RASTRO_CACHE_TTL_MS) return null;
      return obj.info || null;
    } catch (e) { return null; }
  }
  function setCachedStatusRastro_(codigo, info) {
    try { sessionStorage.setItem(RASTRO_CACHE_PREFIX + codigo, JSON.stringify({ t: Date.now(), info: info })); }
    catch (e) { /* sessionStorage cheio/indisponível — ignora */ }
  }

  function buildStatusInfoFromRastroData_(data) {
    data = data || {};
    return {
      statusLabel: String(data.statusLabel || '').trim() || 'Sem atualização',
      statusClass: normalizarClasseStatusRastro_(data.statusClass),
      ultimaAtualizacao: String(data.ultimaAtualizacao || '').trim(),
      localAtual: String(data.localAtual || '').trim()
    };
  }

  // Backend retorna 'ok' | 'warn' | 'err' | 'info' (11_CWS_RASTRO_PROXY)
  function normalizarClasseStatusRastro_(cls) {
    const c = String(cls || '').toLowerCase();
    if (c === 'ok' || c === 'warn' || c === 'err' || c === 'info') return c;
    if (c.indexOf('ok') >= 0) return 'ok';
    if (c.indexOf('err') >= 0) return 'err';
    if (c.indexOf('warn') >= 0) return 'warn';
    return 'info';
  }

  function statusRastroChip_(item, info) {
    const cls = 'track-status-' + normalizarClasseStatusRastro_(info.statusClass);
    const titulo = UI.joinNonEmpty([info.ultimaAtualizacao, info.localAtual], ' • ');
    return '<button type="button" class="track-status-list-chip ' + cls + '" data-act="rastrear" ' +
      'data-order="' + UI.escapeHtml(item.orderId) + '" data-codigo="' + UI.escapeHtml(item.codigoObjeto) + '" ' +
      (titulo ? 'title="' + UI.escapeHtml(titulo) + '" ' : '') + '>' +
      '<span class="material-symbols-rounded">local_shipping</span>' +
      UI.escapeHtml(info.statusLabel) + '</button>';
  }

  function renderStatusRastroSlot_(item, info) {
    const codigo = String(item.codigoObjeto || '').trim();
    if (!codigo) return;
    document.querySelectorAll('.track-status-slot[data-codigo="' + (window.CSS && CSS.escape ? CSS.escape(codigo) : codigo) + '"]').forEach(slot => {
      slot.innerHTML = statusRastroChip_(item, info);
    });
  }

  // Carrega o status real dos Correios para cada item emitido (com cache e throttle).
  // Falha silenciosa: lojas sem vínculo/credenciais simplesmente não exibem o chip.
  async function carregarChipsRastroLista_(items) {
    const token = ++_chipLoadToken;
    const pendentes = [];
    (items || []).forEach(item => {
      const codigo = String(item.codigoObjeto || '').trim();
      if (!codigo || !item.orderId) return;
      const cached = getCachedStatusRastro_(codigo);
      if (cached) renderStatusRastroSlot_(item, cached);
      else pendentes.push(item);
    });

    for (const item of pendentes) {
      if (token !== _chipLoadToken) return; // a lista foi recarregada — aborta
      try {
        const data = await Api.rastrearObjeto(item.orderId);
        const info = buildStatusInfoFromRastroData_(data);
        setCachedStatusRastro_(String(item.codigoObjeto).trim(), info);
        if (token === _chipLoadToken) renderStatusRastroSlot_(item, info);
      } catch (e) {
        // silencioso por design (sem vínculo de loja, sem credenciais, etc.)
      }
    }
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
      const place = item.destCidade && item.destUf ? item.destCidade + '/' + item.destUf : (item.city && item.uf ? item.city + '/' + item.uf : '');
      const nome = item.destNome || item.customerName || '—';
      const date = UI.fmtDateTimeBr(item.dataHora || item.updatedAt || item.createdAt || '');
      const codigo = String(item.codigoObjeto || '').trim();
      const statusSlot = codigo ? '<span class="track-status-slot" data-codigo="' + UI.escapeHtml(codigo) + '"></span>' : '';

      const whatsappBtn = (String(item.postagensStatus).toUpperCase() === 'CONCLUIDO' && codigo && item.destCelular)
        ? '<button class="btn btn-whatsapp btn-sm" data-act="whatsapp" ' +
            'data-celular="' + UI.escapeHtml(item.destCelular) + '" ' +
            'data-nome="' + UI.escapeHtml(item.destNome || '') + '" ' +
            'data-codigo="' + UI.escapeHtml(codigo) + '">' +
            '<span class="material-symbols-rounded">send</span>WhatsApp</button>'
        : '';
      const rastrearBtn = codigo
        ? '<button class="btn btn-ghost btn-sm" data-act="rastrear" data-order="' + UI.escapeHtml(item.orderId) + '" data-codigo="' + UI.escapeHtml(codigo) + '"><span class="material-symbols-rounded">local_shipping</span>Rastrear</button>'
        : '';

      return '<article class="hist-item hist-item-inline">' +
        '<label class="pedido-check hist-check"><input type="checkbox" data-id="' + UI.escapeHtml(item.orderId) + '" ' + checked + '><span></span></label>' +
        '<div class="hist-item-main">' +
          '<div class="hist-item-head hist-item-head-inline">' +
            '<div class="hist-item-titleline">' +
              '<div class="hist-item-nome">Pedido #' + UI.escapeHtml(item.orderNumber) + '</div>' +
              serviceChip(item) +
              sroChip(item) +
            '</div>' +
            '<div class="hist-item-badges">' + statusBadge(item) + metaBadges(item) + statusSlot + '</div>' +
          '</div>' +
          '<div class="hist-meta-row">' +
            '<span class="hist-meta-place">' + UI.escapeHtml(UI.joinNonEmpty([nome, place], ' • ')) + '</span>' +
            (date ? '<span class="hist-meta-dot"></span><span class="hist-meta-date">' + UI.escapeHtml(date) + '</span>' : '') +
          '</div>' +
          '<div class="hist-item-actions hist-item-actions-inline">' +
            whatsappBtn +
            rastrearBtn +
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
    mount.querySelectorAll('button[data-act="whatsapp"]').forEach(btn=>btn.addEventListener('click',()=>abrirWhatsapp(
      btn.getAttribute('data-celular'), btn.getAttribute('data-nome'), btn.getAttribute('data-codigo')
    )));
    // Delegação para os botões "Rastrear" e os chips de status (preenchidos async)
    mount.addEventListener('click', onMountClick_);

    syncToolbar();
    carregarChipsRastroLista_(_items);
  }

  function onMountClick_(e) {
    const btn = e.target && e.target.closest ? e.target.closest('[data-act="rastrear"]') : null;
    if (!btn) return;
    e.preventDefault();
    abrirRastreio(btn.getAttribute('data-order'), btn.getAttribute('data-codigo'));
  }

  // ─── WhatsApp ────────────────────────────────────────────────────────────────
  function normalizarWhatsapp_(celular) {
    let d = UI.digitsOnly(celular || '');
    if (!d) return '';
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  }
  function abrirWhatsapp(celular, nome, codigoObjeto) {
    const numero = normalizarWhatsapp_(celular);
    if (!numero) { UI.toast('Celular do destinatário não cadastrado.', 'error'); return; }
    if (!codigoObjeto) { UI.toast('Número de rastreio não disponível.', 'error'); return; }
    const rastreioUrl = SRO_BASE + encodeURIComponent(codigoObjeto);
    const texto = 'Olá ' + (nome || '') + ', o seu pedido já foi enviado!\n\n' +
      '📦 Esse é o seu número de rastreio:\n' + codigoObjeto + '\n\n' +
      'Você pode acompanhar através do seguinte link:\n' + rastreioUrl;
    window.open('https://wa.me/' + numero + '?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
  }

  // ─── Modal de rastreio (timeline) ────────────────────────────────────────────
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
      '    <div>',
      '      <div class="track-modal-title" id="trackTitle">Rastreio</div>',
      '      <div class="track-modal-code" id="trackCodigo">—</div>',
      '    </div>',
      '    <button class="icon-btn" type="button" id="trackClose" aria-label="Fechar"><span class="material-symbols-rounded">close</span></button>',
      '  </div>',
      '  <div class="track-summary">',
      '    <div class="track-status-badge" id="trackStatus">Consultando...</div>',
      '    <div class="track-summary-meta" id="trackResumo"></div>',
      '  </div>',
      '  <div class="track-timeline" id="trackTimeline"></div>',
      '  <div class="track-modal-actions">',
      '    <button class="btn btn-ghost btn-block" type="button" id="trackAtualizar"><span class="material-symbols-rounded">refresh</span>Atualizar rastreio</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) fecharRastreio();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) fecharRastreio();
    });
    modal.querySelector('#trackClose').addEventListener('click', fecharRastreio);
    modal.querySelector('#trackAtualizar').addEventListener('click', function () {
      const orderId = modal.getAttribute('data-order');
      const codigo = modal.getAttribute('data-codigo');
      if (orderId) abrirRastreio(orderId, codigo, true);
    });
    return modal;
  }

  function fecharRastreio() {
    const modal = document.getElementById('trackModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (UI.repairScrollLock) UI.repairScrollLock();
  }

  function renderTimeline(eventos) {
    const timeline = document.getElementById('trackTimeline');
    if (!timeline) return;
    if (!eventos || !eventos.length) {
      timeline.innerHTML = '<div class="track-empty">Nenhum evento de rastreio disponível.</div>';
      return;
    }
    timeline.innerHTML = eventos.map(function (ev) {
      const unidade = UI.joinNonEmpty([ev.unidadeTipo, UI.joinNonEmpty([ev.cidade, ev.uf], '/')], ' • ');
      const destino = UI.joinNonEmpty([ev.unidadeDestinoTipo, UI.joinNonEmpty([ev.unidadeDestinoCidade, ev.unidadeDestinoUf], '/')], ' • ');
      return '<div class="track-event">' +
               '<div class="track-event-dot"></div>' +
               '<div class="track-event-body">' +
                 '<div class="track-event-date">' + UI.escapeHtml(ev.dataHora || '') + '</div>' +
                 '<div class="track-event-title">' + UI.escapeHtml(ev.descricao || 'Sem descrição') + '</div>' +
                 (ev.detalhe ? '<div class="track-event-detail">' + UI.escapeHtml(ev.detalhe) + '</div>' : '') +
                 (unidade ? '<div class="track-event-place">' + UI.escapeHtml(unidade) + '</div>' : '') +
                 (destino ? '<div class="track-event-destino">Destino: ' + UI.escapeHtml(destino) + '</div>' : '') +
               '</div>' +
             '</div>';
    }).join('');
  }

  // Mapeia a classe do backend ('ok'|'warn'|'err'|'info') para o badge do modal.
  function badgeClassFromStatus_(cls) {
    const c = normalizarClasseStatusRastro_(cls);
    if (c === 'ok') return 'is-ok';
    if (c === 'err') return 'is-err';
    if (c === 'warn') return 'is-warn';
    return '';
  }

  async function abrirRastreio(orderId, codigoObjeto, forcar) {
    if (!orderId) return;
    const modal = ensureTrackModal_();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('data-order', orderId);
    if (codigoObjeto) modal.setAttribute('data-codigo', codigoObjeto);
    document.body.classList.add('modal-open');

    document.getElementById('trackCodigo').textContent = codigoObjeto || '—';
    document.getElementById('trackStatus').textContent = 'Consultando...';
    document.getElementById('trackStatus').className = 'track-status-badge';
    document.getElementById('trackResumo').textContent = '';
    document.getElementById('trackTimeline').innerHTML = '<div class="track-empty">Carregando rastreio...</div>';

    try {
      const data = await Api.rastrearObjeto(orderId);
      const codigo = String((data && data.codigoObjeto) || codigoObjeto || '').trim();
      if (codigo) {
        modal.setAttribute('data-codigo', codigo);
        document.getElementById('trackCodigo').textContent = codigo;
        // Atualiza o cache/chip da lista com o dado fresco do modal
        const info = buildStatusInfoFromRastroData_(data);
        setCachedStatusRastro_(codigo, info);
        renderStatusRastroSlot_({ orderId: orderId, codigoObjeto: codigo }, info);
      }
      const resumo = UI.joinNonEmpty([
        data.ultimaAtualizacao ? ('Atualizado em ' + data.ultimaAtualizacao) : '',
        data.localAtual ? ('Local: ' + data.localAtual) : ''
      ], ' • ');
      document.getElementById('trackStatus').textContent = data.statusLabel || 'Sem status';
      document.getElementById('trackStatus').className = 'track-status-badge ' + badgeClassFromStatus_(data.statusClass);
      document.getElementById('trackResumo').textContent = resumo;
      renderTimeline(data.eventos || []);
    } catch (e) {
      document.getElementById('trackStatus').textContent = 'Falha ao consultar';
      document.getElementById('trackStatus').className = 'track-status-badge is-err';
      document.getElementById('trackResumo').textContent = e && e.message ? e.message : 'Erro ao consultar rastreio.';
      document.getElementById('trackTimeline').innerHTML = '<div class="track-empty">Não foi possível consultar o rastreio agora.</div>';
    }
  }

  function syncToolbar(){ const total=_selected.size; const el=document.getElementById('histCount'); if(el) el.textContent= total? total+' selecionado(s)':'Nenhum selecionado'; document.querySelectorAll('[data-hbulk]').forEach(b=>b.disabled=!total); }
  async function carregar(){ UI.showLoading('Carregando emitidas...'); try{ const d=await Api.listHistorico({bucket:'emitidos', q:document.getElementById('histBusca').value.trim(), limit:200}); _items=d.items||[]; _selected=new Set(); render(); UI.hideLoading(); }catch(e){UI.hideLoading();UI.toastError(e);} }
  function nomeArquivoDocs_(orderIds, tipo){
    const prefixo = tipo==='declaracao' ? 'Declaracao' : 'Etiqueta';
    if (orderIds.length === 1) {
      const it = _items.find(x => String(x.orderId) === String(orderIds[0]));
      const nome = it ? (it.destNome || it.customerName || '') : '';
      return UI.buildEtiquetaFileName(nome, it && it.dataHora, prefixo);
    }
    return prefixo + 's_lote_' + UI.dateStampDDMMYYYY() + '.pdf';
  }
  async function baixarDocs(orderIds,tipo){ UI.showLoading('Preparando PDFs...'); try{ const d=await Api.exportarDocumentosLote(orderIds,tipo); UI.hideLoading(); if(d.errors&&d.errors.length) UI.toast('Alguns pedidos falharam no preparo', 'error'); if(!d.docs||!d.docs.length) throw new Error('Nenhum documento disponível.'); await UI.mergeAndDownloadPdfs(d.docs, nomeArquivoDocs_(orderIds, tipo)); }catch(e){UI.hideLoading();UI.toastError(e);} }
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
    ensureTrackModal_();
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
