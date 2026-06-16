
const FRONT_ACTIONS = {
  'ping': action_ping_,
  'login': action_login_,
  'me': action_me_,
  'logout': action_logout_,
  'listPedidos': action_listPedidos_,
  'getPedido': action_getPedido_,
  'syncPedidos': action_syncPedidos_,
  'savePedidoReview': action_savePedidoReview_,
  'rastrearObjetoPedido': action_rastrearObjetoPedido_,
  'gerarEtiqueta': action_gerarEtiqueta_,
  'gerarEtiquetaLote': action_gerarEtiquetaLote_,
  'syncTrackingPedido': action_syncTrackingPedido_,
  'listHistoricoNuvem': action_listHistoricoNuvem_,
  'reimprimirEtiquetaPedido': action_reimprimirEtiquetaPedido_,
  'reimprimirDeclaracaoPedido': action_reimprimirDeclaracaoPedido_,
  'exportarDocumentosLote': action_exportarDocumentosLote_,
  'gerarPlpLote': action_gerarPlpLote_,
  'excluirEtiquetaPedido': action_excluirEtiquetaPedido_
};

const FRONT_PUBLIC_ACTIONS = ['ping', 'login'];

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const route = getRoute_(e);

  if (route === 'ping') {
    return asJson_({ ok: true, at: nowIso_() });
  }

  if (route === 'oauthCallback' || (e && e.parameter && e.parameter.code)) {
    return handleOAuthCallback_(e);
  }

  return asHtml_(
    'Nuvemshop Connector',
    'Web App online. Use <code>?route=ping</code> para teste ou configure a Nuvemshop para usar este Web App como callback e webhook.'
  );
}

function doPost(e) {
  const route = getRoute_(e);
  if (route === 'webhookOrder') return handleOrderWebhook_(e);
  if (route === 'lgpdStoreRedact') return handleLgpdWebhook_('storeRedact', e);
  if (route === 'lgpdCustomersRedact') return handleLgpdWebhook_('customersRedact', e);
  if (route === 'lgpdCustomersDataRequest') return handleLgpdWebhook_('customersDataRequest', e);

  var body = parsePostBody_(e) || {};
  var action = String(body.action || '').trim();

  try {
    if (!action) throw new Error('Ação não informada.');
    var handler = FRONT_ACTIONS[action];
    if (!handler) throw new Error('Ação desconhecida: ' + action);
    if (FRONT_PUBLIC_ACTIONS.indexOf(action) < 0 && !String(body.sessionToken || '').trim()) {
      throw new Error('Sessão não informada. Faça login novamente.');
    }
    var data = handler(body);
    return jsonResponse_({ ok: true, action: action, data: data });
  } catch (err) {
    appendLog_('ERROR', 'front.router', '', '', err.message || String(err), {
      action: action,
      stack: err && err.stack ? String(err.stack).slice(0, 2000) : ''
    });
    return jsonResponse_({
      ok: false,
      action: action,
      error: err.message || String(err),
      cwsCode: err.cwsCode || null,
      validationErrors: err.validationErrors || null
    });
  }
}
