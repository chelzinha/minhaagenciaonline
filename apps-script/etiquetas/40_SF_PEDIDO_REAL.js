/**
 * AGF SUPERFRETE — 40_SF_PEDIDO_REAL.gs
 * Etapa 5 v4: criação real de pedido no carrinho SuperFrete em Sandbox ou Produção controlada.
 *
 * Segurança desta etapa:
 * - Chama apenas POST /api/v0/cart e GET /api/v0/order/info/{id}.
 * - NÃO chama /checkout.
 * - NÃO chama /tag/print.
 * - NÃO consome saldo real da carteira SuperFrete por este módulo.
 * - Em PRODUCAO exige confirmação explícita enviada pelo frontend.
 * - Reserva limite interno do cliente para proteger a próxima etapa.
 */

function action_sfAdminCreateRealCartOrder_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const cfg = sfGetSuperFreteRuntimeConfig_();
  sfValidateRealCartEnvironmentGate_(cfg, params);

  return sfWithLock_(function () {
    const payload = sfNormalizeSimulatedEmissionPayload_(params);
    const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', payload.CLIENTE_ID);
    const remetente = sfFindBy_(SF.SHEETS.REMETENTES, 'REMETENTE_ID', payload.REMETENTE_ID);
    const conta = sfGetContaByClienteId_(payload.CLIENTE_ID);

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
      const err = new Error('Corrija a declaração de conteúdo antes de enviar para a SuperFrete.');
      err.validationErrors = dceValidation.erros;
      throw err;
    }

    const orderIdAgf = uid_('SFAGF');
    const cartPayload = sfBuildSuperFreteCartPayload_(payload, remetente, orderIdAgf);
    const cartResp = sfSuperFreteFetch_('POST', '/cart', cartPayload);
    const superfreteOrderId = sfExtractSuperFreteOrderId_(cartResp.json);
    if (!superfreteOrderId) {
      sfLog_('ERRO', 'SF_PEDIDO_REAL', 'CART_WITHOUT_ID', {
        USUARIO_ID: user.USUARIO_ID,
        CLIENTE_ID: payload.CLIENTE_ID,
        MENSAGEM: 'SuperFrete criou/retornou resposta sem ID identificável',
        RESPONSE: cartResp.json
      });
      throw new Error('A SuperFrete respondeu ao /cart, mas não foi possível identificar o ID do pedido. Veja SF_LOGS.');
    }

    let orderInfo = null;
    let orderInfoError = '';
    try {
      orderInfo = sfSuperFreteFetch_('GET', '/order/info/' + encodeURIComponent(superfreteOrderId), null).json;
    } catch (e) {
      orderInfoError = e.message || String(e);
      sfLog_('WARN', 'SF_PEDIDO_REAL', 'ORDER_INFO_FAIL', {
        USUARIO_ID: user.USUARIO_ID,
        CLIENTE_ID: payload.CLIENTE_ID,
        MENSAGEM: 'Pedido criado no carrinho, mas consulta order/info falhou',
        ORDER_ID_SUPERFRETE: superfreteOrderId,
        ERRO: orderInfoError
      });
    }

    const orderData = sfNormalizeSuperFreteOrderData_(orderInfo || cartResp.json, payload, superfreteOrderId);
    const valorFinal = orderData.price > 0 ? orderData.price : payload.VALOR_COTADO;
    const diferenca = sfToMoney_(valorFinal - payload.VALOR_COTADO);
    const margem = sfToMoney_(sfGetConfigValue_('MARGEM_SEGURANCA_COTACAO', SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO));
    const disponivel = sfComputeDisponivel_(conta);
    const minimo = Math.max(valorFinal, sfToMoney_(payload.VALOR_COTADO + margem));

    let statusFinanceiro = 'RESERVADA';
    let reserva = null;
    let aviso = '';
    if (disponivel >= minimo) {
      reserva = sfReservarClienteNoLock_({
        CLIENTE_ID: payload.CLIENTE_ID,
        VALOR: valorFinal,
        ORDER_ID_AGF: orderIdAgf,
        OPERADOR_ID: user.USUARIO_ID,
        ORIGEM: 'PAINEL_ADMIN',
        MOTIVO: 'Reserva de limite para pedido real SuperFrete pendente de checkout. ID: ' + superfreteOrderId
      });
    } else {
      statusFinanceiro = 'PENDENTE_SEM_RESERVA';
      aviso = 'Pedido criado na SuperFrete, mas não houve reserva interna porque o disponível ficou insuficiente após o retorno da API. Não fazer checkout antes de ajustar o limite/saldo.';
    }

    const now = nowIso_();
    const itensNorm = sfNormalizeDeclaracaoItens_(payload.ITENS);
    const serviceName = sfServiceNameFromCode_(orderData.serviceId || sfServiceToCode_(payload.SERVICO));

    sfAppendByHeaders_(SF.SHEETS.ETIQUETAS, {
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: superfreteOrderId,
      CLIENTE_ID: payload.CLIENTE_ID,
      REMETENTE_ID: payload.REMETENTE_ID,
      OPERADOR_ID: user.USUARIO_ID,
      ORIGEM_EMISSAO: 'PAINEL_ADMIN',
      STATUS_LOGISTICO: orderData.status ? 'PENDING_SUPERFRETE' : 'PEDIDO_CRIADO_SUPERFRETE',
      STATUS_FINANCEIRO: statusFinanceiro,
      SERVICO: serviceName,
      TRANSPORTADORA: orderData.carrier || 'SUPERFRETE',
      TRACKING: orderData.tracking || '',
      VALOR_COTADO: payload.VALOR_COTADO,
      VALOR_RESERVADO: statusFinanceiro === 'RESERVADA' ? valorFinal : 0,
      VALOR_REAL_SUPERFRETE: valorFinal,
      VALOR_COBRADO_CLIENTE: valorFinal,
      DIFERENCA_COTACAO: diferenca,
      COBRANCA_ID: '',
      PDF_OFICIAL_URL: orderData.printUrl || '',
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
      PESO: orderData.weightG || payload.PACOTE.PESO_G || payload.PACOTE.PESO,
      ALTURA: orderData.height || payload.PACOTE.ALTURA,
      LARGURA: orderData.width || payload.PACOTE.LARGURA,
      COMPRIMENTO: orderData.length || payload.PACOTE.COMPRIMENTO,
      PAYLOAD_COTACAO_JSON: safeJsonStringify_({ modo: 'SUPERFRETE_CART_' + cfg.ambiente, ambiente: cfg.ambiente, valorCotado: payload.VALOR_COTADO, valorApi: valorFinal }),
      PAYLOAD_PEDIDO_JSON: safeJsonStringify_(cartPayload),
      RESPONSE_SUPERFRETE_JSON: safeJsonStringify_({ cart: cartResp.json, orderInfo: orderInfo, orderInfoError: orderInfoError }),
      CRIADO_EM: now,
      EMITIDO_EM: '',
      CANCELADO_EM: ''
    });

    itensNorm.forEach(function (item) {
      sfAppendByHeaders_(SF.SHEETS.DECLARACAO_ITENS, Object.assign({ ORDER_ID_AGF: orderIdAgf }, item));
    });

    sfAppendByHeaders_(SF.SHEETS.DCE_DOCUMENTOS, {
      ORDER_ID_AGF: orderIdAgf,
      CLIENTE_ID: payload.CLIENTE_ID,
      TIPO_DOCUMENTO: 'DCE_SUPERFRETE_PENDING',
      DCE_STATUS: 'ENVIADA_NO_PEDIDO_PENDING',
      DCE_CHAVE_ACESSO: '',
      DACE_URL: '',
      DACE_QR_CODE: '',
      DACE_PDF_URL: '',
      EMITIDO_EM: now,
      PAYLOAD_DCE_JSON: safeJsonStringify_(dcePayload),
      RESPONSE_DCE_JSON: safeJsonStringify_({ cart: cartResp.json, orderInfo: orderInfo }),
      OBS_VALIDACAO: 'Pedido real criado no carrinho SuperFrete ' + cfg.ambiente + '. A DC-e/DACE final depende do checkout/liberação.'
    });

    sfLog_('INFO', 'SF_PEDIDO_REAL', 'CREATE_CART_ORDER', {
      USUARIO_ID: user.USUARIO_ID,
      CLIENTE_ID: payload.CLIENTE_ID,
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: superfreteOrderId,
      MENSAGEM: 'Pedido real criado no carrinho SuperFrete ' + cfg.ambiente + ' sem checkout',
      VALOR: valorFinal,
      STATUS_FINANCEIRO: statusFinanceiro
    });

    return {
      etiqueta: {
        ORDER_ID_AGF: orderIdAgf,
        ORDER_ID_SUPERFRETE: superfreteOrderId,
        STATUS_LOGISTICO: 'PENDING_SUPERFRETE',
        STATUS_FINANCEIRO: statusFinanceiro,
        SERVICO: serviceName,
        TRACKING: orderData.tracking || '',
        VALOR_COTADO: payload.VALOR_COTADO,
        VALOR_REAL_SUPERFRETE: valorFinal,
        VALOR_COBRADO_CLIENTE: valorFinal,
        DIFERENCA_COTACAO: diferenca,
        PDF_OFICIAL_URL: orderData.printUrl || '',
        CRIADO_EM: now
      },
      reserva: reserva,
      aviso: aviso,
      request: cartPayload,
      response: cartResp.json,
      orderInfo: orderInfo,
      ambiente: cfg.ambiente,
      checkoutBloqueado: true
    };
  });
}


