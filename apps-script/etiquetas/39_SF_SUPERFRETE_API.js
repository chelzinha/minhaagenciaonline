/**
 * AGF SUPERFRETE — 39_SF_SUPERFRETE_API.gs
 * Etapa 4: cotação real na API SuperFrete em Sandbox/Produção controlada.
 *
 * Esta etapa NÃO cria pedido, NÃO faz checkout e NÃO consome saldo real.
 * Ela apenas chama /api/v0/calculator, normaliza a resposta e devolve
 * opções de frete para o painel admin usar na emissão simulada.
 */

function action_sfAdminGetSuperFreteConfig_(params) {
  sfRequireAdmin_(params.sessionToken);
  const cfg = sfGetSuperFreteRuntimeConfig_();
  return {
    ambiente: cfg.ambiente,
    baseUrl: cfg.baseUrl,
    userAgent: cfg.userAgent,
    tokenSandboxConfigured: !!sfGetProperty_(SF.PROPERTIES.SUPERFRETE_TOKEN_SANDBOX),
    tokenProducaoConfigured: !!sfGetProperty_(SF.PROPERTIES.SUPERFRETE_TOKEN_PRODUCAO),
    tokenActiveConfigured: !!cfg.token,
    updatedAt: nowIso_()
  };
}

function action_sfAdminSaveSuperFreteConfig_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const ambiente = upper_(params.ambiente || params.AMBIENTE || 'SANDBOX');
  const userAgent = sanitize_(params.userAgent || params.USER_AGENT || 'AGF SuperFrete/0.4 (suporte@minhaagenciaonline.com.br)');
  const tokenSandbox = sanitize_(params.tokenSandbox || params.TOKEN_SANDBOX);
  const tokenProducao = sanitize_(params.tokenProducao || params.TOKEN_PRODUCAO);

  if (['SANDBOX', 'PRODUCAO'].indexOf(ambiente) < 0) {
    throw new Error('Ambiente inválido. Use SANDBOX ou PRODUCAO.');
  }
  if (!userAgent || userAgent.indexOf('(') < 0 || userAgent.indexOf('@') < 0) {
    throw new Error('User-Agent deve identificar a aplicação e conter e-mail de contato. Ex: AGF SuperFrete/0.4 (email@dominio.com.br).');
  }

  return sfWithLock_(function () {
    sfSetConfigValueNoLock_('SUPERFRETE_AMBIENTE', ambiente, 'Ambiente ativo da API SuperFrete: SANDBOX ou PRODUCAO.');
    sfSetConfigValueNoLock_('SUPERFRETE_USER_AGENT', userAgent, 'Header User-Agent enviado à API SuperFrete.');

    if (tokenSandbox) sfSetProperty_(SF.PROPERTIES.SUPERFRETE_TOKEN_SANDBOX, tokenSandbox);
    if (tokenProducao) sfSetProperty_(SF.PROPERTIES.SUPERFRETE_TOKEN_PRODUCAO, tokenProducao);

    sfLog_('INFO', 'SF_SUPERFRETE_API', 'SAVE_CONFIG', {
      USUARIO_ID: user.USUARIO_ID,
      MENSAGEM: 'Configuração da API SuperFrete atualizada',
      AMBIENTE: ambiente,
      USER_AGENT: userAgent,
      TOKEN_SANDBOX_INFORMADO: !!tokenSandbox,
      TOKEN_PRODUCAO_INFORMADO: !!tokenProducao
    });

    return action_sfAdminGetSuperFreteConfig_(params);
  });
}

function action_sfAdminQuoteSuperFrete_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const normalized = sfNormalizeSuperFreteQuotePayload_(params);

  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', normalized.CLIENTE_ID);
  const remetente = sfFindBy_(SF.SHEETS.REMETENTES, 'REMETENTE_ID', normalized.REMETENTE_ID);
  const conta = sfGetContaByClienteId_(normalized.CLIENTE_ID);

  sfValidateSuperFreteQuote_(normalized, cliente, remetente, conta);

  const requestPayload = sfBuildSuperFreteCalculatorPayload_(normalized, remetente);
  const apiResp = sfSuperFreteFetch_('POST', '/calculator', requestPayload);
  const normalizedQuotes = sfNormalizeSuperFreteQuotes_(apiResp.json);

  sfLog_('INFO', 'SF_SUPERFRETE_API', 'QUOTE', {
    USUARIO_ID: user.USUARIO_ID,
    CLIENTE_ID: normalized.CLIENTE_ID,
    MENSAGEM: 'Cotação real SuperFrete realizada',
    HTTP_STATUS: apiResp.httpStatus,
    REQUEST: requestPayload,
    QTD_OPCOES: normalizedQuotes.length
  });

  return {
    request: requestPayload,
    response: apiResp.json,
    quotes: normalizedQuotes,
    httpStatus: apiResp.httpStatus,
    ambiente: sfGetSuperFreteRuntimeConfig_().ambiente,
    timestamp: nowIso_()
  };
}

