const POSTAGENS_BRIDGE = Object.freeze({
  PROP: {
    WEBAPP_URL: 'POSTAGENS_WEBAPP_URL',
    CLIENTES_SPREADSHEET_ID: 'POSTAGENS_CLIENTES_SPREADSHEET_ID',
    CLIENTES_SHEET_NAME: 'POSTAGENS_CLIENTES_SHEET_NAME'
  }
});

function getPostagensBridgeConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    webappUrl: p.getProperty(POSTAGENS_BRIDGE.PROP.WEBAPP_URL) || '',
    clientesSpreadsheetId: p.getProperty(POSTAGENS_BRIDGE.PROP.CLIENTES_SPREADSHEET_ID) || '',
    clientesSheetName: p.getProperty(POSTAGENS_BRIDGE.PROP.CLIENTES_SHEET_NAME) || 'CLIENTES_APP'
  };
}

function bootstrapPostagensBridgeProperties_() {
  const p = PropertiesService.getScriptProperties();
  p.setProperties({
    [POSTAGENS_BRIDGE.PROP.WEBAPP_URL]: 'COLE_AQUI_A_URL_EXEC_DO_APP_ATUAL',
    [POSTAGENS_BRIDGE.PROP.CLIENTES_SPREADSHEET_ID]: '1_QJT-6JcOG6GAB-eiNNHTbeJbW3hV4yKyGLcZL3FT1Q',
    [POSTAGENS_BRIDGE.PROP.CLIENTES_SHEET_NAME]: 'CLIENTES_APP'
  }, false);
}

function runBootstrapPostagensBridgeProperties() {
  bootstrapPostagensBridgeProperties_();
}

function ensureSheetColumnsPreserveData_(sheetName, requiredHeaders) {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Aba não encontrada: ' + sheetName);

  const lastRow = Math.max(sh.getLastRow(), 1);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0] || [];

  const missing = requiredHeaders.filter(function(h) {
    return headers.indexOf(h) === -1;
  });
  if (!missing.length) return { sheetName: sheetName, added: [] };

  const newHeaders = headers.concat(missing);
  const rows = values.slice(1).map(function(r) {
    const row = r.slice();
    while (row.length < newHeaders.length) row.push('');
    return row;
  });

  sh.clearContents();
  sh.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, newHeaders.length).setValues(rows);
  }
  sh.setFrozenRows(1);

  return { sheetName: sheetName, added: missing };
}

function runEnsureBridgeColumns() {
  return {
    stores: ensureSheetColumnsPreserveData_(CFG.SHEETS.STORES, ['ID_CRM_REF']),
    orders: ensureSheetColumnsPreserveData_(CFG.SHEETS.ORDERS, [
      'POSTAGENS_STATUS',
      'POSTAGENS_ID_REGISTRO',
      'POSTAGENS_ID_PREPOSTAGEM',
      'POSTAGENS_CODIGO_OBJETO',
      'POSTAGENS_URL_PDF',
      'POSTAGENS_URL_DECLARACAO',
      'POSTAGENS_ERRO',
      'POSTAGENS_UPDATED_AT',
      'FULFILLMENT_ORDER_ID',
      'NUVEMSHOP_TRACKING_SYNC_STATUS',
      'NUVEMSHOP_TRACKING_SYNC_AT',
      'NUVEMSHOP_TRACKING_SYNC_ERROR'
    ])
  };
}

function getStoreRowByIdStrict_(storeId) {
  const row = getStoreById_(storeId);
  if (!row) throw new Error('Loja não encontrada na aba STORES: ' + storeId);
  return row;
}

function getStoreCrmRefByStoreId_(storeId) {
  const store = getStoreRowByIdStrict_(storeId);
  const idCrmRef = String(store.ID_CRM_REF || '').trim();
  if (!idCrmRef) throw new Error('Loja sem ID_CRM_REF preenchido na aba STORES.');
  return idCrmRef;
}

function loadClientesAppRows_() {
  const cfg = getPostagensBridgeConfig_();
  if (!cfg.clientesSpreadsheetId) throw new Error('POSTAGENS_CLIENTES_SPREADSHEET_ID não configurado.');

  const ss = SpreadsheetApp.openById(cfg.clientesSpreadsheetId);
  const sh = ss.getSheetByName(cfg.clientesSheetName);
  if (!sh) throw new Error('Aba não encontrada na planilha do app atual: ' + cfg.clientesSheetName);

  const values = sh.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0];

  return values.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function getClienteAppByIdCrm_(idCrm) {
  const rows = loadClientesAppRows_();
  const target = String(idCrm || '').trim();
  const row = rows.find(function(r) {
    return String(r.ID_CRM || '').trim() === target;
  });
  if (!row) throw new Error('ID_CRM não encontrado na planilha CLIENTES_APP: ' + target);
  return row;
}