function sfValidateRealCartEnvironmentGate_(cfg, params) {
  if (!cfg || !cfg.ambiente) throw new Error('Configuração SuperFrete indisponível.');
  if (cfg.ambiente === 'PRODUCAO') {
    const confirmacao = sanitize_(params.confirmacaoProducao || params.CONFIRMACAO_PRODUCAO);
    if (confirmacao !== 'CRIAR_PEDIDO_PRODUCAO_SEM_CHECKOUT') {
      throw new Error('Produção bloqueada: para criar pedido real em produção, confirme a ação no painel administrativo. Esta etapa ainda NÃO faz checkout.');
    }
  }
}

function action_sfAdminReleasePendingOrderLocal_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const orderIdAgf = sanitize_(params.orderIdAgf || params.ORDER_ID_AGF);
  if (!orderIdAgf) throw new Error('ORDER_ID_AGF obrigatório para liberar reserva.');

  return sfWithLock_(function () {
    const sh = sfGetSheet_(SF.SHEETS.ETIQUETAS);
    const rows = sfReadObjectsFromSheet_(sh);
    const row = rows.find(function (e) { return sanitize_(e.ORDER_ID_AGF) === orderIdAgf; });
    if (!row) throw new Error('Etiqueta não encontrada: ' + orderIdAgf);

    const statusFin = upper_(row.STATUS_FINANCEIRO);
    const valorReservado = sfToMoney_(row.VALOR_RESERVADO || row.VALOR_REAL_SUPERFRETE || row.VALOR_COTADO);
    if (statusFin !== 'RESERVADA') {
      throw new Error('Esta etiqueta não está com status financeiro RESERVADA. Status atual: ' + statusFin + '.');
    }

    const conta = sfReleaseReservaClienteNoLock_({
      CLIENTE_ID: row.CLIENTE_ID,
      VALOR: valorReservado,
      ORDER_ID_AGF: orderIdAgf,
      OPERADOR_ID: user.USUARIO_ID,
      ORIGEM: 'PAINEL_ADMIN',
      MOTIVO: 'Liberação local de reserva de pedido SuperFrete pendente. Não cancela remotamente na SuperFrete nesta etapa.'
    });

    sfUpdateRowByHeaders_(SF.SHEETS.ETIQUETAS, row._row, {
      STATUS_LOGISTICO: 'CANCELADA_LOCAL_SEM_CHECKOUT',
      STATUS_FINANCEIRO: 'RESERVA_LIBERADA',
      VALOR_RESERVADO: 0,
      CANCELADO_EM: nowIso_()
    });

    sfLog_('INFO', 'SF_PEDIDO_REAL', 'RELEASE_LOCAL_RESERVE', {
      USUARIO_ID: user.USUARIO_ID,
      CLIENTE_ID: row.CLIENTE_ID,
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: row.ORDER_ID_SUPERFRETE,
      VALOR: valorReservado,
      MENSAGEM: 'Reserva local liberada sem checkout'
    });

    return {
      ok: true,
      orderIdAgf: orderIdAgf,
      orderIdSuperFrete: sanitize_(row.ORDER_ID_SUPERFRETE),
      valorLiberado: valorReservado,
      conta: conta
    };
  });
}

