/**
 * 00_CLIENTES_MASTER_FINAL.gs
 * ------------------------------------------------------------
 * Gera e mantém a aba CLIENTES_MASTER sem alterar a BASE_TOTAL.
 * Feito para alimentar CRM mobile, Agenda Comercial e visão em funil.
 */

var OP_CFG = {
  TZ: Session.getScriptTimeZone() || 'America/Fortaleza',
  SPREADSHEET_ID: '1zJUYkvWzcTdHrgqdIMWOY2pm3qDoJoRlu9u43lV7QDA',
  SHEETS: {
    BASE: 'BASE_TOTAL',
    MASTER: 'CLIENTES_MASTER',
    ALIAS: 'CLIENTES_ALIAS',
    BLOCKS: 'AGENDA_BLOCOS',
    AGENDA: 'AGENDA_EXECUCAO',
    CRM_INTERACTIONS: 'CRM_INTERACOES',
    MIDIAS: 'MIDIAS_CRM',
    PROSPECTS: 'PROSPECTS',
    CHECKLIST: 'CRM_VISITA_CHECKLIST',
    CADASTRO: 'CLIENTES_CADASTRO',
    ACESSOS_APP: 'CLIENTES_ACESSOS_APP',
    CREDENCIAIS_CWS: 'CLIENTES_CREDENCIAIS_CWS',
    CRM_TRATATIVAS: 'CRM_TRATATIVAS',
    CRM_FUNIS: 'CRM_FUNIS',
    CRM_FUNIL_ETAPAS: 'CRM_FUNIL_ETAPAS',
    CRM_TIPOS_ATIVIDADE: 'CRM_TIPOS_ATIVIDADE',
    CRM_RESULTADOS_ATIVIDADE: 'CRM_RESULTADOS_ATIVIDADE',
    CRM_EVENTOS: 'CRM_EVENTOS',
    CRM_RESPONSAVEIS: 'CRM_RESPONSAVEIS',
    CRM_LOCAIS: 'CRM_LOCAIS'
  },
  RULES: {
    MIN_START: '2025-11-01',
    ACTIVE_30D: 30,
    INACTIVE_60D: 60,
    TREND_UP_PCT: 10,
    TREND_DOWN_PCT: -10,
    MIN_RECORRENCIA_DIAS_30D: 3,
    LOW_HISTORY_TOTAL_QTD: 10,
    LOW_VOLUME_30D_QTD: 5,
    VISITA_MIN_QTD_30D: 10,
    VISITA_MIN_FAT_30D: 500,
    VISITA_MIN_SHARE: 0.01,
    VISITA_MIN_MESES: 3,
    VISITA_MIN_QTD_TOTAL: 30
  },
  CURVA: {
    WEIGHTS: {
      FAT_30D: 0.40,
      QTD_30D: 0.25,
      TICKET_30D: 0.20,
      DIAS_ATIVOS_30D: 0.15
    },
    CUTS: { TOP: 0.05, A: 0.25, B: 0.60 },
    FLOORS: {
      TOP: { VALOR_TOTAL: 6000, QTD_TOTAL: 120, FAT_30D: 1200, QTD_30D: 25, DIAS_30D: 4, MESES_TOTAL: 3 },
      A:   { VALOR_TOTAL: 1500, QTD_TOTAL: 35,  FAT_30D: 200,  QTD_30D: 5,  DIAS_30D: 2, MESES_TOTAL: 2 },
      B:   { VALOR_TOTAL: 250,  QTD_TOTAL: 5,   FAT_30D: 100,  QTD_30D: 3,  DIAS_30D: 2, MESES_TOTAL: 1 }
    }
  },
  EXCLUDED_CLIENTS: [
    'SEM REGISTRO',
    'REVERSO',
    'REMETENTE',
    'PRODUTO ECT',
    'GAS SHOPPING CENTRO FASHION',
    'GAS SHOPPING METRO'
  ],
  MANUAL_FIELDS: [
    'CLIENTE',
    'NOME_FANTASIA',
    'RAZAO_SOCIAL',
    'CNPJ_CPF',
    'PESSOA_CONTATO',
    'WHATSAPP',
    'EMAIL',
    'ENDERECO',
    'NUMERO',
    'COMPLEMENTO',
    'BAIRRO',
    'CEP',
    'STATUS_COMERCIAL',
    'OBSERVACOES',
    'ULTIMA_VISITA',
    'ULTIMO_RESULTADO_VISITA',
    'CHECKLIST_ULTIMA_VISITA_ID',
    'DATA_PROXIMO_FOLLOWUP',
    'PROXIMA_ACAO_MANUAL',
    'ACAO_ATUAL',
    'RESPONSAVEL_CARTEIRA',
    'TELEFONE',
    'CIDADE',
    'UF',
    'RESPONSAVEL_ID',
    'STATUS_CADASTRO',
    'UPDATED_AT_CADASTRO',
    'UPDATED_BY',
    'NUMERO_CONTRATO',
    'CARTAO_POSTAGEM'
  ],
  CACHE: {
    MASTER_SEC: 3600,
    INIT_SEC: 1800,
    BLOCKS_SEC: 21600,
    CLIENTS_SEC: 1800,
    AGENDA_SEC: 900,
    MIDIAS_SEC: 21600,
    SETUP_SEC: 86400,
    MASTER_STALE_SEC: 10800,
    MASTER_TRIGGER_GAP_SEC: 300
  }
};

var _op_ss_cache_ = null;
function op_getSpreadsheet_(){
  if (_op_ss_cache_) return _op_ss_cache_;
  if (OP_CFG.SPREADSHEET_ID && String(OP_CFG.SPREADSHEET_ID).trim()) {
    _op_ss_cache_ = SpreadsheetApp.openById(String(OP_CFG.SPREADSHEET_ID).trim());
  } else {
    _op_ss_cache_ = SpreadsheetApp.getActiveSpreadsheet();
  }
  return _op_ss_cache_;
}
function op_withDocumentLock_(fn){
  // Projetos Apps Script independentes da planilha não possuem DocumentLock.
  // Nesses casos, ScriptLock protege as execuções concorrentes deste backend.
  var lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock) throw new Error('Não foi possível obter lock para executar a operação com segurança.');
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

var _op_setup_done_ = false;
function op_isSetupWarm_(){
  if (_op_setup_done_) return true;
  try {
    if (CacheService.getScriptCache().get('op_setup_ready_v3')) {
      _op_setup_done_ = true;
      return true;
    }
  } catch (e) {}
  return false;
}
function op_markSetupReady_(){
  _op_setup_done_ = true;
  try { CacheService.getScriptCache().put('op_setup_ready_v3', '1', OP_CFG.CACHE.SETUP_SEC || 86400); } catch (e) {}
  try { PropertiesService.getScriptProperties().setProperty('op_setup_validated_at', op_nowIso_()); } catch (e) {}
}

