function doGet(e) {
  const startedAt = Date.now();

  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = agfCleanText_(params.action || 'lookup').toLowerCase();
    const payload = agfHandleAddressRequest_(action, params);

    payload.meta = Object.assign({}, payload.meta || {}, {
      version: AGF_ADDRESS_CONFIG.VERSION,
      elapsedMs: Date.now() - startedAt,
      generatedAt: agfNowIso_()
    });

    return agfJsonResponse_(payload);
  } catch (error) {
    agfLog_('Erro não tratado', { error: error.message, stack: error.stack });

    return agfJsonResponse_(agfError_('INTERNAL_ERROR', 'Erro interno ao consultar endereço.', {
      meta: {
        version: AGF_ADDRESS_CONFIG.VERSION,
        elapsedMs: Date.now() - startedAt,
        generatedAt: agfNowIso_()
      }
    }));
  }
}

function agfHandleAddressRequest_(action, params) {
  switch (action) {
    case 'health':
      return agfSuccess_({
        type: 'health',
        message: 'AGF Address Service ativo.',
        config: agfGetRuntimeConfig_(),
        results: []
      });

    case 'cep':
      return agfLookupCep_(params.cep || params.q || '');

    case 'endereco':
    case 'address':
      return agfLookupAddress_(params);

    case 'lookup':
    default:
      return agfLookupAuto_(params);
  }
}

function agfLookupAuto_(params) {
  const q = agfCleanText_(params.q || params.query || params.cep || '');
  const cep = agfNormalizeCep_(q);

  if (!q) {
    return agfError_('EMPTY_QUERY', 'Digite um CEP ou endereço para consultar.', {
      type: 'empty',
      input: ''
    });
  }

  if (cep) {
    return agfLookupCep_(cep);
  }

  return agfLookupAddress_(Object.assign({}, params, { q }));
}

function agfLookupCep_(rawCep) {
  const cep = agfNormalizeCep_(rawCep);

  if (!cep) {
    return agfError_('INVALID_CEP', 'CEP inválido. Digite 8 números.', {
      type: 'cep',
      input: rawCep
    });
  }

  const cacheKey = `CEP:${cep}`;
  const cached = agfCacheGet_(cacheKey);
  if (cached) {
    return Object.assign({}, cached, {
      input: cep,
      cacheKey
    });
  }

  const payload = agfFetchCepFromProviders_(cep);
  if (payload.ok) {
    payload.cacheKey = cacheKey;
    agfCachePut_(cacheKey, payload);
  }

  return payload;
}

function agfLookupAddress_(params) {
  const runtime = agfGetRuntimeConfig_();
  const rawQuery = agfCleanText_(params.q || params.query || params.logradouro || params.address || '');
  const maxResults = agfClamp_(agfToInt_(params.maxResults, runtime.maxResults), 1, AGF_ADDRESS_CONFIG.CORREIOS_MAX_PAGE_SIZE);

  if (rawQuery.length < 3) {
    return agfError_('ADDRESS_TOO_SHORT', 'Digite pelo menos 3 letras do endereço.', {
      type: 'address',
      input: rawQuery
    });
  }

  const plan = agfBuildAddressSearchPlan_(params, runtime);

  if (plan.logradouroCore.length < 3) {
    return agfError_('ADDRESS_TOO_SHORT', 'Digite pelo menos 3 letras do nome da rua.', {
      type: 'address',
      input: rawQuery,
      search: agfPublicSearchPlan_(plan)
    });
  }

  const cacheKey = agfBuildAddressCacheKey_(plan, maxResults);
  const cached = agfCacheGet_(cacheKey);
  if (cached) {
    return Object.assign({}, cached, {
      input: rawQuery,
      cacheKey
    });
  }

  const payload = agfFetchAddressFromProviders_(plan, maxResults);
  if (payload.ok) {
    payload.cacheKey = cacheKey;
    agfCachePut_(cacheKey, payload);
  }

  return payload;
}