function sfValidateRealCartOrder_(payload, cliente, remetente, conta) {
  const erros = [];
  if (!payload.CLIENTE_ID) erros.push('Selecione o cliente.');
  if (!payload.REMETENTE_ID) erros.push('Selecione o remetente.');
  if (!cliente) erros.push('Cliente não encontrado.');
  if (!remetente) erros.push('Remetente não encontrado.');
  if (!conta) erros.push('Conta corrente do cliente não encontrada.');
  if (cliente && upper_(cliente.STATUS) !== 'ATIVO') erros.push('Cliente não está ativo.');
  if (remetente && upper_(remetente.STATUS) !== 'ATIVO') erros.push('Remetente não está ativo.');
  if (conta && upper_(conta.STATUS_CREDITO) !== 'ATIVO') erros.push('Crédito do cliente não está ativo.');
  if (conta && upper_(conta.BLOQUEAR_EMISSAO) === 'SIM') erros.push('Emissão bloqueada para este cliente.');

  if (!sfGetSuperFreteRuntimeConfig_().token) erros.push('Token SuperFrete Sandbox não configurado.');

  if (!sanitize_(remetente.NOME_REMETENTE)) erros.push('Nome do remetente obrigatório.');
  if (!sanitize_(remetente.ENDERECO)) erros.push('Endereço do remetente obrigatório.');
  if (!sanitize_(remetente.BAIRRO)) erros.push('Bairro do remetente obrigatório.');
  if (!sanitize_(remetente.CIDADE)) erros.push('Cidade do remetente obrigatória.');
  if (!sanitize_(remetente.UF) || sanitize_(remetente.UF).length !== 2) erros.push('UF do remetente obrigatória com 2 letras.');
  if (!isValidCep_(remetente.CEP)) erros.push('CEP do remetente inválido.');

  const d = payload.DESTINATARIO;
  if (!d.NOME) erros.push('Nome do destinatário obrigatório.');
  if (!d.DOCUMENTO) erros.push('CPF/CNPJ do destinatário obrigatório para DC-e.');
  if (!isValidCep_(d.CEP)) erros.push('CEP do destinatário inválido.');
  if (!d.ENDERECO) erros.push('Endereço do destinatário obrigatório.');
  if (!d.BAIRRO) erros.push('Bairro do destinatário obrigatório.');
  if (!d.CIDADE) erros.push('Cidade do destinatário obrigatória.');
  if (!d.UF || d.UF.length !== 2) erros.push('UF do destinatário obrigatória com 2 letras.');

  if (!sfServiceToCode_(payload.SERVICO)) erros.push('Serviço inválido para pedido real. Use PAC, SEDEX ou MINI ENVIOS nesta etapa.');
  if ((payload.PACOTE.PESO_G || payload.PACOTE.PESO) <= 0) erros.push('Peso obrigatório.');
  if (payload.PACOTE.ALTURA <= 0) erros.push('Altura obrigatória.');
  if (payload.PACOTE.LARGURA <= 0) erros.push('Largura obrigatória.');
  if (payload.PACOTE.COMPRIMENTO <= 0) erros.push('Comprimento obrigatório.');
  if (payload.VALOR_COTADO <= 0) erros.push('Use uma cotação real antes de criar o pedido no carrinho.');

  if (conta) {
    const margem = sfToMoney_(sfGetConfigValue_('MARGEM_SEGURANCA_COTACAO', SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO));
    const disponivel = sfComputeDisponivel_(conta);
    const minimo = sfToMoney_(payload.VALOR_COTADO + margem);
    if (disponivel < minimo) {
      erros.push('Limite insuficiente para criar pedido real. Disponível: R$ ' + disponivel + '. Necessário: R$ ' + minimo + '.');
    }
  }

  if (erros.length) {
    const err = new Error(erros.join(' '));
    err.validationErrors = erros;
    throw err;
  }
}

