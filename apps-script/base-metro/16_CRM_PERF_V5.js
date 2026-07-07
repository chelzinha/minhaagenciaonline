/**
 * 16_CRM_PERF_V5.gs
 * ------------------------------------------------------------
 * Fase PERF V5 - Boot rapido do CRM (camada ADITIVA).
 *
 * Problema resolvido:
 * - get_crm_boot_v4 fazia, num boot frio, 3 varreduras completas da aba
 *   AGENDA_EXECUCAO (semana, vencidas -180d e proximas +365d), 1 leitura
 *   FULL de CLIENTES_MASTER (~50 colunas, com byId duplicando o JSON no
 *   cache), 1 leitura FULL de PROSPECTS (~60 colunas) e ~10 abas de config,
 *   alem de dezenas de chamadas a PropertiesService (uma por operacao de
 *   cache). Qualquer POST invalidava TODOS os caches de uma vez
 *   (crm3_bumpCacheRev_ + op_invalidateOperationCaches_), entao o boot
 *   seguinte era sempre frio.
 *
 * O que esta camada faz:
 * 1. AGENDA lida UMA vez (janela hoje-400d ate hoje+400d), projetada e
 *    cacheada inteira; qualquer intervalo de datas vira um filtro em
 *    memoria (crm5x_agendaSlice_). Fora da janela, cai no scan direto.
 * 2. Entidades "lite": CLIENTES_MASTER projetado em modo 'compact'
 *    (so os campos que o kanban usa) + PROSPECTS lite, cacheados sem
 *    duplicacao de byId. A jornada usa isso em vez do FULL.
 * 3. PropertiesService lido UMA vez por execucao (getProperties memoizado).
 * 4. Cache de CONFIG com revisao propria: POSTs do CRM NAO derrubam mais
 *    o cache das abas de configuracao (funis, etapas, tipos, resultados,
 *    responsaveis, midias, blocos, segmentos, locais).
 * 5. Single-flight (LockService) na construcao dos caches pesados: se 5
 *    requests chegam frios em paralelo, so 1 constroi; os outros esperam
 *    e leem do cache (evita o "estouro de manada" que motivou o boot v3).
 * 6. Novas actions GET:
 *    - get_crm_boot_lite_v5  -> config + dashboard (primeiro paint rapido)
 *                               e aquece os caches compartilhados.
 *    - warm_crm_cache_v5     -> aquece tudo (usar tambem em gatilho de tempo).
 *    - clear_crm_cache_v5    -> invalida dados + config (forcar atualizacao).
 *
 * Nada aqui substitui rotas existentes: get_crm_boot_v4/v3 continuam
 * funcionando e ficam rapidas porque os leitores de baixo nivel do 06
 * (crm3_readAgendaV3_, crm3_apiGetJornada_) passam a delegar para ca.
 */

var CRM5X_CFG = {
  VERSION: '5.0.0',
  // Janela do cache de agenda: cobre vencidas (-180d) e proximas (+365d)
  // com folga. Pedidos fora disso caem no scan direto (raros).
  AGENDA_WINDOW_BACK_DAYS: 400,
  AGENDA_WINDOW_FWD_DAYS: 400,
  // TTLs: dados sao invalidados por revisao a cada escrita, entao o TTL e
  // so uma rede de seguranca. Config e editada manualmente na planilha,
  // por isso TTL menor + action clear_crm_cache_v5 para forcar.
  TTL_DATA_SEC: 1800,
  TTL_CONFIG_SEC: 600,
  CHUNK: 90000, // bytes por chave (limite do CacheService: 100KB)
  PROPS: {
    CONFIG_REV: 'crm5x_config_rev'
  },
  LOCK_WAIT_MS: 20000
};

/* ============== MEMOIZACAO POR EXECUCAO (Properties e caches) ============== */

var CRM5X_MEMO = { props: null, agendaAll: null, entities: null };

// Le TODAS as Script Properties em UMA chamada e memoiza na execucao.
// Antes: 1 chamada a PropertiesService por operacao de cache (~40-60 por boot).
function crm5x_props_() {
  if (CRM5X_MEMO.props) return CRM5X_MEMO.props;
  CRM5X_MEMO.props = PropertiesService.getScriptProperties().getProperties() || {};
  return CRM5X_MEMO.props;
}
function crm5x_getProp_(key) {
  var p = crm5x_props_();
  return p[key] !== undefined ? p[key] : null;
}
// Chamado pelo crm3_bumpCacheRev_ (06) apos escritas: reseta os memos
// para que a propria execucao que escreveu ja enxergue dados novos.
function crm5x_bumpDataRev_() {
  CRM5X_MEMO.props = null;
  CRM5X_MEMO.agendaAll = null;
  CRM5X_MEMO.entities = null;
}
function crm5x_dataRev_() { return crm5x_getProp_(CRM3_CFG.PROPS.CACHE_REV) || '0'; }
function crm5x_configRev_() { return crm5x_getProp_(CRM5X_CFG.PROPS.CONFIG_REV) || '0'; }
function crm5x_bumpConfigRev_() {
  var p = PropertiesService.getScriptProperties();
  var n = Number(p.getProperty(CRM5X_CFG.PROPS.CONFIG_REV) || 0) + 1;
  p.setProperty(CRM5X_CFG.PROPS.CONFIG_REV, String(n));
  CRM5X_MEMO.props = null;
}

