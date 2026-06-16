/**
 * APP ETIQUETAS AGF — 08_CWS_CEP.gs
 * Consulta de CEP com 2 fontes e fallback automático.
 *
 * ORDEM (v2.2.x ajustado):
 *  1. Correios API CEP primeiro
 *  2. ViaCEP como fallback
 *
 * Motivo:
 *  - O manual oficial da API Busca CEP dos Correios posiciona a
 *    busca de endereço pelo componente oficial da plataforma,
 *    com autorização por contrato e endpoint específico.
 *  - ViaCEP continua útil como contingência quando o componente
 *    não estiver habilitado, o token estiver inválido ou houver
 *    indisponibilidade momentânea no CWS.
 *
 * Observação:
 *  - O manual PDF antigo fala em GET /v1/endereços/{cep}.
 *  - A documentação oficial mais nova da API Busca CEP mostra
 *    GET /v2/endereços/{cep}. Por isso tentamos v2 primeiro e
 *    mantemos um fallback legado para variações de ambiente.
 *
 * Cache: CEPs raramente mudam, cache de 24h por chave de CEP.
 */

const CEP_CACHE_TTL_SEC = 60 * 60 * 24;

/**
 * Consulta CEP tentando Correios → ViaCEP.
 * Retorna { cep, logradouro, complemento, bairro, cidade, uf, fonte }.
 * Lança erro se nenhuma fonte encontrar.
 */
function buscarCepCorreios_(client, cep) {
  const d = digitsOnly_(cep);
  if (!isValidCep_(d)) throw new Error('CEP inválido (deve ter 8 dígitos)');

  const cache = CacheService.getScriptCache();
  const cacheKey = 'CEP_' + d;
  const cached = cache.get(cacheKey);
  if (cached) {
    const parsed = safeJsonParse_(cached);
    if (parsed) {
      parsed.fonte = (parsed.fonte || 'CACHE') + '_CACHED';
      return parsed;
    }
  }

  let result = null;
  const tentativas = [];

  // ======== TENTATIVA 1: Correios API CEP (oficial) ========
  try {
    result = buscarCepApiCorreios_(client, d, tentativas);
  } catch (e) {
    tentativas.push({ fonte: 'CORREIOS', erro: e.message });
    logEvent_('WARN', 'CEP', 'CORREIOS_FALHOU', {
      cep: d,
      erro: e.message,
      cwsCode: e.cwsCode || ''
    });
  }

  // ======== TENTATIVA 2: ViaCEP (fallback) ========
  if (!result || !enderecoCompleto_(result)) {
    try {
      const url = 'https://viacep.com.br/ws/' + d + '/json/';
      const resp = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      });
      const code = resp.getResponseCode();
      const text = resp.getContentText();
      tentativas.push({ fonte: 'VIACEP', code: code });

      if (code === 200) {
        const j = safeJsonParse_(text);
        if (j && !j.erro) {
          const novo = normalizarEndereco_(j, d, 'VIACEP');
          if (enderecoCompleto_(novo) || !result) {
            result = novo;
          }
        }
      }
    } catch (e) {
      tentativas.push({ fonte: 'VIACEP', erro: e.message });
      logEvent_('WARN', 'CEP', 'VIACEP_FALHOU', { cep: d, erro: e.message });
    }
  }

  if (!result) {
    logEvent_('ERRO', 'CEP', 'NAO_ENCONTRADO', { cep: d, tentativas: tentativas });
    throw new Error('CEP não encontrado: ' + d);
  }

  logEvent_('INFO', 'CEP', 'ENCONTRADO', {
    cep: d,
    fonte: result.fonte,
    logradouro: result.logradouro,
    bairro: result.bairro,
    cidade: result.cidade,
    uf: result.uf,
    completo: enderecoCompleto_(result)
  });

  cache.put(cacheKey, JSON.stringify(result), CEP_CACHE_TTL_SEC);
  return result;
}

/**
 * Tenta consultar a API oficial dos Correios.
 * Ordem de tentativa:
 *   1. /v2/enderecos/{cep}
 *   2. /v3/enderecos/{cep} (fallback legado)
 */
function buscarCepApiCorreios_(client, cep, tentativas) {
  const paths = [
    '/v2/enderecos/' + cep,
    '/v3/enderecos/' + cep
  ];

  let melhor = null;
  let ultimoErro = null;

  paths.forEach(function (path) {
    if (melhor) return;
    try {
      const resp = cwsRequest_(client, {
        service: 'CEP',
        path: path,
        method: 'get'
      });
      tentativas.push({ fonte: 'CORREIOS', path: path, code: resp.code });
      const j = resp.json;
      if (j && typeof j === 'object') {
        const novo = normalizarEndereco_(j, cep, 'CORREIOS');
        if (enderecoCompleto_(novo) || !melhor) {
          melhor = novo;
        }
      }
    } catch (e) {
      ultimoErro = e;
      tentativas.push({
        fonte: 'CORREIOS',
        path: path,
        erro: e.message,
        cwsCode: e.cwsCode || ''
      });
    }
  });

  if (melhor) return melhor;
  if (ultimoErro) throw ultimoErro;
  return null;
}

/**
 * Normaliza a resposta de qualquer fonte num formato único.
 */
function normalizarEndereco_(j, cep, fonte) {
  return {
    cep: cep,
    logradouro: sanitize_(pickFirst_(j, [
      'logradouro', 'nomeLogradouro', 'street', 'endereco', 'nome'
    ])),
    complemento: sanitize_(pickFirst_(j, [
      'complemento', 'complemento2'
    ])),
    bairro: sanitize_(pickFirst_(j, [
      'bairro', 'nomeBairro', 'neighborhood'
    ])),
    cidade: sanitize_(pickFirst_(j, [
      'localidade', 'cidade', 'nomeLocalidade', 'municipio', 'city'
    ])),
    uf: upper_(pickFirst_(j, [
      'uf', 'estado', 'siglaUf', 'state'
    ])),
    fonte: fonte
  };
}

/**
 * Um endereço é "completo" se tem pelo menos logradouro OU (cidade + uf).
 * CEPs de cidade inteira vêm sem logradouro — aceitável.
 */
function enderecoCompleto_(r) {
  if (!r) return false;
  if (nonEmpty_(r.logradouro)) return true;
  if (nonEmpty_(r.cidade) && nonEmpty_(r.uf)) return true;
  return false;
}

/**
 * AÇÃO: cep
 */
function action_cep_(params) {
  const client = getFullClientFromSession_(params.sessionToken);
  return buscarCepCorreios_(client, params.cep);
}