function agfBuildAddressSearchPlan_(params, runtime) {
  const rawQuery = agfCleanText_(params.q || params.query || params.logradouro || params.address || '');
  const preferUf = agfNormalizeUf_(params.preferUf || params.defaultUf || runtime.defaultUf);
  const preferCidade = agfCleanText_(params.preferCidade || params.defaultCidade || runtime.defaultCidade);

  let working = rawQuery;

  const explicitUf = agfNormalizeUf_(params.uf || params.estado) || agfUfFromText_(working);
  if (explicitUf) {
    working = agfRemoveWordInsensitive_(working, explicitUf);
  }

  let explicitCidade = agfCleanText_(params.cidade || params.localidade || params.city || '');
  if (!explicitCidade && preferCidade && agfNormalizeForCompare_(working).indexOf(agfNormalizeForCompare_(preferCidade)) >= 0) {
    explicitCidade = preferCidade;
  }

  if (explicitCidade) {
    working = agfRemovePhraseInsensitive_(working, explicitCidade);
  }

  const extracted = agfExtractTrailingNumber_(working);
  working = extracted.text;
  const numeroInformado = agfCleanText_(params.numero || params.number || extracted.number);

  const logradouroQuery = agfCleanText_(working);
  const logradouroCore = agfRemoveStreetTypePrefix_(logradouroQuery);
  const variants = agfBuildAddressQueryVariants_(logradouroQuery);
  const tipoLogradouro = agfDetectStreetType_(logradouroQuery);

  let strictUf = explicitUf;
  let strictCidade = explicitCidade;
  let scope = 'fallback_locations';

  // Se a cidade foi detectada no texto e a UF não veio explícita,
  // usamos a UF preferencial como par seguro para a cidade padrão.
  if (!strictUf && strictCidade && preferUf) {
    strictUf = preferUf;
  }

  if (strictUf && strictCidade) {
    scope = 'explicit_city';
  } else if (runtime.correiosCepReady) {
    scope = 'national_official';
  } else if (strictUf && !strictCidade && preferCidade && strictUf === preferUf) {
    strictCidade = preferCidade;
    scope = 'explicit_uf_default_city';
  }

  return {
    rawQuery,
    logradouroQuery,
    logradouroCore: logradouroCore || logradouroQuery,
    variants,
    tipoLogradouro,
    numeroInformado,
    strictUf,
    strictCidade,
    preferUf,
    preferCidade,
    scope,
    correiosCepEnabled: runtime.correiosCepReady
  };
}

function agfDetectStreetType_(text) {
  const clean = agfCleanText_(text);
  const first = clean.split(' ')[0] || '';
  const normalized = agfNormalizeForCompare_(first).replace(/\.$/, '');
  const prefixes = AGF_STREET_TYPE_PREFIXES.map(agfNormalizeForCompare_);
  return prefixes.indexOf(normalized) >= 0 ? first.replace('.', '') : '';
}

function agfBuildAddressCacheKey_(plan, maxResults) {
  return [
    'END7',
    plan.scope,
    plan.strictUf || '',
    agfNormalizeForKey_(plan.strictCidade || ''),
    agfNormalizeForKey_(plan.logradouroCore),
    agfNormalizeForKey_(plan.logradouroQuery),
    plan.numeroInformado || '',
    `MAX:${maxResults}`
  ].join('|');
}

function agfPublicSearchPlan_(plan) {
  return {
    rawQuery: plan.rawQuery,
    normalizedLogradouro: plan.logradouroCore,
    variants: plan.variants,
    numeroInformado: plan.numeroInformado,
    strictUf: plan.strictUf,
    strictCidade: plan.strictCidade,
    preferUf: plan.preferUf,
    preferCidade: plan.preferCidade,
    scope: plan.scope,
    nationalSearchEnabled: plan.correiosCepEnabled
  };
}

