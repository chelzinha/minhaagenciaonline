/**
 * 18_CRM_FONTE_D1.gs
 * ------------------------------------------------------------
 * Aba CLIENTES do CRM alimentada pelo Visao 360 (Cloudflare D1), no lugar da BASE_TOTAL.
 *
 * Como funciona
 * - O Worker agf-cadastros-api calcula tudo (30/60 dias, curva por LOCAL, acao) com as mesmas regras do
 *   00_CLIENTES_MASTER_FINAL. Este arquivo so busca o resultado e grava a CLIENTES_MASTER.
 * - O restante do CRM (cadastro manual, tratativas, funil, agenda, prospects) continua igual e
 *   continua lendo a CLIENTES_MASTER.
 * - Cliente que ja existia no CRM mantem o CLIENTE_ID antigo (CLI_000123): a "ponte" casa o nome antigo
 *   (CLIENTES_ALIAS) com o cliente do Cadastro v2. Nenhuma planilha tem ID reescrito.
 * - LOCAIS do CRM passam a ser AGF, BALCAO e METRO. Responsavel (nao admin) so recebe clientes e tratativas
 *   de clientes dos LOCAIS vinculados a ele no cadastro de usuarios (/agf/usuarios).
 *
 * Chave liga/desliga (Script Property CRM_FONTE_CLIENTES):
 *   'D1'                 -> fonte nova
 *   ausente/outro valor  -> comportamento antigo (BASE_TOTAL), sem nenhuma diferenca
 *
 * Script Properties usadas:
 *   AGF_CADASTROS_API_SEGREDO -> mesmo valor do segredo CRM_EXPORT_SEGREDO do Worker (nunca no codigo)
 *   CRM_FONTE_CLIENTES        -> 'D1' para ligar
 *
 * Rotinas para rodar no editor:
 *   crmd1_diagnostico()      -> testa a conexao e mostra o que vai acontecer (nao grava nada)
 *   crmd1_ativarFonteD1()    -> envia a ponte de IDs, troca os LOCAIS, liga a chave e reconstroi a CLIENTES_MASTER
 *   crmd1_enviarPonteLegado()-> reenvia a ponte de IDs (pode repetir quando quiser)
 *   crmd1_voltarParaBaseTotal() -> desliga a chave, devolve os LOCAIS antigos e reconstroi pela BASE_TOTAL
 */

var CRMD1_CFG = Object.freeze({
  API_URL: 'https://agf-cadastros-api.chelzinha.workers.dev',
  SECRET_PROP: 'AGF_CADASTROS_API_SEGREDO',
  FLAG_PROP: 'CRM_FONTE_CLIENTES',
  LOCAIS_BACKUP_PROP: 'CRMD1_LOCAIS_BACKUP',
  LOCAIS: [
    { id: 'AGF', nome: 'AGF', ordem: 10 },
    { id: 'BALCAO', nome: 'BALCÃO', ordem: 20 },
    { id: 'METRO', nome: 'METRO', ordem: 30 }
  ],
  // LOCAL antigo de cliente sem postagem no Visao 360 (so no cadastro manual): CF foi unido ao METRO.
  LOCAL_LEGADO: { CF: 'METRO', 'CENTRO FASHION': 'METRO', 'GAS SHOPPING CENTRO FASHION': 'METRO' },
  SIG_CACHE_SEC: 60,
  PAGINA: 500,
  LOTE_PONTE: 1500
});

var CRMD1_USUARIO_ = null;   // usuario da requisicao atual (payload do token), preenchido no doGet

/* ========================= chave e conexao ========================= */

function crmd1_ativo_() {
  try {
    return String(PropertiesService.getScriptProperties().getProperty(CRMD1_CFG.FLAG_PROP) || '').trim().toUpperCase() === 'D1';
  } catch (e) { return false; }
}