/* ============== CACHE JSON EM CHUNKS COM getAll/putAll ============== */
// Igual ao pcj_/gcj_ do dashboard, mas le os chunks com UM getAll
// (o gcj_ legado faz um cache.get por chunk = N idas a rede).

function crm5x_cachePut_(key, obj, ttlSec) {
  try {
    var c = CacheService.getScriptCache();
    var j = JSON.stringify(obj);
    if (j.length <= CRM5X_CFG.CHUNK) { c.put(key, j, ttlSec); return; }
    var parts = {};
    var n = 0;
    for (var i = 0; i < j.length; i += CRM5X_CFG.CHUNK) {
      parts[key + '_c' + n] = j.substring(i, i + CRM5X_CFG.CHUNK);
      n++;
    }
    parts[key] = JSON.stringify({ _chunks: n });
    c.putAll(parts, ttlSec);
  } catch (e) { /* cache e otimizacao, nunca derruba a request */ }
}

function crm5x_cacheGet_(key) {
  try {
    var c = CacheService.getScriptCache();
    var raw = c.get(key);
    if (!raw) return null;
    var meta = JSON.parse(raw);
    if (!meta || !meta._chunks) return meta;
    var keys = [];
    for (var i = 0; i < meta._chunks; i++) keys.push(key + '_c' + i);
    var got = c.getAll(keys);
    var parts = [];
    for (var k = 0; k < keys.length; k++) {
      if (!got[keys[k]]) return null; // chunk expirou: trata como miss
      parts.push(got[keys[k]]);
    }
    return JSON.parse(parts.join(''));
  } catch (e) { return null; }
}

/* ============== SINGLE-FLIGHT (evita estouro de manada) ============== */
// Constroi um cache pesado sob lock: quem chega junto espera e le pronto.

function crm5x_buildOnce_(cacheKey, ttlSec, buildFn) {
  var hit = crm5x_cacheGet_(cacheKey);
  if (hit) return hit;
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(CRM5X_CFG.LOCK_WAIT_MS);
  } catch (e) { lock = null; } // sem lock, segue e constroi assim mesmo
  try {
    // double-check: outro request pode ter construido enquanto esperavamos
    hit = crm5x_cacheGet_(cacheKey);
    if (hit) return hit;
    var built = buildFn();
    crm5x_cachePut_(cacheKey, built, ttlSec);
    return built;
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (e2) {} }
  }
}

/* ============== AGENDA: UMA leitura, N fatias ============== */

function crm5x_agendaWindow_() {
  var hoje = op_toYmd_(new Date());
  return {
    start: op_addDays_(hoje, -CRM5X_CFG.AGENDA_WINDOW_BACK_DAYS),
    end: op_addDays_(hoje, CRM5X_CFG.AGENDA_WINDOW_FWD_DAYS)
  };
}

// Lista completa (janela +-400d) projetada no MESMO formato do
// crm3_readAgendaV3_ original. Reusa o scan legado (crm3_readAgendaV3_scan_)
// para garantir shape identico ao que o frontend ja consome.
function crm5x_agendaAll_() {
  if (CRM5X_MEMO.agendaAll) return CRM5X_MEMO.agendaAll;
  var win = crm5x_agendaWindow_();
  var key = 'crm5x|ag|' + crm5x_dataRev_() + '|' + win.start;
  var out = crm5x_buildOnce_(key, CRM5X_CFG.TTL_DATA_SEC, function () {
    return { win: win, items: crm3_readAgendaV3_scan_(win.start, win.end) };
  });
  CRM5X_MEMO.agendaAll = out;
  return out;
}

// Substitui as varreduras por intervalo: filtra a lista cacheada em memoria.
// Fora da janela (consulta historica rara), cai no scan direto legado.
function crm5x_agendaSlice_(start, end) {
  var all = crm5x_agendaAll_();
  if (start < all.win.start || end > all.win.end) {
    return crm3_readAgendaV3_scan_(start, end);
  }
  return all.items.filter(function (x) {
    return x.dataProgramada >= start && x.dataProgramada <= end;
  });
}

/* ============== ENTIDADES LITE (kanban da jornada) ============== */
// O crm3_projectTreatment_ usa ~12 campos da entidade. Antes o boot lia a
// projecao FULL de CLIENTES_MASTER (com byId duplicado no cache). Aqui:
// - clientes: reusa op_projectClient_ em modo 'compact' (ja contem tudo
//   que o kanban precisa);
// - prospects: projecao enxuta propria;
// - cacheia so os arrays (byId e montado em memoria, sem duplicar JSON).

