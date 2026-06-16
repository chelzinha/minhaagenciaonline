/**
 * AGF SUPERFRETE — 38_SF_EMISSAO_SIMULADA.gs
 * Etapa 3: emissão administrativa simulada/controlada.
 *
 * Objetivo: testar o fluxo completo sem chamar a API real da SuperFrete:
 * - escolher cliente/remetente;
 * - validar destinatário, pacote e DC-e;
 * - validar limite interno do cliente;
 * - registrar etiqueta simulada;
 * - debitar conta corrente do cliente pelo valor final;
 * - registrar consumo espelho da carteira SuperFrete AGF;
 * - salvar itens da declaração de conteúdo.
 */

function action_sfAdminEmissionBootstrap_(params) {
  sfRequireAdmin_(params.sessionToken);

  const clientes = sfReadObjects_(SF.SHEETS.CLIENTES).map(function (c) {
    return {
      CLIENTE_ID: sanitize_(c.CLIENTE_ID),
      STATUS: sanitize_(c.STATUS),
      NOME_EXIBICAO: sanitize_(c.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(c.RAZAO_SOCIAL),
      DOCUMENTO: sanitize_(c.DOCUMENTO),
      EMAIL: sanitize_(c.EMAIL),
      TELEFONE: sanitize_(c.TELEFONE)
    };
  });

  const contasByCliente = {};
  sfReadObjects_(SF.SHEETS.CONTAS).forEach(function (conta) {
    const clienteId = sanitize_(conta.CLIENTE_ID);
    contasByCliente[clienteId] = {
      CLIENTE_ID: clienteId,
      LIMITE_CREDITO: sfToMoney_(conta.LIMITE_CREDITO),
      SALDO_CONTA: sfToMoney_(conta.SALDO_CONTA),
      VALOR_RESERVADO: sfToMoney_(conta.VALOR_RESERVADO),
      DISPONIVEL_EMISSAO: sfComputeDisponivel_(conta),
      STATUS_CREDITO: sanitize_(conta.STATUS_CREDITO),
      BLOQUEAR_EMISSAO: sanitize_(conta.BLOQUEAR_EMISSAO)
    };
  });

  const remetentes = sfReadObjects_(SF.SHEETS.REMETENTES).map(function (r) {
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
  });

  return {
    clientes: clientes,
    contasByCliente: contasByCliente,
    remetentes: remetentes,
    carteiraSuperFrete: sfGetCarteiraSuperFreteSnapshot_(),
    margemSeguranca: sfToMoney_(sfGetConfigValue_('MARGEM_SEGURANCA_COTACAO', SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO)),
    timestamp: nowIso_()
  };
}

function action_sfAdminListLabels_(params) {
  sfRequireAdmin_(params.sessionToken);
  const clienteId = sanitize_(params.clienteId || params.CLIENTE_ID);
  const limit = Math.min(Math.max(Number(params.limit || 100), 1), 300);

  let etiquetas = sfReadObjects_(SF.SHEETS.ETIQUETAS);
  if (clienteId) {
    etiquetas = etiquetas.filter(function (e) { return sanitize_(e.CLIENTE_ID) === clienteId; });
  }

  return etiquetas.slice(-limit).reverse().map(function (e) {
    return {
      ORDER_ID_AGF: sanitize_(e.ORDER_ID_AGF),
      ORDER_ID_SUPERFRETE: sanitize_(e.ORDER_ID_SUPERFRETE),
      CLIENTE_ID: sanitize_(e.CLIENTE_ID),
      REMETENTE_ID: sanitize_(e.REMETENTE_ID),
      OPERADOR_ID: sanitize_(e.OPERADOR_ID),
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
      CRIADO_EM: sanitize_(e.CRIADO_EM),
      EMITIDO_EM: sanitize_(e.EMITIDO_EM)
    };
  });
}

function action_sfAdminRegisterSuperFreteRecharge_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const valor = sfToMoney_(params.valor || params.VALOR);
  const motivo = sanitize_(params.motivo || params.MOTIVO || 'Recarga SuperFrete registrada manualmente');

  if (valor <= 0) throw new Error('Informe um valor maior que zero para registrar recarga.');

  return sfWithLock_(function () {
    const lanc = sfRegistrarCarteiraSuperFreteNoLock_({
      TIPO: 'RECARGA_SUPERFRETE',
      VALOR: valor,
      SINAL: '+',
      OPERADOR_ID: user.USUARIO_ID,
      REFERENCIA: 'PAINEL_ADMIN',
      OBS: motivo
    });
    sfLog_('INFO', 'SF_CARTEIRA', 'RECARGA_SUPERFRETE', {
      USUARIO_ID: user.USUARIO_ID,
      MENSAGEM: 'Recarga SuperFrete registrada',
      VALOR: valor,
      SALDO_DEPOIS: lanc.SALDO_DEPOIS
    });
    return {
      lancamento: lanc,
      carteiraSuperFrete: sfGetCarteiraSuperFreteSnapshot_()
    };
  });
}