function sfBuildSuperFreteCartPayload_(payload, remetente, orderIdAgf) {
  const products = sfNormalizeDeclaracaoItens_(payload.ITENS).map(function (item) {
    return {
      name: sanitize_(item.DESCRICAO),
      quantity: sfToMoney_(item.QUANTIDADE),
      unitary_value: sfToMoney_(item.VALOR_UNITARIO)
    };
  });

  const volume = {
    height: payload.PACOTE.ALTURA,
    width: payload.PACOTE.LARGURA,
    length: payload.PACOTE.COMPRIMENTO,
    weight: payload.PACOTE.PESO_KG
  };

  const options = payload.OPTIONS || {};
  const insurance = sfToMoney_(options.valorDeclarado || options.VALOR_DECLARADO || options.insurance_value || 0);

  return {
    service: sfServiceToCode_(payload.SERVICO),
    from: {
      name: sfEnsureTwoWords_(remetente.NOME_REMETENTE, 'Loja'),
      address: sanitize_(remetente.ENDERECO),
      complement: sanitize_(remetente.COMPLEMENTO),
      number: sanitize_(remetente.NUMERO),
      district: sanitize_(remetente.BAIRRO) || 'NA',
      city: sanitize_(remetente.CIDADE),
      state_abbr: upper_(remetente.UF).slice(0, 2),
      postal_code: digitsOnly_(remetente.CEP),
      document: digitsOnly_(remetente.CNPJ_CPF),
      email: sanitize_(remetente.EMAIL),
      phone: digitsOnly_(remetente.TELEFONE)
    },
    to: {
      name: sfEnsureTwoWords_(payload.DESTINATARIO.NOME, 'Cliente'),
      address: payload.DESTINATARIO.ENDERECO,
      complement: payload.DESTINATARIO.COMPLEMENTO,
      number: payload.DESTINATARIO.NUMERO,
      district: payload.DESTINATARIO.BAIRRO || 'NA',
      city: payload.DESTINATARIO.CIDADE,
      state_abbr: upper_(payload.DESTINATARIO.UF).slice(0, 2),
      postal_code: digitsOnly_(payload.DESTINATARIO.CEP),
      document: digitsOnly_(payload.DESTINATARIO.DOCUMENTO)
    },
    products: products,
    volumes: volume,
    options: {
      insurance_value: insurance > 0 ? insurance : null,
      receipt: sfToBool_(options.AR || options.receipt),
      own_hand: sfToBool_(options.MAO_PROPRIA || options.own_hand),
      non_commercial: true
    },
    tag: orderIdAgf,
    url: 'https://minhaagenciaonline.com.br/superfrete-admin',
    platform: 'AGF SuperFrete'
  };
}

