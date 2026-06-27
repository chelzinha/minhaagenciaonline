
function _sessionStoreId_(params) {
  return String(getFrontSession_(params.sessionToken).STORE_ID || '');
}

function _sessionIdCrm_(params) {
  return String(getFrontSession_(params.sessionToken).ID_CRM || '');
}

function getOrderReview_(orderRow) {
  return parseJsonSafe_(orderRow.REVIEW_JSON, {}) || {};
}

function mergeReviewOverrides_(orderRow, overrides) {
  var base = getOrderReview_(orderRow);
  var extra = overrides || {};
  return Object.assign({}, base, extra);
}

function sanitizeOrderListItem_(row) {
  return {
    storeId: String(row.STORE_ID || ''),
    orderId: String(row.ORDER_ID || ''),
    orderNumber: String(row.ORDER_NUMBER || ''),
    createdAt: row.CREATED_AT || '',
    updatedAt: row.POSTAGENS_UPDATED_AT || row.UPDATED_AT || '',
    customerName: row.CUSTOMER_NAME || '',
    city: row.CITY || '',
    uf: provinceToUf_(row.PROVINCE || ''),
    total: toNumber_(row.TOTAL),
    itemsCount: toNumber_(row.ITEMS_COUNT),
    shippingService: row.SHIPPING_SERVICE || '',
    docType: row.DOC_TYPE || '',
    paymentStatus: row.PAYMENT_STATUS || '',
    shippingStatus: row.SHIPPING_STATUS || '',
    postagensStatus: row.POSTAGENS_STATUS || '',
    codigoObjeto: row.POSTAGENS_CODIGO_OBJETO || '',
    etiquetaUrl: row.POSTAGENS_URL_PDF || '',
    declaracaoUrl: row.POSTAGENS_URL_DECLARACAO || '',
    reviewUpdatedAt: row.REVIEW_UPDATED_AT || '',
    hasReview: !!String(row.REVIEW_JSON || '').trim(),
    erro: row.POSTAGENS_ERRO || '',
    // Campos para WhatsApp e rastreio (aba Emitidas estilo Histórico)
    destNome: row.SHIPPING_NAME || row.CUSTOMER_NAME || '',
    destCelular: row.SHIPPING_PHONE || row.CUSTOMER_PHONE || '',
    destCidade: row.CITY || '',
    destUf: provinceToUf_(row.PROVINCE || ''),
    dataHora: row.POSTAGENS_UPDATED_AT || row.UPDATED_AT || row.CREATED_AT || '',
    trackingSyncStatus: row.NUVEMSHOP_TRACKING_SYNC_STATUS || '',
    trackingSyncError: row.NUVEMSHOP_TRACKING_SYNC_ERROR || '',
    trackingSyncAt: row.NUVEMSHOP_TRACKING_SYNC_AT || ''
  };
}

function action_listPedidos_(params) {
  var storeId = _sessionStoreId_(params);
  var filtros = params.filtros || {};
  var bucket = String(filtros.bucket || 'fila').toLowerCase();
  var q = String(filtros.q || '').trim().toLowerCase();
  var service = String(filtros.service || '').trim().toUpperCase();
  var docType = String(filtros.docType || '').trim().toUpperCase();
  var limit = Math.min(Math.max(Number(filtros.limit || 100), 1), 500);

  var rows = sheetRowsAsObjects_(CFG.SHEETS.ORDERS).filter(function(r) {
    return String(r.STORE_ID || '') === storeId;
  });

  rows = rows.filter(function(r) {
    var ps = String(r.POSTAGENS_STATUS || '').toUpperCase();
    if (bucket === 'fila') return !ps || ps === 'ERRO';
    if (bucket === 'emitidos') return ps === 'CONCLUIDO';
    if (bucket === 'erros') return ps === 'ERRO';
    return true;
  });

  if (service) {
    rows = rows.filter(function(r) { return String(r.SHIPPING_SERVICE || '').toUpperCase() === service; });
  }
  if (docType) {
    rows = rows.filter(function(r) { return String(r.DOC_TYPE || '').toUpperCase() === docType; });
  }
  if (q) {
    rows = rows.filter(function(r) {
      return [r.ORDER_NUMBER, r.ORDER_ID, r.CUSTOMER_NAME, r.CUSTOMER_DOCUMENT, r.CITY, r.POSTAGENS_CODIGO_OBJETO]
        .some(function(v) { return String(v || '').toLowerCase().indexOf(q) >= 0; });
    });
  }

  rows.sort(function(a, b) {
    return new Date(b.CREATED_AT || 0).getTime() - new Date(a.CREATED_AT || 0).getTime();
  });

  return {
    total: rows.length,
    items: rows.slice(0, limit).map(sanitizeOrderListItem_)
  };
}