function getPostagensCredentialsByStoreId_(storeId) {
  const idCrmRef = getStoreCrmRefByStoreId_(storeId);
  const cliente = getClienteAppByIdCrm_(idCrmRef);

  const login = String(cliente.LOGIN_APP || '').trim();
  const senha = String(cliente.SENHA_APP || '').trim();
  const statusTeste = String(cliente.STATUS_TESTE_CWS || '').trim().toUpperCase();

  if (!login || !senha) {
    throw new Error('Cliente sem LOGIN_APP/SENHA_APP na CLIENTES_APP. ID_CRM=' + idCrmRef);
  }
  if (statusTeste && statusTeste !== 'OK') {
    throw new Error('Cliente com STATUS_TESTE_CWS diferente de OK. ID_CRM=' + idCrmRef + ' STATUS=' + statusTeste);
  }

  return {
    idCrm: idCrmRef,
    login: login,
    senha: senha,
    statusTesteCws: statusTeste
  };
}

function callPostagensAppRaw_(body) {
  const cfg = getPostagensBridgeConfig_();
  if (!cfg.webappUrl) throw new Error('POSTAGENS_WEBAPP_URL não configurada.');

  const resp = UrlFetchApp.fetch(cfg.webappUrl, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const status = resp.getResponseCode();
  const text = resp.getContentText();

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error('Resposta inválida do app de Postagens. HTTP ' + status + ': ' + text);
  }

  if (status < 200 || status >= 300) throw new Error('HTTP ' + status + ' do app de Postagens: ' + text);
  if (!json || typeof json !== 'object') throw new Error('Resposta vazia do app de Postagens.');
  if (json.ok === false) {
    const err = new Error(json.error || 'Erro desconhecido no app de Postagens.');
    err.cwsCode = json.cwsCode || '';
    err.validationErrors = json.validationErrors || [];
    throw err;
  }

  return json.data;
}

function loginPostagensAppByStoreId_(storeId) {
  const creds = getPostagensCredentialsByStoreId_(storeId);
  const data = callPostagensAppRaw_({ action: 'login', login: creds.login, senha: creds.senha });
  if (!data || !data.sessionToken) throw new Error('Login no app de Postagens não retornou sessionToken.');
  return data.sessionToken;
}



function callPostagensActionWithSession_(sessionToken, action, params) {
  if (!sessionToken) throw new Error('sessionToken do app de Postagens não informado.');
  return callPostagensAppRaw_(Object.assign({ action: action, sessionToken: sessionToken }, params || {}));
}
function extractNfCompatFields_(connectorPayload) {
  const invoice = connectorPayload && connectorPayload.fiscal && connectorPayload.fiscal.invoice ? connectorPayload.fiscal.invoice : null;
  const rawList = invoice && Array.isArray(invoice.raw) ? invoice.raw : [];
  const first = rawList.length ? rawList[0] : {};

  const numero = String(first.numero || first.number || first.nf_number || '').trim();
  const serie = String(first.serie || first.series || first.nf_series || '').trim();
  const valor = Number(first.valor || first.value || first.total || 0);
  const chave = digitsOnly_((invoice && invoice.key) || first.key || first.chave || first.chaveNFe || '');

  if (numero && serie && valor > 0) {
    return {
      numeroNotaFiscal: numero,
      serieNotaFiscal: serie,
      valorNotaFiscal: money2_(valor),
      chaveNFe: chave
    };
  }

  return null;
}