function op_ensureMidiasSheetSchema_(ss){
  var sh = op_getOrCreateSheet_(ss, OP_CFG.SHEETS.MIDIAS);
  var headers = ['ACAO','SUBCATEGORIA','CODIGO_MIDIA','NOME_MIDIA','TIPO','LINK','QUANDO_USAR','ATIVA'];
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function op_setupOperacao(force) {
  if (!force && op_isSetupWarm_()) return;
  var ss = op_getSpreadsheet_();
  op_ensureAliasSheet_();
  op_ensureBlocksSheet_(ss);
  op_ensureSimpleSheet_(ss, OP_CFG.SHEETS.AGENDA, [
    'AGENDA_ID','DATA','DIA_SEMANA','BLOCO_ID','HORA_INICIO','HORA_FIM','TIPO_ATIVIDADE','TIPO_COR',
    'CLIENTE_ID','CLIENTE','LOCAL','STATUS_AGENDA','PRIORIDADE','ORDEM_AGENDA','OBS_PLANEJADA',
    'OBS_EXECUCAO','MIDIA_SUGERIDA','LINK_MIDIA_DIRETO','RESPONSAVEL','EXECUTADO_EM','CRIADO_EM','ATUALIZADO_EM',
    'ORIGEM_TIPO','ORIGEM_ID','PROSPECT_ID','CLIENTE_MASTER_ID','CHECKLIST_ID'
  ]);
  op_ensureSimpleSheet_(ss, OP_CFG.SHEETS.CRM_INTERACTIONS, [
    'INTERACAO_ID','DATA','CLIENTE_ID','CLIENTE','TIPO_INTERACAO','STATUS','RESULTADO','OBSERVACAO',
    'PROXIMA_ACAO','RESPONSAVEL','CRIADO_EM'
  ]);
  op_ensureMidiasSheetSchema_(ss);
  op_ensureProspectsSheet_(ss);
  op_ensureChecklistSheet_(ss);
  op_markSetupReady_();
}

function op_getBaseSheetSignature_(){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.BASE);
  if (!sh) throw new Error('Aba base não encontrada: ' + OP_CFG.SHEETS.BASE);

  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return [sh.getSheetId(), lr, lc, sh.getName(), 'EMPTY'].join('|');

  // Assinatura mais sensível que linha/coluna: detecta atualização de valores
  // mesmo quando a BASE_TOTAL mantém exatamente o mesmo tamanho.
  var header = sh.getRange(1, 1, 1, lc).getValues()[0];
  var hm = op_buildHeaderMap_(header);
  var idxData = hm.DATA_FORMAT !== undefined ? hm.DATA_FORMAT : hm.DATA;
  var idxValor = hm.VALOR !== undefined ? hm.VALOR : hm.FATURAMENTO;
  var idxQtd = hm.QTD !== undefined ? hm.QTD : hm.QUANTIDADE;
  var idxObj = hm.OBJETO !== undefined ? hm.OBJETO : hm.SRO;
  var sampleRows = Math.min(Math.max(lr - 1, 0), 80);
  var sampleStart = Math.max(2, lr - sampleRows + 1);
  var sample = sampleRows > 0 ? sh.getRange(sampleStart, 1, sampleRows, lc).getValues() : [];
  var lastData = '';
  var sumValor = 0;
  var sumQtd = 0;
  var checksumParts = [];

  for (var i = 0; i < sample.length; i++) {
    var r = sample[i];
    if (idxData !== undefined && idxData >= 0) {
      var d = op_toYmd_(r[idxData]);
      if (d && d > lastData) lastData = d;
    }
    if (idxValor !== undefined && idxValor >= 0) sumValor += op_toNumber_(r[idxValor]);
    if (idxQtd !== undefined && idxQtd >= 0) sumQtd += op_toNumber_(r[idxQtd]);
    checksumParts.push([
      idxData !== undefined && idxData >= 0 ? r[idxData] : '',
      idxObj !== undefined && idxObj >= 0 ? r[idxObj] : '',
      idxValor !== undefined && idxValor >= 0 ? r[idxValor] : '',
      idxQtd !== undefined && idxQtd >= 0 ? r[idxQtd] : ''
    ].join('~'));
  }

  var digest = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, checksumParts.join('|'))
  ).slice(0, 18);

  return [
    sh.getSheetId(),
    lr,
    lc,
    sh.getName(),
    lastData,
    Math.round(sumValor * 100) / 100,
    sumQtd,
    digest
  ].join('|');
}
function op_getMasterMeta_(){
  var props = PropertiesService.getScriptProperties();
  return {
    baseSig: props.getProperty('op_master_base_sig') || '',
    builtAt: props.getProperty('op_master_built_at') || '',
    refreshRequestedMs: props.getProperty('op_master_refresh_requested_ms') || '0'
  };
}
function op_setMasterMeta_(baseSig){
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    op_master_base_sig: baseSig || '',
    op_master_built_at: op_nowIso_()
  }, false);
}
function op_hasUsableMaster_(){
  var sh = op_getSpreadsheet_().getSheetByName(OP_CFG.SHEETS.MASTER);
  return !!(sh && sh.getLastRow() >= 2);
}
function op_secondsSinceIso_(iso){
  if (!iso) return Number.MAX_SAFE_INTEGER;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.floor((Date.now() - d.getTime()) / 1000);
}
function op_requestMasterRefresh_(){
  var props = PropertiesService.getScriptProperties();
  var nowMs = Date.now();
  var lastMs = Number(props.getProperty('op_master_refresh_requested_ms') || 0);
  if (nowMs - lastMs < (OP_CFG.CACHE.MASTER_TRIGGER_GAP_SEC || 300) * 1000) return false;
  props.setProperty('op_master_refresh_requested_ms', String(nowMs));
  ScriptApp.newTrigger('triggerRefreshMaster').timeBased().after(60 * 1000).create();
  return true;
}
function op_ensureMasterFresh_(opts){
  opts = opts || {};
  var allowStale = opts.allowStale !== false;
  var baseSig = op_getBaseSheetSignature_();
  var meta = op_getMasterMeta_();
  var cache = CacheService.getScriptCache();
  var cacheKey = 'master_fresh::' + baseSig;
  var hasMaster = op_hasUsableMaster_();

  if (meta.baseSig === baseSig) {
    try {
      if (!cache.get(cacheKey)) cache.put(cacheKey, '1', OP_CFG.CACHE.MASTER_SEC);
    } catch (e) {}
    return { ok:true, status:'fresh', baseSig: baseSig };
  }

  if (!hasMaster) {
    var cold = op_updateClientesMaster(baseSig);
    try { cache.put(cacheKey, '1', OP_CFG.CACHE.MASTER_SEC); } catch (e) {}
    return { ok:true, status:'rebuilt_cold', baseSig: baseSig, total: cold.total };
  }

  var ageSec = op_secondsSinceIso_(meta.builtAt);
  if (allowStale && ageSec <= (OP_CFG.CACHE.MASTER_STALE_SEC || 10800)) {
    try { op_requestMasterRefresh_(); } catch (e) {}
    return { ok:true, status:'stale_served', baseSig: baseSig };
  }

  var rebuilt = op_updateClientesMaster(baseSig);
  try { cache.put(cacheKey, '1', OP_CFG.CACHE.MASTER_SEC); } catch (e) {}
  return { ok:true, status:'rebuilt', baseSig: baseSig, total: rebuilt.total };
}

function op_updateClientesMaster(baseSig) {
  return op_withDocumentLock_(function(){ return op_updateClientesMasterUnlocked_(baseSig); });
}
function op_updateClientesMasterUnlocked_(baseSig) {
  var ss = op_getSpreadsheet_();
  var baseSh = ss.getSheetByName(OP_CFG.SHEETS.BASE);
  if (!baseSh) throw new Error('Aba base não encontrada: ' + OP_CFG.SHEETS.BASE);
  baseSig = baseSig || op_getBaseSheetSignature_();

  op_ensureAliasSheet_();
  var aliasMap = op_readAliasMap_();
  var values = baseSh.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error('Aba BASE_TOTAL vazia.');

  var headerMap = op_buildHeaderMap_(values[0]);
  var rows = values.slice(1);
  var parsed = op_parseBaseRows_(rows, headerMap).filter(function(r){
    return !!r.data && r.data >= OP_CFG.RULES.MIN_START && !op_isExcludedClient_(r.nomeRemetenteBase);
  });
  if (!parsed.length) throw new Error('Nenhuma linha válida encontrada na BASE_TOTAL.');

  var refDate = op_getLatestDate_(parsed) || op_toYmd_(new Date());
  aliasMap = op_syncAliasFromBase_(parsed, aliasMap);

  parsed = parsed.map(function(r){
    var alias = aliasMap[r.nomeRemetenteBase];
    if (!alias || !alias.CLIENTE_ID) throw new Error('Alias sem CLIENTE_ID para: ' + r.nomeRemetenteBase);
    r.CLIENTE_ID = alias.CLIENTE_ID;
    return r;
  });

  var grouped = op_groupByClientId_(parsed);
  var masterRows = op_buildMasterRows_(grouped, refDate);
  var masterSh = op_getOrCreateSheet_(ss, OP_CFG.SHEETS.MASTER);
  op_writeMasterSheet_(masterSh, masterRows);
  op_setMasterMeta_(baseSig);
  op_invalidateOperationCaches_();
  return { ok:true, total: masterRows.length, baseSig: baseSig };
}

