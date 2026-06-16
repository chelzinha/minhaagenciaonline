/**
 * AGF SUPERFRETE — 41_SF_CEP.gs
 * Busca de endereço por CEP para o painel admin SuperFrete.
 *
 * Observação técnica:
 * - O módulo /app já tem busca oficial Correios + fallback, mas depende da sessão/credenciais CWS do app.
 * - O painel SuperFrete Admin usa login próprio SF_*; nesta etapa usamos fonte pública com cache para não acoplar CWS.
 * - Quando a conta SuperFrete/Correios oferecer endpoint próprio de endereço, este serviço pode ser trocado sem alterar o frontend.
 */

function action_sfAdminLookupCep_(params) {
  sfRequireAdmin_(params.sessionToken);
  return sfLookupCep_(params.cep || params.CEP);
}

function sfLookupCep_(cep) {
  const d = digitsOnly_(cep);
  if (!isValidCep_(d)) throw new Error('CEP inválido. Informe 8 dígitos.');

  const cache = CacheService.getScriptCache();
  const cacheKey = 'SF_CEP_' + d;
  const cached = cache.get(cacheKey);
  if (cached) {
    const obj = safeJsonParse_(cached);
    if (obj && obj.cep) {
      obj.fonte = (obj.fonte || 'CACHE') + '_CACHED';
      return obj;
    }
  }

  let result = null;
  const tentativas = [];

  try {
    result = sfLookupCepViaCep_(d);
    tentativas.push({ fonte: 'VIACEP', ok: !!result });
  } catch (e) {
    tentativas.push({ fonte: 'VIACEP', erro: e.message });
  }

  if (!result) {
    try {
      result = sfLookupCepBrasilApi_(d);
      tentativas.push({ fonte: 'BRASILAPI', ok: !!result });
    } catch (e) {
      tentativas.push({ fonte: 'BRASILAPI', erro: e.message });
    }
  }

  if (!result) {
    sfLog_('WARN', 'SF_CEP', 'CEP_NAO_ENCONTRADO', {
      CEP: d,
      TENTATIVAS: tentativas
    });
    throw new Error('CEP não encontrado ou serviço de CEP indisponível.');
  }

  cache.put(cacheKey, JSON.stringify(result), 60 * 60 * 24);
  return result;
}

function sfLookupCepViaCep_(cep) {
  const resp = UrlFetchApp.fetch('https://viacep.com.br/ws/' + cep + '/json/', {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });
  const code = resp.getResponseCode();
  if (code !== 200) throw new Error('ViaCEP HTTP ' + code);
  const j = safeJsonParse_(resp.getContentText());
  if (!j || j.erro) throw new Error('ViaCEP não encontrou o CEP.');
  return sfNormalizeCepResult_(j, cep, 'VIACEP');
}

function sfLookupCepBrasilApi_(cep) {
  const resp = UrlFetchApp.fetch('https://brasilapi.com.br/api/cep/v2/' + cep, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });
  const code = resp.getResponseCode();
  if (code !== 200) throw new Error('BrasilAPI HTTP ' + code);
  const j = safeJsonParse_(resp.getContentText());
  if (!j) throw new Error('BrasilAPI não retornou JSON válido.');
  return sfNormalizeCepResult_(j, cep, 'BRASILAPI');
}

function sfNormalizeCepResult_(j, cep, fonte) {
  return {
    cep: cep,
    logradouro: sanitize_(pickFirst_(j, ['logradouro', 'street', 'address', 'endereco'])),
    complemento: sanitize_(pickFirst_(j, ['complemento', 'complement'])),
    bairro: sanitize_(pickFirst_(j, ['bairro', 'neighborhood', 'district'])),
    cidade: sanitize_(pickFirst_(j, ['localidade', 'cidade', 'city'])),
    uf: upper_(pickFirst_(j, ['uf', 'state', 'estado'])).slice(0, 2),
    fonte: fonte
  };
}