function sfNormalizeSuperFreteQuotePayload_(params) {
  const destinatarioRaw = params.destinatario || params.DESTINATARIO || {};
  const pacoteRaw = params.pacote || params.PACOTE || {};
  const optionsRaw = params.options || params.OPCOES || {};

  const pesoG = sfNormalizePesoG_(pacoteRaw);

  return {
    CLIENTE_ID: sanitize_(params.clienteId || params.CLIENTE_ID),
    REMETENTE_ID: sanitize_(params.remetenteId || params.REMETENTE_ID),
    SERVICOS: sfNormalizeServiceCodes_(params.servicos || params.SERVICOS || params.servico || params.SERVICO || '1,2,17'),
    DESTINATARIO: {
      CEP: digitsOnly_(destinatarioRaw.cep || destinatarioRaw.CEP)
    },
    PACOTE: {
      PESO_G: pesoG,
      PESO_KG: sfPesoGToKg_(pesoG),
      PESO: pesoG,
      ALTURA: sfToMoney_(pacoteRaw.altura || pacoteRaw.ALTURA),
      LARGURA: sfToMoney_(pacoteRaw.largura || pacoteRaw.LARGURA),
      COMPRIMENTO: sfToMoney_(pacoteRaw.comprimento || pacoteRaw.COMPRIMENTO)
    },
    OPTIONS: {
      own_hand: sfToBool_(optionsRaw.own_hand || optionsRaw.ownHand || optionsRaw.maoPropria || optionsRaw.MAO_PROPRIA),
      receipt: sfToBool_(optionsRaw.receipt || optionsRaw.ar || optionsRaw.AR),
      insurance_value: sfToMoney_(optionsRaw.insurance_value || optionsRaw.valorDeclarado || optionsRaw.VALOR_DECLARADO),
      use_insurance_value: sfToMoney_(optionsRaw.insurance_value || optionsRaw.valorDeclarado || optionsRaw.VALOR_DECLARADO) > 0
    }
  };
}

function sfValidateSuperFreteQuote_(payload, cliente, remetente, conta) {
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

  if (!isValidCep_(remetente && remetente.CEP)) erros.push('CEP do remetente inválido.');
  if (!isValidCep_(payload.DESTINATARIO.CEP)) erros.push('CEP do destinatário deve ter 8 dígitos.');
  if ((payload.PACOTE.PESO_G || payload.PACOTE.PESO) <= 0) erros.push('Peso obrigatório para cotação.');
  if (payload.PACOTE.ALTURA <= 0) erros.push('Altura obrigatória para cotação.');
  if (payload.PACOTE.LARGURA <= 0) erros.push('Largura obrigatória para cotação.');
  if (payload.PACOTE.COMPRIMENTO <= 0) erros.push('Comprimento obrigatório para cotação.');

  const cfg = sfGetSuperFreteRuntimeConfig_();
  if (!cfg.token) erros.push('Token SuperFrete ' + cfg.ambiente + ' não configurado. Salve o token no painel antes de cotar.');

  if (erros.length) {
    const err = new Error(erros.join(' '));
    err.validationErrors = erros;
    throw err;
  }
}

function sfBuildSuperFreteCalculatorPayload_(payload, remetente) {
  return {
    from: {
      postal_code: digitsOnly_(remetente.CEP)
    },
    to: {
      postal_code: payload.DESTINATARIO.CEP
    },
    services: payload.SERVICOS,
    options: {
      own_hand: !!payload.OPTIONS.own_hand,
      receipt: !!payload.OPTIONS.receipt,
      insurance_value: payload.OPTIONS.insurance_value || 0,
      use_insurance_value: !!payload.OPTIONS.use_insurance_value
    },
    package: {
      height: payload.PACOTE.ALTURA,
      width: payload.PACOTE.LARGURA,
      length: payload.PACOTE.COMPRIMENTO,
      weight: payload.PACOTE.PESO_KG
    }
  };
}