function crmd1_fetch_(path, opts) {
  opts = opts || {};
  var segredo = PropertiesService.getScriptProperties().getProperty(CRMD1_CFG.SECRET_PROP);
  if (!segredo) throw new Error('[CRM_D1] Script Property ' + CRMD1_CFG.SECRET_PROP + ' nao configurada.');
  var params = { method: opts.method || 'get', headers: { 'X-AGF-Segredo': segredo }, muteHttpExceptions: true };
  if (opts.payload) { params.contentType = 'application/json'; params.payload = JSON.stringify(opts.payload); }
  var resp = null, ultimoErro = '';
  for (var tentativa = 0; tentativa < 3; tentativa++) {
    try {
      resp = UrlFetchApp.fetch(CRMD1_CFG.API_URL + path, params);
      var code = resp.getResponseCode();
      if (code >= 500 && tentativa < 2) { Utilities.sleep(800 * (tentativa + 1)); continue; }
      break;
    } catch (err) {
      ultimoErro = err && err.message ? err.message : String(err);
      if (tentativa < 2) Utilities.sleep(800 * (tentativa + 1));
    }
  }
  if (!resp) throw new Error('[CRM_D1] Sem resposta do Worker: ' + ultimoErro);
  var body = {};
  try { body = JSON.parse(resp.getContentText() || '{}'); } catch (e) { body = {}; }
  if (resp.getResponseCode() >= 400 || body.ok === false) {
    throw new Error('[CRM_D1] ' + path + ' -> HTTP ' + resp.getResponseCode() + ': ' + (body.erro || body.error || 'falha'));
  }
  return body;
}

/** Assinatura usada no lugar da assinatura da BASE_TOTAL (op_getBaseSheetSignature_). Cache curto. */
function crmd1_assinatura_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('crmd1_sig');
  if (hit) return hit;
  var sig = crmd1_fetch_('/api/v2/crm/integracao/assinatura').assinatura || ('D1|' + op_nowIso_());
  try { cache.put('crmd1_sig', sig, CRMD1_CFG.SIG_CACHE_SEC); } catch (e) {}
  return sig;
}

/* ========================= CLIENTES_MASTER a partir do D1 ========================= */

function crmd1_buscarMetricas_() {
  var linhas = [], pagina = 1, resp = null;
  do {
    resp = crmd1_fetch_('/api/v2/crm/integracao/exportar?por=' + CRMD1_CFG.PAGINA + '&pagina=' + pagina);
    linhas = linhas.concat(resp.linhas || []);
    pagina++;
  } while (resp && pagina <= Number(resp.paginas || 1) && pagina <= 60);
  return { linhas: linhas, refDate: resp ? resp.refDate : '', conflitos: (resp && resp.conflitos) || [] };
}

/** Campos da master atual que o D1 nao tem (segmento e categoria vinham da BASE_TOTAL ou da edicao manual). */
function crmd1_camposAnteriores_() {
  var sh = op_getSpreadsheet_().getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) return {};
  var values = sh.getDataRange().getValues(), hm = op_buildHeaderMap_(values[0]), out = {};
  values.slice(1).forEach(function (r) {
    var id = op_norm_(op_getCell_(r, hm, 'CLIENTE_ID'));
    if (!id) return;
    out[id] = {
      SEGMENTO_PREDOMINANTE: op_norm_(op_getCell_(r, hm, 'SEGMENTO_PREDOMINANTE')),
      CATEGORIA_PREDOMINANTE: op_norm_(op_getCell_(r, hm, 'CATEGORIA_PREDOMINANTE'))
    };
  });
  return out;
}

function crmd1_localLegado_(local) {
  var k = op_upperNoAccents_(local);
  return CRMD1_CFG.LOCAL_LEGADO[k] || local;
}

