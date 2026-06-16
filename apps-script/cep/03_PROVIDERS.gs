function agfFetchJson_(url, provider, options) {
  const opts = options || {};
  const method = String(opts.method || 'get').toLowerCase();
  const headers = Object.assign({
    Accept: 'application/json'
  }, opts.headers || {});

  const maxAttempts = agfClamp_(agfToInt_(opts.maxAttempts, 2), 1, 3);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const fetchOptions = {
        method,
        muteHttpExceptions: true,
        followRedirects: true,
        headers
      };

      if (opts.contentType) fetchOptions.contentType = opts.contentType;
      if (opts.payload !== undefined) fetchOptions.payload = opts.payload;

      const response = UrlFetchApp.fetch(url, fetchOptions);
      const status = response.getResponseCode();
      const text = response.getContentText('UTF-8');

      if (status < 200 || status >= 300) {
        const message = text ? text.slice(0, 500) : '';
        throw new Error(`${provider}_HTTP_${status}${message ? ': ' + message : ''}`);
      }

      const json = agfSafeParseJson_(text);
      if (!json) {
        throw new Error(`${provider}_INVALID_JSON: ${text.slice(0, 240)}`);
      }

      return json;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && agfIsTemporaryProviderError_(error.message)) {
        Utilities.sleep(400 * attempt);
        continue;
      }
      break;
    }
  }

  throw lastError || new Error(`${provider}_UNKNOWN_ERROR`);
}

function agfCorreiosIsEnabled_() {
  const props = PropertiesService.getScriptProperties();
  return String(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED) || '').toLowerCase() === 'true';
}

function agfGetCorreiosBearerToken_() {
  const props = PropertiesService.getScriptProperties();
  if (!agfCorreiosIsEnabled_()) return '';

  const storedToken = agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN));
  const expiresAt = agfParseDateMaybe_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT));
  const secondsLeft = agfSecondsUntil_(expiresAt);

  if (storedToken && secondsLeft > AGF_ADDRESS_CONFIG.CORREIOS_TOKEN_REFRESH_BUFFER_SECONDS) {
    return storedToken;
  }

  const login = agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_LOGIN));
  const apiCode = agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_API_CODE));
  const contrato = agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CONTRATO));

  if (storedToken && (!login || !apiCode || !contrato)) return storedToken;
  if (!login || !apiCode || !contrato) return '';

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const refreshedToken = agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN));
    const refreshedExpiresAt = agfParseDateMaybe_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT));
    if (refreshedToken && agfSecondsUntil_(refreshedExpiresAt) > AGF_ADDRESS_CONFIG.CORREIOS_TOKEN_REFRESH_BUFFER_SECONDS) {
      return refreshedToken;
    }

    const generated = agfGenerateCorreiosToken_({ login, apiCode, contrato });
    props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN, generated.token);
    props.setProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT, generated.expiresAt.toISOString());
    return generated.token;
  } finally {
    lock.releaseLock();
  }
}

function agfGenerateCorreiosToken_(credentials) {
  const props = PropertiesService.getScriptProperties();
  const login = credentials.login;
  const apiCode = credentials.apiCode;
  const contrato = credentials.contrato;
  const drRaw = agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_DR));
  const dr = drRaw ? agfToInt_(drRaw, null) : null;

  const body = { numero: contrato };
  if (dr !== null && Number.isFinite(dr)) body.dr = dr;

  const headers = {
    Authorization: `Basic ${Utilities.base64Encode(`${login}:${apiCode}`)}`,
    Accept: 'application/json'
  };

  const urls = agfUniqueStrings_([
    agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_TOKEN_URL_PRIMARY)),
    AGF_ADDRESS_CONFIG.CORREIOS_TOKEN_URL_PRIMARY,
    agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_TOKEN_URL_FALLBACK)),
    AGF_ADDRESS_CONFIG.CORREIOS_TOKEN_URL_FALLBACK
  ]);

  const errors = [];
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    try {
      const json = agfFetchJson_(url, 'correios_token', {
        method: 'post',
        headers,
        contentType: 'application/json',
        payload: JSON.stringify(body)
      });
      const token = agfExtractCorreiosToken_(json);
      if (!token) throw new Error('Resposta da API Token sem token reconhecível.');
      const expiresAt = agfExtractCorreiosTokenExpiration_(json);
      return { token, expiresAt, raw: json };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
      agfLog_('Falha ao gerar token Correios', { url, error: error.message });
    }
  }

  throw new Error(`Não foi possível gerar token Correios. ${errors.join(' | ')}`);
}

