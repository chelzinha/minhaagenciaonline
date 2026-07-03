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
  function normalizeStatus(value) { return String(value || '').trim().toLowerCase(); }
  function isPaymentPaid(item) { return normalizeStatus(item.paymentStatus) === 'paid'; }
  function isPaymentBlocked(item) {
    const pay = normalizeStatus(item.paymentStatus);
    const status = normalizeStatus(item.status || item.orderStatus);
    return status === 'cancelled' || pay === 'cancelled' || pay === 'voided' || pay === 'refunded';
  }
  function canGenerate(item) {
    const ps = String(item.postagensStatus || '').toUpperCase();
    return isPaymentPaid(item) && !isPaymentBlocked(item) && (!ps || ps === 'ERRO');
  }
  function badge(text, cls) { return '<span class="badge ' + cls + '">' + UI.escapeHtml(text) + '</span>'; }
  function statusBadge(item) {
    const st = String(item.postagensStatus || '').toUpperCase();
    if (st === 'CONCLUIDO') return badge('Concluído', 'badge-ok');
    if (st === 'ERRO') return badge('Erro', 'badge-err');
    if (st === 'PROCESSANDO') return badge('Processando', 'badge-info');
    if (!isPaymentPaid(item) || isPaymentBlocked(item)) return badge('Não elegível', 'badge-muted');
    return badge('Pronto para gerar', 'badge-info');
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
    const key = normalizeStatus(v);
    return map[key] || (v ? String(v) : 'Pagamento não informado');
  }
  function paymentBadge(item) {
    const pay = normalizeStatus(item.paymentStatus);
    if (pay === 'paid') return badge('Pago', 'badge-pay-paid');
    if (pay === 'authorized') return badge('Autorizado', 'badge-pay-authorized');
    if (pay === 'pending' || pay === 'partially_paid') return badge(paymentLabel(pay), 'badge-pay-pending');
    if (pay === 'cancelled' || pay === 'voided') return badge('Cancelado', 'badge-pay-cancelled');
    if (pay === 'refunded') return badge('Estornado', 'badge-pay-refunded');
    return badge(paymentLabel(pay), 'badge-muted');
  }
  function serviceBadge(item) {
    const svc = String(item.shippingService || '').trim();
    if (!svc) return '';
    const up = svc.toUpperCase();
    if (up.indexOf('SEDEX') >= 0) return badge('SEDEX', 'badge-service-sedex');
    if (up.indexOf('PAC') >= 0) return badge('PAC', 'badge-service-pac');
    return badge(svc, 'badge-service-other');
  }
  function renderList() {
    const mount = document.getElementById('pedidosList');
    if (!mount) return;
    if (!_items.length) {
      mount.innerHTML = '<div class="hist-empty">Nenhum pedido pago encontrado para gerar etiqueta.</div>';
      return;
    }
    mount.innerHTML = _items.map(item => {
      const eligible = canGenerate(item);
      const checked = _selected.has(item.orderId) ? 'checked' : '';
      const location = [item.customerName || '—', item.city && item.uf ? item.city + '/' + item.uf : ''].filter(Boolean).join(' • ');
      const payment = paymentLabel(item.paymentStatus);
      const dateText = UI.fmtDateTimeBr(item.createdAt || item.updatedAt || '');
      const totalText = item.total ? UI.fmtMoney(item.total) : '';
      const subline = location + (payment ? ' <span class="queue-meta-inline">• ' + UI.escapeHtml(payment) + '</span>' : '') + (totalText ? ' <span class="queue-value">' + UI.escapeHtml(totalText) + '</span>' : '');
      const gerarAction = eligible
        ? '<button class="btn btn-primary btn-sm" data-act="gerar" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">local_shipping</span>Gerar etiqueta</button>'
        : '<div class="queue-actions-note">Etiqueta bloqueada até o pedido constar como pago.</div>';
      return '<article class="queue-card ' + (eligible ? '' : 'is-not-eligible') + '">' +
        '<label class="pedido-check queue-check"><input type="checkbox" data-id="' + UI.escapeHtml(item.orderId) + '" ' + checked + (eligible ? '' : ' disabled') + '><span></span></label>' +
        '<div class="queue-main">' +
          '<div class="queue-head">' +
            '<div class="queue-head-main">' +
              '<div class="queue-title">Pedido #' + UI.escapeHtml(item.orderNumber) + '</div>' +
              '<div class="queue-badges">' + statusBadge(item) + paymentBadge(item) + serviceBadge(item) + (item.docType ? badge(item.docType === 'NFE' ? 'NF' : 'DC-e', item.docType === 'NFE' ? 'badge-ok' : 'badge-muted') : '') + '</div>' +
            '</div>' +
            '<div class="queue-date">' + UI.escapeHtml(dateText) + '</div>' +
          '</div>' +
          '<div class="queue-subline">' + subline + '</div>' +
          '<div class="queue-actions">' +
            '<button class="btn btn-ghost btn-sm" data-act="revisar" data-id="' + UI.escapeHtml(item.orderId) + '"><span class="material-symbols-rounded">edit_square</span>Revisar</button>' +
            gerarAction +
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
    UI.showLoading('Buscando pedidos pagos...');
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
    UI.showLoading('Sincronizando pedidos pagos...');
    try { await Api.syncPedidos(40); UI.hideLoading(); UI.toast('Pedidos pagos sincronizados', 'success'); carregar(); }
    catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  async function gerarUm(orderId) {
    const item = _items.find(x => String(x.orderId) === String(orderId));
    if (item && !canGenerate(item)) {
      UI.toast('Este pedido ainda não está elegível para gerar etiqueta.', 'error');
      return;
    }
    UI.showLoading('Gerando etiqueta...');
    try {
      const res = await Api.gerarEtiqueta(orderId, { formatoRotulo: selectedFormat() });
      const nome = (res && res.sentPayload && res.sentPayload.destinatarioNome) || '';
      document.getElementById('loadingText').textContent = 'Abrindo etiqueta para impressão...';
      await UI.abrirEtiquetaPedidoParaImpressao(orderId, res, nome);
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
      const ids = _items.filter(canGenerate).map(x => x.orderId); _selected = new Set(ids); renderList();
    });
    ['fBucket','fServico','fDoc'].forEach(id => document.getElementById(id).addEventListener('change', carregar));
    document.getElementById('fBusca').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); carregar(); }});
    bindFormatoSeg();
    bindTopbar();
  }
  return { mount(){ bind(); carregar(); } };
})();