function buildPostagensPayloadFromConnector_(connectorPayload, overrides) {
  const ov = overrides || {};
  const dest = connectorPayload.destinatario || {};
  const frete = connectorPayload.frete || {};
  const fiscal = connectorPayload.fiscal || {};
  const embalagem = connectorPayload.embalagem || {};
  const items = Array.isArray(connectorPayload.items) ? connectorPayload.items : [];

  const itensDeclaracao = items.map(function(item) {
    return {
      descricao: String(item.name || item.sku || 'Item'),
      quantidade: Math.max(1, Number(item.quantity || 1)),
      valor: money2_(item.unitPrice || item.totalPrice || 0)
    };
  });

  const nfCompat = fiscal.docType === 'NFE' ? extractNfCompatFields_(connectorPayload) : null;
  const tipoDocumento = nfCompat ? 'NF' : 'DC';

  const obs = [];
  obs.push('Pedido Nuvemshop #' + (connectorPayload.external.orderNumber || connectorPayload.external.orderId || ''));
  if (frete.optionCode) obs.push('Frete ' + frete.optionCode);
  if (fiscal.docType === 'NFE' && !nfCompat) {
    obs.push('NF no pedido sem numero/serie/valor completos; enviado como DC');
  }

  const valorDeclarado = ov.valorDeclarado != null
    ? money2_(ov.valorDeclarado)
    : (nfCompat ? money2_(nfCompat.valorNotaFiscal) : money2_(fiscal.declaration ? fiscal.declaration.totalValue : 0));

  const payload = {
    servico: ov.servico || frete.service || '',
    tipoObjeto: ov.tipoObjeto || embalagem.tipoObjeto || 'CAIXA',
    pesoG: ov.pesoG != null ? ov.pesoG : embalagem.pesoG,
    comprimentoCm: ov.comprimentoCm != null ? ov.comprimentoCm : embalagem.comprimentoCm,
    larguraCm: ov.larguraCm != null ? ov.larguraCm : embalagem.larguraCm,
    alturaCm: ov.alturaCm != null ? ov.alturaCm : embalagem.alturaCm,
    diametroCm: ov.diametroCm != null ? ov.diametroCm : embalagem.diametroCm,
    valorDeclarado: valorDeclarado,

    ar: ov.ar || 'NAO',
    maoPropria: ov.maoPropria || 'NAO',
    formatoRotulo: ov.formatoRotulo || 'PDF',
    tipoDocumento: tipoDocumento,
    objetosProibidos: 'NAO',
    objetoNaoProibidoConfirmado: 'S',

    destinatarioNome: String(dest.nome || ''),
    destinatarioCpfCnpj: String(dest.documento || ''),
    destinatarioCelular: String(dest.telefone || ''),
    destinatarioEmail: String(dest.email || ''),
    destinatarioCep: String(dest.cep || ''),
    destinatarioEndereco: String(dest.endereco || ''),
    destinatarioNumero: String(dest.numero || ''),
    destinatarioComplemento: String(dest.complemento || ''),
    destinatarioBairro: String(dest.bairro || ''),
    destinatarioCidade: String(dest.cidade || ''),
    destinatarioUf: String(dest.uf || ''),
    observacao: obs.join(' | '),

    itensDeclaracao: itensDeclaracao
  };

  if (nfCompat) {
    payload.numeroNotaFiscal = nfCompat.numeroNotaFiscal;
    payload.serieNotaFiscal = nfCompat.serieNotaFiscal;
    payload.valorNotaFiscal = nfCompat.valorNotaFiscal;
    payload.chaveNFe = nfCompat.chaveNFe;
  }

  return payload;
}

function updateOrderPostagensResult_(orderId, patch) {
  const current = getOrderRowById_(orderId);
  if (!current) throw new Error('Pedido não encontrado para update: ' + orderId);
  const merged = Object.assign({}, current, patch || {});
  upsertOrder_(merged);
}


function syncTrackingBackToNuvemshopByOrderId_(orderId, codigoObjeto, opts) {
  const row = getOrderRowById_(orderId);
  if (!row) throw new Error('Pedido não encontrado: ' + orderId);
  const storeId = String(row.STORE_ID || '');
  if (!storeId) throw new Error('Pedido sem STORE_ID para sincronizar rastreio.');
  const trackingUrl = buildCorreiosTrackingUrl_(codigoObjeto);
  const sync = syncOrderTrackingToNuvemshop_(storeId, orderId, codigoObjeto, trackingUrl, opts || {});
  upsertOrder_({
    STORE_ID: storeId,
    ORDER_ID: String(orderId),
    FULFILLMENT_ORDER_ID: String(sync.fulfillmentOrderId || ''),
    NUVEMSHOP_TRACKING_SYNC_STATUS: 'SINCRONIZADO',
    NUVEMSHOP_TRACKING_SYNC_AT: nowIso_(),
    NUVEMSHOP_TRACKING_SYNC_ERROR: ''
  });
  return sync;
}

function markTrackingSyncError_(orderId, message) {
  const row = getOrderRowById_(orderId);
  if (!row) return;
  upsertOrder_({
    STORE_ID: String(row.STORE_ID || ''),
    ORDER_ID: String(orderId),
    NUVEMSHOP_TRACKING_SYNC_STATUS: 'ERRO',
    NUVEMSHOP_TRACKING_SYNC_AT: nowIso_(),
    NUVEMSHOP_TRACKING_SYNC_ERROR: String(message || '')
  });
}

