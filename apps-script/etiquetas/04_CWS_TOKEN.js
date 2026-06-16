/**
 * APP ETIQUETAS AGF — 04_CWS_TOKEN.gs
 * Autenticação contra a API dos Correios.
 *
 * ============================================================
 * CORREÇÃO CRÍTICA: GTW-012 (acesso não autorizado API 36)
 * ============================================================
 * O código anterior usava `/v1/autentica` (token genérico), que NÃO
 * carrega o vínculo com o cartão de postagem. Resultado: a Correios
 * não consegue validar permissões da API restrita 36 (Pré-Postagem)
 * e devolve GTW-012.
 *
 * A correção é usar `/v1/autentica/cartaopostagem` enviando
 * { "numero": "<numero_do_cartao>" } no body. O JWT resultante
 * carrega `cartaoPostagem.api: [36, ...]` e a Correios consegue
 * validar permissões.
 *
 * Fonte: Manual de Integração Correios API V2.4, capítulo 5.A
 * ("Realizando o primeiro teste") e capítulo 11 ("Como utilizar
 * o mesmo token para vários recursos"). O exemplo do POST está
 * na página 11 e mostra explicitamente o body { "numero": "..." }.
 * ============================================================
 *
 * Cache: token vale 24h. Cacheamos pelo tempo real (expiraEm)
 * menos 30min de margem de segurança. Fallback: 23h.
 *
 * Multi-tenant: cada cliente tem um cartão, então a chave de cache
 * é por cartão (não por LOGIN_APP) para permitir compartilhar token
 * entre múltiplos LOGIN_APP do mesmo cartão se for o caso.
 */

function resolveCwsAmbiente_(client) {
  const amb = upper_(client.AMBIENTE_CWS || 'PRODUCAO');
  return amb === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : 'PRODUCAO';
}

function getCwsBase_(client, service) {
  const ambiente = resolveCwsAmbiente_(client);
  const bases = CFG.CWS.BASES[ambiente];
  if (!bases || !bases[service]) {
    throw new Error('Endpoint CWS não configurado: ' + ambiente + ' / ' + service);
  }
  return bases[service];
}

function validateCwsCredentials_(client) {
  const faltando = [];
  if (!nonEmpty_(client.LOGIN_IDCORREIOS)) faltando.push('LOGIN_IDCORREIOS');
  if (!nonEmpty_(client.TOKEN_API)) faltando.push('TOKEN_API (código de acesso à API)');
  if (!nonEmpty_(client.CARTAO_POSTAGEM)) faltando.push('CARTAO_POSTAGEM');
  if (!nonEmpty_(client.AMBIENTE_CWS)) faltando.push('AMBIENTE_CWS');
  if (faltando.length) {
    throw new Error('Credenciais Correios incompletas para este cliente: ' + faltando.join(', '));
  }
}

function cwsTokenCacheKey_(client) {
  const ambiente = resolveCwsAmbiente_(client);
  const cartao = normalizeCartaoPostagem_(client.CARTAO_POSTAGEM);
  return 'CWS_TKN_' + ambiente + '_' + cartao;
}

/**
 * Calcula o TTL real do token a partir de expiraEm devolvido pela API.
 * Aplica margem de segurança para renovar antes de expirar de fato.
 */
function calcTokenTtl_(expiraEm) {
  const exp = parseExpiraEm_(expiraEm);
  if (!exp) return CFG.CWS.TOKEN_TTL_FALLBACK_SEC;
  const diffSec = Math.floor((exp.getTime() - Date.now()) / 1000);
  const ttl = diffSec - CFG.CWS.TOKEN_MARGEM_SEGURANCA_SEC;
  // Limites do CacheService: máximo 6h por entrada
  if (ttl > 21600) return 21600;
  if (ttl < 60) return 60;
  return ttl;
}

/**
 * Gera token novo via /v1/autentica/cartaopostagem.
 * NÃO consulta cache. Use cwsGetToken_ para uso normal.
 */