/* ========================= HELPERS ========================= */
function op_norm_(v){ return v == null ? '' : String(v).trim(); }
function op_safeText_(v){
  if(v==null||v==='') return '';
  if(Object.prototype.toString.call(v)==='[object Date]') return '';
  var s=String(v).trim();
  if(s.match(/^\w{3}\s\w{3}\s\d{2}\s\d{4}/)) return '';
  return s;
}
function op_upperNoAccents_(s){
  s = op_norm_(s);
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return s.toUpperCase();
}
function op_headerKey_(s){
  return op_upperNoAccents_(s).replace(/[%]/g,' PERCENT ').replace(/[^\w]+/g,'_').replace(/^_+|_+$/g,'');
}
function op_buildHeaderMap_(headerRow){
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var k = op_headerKey_(headerRow[i]);
    if (k && map[k] === undefined) map[k] = i;
  }
  return map;
}
function op_getCell_(row, map, names){
  var arr = Array.isArray(names) ? names : [names];
  for (var i = 0; i < arr.length; i++) {
    var idx = map[op_headerKey_(arr[i])];
    if (idx !== undefined) return row[idx];
  }
  return '';
}
function op_toNumber_(v){
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = op_norm_(v);
  if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g,'').replace(',','.');
  var n = Number(s);
  return isNaN(n) ? 0 : n;
}
function op_toYmd_(v){
  if (!v && v !== 0) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, OP_CFG.TZ, 'yyyy-MM-dd');
  }
  var s = op_norm_(v);
  if (!s) return '';
  var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return Utilities.formatDate(new Date(+br[3], +br[2]-1, +br[1]), OP_CFG.TZ, 'yyyy-MM-dd');
  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return Utilities.formatDate(new Date(+iso[1], +iso[2]-1, +iso[3]), OP_CFG.TZ, 'yyyy-MM-dd');
  var d = new Date(s);
  return isNaN(d) ? '' : Utilities.formatDate(d, OP_CFG.TZ, 'yyyy-MM-dd');
}
function op_ymdToDate_(iso){
  var m = op_norm_(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2]-1, +m[3]) : null;
}
function op_addDays_(iso, n){
  var d = op_ymdToDate_(iso); d.setDate(d.getDate() + n); return op_toYmd_(d);
}
function op_diffDays_(a, b){ return Math.floor((op_ymdToDate_(a) - op_ymdToDate_(b)) / 864e5); }
function op_getLatestDate_(rows){
  var latest = '';
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].data && (!latest || rows[i].data > latest)) latest = rows[i].data;
  }
  return latest;
}
function op_sum_(rows, field){ var t=0; rows.forEach(function(r){ t += op_toNumber_(r[field]); }); return t; }
function op_uniqueCount_(arr){
  var seen = {}; arr.forEach(function(v){ var k = op_norm_(v); if (k) seen[k] = 1; }); return Object.keys(seen).length;
}
function op_incMap_(obj,key,amount){ obj[key] = (obj[key] || 0) + amount; }
function op_topKey_(obj){
  var bestKey = '', bestVal = -1; Object.keys(obj || {}).forEach(function(k){ var v = obj[k] || 0; if (v > bestVal){ bestVal = v; bestKey = k; } }); return bestKey;
}
function op_median_(arr){
  var a = (arr || []).filter(function(v){ return v > 0; }).sort(function(x,y){ return x-y; });
  if (!a.length) return 0; var mid = Math.floor(a.length/2); return a.length % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
}
function op_percentileRank_(arr, value){
  var a = (arr || []).slice().sort(function(x,y){return x-y;}); if (!a.length) return 0;
  var count = 0; for (var i=0;i<a.length;i++) if (a[i] <= value) count++; return count / a.length;
}
function op_padNumber_(n,size){ var s=String(n); while(s.length < size) s='0'+s; return s; }
function op_nowIso_(){ return Utilities.formatDate(new Date(), OP_CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function op_isExcludedClient_(cliente){
  var c = op_upperNoAccents_(cliente);
  return OP_CFG.EXCLUDED_CLIENTS.some(function(x){ return op_upperNoAccents_(x) === c; });
}
function op_cacheGetJson_(key){
  var raw = gcj_(key);
  return raw || null;
}
function op_cachePutJson_(key, value, ttl){
  pcj_(key, value, ttl);
}
function op_cacheRemoveSafe_(key){
  try { gc_().remove(key); } catch(e) {}
}

/* ========================= SHEETS ========================= */
function op_getOrCreateSheet_(ss, name){ return ss.getSheetByName(name) || ss.insertSheet(name); }
function op_ensureSimpleSheet_(ss, name, headers){
  var sh = op_getOrCreateSheet_(ss, name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    var currentHeaders = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getValues()[0];
    var needsUpdate = false;
    for (var i = 0; i < headers.length; i++) {
      if (op_headerKey_(currentHeaders[i] || '') !== op_headerKey_(headers[i])) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate) {
      if (sh.getMaxColumns() < headers.length) {
        sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
      }
      sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}
function op_ensureAliasSheet_(){
  var ss = op_getSpreadsheet_();
  op_ensureSimpleSheet_(ss, OP_CFG.SHEETS.ALIAS, ['NOME_REMETENTE_BASE','CLIENTE_ID','OBSERVACAO']);
}
function op_ensureBlocksSheet_(ss){
  var sh = op_ensureSimpleSheet_(ss, OP_CFG.SHEETS.BLOCKS, ['BLOCO_ID','ORDEM','HORA_INICIO','HORA_FIM','NOME_BLOCO','TIPO_ATIVIDADE','COR']);
  sh.getRange('C:D').setNumberFormat('@STRING@');
  if (sh.getLastRow() > 1) return sh;
  var rows = [
    ['B1',1,'08:00','09:00','Base Metrô','INTERNO','#6b7280'],
    ['B2',2,'09:00','11:00','Visitas','VISITA','#f59e0b'],
    ['B3',3,'11:00','11:30','Centro leve','AGENDA','#2563eb'],
    ['B4',4,'11:30','13:00','Almoço / cobertura','ALMOCO','#9ca3af'],
    ['B5',5,'13:00','14:30','CF principal','AGENDA','#1d4ed8'],
    ['B6',6,'14:30','16:30','Centro principal','AGENDA','#0ea5e9'],
    ['B7',7,'16:30','17:00','CF complementar','AGENDA','#3b82f6'],
    ['B8',8,'17:00','17:30','Centro pendente','AGENDA','#38bdf8'],
    ['B9',9,'17:30','18:00','Fechamento','INTERNO','#64748b']
  ];
  sh.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  op_cacheRemoveSafe_('op_blocks_v1');
  return sh;
}

/* ========================= PROSPECTS ========================= */
function op_ensureProspectsSheet_(ss) {
  var headers = [
    'PROSPECT_ID','CLIENTE','LOCAL','SEGMENTO','NOME_FANTASIA','RAZAO_SOCIAL','CNPJ_CPF','ATIVIDADE_ECONOMICA',
    'ENDERECO','NUMERO','COMPLEMENTO','BAIRRO','CIDADE','UF','CEP','MAPS_URL',
    'CONTATO','CARGO','WHATSAPP','TELEFONE_2','EMAIL','INSTAGRAM',
    'PERFIL','POTENCIAL','PRIORIDADE','STATUS_PROSPECT','ETAPA_FUNIL','RESPONSAVEL','ORIGEM_LEAD',
    'CANAL_ENVIO_ATUAL','PARCEIRO_PRINCIPAL','USA_INTERMEDIADOR','INTERMEDIADOR_QUAL','ATENDE_SACOLEIRAS_EXCURSAO','DOR_PRINCIPAL','OPORTUNIDADE_PRINCIPAL',
    'DATA_CADASTRO','ULTIMO_CONTATO','ULTIMO_RESULTADO_VISITA','DATA_PROXIMO_FOLLOWUP','PROXIMA_ACAO','CHECKLIST_ULTIMA_VISITA_ID',
    'CANAL_PREFERENCIAL','ABORDAGEM_INICIAL','OBJECAO_PRINCIPAL','TEM_INTERESSE','SCORE','OBS',
    'LATITUDE','LONGITUDE','PLACE_ID','STATUS_GEOCOD','UPDATED_AT',
    'CLIENTE_ID_CONVERTIDO','CLIENTE_NOME_CONVERTIDO','TIPO_CONVERSAO','DATA_CONVERSAO','MATCH_STATUS','OBS_CONVERSAO',
    'FREQUENCIA_ENVIO','VOLUME_MEDIO','JA_POSTA_CORREIOS','TEM_CONTRATO_CORREIOS','TEM_CARTAO_POSTAGEM','CANAL_VENDA'
  ];
  return op_ensureSimpleSheet_(ss, OP_CFG.SHEETS.PROSPECTS, headers);
}

/* ========================= CHECKLIST ========================= */
function op_ensureChecklistSheet_(ss) {
  var headers = [
    'CHECKLIST_ID','AGENDA_ID','DATA','ORIGEM_TIPO','ORIGEM_ID','PROSPECT_ID','CLIENTE_MASTER_ID','CLIENTE',
    'RESULTADO_VISITA','STATUS_VISITA',
    'POSTAGEM_COMO_CHEGA','ORIGEM_POSTAGEM',
    'CANAIS_VENDA','POSTA_COM_QUEM','DOR_PRINCIPAL','OPORTUNIDADE_PRINCIPAL','NIVEL_ESTEIRA','ENTRADA_SUGERIDA','POTENCIAL_AUTOMACAO',
    'CANAL_ENVIO_ATUAL','FREQUENCIA_ENVIO','VOLUME_MEDIO','JA_POSTA_CORREIOS','TEM_CONTRATO_CORREIOS','TEM_CARTAO_POSTAGEM',
    'USA_INTERMEDIADOR','INTERMEDIADOR_QUAL','PARCEIRO_PRINCIPAL','CANAL_VENDA','ATENDE_SACOLEIRAS_EXCURSAO',
    'OBSERVACAO_CURTA','RESPONSAVEL','CRIADO_EM'
  ];
  return op_ensureSimpleSheet_(ss, OP_CFG.SHEETS.CHECKLIST, headers);
}

/* ========================= ALIAS ========================= */
function op_readAliasMap_(){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.ALIAS);
  if (!sh || sh.getLastRow() < 2) return {};
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var out = {};
  values.slice(1).forEach(function(r){
    var nomeBase = op_norm_(op_getCell_(r, hm, 'NOME_REMETENTE_BASE'));
    var clienteId = op_norm_(op_getCell_(r, hm, 'CLIENTE_ID'));
    var obs = op_norm_(op_getCell_(r, hm, 'OBSERVACAO'));
    if (!nomeBase) return;
    out[nomeBase] = { CLIENTE_ID: clienteId, OBSERVACAO: obs };
  });
  return out;
}
function op_syncAliasFromBase_(parsedRows, aliasMap){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.ALIAS);
  var maxNum = 0;
  Object.keys(aliasMap).forEach(function(nome){
    var id = aliasMap[nome] && aliasMap[nome].CLIENTE_ID;
    var m = id && id.match(/^CLI_(\d+)$/);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  });
  var newRows = [], seen = {};
  parsedRows.forEach(function(r){
    var nomeBase = r.nomeRemetenteBase;
    if (!nomeBase || seen[nomeBase]) return;
    seen[nomeBase] = true;
    if (!aliasMap[nomeBase] || !aliasMap[nomeBase].CLIENTE_ID) {
      maxNum++;
      var newId = 'CLI_' + op_padNumber_(maxNum, 6);
      newRows.push([nomeBase, newId, 'AUTO']);
      aliasMap[nomeBase] = { CLIENTE_ID:newId, OBSERVACAO:'AUTO' };
    }
  });
  if (newRows.length) sh.getRange(sh.getLastRow()+1, 1, newRows.length, 3).setValues(newRows);
  return aliasMap;
}

/* ========================= PARSE ========================= */
function op_parseBaseRows_(rows, headers){
  return rows.map(function(r){
    return {
      nomeRemetenteBase: op_norm_(op_getCell_(r, headers, ['NOME_REMETENTE','REMETENTE'])),
      data: op_toYmd_(op_getCell_(r, headers, ['DATA FORMAT','DATA'])),
      qtd: Math.max(1, op_toNumber_(op_getCell_(r, headers, ['QTD','QUANTIDADE']))),
      valor: op_toNumber_(op_getCell_(r, headers, ['VALOR','FATURAMENTO'])),
      local: op_norm_(op_getCell_(r, headers, ['LOCAL','UNIDADE'])),
      segmento: op_norm_(op_getCell_(r, headers, ['SEGMENTO'])),
      categoria: op_norm_(op_getCell_(r, headers, ['CATEGORIA'])),
      tipoServico: op_norm_(op_getCell_(r, headers, ['TIPO_SERVICO','TIPO'])),
      intermediador: op_norm_(op_getCell_(r, headers, ['INTERMEDIADOR'])),
      etiquetaContrato: op_norm_(op_getCell_(r, headers, ['ETIQUETA_CONTRATO'])),
      ifEtiqueta: op_norm_(op_getCell_(r, headers, ['IF ETIQUETA','IF_ETIQUETA'])),
      numeroContrato: op_norm_(op_getCell_(r, headers, ['NUMERO_CONTRATO'])),
      cartaoPostagem: op_norm_(op_getCell_(r, headers, ['CARTAO_POSTAGEM'])),
      razaoSocialLinha: op_norm_(op_getCell_(r, headers, ['RAZAO_SOCIAL']))
    };
  }).filter(function(x){ return !!x.nomeRemetenteBase && !!x.data; });
}
function op_groupByClientId_(rows){
  var map = {}; rows.forEach(function(r){ if (!map[r.CLIENTE_ID]) map[r.CLIENTE_ID] = []; map[r.CLIENTE_ID].push(r); }); return map;
}
function op_detectBucketNegocio_(row){
  var inter = op_upperNoAccents_(row.intermediador);
  var tipo = op_upperNoAccents_(row.tipoServico);
  var etiqueta = op_upperNoAccents_(row.etiquetaContrato);
  var ifEtiqueta = op_upperNoAccents_(row.ifEtiqueta);
  var numContrato = op_norm_(row.numeroContrato);
  var cartao = op_norm_(row.cartaoPostagem);
  if (inter === 'VR') return 'VR';
  if ((tipo === 'BALCAO' || tipo === 'BALCÃO' || tipo === 'APP') && (inter === 'SEM CONTRATO' || inter === 'APP' || inter === '')) return 'BALCAO';
  if (inter.indexOf('CONTRATO') >= 0 || inter.indexOf('PORTAL POSTAL') >= 0 || etiqueta === 'COM' || ifEtiqueta === 'TRUE' || ifEtiqueta === 'SIM' || ifEtiqueta === '1' || numContrato || cartao) return 'CONTRATO';
  if (tipo === 'BALCAO' || tipo === 'BALCÃO' || tipo === 'APP') return 'BALCAO';
  return 'INTERMEDIADOR';
}
function op_statusAtividade_(diasSemPostar){
  if (diasSemPostar <= OP_CFG.RULES.ACTIVE_30D) return 'ATIVO_30D';
  if (diasSemPostar <= OP_CFG.RULES.INACTIVE_60D - 1) return 'INATIVO_30_59D';
  return 'INATIVO_60D_PLUS';
}
function op_tendencia_(fat30, fatPrev30){
  if (fatPrev30 <= 0 && fat30 > 0) return 'CRESCENDO';
  if (fatPrev30 <= 0) return 'ESTAVEL';
  var pct = ((fat30 - fatPrev30) / fatPrev30) * 100;
  if (pct >= OP_CFG.RULES.TREND_UP_PCT) return 'CRESCENDO';
  if (pct <= OP_CFG.RULES.TREND_DOWN_PCT) return 'CAINDO';
  return 'ESTAVEL';
}
function op_compareCurva_(prev, current){ var ord = { TOP:4, A:3, B:2, C:1 }; var p=ord[prev]||0,c=ord[current]||0; if(c>p) return 'SUBIU'; if(c<p) return 'CAIU'; return 'MANTEVE'; }

function op_marketplaceIntermediador_(s){
  var u = op_upperNoAccents_(s);
  return u.indexOf('MERCADO LIVRE') >= 0 || u.indexOf('AMAZON') >= 0 || u.indexOf('SHOPEE') >= 0 || u.indexOf('SUPERFRETE') >= 0 || u.indexOf('LOCAWEB') >= 0;
}
function op_firstValidNonReversoDate_(rows){
  for (var i = 0; i < rows.length; i++) if (op_upperNoAccents_(rows[i].tipoServico) !== 'REVERSO') return rows[i].data;
  return '';
}
function op_pctDelta_(cur, prev){
  if (prev <= 0 && cur > 0) return null;
  if (prev <= 0) return 0;
  return ((cur - prev) / prev) * 100;
}
function op_priorityRank_(p){ return ({'CRITICA':4,'ALTA':3,'MEDIA':2,'BAIXA':1}[p] || 0); }
function op_detectPerfilComercial_(m){
  var inter = op_upperNoAccents_(m.INTERMEDIADOR_PREDOMINANTE);
  var tipo = op_upperNoAccents_(m.TIPO_SERVICO_PREDOMINANTE);
  if (m.BUCKET_NEGOCIO === 'VR' || inter === 'VR') return 'VR_INTERNO';
  if (op_marketplaceIntermediador_(m.INTERMEDIADOR_PREDOMINANTE)) return 'INTERMEDIADOR_MARKETPLACE';
  if (m.TEM_CONTRATO === 'SIM' && (tipo === 'BALCAO' || tipo === 'BALCÃO' || tipo === 'APP')) return 'BALCAO_COM_CONTRATO';
  if (m.TEM_CONTRATO === 'NAO' && (tipo === 'BALCAO' || tipo === 'BALCÃO' || tipo === 'APP')) return 'BALCAO_SEM_CONTRATO';
  if (m.TEM_CONTRATO === 'SIM') return 'CONTRATO_ECT_DIRETO';
  return 'SEM_CONTRATO_MISTO';
}
function op_isReversoBaixo_(m){
  return op_upperNoAccents_(m.TIPO_SERVICO_PREDOMINANTE) === 'REVERSO' && m.QTD_TOTAL < 10 && m.VALOR_TOTAL < 500;
}
function op_curveRank_(c){
  return ({'TOP':4,'A':3,'B':2,'C':1}[op_upperNoAccents_(c || '')] || 1);
}
function op_curveFromPos_(pos){
  return pos <= OP_CFG.CURVA.CUTS.TOP ? 'TOP' :
         pos <= OP_CFG.CURVA.CUTS.A   ? 'A'   :
         pos <= OP_CFG.CURVA.CUTS.B   ? 'B'   : 'C';
}
function op_curveClampByMax_(preliminar, maxAllowed){
  return op_curveRank_(preliminar) > op_curveRank_(maxAllowed) ? maxAllowed : preliminar;
}
function op_curveMaxByFloor_(m, label){
  var fat = label === 'ANTERIOR' ? op_toNumber_(m.FAT_31_60D) : op_toNumber_(m.FAT_30D);
  var qtd = label === 'ANTERIOR' ? op_toNumber_(m.QTD_31_60D) : op_toNumber_(m.QTD_30D);
  var dias = label === 'ANTERIOR' ? op_toNumber_(m.DIAS_ATIVOS_31_60D) : op_toNumber_(m.DIAS_ATIVOS_30D);
  var vTot = op_toNumber_(m.VALOR_TOTAL);
  var qTot = op_toNumber_(m.QTD_TOTAL);
  var meses = op_toNumber_(m.MESES_ATIVOS_TOTAL);

  var top = OP_CFG.CURVA.FLOORS.TOP;
  var a   = OP_CFG.CURVA.FLOORS.A;
  var b   = OP_CFG.CURVA.FLOORS.B;

  if ((vTot >= top.VALOR_TOTAL || qTot >= top.QTD_TOTAL) &&
      (fat >= top.FAT_30D || qtd >= top.QTD_30D) &&
      dias >= top.DIAS_30D &&
      meses >= top.MESES_TOTAL) {
    return 'TOP';
  }

  if ((vTot >= a.VALOR_TOTAL || qTot >= a.QTD_TOTAL) &&
      (fat >= a.FAT_30D || qtd >= a.QTD_30D) &&
      dias >= a.DIAS_30D &&
      meses >= a.MESES_TOTAL) {
    return 'A';
  }

  if ((vTot >= b.VALOR_TOTAL || qTot >= b.QTD_TOTAL || fat >= b.FAT_30D || qtd >= b.QTD_30D) &&
      dias >= b.DIAS_30D &&
      meses >= b.MESES_TOTAL) {
    return 'B';
  }

  return 'C';
}
function op_isAquecendoAgora_(m){
  var temBaseAtual = op_toNumber_(m.FAT_30D) > 0 || op_toNumber_(m.QTD_30D) > 0;
  if (!temBaseAtual) return false;

  var prevZero = op_toNumber_(m.FAT_31_60D) <= 0 &&
                 op_toNumber_(m.QTD_31_60D) <= 0 &&
                 op_toNumber_(m.DIAS_ATIVOS_31_60D) <= 0;

  var fd = m.FD_PCT;
  var qd = m.QD_PCT;
  var crescimentoPct = (fd != null && fd >= 40) || (qd != null && qd >= 40);
  var crescimentoAbs = op_toNumber_(m.QTD_30D) >= Math.max(3, op_toNumber_(m.QTD_31_60D) + 2) ||
                       op_toNumber_(m.FAT_30D) >= Math.max(100, op_toNumber_(m.FAT_31_60D) * 1.30);

  return prevZero || crescimentoPct || crescimentoAbs || m.MOVIMENTO_CURVA === 'SUBIU';
}
function op_hasMinimoConversaoBaixa_(m){
  return op_toNumber_(m.QTD_30D) >= 3 ||
         op_toNumber_(m.FAT_30D) >= 100 ||
         op_toNumber_(m.QTD_TOTAL) >= 8 ||
         op_toNumber_(m.VALOR_TOTAL) >= 250;
}
function op_lookupMidiaLink_(codigo){
  if (!codigo) return '';
  var mids = op_readMidias_();
  for (var i = 0; i < mids.length; i++) if (op_norm_(mids[i].codigo) === op_norm_(codigo)) return mids[i].link || '';
  return '';
}


/* ========================= BUILD MASTER ========================= */
function op_buildMasterRows_(grouped, refDate){
  var recentStart = op_addDays_(refDate, -(30 - 1));
  var prevStart = op_addDays_(refDate, -(30 + 30 - 1));
  var prevEnd = op_addDays_(refDate, -30);
  var selYm = refDate.slice(0,7);
  var metrics = [];
  var localTotals30 = {};

  Object.keys(grouped).forEach(function(clienteId){
    var rows = grouped[clienteId].slice().sort(function(a,b){ return a.data.localeCompare(b.data); });
    var firstDate = rows[0].data;
    var firstValidNonRev = op_firstValidNonReversoDate_(rows);
    var lastDate = rows[rows.length-1].data;
    var diasSemPostar = op_diffDays_(refDate, lastDate);
    var localMap={}, segMap={}, tipoMap={}, interMap={}, bucketMap={}, numeroContratoMap={}, cartaoMap={}, categoriaMap={}, razaoMap={}, nomeBaseMap={};
    var qtdTotal=0, valorTotal=0, recent=[], prev=[], diasHistMap={}, mesesHistMap={};

    rows.forEach(function(r){
      qtdTotal += r.qtd; valorTotal += r.valor;
      diasHistMap[r.data] = 1; mesesHistMap[r.data.slice(0,7)] = 1;
      op_incMap_(localMap, r.local || 'SEM LOCAL', r.valor || 1);
      op_incMap_(segMap, r.segmento || 'SEM SEGMENTO', r.valor || 1);
      op_incMap_(tipoMap, r.tipoServico || 'SEM TIPO', r.valor || 1);
      op_incMap_(interMap, r.intermediador || 'SEM INTERMEDIADOR', r.valor || 1);
      op_incMap_(nomeBaseMap, r.nomeRemetenteBase, r.valor || 1);
      op_incMap_(categoriaMap, r.categoria || 'SEM CATEGORIA', r.valor || 1);
      op_incMap_(razaoMap, r.razaoSocialLinha || '', r.valor || 1);
      op_incMap_(bucketMap, op_detectBucketNegocio_(r), r.valor || 1);
      if (op_norm_(r.numeroContrato)) op_incMap_(numeroContratoMap, r.numeroContrato, 1);
      if (op_norm_(r.cartaoPostagem)) op_incMap_(cartaoMap, r.cartaoPostagem, 1);
      if (r.data >= recentStart && r.data <= refDate) recent.push(r);
      if (r.data >= prevStart && r.data <= prevEnd) prev.push(r);
    });

    var fat30 = op_sum_(recent, 'valor');
    var qtd30 = op_sum_(recent, 'qtd');
    var diasAtivos30 = op_uniqueCount_(recent.map(function(x){ return x.data; }));
    var ticket30 = qtd30 > 0 ? fat30 / qtd30 : 0;
    var fatPrev = op_sum_(prev, 'valor');
    var qtdPrev = op_sum_(prev, 'qtd');
    var diasAtivosPrev = op_uniqueCount_(prev.map(function(x){ return x.data; }));
    var ticketPrev = qtdPrev > 0 ? fatPrev / qtdPrev : 0;
    var localPred = op_topKey_(localMap) || 'SEM LOCAL';
    localTotals30[localPred] = (localTotals30[localPred] || 0) + fat30;

    metrics.push({
      CLIENTE_ID: clienteId,
      NOME_REMETENTE_BASE: op_topKey_(nomeBaseMap),
      RAZAO_SOCIAL_BASE: op_topKey_(razaoMap),
      NUMERO_CONTRATO: op_topKey_(numeroContratoMap),
      CARTAO_POSTAGEM: op_topKey_(cartaoMap),
      LOCAL_PREDOMINANTE: localPred,
      SEGMENTO_PREDOMINANTE: op_topKey_(segMap),
      TIPO_SERVICO_PREDOMINANTE: op_topKey_(tipoMap),
      INTERMEDIADOR_PREDOMINANTE: op_topKey_(interMap),
      CATEGORIA_PREDOMINANTE: op_topKey_(categoriaMap),
      BUCKET_NEGOCIO: op_topKey_(bucketMap) || 'INTERMEDIADOR',
      TEM_CONTRATO: op_topKey_(bucketMap) === 'CONTRATO' ? 'SIM' : 'NAO',
      DATA_PRIMEIRA_POSTAGEM: firstDate,
      DATA_PRIMEIRA_VALIDA_NAO_REVERSO: firstValidNonRev,
      DATA_ULTIMA_POSTAGEM: lastDate,
      DIAS_SEM_POSTAR: diasSemPostar,
      STATUS_ATIVIDADE: op_statusAtividade_(diasSemPostar),
      FAT_30D: fat30,
      QTD_30D: qtd30,
      DIAS_ATIVOS_30D: diasAtivos30,
      TICKET_30D: ticket30,
      FAT_31_60D: fatPrev,
      QTD_31_60D: qtdPrev,
      DIAS_ATIVOS_31_60D: diasAtivosPrev,
      TICKET_31_60D: ticketPrev,
      TENDENCIA: op_tendencia_(fat30, fatPrev),
      QTD_TOTAL: qtdTotal,
      VALOR_TOTAL: valorTotal,
      DIAS_ATIVOS_TOTAL: Object.keys(diasHistMap).length,
      MESES_ATIVOS_TOTAL: Object.keys(mesesHistMap).length,
      RECORRENTE_30D: diasAtivos30 >= OP_CFG.RULES.MIN_RECORRENCIA_DIAS_30D ? 'SIM' : 'NAO',
      RECORRENCIA_NIVEL: diasAtivos30 >= 4 ? 'FORTE' : (diasAtivos30 >= 3 ? 'MEDIA' : (diasAtivos30 >= 1 ? 'PONTUAL' : 'SEM_BASE')),
      FD_PCT: op_pctDelta_(fat30, fatPrev),
      QD_PCT: op_pctDelta_(qtd30, qtdPrev),
      DD_PCT: op_pctDelta_(diasAtivos30, diasAtivosPrev)
    });
  });

  op_applyCurva_(metrics, 'ATUAL', {fatField:'FAT_30D', qtdField:'QTD_30D', ticketField:'TICKET_30D', diasField:'DIAS_ATIVOS_30D', outField:'CURVA'});
  op_applyCurva_(metrics, 'ANTERIOR', {fatField:'FAT_31_60D', qtdField:'QTD_31_60D', ticketField:'TICKET_31_60D', diasField:'DIAS_ATIVOS_31_60D', outField:'CURVA_ANTERIOR'});

  metrics.forEach(function(m){
    m.MOVIMENTO_CURVA = op_compareCurva_(m.CURVA_ANTERIOR, m.CURVA);
    m.SHARE_LOCAL_30D = localTotals30[m.LOCAL_PREDOMINANTE] > 0 ? m.FAT_30D / localTotals30[m.LOCAL_PREDOMINANTE] : 0;
    m.PORTE_OPERACIONAL = (m.QTD_30D >= 30 || m.FAT_30D >= 1500) ? 'GRANDE' : ((m.QTD_30D >= 10 || m.FAT_30D >= 500) ? 'MEDIO' : 'MICRO');
    m.QUEDA_REAL = (m.FD_PCT <= -25) && (m.DD_PCT <= -20 || m.QD_PCT <= -20) ? 'SIM' : 'NAO';
    m.QUEDA_LEVE_SAZONAL = (m.FD_PCT < 0 && m.FD_PCT > -25 && (m.DD_PCT > -20 || m.DD_PCT === 0) && (m.QD_PCT > -20 || m.QD_PCT === 0)) ? 'SIM' : 'NAO';
    var quedaPersist = m.QUEDA_REAL === 'SIM' && op_upperNoAccents_(m.TENDENCIA) === 'CAINDO' && m.MOVIMENTO_CURVA === 'CAIU';
    m.NIVEL_ALERTA = quedaPersist ? 'QUEDA_PERSISTENTE' : (m.QUEDA_REAL === 'SIM' ? 'QUEDA_REAL' : (op_upperNoAccents_(m.TENDENCIA) === 'CAINDO' ? 'ALERTA' : 'SAUDAVEL'));
    m.PERFIL_COMERCIAL = op_detectPerfilComercial_(m);
    if (m.PERFIL_COMERCIAL === 'VR_INTERNO') m.TEM_CONTRATO = 'NAO';
    m.IS_REVERSO_BAIXO = op_isReversoBaixo_(m) ? 'SIM' : 'NAO';
    m.NOVO_CLIENTE = (m.DATA_PRIMEIRA_VALIDA_NAO_REVERSO && m.DATA_PRIMEIRA_VALIDA_NAO_REVERSO.slice(0,7) === selYm) ? 'SIM' : 'NAO';
    m.INATIVO_30D = m.DIAS_SEM_POSTAR >= 30 ? 'SIM' : 'NAO';
    m.INATIVO_60D = m.DIAS_SEM_POSTAR >= 60 ? 'SIM' : 'NAO';
  });

  if (typeof crm_appendCadastroOnlyMetrics_ === 'function') metrics = crm_appendCadastroOnlyMetrics_(metrics, refDate);
  metrics.forEach(function(m){ op_calculateAcao_(m); });

  var manualMap = op_readExistingManualFields_();
  if (typeof crm_applyCadastroOverlayToManualMap_ === 'function') manualMap = crm_applyCadastroOverlayToManualMap_(manualMap);
  return metrics.map(function(m){
    var manual = manualMap[m.CLIENTE_ID] || {};
    if (!manual.CLIENTE) manual.CLIENTE = m.NOME_REMETENTE_BASE;
    if (!manual.RAZAO_SOCIAL) manual.RAZAO_SOCIAL = m.RAZAO_SOCIAL_BASE || '';

    var acaoManual = op_norm_(manual.ACAO_ATUAL || manual._ACAO_LEGACY || '');
    var row = Object.assign({}, m, manual);
    row.ACAO_ENGINE = m.ACAO || '';
    row.ACAO_ATUAL = acaoManual; // preserva eventual escolha manual, sem travar o motor automático
    row.ACAO = m.ACAO || 'MANTER'; // fonte dinâmica usada por CLIENTES/AÇÕES

    // MIDIA sempre acompanha a classificação atual do engine
    row.MIDIA = op_midiaFromSubAcao_(m.SUB_ACAO || m.ACAO) || '';
    row.LINK_MIDIA_DIRETO = op_lookupMidiaLink_(row.MIDIA);

    return row;
  }).sort(function(a,b){
    var pr = op_priorityRank_(b.PRIORIDADE_FILA) - op_priorityRank_(a.PRIORIDADE_FILA);
    if (pr) return pr;
    if ((b.SCORE_PRIORIDADE||0)!==(a.SCORE_PRIORIDADE||0)) return (b.SCORE_PRIORIDADE||0)-(a.SCORE_PRIORIDADE||0);
    if ((b.SHARE_LOCAL_30D||0)!==(a.SHARE_LOCAL_30D||0)) return (b.SHARE_LOCAL_30D||0)-(a.SHARE_LOCAL_30D||0);
    return String(a.CLIENTE || a.NOME_REMETENTE_BASE || '').localeCompare(String(b.CLIENTE || b.NOME_REMETENTE_BASE || ''), 'pt-BR');
  });
}
function op_applyCurva_(metrics, label, fields){
  var fatVals = metrics.map(function(m){ return op_toNumber_(m[fields.fatField]); });
  var qtdVals = metrics.map(function(m){ return op_toNumber_(m[fields.qtdField]); });
  var ticketVals = metrics.map(function(m){ return op_toNumber_(m[fields.ticketField]); });
  var diasVals = metrics.map(function(m){ return op_toNumber_(m[fields.diasField]); });

  metrics.forEach(function(m){
    var score =
      op_percentileRank_(fatVals, op_toNumber_(m[fields.fatField])) * OP_CFG.CURVA.WEIGHTS.FAT_30D +
      op_percentileRank_(qtdVals, op_toNumber_(m[fields.qtdField])) * OP_CFG.CURVA.WEIGHTS.QTD_30D +
      op_percentileRank_(ticketVals, op_toNumber_(m[fields.ticketField])) * OP_CFG.CURVA.WEIGHTS.TICKET_30D +
      op_percentileRank_(diasVals, op_toNumber_(m[fields.diasField])) * OP_CFG.CURVA.WEIGHTS.DIAS_ATIVOS_30D;
    m['SCORE_CURVA_' + label] = score;
  });

  var total = metrics.length || 1;
  metrics.sort(function(a,b){ return b['SCORE_CURVA_' + label] - a['SCORE_CURVA_' + label]; });

  metrics.forEach(function(m, idx){
    var pos = (idx + 1) / total;
    var preliminar = op_curveFromPos_(pos);
    var maxAllowed = op_curveMaxByFloor_(m, label);
    m[fields.outField] = op_curveClampByMax_(preliminar, maxAllowed);
  });
}

function op_calculateAcao_(m){
  var ativo30   = m.STATUS_ATIVIDADE === 'ATIVO_30D';
  var esfriando = m.STATUS_ATIVIDADE === 'INATIVO_30_59D';
  var inativo30 = m.DIAS_SEM_POSTAR >= 30;
  var inativo60 = m.DIAS_SEM_POSTAR >= 60;

  var isVisitavel =
    (m.QTD_30D >= OP_CFG.RULES.VISITA_MIN_QTD_30D ||
     m.FAT_30D >= OP_CFG.RULES.VISITA_MIN_FAT_30D ||
     m.SHARE_LOCAL_30D >= OP_CFG.RULES.VISITA_MIN_SHARE) &&
    (m.MESES_ATIVOS_TOTAL >= OP_CFG.RULES.VISITA_MIN_MESES ||
     m.QTD_TOTAL >= OP_CFG.RULES.VISITA_MIN_QTD_TOTAL) &&
    m.PORTE_OPERACIONAL !== 'MICRO';

  var relevanteHist      = m.QTD_TOTAL >= 30 || m.VALOR_TOTAL >= 1000 || m.SHARE_LOCAL_30D >= 0.01;
  var relevanteHistMedio = m.QTD_TOTAL >= 8  || m.VALOR_TOTAL >= 250  || m.QTD_30D >= 3 || m.FAT_30D >= 100;

  var recMedia   = m.RECORRENCIA_NIVEL === 'MEDIA' || m.RECORRENCIA_NIVEL === 'FORTE';
  var recForte   = m.RECORRENCIA_NIVEL === 'FORTE';
  var curvaForte = ['TOP','A'].indexOf(m.CURVA) >= 0;
  var curvaBoa   = ['TOP','A','B'].indexOf(m.CURVA) >= 0;
  var aqueceuAgora = op_isAquecendoAgora_(m);

  var isVR   = m.PERFIL_COMERCIAL === 'VR_INTERNO';
  var isMkt  = m.PERFIL_COMERCIAL === 'INTERMEDIADOR_MARKETPLACE';
  var isCtr  = ['CONTRATO_ECT_DIRETO','BALCAO_COM_CONTRATO'].indexOf(m.PERFIL_COMERCIAL) >= 0;
  var isBal  = m.PERFIL_COMERCIAL === 'BALCAO_SEM_CONTRATO';
  var isMix  = m.PERFIL_COMERCIAL === 'SEM_CONTRATO_MISTO';

  var alertaQueda = m.NIVEL_ALERTA === 'QUEDA_REAL' || m.NIVEL_ALERTA === 'QUEDA_PERSISTENTE';

  var ac='MANTER', sub='M1_ESTAVEL_SEM_URGENCIA', pri='BAIXA', score=30,
      canal='MONITORAR', cont='SEM_CONTEUDO', motivo='Cliente estável sem urgência';

  // Regra operacional: reverso de baixo volume não entra em ação comercial ativa.
  if (m.IS_REVERSO_BAIXO === 'SIM' && !isVR) {
    ac='MANTER'; sub='M3_PEQUENO_ATIVO'; pri='BAIXA'; score=10;
    canal='MONITORAR'; cont='SEM_CONTEUDO';
    motivo='Reverso de baixo volume fora do foco comercial';
  }

  // Regra fechada: VR ou converte ou cancela. VR não entra em RESGATAR nem MANTER.
  else if (isVR && (ativo30 || esfriando) && recMedia && relevanteHist && curvaBoa) {
    ac='CONVERTER'; sub='C1_VR_ESTRATEGICO'; pri='CRITICA'; score=98;
    canal='WHATSAPP_AGENDAR_VISITA'; cont='APRESENTACAO_CONTRATO_VR';
    motivo='VR relevante com recorrência e potencial real de migração';
  }

  else if (isVR && ativo30 && aqueceuAgora && relevanteHistMedio && op_hasMinimoConversaoBaixa_(m)) {
    ac='CONVERTER'; sub='C5_VR_AQUECEU_BAIXA_PRIORIDADE'; pri='BAIXA'; score=44;
    canal='WHATSAPP'; cont='APRESENTACAO_CONTRATO_VR';
    motivo='VR pequeno/médio aqueceu agora — vale tentativa leve de conversão';
  }

  else if (isVR && inativo60) {
    ac='CANCELAR'; sub='X1_VR_FRACO'; pri='BAIXA'; score=20;
    canal='WHATSAPP'; cont='ENCERRAMENTO_VR';
    motivo='VR inativo sem justificativa para esforço comercial';
  }

  else if (isVR) {
    ac='CANCELAR'; sub='X2_VR_ATIVO_SEM_PESO'; pri='BAIXA'; score=18;
    canal='WHATSAPP'; cont='ENCERRAMENTO_VR_SUAVE';
    motivo='VR sem peso suficiente para conversão';
  }

  // RESGATAR: agora começa em 30+ dias sem postar, somente para não-VR com histórico.
  else if (inativo30 && isCtr && relevanteHist) {
    ac='RESGATAR'; sub='R1_CONTRATO_INATIVO_ESTRATEGICO';
    pri=inativo60 ? 'CRITICA' : 'ALTA'; score=inativo60 ? 100 : 90;
    canal='WHATSAPP_LIGACAO'; cont='RESGATE_CONTRATO_INATIVO';
    motivo='Contrato inativo '+m.DIAS_SEM_POSTAR+'d — estratégico';
  }

  else if (inativo30 && isMkt && relevanteHist) {
    ac='RESGATAR'; sub='R2_INTERMEDIADOR_BOM_ESFRIOU';
    pri=inativo60 ? 'CRITICA' : 'ALTA'; score=inativo60 ? 95 : 88;
    canal='WHATSAPP_LIGACAO'; cont='RESGATE_INTERMEDIADOR_BOM';
    motivo='Intermediador bom esfriou '+m.DIAS_SEM_POSTAR+'d';
  }

  else if (inativo30 && relevanteHist) {
    ac='RESGATAR'; sub='R3_CLIENTE_FORTE_DO_PASSADO';
    pri=inativo60 ? 'CRITICA' : 'ALTA'; score=inativo60 ? 92 : 84;
    canal='WHATSAPP_LIGACAO'; cont='RETORNO_CLIENTE_FORTE';
    motivo='Cliente forte do passado, inativo '+m.DIAS_SEM_POSTAR+'d';
  }

  else if (inativo30 && relevanteHistMedio) {
    ac='RESGATAR'; sub='R4_CLIENTE_MODERADO_ESFRIOU'; pri='MEDIA'; score=66;
    canal='WHATSAPP'; cont='RETORNO_CLIENTE_FORTE';
    motivo='Cliente moderado sem postar há '+m.DIAS_SEM_POSTAR+'d';
  }

  // CONVERTER: sem contrato forte fica ALTA; casos médios descem para BAIXA.
  else if (isBal && ativo30 && curvaForte && recForte && isVisitavel) {
    ac='CONVERTER'; sub='C2_BALCAO_MADURO_VISITA'; pri='ALTA'; score=84;
    canal='VISITA'; cont='COMPARATIVO_POSTAGENS_CONTRATO';
    motivo='Balcão maduro para contrato — visita';
  }

  else if (isBal && ativo30 && recMedia && curvaBoa && relevanteHistMedio) {
    ac='CONVERTER'; sub='C3_BALCAO_COMPARATIVO_WHATS'; pri='BAIXA'; score=56;
    canal='WHATSAPP'; cont='COMPARATIVO_WHATS_CONTRATO';
    motivo='Balcão com potencial comercial';
  }

  else if ((isBal || isMix) && ativo30 && recMedia && relevanteHist && !curvaForte) {
    ac='CONVERTER'; sub='C4_SEM_CONTRATO_MISTO_DIAGNOSTICO'; pri='BAIXA'; score=50;
    canal='WHATSAPP'; cont='DIAGNOSTICO_SEM_CONTRATO';
    motivo='Sem contrato, perfil misto com relevância — diagnóstico';
  }

  else if ((isBal || isMix) && ativo30 && aqueceuAgora && op_hasMinimoConversaoBaixa_(m)) {
    ac='CONVERTER'; sub='C5_AQUECEU_AGORA_BAIXA_PRIORIDADE'; pri='BAIXA'; score=42;
    canal='WHATSAPP'; cont='DIAGNOSTICO_SEM_CONTRATO';
    motivo='Cliente começou a aquecer agora — tentativa leve de conversão';
  }

  // VISITAR deixa de ser AÇÃO. Cliente estratégico passa a FIDELIZAR CRÍTICA com canal VISITA.
  else if (isCtr && ativo30 && isVisitavel && alertaQueda) {
    ac='FIDELIZAR'; sub='F0_CONTRATO_ESTRATEGICO_CRITICO'; pri='CRITICA'; score=96;
    canal='VISITA'; cont='CHECKLIST_QUEDA_REAL';
    motivo='Contrato estratégico ativo em queda — fidelização crítica por visita';
  }

  else if (isCtr && ativo30 && isVisitavel && curvaForte && recForte && m.NIVEL_ALERTA === 'SAUDAVEL') {
    ac='FIDELIZAR'; sub='F0_RELACIONAMENTO_ESTRATEGICO_CRITICO'; pri='CRITICA'; score=92;
    canal='VISITA'; cont='ROTEIRO_RELACIONAMENTO';
    motivo='Cliente estratégico saudável — fidelização crítica de presença';
  }

  else if (m.NOVO_CLIENTE === 'SIM' && !isVR && m.IS_REVERSO_BAIXO !== 'SIM') {
    if (recMedia) {
      ac='FIDELIZAR'; sub='F4_NOVO_BOM_COMECO'; pri='BAIXA'; score=48;
      canal='WHATSAPP'; cont='BOAS_VINDAS_LEVE';
      motivo='Cliente novo com bom começo';
    } else {
      ac='FIDELIZAR'; sub='F5_NOVO_CLIENTE'; pri='BAIXA'; score=46;
      canal='WHATSAPP'; cont='BOAS_VINDAS_COMPLETO';
      motivo='Novo cliente do mês atual';
    }
  }

  else if (isMkt && ativo30 && alertaQueda && relevanteHist) {
    ac='FIDELIZAR'; sub='F1B_INTERMEDIADOR_MARKETPLACE_EM_ALERTA'; pri='ALTA'; score=88;
    canal='WHATSAPP_LIGACAO'; cont='ABORDAGEM_CONSULTIVA_QUEDA';
    motivo='Marketplace forte em alerta';
  }

  else if (isMkt && ativo30 && m.NIVEL_ALERTA === 'SAUDAVEL' && relevanteHist) {
    ac='FIDELIZAR'; sub='F1A_INTERMEDIADOR_MARKETPLACE_SAUDAVEL'; pri='BAIXA'; score=54;
    canal='WHATSAPP'; cont='MANUAL_MARKETPLACE_UTIL';
    motivo='Marketplace saudável';
  }

  else if (isMkt && ativo30) {
    ac='FIDELIZAR'; sub='F1C_INTERMEDIADOR_MARKETPLACE_UTILIDADE'; pri='BAIXA'; score=50;
    canal='WHATSAPP'; cont='MANUAL_MARKETPLACE_UTIL';
    motivo='Marketplace utilitário — orientação';
  }

  else if (isCtr && ativo30 && op_upperNoAccents_(m.TENDENCIA) === 'CRESCENDO' && recMedia) {
    ac='FIDELIZAR'; sub='F2_CONTRATO_CRESCENDO'; pri='MEDIA'; score=68;
    canal='WHATSAPP'; cont='RELACIONAMENTO_CONTRATO';
    motivo='Contrato crescendo — manter proximidade';
  }

  else if (isCtr && ativo30 && (m.NIVEL_ALERTA === 'ALERTA' || alertaQueda) && !isVisitavel) {
    ac='FIDELIZAR'; sub='F2B_CONTRATO_PEQUENO_EM_ALERTA'; pri='MEDIA'; score=66;
    canal='WHATSAPP'; cont='ACOMPANHAMENTO_CONTRATO_PEQUENO';
    motivo='Contrato pequeno em alerta — acompanhar';
  }

  else if (ativo30 && recMedia && relevanteHist && m.NIVEL_ALERTA === 'SAUDAVEL') {
    ac='FIDELIZAR'; sub='F3_RECORRENTE_SAUDAVEL'; pri='MEDIA'; score=64;
    canal='WHATSAPP'; cont='RELACIONAMENTO_LEVE';
    motivo='Cliente recorrente saudável';
  }

  else if (ativo30 && m.QUEDA_LEVE_SAZONAL === 'SIM') {
    ac='MANTER'; sub='M2_QUEDA_LEVE_SAZONAL'; pri='BAIXA'; score=28;
    canal='MONITORAR'; cont='SEM_CONTEUDO';
    motivo='Queda leve sazonal — monitorar';
  }

  else if (ativo30 && m.PORTE_OPERACIONAL === 'MICRO') {
    ac='MANTER'; sub='M3_PEQUENO_ATIVO'; pri='BAIXA'; score=24;
    canal='MONITORAR'; cont='SEM_CONTEUDO';
    motivo='Pequeno ativo sem urgência';
  }

  m.ACAO = ac;
  m.SUB_ACAO = sub;
  m.PRIORIDADE_FILA = pri;
  m.SCORE_PRIORIDADE = score;
  m.CANAL_SUGERIDO = canal;
  m.CONTEUDO_SUGERIDO = cont;
  m.MOTIVO_REGRA = motivo;
}
function op_midiaFromSubAcao_(key){
  var k = op_upperNoAccents_(key || '');
  if (k.indexOf('VR_ESTRATEGICO') >= 0 || k.indexOf('VR_AQUECEU') >= 0) return 'PDF_CONTRATO';
  if (k.indexOf('BALCAO_MADURO') >= 0 || k.indexOf('COMPARATIVO') >= 0) return 'COMPARATIVO_POSTAGENS_CONTRATO';
  if (k.indexOf('SEM_CONTRATO_MISTO') >= 0 || k.indexOf('DIAGNOSTICO') >= 0 || k.indexOf('AQUECEU_AGORA') >= 0) return 'DIAGNOSTICO_INICIAL';
  if (k.indexOf('RESGATE') >= 0 || k.indexOf('CONTRATO_INATIVO') >= 0 || k.indexOf('INTERMEDIADOR_BOM_ESFRIOU') >= 0 || k.indexOf('CLIENTE_FORTE_DO_PASSADO') >= 0) return 'APRESENTACAO_RESGATE';
  if (k.indexOf('CONTRATO_ESTRATEGICO_CRITICO') >= 0 || k.indexOf('RELACIONAMENTO_ESTRATEGICO_CRITICO') >= 0) return 'FOLDER_RELACIONAMENTO';
  if (k.indexOf('QUEDA') >= 0 && k.indexOf('SAZONAL') < 0) return 'CHECKLIST_VISITA';
  if (k.indexOf('NOVO_CLIENTE') >= 0 || k.indexOf('NOVO_BOM_COMECO') >= 0) return 'MANUAL_BOAS_VINDAS';
  if (k.indexOf('MARKETPLACE') >= 0) return 'MANUAL_MARKETPLACE_UTIL';
  if (k.indexOf('RELACIONAMENTO') >= 0 || k.indexOf('RECORRENTE_SAUDAVEL') >= 0 || k.indexOf('CONTRATO_CRESCENDO') >= 0) return 'FOLDER_RELACIONAMENTO';
  if (k.indexOf('ENCERRAMENTO') >= 0 || k.indexOf('VR_FRACO') >= 0 || k.indexOf('VR_ATIVO_SEM') >= 0) return '';
  return op_midiaFromAcao_(key);
}
function op_midiaFromAcao_(acao){
  var a = op_upperNoAccents_(acao);
  if (a === 'CONVERTER') return 'PDF_CONTRATO';
  if (a === 'RESGATAR') return 'APRESENTACAO_RESGATE';
  if (a === 'FIDELIZAR') return 'FOLDER_RELACIONAMENTO';
  return '';
}

/* ========================= PRESERVAÇÃO ========================= */

function op_readExistingManualFields_(){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) return {};
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var out = {};
  values.slice(1).forEach(function(row){
    var clienteId = op_norm_(op_getCell_(row, hm, 'CLIENTE_ID')); if (!clienteId) return;
    out[clienteId] = {};
    OP_CFG.MANUAL_FIELDS.forEach(function(f){ out[clienteId][f] = op_getCell_(row, hm, f); });
    out[clienteId]._ACAO_LEGACY = op_getCell_(row, hm, 'ACAO');
  });
  return out;
}

/* ========================= WRITE ========================= */

function op_writeMasterSheet_(sheet, rows){
  var headers = [
    'CLIENTE_ID','NOME_REMETENTE_BASE','CLIENTE','NOME_FANTASIA','RAZAO_SOCIAL','CNPJ_CPF','PESSOA_CONTATO','WHATSAPP','EMAIL',
    'ENDERECO','NUMERO','COMPLEMENTO','BAIRRO','CEP','LOCAL_PREDOMINANTE','SEGMENTO_PREDOMINANTE','TIPO_SERVICO_PREDOMINANTE',
    'INTERMEDIADOR_PREDOMINANTE','CATEGORIA_PREDOMINANTE','BUCKET_NEGOCIO','PERFIL_COMERCIAL','TEM_CONTRATO','NUMERO_CONTRATO','CARTAO_POSTAGEM',
    'DATA_PRIMEIRA_POSTAGEM','DATA_PRIMEIRA_VALIDA_NAO_REVERSO','DATA_ULTIMA_POSTAGEM','DIAS_SEM_POSTAR','STATUS_ATIVIDADE','NOVO_CLIENTE','INATIVO_30D','INATIVO_60D',
    'CURVA','CURVA_ANTERIOR','MOVIMENTO_CURVA','PORTE_OPERACIONAL','SHARE_LOCAL_30D','NIVEL_ALERTA','QUEDA_REAL','QUEDA_LEVE_SAZONAL','IS_REVERSO_BAIXO',
    'ACAO_ENGINE','ACAO_ATUAL','ACAO','SUB_ACAO','PRIORIDADE_FILA','SCORE_PRIORIDADE','CANAL_SUGERIDO','CONTEUDO_SUGERIDO','MOTIVO_REGRA','MIDIA','LINK_MIDIA_DIRETO',
    'STATUS_COMERCIAL','OBSERVACOES','ULTIMA_VISITA','ULTIMO_RESULTADO_VISITA','CHECKLIST_ULTIMA_VISITA_ID','DATA_PROXIMO_FOLLOWUP','PROXIMA_ACAO_MANUAL','RESPONSAVEL_CARTEIRA',
    'FAT_30D','QTD_30D','DIAS_ATIVOS_30D','TICKET_30D','FAT_31_60D','QTD_31_60D','DIAS_ATIVOS_31_60D','TICKET_31_60D','TENDENCIA',
    'FD_PCT','QD_PCT','DD_PCT','QTD_TOTAL','VALOR_TOTAL','DIAS_ATIVOS_TOTAL','MESES_ATIVOS_TOTAL','RECORRENTE_30D','RECORRENCIA_NIVEL','SCORE_CURVA_ATUAL','SCORE_CURVA_ANTERIOR',
    'TELEFONE','CIDADE','UF','RESPONSAVEL_ID','STATUS_CADASTRO','UPDATED_AT_CADASTRO','UPDATED_BY'
  ];
  var values = rows.map(function(r){ return headers.map(function(h){ return r[h] != null ? r[h] : ''; }); });
  if (sheet.getMaxRows() < values.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), values.length + 1 - sheet.getMaxRows());
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
  var existingRows = Math.max(0, sheet.getLastRow() - 1);
  if (values.length) sheet.getRange(2,1,values.length,headers.length).setValues(values);
  if (existingRows > values.length) sheet.getRange(values.length + 2, 1, existingRows - values.length, headers.length).clearContent();
  if (sheet.getLastColumn() > headers.length && sheet.getLastRow() > 0) sheet.getRange(1, headers.length + 1, sheet.getLastRow(), sheet.getLastColumn() - headers.length).clearContent();
  sheet.setFrozenRows(1);
  var hm = op_buildHeaderMap_(headers);
  var pctCols = ['SHARE_LOCAL_30D'];
  var numPctCols = ['FD_PCT','QD_PCT','DD_PCT'];
  pctCols.forEach(function(h){ var c = hm[op_headerKey_(h)] + 1; if (c>0 && values.length) sheet.getRange(2,c,values.length,1).setNumberFormat('0.0%'); });
  numPctCols.forEach(function(h){ var c = hm[op_headerKey_(h)] + 1; if (c>0 && values.length) sheet.getRange(2,c,values.length,1).setNumberFormat('0.0"%"'); });
}


