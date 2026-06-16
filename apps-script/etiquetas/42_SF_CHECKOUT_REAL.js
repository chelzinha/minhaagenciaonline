/**
 * AGF SUPERFRETE — 42_SF_CHECKOUT_REAL.gs
 * Etapa 6: checkout real controlado + obtenção de PDF oficial.
 *
 * Segurança:
 * - Faz checkout apenas de pedido já criado no carrinho e salvo em SF_ETIQUETAS.
 * - Em PRODUCAO exige confirmação forte digitada pelo operador.
 * - Após sucesso, converte reserva em débito real na conta corrente do cliente.
 * - Registra consumo estimado da carteira SuperFrete AGF.
 * - Busca order/info e tag/print para capturar SRO/tracking e URL do PDF oficial.
 */

function action_sfAdminCheckoutRealOrder_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const cfg = sfGetSuperFreteRuntimeConfig_();
  const orderIdAgf = sanitize_(params.orderIdAgf || params.ORDER_ID_AGF);
  if (!orderIdAgf) throw new Error('ORDER_ID_AGF obrigatório para checkout.');

  sfValidateCheckoutEnvironmentGate_(cfg, params);

  return sfWithLock_(function () {
    const rows = sfReadObjects_(SF.SHEETS.ETIQUETAS);
    const row = rows.find(function (e) { return sanitize_(e.ORDER_ID_AGF) === orderIdAgf; });
    if (!row) throw new Error('Etiqueta não encontrada: ' + orderIdAgf);

    sfValidateCheckoutLocalRow_(row, cfg);

    const clienteId = sanitize_(row.CLIENTE_ID);
    const conta = sfGetContaByClienteId_(clienteId);
    if (!conta) throw new Error('Conta corrente do cliente não encontrada: ' + clienteId);

    const orderIdSuperFrete = sanitize_(row.ORDER_ID_SUPERFRETE);
    const checkoutPayload = { orders: [orderIdSuperFrete] };
    const checkoutResp = sfSuperFreteFetch_('POST', '/checkout', checkoutPayload);

    let orderInfo = null;
    let orderInfoError = '';
    try {
      orderInfo = sfSuperFreteFetch_('GET', '/order/info/' + encodeURIComponent(orderIdSuperFrete), null).json;
    } catch (e) {
      orderInfoError = e.message || String(e);
      sfLog_('WARN', 'SF_CHECKOUT_REAL', 'ORDER_INFO_AFTER_CHECKOUT_FAIL', {
        USUARIO_ID: user.USUARIO_ID,
        CLIENTE_ID: clienteId,
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: orderIdSuperFrete,
        ERRO: orderInfoError
      });
    }

    let printResp = null;
    let printError = '';
    try {
      printResp = sfSuperFreteFetch_('POST', '/tag/print', { orders: [orderIdSuperFrete] }).json;
    } catch (e) {
      printError = e.message || String(e);
      sfLog_('WARN', 'SF_CHECKOUT_REAL', 'PRINT_AFTER_CHECKOUT_FAIL', {
        USUARIO_ID: user.USUARIO_ID,
        CLIENTE_ID: clienteId,
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: orderIdSuperFrete,
        ERRO: printError
      });
    }

    const fallbackPayload = {
      SERVICO: row.SERVICO,
      VALOR_COTADO: sfToMoney_(row.VALOR_COTADO || row.VALOR_REAL_SUPERFRETE || row.VALOR_COBRADO_CLIENTE)
    };
    const orderData = sfNormalizeSuperFreteOrderData_(orderInfo || checkoutResp.json, fallbackPayload, orderIdSuperFrete);
    const valorFinal = sfToMoney_(orderData.price || row.VALOR_REAL_SUPERFRETE || row.VALOR_COBRADO_CLIENTE || row.VALOR_COTADO);
    if (valorFinal <= 0) throw new Error('Checkout concluído, mas não foi possível identificar o valor final da etiqueta. Verifique SF_LOGS antes de reconciliar.');

    const valorCotado = sfToMoney_(row.VALOR_COTADO);
    const valorReservado = sfToMoney_(row.VALOR_RESERVADO || valorFinal);
    const diferenca = sfToMoney_(valorFinal - valorCotado);
    const tracking = sanitize_(orderData.tracking || row.TRACKING);
    const pdfUrl = sfExtractPrintUrl_(printResp) || sanitize_(orderData.printUrl || row.PDF_OFICIAL_URL);
    const statusLogistico = sfMapSuperFreteStatusToLocal_(orderData.status || 'released');

    const contaAtualizada = sfConfirmarDebitoCheckoutNoLock_({
      CLIENTE_ID: clienteId,
      VALOR_FINAL: valorFinal,
      VALOR_RESERVADO: valorReservado,
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: orderIdSuperFrete,
      OPERADOR_ID: user.USUARIO_ID,
      ORIGEM: 'PAINEL_ADMIN'
    });

    const carteira = sfRegistrarConsumoCarteiraSuperFreteNoLock_({
      VALOR: valorFinal,
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: orderIdSuperFrete,
      OPERADOR_ID: user.USUARIO_ID,
      REFERENCIA: 'CHECKOUT_SUPERFRETE_' + cfg.ambiente,
      OBS: 'Consumo real/estimado após checkout SuperFrete. Confirmar com saldo na plataforma.'
    });

    const now = nowIso_();
    const responseJson = safeJsonStringify_({
      checkout: checkoutResp.json,
      orderInfoAfterCheckout: orderInfo,
      orderInfoError: orderInfoError,
      print: printResp,
      printError: printError
    });

    sfUpdateRowByHeaders_(SF.SHEETS.ETIQUETAS, row._row, {
      STATUS_LOGISTICO: statusLogistico,
      STATUS_FINANCEIRO: 'EM_ABERTO',
      TRACKING: tracking,
      VALOR_RESERVADO: 0,
      VALOR_REAL_SUPERFRETE: valorFinal,
      VALOR_COBRADO_CLIENTE: valorFinal,
      DIFERENCA_COTACAO: diferenca,
      PDF_OFICIAL_URL: pdfUrl,
      DCE_STATUS: 'CHECKOUT_REALIZADO',
      DACE_URL: pdfUrl,
      RESPONSE_SUPERFRETE_JSON: responseJson,
      EMITIDO_EM: now
    });

    sfUpsertDceCheckoutNoLock_({
      ORDER_ID_AGF: orderIdAgf,
      CLIENTE_ID: clienteId,
      DACE_URL: pdfUrl,
      RESPONSE_DCE_JSON: responseJson,
      EMITIDO_EM: now,
      OBS_VALIDACAO: tracking ? 'Checkout realizado. Tracking/SRO retornado: ' + tracking : 'Checkout realizado. Tracking/SRO ainda não retornado na consulta order/info.'
    });

    sfLog_('INFO', 'SF_CHECKOUT_REAL', 'CHECKOUT_OK', {
      USUARIO_ID: user.USUARIO_ID,
      CLIENTE_ID: clienteId,
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: orderIdSuperFrete,
      MENSAGEM: 'Checkout real SuperFrete concluído',
      AMBIENTE: cfg.ambiente,
      VALOR: valorFinal,
      TRACKING: tracking,
      PDF_OFICIAL_URL: pdfUrl
    });

    return {
      etiqueta: {
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: orderIdSuperFrete,
        STATUS_LOGISTICO: statusLogistico,
        STATUS_FINANCEIRO: 'EM_ABERTO',
        TRACKING: tracking,
        VALOR_COTADO: valorCotado,
        VALOR_REAL_SUPERFRETE: valorFinal,
        VALOR_COBRADO_CLIENTE: valorFinal,
        DIFERENCA_COTACAO: diferenca,
        PDF_OFICIAL_URL: pdfUrl,
        EMITIDO_EM: now
      },
      conta: contaAtualizada,
      carteira: carteira,
      checkout: checkoutResp.json,
      orderInfo: orderInfo,
      print: printResp,
      ambiente: cfg.ambiente,
      aviso: tracking ? '' : 'Checkout concluído, mas o tracking/SRO ainda não apareceu na resposta normalizada. Use Atualizar histórico/Informações do pedido em alguns minutos.'
    };
  });
}

