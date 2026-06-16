/**
 * AGF SUPERFRETE — 46_SF_CLIENT_PORTAL.gs
 * Portal do cliente: cotação, emissão real, histórico e financeiro.
 *
 * Regras de segurança:
 * - Cliente só acessa CLIENTE_ID da própria sessão.
 * - Remetente é sempre escolhido dentro do cadastro do próprio cliente.
 * - Emissão real faz /cart + /checkout na SuperFrete em uma única operação,
 *   com reserva de limite interno antes e débito real após checkout.
 * - PDF oficial permanece como documento logístico principal.
 */

function action_sfClientDashboard_(params) {
  const user = sfRequireClient_(params.sessionToken);
  return sfBuildClientPortalState_(user, { includeLists: true });
}

function action_sfClientEmissionBootstrap_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const clienteId = sanitize_(user.CLIENTE_ID);
  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', clienteId) || {};
  const conta = sfGetContaByClienteId_(clienteId);
  const remetentes = sfGetClientRemetentes_(clienteId);
  const remetente = sfPickClientRemetente_(clienteId, params.remetenteId || params.REMETENTE_ID);
  const cfg = sfGetSuperFreteRuntimeConfig_();

  return {
    user: user,
    cliente: sfPublicClient_(cliente),
    conta: conta,
    remetente: remetente,
    remetentes: remetentes,
    ambienteSuperFrete: cfg.ambiente,
    tokenAtivoConfigurado: !!cfg.token,
    margemSeguranca: sfToMoney_(sfGetConfigValue_('MARGEM_SEGURANCA_COTACAO', SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO)),
    carteiraSuperFrete: sfGetCarteiraSuperFreteSnapshot_(),
    timestamp: nowIso_()
  };
}

function action_sfClientLookupCep_(params) {
  sfRequireClient_(params.sessionToken);
  return sfLookupCep_(params.cep || params.CEP);
}

function action_sfClientQuoteSuperFrete_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const clienteId = sanitize_(user.CLIENTE_ID);
  const remetente = sfPickClientRemetente_(clienteId, params.remetenteId || params.REMETENTE_ID);

  const safeParams = Object.assign({}, params || {}, {
    clienteId: clienteId,
    CLIENTE_ID: clienteId,
    remetenteId: remetente.REMETENTE_ID,
    REMETENTE_ID: remetente.REMETENTE_ID
  });

  const normalized = sfNormalizeSuperFreteQuotePayload_(safeParams);
  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', clienteId);
  const conta = sfGetContaByClienteId_(clienteId);

  sfValidateSuperFreteQuote_(normalized, cliente, remetente, conta);

  const requestPayload = sfBuildSuperFreteCalculatorPayload_(normalized, remetente);
  const apiResp = sfSuperFreteFetch_('POST', '/calculator', requestPayload);
  const normalizedQuotes = sfNormalizeSuperFreteQuotes_(apiResp.json);

  sfLog_('INFO', 'SF_CLIENT_PORTAL', 'QUOTE', {
    USUARIO_ID: user.USUARIO_ID,
    CLIENTE_ID: clienteId,
    MENSAGEM: 'Cliente realizou cotação SuperFrete',
    HTTP_STATUS: apiResp.httpStatus,
    QTD_OPCOES: normalizedQuotes.length
  });

  return {
    request: requestPayload,
    response: apiResp.json,
    quotes: normalizedQuotes,
    httpStatus: apiResp.httpStatus,
    ambiente: sfGetSuperFreteRuntimeConfig_().ambiente,
    conta: sfGetContaByClienteId_(clienteId),
    remetente: remetente,
    timestamp: nowIso_()
  };
}

