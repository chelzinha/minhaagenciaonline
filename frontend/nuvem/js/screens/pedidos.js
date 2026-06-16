window.Screens = window.Screens || {};
Screens.pedidos = (function () {
  let _items = [];
  let _selected = new Set();

  function clientName() {
    const c = Api.getCachedClient() || {};
    return c.NOME_FANTASIA || c.NOME_REMETENTE || c.LOGIN_APP || 'Cliente';
  }
  function selectedIds() { return Array.from(_selected); }
  function selectedFormat() {
    const el = document.querySelector('input[name="bulkFormato"]:checked');
    return (el && el.value) || 'ET';
  }
  function badge(text, cls) { return '<span class="badge ' + cls + '">' + UI.escapeHtml(text) + '</span>'; }
  function statusBadge(item) {
    const st = String(item.postagensStatus || '').toUpperCase();
    if (st === 'CONCLUIDO') return badge('Concluído', 'badge-ok');
    if (st === 'ERRO') return badge('Erro', 'badge-err');
    if (st === 'PROCESSANDO') return badge('Processando', 'badge-info');
    return badge('Pronto para gerar', 'badge-muted');
  }
  function paymentLabel(v) {
    const map = {
      pending: 'Aguardando pagamento',
      paid: 'Pago',
      authorized: 'Autorizado',
      cancelled: 'Cancelado',
      voided: 'Cancelado',
      refunded: 'Estornado',
      partially_paid: 'Parcialmente pago'
    };
    const key = String(v || '').toLowerCase();
    return map[key] || (v ? String(v) : '');
  }
  function renderList() {
    const mount = document.getElementById('pedidosList');
    if (!mount) return;
    if (!_items.length) {
      mount.innerHTML = '<div class="hist-empty">Nenhum pedido encontrado.</div>';
      return;
    }
    mount.innerHTML = _items.map(item => {
      const checked = _selected.has(item.orderId) ? 'checked' : '';
      const location = [item.customerName || '—', item.city && item.uf ? item.city + '/' + item.uf : ''].filter(Boolean).join(' • ');
      const payment = paymentLabel(item.paymentStatus);
      const dateText = UI.fmtDateTimeBr(item.createdAt || item.updatedAt || '');
      const subline = payment ? (location + ' <span class="queue-meta-inline">• ' + UI.escapeHtml(payment) + '</span>') : location;
      return '<article class="queue-card">' +
        '<label class="pedido-check queue-check"><input type="checkbox" data-id="' + UI.escapeHtml(item.orderId) + '" ' + checked + '><span></span></label>' +
        '<div class="queue-main">' +
          '<div class="queue-head">' +
            '<div class="queue-head-main">' +
              '<div class="queue-title">Pedido #' + UI.escapeHtml(item.orderNumber) + '</div>' +
              '<div class="queue-badges">' + statusBadge(item) + (item.shippingService ? badge(item.shippingService,'badge-info') : '') + (item.docType ? badge(item.docType === 'NFE' ? 'NF' : 'DC-e', item.docType === 'NFE' ? 'badge-ok' : 'badge-muted') : '') + '</div>' +
            '</div>' +
            '<div class="queue-date">' + UI.escapeHtml(dateText) + '</div>' +
          '</div>' +
          '<div class="queue-subline">' + subline + '</div>' +
          '<div class="queue-actions">' +
            '<button class="btn btn-ghost btn-sm" data-act="revisar" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">edit_square</span>Revisar</button>' +
            '<button class="btn btn-primary btn-sm" data-act="gerar" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">local_shipping</span>Gerar etiqueta</button>' +
          '</div>' +
        '</div></article>';
    }).join('');
    mount.querySelectorAll('input[type="checkbox"]').forEach(el => el.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      if (e.target.checked) _selected.add(id); else _selected.delete(id);
      syncToolbar();
    }));
    mount.querySelectorAll('button[data-act="revisar"]').forEach(btn => btn.addEventListener('click', () => Router.navigate('/revisar', { orderId: btn.dataset.id })));
    mount.querySelectorAll('button[data-act="gerar"]').forEach(btn => btn.addEventListener('click', () => gerarUm(btn.dataset.id)));
    syncToolbar();
  }
  function syncToolbar() {
    const total = _selected.size;
    const el = document.getElementById('bulkCount');
    if (el) el.textContent = total ? total + ' selecionado(s)' : 'Nenhum selecionado';
    document.querySelectorAll('[data-bulk]').forEach(btn => btn.disabled = !total);
  }
  function bindFormatoSeg() {
    document.querySelectorAll('input[name="bulkFormato"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('input[name="bulkFormato"]').forEach(r => {
          r.closest('.seg-item').classList.toggle('is-selected', r.checked);
        });
      });
    });
  }
  async function carregar() {
    UI.showLoading('Buscando pedidos...');
    try {
      const filtros = {
        bucket: document.getElementById('fBucket').value,
        q: document.getElementById('fBusca').value.trim(),
        service: document.getElementById('fServico').value,
        docType: document.getElementById('fDoc').value,
        limit: 200
      };
      const data = await Api.listPedidos(filtros);
      _items = data.items || [];
      _selected = new Set();
      renderList();
      UI.hideLoading();
    } catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  async function syncPedidos() {
    UI.showLoading('Sincronizando pedidos...');
    try { await Api.syncPedidos(80); UI.hideLoading(); UI.toast('Pedidos sincronizados', 'success'); carregar(); }
    catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  async function gerarUm(orderId) {
    UI.showLoading('Gerando etiqueta...');
    try {
      await Api.gerarEtiqueta(orderId, { formatoRotulo: selectedFormat() });
      UI.hideLoading(); UI.toast('Etiqueta gerada com sucesso', 'success'); carregar();
    } catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  async function gerarLote() {
    UI.showLoading('Gerando etiquetas em lote...');
    try {
      const res = await Api.gerarEtiquetaLote(selectedIds(), { formatoRotulo: selectedFormat() });
      UI.hideLoading();
      UI.toast('Lote concluído: ' + res.success + ' sucesso(s), ' + res.failed + ' erro(s)', res.failed ? 'error' : 'success');
      carregar();
    } catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  function bindTopbar() {
    const refresh = document.getElementById('navRefresh');
    if (!refresh) return;
    refresh.classList.remove('hidden');
    refresh.onclick = syncPedidos;
  }
  function bind() {
    document.getElementById('heroNome').textContent = clientName();
    document.getElementById('btnBuscarPedidos').addEventListener('click', carregar);
    document.getElementById('btnGerarLote').addEventListener('click', gerarLote);
    document.getElementById('btnSelecionarTodos').addEventListener('click', () => {
      const ids = _items.map(x => x.orderId); _selected = new Set(ids); renderList();
    });
    ['fBucket','fServico','fDoc'].forEach(id => document.getElementById(id).addEventListener('change', carregar));
    document.getElementById('fBusca').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); carregar(); }});
    bindFormatoSeg();
    bindTopbar();
  }
  return { mount(){ bind(); carregar(); } };
})();