/** Substitui op_updateClientesMasterUnlocked_ quando a chave D1 esta ligada. Ja roda dentro do lock. */
function crmd1_atualizarMasterUnlocked_(baseSig) {
  var t0 = new Date().getTime();
  var dados = crmd1_buscarMetricas_();
  if (!dados.linhas.length) throw new Error('[CRM_D1] O Worker ainda nao tem clientes calculados. Aguarde a primeira sincronizacao.');
  var refDate = dados.refDate || op_toYmd_(new Date());
  var anteriores = crmd1_camposAnteriores_();
  var metrics = dados.linhas.map(function (m) {
    var ant = anteriores[m.CLIENTE_ID] || {};
    m.SEGMENTO_PREDOMINANTE = m.SEGMENTO_PREDOMINANTE || ant.SEGMENTO_PREDOMINANTE || 'SEM SEGMENTO';
    m.CATEGORIA_PREDOMINANTE = m.CATEGORIA_PREDOMINANTE || ant.CATEGORIA_PREDOMINANTE || '';
    if (m.FD_PCT === null) m.FD_PCT = '';
    if (m.QD_PCT === null) m.QD_PCT = '';
    if (m.DD_PCT === null) m.DD_PCT = '';
    return m;
  });
  var rows = op_finalizeMasterRows_(metrics, refDate, { acaoPronta: true });
  rows.forEach(function (r) { if (!r.CLIENTE_ID_CADASTRO) r.LOCAL_PREDOMINANTE = crmd1_localLegado_(r.LOCAL_PREDOMINANTE); });
  var ss = op_getSpreadsheet_();
  op_writeMasterSheet_(op_getOrCreateSheet_(ss, OP_CFG.SHEETS.MASTER), rows);
  op_setMasterMeta_(baseSig || crmd1_assinatura_());
  op_invalidateOperationCaches_();
  try { if (typeof crm3_bumpCacheRev_ === 'function') crm3_bumpCacheRev_(); } catch (e) {}
  var resumo = { ok: true, fonte: 'D1', total: rows.length, doVisao360: dados.linhas.length, soCadastro: rows.length - dados.linhas.length,
    refDate: refDate, conflitosDeId: dados.conflitos.length, ms: new Date().getTime() - t0, baseSig: baseSig };
  console.log('[CRM_D1] master reconstruida ' + JSON.stringify(resumo));
  return resumo;
}

/* ========================= ponte de IDs antigos ========================= */

/** IDs antigos com historico no CRM (cadastro manual ou tratativa). */
function crmd1_idsComDados_(ss) {
  var ids = {};
  function coletar(nomeAba, colunas) {
    var sh = ss.getSheetByName(nomeAba);
    if (!sh || sh.getLastRow() < 2) return;
    var values = sh.getDataRange().getValues(), hm = op_buildHeaderMap_(values[0]);
    var idx = colunas.map(function (c) { return hm[op_headerKey_(c)]; }).filter(function (i) { return i !== undefined; });
    var idxTipo = hm.TIPO_ENTIDADE;
    values.slice(1).forEach(function (r) {
      if (idxTipo !== undefined && op_upperNoAccents_(r[idxTipo]) && op_upperNoAccents_(r[idxTipo]) !== 'CLIENTE') return;
      idx.forEach(function (i) { var v = op_norm_(r[i]); if (v) ids[v] = true; });
    });
  }
  coletar('CLIENTES_CADASTRO', ['CLIENTE_ID']);
  coletar('CRM_TRATATIVAS', ['ENTIDADE_ID']);
  coletar(OP_CFG.SHEETS.AGENDA, ['CLIENTE_ID']);
  coletar(OP_CFG.SHEETS.CRM_INTERACTIONS, ['CLIENTE_ID']);
  return ids;
}

/** Envia ao Worker cada ID antigo com o(s) nome(s) dele. Pode repetir: o Worker atualiza. */
function crmd1_enviarPonteLegado() {
  var ss = op_getSpreadsheet_();
  var comDados = crmd1_idsComDados_(ss);
  var itens = [], vistos = {};
  function add(id, nome) {
    id = op_norm_(id); nome = op_norm_(nome);
    if (!id || !nome) return;
    var k = id + '|' + op_upperNoAccents_(nome);
    if (vistos[k]) return;
    vistos[k] = true;
    itens.push({ idAntigo: id, nome: nome, temDados: !!comDados[id] });
  }
  var alias = op_readAliasMap_();
  Object.keys(alias).forEach(function (nome) { add(alias[nome] && alias[nome].CLIENTE_ID, nome); });
  var cad = ss.getSheetByName('CLIENTES_CADASTRO');
  if (cad && cad.getLastRow() >= 2) {
    var values = cad.getDataRange().getValues(), hm = op_buildHeaderMap_(values[0]);
    values.slice(1).forEach(function (r) {
      var id = op_getCell_(r, hm, 'CLIENTE_ID');
      ['NOME_REMETENTE_BASE', 'CLIENTE', 'RAZAO_SOCIAL', 'NOME_FANTASIA'].forEach(function (c) { add(id, op_getCell_(r, hm, c)); });
    });
  }
  var total = { enviados: itens.length, porMetodo: {}, lotes: 0 };
  for (var i = 0; i < itens.length; i += CRMD1_CFG.LOTE_PONTE) {
    var r = crmd1_fetch_('/api/v2/crm/integracao/ponte-legado', { method: 'post', payload: { itens: itens.slice(i, i + CRMD1_CFG.LOTE_PONTE) } });
    total.lotes++;
    Object.keys(r.porMetodo || {}).forEach(function (k) { total.porMetodo[k] = (total.porMetodo[k] || 0) + r.porMetodo[k]; });
  }
  try { CacheService.getScriptCache().remove('crmd1_sig'); } catch (e) {}
  console.log('[CRM_D1] ponte enviada ' + JSON.stringify(total));
  return total;
}