function action_sfAdminCreateSimulatedLabel_(params) {
  const user = sfRequireAdmin_(params.sessionToken);

  return sfWithLock_(function () {
    const payload = sfNormalizeSimulatedEmissionPayload_(params);
    const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', payload.CLIENTE_ID);
    const remetente = sfFindBy_(SF.SHEETS.REMETENTES, 'REMETENTE_ID', payload.REMETENTE_ID);
    const conta = sfGetContaByClienteId_(payload.CLIENTE_ID);
    const carteira = sfGetCarteiraSuperFreteSnapshot_();

    sfValidateSimulatedEmission_(payload, cliente, remetente, conta, carteira);

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

    const orderId = uid_('SFAGF');
    const superfreteId = 'SIM-' + orderId;
    const tracking = sfBuildSimulatedTracking_(orderId);
    const now = nowIso_();
    const valorCotado = payload.VALOR_COTADO;
    const valorReal = payload.VALOR_REAL_SUPERFRETE;
    const diferenca = sfToMoney_(valorReal - valorCotado);
    const itensNorm = sfNormalizeDeclaracaoItens_(payload.ITENS);

    sfAppendByHeaders_(SF.SHEETS.ETIQUETAS, {
      ORDER_ID_AGF: orderId,
      ORDER_ID_SUPERFRETE: superfreteId,
      CLIENTE_ID: payload.CLIENTE_ID,
      REMETENTE_ID: payload.REMETENTE_ID,
      OPERADOR_ID: user.USUARIO_ID,
      ORIGEM_EMISSAO: 'PAINEL_ADMIN',
      STATUS_LOGISTICO: 'EMITIDA_SIMULADA',
      STATUS_FINANCEIRO: 'EM_ABERTO',
      SERVICO: payload.SERVICO,
      TRANSPORTADORA: 'SUPERFRETE_SIMULADA',
      TRACKING: tracking,
      VALOR_COTADO: valorCotado,
      VALOR_RESERVADO: valorCotado,
      VALOR_REAL_SUPERFRETE: valorReal,
      VALOR_COBRADO_CLIENTE: valorReal,
      DIFERENCA_COTACAO: diferenca,
      COBRANCA_ID: '',
      PDF_OFICIAL_URL: '',
      PDF_AGF_URL: '',
      DCE_STATUS: 'VALIDADA_LOCAL',
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
      PESO: payload.PACOTE.PESO_G || payload.PACOTE.PESO,
      ALTURA: payload.PACOTE.ALTURA,
      LARGURA: payload.PACOTE.LARGURA,
      COMPRIMENTO: payload.PACOTE.COMPRIMENTO,
      PAYLOAD_COTACAO_JSON: safeJsonStringify_({ modo: 'SIMULADO', valorCotado: valorCotado, valorReal: valorReal }),
      PAYLOAD_PEDIDO_JSON: safeJsonStringify_(payload),
      RESPONSE_SUPERFRETE_JSON: safeJsonStringify_({ simulated: true, orderId: superfreteId, tracking: tracking }),
      CRIADO_EM: now,
      EMITIDO_EM: now,
      CANCELADO_EM: ''
    });

    itensNorm.forEach(function (item) {
      sfAppendByHeaders_(SF.SHEETS.DECLARACAO_ITENS, Object.assign({ ORDER_ID_AGF: orderId }, item));
    });

    sfAppendByHeaders_(SF.SHEETS.DCE_DOCUMENTOS, {
      ORDER_ID_AGF: orderId,
      CLIENTE_ID: payload.CLIENTE_ID,
      TIPO_DOCUMENTO: 'DCE_SIMULADA',
      DCE_STATUS: 'VALIDADA_LOCAL',
      DCE_CHAVE_ACESSO: '',
      DACE_URL: '',
      DACE_QR_CODE: '',
      DACE_PDF_URL: '',
      EMITIDO_EM: now,
      PAYLOAD_DCE_JSON: safeJsonStringify_(dcePayload),
      RESPONSE_DCE_JSON: safeJsonStringify_({ simulated: true, validation: dceValidation }),
      OBS_VALIDACAO: 'Validação local. Sem emissão fiscal real nesta etapa.'
    });

    const lancCliente = sfLancarClienteNoLock_({
      CLIENTE_ID: payload.CLIENTE_ID,
      TIPO: 'DEBITO_ETIQUETA_SIMULADA',
      VALOR: valorReal,
      SINAL: '-',
      ORDER_ID_AGF: orderId,
      OPERADOR_ID: user.USUARIO_ID,
      ORIGEM: 'PAINEL_ADMIN',
      MOTIVO: 'Etiqueta simulada gerada pelo admin. Tracking: ' + tracking
    });

    const lancCarteira = sfRegistrarCarteiraSuperFreteNoLock_({
      TIPO: 'CONSUMO_ETIQUETA_SIMULADA',
      VALOR: valorReal,
      SINAL: '-',
      ORDER_ID_AGF: orderId,
      ORDER_ID_SUPERFRETE: superfreteId,
      OPERADOR_ID: user.USUARIO_ID,
      REFERENCIA: tracking,
      OBS: 'Consumo simulado da carteira SuperFrete AGF.'
    });

    sfLog_('INFO', 'SF_EMISSAO', 'CREATE_SIMULATED_LABEL', {
      USUARIO_ID: user.USUARIO_ID,
      CLIENTE_ID: payload.CLIENTE_ID,
      ORDER_ID_AGF: orderId,
      MENSAGEM: 'Etiqueta simulada criada com sucesso',
      VALOR_REAL_SUPERFRETE: valorReal,
      TRACKING: tracking
    });

    return {
      etiqueta: {
        ORDER_ID_AGF: orderId,
        ORDER_ID_SUPERFRETE: superfreteId,
        TRACKING: tracking,
        STATUS_LOGISTICO: 'EMITIDA_SIMULADA',
        STATUS_FINANCEIRO: 'EM_ABERTO',
        VALOR_COTADO: valorCotado,
        VALOR_REAL_SUPERFRETE: valorReal,
        VALOR_COBRADO_CLIENTE: valorReal,
        DIFERENCA_COTACAO: diferenca,
        DCE_STATUS: 'VALIDADA_LOCAL'
      },
      conta: lancCliente.conta,
      carteiraSuperFrete: {
        saldoAntes: lancCarteira.SALDO_ANTES,
        saldoDepois: lancCarteira.SALDO_DEPOIS
      },
      declaracao: {
        totalItens: dceValidation.totalItens,
        valorTotal: dceValidation.valorTotal
      }
    };
  });
}