function action_getPedido_(params) {
  var storeId = _sessionStoreId_(params);
  var orderId = String(params.orderId || '').trim();
  if (!orderId) throw new Error('orderId obrigatório.');
  var row = getOrderRowById_(orderId);
  if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');
  var review = getOrderReview_(row);
  var connectorPayload = buildConnectorPayloadByOrderId_(orderId, review);
  return {
    order: sanitizeOrderListItem_(row),
    rawOrder: row,
    review: review,
    connectorPayload: connectorPayload
  };
}

function action_syncPedidos_(params) {
  var storeId = _sessionStoreId_(params);
  var limit = Math.min(Math.max(Number(params.limit || 50), 1), 200);
  return syncLatestOrders_(storeId, limit);
}

function action_savePedidoReview_(params) {
  var storeId = _sessionStoreId_(params);
  var orderId = String(params.orderId || '').trim();
  if (!orderId) throw new Error('orderId obrigatório.');
  var row = getOrderRowById_(orderId);
  if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');

  var review = params.review || {};
  upsertOrder_({
    STORE_ID: storeId,
    ORDER_ID: orderId,
    REVIEW_JSON: JSON.stringify(review || {}),
    REVIEW_UPDATED_AT: nowIso_()
  });

  return action_getPedido_({ sessionToken: params.sessionToken, orderId: orderId });
}


function action_rastrearObjetoPedido_(params) {
  var storeId = _sessionStoreId_(params);
  var orderId = String(params.orderId || '').trim();
  if (!orderId) throw new Error('orderId obrigatório.');
  var row = getOrderRowById_(orderId);
  if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');
  if (!row.POSTAGENS_CODIGO_OBJETO) throw new Error('Pedido sem código de rastreio.');
  return rastrearObjetoPedido_(storeId, String(row.POSTAGENS_CODIGO_OBJETO || ''));
}

function action_gerarEtiqueta_(params) {
  var storeId = _sessionStoreId_(params);
  var orderId = String(params.orderId || '').trim();
  if (!orderId) throw new Error('orderId obrigatório.');
  var row = getOrderRowById_(orderId);
  if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');

  var merged = mergeReviewOverrides_(row, params.overrides || {});
  return sendOrderToPostagensByOrderId_(orderId, merged);
}

function action_syncTrackingPedido_(params) {
  var storeId = _sessionStoreId_(params);

  // O front envia orderIds (array). Aceitamos também orderId (singular) por compat.
  var orderIds = Array.isArray(params.orderIds) ? params.orderIds.slice() : [];
  if (!orderIds.length && params.orderId) orderIds = [params.orderId];
  orderIds = orderIds.map(function(id) { return String(id || '').trim(); }).filter(Boolean);
  if (!orderIds.length) throw new Error('Informe ao menos um pedido para sincronizar.');

  var results = [];
  var errors = [];

  orderIds.forEach(function(orderId) {
    try {
      var row = getOrderRowById_(orderId);
      if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');
      if (!row.POSTAGENS_CODIGO_OBJETO) throw new Error('Pedido sem código de rastreio para sincronizar.');
      var sync = syncTrackingBackToNuvemshopByOrderId_(orderId, String(row.POSTAGENS_CODIGO_OBJETO || ''), { status:'DISPATCHED', notifyCustomer:true });
      results.push({ orderId: orderId, ok: true, fulfillmentOrderId: (sync && sync.fulfillmentOrderId) || '' });
    } catch (err) {
      errors.push({ orderId: orderId, ok: false, error: err.message || String(err) });
    }
  });

  return {
    total: orderIds.length,
    success: results.length,
    failed: errors.length,
    results: results,
    errors: errors
  };
}

