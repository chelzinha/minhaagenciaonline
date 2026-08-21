/**
 * 19_CRM_PERF_DIAG.gs
 * ------------------------------------------------------------
 * Diagnosticos seguros do primeiro login / warmup V5.
 * Nenhuma funcao deste arquivo altera dados de CRM.
 */

function crm5x_diagPrimeiroLogin() {
  var t0 = new Date().getTime();
  var start = op_getWeekStart_(op_toYmd_(new Date()));
  var end = op_addDays_(start, 6);
  var config = crm3_apiGetConfig_();
  var targets = (typeof crm5x_warmupTargets_ === 'function')
    ? crm5x_warmupTargets_(config)
    : [''];

  var caches = targets.map(function (resp) {
    var key = (typeof crm5x_warmupDashboardKey_ === 'function')
      ? crm5x_warmupDashboardKey_(start, end, resp)
      : ('crm5x|dash|' + crm5x_dataRev_() + '|' + crm5x_configRev_() + '|' + start + '|' + end + '|' + crm3_text_(resp || ''));
    var hit = crm5x_cacheGet_(key);
    return {
      responsavel: resp || 'TODOS',
      cacheQuente: !!hit,
      periodo: start + ' a ' + end
    };
  });

  var triggerStatus = null;
  try {
    if (typeof crm5x_statusWarmupTrigger === 'function') triggerStatus = crm5x_statusWarmupTrigger();
  } catch (e) {
    triggerStatus = { ok:false, error:String(e && e.message || e) };
  }

  var out = {
    ok: true,
    dataRev: crm5x_dataRev_(),
    configRev: crm5x_configRev_(),
    periodo: { start:start, end:end },
    todosCachesQuentes: caches.length > 0 && caches.every(function (x) { return x.cacheQuente; }),
    caches: caches,
    trigger: triggerStatus,
    diagnosticoMs: new Date().getTime() - t0,
    agora: op_nowIso_()
  };
  Logger.log('[CRM5X primeiro login] ' + JSON.stringify(out));
  return out;
}

/**
 * Teste manual seguro depois da publicacao: executa o warmup rapido uma vez
 * e imediatamente confirma se os caches usados no primeiro login existem.
 */
function crm5x_testarWarmupPrimeiroLogin() {
  if (typeof crm5x_apiWarmupFast_ !== 'function') {
    throw new Error('Warmup rapido nao disponivel. Publique 18_CRM_PERF_TRIGGER primeiro.');
  }
  var warmup = crm5x_apiWarmupFast_();
  var diag = crm5x_diagPrimeiroLogin();
  return { ok: !!(warmup && warmup.ok && diag.todosCachesQuentes), warmup:warmup, diagnostico:diag };
}