function sfNormalizeSimulatedEmissionPayload_(params) {
  const destinatarioRaw = params.destinatario || params.DESTINATARIO || {};
  const pacoteRaw = params.pacote || params.PACOTE || {};
  const optionsRaw = params.options || params.OPCOES || params.OPTIONS || {};
  const itensRaw = params.itens || params.ITENS || [];
  const pesoG = sfNormalizePesoG_(pacoteRaw);

  return {
    CLIENTE_ID: sanitize_(params.clienteId || params.CLIENTE_ID),
    REMETENTE_ID: sanitize_(params.remetenteId || params.REMETENTE_ID),
    SERVICO: upper_(params.servico || params.SERVICO || 'SEDEX'),
    VALOR_COTADO: sfToMoney_(params.valorCotado || params.VALOR_COTADO),
    VALOR_REAL_SUPERFRETE: sfToMoney_(params.valorRealSuperFrete || params.VALOR_REAL_SUPERFRETE || params.valorReal || params.VALOR_REAL),
    DESTINATARIO: {
      NOME: sanitize_(destinatarioRaw.nome || destinatarioRaw.NOME),
      DOCUMENTO: sfNormalizeDoc_(destinatarioRaw.documento || destinatarioRaw.DOCUMENTO),
      CEP: digitsOnly_(destinatarioRaw.cep || destinatarioRaw.CEP),
      ENDERECO: sanitize_(destinatarioRaw.endereco || destinatarioRaw.ENDERECO),
      NUMERO: sanitize_(destinatarioRaw.numero || destinatarioRaw.NUMERO),
      COMPLEMENTO: sanitize_(destinatarioRaw.complemento || destinatarioRaw.COMPLEMENTO),
      BAIRRO: sanitize_(destinatarioRaw.bairro || destinatarioRaw.BAIRRO),
      CIDADE: sanitize_(destinatarioRaw.cidade || destinatarioRaw.CIDADE),
      UF: upper_(destinatarioRaw.uf || destinatarioRaw.UF)
    },
    PACOTE: {
      PESO_G: pesoG,
      PESO_KG: sfPesoGToKg_(pesoG),
      // Compatibilidade com as etapas anteriores: no sistema AGF, PESO passa a ser armazenado em gramas.
      PESO: pesoG,
      ALTURA: sfToMoney_(pacoteRaw.altura || pacoteRaw.ALTURA),
      LARGURA: sfToMoney_(pacoteRaw.largura || pacoteRaw.LARGURA),
      COMPRIMENTO: sfToMoney_(pacoteRaw.comprimento || pacoteRaw.COMPRIMENTO)
    },
    OPTIONS: {
      VALOR_DECLARADO: sfToMoney_(optionsRaw.valorDeclarado || optionsRaw.VALOR_DECLARADO || optionsRaw.insurance_value || optionsRaw.INSURANCE_VALUE),
      AR: upper_(optionsRaw.AR || optionsRaw.ar || optionsRaw.receipt) === 'SIM' || optionsRaw.receipt === true ? 'SIM' : 'NAO',
      MAO_PROPRIA: upper_(optionsRaw.MAO_PROPRIA || optionsRaw.maoPropria || optionsRaw.own_hand) === 'SIM' || optionsRaw.own_hand === true ? 'SIM' : 'NAO'
    },
    ITENS: itensRaw
  };
}