function sfValidateCheckoutEnvironmentGate_(cfg, params) {
  if (!cfg || !cfg.ambiente) throw new Error('Configuração SuperFrete indisponível.');
  const confirmacao = sanitize_(params.confirmacaoCheckout || params.CONFIRMACAO_CHECKOUT);
  if (cfg.ambiente === 'PRODUCAO') {
    if (confirmacao !== 'CONFIRMAR_CHECKOUT_PRODUCAO') {
      throw new Error('Checkout em PRODUÇÃO bloqueado. Confirme explicitamente no painel. Esta ação consome saldo real SuperFrete e gera etiqueta válida para postagem.');
    }
  } else {
    if (confirmacao !== 'CONFIRMAR_CHECKOUT_SANDBOX') {
      throw new Error('Checkout Sandbox cancelado ou não confirmado.');
    }
  }
}

function sfValidateCheckoutLocalRow_(row, cfg) {
  const erros = [];
  const statusFin = upper_(row.STATUS_FINANCEIRO);
  const statusLog = upper_(row.STATUS_LOGISTICO);
  if (!sanitize_(row.ORDER_ID_SUPERFRETE)) erros.push('ORDER_ID_SUPERFRETE ausente. Crie o pedido real antes do checkout.');
  if (statusFin !== 'RESERVADA') erros.push('Checkout permitido apenas para etiquetas com financeiro RESERVADA. Status atual: ' + statusFin + '.');
  if (['PENDING_SUPERFRETE','PEDIDO_CRIADO_SUPERFRETE'].indexOf(statusLog) < 0) {
    erros.push('Checkout permitido apenas para pedido pendente SuperFrete. Status logístico atual: ' + statusLog + '.');
  }
  if (!sfGetSuperFreteRuntimeConfig_().token) erros.push('Token SuperFrete ' + cfg.ambiente + ' não configurado.');
  if (erros.length) throw new Error(erros.join(' '));
}