/* ========================= LOCAIS do CRM ========================= */

function crmd1_trocarLocais_() {
  var ss = op_getSpreadsheet_();
  var sh = crm83_ensureLocalsSheetUnlocked_(ss);
  var range = sh.getDataRange(), values = range.getValues(), hm = op_buildHeaderMap_(values[0]);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(CRMD1_CFG.LOCAIS_BACKUP_PROP)) props.setProperty(CRMD1_CFG.LOCAIS_BACKUP_PROP, JSON.stringify(values));
  var novos = {};
  CRMD1_CFG.LOCAIS.forEach(function (l) { novos[op_upperNoAccents_(l.nome)] = l; });
  var existentes = {};
  for (var i = 1; i < values.length; i++) {
    var nome = op_norm_(values[i][hm.NOME_EXIBICAO]);
    if (!nome) continue;
    var key = op_upperNoAccents_(nome);
    var escopo = op_upperNoAccents_(values[i][hm.EXIBIR_EM] || 'CRM');
    var temProspect = /PROSPECT|AMBOS|TODOS/.test(escopo), temCrm = /CRM|AMBOS|TODOS/.test(escopo);
    if (novos[key]) {
      existentes[key] = true;
      values[i][hm.ATIVO] = 'SIM';
      values[i][hm.EXIBIR_EM] = temProspect ? 'CRM;PROSPECTS' : 'CRM';
      values[i][hm.ORDEM] = novos[key].ordem;
    } else if (temCrm) {
      // local antigo sai do CRM/clientes; se tambem era de prospects, continua la
      if (temProspect) values[i][hm.EXIBIR_EM] = 'PROSPECTS';
      else values[i][hm.ATIVO] = 'NAO';
    }
  }
  range.setValues(values);
  var add = CRMD1_CFG.LOCAIS.filter(function (l) { return !existentes[op_upperNoAccents_(l.nome)]; }).map(function (l) {
    var row = new Array(values[0].length).fill('');
    row[hm.LOCAL_ID] = l.id; row[hm.NOME_EXIBICAO] = l.nome; row[hm.ORDEM] = l.ordem; row[hm.ATIVO] = 'SIM';
    row[hm.TIPO] = 'PONTO'; row[hm.OBS] = 'LOCAL do Visao 360 (fonte D1).'; row[hm.EXIBIR_EM] = 'CRM';
    return row;
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, values[0].length).setValues(add);
  try { if (typeof crm5x_bumpConfigRev_ === 'function') crm5x_bumpConfigRev_(); } catch (e) {}
  return { ok: true, adicionados: add.length, locais: crm83_getActiveLocals_('CRM').map(function (x) { return x.nome; }) };
}

function crmd1_restaurarLocais_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(CRMD1_CFG.LOCAIS_BACKUP_PROP);
  if (!raw) return { ok: false, motivo: 'Sem copia dos LOCAIS antigos.' };
  var values = JSON.parse(raw);
  var sh = op_getSpreadsheet_().getSheetByName(CRM83_CFG.SHEET_LOCALS);
  sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), sh.getLastColumn()).clearContent();
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  props.deleteProperty(CRMD1_CFG.LOCAIS_BACKUP_PROP);
  try { if (typeof crm5x_bumpConfigRev_ === 'function') crm5x_bumpConfigRev_(); } catch (e) {}
  return { ok: true, restaurados: values.length - 1 };
}

/* ========================= ativar / desativar ========================= */