function agfExtractCorreiosToken_(json) {
  if (!json || typeof json !== 'object') return '';
  return agfCleanText_(
    json.token ||
    json.access_token ||
    json.accessToken ||
    json.bearerToken ||
    json.bearer_token ||
    json.jwt ||
    (json.dados && (json.dados.token || json.dados.access_token)) ||
    ''
  );
}

function agfExtractCorreiosTokenExpiration_(json) {
  const fallback = new Date(Date.now() + 55 * 60 * 1000);
  if (!json || typeof json !== 'object') return fallback;

  const candidates = [
    json.expiraEm,
    json.expiracao,
    json.dataExpiracao,
    json.validade,
    json.expiresAt,
    json.expires_at,
    json.expiration,
    json.dataHoraExpiracao,
    json.dados && json.dados.expiraEm,
    json.dados && json.dados.dataExpiracao
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = agfParseDateMaybe_(candidates[i]);
    if (parsed && parsed.getTime() > Date.now()) return parsed;
  }

  const seconds = agfToInt_(json.expires_in || json.expiresIn || (json.dados && json.dados.expires_in), 0);
  if (seconds > 0) return new Date(Date.now() + seconds * 1000);

  return fallback;
}

function agfGetCorreiosBaseUrl_() {
  const props = PropertiesService.getScriptProperties();
  return agfCleanText_(props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_BASE_URL)) || AGF_ADDRESS_CONFIG.CORREIOS_CEP_BASE_URL;
}

function agfProviderCorreiosByCep_(cep) {
  const token = agfGetCorreiosBearerToken_();
  if (!token) throw new Error('CORREIOS_NOT_CONFIGURED: configure as credenciais da API Busca CEP dos Correios.');

  const baseUrl = agfGetCorreiosBaseUrl_();
  const cleanCep = agfOnlyDigits_(cep);
  const urls = agfUniqueStrings_([
    `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(cleanCep)}`,
    agfBuildCorreiosAddressUrl_(baseUrl, { cep: cleanCep, size: 10, page: 0 })
  ]);

  const errors = [];
  for (let i = 0; i < urls.length; i += 1) {
    try {
      const json = agfFetchJson_(urls[i], 'correios_cep', {
        headers: { Authorization: `Bearer ${token}` },
        maxAttempts: 2
      });

      const items = agfExtractCorreiosAddressArray_(json)
        .map(item => agfNormalizeCorreiosItem_(item, 'correios'))
        .filter(Boolean);

      if (items.length) return items;
    } catch (error) {
      errors.push(`${urls[i]}: ${error.message}`);
    }
  }

  if (errors.length) throw new Error(errors.join(' | '));
  return [];
}

function agfProviderCorreiosByAddress_(plan, maxResults) {
  if (!plan) return [];
  const token = agfGetCorreiosBearerToken_();
  if (!token) throw new Error('CORREIOS_NOT_CONFIGURED: configure as credenciais da API Busca CEP dos Correios.');

  const totalLimit = agfClamp_(agfToInt_(maxResults, AGF_ADDRESS_CONFIG.MAX_RESULTS), 1, AGF_ADDRESS_CONFIG.CORREIOS_MAX_PAGE_SIZE);
  let results = [];
  const errors = [];

  const directQueries = agfBuildCorreiosDirectAddressQueries_(plan, totalLimit);
  for (let i = 0; i < directQueries.length; i += 1) {
    try {
      const items = agfProviderCorreiosByAddressSingle_(directQueries[i], token);
      results = results.concat(items);
      results = agfDedupeAddressResults_(results);
      if (results.length >= totalLimit) return agfLimitResults_(results, totalLimit);
    } catch (error) {
      errors.push(`direct_${i + 1}: ${error.message}`);
      if (!agfIsTemporaryProviderError_(error.message)) {
        agfLog_('Falha parcial em busca direta Correios', { error: error.message, query: directQueries[i] });
      }
    }
  }

  if (!plan.strictUf && !plan.strictCidade) {
    try {
      const segmented = agfProviderCorreiosByAddressSegmentedByUf_(plan, totalLimit, token);
      results = results.concat(segmented);
    } catch (error) {
      errors.push(`segmented: ${error.message}`);
    }
  }

  results = agfDedupeAddressResults_(results);
  if (!results.length && errors.length) {
    throw new Error(errors.slice(0, 8).join(' | '));
  }

  return agfLimitResults_(results, totalLimit);
}

