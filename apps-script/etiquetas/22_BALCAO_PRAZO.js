/**
 * APP ETIQUETAS AGF — 22_BALCAO_PRAZO.gs
 * Consulta API Prazo para a calculadora de balcão.
 */

function balcaoPrazoDisponivel_() {
  const props = PropertiesService.getScriptProperties();
  return !!(
    props.getProperty(BCFG.PROPS.PRAZO_LOGIN) &&
    props.getProperty(BCFG.PROPS.PRAZO_TOKEN_API) &&
    props.getProperty(BCFG.PROPS.PRAZO_CARTAO)
  );
}

function balcaoGetPrazoToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(BCFG.PROPS.PRAZO_TOKEN_CACHE);
  if (cached) {
    const parsed = balcaoSafeJson_(cached);
    if (parsed && parsed.token) return parsed;
  }

  const props = PropertiesService.getScriptProperties();
  const login = sanitize_(props.getProperty(BCFG.PROPS.PRAZO_LOGIN));
  const tokenApi = sanitize_(props.getProperty(BCFG.PROPS.PRAZO_TOKEN_API));
  const cartao = balcaoDigits_(props.getProperty(BCFG.PROPS.PRAZO_CARTAO));
  const ambiente = upper_(props.getProperty(BCFG.PROPS.PRAZO_AMBIENTE) || 'PRODUCAO');
  if (!login || !tokenApi || !cartao) throw new Error('API Prazo não configurada. Rode balcaoConfigurarApiPrazo(...).');

  const baseToken = ambiente === 'HOMOLOGACAO' ? 'https://apihom.correios.com.br/token' : 'https://api.correios.com.br/token';
  const url = baseToken + '/v1/autentica/cartaopostagem';
  const basic = Utilities.base64Encode(login + ':' + tokenApi);
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ numero: cartao }),
    headers: { Accept: 'application/json', Authorization: 'Basic ' + basic },
    muteHttpExceptions: true,
    followRedirects: true
  });
  const code = resp.getResponseCode();
  const text = resp.getContentText() || '';
  if (code !== 200 && code !== 201) {
    throw new Error('Token API Prazo falhou (' + code + '): ' + (parseCwsErrorMessage_ ? parseCwsErrorMessage_(text) : text));
  }
  const json = balcaoSafeJson_(text);
  if (!json || !json.token) throw new Error('Token API Prazo não retornou token.');
  const out = { token: json.token, expiraEm: json.expiraEm || '', apis: (json.cartaoPostagem && json.cartaoPostagem.api) || [] };
  cache.put(BCFG.PROPS.PRAZO_TOKEN_CACHE, JSON.stringify(out), 60 * 60 * 5);
  return out;
}

function balcaoConsultarPrazo_(codigoServico, cepOrigem, cepDestino) {
  if (!balcaoPrazoDisponivel_()) {
    return { ok: false, erro: 'API Prazo não configurada.' };
  }
  const props = PropertiesService.getScriptProperties();
  const ambiente = upper_(props.getProperty(BCFG.PROPS.PRAZO_AMBIENTE) || 'PRODUCAO');
  const basePrazo = ambiente === 'HOMOLOGACAO' ? 'https://apihom.correios.com.br/prazo' : 'https://api.correios.com.br/prazo';
  const token = balcaoGetPrazoToken_().token;
  const url = basePrazo + '/v1/nacional/' + codigoServico + balcaoBuildQuery_({
    cepOrigem: balcaoDigits_(cepOrigem),
    cepDestino: balcaoDigits_(cepDestino)
  });
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
    followRedirects: true
  });
  const code = resp.getResponseCode();
  const text = resp.getContentText() || '';
  if (code < 200 || code >= 300) {
    return { ok: false, erro: 'Prazo falhou (' + code + '): ' + (parseCwsErrorMessage_ ? parseCwsErrorMessage_(text) : text) };
  }
  const j = balcaoSafeJson_(text) || {};
  return {
    ok: true,
    prazoDias: Number(j.prazoEntrega || j.prazo || 0),
    dataMaxima: sanitize_(j.dataMaxima || ''),
    entregaDomiciliar: sanitize_(j.entregaDomiciliar || ''),
    entregaSabado: sanitize_(j.entregaSabado || ''),
    raw: j
  };
}