/* ========================= ROTINAS DE PERFORMANCE ========================= */

function forceUpdateClientesMaster(){
  var baseSig = op_getBaseSheetSignature_();
  return op_updateClientesMaster(baseSig);
}

function triggerRefreshMaster(){
  var baseSig = op_getBaseSheetSignature_();
  var cache = CacheService.getScriptCache();
  try { cache.remove('master_fresh::' + baseSig); } catch (e) {}
  var result = op_updateClientesMaster(baseSig);
  try { cache.put('master_fresh::' + baseSig, '1', OP_CFG.CACHE.MASTER_SEC); } catch (e) {}
  try { PropertiesService.getScriptProperties().deleteProperty('op_master_refresh_requested_ms'); } catch (e) {}
  return result;
}

function installPerformanceTriggers(){
  var handlers = {};
  ScriptApp.getProjectTriggers().forEach(function(t){ handlers[t.getHandlerFunction()] = true; });
  if (!handlers.triggerRefreshMaster) {
    ScriptApp.newTrigger('triggerRefreshMaster').timeBased().everyHours(1).create();
  }
  if (!handlers.triggerWarmOperationCaches) {
    ScriptApp.newTrigger('triggerWarmOperationCaches').timeBased().everyHours(1).create();
  }
  return { ok:true, message:'Triggers de performance instalados.' };
}

function forceSetup() { op_setupOperacao(true); }