function action_gerarEtiquetaLote_(params) {
  var storeId = _sessionStoreId_(params);
  var orderIds = Array.isArray(params.orderIds) ? params.orderIds : [];
  var overrides = params.overrides || {};
  var results = [];
  var errors = [];
  var sessionTokenPostagens = loginPostagensAppByStoreId_(storeId);

  orderIds.forEach(function(orderId) {
    try {
      var row = getOrderRowById_(orderId);
      if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Sem permissão.');
      var merged = mergeReviewOverrides_(row, overrides);
      var result = sendOrderToPostagensByOrderId_(orderId, merged, sessionTokenPostagens);
      results.push({ orderId: String(orderId), ok: true, result: result.result });
    } catch (err) {
      errors.push({ orderId: String(orderId), ok: false, error: err.message || String(err) });
    }
  });

  return {
    total: orderIds.length,
    success: results.length,
    failed: errors.length,
    results: results,
    errors: errors
  };
}


function action_excluirEtiquetaPedido_(params) {
  var storeId = _sessionStoreId_(params);
  var orderId = String(params.orderId || '').trim();
  if (!orderId) throw new Error('orderId obrigatório.');
  var row = getOrderRowById_(orderId);
  if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');
  return cancelOrderInPostagensByOrderId_(orderId);
}

function action_listHistoricoNuvem_(params) {
  var p = params.filtros || {};
  p.bucket = p.bucket || 'emitidos';
  return action_listPedidos_({ sessionToken: params.sessionToken, filtros: p });
}

function action_reimprimirEtiquetaPedido_(params) {
  var storeId = _sessionStoreId_(params);
  var orderId = String(params.orderId || '').trim();
  var row = getOrderRowById_(orderId);
  if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Pedido não encontrado ou sem permissão.');
  return reprintOrderFromPostagensByOrderId_(orderId);
}

function action_reimprimirDeclaracaoPedido_(params) {
  var data = action_reimprimirEtiquetaPedido_(params);
  return {
    orderId: String(params.orderId || ''),
    declaracao: data.declaracao || null,
    erros: data.erros || null
  };
}

function action_exportarDocumentosLote_(params) {
  var storeId = _sessionStoreId_(params);
  var orderIds = Array.isArray(params.orderIds) ? params.orderIds : [];
  var tipo = String(params.tipo || 'etiqueta').toLowerCase();
  var docs = [];
  var errors = [];
  var sessionTokenPostagens = loginPostagensAppByStoreId_(storeId);

  orderIds.forEach(function(orderId) {
    try {
      var row = getOrderRowById_(orderId);
      if (!row || String(row.STORE_ID || '') !== storeId) throw new Error('Sem permissão.');
      var data = reprintOrderFromPostagensByOrderId_(orderId, sessionTokenPostagens);
      if (tipo === 'declaracao') {
        if (!data.declaracao || !data.declaracao.pdfBase64) throw new Error('Pedido sem declaração disponível.');
        docs.push({ orderId: String(orderId), fileName: data.declaracao.pdfFileName || ('declaracao_' + orderId + '.pdf'), pdfBase64: data.declaracao.pdfBase64 });
      } else {
        if (!data.pdfBase64) throw new Error('Pedido sem etiqueta disponível.');
        docs.push({ orderId: String(orderId), fileName: data.pdfFileName || ('etiqueta_' + orderId + '.pdf'), pdfBase64: data.pdfBase64 });
      }
    } catch (err) {
      errors.push({ orderId: String(orderId), error: err.message || String(err) });
    }
  });

  return { tipo: tipo, docs: docs, errors: errors };
}