function sfSuperFreteFetch_(method, path, payload) {
  const cfg = sfGetSuperFreteRuntimeConfig_();
  if (!cfg.token) throw new Error('Token SuperFrete ' + cfg.ambiente + ' não configurado.');

  const url = cfg.baseUrl + path;
  const options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + cfg.token,
      'User-Agent': cfg.userAgent,
      'Accept': 'application/json'
    }
  };
  if (payload != null) options.payload = safeJsonStringify_(payload);

  const started = nowMs_();
  let resp, text, json;
  try {
    resp = UrlFetchApp.fetch(url, options);
    text = resp.getContentText() || '';
    json = safeJsonParse_(text);
  } catch (e) {
    sfLog_('ERRO', 'SF_SUPERFRETE_API', 'FETCH_FAIL', {
      MENSAGEM: e.message || String(e),
      URL: url,
      METHOD: method,
      REQUEST: payload
    });
    throw new Error('Falha ao chamar a API SuperFrete: ' + (e.message || e));
  }

  const status = resp.getResponseCode();
  const elapsed = nowMs_() - started;
  if (status < 200 || status >= 300) {
    sfLog_('ERRO', 'SF_SUPERFRETE_API', 'HTTP_' + status, {
      MENSAGEM: 'Erro HTTP na API SuperFrete',
      URL: url,
      METHOD: method,
      STATUS: status,
      REQUEST: payload,
      RESPONSE: truncate_(text, 2000),
      ELAPSED_MS: elapsed
    });
    throw new Error('SuperFrete retornou HTTP ' + status + ': ' + truncate_(text, 500));
  }

  if (!json) {
    throw new Error('SuperFrete retornou resposta vazia ou inválida. HTTP ' + status + '.');
  }

  return { httpStatus: status, text: text, json: json, elapsedMs: elapsed };
}

function sfGetSuperFreteRuntimeConfig_() {
  const ambiente = upper_(sfGetConfigValue_('SUPERFRETE_AMBIENTE', 'SANDBOX')) === 'PRODUCAO' ? 'PRODUCAO' : 'SANDBOX';
  const userAgent = sanitize_(sfGetConfigValue_('SUPERFRETE_USER_AGENT', 'AGF SuperFrete/0.4 (suporte@minhaagenciaonline.com.br)'));
  const baseUrl = ambiente === 'PRODUCAO' ? 'https://api.superfrete.com/api/v0' : 'https://sandbox.superfrete.com/api/v0';
  const tokenKey = ambiente === 'PRODUCAO' ? SF.PROPERTIES.SUPERFRETE_TOKEN_PRODUCAO : SF.PROPERTIES.SUPERFRETE_TOKEN_SANDBOX;
  return {
    ambiente: ambiente,
    userAgent: userAgent,
    baseUrl: baseUrl,
    token: sfGetProperty_(tokenKey)
  };
}

function sfNormalizeSuperFreteQuotes_(apiJson) {
  const list = sfExtractQuoteArray_(apiJson);
  return list.map(function (item) {
    const serviceId = sanitize_(pickFirst_(item, ['id', 'service_id', 'service', 'code']));
    const name = sanitize_(pickFirst_(item, ['name', 'service_name', 'service', 'description'])) || sfServiceNameFromCode_(serviceId);
    const company = pickFirst_(item, ['company']);
    const companyName = company && typeof company === 'object' ? sanitize_(company.name || company.company_name || '') : sanitize_(company);
    const price = sfPickMoney_(item, ['price', 'custom_price', 'discounted_price', 'total', 'amount', 'final_price']);
    const deliveryMin = sfPickNumber_(item, ['delivery_min', 'delivery_range_min', 'min_delivery_time', 'delivery_time_min']);
    const deliveryMax = sfPickNumber_(item, ['delivery_max', 'delivery_range_max', 'max_delivery_time', 'delivery_time', 'delivery_time_max']);
    const error = sanitize_(pickFirst_(item, ['error', 'message', 'warning']));
    const pkg = pickFirst_(item, ['package', 'packages']);
    return {
      rawServiceId: serviceId,
      serviceCode: sfServiceCodeFromAny_(serviceId || name),
      serviceName: name,
      carrier: companyName || sfCarrierFromServiceCode_(serviceId),
      price: price,
      deliveryMin: deliveryMin,
      deliveryMax: deliveryMax || deliveryMin,
      error: error,
      package: pkg || null,
      raw: item
    };
  }).filter(function (q) {
    return q.price > 0 || q.error;
  });
}