function sfConfirmarDebitoCheckoutNoLock_(args) {
  const clienteId = sanitize_(args.CLIENTE_ID);
  const conta = sfGetContaByClienteId_(clienteId);
  if (!conta) throw new Error('Conta corrente do cliente não encontrada: ' + clienteId);

  const valorFinal = sfToMoney_(args.VALOR_FINAL);
  const valorReservado = sfToMoney_(args.VALOR_RESERVADO);
  if (valorFinal <= 0) throw new Error('Valor final inválido para débito do checkout.');

  const saldoAntes = sfToMoney_(conta.SALDO_CONTA);
  const saldoDepois = sfToMoney_(saldoAntes - valorFinal);
  const reservadoAntes = sfToMoney_(conta.VALOR_RESERVADO);
  const reservadoDepois = Math.max(0, sfToMoney_(reservadoAntes - valorReservado));

  sfAppendByHeaders_(SF.SHEETS.LANC_CLIENTES, {
    LANCAMENTO_ID: uid_('SFLAN'),
    CLIENTE_ID: clienteId,
    TIPO: 'LIBERACAO_RESERVA_CHECKOUT',
    VALOR: valorReservado,
    SINAL: 'LIBERA',
    SALDO_ANTES: saldoAntes,
    SALDO_DEPOIS: saldoAntes,
    ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
    COBRANCA_ID: '',
    PAGAMENTO_ID: '',
    OPERADOR_ID: sanitize_(args.OPERADOR_ID),
    ORIGEM: sanitize_(args.ORIGEM),
    MOTIVO: 'Liberação da reserva após checkout SuperFrete. ID: ' + sanitize_(args.ORDER_ID_SUPERFRETE),
    CRIADO_EM: nowIso_()
  });

  sfAppendByHeaders_(SF.SHEETS.LANC_CLIENTES, {
    LANCAMENTO_ID: uid_('SFLAN'),
    CLIENTE_ID: clienteId,
    TIPO: 'DEBITO_ETIQUETA_CHECKOUT',
    VALOR: valorFinal,
    SINAL: '-',
    SALDO_ANTES: saldoAntes,
    SALDO_DEPOIS: saldoDepois,
    ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
    COBRANCA_ID: '',
    PAGAMENTO_ID: '',
    OPERADOR_ID: sanitize_(args.OPERADOR_ID),
    ORIGEM: sanitize_(args.ORIGEM),
    MOTIVO: 'Débito real da etiqueta após checkout SuperFrete. ID: ' + sanitize_(args.ORDER_ID_SUPERFRETE),
    CRIADO_EM: nowIso_()
  });

  return sfUpdateContaComputed_(clienteId, {
    SALDO_CONTA: saldoDepois,
    VALOR_RESERVADO: reservadoDepois
  });
}