function buildPlpHtml_(orders, client) {
  var clienteNome = String((client && (client.NOME_REMETENTE || client.NOME_FANTASIA)) || 'NOME DO CLIENTE');
  var contrato = String((client && client.NUM_CONTRATO) || '');
  var cartao = String((client && client.CARTAO_POSTAGEM) || '');
  var cnpj = String((client && client.CNPJ_CPF) || '');
  var dataGeracao = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  var dataImpressao = dataGeracao;
  var numeroLista = String(new Date().getTime()).slice(-6);
  var logoSrc = 'data:image/png;base64,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';

  function digits(v) { return String(v || '').replace(/\D+/g, ''); }
  function fmtCep(v) {
    var d = digits(v);
    return d.length === 8 ? d.slice(0,5) + '-' + d.slice(5) : String(v || '');
  }
  function fmtCnpjCpf(v) {
    var d = digits(v);
    if (d.length === 14) return d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5,8)+'/'+d.slice(8,12)+'-'+d.slice(12);
    if (d.length === 11) return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9);
    return String(v || '');
  }
  function brMoney(v) {
    return money2_(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function serviceCode(order) {
    if (String(order.shippingService || '').toUpperCase() === 'SEDEX') return String((client && client.COD_SERVICO_SEDEX) || '');
    if (String(order.shippingService || '').toUpperCase() === 'PAC') return String((client && client.COD_SERVICO_PAC) || '');
    return '';
  }
  function barcodeSvg(text) {
    var d = digits(text);
    if (!d) return '';
    var bars = [];
    var x = 0;
    for (var i = 0; i < d.length; i++) {
      var n = Number(d.charAt(i));
      var pattern = [1, ((n % 3) + 1), 1, (((n + 1) % 3) + 1), 2];
      for (var j = 0; j < pattern.length; j++) {
        var w = pattern[j];
        if (j % 2 === 0) bars.push('<rect x="' + x + '" y="0" width="' + w + '" height="34" fill="#111"/>');
        x += w + 1;
      }
      x += 1;
    }
    var width = Math.max(120, x + 4);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' 46" width="100%" height="40" preserveAspectRatio="none">' +
      '<rect width="100%" height="100%" fill="#fff"/>' + bars.join('') +
      '<text x="50%" y="44" font-size="9" text-anchor="middle" font-family="Arial, sans-serif" fill="#444">' + UI_ESCAPE_HTML_(text) + '</text></svg>';
  }

  var targetRows = Math.max(12, orders.length);
  var rows = [];
  for (var idx = 0; idx < targetRows; idx++) {
    var o = orders[idx];
    if (o) {
      var doc = String(o.docType || '').toUpperCase() === 'NFE' ? (o.invoiceKey || '') : (o.orderNumber || '');
      rows.push('<tr>' +
        '<td class="c-idx">' + (idx + 1) + '</td>' +
        '<td class="c-serv">' + UI_ESCAPE_HTML_(serviceCode(o)) + ' ' + UI_ESCAPE_HTML_(o.shippingService || '') + '</td>' +
        '<td class="c-obj">' + UI_ESCAPE_HTML_(o.codigoObjeto || '') + '</td>' +
        '<td class="c-cep">' + UI_ESCAPE_HTML_(fmtCep(o.cep || '')) + '</td>' +
        '<td class="c-vd ta-right">' + brMoney(o.valorDeclarado || o.total || 0) + '</td>' +
        '<td class="c-adic ta-right">0,00</td>' +
        '<td class="c-vc ta-right">0,00</td>' +
        '<td class="c-nf">' + UI_ESCAPE_HTML_(doc) + '</td>' +
        '<td class="c-dest">' + UI_ESCAPE_HTML_(o.customerName || '') + '</td>' +
        '<td class="c-cart">' + UI_ESCAPE_HTML_(cartao ? cartao + '/' : '') + '</td>' +
      '</tr>');
    } else {
      rows.push('<tr class="blank">' +
        '<td class="c-idx">&nbsp;</td><td class="c-serv"></td><td class="c-obj"></td><td class="c-cep"></td><td class="c-vd"></td><td class="c-adic"></td><td class="c-vc"></td><td class="c-nf"></td><td class="c-dest"></td><td class="c-cart"></td>' +
      '</tr>');
    }
  }

  return '<!doctype html><html><head><meta charset="utf-8"><title>Lista de Postagem</title>' +
    '<style>' +
    '@page{size:A4;margin:9mm 10mm 10mm}' +
    'html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}' +
    'body{font-size:11px}' +
    '.sheet{width:190mm;margin:0 auto}' +
    '.head{border:1px solid #cfcfcf}' +
    '.head-top{display:grid;grid-template-columns:95px 1fr 210px;align-items:center}' +
    '.logo-box{padding:12px 10px 10px;border-right:1px solid #ddd;min-height:82px;display:flex;align-items:center;justify-content:center}' +
    '.logo-box img{max-width:82px;max-height:64px;display:block}' +
    '.title-box{padding:12px 14px 10px;text-align:center}' +
    '.brand{font-size:15px;font-weight:700;letter-spacing:.2px}' +
    '.rule{height:1px;background:#bdbdbd;margin:7px 12px}' +
    '.title{font-size:12px;font-weight:700;letter-spacing:.3px}' +
    '.meta{display:grid;grid-template-columns:1fr;gap:0;border-left:1px solid #ddd;min-height:82px}' +
    '.meta .row{padding:7px 10px;border-bottom:1px solid #ddd;font-size:10px;line-height:1.05}' +
    '.meta .row:last-child{border-bottom:0}' +
    '.meta .lbl{display:block;color:#666;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.2px}' +
    '.meta .val{display:block;font-size:11px;font-weight:700;margin-top:2px}' +
    '.print-row{border-top:1px solid #ddd;padding:4px 10px;text-align:right;font-size:10px;color:#666}' +
    '.client-grid{display:grid;grid-template-columns:1fr 220px;border-top:1px solid #ddd}' +
    '.cell{padding:4px 8px;border-right:1px solid #ddd;border-bottom:1px solid #ddd}' +
    '.client-grid .cell:last-child{border-right:0}' +
    '.label{display:block;color:#777;font-size:9px;font-weight:700;text-transform:uppercase;margin-bottom:2px}' +
    '.value{display:block;font-size:11px;font-weight:700}' +
    '.contract-grid{display:grid;grid-template-columns:1fr 1fr 120px;border-top:0}' +
    '.contract-grid .cell{min-height:38px}' +
    '.barcode{display:flex;align-items:center;justify-content:center;padding:2px 8px;background:#fff}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:10px;border:1px solid #cfcfcf}' +
    'thead th{background:#2f2f2f;color:#fff;font-weight:700;font-size:10px;padding:6px 5px;border-right:1px solid #666;white-space:nowrap}' +
    'thead th:last-child{border-right:0}' +
    'tbody td{border-right:1px solid #d3d3d3;border-top:1px solid #dcdcdc;padding:5px 5px;font-size:10px;height:24px;vertical-align:middle}' +
    'tbody tr.blank td{height:21px;color:transparent}' +
    'tbody td:last-child{border-right:0}' +
    '.c-idx{width:4%;text-align:center}.c-serv{width:14%}.c-obj{width:16%}.c-cep{width:10%}.c-vd{width:11%}.c-adic{width:8%}.c-vc{width:8%}.c-nf{width:9%}.c-dest{width:20%}.c-cart{width:10%}' +
    '.ta-right{text-align:right}' +
    '.total-row{display:grid;grid-template-columns:60px 45px 1fr;border:1px solid #cfcfcf;border-top:0;background:#efefef;font-size:11px;font-weight:700}' +
    '.total-row div{padding:6px 8px;border-right:1px solid #d0d0d0}' +
    '.total-row div:last-child{border-right:0}' +
    '.sign-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #cfcfcf;border-top:0;margin-top:12px}' +
    '.sign-box{min-height:72px;padding:8px 10px;border-right:1px solid #d0d0d0;position:relative}' +
    '.sign-box:last-child{border-right:0}' +
    '.sign-line{position:absolute;left:14px;right:14px;bottom:26px;border-top:1px solid #bbb}' +
    '.sign-caption{position:absolute;left:8px;right:8px;bottom:8px;text-align:center;color:#777;font-size:9px;font-weight:700;text-transform:uppercase}' +
    '.receipt{border:1px solid #cfcfcf;border-top:0;padding:6px 10px;font-size:11px}' +
    '.footer-grid{display:grid;grid-template-columns:1fr 1fr;margin-top:54px;border:1px solid #cfcfcf}' +
    '.footer-box{min-height:54px;padding:7px 10px;position:relative}' +
    '.footer-box:first-child{border-right:1px solid #d0d0d0}' +
    '.footer-top{font-size:10px;color:#777}' +
    '.footer-line{position:absolute;left:14px;right:14px;bottom:20px;border-top:1px solid #bbb}' +
    '.footer-caption{position:absolute;left:8px;right:8px;bottom:6px;text-align:center;color:#777;font-size:9px;font-weight:700;text-transform:uppercase}' +
    '</style></head><body><div class="sheet">' +
    '<section class="head">' +
      '<div class="head-top">' +
        '<div class="logo-box"><img src="' + logoSrc + '" alt="Correios"></div>' +
        '<div class="title-box"><div class="brand">AGF JOSÉ BONIFÁCIO</div><div class="rule"></div><div class="title">LISTA DE POSTAGEM</div></div>' +
        '<div class="meta">' +
          '<div class="row"><span class="lbl">Data Geração</span><span class="val">' + UI_ESCAPE_HTML_(dataGeracao) + '</span></div>' +
          '<div class="row"><span class="lbl">Nº Lista</span><span class="val">' + UI_ESCAPE_HTML_(numeroLista) + '</span></div>' +
          '<div class="row"><span class="lbl">Folha</span><span class="val">1</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="print-row">DATA IMPRESSÃO: ' + UI_ESCAPE_HTML_(dataImpressao) + '</div>' +
      '<div class="client-grid">' +
        '<div class="cell"><span class="label">Nome do Cliente</span><span class="value">' + UI_ESCAPE_HTML_(clienteNome) + '</span></div>' +
        '<div class="cell"><span class="label">CNPJ</span><span class="value">' + UI_ESCAPE_HTML_(fmtCnpjCpf(cnpj)) + '</span></div>' +
      '</div>' +
      '<div class="contract-grid">' +
        '<div class="cell"><span class="label">Nº do Contrato</span><span class="value">' + UI_ESCAPE_HTML_(contrato) + '</span></div>' +
        '<div class="cell"><span class="label">Nº Cartão de Postagem</span><span class="value">' + UI_ESCAPE_HTML_(cartao) + '</span></div>' +
        '<div class="cell barcode">' + barcodeSvg(cartao) + '</div>' +
      '</div>' +
    '</section>' +
    '<table><thead><tr><th class="c-idx">N.</th><th class="c-serv">Serviço</th><th class="c-obj">Nº do Objeto</th><th class="c-cep">CEP</th><th class="c-vd">VD (R$)</th><th class="c-adic">ADIC.</th><th class="c-vc">VC (R$)</th><th class="c-nf">N.F.</th><th class="c-dest">Destinatário</th><th class="c-cart">Cartão Post.</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
    '<div class="total-row"><div>TOTAL</div><div>' + String(orders.length) + '</div><div>' + UI_ESCAPE_HTML_(clienteNome) + '</div></div>' +
    '<div class="sign-grid">' +
      '<div class="sign-box"><div class="sign-line"></div><div class="sign-caption">CORREIOS — CARIMBO</div></div>' +
      '<div class="sign-box"><div class="sign-line"></div><div class="sign-caption">CONTRATANTE — ASSINATURA/NOME LEGÍVEL</div></div>' +
      '<div class="sign-box"><div class="sign-line"></div><div class="sign-caption">NÚMERO DO DOCUMENTO</div></div>' +
    '</div>' +
    '<div class="receipt">Declaro que recebi ' + String(orders.length) + ' objeto(s).</div>' +
    '<div class="footer-grid">' +
      '<div class="footer-box"><div class="footer-top">AGF José Bonifácio — Agência de Correios Franqueada</div><div class="footer-line"></div><div class="footer-caption">CORREIOS — ASSINATURA E MATRÍCULA COLETOR</div></div>' +
      '<div class="footer-box"><div class="footer-top" style="text-align:right">Gerado em ' + UI_ESCAPE_HTML_(dataGeracao) + '</div><div class="footer-line"></div><div class="footer-caption">CORREIOS — ASSINATURA E MATRÍCULA CONFERENTE</div></div>' +
    '</div>' +
    '</div></body></html>';
}

function UI_ESCAPE_HTML_(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function action_gerarPlpLote_(params) {
  var storeId = _sessionStoreId_(params);
  var orderIds = Array.isArray(params.orderIds) ? params.orderIds : [];
  var client = getClienteAppByIdCrm_(_sessionIdCrm_(params));
  var rows = orderIds.map(function(orderId) {
    var r = getOrderRowById_(orderId);
    if (!r || String(r.STORE_ID || '') !== storeId) return null;
    return {
      orderId: String(r.ORDER_ID || ''),
      orderNumber: String(r.ORDER_NUMBER || ''),
      codigoObjeto: String(r.POSTAGENS_CODIGO_OBJETO || ''),
      customerName: String(r.CUSTOMER_NAME || ''),
      shippingService: String(r.SHIPPING_SERVICE || ''),
      total: toNumber_(r.TOTAL),
      valorDeclarado: toNumber_(r.TOTAL),
      cep: String(r.ZIP || ''),
      docType: String(r.DOC_TYPE || ''),
      invoiceKey: String(r.INVOICE_KEY || '')
    };
  }).filter(Boolean);
  return {
    fileName: 'plp_lote_' + nowIso_().replace(/[:T]/g, '-').slice(0, 16) + '.html',
    html: buildPlpHtml_(rows, client),
    count: rows.length
  };
}