function sfReservarClienteNoLock_(args) {
  const clienteId = sanitize_(args.CLIENTE_ID);
  if (!clienteId) throw new Error('CLIENTE_ID obrigatório para reserva.');
  const conta = sfGetContaByClienteId_(clienteId);
  if (!conta) throw new Error('Conta do cliente não encontrada: ' + clienteId);
  const valor = sfToMoney_(args.VALOR);
  if (valor <= 0) throw new Error('Valor da reserva precisa ser maior que zero.');

  const reservadoAntes = sfToMoney_(conta.VALOR_RESERVADO);
  const reservadoDepois = sfToMoney_(reservadoAntes + valor);
  sfAppendByHeaders_(SF.SHEETS.LANC_CLIENTES, {
    LANCAMENTO_ID: uid_('SFLAN'),
    CLIENTE_ID: clienteId,
    TIPO: 'RESERVA_ETIQUETA_REAL',
    VALOR: valor,
    SINAL: 'RESERVA',
    SALDO_ANTES: sfToMoney_(conta.SALDO_CONTA),
    SALDO_DEPOIS: sfToMoney_(conta.SALDO_CONTA),
    ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
    COBRANCA_ID: '',
    PAGAMENTO_ID: '',
    OPERADOR_ID: sanitize_(args.OPERADOR_ID),
    ORIGEM: sanitize_(args.ORIGEM),
    MOTIVO: sanitize_(args.MOTIVO),
    CRIADO_EM: nowIso_()
  });
  const updated = sfUpdateContaComputed_(clienteId, { VALOR_RESERVADO: reservadoDepois });
  return { conta: updated, reservadoAntes: reservadoAntes, reservadoDepois: reservadoDepois, valorReservado: valor };
}