function sfRegistrarConsumoCarteiraSuperFreteNoLock_(args) {
  const rows = sfReadObjects_(SF.SHEETS.CARTEIRA_SF);
  const last = rows.length ? rows[rows.length - 1] : null;
  const saldoAntes = last ? sfToMoney_(last.SALDO_DEPOIS) : 0;
  const valor = sfToMoney_(args.VALOR);
  const saldoDepois = sfToMoney_(saldoAntes - valor);

  sfAppendByHeaders_(SF.SHEETS.CARTEIRA_SF, {
    LANCAMENTO_ID: uid_('SFCAR'),
    TIPO: 'CONSUMO_ETIQUETA',
    VALOR: valor,
    SINAL: '-',
    SALDO_ANTES: saldoAntes,
    SALDO_DEPOIS: saldoDepois,
    ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
    ORDER_ID_SUPERFRETE: sanitize_(args.ORDER_ID_SUPERFRETE),
    OPERADOR_ID: sanitize_(args.OPERADOR_ID),
    REFERENCIA: sanitize_(args.REFERENCIA),
    OBS: sanitize_(args.OBS),
    CRIADO_EM: nowIso_()
  });

  return { saldoAntes: saldoAntes, saldoDepois: saldoDepois, valorConsumido: valor };
}

function sfUpsertDceCheckoutNoLock_(args) {
  const rows = sfReadObjects_(SF.SHEETS.DCE_DOCUMENTOS);
  const row = rows.find(function (r) { return sanitize_(r.ORDER_ID_AGF) === sanitize_(args.ORDER_ID_AGF); });
  const patch = {
    CLIENTE_ID: sanitize_(args.CLIENTE_ID),
    TIPO_DOCUMENTO: 'DCE_SUPERFRETE_CHECKOUT',
    DCE_STATUS: 'CHECKOUT_REALIZADO',
    DACE_URL: sanitize_(args.DACE_URL),
    DACE_PDF_URL: sanitize_(args.DACE_URL),
    EMITIDO_EM: sanitize_(args.EMITIDO_EM),
    RESPONSE_DCE_JSON: sanitize_(args.RESPONSE_DCE_JSON),
    OBS_VALIDACAO: sanitize_(args.OBS_VALIDACAO)
  };
  if (row) {
    sfUpdateRowByHeaders_(SF.SHEETS.DCE_DOCUMENTOS, row._row, patch);
  } else {
    sfAppendByHeaders_(SF.SHEETS.DCE_DOCUMENTOS, Object.assign({ ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF) }, patch));
  }
}

function sfExtractPrintUrl_(json) {
  if (!json) return '';
  const direct = sanitize_(deepFind_(json, 'url') || deepFind_(json, 'print.url') || deepFind_(json, 'data.url') || deepFind_(json, 'print_url'));
  if (direct) return direct;
  return sfFindFirstUrlRecursive_(json, true) || sfFindFirstUrlRecursive_(json, false) || '';
}

function sfFindFirstUrlRecursive_(obj, preferPdf) {
  if (obj == null) return '';
  if (typeof obj === 'string') {
    const s = sanitize_(obj);
    if (/^https?:\/\//i.test(s) && (!preferPdf || /\.pdf(\?|$)/i.test(s))) return s;
    return '';
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const found = sfFindFirstUrlRecursive_(obj[i], preferPdf);
      if (found) return found;
    }
    return '';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    keys.sort(function (a, b) {
      const ap = /url|pdf|print/i.test(a) ? 0 : 1;
      const bp = /url|pdf|print/i.test(b) ? 0 : 1;
      return ap - bp;
    });
    for (let k = 0; k < keys.length; k++) {
      const found = sfFindFirstUrlRecursive_(obj[keys[k]], preferPdf);
      if (found) return found;
    }
  }
  return '';
}