function sendOrderToPostagensByOrderId_(orderId, overrides, sessionTokenOpt) {
  const connectorPayload = buildConnectorPayloadByOrderId_(orderId, overrides || {});
  const appPayload = buildPostagensPayloadFromConnector_(connectorPayload, overrides || {});
  const storeId = connectorPayload.external.storeId;
  const creds = getPostagensCredentialsByStoreId_(storeId);

  if (!appPayload.servico) throw new Error('Pedido sem serviço de frete mapeado (PAC/SEDEX).');
  if (!appPayload.destinatarioNome || !appPayload.destinatarioCep || !appPayload.destinatarioEndereco ||
      !appPayload.destinatarioNumero || !appPayload.destinatarioBairro ||
      !appPayload.destinatarioCidade || !appPayload.destinatarioUf) {
    throw new Error('Destinatário incompleto para envio ao app de Postagens.');
  }

  updateOrderPostagensResult_(orderId, {
    POSTAGENS_STATUS: 'PROCESSANDO',
    POSTAGENS_ERRO: '',
    POSTAGENS_UPDATED_AT: nowIso_()
  });

  appendLog_('INFO', 'postagens.bridge.start', storeId, orderId, 'Enviando payload ao app de Postagens', {
    idCrm: creds.idCrm,
    servico: appPayload.servico,
    tipoDocumento: appPayload.tipoDocumento
  });

  try {
    const sessionToken = sessionTokenOpt || loginPostagensAppByStoreId_(storeId);
    const result = callPostagensActionWithSession_(sessionToken, 'criarEtiqueta', { payload: appPayload });

    updateOrderPostagensResult_(orderId, {
      POSTAGENS_STATUS: 'CONCLUIDO',
      POSTAGENS_ID_REGISTRO: String(result.idRegistro || ''),
      POSTAGENS_ID_PREPOSTAGEM: String(result.idPrePostagem || ''),
      POSTAGENS_CODIGO_OBJETO: String(result.codigoObjeto || ''),
      POSTAGENS_URL_PDF: String(result.driveUrl || ''),
      POSTAGENS_URL_DECLARACAO: String((result.declaracao && result.declaracao.driveUrl) || ''),
      POSTAGENS_ERRO: '',
      POSTAGENS_UPDATED_AT: nowIso_()
    });

    var trackingSync = null;
    if (result && result.codigoObjeto) {
      try {
        trackingSync = syncTrackingBackToNuvemshopByOrderId_(orderId, String(result.codigoObjeto || ''), {
          status: 'DISPATCHED',
          notifyCustomer: true
        });
      } catch (trackingErr) {
        markTrackingSyncError_(orderId, trackingErr.message || String(trackingErr));
        appendLog_('ERROR', 'postagens.bridge.trackingSync', storeId, orderId, trackingErr.message || String(trackingErr), {});
      }
    }

    appendLog_('INFO', 'postagens.bridge.done', storeId, orderId, 'Etiqueta criada no app atual', {
      idCrm: creds.idCrm,
      idRegistro: result.idRegistro || '',
      idPrePostagem: result.idPrePostagem || '',
      codigoObjeto: result.codigoObjeto || '',
      trackingSyncStatus: trackingSync ? 'SINCRONIZADO' : 'PENDENTE'
    });

    return {
      ok: true,
      orderId: String(orderId),
      storeId: String(storeId),
      idCrm: creds.idCrm,
      sentPayload: appPayload,
      connectorPayload: connectorPayload,
      result: result,
      trackingSync: trackingSync
    };
  } catch (err) {
    updateOrderPostagensResult_(orderId, {
      POSTAGENS_STATUS: 'ERRO',
      POSTAGENS_ERRO: String(err.message || err),
      POSTAGENS_UPDATED_AT: nowIso_()
    });

    appendLog_('ERROR', 'postagens.bridge.error', storeId, orderId, err.message || String(err), {
      idCrm: creds.idCrm,
      cwsCode: err.cwsCode || '',
      validationErrors: err.validationErrors || []
    });

    throw err;
  }
}

function sendLatestOrderToPostagens_() {
  const latest = getLatestOrderRow_();
  if (!latest) throw new Error('Nenhum pedido encontrado na aba ORDERS.');
  return sendOrderToPostagensByOrderId_(latest.ORDER_ID);
}