function crm5x_entitiesLite_() {
  if (CRM5X_MEMO.entities) return CRM5X_MEMO.entities;
  var key = 'crm5x|ent|' + crm5x_dataRev_();
  var data = crm5x_buildOnce_(key, CRM5X_CFG.TTL_DATA_SEC, function () {
    return {
      clients: crm5x_scanClientsCompact_(),
      prospects: crm5x_scanProspectsLite_()
    };
  });
  var clientsById = {};
  data.clients.forEach(function (x) { if (x.clienteId) clientsById[x.clienteId] = x; });
  var prospectsById = {};
  data.prospects.forEach(function (x) { if (x.prospectId) prospectsById[x.prospectId] = x; });
  CRM5X_MEMO.entities = { clients: clientsById, prospects: prospectsById };
  return CRM5X_MEMO.entities;
}

function crm5x_scanClientsCompact_() {
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  return values.slice(1).map(function (r, idx) {
    return op_projectClient_(r, hm, 'compact', idx + 2);
  }).filter(function (x) { return !!x.clienteId; });
}

function crm5x_scanProspectsLite_() {
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  return values.slice(1).map(function (r) {
    return {
      prospectId: op_norm_(op_getCell_(r, hm, 'PROSPECT_ID')),
      cliente: op_norm_(op_getCell_(r, hm, 'CLIENTE')),
      nomeFantasia: op_norm_(op_getCell_(r, hm, 'NOME_FANTASIA')),
      razaoSocial: op_norm_(op_getCell_(r, hm, 'RAZAO_SOCIAL')),
      local: op_norm_(op_getCell_(r, hm, 'LOCAL')),
      prioridade: op_norm_(op_getCell_(r, hm, 'PRIORIDADE')),
      responsavel: op_norm_(op_getCell_(r, hm, 'RESPONSAVEL')),
      statusProspect: op_norm_(op_getCell_(r, hm, 'STATUS_PROSPECT'))
    };
  }).filter(function (x) { return !!x.prospectId; });
}

// Mapas lite para a leitura da jornada (crm3_apiGetJornada_ delega para ca).
// Os fluxos de ESCRITA continuam usando crm3_buildEntityMaps_ (full),
// entao nenhuma validacao de gravacao muda.
function crm5x_buildEntityMapsLite_() {
  return crm5x_entitiesLite_();
}

/* ============== NOVAS ACTIONS ============== */

// Primeiro paint: config + indicadores. Tambem aquece agenda e entidades,
// para as chamadas paralelas seguintes (jornadas/agenda) baterem cache quente.
function crm5x_apiBootLite_(params) {
  params = params || {};
  var resp = crm3_text_(params.responsavelId || '');
  var start = crm3_text_(params.start || op_getWeekStart_(op_toYmd_(new Date())));
  var end = crm3_text_(params.end || op_addDays_(start, 6));
  var meta = { version: CRM5X_CFG.VERSION, timings: [] };
  function timed_(step, fn) {
    var t0 = new Date().getTime();
    var v = fn();
    meta.timings.push({ step: step, ms: new Date().getTime() - t0 });
    return v;
  }
  var config = timed_('config', function () { return crm3_apiGetConfig_(); });
  var dashboard = timed_('dashboard', function () {
    return crm3_apiGetDashboard_({ start: start, end: end, responsavelId: resp });
  });
  // dashboard ja construiu o cache de agenda; aquece o de entidades:
  timed_('warm_entities', function () { crm5x_entitiesLite_(); return true; });
  return { ok: true, meta: meta, config: config, dashboard: dashboard };
}

// Aquece todos os caches compartilhados. Use no gatilho de tempo (a cada
// 10 min) para o primeiro usuario do dia nao pagar o boot frio:
// Editor Apps Script > Acionadores > crm5x_warmupTrigger > tempo > 10 min.
function crm5x_apiWarmup_() {
  var meta = { timings: [] };
  function timed_(step, fn) {
    var t0 = new Date().getTime();
    fn();
    meta.timings.push({ step: step, ms: new Date().getTime() - t0 });
  }
  timed_('config', function () { crm3_apiGetConfig_(); });
  timed_('agendaAll', function () { crm5x_agendaAll_(); });
  timed_('entities', function () { crm5x_entitiesLite_(); });
  timed_('tratativas', function () { crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS); });
  return { ok: true, warmed: true, meta: meta };
}

function crm5x_warmupTrigger() { return crm5x_apiWarmup_(); }

// Invalidacao manual: derruba dados E config (usar quando editar as abas
// de configuracao direto na planilha e quiser ver na hora).
function crm5x_apiClearCache_() {
  crm3_bumpCacheRev_();      // dados (tambem reseta memos via crm5x_bumpDataRev_)
  crm5x_bumpConfigRev_();    // config
  try { op_invalidateOperationCaches_(); } catch (e) {}
  return { ok: true, cleared: true, dataRev: crm5x_dataRev_(), configRev: crm5x_configRev_() };
}
