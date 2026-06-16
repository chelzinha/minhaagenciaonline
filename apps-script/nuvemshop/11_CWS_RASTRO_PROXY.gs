
function nbSanitize_(v) { return String(v == null ? '' : v).trim(); }
function nbUpper_(v) { return nbSanitize_(v).toUpperCase(); }
function nbLower_(v) { return nbSanitize_(v).toLowerCase(); }
function nbNonEmpty_(v) { return nbSanitize_(v).length > 0; }
function nbTruncate_(v, max) { var s = String(v == null ? '' : v); return s.length > max ? s.slice(0, max) + '…' : s; }
function nbNowMs_() { return new Date().getTime(); }
function nbSafeJsonParse_(text) { try { return JSON.parse(text); } catch (e) { return null; } }
function nbSafeJsonStringify_(obj) { try { return JSON.stringify(obj); } catch (e) { return String(obj); } }
function nbDigitsOnly_(v) { return String(v || '').replace(/\D/g, ''); }
function nbParseExpiraEm_(s) {
  var txt = nbSanitize_(s);
  if (!txt) return null;
  var d = new Date(txt);
  return isNaN(d.getTime()) ? null : d;
}
function nbNormalizeCartaoPostagem_(v) {
  var d = nbDigitsOnly_(v);
  return d ? d.padStart(10, '0') : '';
}

function getCwsBaseForStore_(storeId, service) {
  var client = getClienteAppByIdCrm_(getStoreCrmRefByStoreId_(storeId));
  var ambiente = nbUpper_(client.AMBIENTE_CWS || 'PRODUCAO') === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : 'PRODUCAO';
  var bases = {
    HOMOLOGACAO: { TOKEN:'https://apihom.correios.com.br/token', RASTRO:'https://apihom.correios.com.br/srorastro' },
    PRODUCAO: { TOKEN:'https://api.correios.com.br/token', RASTRO:'https://api.correios.com.br/srorastro' }
  };
  return bases[ambiente][service];
}

function getStoreCorreiosClient_(storeId) {
  var client = getClienteAppByIdCrm_(getStoreCrmRefByStoreId_(storeId));
  var faltando = [];
  ['LOGIN_IDCORREIOS','TOKEN_API','CARTAO_POSTAGEM','AMBIENTE_CWS'].forEach(function(k){ if (!nbNonEmpty_(client[k])) faltando.push(k); });
  if (faltando.length) throw new Error('Credenciais Correios incompletas no CLIENTES_APP: ' + faltando.join(', '));
  return client;
}

function cwsTokenCacheKeyForStore_(storeId) {
  var client = getStoreCorreiosClient_(storeId);
  var amb = nbUpper_(client.AMBIENTE_CWS || 'PRODUCAO');
  return 'NS_CWS_TKN_' + amb + '_' + nbNormalizeCartaoPostagem_(client.CARTAO_POSTAGEM);
}

function calcStoreTokenTtl_(expiraEm) {
  var exp = nbParseExpiraEm_(expiraEm);
  if (!exp) return 60 * 60 * 6;
  var ttl = Math.floor((exp.getTime() - Date.now()) / 1000) - (30 * 60);
  if (ttl > 21600) ttl = 21600;
  if (ttl < 60) ttl = 60;
  return ttl;
}

function generateStoreCorreiosToken_(storeId) {
  var client = getStoreCorreiosClient_(storeId);
  var url = getCwsBaseForStore_(storeId, 'TOKEN') + '/v1/autentica/cartaopostagem';
  var basic = Utilities.base64Encode(nbSanitize_(client.LOGIN_IDCORREIOS) + ':' + nbSanitize_(client.TOKEN_API));
  var body = JSON.stringify({ numero: nbNormalizeCartaoPostagem_(client.CARTAO_POSTAGEM) });
  var resp = UrlFetchApp.fetch(url, {
    method:'post', contentType:'application/json', muteHttpExceptions:true, followRedirects:true,
    headers:{ 'Accept':'application/json', 'Authorization':'Basic ' + basic }, payload: body
  });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code !== 200 && code !== 201) throw new Error('Falha ao gerar token Correios (' + code + '): ' + nbTruncate_(text, 600));
  var json = nbSafeJsonParse_(text);
  if (!json || !json.token) throw new Error('Resposta inválida do token Correios.');
  return { token: json.token, expiraEm: json.expiraEm || '' };
}

function getStoreCorreiosToken_(storeId, forceNew) {
  var cache = CacheService.getScriptCache();
  var key = cwsTokenCacheKeyForStore_(storeId);
  if (!forceNew) {
    var cached = cache.get(key);
    if (cached) {
      var parsed = nbSafeJsonParse_(cached);
      if (parsed && parsed.token) return parsed;
    }
  }
  var fresh = generateStoreCorreiosToken_(storeId);
  cache.put(key, nbSafeJsonStringify_(fresh), calcStoreTokenTtl_(fresh.expiraEm));
  return fresh;
}