function sfReleaseReservaClienteNoLock_(args) {
  const clienteId = sanitize_(args.CLIENTE_ID);
  if (!clienteId) throw new Error('CLIENTE_ID obrigatório para liberar reserva.');
  const conta = sfGetContaByClienteId_(clienteId);
  if (!conta) throw new Error('Conta do cliente não encontrada: ' + clienteId);
  const valor = sfToMoney_(args.VALOR);
  if (valor <= 0) throw new Error('Valor da liberação precisa ser maior que zero.');

  const reservadoAntes = sfToMoney_(conta.VALOR_RESERVADO);
  const reservadoDepois = Math.max(0, sfToMoney_(reservadoAntes - valor));
  sfAppendByHeaders_(SF.SHEETS.LANC_CLIENTES, {
    LANCAMENTO_ID: uid_('SFLAN'),
    CLIENTE_ID: clienteId,
    TIPO: 'LIBERACAO_RESERVA',
    VALOR: valor,
    SINAL: 'LIBERA',
    SALDO_ANTES: sfToMoney_(conta.SALDO_CONTA),
    SALDO_DEPOIS: sfToMoney_(conta.SALDO_CONTA),
    ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
    COBRANCA_ID: '',
    PAGAMENTO_ID: '',
    OPERADOR_ID: sanitize_(args.OPERADOR_ID),
    ORIGEM: sanitize_(args.ORIGEM),
    MOTIVO: sanitize_(args.MOTIVO),
    CRIADO_EM: nowIso_()
  });
  return sfUpdateContaComputed_(clienteId, { VALOR_RESERVADO: reservadoDepois });
}

function sfNormalizeSuperFreteOrderData_(json, fallbackPayload, superfreteOrderId) {
  const root = sfUnwrapSuperFretePayload_(json);
  const serviceId = pickFirst_(root, ['service_id', 'service', 'serviceId']) || sfServiceToCode_(fallbackPayload.SERVICO);
  const fromPrint = deepFind_(root, 'print.url') || deepFind_(root, 'print_url') || deepFind_(root, 'url');
  const weightKg = sfToMoney_(pickFirst_(root, ['weight']));
  return {
    id: sanitize_(pickFirst_(root, ['id', 'order_id', 'uuid', 'protocol'])) || superfreteOrderId,
    status: sanitize_(pickFirst_(root, ['status'])) || 'pending',
    price: sfPickMoney_(root, ['price', 'custom_price', 'discounted_price', 'total', 'amount', 'final_price']) || fallbackPayload.VALOR_COTADO,
    tracking: sanitize_(pickFirst_(root, ['tracking', 'tracking_code'])),
    serviceId: sanitize_(serviceId),
    carrier: sanitize_(deepFind_(root, 'company.name') || deepFind_(root, 'carrier.name') || deepFind_(root, 'company') || deepFind_(root, 'carrier')),
    printUrl: sanitize_(fromPrint),
    height: sfToMoney_(pickFirst_(root, ['height'])),
    width: sfToMoney_(pickFirst_(root, ['width'])),
    length: sfToMoney_(pickFirst_(root, ['length'])),
    weight: weightKg,
    weightG: weightKg > 0 ? Math.round(weightKg * 1000) : 0
  };
}

function sfExtractSuperFreteOrderId_(json) {
  const root = sfUnwrapSuperFretePayload_(json);
  const candidates = [
    root && root.id,
    root && root.order_id,
    root && root.orderId,
    root && root.uuid,
    root && root.protocol,
    root && root.order && root.order.id,
    root && root.data && root.data.id,
    root && root.data && root.data.order_id
  ];
  if (root && Array.isArray(root.orders) && root.orders[0]) {
    candidates.push(root.orders[0].id, root.orders[0].order_id, root.orders[0].uuid);
  }
  if (Array.isArray(json) && json[0]) {
    candidates.push(json[0].id, json[0].order_id, json[0].uuid);
  }
  for (let i = 0; i < candidates.length; i++) {
    const id = sanitize_(candidates[i]);
    if (id) return id;
  }
  return '';
}

function sfUnwrapSuperFretePayload_(json) {
  if (!json) return {};
  if (Array.isArray(json)) return json[0] || {};
  if (json.data && Array.isArray(json.data)) return json.data[0] || {};
  if (json.data && typeof json.data === 'object') return json.data;
  if (json.order && typeof json.order === 'object') return json.order;
  return json;
}

function sfServiceToCode_(service) {
  const s = upper_(service);
  if (s === '1' || s.indexOf('PAC') >= 0) return 1;
  if (s === '2' || s.indexOf('SEDEX') >= 0) return 2;
  if (s === '17' || s.indexOf('MINI') >= 0) return 17;
  if (s === '3' || s.indexOf('JADLOG') >= 0) return 3;
  if (s === '31' || s.indexOf('LOGGI') >= 0) return 31;
  return 0;
}

function sfEnsureTwoWords_(value, prefix) {
  let name = sanitize_(value).replace(/\s+/g, ' ').trim();
  if (!name) name = sanitize_(prefix || 'Cliente') + ' AGF';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length < 2) name = sanitize_(prefix || 'Cliente') + ' ' + name;
  return name;
}