function action_sfClientCreateAndCheckoutLabel_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const cfg = sfGetSuperFreteRuntimeConfig_();
  const confirmacao = sanitize_(params.confirmacaoCliente || params.CONFIRMACAO_CLIENTE);
  if (confirmacao !== 'EMITIR_ETIQUETA') {
    throw new Error('Confirme a emissão da etiqueta antes de continuar.');
  }

  return sfWithLock_(function () {
    const clienteId = sanitize_(user.CLIENTE_ID);
    const remetente = sfPickClientRemetente_(clienteId, params.remetenteId || params.REMETENTE_ID);
    const safeParams = Object.assign({}, params || {}, {
      clienteId: clienteId,
      CLIENTE_ID: clienteId,
      remetenteId: remetente.REMETENTE_ID,
      REMETENTE_ID: remetente.REMETENTE_ID
    });

    const payload = sfNormalizeSimulatedEmissionPayload_(safeParams);
    const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', clienteId);
    const conta = sfGetContaByClienteId_(clienteId);

    sfValidateRealCartOrder_(payload, cliente, remetente, conta);

    const dcePayload = {
      remetente: {
        nome: sanitize_(remetente.NOME_REMETENTE),
        documento: sanitize_(remetente.CNPJ_CPF)
      },
      destinatario: {
        nome: payload.DESTINATARIO.NOME,
        documento: payload.DESTINATARIO.DOCUMENTO
      },
      itens: payload.ITENS
    };
    const dceValidation = sfValidateDeclaracaoConteudo_(dcePayload);
    if (!dceValidation.ok) {
      const err = new Error('Corrija a declaração de conteúdo antes de emitir.');
      err.validationErrors = dceValidation.erros;
      throw err;
    }

    const margem = sfToMoney_(sfGetConfigValue_('MARGEM_SEGURANCA_COTACAO', SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO));
    const valorReserva = sfToMoney_(payload.VALOR_COTADO + margem);
    const disponivelAntes = sfComputeDisponivel_(conta);
    if (disponivelAntes < valorReserva) {
      throw new Error('Limite insuficiente. Disponível: R$ ' + disponivelAntes + '. Necessário: R$ ' + valorReserva + '.');
    }

    const orderIdAgf = uid_('SFAGF');
    const now = nowIso_();
    let reserva = null;
    let etiquetaRow = null;
    let superfreteOrderId = '';
    let checkoutSucceeded = false;

    try {
      reserva = sfReservarClienteNoLock_({
        CLIENTE_ID: clienteId,
        VALOR: valorReserva,
        ORDER_ID_AGF: orderIdAgf,
        OPERADOR_ID: user.USUARIO_ID,
        ORIGEM: 'PORTAL_CLIENTE',
        MOTIVO: 'Reserva de limite para emissão pelo portal do cliente.'
      });

      const cartPayload = sfBuildSuperFreteCartPayload_(payload, remetente, orderIdAgf);
      // URL/plataforma ajustadas para o portal cliente.
      cartPayload.url = 'https://minhaagenciaonline.com.br/superfrete';
      cartPayload.platform = 'AGF SuperFrete Cliente';

      const cartResp = sfSuperFreteFetch_('POST', '/cart', cartPayload);
      superfreteOrderId = sfExtractSuperFreteOrderId_(cartResp.json);
      if (!superfreteOrderId) {
        throw new Error('A SuperFrete respondeu ao /cart, mas não foi possível identificar o ID do pedido.');
      }

      let orderInfoPending = null;
      let orderInfoPendingError = '';
      try {
        orderInfoPending = sfSuperFreteFetch_('GET', '/order/info/' + encodeURIComponent(superfreteOrderId), null).json;
      } catch (e1) {
        orderInfoPendingError = e1.message || String(e1);
      }

      const pendingData = sfNormalizeSuperFreteOrderData_(orderInfoPending || cartResp.json, payload, superfreteOrderId);
      const valorPrevio = pendingData.price > 0 ? pendingData.price : payload.VALOR_COTADO;
      if (disponivelAntes < valorPrevio) {
        throw new Error('Pedido criado no carrinho, mas o valor retornado excedeu o limite disponível. A emissão não será finalizada.');
      }

      const itensNorm = sfNormalizeDeclaracaoItens_(payload.ITENS);
      const serviceName = sfServiceNameFromCode_(pendingData.serviceId || sfServiceToCode_(payload.SERVICO));

      etiquetaRow = sfAppendByHeaders_(SF.SHEETS.ETIQUETAS, {
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: superfreteOrderId,
        CLIENTE_ID: clienteId,
        REMETENTE_ID: remetente.REMETENTE_ID,
        OPERADOR_ID: user.USUARIO_ID,
        ORIGEM_EMISSAO: 'PORTAL_CLIENTE',
        STATUS_LOGISTICO: 'PENDING_SUPERFRETE',
        STATUS_FINANCEIRO: 'RESERVADA',
        SERVICO: serviceName,
        TRANSPORTADORA: pendingData.carrier || 'SUPERFRETE',
        TRACKING: pendingData.tracking || '',
        VALOR_COTADO: payload.VALOR_COTADO,
        VALOR_RESERVADO: valorReserva,
        VALOR_REAL_SUPERFRETE: valorPrevio,
        VALOR_COBRADO_CLIENTE: valorPrevio,
        DIFERENCA_COTACAO: sfToMoney_(valorPrevio - payload.VALOR_COTADO),
        COBRANCA_ID: '',
        PDF_OFICIAL_URL: pendingData.printUrl || '',
        PDF_AGF_URL: '',
        DCE_STATUS: 'ENVIADA_SUPERFRETE_PENDING',
        DCE_CHAVE_ACESSO: '',
        DACE_URL: '',
        DESTINATARIO_NOME: payload.DESTINATARIO.NOME,
        DESTINATARIO_DOCUMENTO: payload.DESTINATARIO.DOCUMENTO,
        DESTINATARIO_CEP: payload.DESTINATARIO.CEP,
        DESTINATARIO_ENDERECO: payload.DESTINATARIO.ENDERECO,
        DESTINATARIO_NUMERO: payload.DESTINATARIO.NUMERO,
        DESTINATARIO_COMPLEMENTO: payload.DESTINATARIO.COMPLEMENTO,
        DESTINATARIO_BAIRRO: payload.DESTINATARIO.BAIRRO,
        DESTINATARIO_CIDADE: payload.DESTINATARIO.CIDADE,
        DESTINATARIO_UF: payload.DESTINATARIO.UF,
        PESO: pendingData.weightG || payload.PACOTE.PESO_G,
        ALTURA: pendingData.height || payload.PACOTE.ALTURA,
        LARGURA: pendingData.width || payload.PACOTE.LARGURA,
        COMPRIMENTO: pendingData.length || payload.PACOTE.COMPRIMENTO,
        PAYLOAD_COTACAO_JSON: safeJsonStringify_({ modo: 'CLIENT_PORTAL_' + cfg.ambiente, ambiente: cfg.ambiente, valorCotado: payload.VALOR_COTADO, valorApi: valorPrevio }),
        PAYLOAD_PEDIDO_JSON: safeJsonStringify_(cartPayload),
        RESPONSE_SUPERFRETE_JSON: safeJsonStringify_({ cart: cartResp.json, orderInfoPending: orderInfoPending, orderInfoPendingError: orderInfoPendingError }),
        CRIADO_EM: now,
        EMITIDO_EM: '',
        CANCELADO_EM: ''
      });

      itensNorm.forEach(function (item) {
        sfAppendByHeaders_(SF.SHEETS.DECLARACAO_ITENS, Object.assign({ ORDER_ID_AGF: orderIdAgf }, item));
      });

      sfAppendByHeaders_(SF.SHEETS.DCE_DOCUMENTOS, {
        ORDER_ID_AGF: orderIdAgf,
        CLIENTE_ID: clienteId,
        TIPO_DOCUMENTO: 'DCE_SUPERFRETE_CLIENTE_PENDING',
        DCE_STATUS: 'ENVIADA_NO_PEDIDO_PENDING',
        DCE_CHAVE_ACESSO: '',
        DACE_URL: '',
        DACE_QR_CODE: '',
        DACE_PDF_URL: '',
        EMITIDO_EM: now,
        PAYLOAD_DCE_JSON: safeJsonStringify_(dcePayload),
        RESPONSE_DCE_JSON: safeJsonStringify_({ cart: cartResp.json, orderInfoPending: orderInfoPending }),
        OBS_VALIDACAO: 'Pedido criado pelo portal do cliente e pendente de checkout automático.'
      });

      const checkoutResp = sfSuperFreteFetch_('POST', '/checkout', { orders: [superfreteOrderId] });
      checkoutSucceeded = true;

      let orderInfo = null;
      let orderInfoError = '';
      try {
        orderInfo = sfSuperFreteFetch_('GET', '/order/info/' + encodeURIComponent(superfreteOrderId), null).json;
      } catch (e2) {
        orderInfoError = e2.message || String(e2);
      }

      let printResp = null;
      let printError = '';
      try {
        printResp = sfSuperFreteFetch_('POST', '/tag/print', { orders: [superfreteOrderId] }).json;
      } catch (e3) {
        printError = e3.message || String(e3);
      }

      const orderData = sfNormalizeSuperFreteOrderData_(orderInfo || checkoutResp.json, payload, superfreteOrderId);
      const valorFinal = sfToMoney_(orderData.price || valorPrevio || payload.VALOR_COTADO);
      if (valorFinal <= 0) throw new Error('Checkout concluído, mas não foi possível identificar o valor final da etiqueta.');

      const tracking = sanitize_(orderData.tracking || '');
      const pdfUrl = sfExtractPrintUrl_(printResp) || sanitize_(orderData.printUrl || '');
      const statusLogistico = sfMapSuperFreteStatusToLocal_(orderData.status || 'released');
      const emittedAt = nowIso_();
      const responseJson = safeJsonStringify_({
        cart: cartResp.json,
        orderInfoPending: orderInfoPending,
        checkout: checkoutResp.json,
        orderInfoAfterCheckout: orderInfo,
        orderInfoError: orderInfoError,
        print: printResp,
        printError: printError
      });

      const contaAtualizada = sfConfirmarDebitoCheckoutNoLock_({
        CLIENTE_ID: clienteId,
        VALOR_FINAL: valorFinal,
        VALOR_RESERVADO: valorReserva,
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: superfreteOrderId,
        OPERADOR_ID: user.USUARIO_ID,
        ORIGEM: 'PORTAL_CLIENTE'
      });

      const carteira = sfRegistrarConsumoCarteiraSuperFreteNoLock_({
        VALOR: valorFinal,
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: superfreteOrderId,
        OPERADOR_ID: user.USUARIO_ID,
        REFERENCIA: 'CHECKOUT_SUPERFRETE_CLIENTE_' + cfg.ambiente,
        OBS: 'Consumo real/estimado após checkout pelo portal do cliente.'
      });

      sfUpdateRowByHeaders_(SF.SHEETS.ETIQUETAS, etiquetaRow, {
        STATUS_LOGISTICO: statusLogistico,
        STATUS_FINANCEIRO: 'EM_ABERTO',
        TRACKING: tracking,
        VALOR_RESERVADO: 0,
        VALOR_REAL_SUPERFRETE: valorFinal,
        VALOR_COBRADO_CLIENTE: valorFinal,
        DIFERENCA_COTACAO: sfToMoney_(valorFinal - payload.VALOR_COTADO),
        PDF_OFICIAL_URL: pdfUrl,
        DCE_STATUS: 'CHECKOUT_REALIZADO',
        DACE_URL: pdfUrl,
        RESPONSE_SUPERFRETE_JSON: responseJson,
        EMITIDO_EM: emittedAt
      });

      sfUpsertDceCheckoutNoLock_({
        ORDER_ID_AGF: orderIdAgf,
        CLIENTE_ID: clienteId,
        DACE_URL: pdfUrl,
        RESPONSE_DCE_JSON: responseJson,
        EMITIDO_EM: emittedAt,
        OBS_VALIDACAO: tracking ? 'Checkout realizado pelo cliente. Tracking/SRO: ' + tracking : 'Checkout realizado pelo cliente. Tracking/SRO ainda não retornou.'
      });

      sfLog_('INFO', 'SF_CLIENT_PORTAL', 'CREATE_AND_CHECKOUT_OK', {
        USUARIO_ID: user.USUARIO_ID,
        CLIENTE_ID: clienteId,
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: superfreteOrderId,
        MENSAGEM: 'Cliente emitiu etiqueta pelo portal',
        AMBIENTE: cfg.ambiente,
        VALOR: valorFinal,
        TRACKING: tracking
      });

      return {
        etiqueta: {
          ORDER_ID_AGF: orderIdAgf,
          ORDER_ID_SUPERFRETE: superfreteOrderId,
          STATUS_LOGISTICO: statusLogistico,
          STATUS_FINANCEIRO: 'EM_ABERTO',
          SERVICO: serviceName,
          TRACKING: tracking,
          VALOR_COTADO: payload.VALOR_COTADO,
          VALOR_REAL_SUPERFRETE: valorFinal,
          VALOR_COBRADO_CLIENTE: valorFinal,
          DIFERENCA_COTACAO: sfToMoney_(valorFinal - payload.VALOR_COTADO),
          PDF_OFICIAL_URL: pdfUrl,
          EMITIDO_EM: emittedAt
        },
        conta: contaAtualizada,
        carteira: carteira,
        ambiente: cfg.ambiente,
        aviso: tracking ? '' : 'Etiqueta emitida, mas o SRO ainda não apareceu na resposta. Atualize o histórico em alguns minutos.'
      };

    } catch (e) {
      // Se a reserva foi feita e a operação não chegou ao débito final, libera para não travar limite do cliente.
      try {
        if (reserva && !checkoutSucceeded) {
          sfReleaseReservaClienteNoLock_({
            CLIENTE_ID: clienteId,
            VALOR: valorReserva,
            ORDER_ID_AGF: orderIdAgf,
            OPERADOR_ID: user.USUARIO_ID,
            ORIGEM: 'PORTAL_CLIENTE',
            MOTIVO: 'Liberação automática por falha na emissão pelo portal cliente: ' + (e.message || e)
          });
        }
        if (etiquetaRow) {
          sfUpdateRowByHeaders_(SF.SHEETS.ETIQUETAS, etiquetaRow, {
            STATUS_LOGISTICO: 'ERRO_EMISSAO_CLIENTE',
            STATUS_FINANCEIRO: 'ERRO_RESERVA_LIBERADA',
            VALOR_RESERVADO: 0,
            RESPONSE_SUPERFRETE_JSON: safeJsonStringify_({ erro: e.message || String(e), superfreteOrderId: superfreteOrderId }),
            CANCELADO_EM: nowIso_()
          });
        }
      } catch (releaseErr) {
        sfLog_('ERRO', 'SF_CLIENT_PORTAL', 'RELEASE_AFTER_ERROR_FAIL', {
          USUARIO_ID: user.USUARIO_ID,
          CLIENTE_ID: clienteId,
          ORDER_ID_AGF: orderIdAgf,
          ERRO_ORIGINAL: e.message || String(e),
          ERRO_RELEASE: releaseErr.message || String(releaseErr)
        });
      }
      throw e;
    }
  });
}