function queryCorreiosRastroByStore_(storeId, codigoObjeto, resultado) {
  var codigo = nbUpper_(codigoObjeto).replace(/\s+/g,'');
  if (!codigo) throw new Error('Código do objeto obrigatório.');
  var token = getStoreCorreiosToken_(storeId).token;
  var url = getCwsBaseForStore_(storeId, 'RASTRO') + '/v1/objetos/' + encodeURIComponent(codigo) + '?resultado=' + encodeURIComponent(resultado || 'T');
  var t0 = nbNowMs_();
  var resp = UrlFetchApp.fetch(url, { method:'get', muteHttpExceptions:true, followRedirects:true,
    headers:{ 'Accept':'application/json', 'Authorization':'Bearer ' + token } });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  var json = nbSafeJsonParse_(text);
  appendLog_('INFO', 'correios.rastro.req', storeId, '', 'Consulta Rastro Correios', { codigoObjeto:codigo, httpCode:code, elapsedMs:(nbNowMs_()-t0), ok: code>=200 && code<300 });
  if (code === 401 || code === 403) {
    var newToken = getStoreCorreiosToken_(storeId, true).token;
    resp = UrlFetchApp.fetch(url, { method:'get', muteHttpExceptions:true, followRedirects:true,
      headers:{ 'Accept':'application/json', 'Authorization':'Bearer ' + newToken } });
    code = resp.getResponseCode(); text = resp.getContentText(); json = nbSafeJsonParse_(text);
  }
  if (code < 200 || code >= 300) throw new Error('Correios Rastro falhou (' + code + '): ' + nbTruncate_(text, 600));
  return json || {};
}

function normalizeRastroEventoNb_(ev) {
  if (!ev || typeof ev !== 'object') return null;
  var unidade = ev.unidade || {};
  var end = unidade.endereco || {};
  var unidadeDestino = ev.unidadeDestino || {};
  var endDest = unidadeDestino.endereco || {};
  var iso = nbSanitize_(ev.dtHrCriado || ev.dataHora || '');
  var d = nbParseExpiraEm_(iso);
  return {
    codigo: nbSanitize_(ev.codigo),
    tipo: nbSanitize_(ev.tipo),
    descricao: nbSanitize_(ev.descricao),
    detalhe: nbSanitize_(ev.detalhe),
    dataHoraIso: iso,
    dataHora: d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : iso,
    cidade: nbSanitize_(end.cidade),
    uf: nbSanitize_(end.uf),
    unidadeTipo: nbSanitize_(unidade.tipo),
    unidadeDestinoCidade: nbSanitize_(endDest.cidade),
    unidadeDestinoUf: nbSanitize_(endDest.uf),
    unidadeDestinoTipo: nbSanitize_(unidadeDestino.tipo)
  };
}

function inferRastroStatusClassNb_(label) {
  var txt = nbLower_(label);
  if (!txt) return 'info';
  if (/entreg|dispon[ií]vel.*retirada|destinat[aá]rio/.test(txt)) return 'ok';
  if (/devolu|aguardando retirada|tentativa/.test(txt)) return 'warn';
  if (/extravi|roubo|danific|sinistro/.test(txt)) return 'err';
  return 'info';
}

function normalizeRastroResponseNb_(raw, fallbackCodigo) {
  var root = raw || {};
  var lista = Array.isArray(root.objetos) ? root.objetos : (Array.isArray(root.objeto) ? root.objeto : []);
  var obj = lista.length ? lista[0] : root;
  var eventosRaw = Array.isArray(obj.eventos) ? obj.eventos : (Array.isArray(obj.evento) ? obj.evento : []);
  var eventos = eventosRaw.map(normalizeRastroEventoNb_).filter(Boolean).sort(function(a,b){ return String(b.dataHoraIso||'').localeCompare(String(a.dataHoraIso||'')); });
  var atual = eventos[0] || null;
  return {
    codigoObjeto: nbSanitize_(obj.codObjeto || obj.codigoObjeto || fallbackCodigo),
    statusLabel: atual ? atual.descricao : nbSanitize_(obj.descricao || 'Sem atualização'),
    statusClass: inferRastroStatusClassNb_(atual ? atual.descricao : obj.descricao),
    ultimaAtualizacao: atual ? atual.dataHora : '',
    ultimaAtualizacaoIso: atual ? atual.dataHoraIso : '',
    localAtual: atual ? [atual.cidade, atual.uf].filter(Boolean).join('/') : '',
    eventos: eventos,
    bruto: raw
  };
}

function rastrearObjetoPedido_(storeId, codigoObjeto) {
  var raw = queryCorreiosRastroByStore_(storeId, codigoObjeto, 'T');
  return normalizeRastroResponseNb_(raw, codigoObjeto);
}