function sfNormalizePesoG_(pacoteRaw) {
  pacoteRaw = pacoteRaw || {};
  const rawG = pacoteRaw.pesoG || pacoteRaw.PESO_G || pacoteRaw.pesoGramas || pacoteRaw.PESO_GRAMAS || pacoteRaw.weight_g;
  if (rawG !== undefined && rawG !== null && String(rawG).trim() !== '') {
    return Math.max(0, Math.round(sfToMoney_(rawG)));
  }

  // Compatibilidade com versões anteriores: o front antigo enviava pacote.peso em kg.
  const raw = pacoteRaw.peso || pacoteRaw.PESO || pacoteRaw.pesoKg || pacoteRaw.PESO_KG || pacoteRaw.weight;
  const n = sfToMoney_(raw);
  if (n <= 0) return 0;
  if (n <= 30) return Math.round(n * 1000); // kg → g
  return Math.round(n); // já parece estar em gramas
}

function sfPesoGToKg_(pesoG) {
  const g = Math.max(0, Math.round(sfToMoney_(pesoG)));
  return sfToMoney_(g / 1000);
}

function sfValidateSimulatedEmission_(payload, cliente, remetente, conta, carteira) {
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

  if (!payload.DESTINATARIO.NOME) erros.push('Nome do destinatário obrigatório.');
  if (!payload.DESTINATARIO.DOCUMENTO) erros.push('CPF/CNPJ do destinatário obrigatório.');
  if (!payload.DESTINATARIO.CEP || payload.DESTINATARIO.CEP.length !== 8) erros.push('CEP do destinatário deve ter 8 dígitos.');
  if (!payload.DESTINATARIO.ENDERECO) erros.push('Endereço do destinatário obrigatório.');
  if (!payload.DESTINATARIO.NUMERO) erros.push('Número do destinatário obrigatório.');
  if (!payload.DESTINATARIO.BAIRRO) erros.push('Bairro do destinatário obrigatório.');
  if (!payload.DESTINATARIO.CIDADE) erros.push('Cidade do destinatário obrigatória.');
  if (!payload.DESTINATARIO.UF || payload.DESTINATARIO.UF.length !== 2) erros.push('UF do destinatário obrigatória.');

  if ((payload.PACOTE.PESO_G || payload.PACOTE.PESO) <= 0) erros.push('Peso obrigatório.');
  if (payload.PACOTE.ALTURA <= 0) erros.push('Altura obrigatória.');
  if (payload.PACOTE.LARGURA <= 0) erros.push('Largura obrigatória.');
  if (payload.PACOTE.COMPRIMENTO <= 0) erros.push('Comprimento obrigatório.');
  if (payload.VALOR_COTADO <= 0) erros.push('Valor cotado precisa ser maior que zero.');
  if (payload.VALOR_REAL_SUPERFRETE <= 0) erros.push('Valor real/final precisa ser maior que zero.');

  if (conta) {
    const margem = sfToMoney_(sfGetConfigValue_('MARGEM_SEGURANCA_COTACAO', SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO));
    const disponivel = sfComputeDisponivel_(conta);
    const minimo = Math.max(sfToMoney_(payload.VALOR_COTADO + margem), payload.VALOR_REAL_SUPERFRETE);
    if (disponivel < minimo) {
      erros.push('Limite insuficiente. Disponível: R$ ' + disponivel + '. Necessário: R$ ' + sfToMoney_(minimo) + '.');
    }
  }

  if (carteira && carteira.saldoEstimado < payload.VALOR_REAL_SUPERFRETE) {
    erros.push('Saldo SuperFrete estimado insuficiente. Registre uma recarga antes de emitir.');
  }

  if (erros.length) {
    const err = new Error(erros.join(' '));
    err.validationErrors = erros;
    throw err;
  }
}