function setupAddressService() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CACHE_SPREADSHEET_ID);

  if (!spreadsheetId) {
    const ss = SpreadsheetApp.create('AGF_ADDRESS_CACHE');
    spreadsheetId = ss.getId();
    props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CACHE_SPREADSHEET_ID, spreadsheetId);
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(AGF_ADDRESS_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(AGF_ADDRESS_CONFIG.SHEET_NAME);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, AGF_ADDRESS_HEADERS.length).setValues([AGF_ADDRESS_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, AGF_ADDRESS_HEADERS.length);

  props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.DEFAULT_UF, AGF_ADDRESS_CONFIG.DEFAULT_UF);
  props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.DEFAULT_CIDADE, AGF_ADDRESS_CONFIG.DEFAULT_CIDADE);

  if (!props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED)) {
    props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED, 'false');
  }
  if (!props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_BASE_URL)) {
    props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_BASE_URL, AGF_ADDRESS_CONFIG.CORREIOS_CEP_BASE_URL);
  }
  if (!props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_TOKEN_URL_PRIMARY)) {
    props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_TOKEN_URL_PRIMARY, AGF_ADDRESS_CONFIG.CORREIOS_TOKEN_URL_PRIMARY);
  }
  if (!props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_TOKEN_URL_FALLBACK)) {
    props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_TOKEN_URL_FALLBACK, AGF_ADDRESS_CONFIG.CORREIOS_TOKEN_URL_FALLBACK);
  }

  agfLog_('Setup concluído', {
    spreadsheetId,
    url: ss.getUrl(),
    correiosCepEnabled: props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED)
  });

  return {
    ok: true,
    spreadsheetId,
    spreadsheetUrl: ss.getUrl(),
    message: 'Setup concluído. Agora publique o projeto como Web App.'
  };
}

function setCorreiosCepToken(token, expiresAtIso) {
  const cleanToken = agfCleanText_(token);
  if (!cleanToken) throw new Error('Informe um Bearer Token válido.');

  const expiresAt = agfParseDateMaybe_(expiresAtIso) || new Date(Date.now() + 55 * 60 * 1000);

  PropertiesService.getScriptProperties().setProperties({
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN]: cleanToken,
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT]: expiresAt.toISOString(),
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED]: 'true'
  });

  return {
    ok: true,
    expiresAt: expiresAt.toISOString(),
    message: 'Token da API Busca CEP salvo. A busca nacional oficial está habilitada enquanto o token for válido.'
  };
}

function setCorreiosCepEndpointUrl(endpointUrl) {
  const cleanUrl = agfCleanText_(endpointUrl);
  if (!cleanUrl || cleanUrl.indexOf('https://') !== 0) {
    throw new Error('Informe a URL HTTPS completa do endpoint de endereços do Swagger. Ex: https://api.correios.com.br/cep/v2/enderecos');
  }

  PropertiesService.getScriptProperties().setProperty(
    AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_BASE_URL,
    cleanUrl.replace(/\/+$/, '')
  );

  return {
    ok: true,
    endpointUrl: cleanUrl.replace(/\/+$/, ''),
    message: 'Endpoint da API CEP salvo. Use isto somente se o Swagger do CWS indicar uma URL diferente da padrão.'
  };
}

function resetCorreiosCepEndpointManual() {
  PropertiesService.getScriptProperties().setProperty(
    AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_BASE_URL,
    AGF_ADDRESS_CONFIG.CORREIOS_CEP_BASE_URL
  );

  return {
    ok: true,
    endpointUrl: AGF_ADDRESS_CONFIG.CORREIOS_CEP_BASE_URL,
    message: 'Endpoint restaurado para o padrão do manual público da API Busca CEP.'
  };
}

function setCorreiosCepCredentials(login, codigoAcesso, contrato, dr) {
  const cleanLogin = agfCleanText_(login);
  const cleanCodigo = agfCleanText_(codigoAcesso);
  const cleanContrato = agfOnlyDigits_(contrato);
  const cleanDr = agfCleanText_(dr);

  if (!cleanLogin) throw new Error('Informe o login do Meu Correios / ID Correios.');
  if (!cleanCodigo) throw new Error('Informe o código de acesso da API gerado no CWS.');
  if (!cleanContrato) throw new Error('Informe o número do contrato comercial.');

  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_LOGIN]: cleanLogin,
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_API_CODE]: cleanCodigo,
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CONTRATO]: cleanContrato,
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_DR]: cleanDr,
    [AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED]: 'true'
  });

  props.deleteProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN);
  props.deleteProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT);

  return {
    ok: true,
    message: 'Credenciais salvas. Execute testCorreiosToken() para validar a geração do Bearer Token.'
  };
}