function agfBuildCorreiosDirectAddressQueries_(plan, maxResults) {
  const size = agfClamp_(agfToInt_(maxResults, AGF_ADDRESS_CONFIG.MAX_RESULTS), 1, AGF_ADDRESS_CONFIG.CORREIOS_MAX_PAGE_SIZE);
  const variants = agfBuildCorreiosSearchVariants_(plan).slice(0, 8);
  const queries = [];

  variants.forEach(variant => {
    const baseQuery = {
      logradouro: variant,
      uf: plan.strictUf,
      localidade: plan.strictCidade,
      bairro: plan.bairro,
      size,
      page: 0
    };

    queries.push(baseQuery);

    const tipoLogradouro = agfNormalizeStreetTypeForCorreios_(plan.tipoLogradouro);
    if (tipoLogradouro) {
      queries.push(Object.assign({}, baseQuery, { tipoLogradouro }));
    }
  });

  return agfUniqueQueryObjects_(queries);
}

function agfProviderCorreiosByAddressSingle_(query, token) {
  const baseUrl = agfGetCorreiosBaseUrl_();
  return agfFetchCorreiosAddressPages_(baseUrl, query, token, AGF_ADDRESS_CONFIG.CORREIOS_ADDRESS_PAGE_LIMIT);
}

function agfFetchCorreiosAddressPages_(baseUrl, query, token, pageLimit) {
  const limitPages = agfClamp_(agfToInt_(pageLimit, AGF_ADDRESS_CONFIG.CORREIOS_ADDRESS_PAGE_LIMIT), 1, 10);
  const cleanQuery = Object.assign({}, query || {});
  const size = agfClamp_(agfToInt_(cleanQuery.size, AGF_ADDRESS_CONFIG.MAX_RESULTS), 1, AGF_ADDRESS_CONFIG.CORREIOS_MAX_PAGE_SIZE);
  let page = agfClamp_(agfToInt_(cleanQuery.page, 0), 0, 9999);
  let totalPages = null;
  let results = [];

  for (let count = 0; count < limitPages; count += 1) {
    const pagedQuery = Object.assign({}, cleanQuery, {
      size,
      page
    });

    const url = agfBuildCorreiosAddressUrl_(baseUrl, pagedQuery);
    const json = agfFetchJson_(url, 'correios_cep', {
      headers: { Authorization: `Bearer ${token}` },
      maxAttempts: 2
    });

    const items = agfExtractCorreiosAddressArray_(json)
      .map(item => agfNormalizeCorreiosItem_(item, 'correios'))
      .filter(Boolean);

    if (items.length) results = results.concat(items);

    const pageInfo = json && typeof json === 'object' ? json.page : null;
    totalPages = pageInfo && Number.isFinite(Number(pageInfo.totalPages))
      ? Number(pageInfo.totalPages)
      : totalPages;

    if (!totalPages || page + 1 >= totalPages) break;
    page += 1;
  }

  return agfDedupeAddressResults_(results);
}