function cwsGenerateToken_(client) {
  validateCwsCredentials_(client);

  const url = getCwsBase_(client, 'TOKEN') + '/v1/autentica/cartaopostagem';
  const cartao = normalizeCartaoPostagem_(client.CARTAO_POSTAGEM);
  const login = sanitize_(client.LOGIN_IDCORREIOS);
  const codigoAcesso = sanitize_(client.TOKEN_API);

  const basic = Utilities.base64Encode(login + ':' + codigoAcesso);
  const body = JSON.stringify({ numero: cartao });

  const params = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Basic ' + basic
    },
    payload: body,
    muteHttpExceptions: true,
    followRedirects: true
  };

  const t0 = nowMs_();
  const resp = UrlFetchApp.fetch(url, params);
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  const elapsedMs = nowMs_() - t0;

  // Log estruturado da chamada (sem expor o token gerado)
  logEvent_('INFO', 'CWS', 'TOKEN_REQ', {
    ambiente: resolveCwsAmbiente_(client),
    cartao: cartao,
    httpCode: code,
    elapsedMs: elapsedMs,
    ok: code === 200 || code === 201
  });

  if (code !== 200 && code !== 201) {
    const errMsg = parseCwsErrorMessage_(text) || ('HTTP ' + code);
    throw new Error('Falha ao gerar token Correios (' + code + '): ' + errMsg);
  }

  const json = safeJsonParse_(text);
  if (!json) {
    throw new Error('Resposta inválida do endpoint de token: ' + truncate_(text, 300));
  }

  const token = sanitize_(json.token || json.jwt);
  if (!token) {
    throw new Error('Resposta sem token. Body: ' + truncate_(text, 300));
  }

  // Validação extra: o JWT devolvido deve incluir API 36 nas permissões
  // do cartão. Se não tiver, a Correios vai rejeitar a pré-postagem
  // mais à frente com GTW-012, então melhor avisar AGORA.
  const apisCartao = (json.cartaoPostagem && Array.isArray(json.cartaoPostagem.api))
    ? json.cartaoPostagem.api
    : [];

  const tem36 = apisCartao.indexOf(36) >= 0 || apisCartao.indexOf('36') >= 0;
  if (apisCartao.length > 0 && !tem36) {
    logEvent_('WARN', 'CWS', 'TOKEN_SEM_API36', {
      cartao: cartao,
      apisDisponiveis: apisCartao
    });
    throw new Error(
      'O cartão ' + cartao + ' não tem a API 36 (Pré-Postagem) habilitada. ' +
      'APIs disponíveis: [' + apisCartao.join(', ') + ']. ' +
      'Solicite ao gerente comercial dos Correios a habilitação da API restrita 36.'
    );
  }

  return {
    token: token,
    ambiente: json.ambiente || resolveCwsAmbiente_(client),
    expiraEm: json.expiraEm || '',
    cartaoPostagem: json.cartaoPostagem || null,
    apisAutorizadas: apisCartao
  };
}

/**
 * Obtém token (do cache, ou gera novo). Esta é a função pública.
 */
function cwsGetToken_(client, opts) {
  const forceNew = opts && opts.forceNew;
  const cache = CacheService.getScriptCache();
  const key = cwsTokenCacheKey_(client);

  if (!forceNew) {
    const cached = cache.get(key);
    if (cached) {
      const parsed = safeJsonParse_(cached);
      if (parsed && parsed.token) return parsed;
    }
  }

  const fresh = cwsGenerateToken_(client);
  const ttl = calcTokenTtl_(fresh.expiraEm);
  cache.put(key, JSON.stringify(fresh), ttl);
  return fresh;
}

/**
 * Invalida o token cacheado. Chamado quando recebemos 401/403 e
 * queremos forçar regeneração.
 */
function cwsInvalidateToken_(client) {
  CacheService.getScriptCache().remove(cwsTokenCacheKey_(client));
}

/**
 * Tenta extrair uma mensagem legível do JSON de erro da Correios.
 * Os erros vêm em vários formatos:
 *   { msgs: ["GTW-012: ..."] }
 *   { msgs: [{...}], date, method, path }
 *   { error: "...", message: "..." }
 *   { mensagens: ["..."] }
 */
function parseCwsErrorMessage_(text) {
  if (!text) return '';
  const json = safeJsonParse_(text);
  if (!json) return truncate_(text, 500);

  // Formato comum: {"msgs": [...], "date": "...", "method": "...", "path": "..."}
  if (Array.isArray(json.msgs) && json.msgs.length) {
    return json.msgs.map(m => typeof m === 'string' ? m : safeJsonStringify_(m)).join(' | ');
  }
  if (Array.isArray(json.mensagens) && json.mensagens.length) {
    return json.mensagens.map(m => typeof m === 'string' ? m : safeJsonStringify_(m)).join(' | ');
  }
  if (json.message) return String(json.message);
  if (json.error) return String(json.error);
  if (json.causa) return String(json.causa);
  return truncate_(text, 500);
}

/**
 * AÇÃO: testarTokenCws — gera token e devolve diagnóstico (sem expor o JWT).
 * Útil para validar credenciais de um cliente recém-cadastrado.
 */
function action_testarTokenCws_(params) {
  const fullClient = getFullClientFromSession_(params.sessionToken);
  const tokenInfo = cwsGetToken_(fullClient, { forceNew: true });

  // Atualiza STATUS_TESTE_CWS na planilha
  withLock_(() => {
    const row = fullClient._row;
    if (row) {
      updateCellByHeader_(CFG.SHEETS.CLIENTES, row, 'STATUS_TESTE_CWS', 'OK');
    }
  });

  return {
    ambiente: tokenInfo.ambiente,
    expiraEm: tokenInfo.expiraEm,
    cartaoPostagem: tokenInfo.cartaoPostagem
      ? {
          numero: tokenInfo.cartaoPostagem.numero,
          contrato: tokenInfo.cartaoPostagem.contrato,
          dr: tokenInfo.cartaoPostagem.dr
        }
      : null,
    apisAutorizadas: tokenInfo.apisAutorizadas,
    temApi36: tokenInfo.apisAutorizadas.indexOf(36) >= 0
  };
}