function sfExtractQuoteArray_(apiJson) {
  if (Array.isArray(apiJson)) return apiJson;
  if (!apiJson || typeof apiJson !== 'object') return [];
  if (Array.isArray(apiJson.data)) return apiJson.data;
  if (Array.isArray(apiJson.results)) return apiJson.results;
  if (Array.isArray(apiJson.services)) return apiJson.services;
  if (Array.isArray(apiJson.quotes)) return apiJson.quotes;
  return [apiJson];
}

function sfPickMoney_(obj, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = deepFind_(obj, keys[i]);
    const n = sfToMoney_(v);
    if (n > 0) return n;
  }
  return 0;
}

function sfPickNumber_(obj, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = deepFind_(obj, keys[i]);
    const n = Number(v);
    if (!isNaN(n) && n > 0) return n;
  }
  return 0;
}

function sfNormalizeServiceCodes_(value) {
  const s = upper_(value);
  if (!s || s === 'TODOS' || s === 'TODOS CORREIOS') return '1,2,17';
  if (s === 'PAC') return '1';
  if (s === 'SEDEX') return '2';
  if (s === 'MINI' || s === 'MINI ENVIOS' || s === 'MINI ENVIOS CORREIOS') return '17';
  if (/^[\d,\s]+$/.test(s)) {
    return s.split(',').map(function (x) { return digitsOnly_(x); }).filter(Boolean).join(',');
  }
  return '1,2,17';
}

function sfServiceNameFromCode_(code) {
  const c = String(code || '');
  if (c === '1') return 'PAC';
  if (c === '2') return 'SEDEX';
  if (c === '17') return 'MINI ENVIOS';
  if (c === '3') return 'JADLOG';
  if (c === '31') return 'LOGGI';
  return c || 'Serviço';
}

function sfServiceCodeFromAny_(value) {
  const s = upper_(value);
  if (s === '1' || s.indexOf('PAC') >= 0) return '1';
  if (s === '2' || s.indexOf('SEDEX') >= 0) return '2';
  if (s === '17' || s.indexOf('MINI') >= 0) return '17';
  if (s === '3' || s.indexOf('JADLOG') >= 0) return '3';
  if (s === '31' || s.indexOf('LOGGI') >= 0) return '31';
  return s;
}

function sfCarrierFromServiceCode_(code) {
  const c = String(code || '');
  if (c === '1' || c === '2' || c === '17') return 'Correios';
  if (c === '3') return 'Jadlog';
  if (c === '31') return 'Loggi';
  return '';
}

function sfToBool_(v) {
  const s = upper_(v);
  return v === true || s === 'TRUE' || s === 'SIM' || s === 'YES' || s === '1' || s === 'ON';
}

function sfGetProperty_(key) {
  return sanitize_(PropertiesService.getScriptProperties().getProperty(key));
}

function sfSetProperty_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, sanitize_(value));
}

function sfSetConfigValueNoLock_(chave, valor, descricao) {
  const sh = sfGetSheet_(SF.SHEETS.CONFIG);
  const rows = sfReadObjectsFromSheet_(sh);
  const key = sanitize_(chave);
  const row = rows.find(function (r) { return sanitize_(r.CHAVE) === key; });
  const patch = {
    CHAVE: key,
    VALOR: sanitize_(valor),
    DESCRICAO: sanitize_(descricao),
    ATUALIZADO_EM: nowIso_()
  };
  if (row && row._row) {
    sfUpdateRowByHeaders_(SF.SHEETS.CONFIG, row._row, patch);
  } else {
    sfAppendByHeaders_(SF.SHEETS.CONFIG, patch);
  }
}
