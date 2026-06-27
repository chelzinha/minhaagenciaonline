
window.Screens = window.Screens || {};
Screens.revisar = (function () {
  let _orderId = '';
  let _payload = null;
  let _review = {};

  // Lê o radio name="formatoRotulo" (seg-item)
  function getFormato() {
    const el = document.querySelector('input[name="formatoRotulo"]:checked');
    return (el && el.value) || 'ET';
  }
  // Define o radio correto e atualiza visual is-selected
  function setFormato(val) {
    document.querySelectorAll('input[name="formatoRotulo"]').forEach(r => {
      r.checked = (r.value === val);
      r.closest('.seg-item').classList.toggle('is-selected', r.checked);
    });
  }

  function fillForm(data) {
    const p = data.connectorPayload.payloadAppPostagens;
    document.getElementById('revOrderTitle').textContent = 'Pedido #' + data.order.orderNumber;
    document.getElementById('revDest').textContent = p.destinatarioNome + ' • ' + p.destinatarioCidade + '/' + p.destinatarioUf;
    document.getElementById('servico').value = p.servico || '';
    document.getElementById('tipoObjeto').value = p.tipoObjeto || 'CAIXA';
    setFormato(p.formatoRotulo || 'ET');
    document.getElementById('pesoG').value = p.pesoG || '';
    document.getElementById('comprimentoCm').value = p.comprimentoCm || '';
    document.getElementById('larguraCm').value = p.larguraCm || '';
    document.getElementById('alturaCm').value = p.alturaCm || '';
    document.getElementById('diametroCm').value = p.diametroCm || '';
    document.getElementById('valorDeclarado').value = p.valorDeclarado || '';
    document.getElementById('docType').textContent = data.connectorPayload.fiscal.docType || '—';
    document.getElementById('itemsResumo').innerHTML = data.connectorPayload.items.map(i => '<li>' + UI.escapeHtml(i.name) + ' • ' + i.quantity + 'x</li>').join('');
  }
  function readReview() {
    return {
      servico: document.getElementById('servico').value,
      tipoObjeto: document.getElementById('tipoObjeto').value,
      formatoRotulo: getFormato(),
      pesoG: Number(document.getElementById('pesoG').value || 0),
      comprimentoCm: Number(document.getElementById('comprimentoCm').value || 0),
      larguraCm: Number(document.getElementById('larguraCm').value || 0),
      alturaCm: Number(document.getElementById('alturaCm').value || 0),
      diametroCm: Number(document.getElementById('diametroCm').value || 0),
      valorDeclarado: Number(document.getElementById('valorDeclarado').value || 0)
    };
  }
  async function load(orderId) {
    UI.showLoading('Carregando pedido...');
    try {
      const data = await Api.getPedido(orderId);
      _payload = data; _review = data.review || {}; fillForm(data); UI.hideLoading();
    } catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  async function save() {
    UI.showLoading('Salvando revisão...');
    try { await Api.savePedidoReview(_orderId, readReview()); UI.hideLoading(); UI.toast('Revisão salva', 'success'); }
    catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  async function gerar() {
    UI.showLoading('Gerando etiqueta...');
    try {
      await Api.savePedidoReview(_orderId, readReview());
      const res = await Api.gerarEtiqueta(_orderId, readReview());
      const nome = (res && res.sentPayload && res.sentPayload.destinatarioNome) || '';
      document.getElementById('loadingText').textContent = 'Abrindo etiqueta para impressão...';
      await UI.abrirEtiquetaPedidoParaImpressao(_orderId, res, nome);
      UI.hideLoading(); UI.toast('Etiqueta gerada com sucesso', 'success'); Router.navigate('/emitidas');
    } catch (e) { UI.hideLoading(); UI.toastError(e); }
  }
  function bindSeg() {
    document.querySelectorAll('input[name="formatoRotulo"]').forEach(radio => {
      radio.addEventListener('change', () => setFormato(radio.value));
    });
  }
  function bind() {
    const refresh = document.getElementById('navRefresh');
    if (refresh) refresh.classList.add('hidden');
    document.getElementById('btnSalvarReview').addEventListener('click', save);
    document.getElementById('btnGerarReview').addEventListener('click', gerar);
    document.getElementById('btnVoltarPedidos').addEventListener('click', () => Router.navigate('/pedidos'));
    bindSeg();
  }
  return { mount(params){ _orderId = params.orderId || ''; bind(); if(_orderId) load(_orderId); } };
})();