function clearCorreiosCepToken() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN);
  props.deleteProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT);

  return {
    ok: true,
    message: 'Token armazenado removido. O próximo uso tentará gerar um novo token.'
  };
}

function disableCorreiosCepProvider() {
  PropertiesService.getScriptProperties().setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED, 'false');
  return {
    ok: true,
    message: 'Provider oficial dos Correios desabilitado. As consultas não funcionarão até reabilitar/configurar a API Busca CEP.'
  };
}

function testCorreiosToken() {
  const token = agfGetCorreiosBearerToken_();
  const props = PropertiesService.getScriptProperties();
  const expiresAt = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT) || '';

  const result = {
    ok: !!token,
    tokenPreview: token ? `${token.slice(0, 8)}...${token.slice(-6)}` : '',
    expiresAt,
    message: token ? 'Token gerado/recuperado com sucesso.' : 'Token não disponível. Verifique credenciais e serviço API BUSCA CEP no contrato.'
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testCorreiosBuscaNacionalMariaTomasia() {
  const result = agfLookupAddress_({ q: 'Maria Tomasia', maxResults: 50 });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testCepFortaleza() {
  const result = agfLookupCep_('60020000');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testEnderecoFortaleza() {
  const result = agfLookupAddress_({ q: 'Rua 24 de Maio Fortaleza CE' });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testEnderecoMariaTomasiaVariacoes() {
  const samples = [
    'Maria Tomasia',
    'Maria Tomásia',
    'Rua Maria Tomásia',
    'Rua Maria Tomasia 855',
    'Rua Maria Tomásia 855 Fortaleza',
    'Rua Maria Tomásia 855 Fortaleza CE'
  ];

  const output = samples.map(q => ({
    q,
    result: agfLookupAddress_({ q, maxResults: 20 })
  }));

  console.log(JSON.stringify(output, null, 2));
  return output;
}


function testBuscaMariaTomasiaFortalezaExplícita() {
  const result = agfLookupAddress_({ q: 'Maria Tomasia Fortaleza CE', maxResults: 50 });
  console.log(JSON.stringify(result, null, 2));
  return result;
}


function testCorreiosBuscaMariaTomasiaComoSite() {
  clearAddressCache();
  const result = agfLookupAddress_({ q: 'Maria Tomásia', maxResults: 50 });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function debugCorreiosBuscaEndereco(q) {
  const token = agfGetCorreiosBearerToken_();
  const runtime = agfGetRuntimeConfig_();
  const plan = agfBuildAddressSearchPlan_({ q: q || 'Maria Tomásia', maxResults: 50 }, runtime);
  const variants = agfBuildCorreiosSearchVariants_(plan).slice(0, 8);
  const baseUrl = agfGetCorreiosBaseUrl_();

  const diagnostics = variants.map(variant => {
    const query = {
      logradouro: variant,
      uf: plan.strictUf,
      localidade: plan.strictCidade,
      size: 50,
      page: 0,
      sort: 'cep,asc'
    };

    const url = agfBuildCorreiosAddressUrl_(baseUrl, query);
    try {
      const json = agfFetchJson_(url, 'correios_cep_debug', {
        headers: { Authorization: `Bearer ${token}` },
        maxAttempts: 1
      });
      const items = agfExtractCorreiosAddressArray_(json);
      return {
        variant,
        urlSemToken: url,
        ok: true,
        count: items.length,
        totalElements: json && json.page ? json.page.totalElements : '',
        totalPages: json && json.page ? json.page.totalPages : '',
        firstItems: items.slice(0, 5).map(item => agfNormalizeCorreiosItem_(item, 'correios'))
      };
    } catch (error) {
      return {
        variant,
        urlSemToken: url,
        ok: false,
        error: error.message
      };
    }
  });

  const output = {
    ok: true,
    input: q || 'Maria Tomásia',
    endpoint: baseUrl,
    plan: agfPublicSearchPlan_(plan),
    variants,
    diagnostics
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

function testCorreiosBuscaMajorFacundoComNumero() {
  clearAddressCache();
  const result = agfLookupAddress_({ q: 'Rua Major Facundo 2500 Fortaleza CE', maxResults: 50 });
  console.log(JSON.stringify(result, null, 2));
  return result;
}