function agfProviderCorreiosByAddressSegmentedByUf_(plan, maxResults, token) {
  const baseUrl = agfGetCorreiosBaseUrl_();
  const totalLimit = agfClamp_(agfToInt_(maxResults, AGF_ADDRESS_CONFIG.MAX_RESULTS), 1, AGF_ADDRESS_CONFIG.CORREIOS_MAX_PAGE_SIZE);
  const variants = agfBuildCorreiosSearchVariants_(plan).slice(0, 6);
  const ufs = agfBuildCorreiosNationalUfList_(plan.preferUf);
  const requests = [];

  variants.forEach(variant => {
    ufs.forEach(uf => {
      const url = agfBuildCorreiosAddressUrl_(baseUrl, {
        uf,
        logradouro: variant,
        size: AGF_ADDRESS_CONFIG.MAX_RESULTS,
        page: 0
      });

      requests.push({
        url,
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'AGF-Address-Service/1.3'
        }
      });
    });
  });

  const chunks = agfChunkArray_(requests, 6);
  const errors = [];
  let successResponses = 0;
  let results = [];

  for (let c = 0; c < chunks.length; c += 1) {
    let responses = [];
    try {
      responses = UrlFetchApp.fetchAll(chunks[c]);
    } catch (error) {
      errors.push(`fetchAll_batch_${c + 1}: ${error.message}`);
      continue;
    }

    for (let i = 0; i < responses.length; i += 1) {
      const response = responses[i];
      const status = response.getResponseCode();
      const text = response.getContentText('UTF-8');

      if (status >= 200 && status < 300) {
        successResponses += 1;
        const json = agfSafeParseJson_(text);
        if (!json) {
          errors.push(`correios_segmented_INVALID_JSON_${status}`);
          continue;
        }

        const items = agfExtractCorreiosAddressArray_(json)
          .map(item => agfNormalizeCorreiosItem_(item, 'correios'))
          .filter(Boolean);

        if (items.length) results = results.concat(items);
        continue;
      }

      const message = text ? text.slice(0, 240) : '';
      errors.push(`correios_segmented_HTTP_${status}${message ? ': ' + message : ''}`);
    }

    results = agfDedupeAddressResults_(results);
    if (results.length >= totalLimit) break;
  }

  if (!results.length && successResponses === 0 && errors.length) {
    throw new Error(errors.slice(0, 6).join(' | '));
  }

  if (errors.length) {
    agfLog_('Busca Correios segmentada por UF concluída com falhas parciais', {
      successResponses,
      errors: errors.slice(0, 5)
    });
  }

  return agfLimitResults_(agfDedupeAddressResults_(results), totalLimit);
}

function agfBuildCorreiosSearchVariants_(plan) {
  const raw = plan ? plan.logradouroQuery : '';
  const core = plan ? plan.logradouroCore : '';
  const variants = plan && Array.isArray(plan.variants) ? plan.variants : [];

  const priority = [];
  const candidates = [];

  [raw, core].concat(variants).forEach(item => {
    const clean = agfCleanText_(item);
    if (!clean) return;

    // A busca oficial dos Correios costuma ser mais sensível à grafia do DNE.
    // Por isso, quando conhecemos uma versão acentuada provável, tentamos primeiro.
    agfBuildPortugueseAccentVariants_(clean).forEach(variant => priority.push(variant));
    agfBuildPortugueseAccentVariants_(agfRemoveStreetTypePrefix_(clean)).forEach(variant => priority.push(variant));

    candidates.push(clean);
    candidates.push(agfRemoveStreetTypePrefix_(clean));
    candidates.push(agfStripAccents_(clean));
    candidates.push(agfStripAccents_(agfRemoveStreetTypePrefix_(clean)));
  });

  return agfUniqueStrings_(priority.concat(candidates))
    .filter(item => item.length >= 3)
    .sort((a, b) => agfScoreCorreiosVariant_(b, plan) - agfScoreCorreiosVariant_(a, plan));
}

function agfScoreCorreiosVariant_(variant, plan) {
  let score = 0;
  const normalized = agfNormalizeForCompare_(variant);
  const core = agfNormalizeForCompare_(plan && plan.logradouroCore);
  const raw = agfNormalizeForCompare_(plan && plan.logradouroQuery);

  if (normalized === core) score += 20;
  if (normalized === raw) score += 10;
  if (variant !== agfStripAccents_(variant)) score += 4;
  if (variant.length <= 40) score += 2;
  return score;
}

function agfBuildCorreiosNationalUfList_(preferredUf) {
  return agfMovePreferredToFront_(AGF_VALID_UFS, preferredUf || AGF_ADDRESS_CONFIG.DEFAULT_UF);
}

function agfBuildCorreiosAddressUrl_(baseUrl, params) {
  let url = baseUrl;
  const clean = params || {};

  Object.keys(clean).forEach(key => {
    const value = clean[key];
    if (value === undefined || value === null || value === '') return;

    // O Swagger define alguns parâmetros como array (ex.: cep e sort).
    // Para compatibilidade com query string, enviamos valores múltiplos como parâmetros repetidos.
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item !== undefined && item !== null && String(item).trim() !== '') {
          url = agfAppendQueryParam_(url, key, item);
        }
      });
      return;
    }

    url = agfAppendQueryParam_(url, key, value);
  });

  return url;
}