function sfMapSuperFreteStatusToLocal_(status) {
  const s = lower_(status || '');
  if (s === 'released') return 'RELEASED_SUPERFRETE';
  if (s === 'posted') return 'POSTADA';
  if (s === 'delivered') return 'ENTREGUE';
  if (s === 'canceled' || s === 'cancelled') return 'CANCELADA_SUPERFRETE';
  if (s === 'pending') return 'PENDING_SUPERFRETE';
  return s ? upper_(s) + '_SUPERFRETE' : 'RELEASED_SUPERFRETE';
}

function action_sfAdminRefreshSuperFreteOrder_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const orderIdAgf = sanitize_(params.orderIdAgf || params.ORDER_ID_AGF);
  if (!orderIdAgf) throw new Error('ORDER_ID_AGF obrigatório para atualizar pedido.');

  return sfWithLock_(function () {
    const rows = sfReadObjects_(SF.SHEETS.ETIQUETAS);
    const row = rows.find(function (e) { return sanitize_(e.ORDER_ID_AGF) === orderIdAgf; });
    if (!row) throw new Error('Etiqueta não encontrada: ' + orderIdAgf);

    const orderIdSuperFrete = sanitize_(row.ORDER_ID_SUPERFRETE);
    if (!orderIdSuperFrete) throw new Error('ORDER_ID_SUPERFRETE ausente nesta etiqueta.');

    const orderInfo = sfSuperFreteFetch_('GET', '/order/info/' + encodeURIComponent(orderIdSuperFrete), null).json;
    let printResp = null;
    let printError = '';
    try {
      printResp = sfSuperFreteFetch_('POST', '/tag/print', { orders: [orderIdSuperFrete] }).json;
    } catch (e) {
      printError = e.message || String(e);
    }

    const fallbackPayload = {
      SERVICO: row.SERVICO,
      VALOR_COTADO: sfToMoney_(row.VALOR_COTADO || row.VALOR_REAL_SUPERFRETE || row.VALOR_COBRADO_CLIENTE)
    };
    const orderData = sfNormalizeSuperFreteOrderData_(orderInfo, fallbackPayload, orderIdSuperFrete);
    const valorFinal = sfToMoney_(orderData.price || row.VALOR_REAL_SUPERFRETE || row.VALOR_COBRADO_CLIENTE || row.VALOR_COTADO);
    const valorCotado = sfToMoney_(row.VALOR_COTADO);
    const tracking = sanitize_(orderData.tracking || row.TRACKING);
    const pdfUrl = sfExtractPrintUrl_(printResp) || sanitize_(orderData.printUrl || row.PDF_OFICIAL_URL);
    const statusLogistico = sfMapSuperFreteStatusToLocal_(orderData.status || row.STATUS_LOGISTICO);

    const patch = {
      STATUS_LOGISTICO: statusLogistico,
      TRACKING: tracking,
      PDF_OFICIAL_URL: pdfUrl,
      VALOR_REAL_SUPERFRETE: valorFinal,
      VALOR_COBRADO_CLIENTE: valorFinal,
      DIFERENCA_COTACAO: sfToMoney_(valorFinal - valorCotado),
      RESPONSE_SUPERFRETE_JSON: safeJsonStringify_({ orderInfoRefresh: orderInfo, print: printResp, printError: printError, refreshedAt: nowIso_() })
    };
    if (statusLogistico === 'RELEASED_SUPERFRETE' && upper_(row.STATUS_FINANCEIRO) === 'RESERVADA') {
      patch.STATUS_FINANCEIRO = 'EM_ABERTO';
    }
    sfUpdateRowByHeaders_(SF.SHEETS.ETIQUETAS, row._row, patch);

    sfLog_('INFO', 'SF_CHECKOUT_REAL', 'REFRESH_ORDER_INFO', {
      USUARIO_ID: user.USUARIO_ID,
      CLIENTE_ID: row.CLIENTE_ID,
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: orderIdSuperFrete,
      STATUS_LOGISTICO: statusLogistico,
      TRACKING: tracking
    });

    return {
      etiqueta: Object.assign({}, row, patch, {
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: orderIdSuperFrete
      }),
      orderInfo: orderInfo,
      print: printResp,
      aviso: tracking ? '' : 'Pedido atualizado, mas a SuperFrete ainda não retornou tracking/SRO neste momento.'
    };
  });
}