function crmd1_diagnostico() {
  var out = { chaveLigada: crmd1_ativo_() };
  out.assinatura = crmd1_fetch_('/api/v2/crm/integracao/assinatura');
  var p1 = crmd1_fetch_('/api/v2/crm/integracao/exportar?por=50&pagina=1');
  out.clientesNoD1 = p1.total;
  out.comIdAntigo = (p1.linhas || []).filter(function (x) { return x.ID_LEGADO; }).length + ' de ' + (p1.linhas || []).length + ' na amostra';
  out.conflitosDeId = (p1.conflitos || []).length;
  out.locaisAtuais = crm83_getActiveLocals_('CRM').map(function (x) { return x.nome; });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function crmd1_ativarFonteD1() {
  return op_withDocumentLock_(function () {
    var r = {};
    r.ponte = crmd1_enviarPonteLegado();
    r.locais = crmd1_trocarLocais_();
    PropertiesService.getScriptProperties().setProperty(CRMD1_CFG.FLAG_PROP, 'D1');
    try { CacheService.getScriptCache().remove('crmd1_sig'); } catch (e) {}
    r.master = crmd1_atualizarMasterUnlocked_(crmd1_assinatura_());
    Logger.log(JSON.stringify(r, null, 2));
    return r;
  });
}

function crmd1_voltarParaBaseTotal() {
  return op_withDocumentLock_(function () {
    PropertiesService.getScriptProperties().deleteProperty(CRMD1_CFG.FLAG_PROP);
    try { CacheService.getScriptCache().remove('crmd1_sig'); } catch (e) {}
    var r = { locais: crmd1_restaurarLocais_() };
    r.master = op_updateClientesMasterUnlocked_(op_getBaseSheetSignature_());
    Logger.log(JSON.stringify(r, null, 2));
    return r;
  });
}

/* ========================= escopo por LOCAL do responsavel ========================= */

/** LOCAIS que o usuario da requisicao pode ver; null = sem restricao (admin, chave desligada ou gate sem usuario). */
function crmd1_locaisPermitidos_() {
  if (!crmd1_ativo_() || !CRMD1_USUARIO_) return null;
  var u = CRMD1_USUARIO_;
  if (String(u.role || '').toLowerCase() === 'admin') return null;
  var locais = (u.crm && Array.isArray(u.crm.locais)) ? u.crm.locais : [];
  var out = {};
  locais.forEach(function (l) { out[op_upperNoAccents_(l)] = true; });
  return out;
}

function crmd1_localPermitido_(permitidos, local) {
  return !!permitidos[op_upperNoAccents_(local)];
}

function crmd1_filtrarJornada_(j, permitidos) {
  if (!j || !Array.isArray(j.items)) return j;
  var ok = function (x) { return op_upperNoAccents_(x.tipoEntidade) !== 'CLIENTE' || crmd1_localPermitido_(permitidos, x.local); };
  j.items = j.items.filter(ok);
  (j.columns || []).forEach(function (c) { c.items = (c.items || []).filter(ok); c.total = c.items.length; });
  if (typeof crm3_buildTreatmentFilters_ === 'function') j.filters = crm3_buildTreatmentFilters_(j.items);
  return j;
}

/** Aplicado na saida JSON das rotas GET do CRM (op_jsonOut_). Nao altera nada quando nao ha restricao. */
function crmd1_aplicarEscopo_(obj) {
  var permitidos = crmd1_locaisPermitidos_();
  if (!permitidos || !obj || typeof obj !== 'object') return obj;
  try {
    var cfg = obj.config || (obj.locais && obj.funis ? obj : null);
    if (cfg && Array.isArray(cfg.locais)) cfg.locais = cfg.locais.filter(function (l) { return crmd1_localPermitido_(permitidos, l.nome || l.localId); });
    if (obj.tipo === 'CLIENTE' && Array.isArray(obj.items)) obj.items = obj.items.filter(function (x) { return crmd1_localPermitido_(permitidos, x.local); });
    if (Array.isArray(obj.clients)) obj.clients = obj.clients.filter(function (x) { return crmd1_localPermitido_(permitidos, x.local); });
    if (obj.journeyClients) crmd1_filtrarJornada_(obj.journeyClients, permitidos);
    if (Array.isArray(obj.items) && Array.isArray(obj.columns)) crmd1_filtrarJornada_(obj, permitidos);
  } catch (err) {
    console.error('[CRM_D1] falha ao aplicar escopo por LOCAL: ' + (err && err.message ? err.message : err));
  }
  return obj;
}