function agfUniqueQueryObjects_(queries) {
  const seen = new Set();
  return (queries || []).filter(query => {
    const key = JSON.stringify(query || {});
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function agfExtractCorreiosAddressArray_(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];

  const candidates = [
    json.itens,
    json.items,
    json.content,
    json.enderecos,
    json.resultados,
    json.data,
    json.lista,
    json.dados && json.dados.itens,
    json.dados && json.dados.content,
    json._embedded && json._embedded.itens,
    json._embedded && json._embedded.enderecos,
    json._embedded && json._embedded.enderecoResponseList
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) continue;
    if (Array.isArray(candidate)) return candidate;
    // O Swagger do CEP v3 declara PagedModelEnderecoResponse.itens como EnderecoResponse.
    // Na prática pode vir como array ou objeto; os dois formatos são aceitos.
    if (typeof candidate === 'object') return [candidate];
  }

  if (json.cep || json.logradouro || json.nomeLogradouro || json.nome) return [json];
  return [];
}

function agfFetchCepFromProviders_(cep) {
  const errors = [];

  try {
    const results = agfProviderCorreiosByCep_(cep);
    if (results.length) {
      return agfSuccess_({
        type: 'cep',
        input: cep,
        provider: 'correios',
        confidence: 'high',
        results: agfDedupeAddressResults_(results),
        message: 'CEP encontrado na base oficial dos Correios.'
      });
    }
  } catch (error) {
    errors.push(`correios: ${error.message}`);
    agfLog_('Falha em consulta de CEP Correios', { error: error.message });
  }

  const temporaryFailure = errors.some(agfIsTemporaryProviderError_);
  if (temporaryFailure) {
    return agfError_('CORREIOS_TEMPORARY_UNAVAILABLE', 'A API Busca CEP dos Correios demorou demais ou ficou temporariamente indisponível. Tente novamente.', {
      type: 'cep',
      input: cep,
      providerErrors: errors
    });
  }

  return agfError_('CEP_NOT_FOUND', 'Nenhum endereço encontrado para este CEP na base oficial dos Correios.', {
    type: 'cep',
    input: cep,
    providerErrors: errors
  });
}

function agfFetchAddressFromProviders_(plan, maxResults) {
  const errors = [];
  let results = [];

  try {
    results = agfProviderCorreiosByAddress_(plan, maxResults);
  } catch (error) {
    errors.push(`correios: ${error.message}`);
    agfLog_('Falha em busca de endereço Correios', { error: error.message });
  }

  const deduped = agfDedupeAddressResults_(results);
  const ranked = agfRankAddressResults_(deduped, plan);
  const enriched = agfEnrichResultsWithInput_(agfLimitResults_(ranked, maxResults), plan);

  if (enriched.length) {
    return agfSuccess_({
      type: 'address',
      input: plan.rawQuery,
      normalizedInput: plan.logradouroCore,
      inputNumero: plan.numeroInformado,
      provider: 'correios',
      confidence: enriched.length === 1 ? 'high' : 'medium',
      scope: plan.scope,
      results: enriched,
      search: agfPublicSearchPlan_(plan),
      message: agfBuildAddressSuccessMessage_(enriched, plan)
    });
  }

  const temporaryFailure = errors.some(agfIsTemporaryProviderError_);
  if (temporaryFailure) {
    return agfError_('CORREIOS_TEMPORARY_UNAVAILABLE', 'A API Busca CEP dos Correios demorou demais ou ficou temporariamente indisponível. Tente novamente ou informe também cidade/UF para uma consulta mais rápida.', {
      type: 'address',
      input: plan.rawQuery,
      normalizedInput: plan.logradouroCore,
      inputNumero: plan.numeroInformado,
      scope: plan.scope,
      search: agfPublicSearchPlan_(plan),
      providerErrors: errors
    });
  }

  return agfError_('ADDRESS_NOT_FOUND', 'Nenhum endereço encontrado na base oficial dos Correios para esta busca.', {
    type: 'address',
    input: plan.rawQuery,
    normalizedInput: plan.logradouroCore,
    inputNumero: plan.numeroInformado,
    scope: plan.scope,
    search: agfPublicSearchPlan_(plan),
    providerErrors: errors
  });
}

function agfBuildAddressSuccessMessage_(results, plan) {
  const count = results.length;
  if (plan.scope === 'national_official') {
    return count === 1
      ? '1 resultado encontrado no Brasil pela base oficial dos Correios.'
      : `${count} resultados encontrados no Brasil pela base oficial dos Correios.`;
  }

  return count === 1
    ? '1 endereço encontrado na base oficial dos Correios.'
    : `${count} endereços encontrados na base oficial dos Correios.`;
}