function runDebugResolveClienteAppLatestOrder() {
  const latest = getLatestOrderRow_();
  if (!latest) throw new Error('Nenhum pedido encontrado na aba ORDERS.');

  const connectorPayload = buildConnectorPayloadByOrderId_(latest.ORDER_ID);
  const storeId = connectorPayload.external.storeId;
  const idCrmRef = getStoreCrmRefByStoreId_(storeId);
  const cliente = getClienteAppByIdCrm_(idCrmRef);

  return {
    storeId: storeId,
    idCrmRef: idCrmRef,
    loginApp: String(cliente.LOGIN_APP || ''),
    statusTesteCws: String(cliente.STATUS_TESTE_CWS || '')
  };
}

function runDebugBuildPostagensPayloadLatestOrder() {
  const latest = getLatestOrderRow_();
  if (!latest) throw new Error('Nenhum pedido encontrado na aba ORDERS.');

  const connectorPayload = buildConnectorPayloadByOrderId_(latest.ORDER_ID);
  const appPayload = buildPostagensPayloadFromConnector_(connectorPayload);

  Logger.log(JSON.stringify(appPayload, null, 2));
  return appPayload;
}

function runSendLatestOrderToPostagens() {
  return sendLatestOrderToPostagens_();
}




function cancelOrderInPostagensByOrderId_(orderId, sessionTokenOpt) {
  const orderRow = getOrderRowById_(orderId);
  if (!orderRow) throw new Error('Pedido não encontrado: ' + orderId);
  if (!orderRow.POSTAGENS_ID_REGISTRO) throw new Error('Pedido sem POSTAGENS_ID_REGISTRO.');

  const sessionToken = sessionTokenOpt || loginPostagensAppByStoreId_(orderRow.STORE_ID);
  const result = callPostagensActionWithSession_(sessionToken, 'cancelarEtiqueta', {
    idRegistro: String(orderRow.POSTAGENS_ID_REGISTRO)
  });

  updateOrderPostagensResult_(orderId, {
    POSTAGENS_STATUS: 'CANCELADO',
    POSTAGENS_ERRO: '',
    POSTAGENS_UPDATED_AT: nowIso_()
  });

  appendLog_('INFO', 'postagens.bridge.cancel', orderRow.STORE_ID, orderId, 'Etiqueta cancelada no app atual', {
    idRegistro: String(orderRow.POSTAGENS_ID_REGISTRO),
    idPrePostagem: String(orderRow.POSTAGENS_ID_PREPOSTAGEM || '')
  });

  return {
    ok: true,
    orderId: String(orderId),
    result: result
  };
}

function callPostagensActionByStoreId_(storeId, action, params) {
  const sessionToken = loginPostagensAppByStoreId_(storeId);
  return callPostagensActionWithSession_(sessionToken, action, params);
}

function reprintOrderFromPostagensByOrderId_(orderId, sessionTokenOpt) {
  const orderRow = getOrderRowById_(orderId);
  if (!orderRow) throw new Error('Pedido não encontrado: ' + orderId);
  if (!orderRow.POSTAGENS_ID_REGISTRO) throw new Error('Pedido sem POSTAGENS_ID_REGISTRO.');
  if (sessionTokenOpt) {
    return callPostagensActionWithSession_(sessionTokenOpt, 'reimprimirEtiqueta', {
      idRegistro: String(orderRow.POSTAGENS_ID_REGISTRO)
    });
  }
  return callPostagensActionByStoreId_(orderRow.STORE_ID, 'reimprimirEtiqueta', {
    idRegistro: String(orderRow.POSTAGENS_ID_REGISTRO)
  });
}


function action_syncTrackingPedido_(orderId) {
  const row = getOrderRowById_(orderId);
  if (!row) throw new Error('Pedido não encontrado: ' + orderId);
  if (!row.POSTAGENS_CODIGO_OBJETO) throw new Error('Pedido sem código de rastreio para sincronizar.');
  return syncTrackingBackToNuvemshopByOrderId_(orderId, String(row.POSTAGENS_CODIGO_OBJETO || ''), {
    status: 'DISPATCHED',
    notifyCustomer: true
  });
}

function runSyncTrackingLatestOrderToNuvemshop() {
  const latest = getLatestOrderRow_();
  if (!latest) throw new Error('Nenhum pedido encontrado na aba ORDERS.');
  if (!latest.POSTAGENS_CODIGO_OBJETO) throw new Error('Pedido mais recente sem código de rastreio.');
  return syncTrackingBackToNuvemshopByOrderId_(latest.ORDER_ID, String(latest.POSTAGENS_CODIGO_OBJETO || ''), {
    status: 'DISPATCHED',
    notifyCustomer: true
  });
}