function sfGetCarteiraSuperFreteSnapshot_() {
  const rows = sfReadObjects_(SF.SHEETS.CARTEIRA_SF);
  const last = rows.length ? rows[rows.length - 1] : null;
  return {
    saldoEstimado: last ? sfToMoney_(last.SALDO_DEPOIS) : 0,
    qtdLancamentos: rows.length,
    ultimoLancamento: last ? {
      TIPO: sanitize_(last.TIPO),
      VALOR: sfToMoney_(last.VALOR),
      SINAL: sanitize_(last.SINAL),
      SALDO_DEPOIS: sfToMoney_(last.SALDO_DEPOIS),
      CRIADO_EM: sanitize_(last.CRIADO_EM)
    } : null
  };
}

function sfLancarClienteNoLock_(args) {
  const clienteId = sanitize_(args.CLIENTE_ID);
  if (!clienteId) throw new Error('CLIENTE_ID obrigatório para lançamento.');

  const conta = sfGetContaByClienteId_(clienteId);
  if (!conta) throw new Error('Conta do cliente não encontrada: ' + clienteId);

  const valor = sfToMoney_(args.VALOR);
  const sinal = sanitize_(args.SINAL) === '+' ? '+' : '-';
  const saldoAntes = sfToMoney_(conta.SALDO_CONTA);
  const saldoDepois = sinal === '+' ? sfToMoney_(saldoAntes + valor) : sfToMoney_(saldoAntes - valor);

  sfAppendByHeaders_(SF.SHEETS.LANC_CLIENTES, {
    LANCAMENTO_ID: uid_('SFLAN'),
    CLIENTE_ID: clienteId,
    TIPO: sanitize_(args.TIPO),
    VALOR: valor,
    SINAL: sinal,
    SALDO_ANTES: saldoAntes,
    SALDO_DEPOIS: saldoDepois,
    ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
    COBRANCA_ID: sanitize_(args.COBRANCA_ID),
    PAGAMENTO_ID: sanitize_(args.PAGAMENTO_ID),
    OPERADOR_ID: sanitize_(args.OPERADOR_ID),
    ORIGEM: sanitize_(args.ORIGEM),
    MOTIVO: sanitize_(args.MOTIVO),
    CRIADO_EM: nowIso_()
  });

  const updated = sfUpdateContaComputed_(clienteId, { SALDO_CONTA: saldoDepois });
  return { conta: updated, saldoAntes: saldoAntes, saldoDepois: saldoDepois };
}

function sfRegistrarCarteiraSuperFreteNoLock_(args) {
  const rows = sfReadObjects_(SF.SHEETS.CARTEIRA_SF);
  const last = rows.length ? rows[rows.length - 1] : null;
  const saldoAntes = last ? sfToMoney_(last.SALDO_DEPOIS) : 0;
  const valor = sfToMoney_(args.VALOR);
  const sinal = sanitize_(args.SINAL) === '+' ? '+' : '-';
  const saldoDepois = sinal === '+' ? sfToMoney_(saldoAntes + valor) : sfToMoney_(saldoAntes - valor);
  const lanc = {
    LANCAMENTO_ID: uid_('SFCAR'),
    TIPO: sanitize_(args.TIPO),
    VALOR: valor,
    SINAL: sinal,
    SALDO_ANTES: saldoAntes,
    SALDO_DEPOIS: saldoDepois,
    ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
    ORDER_ID_SUPERFRETE: sanitize_(args.ORDER_ID_SUPERFRETE),
    OPERADOR_ID: sanitize_(args.OPERADOR_ID),
    REFERENCIA: sanitize_(args.REFERENCIA),
    OBS: sanitize_(args.OBS),
    CRIADO_EM: nowIso_()
  };
  sfAppendByHeaders_(SF.SHEETS.CARTEIRA_SF, lanc);
  return lanc;
}

function sfBuildSimulatedTracking_(orderId) {
  const compact = String(orderId || '').replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
  return 'SIM' + compact;
}