function action_sfClientListLabels_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const limit = Math.min(Math.max(Number(params.limit || 100), 1), 200);
  const rows = sfReadObjects_(SF.SHEETS.ETIQUETAS)
    .filter(function (e) { return sanitize_(e.CLIENTE_ID) === sanitize_(user.CLIENTE_ID); })
    .slice(-limit)
    .reverse();
  return rows.map(sfPublicLabel_);
}

function action_sfClientFinancial_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const clienteId = sanitize_(user.CLIENTE_ID);
  const conta = sfGetContaByClienteId_(clienteId);
  const lancamentos = sfReadObjects_(SF.SHEETS.LANC_CLIENTES)
    .filter(function (l) { return sanitize_(l.CLIENTE_ID) === clienteId; })
    .slice(-100)
    .reverse()
    .map(function (l) {
      return {
        LANCAMENTO_ID: sanitize_(l.LANCAMENTO_ID),
        TIPO: sanitize_(l.TIPO),
        VALOR: sfToMoney_(l.VALOR),
        SINAL: sanitize_(l.SINAL),
        SALDO_ANTES: sfToMoney_(l.SALDO_ANTES),
        SALDO_DEPOIS: sfToMoney_(l.SALDO_DEPOIS),
        ORDER_ID_AGF: sanitize_(l.ORDER_ID_AGF),
        COBRANCA_ID: sanitize_(l.COBRANCA_ID),
        MOTIVO: sanitize_(l.MOTIVO),
        CRIADO_EM: sanitize_(l.CRIADO_EM)
      };
    });

  const cobrancas = sfReadObjects_(SF.SHEETS.COBRANCAS_PIX)
    .filter(function (c) { return sanitize_(c.CLIENTE_ID) === clienteId; })
    .slice(-80)
    .reverse()
    .map(function (c) {
      return {
        COBRANCA_ID: sanitize_(c.COBRANCA_ID),
        STATUS: sanitize_(c.STATUS),
        VALOR_TOTAL: sfToMoney_(c.VALOR_TOTAL),
        QTD_ETIQUETAS: sanitize_(c.QTD_ETIQUETAS),
        TIPO_COBRANCA: sanitize_(c.TIPO_COBRANCA),
        PROVEDOR: sanitize_(c.PROVEDOR),
        PIX_COPIA_COLA: sanitize_(c.PIX_COPIA_COLA),
        CHECKOUT_URL: sanitize_(c.CHECKOUT_URL),
        VENCIMENTO: sanitize_(c.VENCIMENTO),
        CRIADO_EM: sanitize_(c.CRIADO_EM),
        PAGO_EM: sanitize_(c.PAGO_EM)
      };
    });

  const pagamentos = sfReadObjects_(SF.SHEETS.PAGAMENTOS)
    .filter(function (p) { return sanitize_(p.CLIENTE_ID) === clienteId; })
    .slice(-80)
    .reverse()
    .map(function (p) {
      return {
        PAGAMENTO_ID: sanitize_(p.PAGAMENTO_ID),
        COBRANCA_ID: sanitize_(p.COBRANCA_ID),
        PROVEDOR: sanitize_(p.PROVEDOR),
        VALOR_ESPERADO: sfToMoney_(p.VALOR_ESPERADO),
        VALOR_PAGO: sfToMoney_(p.VALOR_PAGO),
        METODO: sanitize_(p.METODO),
        STATUS: sanitize_(p.STATUS),
        RECEIPT_URL: sanitize_(p.RECEIPT_URL),
        PAGO_EM: sanitize_(p.PAGO_EM),
        CRIADO_EM: sanitize_(p.CRIADO_EM)
      };
    });

  return {
    conta: conta,
    lancamentos: lancamentos,
    cobrancas: cobrancas,
    pagamentos: pagamentos,
    timestamp: nowIso_()
  };
}

function action_sfClientRefreshSuperFreteOrder_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const orderIdAgf = sanitize_(params.orderIdAgf || params.ORDER_ID_AGF);
  if (!orderIdAgf) throw new Error('ORDER_ID_AGF obrigatório para atualizar pedido.');

  return sfWithLock_(function () {
    const rows = sfReadObjects_(SF.SHEETS.ETIQUETAS);
    const row = rows.find(function (e) {
      return sanitize_(e.ORDER_ID_AGF) === orderIdAgf && sanitize_(e.CLIENTE_ID) === sanitize_(user.CLIENTE_ID);
    });
    if (!row) throw new Error('Etiqueta não encontrada para este cliente.');

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
      RESPONSE_SUPERFRETE_JSON: safeJsonStringify_({ orderInfoClientRefresh: orderInfo, print: printResp, printError: printError, refreshedAt: nowIso_() })
    };
    sfUpdateRowByHeaders_(SF.SHEETS.ETIQUETAS, row._row, patch);

    return {
      etiqueta: sfPublicLabel_(Object.assign({}, row, patch)),
      aviso: tracking ? '' : 'Pedido atualizado, mas a SuperFrete ainda não retornou tracking/SRO neste momento.'
    };
  });
}

function action_sfClientGetAgfLabelOverlayData_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const orderIdAgf = sanitize_(params.orderIdAgf || params.ORDER_ID_AGF);
  if (!orderIdAgf) throw new Error('ORDER_ID_AGF obrigatório para gerar etiqueta AGF.');

  const etiquetas = sfReadObjects_(SF.SHEETS.ETIQUETAS);
  const row = etiquetas.find(function (e) {
    return sanitize_(e.ORDER_ID_AGF) === orderIdAgf && sanitize_(e.CLIENTE_ID) === sanitize_(user.CLIENTE_ID);
  });
  if (!row) throw new Error('Etiqueta não encontrada para este cliente.');

  const pdfUrl = sanitize_(row.PDF_OFICIAL_URL);
  if (!pdfUrl) throw new Error('PDF oficial ainda não disponível. Atualize o histórico e tente novamente.');
  const tracking = sanitize_(row.TRACKING);
  if (!tracking) throw new Error('SRO/tracking ainda não disponível. Atualize o histórico antes de gerar a etiqueta AGF.');

  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', row.CLIENTE_ID) || {};
  const remetente = sfFindBy_(SF.SHEETS.REMETENTES, 'REMETENTE_ID', row.REMETENTE_ID) || {};
  const pdf = sfFetchOfficialPdfAsBase64_(pdfUrl, orderIdAgf);

  return {
    geradoEm: nowIso_(),
    operadorId: user.USUARIO_ID,
    modo: 'PDF_OFICIAL_OVERLAY_LOGO_CLIENTE',
    aviso: 'Etiqueta AGF gerada por overlay sobre o PDF oficial. O PDF oficial original permanece como fallback.',
    etiqueta: {
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: sanitize_(row.ORDER_ID_SUPERFRETE),
      STATUS_LOGISTICO: sanitize_(row.STATUS_LOGISTICO),
      STATUS_FINANCEIRO: sanitize_(row.STATUS_FINANCEIRO),
      SERVICO: sanitize_(row.SERVICO),
      TRANSPORTADORA: sanitize_(row.TRANSPORTADORA || 'Correios'),
      TRACKING: tracking,
      PDF_OFICIAL_URL: pdfUrl,
      DACE_URL: sanitize_(row.DACE_URL),
      EMITIDO_EM: sanitize_(row.EMITIDO_EM)
    },
    cliente: {
      CLIENTE_ID: sanitize_(cliente.CLIENTE_ID),
      NOME_EXIBICAO: sanitize_(cliente.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(cliente.RAZAO_SOCIAL),
      DOCUMENTO: sanitize_(cliente.DOCUMENTO),
      LOGO_URL: sanitize_(cliente.LOGO_URL),
      LOGO_DRIVE_ID: sanitize_(cliente.LOGO_DRIVE_ID),
      LOGO_DATA_URL: sfBuildLogoDataUrl_(cliente.LOGO_DRIVE_ID)
    },
    remetente: {
      REMETENTE_ID: sanitize_(remetente.REMETENTE_ID),
      NOME_REMETENTE: sanitize_(remetente.NOME_REMETENTE || cliente.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(remetente.RAZAO_SOCIAL),
      CNPJ_CPF: sanitize_(remetente.CNPJ_CPF || cliente.DOCUMENTO)
    },
    pdf: pdf,
    overlay: {
      leftMm: 5.5,
      topMm: 6.0,
      widthMm: 29.0,
      heightMm: 23.5,
      logoPaddingMm: 2.0
    }
  };
}

// =====================================================================
// Helpers do Portal Cliente
// =====================================================================

function sfBuildClientPortalState_(user, options) {
  const clienteId = sanitize_(user.CLIENTE_ID);
  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', clienteId) || {};
  const conta = sfGetContaByClienteId_(clienteId);
  const remetentes = sfGetClientRemetentes_(clienteId);
  const remetente = sfPickClientRemetente_(clienteId);
  const labels = sfReadObjects_(SF.SHEETS.ETIQUETAS)
    .filter(function (e) { return sanitize_(e.CLIENTE_ID) === clienteId; })
    .slice(-20)
    .reverse()
    .map(sfPublicLabel_);
  return {
    user: user,
    cliente: sfPublicClient_(cliente),
    conta: conta,
    remetente: remetente,
    remetentes: remetentes,
    ultimasEtiquetas: labels,
    ambienteSuperFrete: sfGetSuperFreteRuntimeConfig_().ambiente,
    timestamp: nowIso_()
  };
}

function sfGetClientRemetentes_(clienteId) {
  return sfReadObjects_(SF.SHEETS.REMETENTES)
    .filter(function (r) { return sanitize_(r.CLIENTE_ID) === sanitize_(clienteId) && upper_(r.STATUS) === 'ATIVO'; })
    .map(sfPublicRemetente_);
}

function sfPickClientRemetente_(clienteId, remetenteId) {
  const list = sfGetClientRemetentes_(clienteId);
  if (!list.length) throw new Error('Nenhum remetente ativo cadastrado para este cliente. Fale com a agência.');
  const wanted = sanitize_(remetenteId);
  if (wanted) {
    const found = list.find(function (r) { return sanitize_(r.REMETENTE_ID) === wanted; });
    if (!found) throw new Error('Remetente não pertence ao cliente ou está inativo.');
    return found;
  }
  return list.find(function (r) { return upper_(r.PADRAO) === 'SIM'; }) || list[0];
}

function sfPublicClient_(cliente) {
  const out = {
    CLIENTE_ID: sanitize_(cliente.CLIENTE_ID),
    STATUS: sanitize_(cliente.STATUS),
    NOME_EXIBICAO: sanitize_(cliente.NOME_EXIBICAO),
    RAZAO_SOCIAL: sanitize_(cliente.RAZAO_SOCIAL),
    DOCUMENTO: sanitize_(cliente.DOCUMENTO),
    EMAIL: sanitize_(cliente.EMAIL),
    TELEFONE: sanitize_(cliente.TELEFONE),
    LOGO_URL: sanitize_(cliente.LOGO_URL),
    LOGO_DRIVE_ID: sanitize_(cliente.LOGO_DRIVE_ID)
  };
  if (out.LOGO_DRIVE_ID && typeof sfBuildLogoDataUrl_ === 'function') {
    out.LOGO_DATA_URL = sfBuildLogoDataUrl_(out.LOGO_DRIVE_ID);
  } else {
    out.LOGO_DATA_URL = '';
  }
  return out;
}

function sfPublicRemetente_(r) {
  return {
    REMETENTE_ID: sanitize_(r.REMETENTE_ID),
    CLIENTE_ID: sanitize_(r.CLIENTE_ID),
    STATUS: sanitize_(r.STATUS),
    NOME_REMETENTE: sanitize_(r.NOME_REMETENTE),
    RAZAO_SOCIAL: sanitize_(r.RAZAO_SOCIAL),
    CNPJ_CPF: sanitize_(r.CNPJ_CPF),
    EMAIL: sanitize_(r.EMAIL),
    TELEFONE: sanitize_(r.TELEFONE),
    CEP: sanitize_(r.CEP),
    ENDERECO: sanitize_(r.ENDERECO),
    NUMERO: sanitize_(r.NUMERO),
    COMPLEMENTO: sanitize_(r.COMPLEMENTO),
    BAIRRO: sanitize_(r.BAIRRO),
    CIDADE: sanitize_(r.CIDADE),
    UF: sanitize_(r.UF),
    PADRAO: sanitize_(r.PADRAO)
  };
}

function sfPublicLabel_(e) {
  return {
    ORDER_ID_AGF: sanitize_(e.ORDER_ID_AGF),
    ORDER_ID_SUPERFRETE: sanitize_(e.ORDER_ID_SUPERFRETE),
    CLIENTE_ID: sanitize_(e.CLIENTE_ID),
    REMETENTE_ID: sanitize_(e.REMETENTE_ID),
    ORIGEM_EMISSAO: sanitize_(e.ORIGEM_EMISSAO),
    STATUS_LOGISTICO: sanitize_(e.STATUS_LOGISTICO),
    STATUS_FINANCEIRO: sanitize_(e.STATUS_FINANCEIRO),
    SERVICO: sanitize_(e.SERVICO),
    TRANSPORTADORA: sanitize_(e.TRANSPORTADORA),
    TRACKING: sanitize_(e.TRACKING),
    VALOR_COTADO: sfToMoney_(e.VALOR_COTADO),
    VALOR_REAL_SUPERFRETE: sfToMoney_(e.VALOR_REAL_SUPERFRETE),
    VALOR_COBRADO_CLIENTE: sfToMoney_(e.VALOR_COBRADO_CLIENTE),
    DIFERENCA_COTACAO: sfToMoney_(e.DIFERENCA_COTACAO),
    PDF_OFICIAL_URL: sanitize_(e.PDF_OFICIAL_URL),
    PDF_AGF_URL: sanitize_(e.PDF_AGF_URL),
    DACE_URL: sanitize_(e.DACE_URL),
    DCE_STATUS: sanitize_(e.DCE_STATUS),
    DESTINATARIO_NOME: sanitize_(e.DESTINATARIO_NOME),
    DESTINATARIO_CEP: sanitize_(e.DESTINATARIO_CEP),
    DESTINATARIO_CIDADE: sanitize_(e.DESTINATARIO_CIDADE),
    DESTINATARIO_UF: sanitize_(e.DESTINATARIO_UF),
    PESO: sanitize_(e.PESO),
    CRIADO_EM: sanitize_(e.CRIADO_EM),
    EMITIDO_EM: sanitize_(e.EMITIDO_EM)
  };
}
