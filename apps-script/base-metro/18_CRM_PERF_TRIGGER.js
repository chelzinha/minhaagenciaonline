/**
 * 18_CRM_PERF_TRIGGER.gs
 * ------------------------------------------------------------
 * Warmup periodico do CRM V5 focado no PRIMEIRO LOGIN.
 *
 * O warmup antigo (crm5x_warmupTrigger) tentava aquecer, em uma unica
 * execucao, config + agenda inteira + entidades lite + tratativas. Com a base
 * atual isso pode ultrapassar o limite de execucao do Apps Script.
 *
 * Esta versao NAO executa o dashboard pesado para aquece-lo. Em vez disso,
 * le somente as colunas usadas pelos indicadores iniciais, monta o mesmo
 * payload do crm3_apiGetDashboard_ e grava na mesma chave de cache usada por
 * crm5x_dashboardCached_. Assim o primeiro login encontra o dashboard pronto.
 *
 * Este arquivo NAO cria gatilho automaticamente ao ser publicado.
 * Depois da homologacao, execute crm5x_instalarWarmupTrigger() uma vez.
 * A funcao remove o handler legado, remove duplicados, cria um unico gatilho
 * rapido a cada 10 minutos e ja executa um warmup imediato.
 */

var CRM5X_WARMUP_TRIGGER_HANDLER = 'crm5x_warmupFastTrigger';
var CRM5X_WARMUP_TRIGGER_LEGACY_HANDLER = 'crm5x_warmupTrigger';
var CRM5X_WARMUP_TRIGGER_MINUTES = 10;

function crm5x_statusWarmupTrigger() {
  var ativos = 0;
  var legados = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === CRM5X_WARMUP_TRIGGER_HANDLER) ativos++;
    if (h === CRM5X_WARMUP_TRIGGER_LEGACY_HANDLER) legados++;
  });
  return {
    ok: true,
    handler: CRM5X_WARMUP_TRIGGER_HANDLER,
    instalado: ativos > 0,
    quantidade: ativos,
    legacyHandler: CRM5X_WARMUP_TRIGGER_LEGACY_HANDLER,
    legacyQuantidade: legados,
    precisaMigrar: legados > 0 || ativos !== 1,
    intervaloMinutosEsperado: CRM5X_WARMUP_TRIGGER_MINUTES
  };
}

function crm5x_warmupDisplayName_(r) {
  r = r || {};
  return crm3_text_(
    r.DISPLAY_NAME || r.displayName || r.NOME || r.nome ||
    r.NOME_RESPONSAVEL || r.nomeResponsavel || r.USERNAME || r.username ||
    r.RESPONSAVEL_ID || r.responsavelId || ''
  );
}

function crm5x_warmupTargets_(config) {
  var out = [''];
  var seen = { '': true };
  (config && config.responsaveis || []).forEach(function (r) {
    var nome = crm5x_warmupDisplayName_(r);
    if (!nome || seen[nome]) return;
    seen[nome] = true;
    out.push(nome);
  });
  if (!seen.__SEM_RESPONSAVEL__) out.push('__SEM_RESPONSAVEL__');
  return out;
}

function crm5x_warmupHeaderIndex_(hm, names) {
  names = Array.isArray(names) ? names : [names];
  for (var i = 0; i < names.length; i++) {
    var k = op_headerKey_(names[i]);
    if (hm[k] !== undefined) return hm[k] + 1;
  }
  return 0;
}

function crm5x_warmupReadColumn_(sh, col, rows) {
  if (!col || rows <= 0) return [];
  return sh.getRange(2, col, rows, 1).getValues().map(function (r) { return r[0]; });
}

function crm5x_warmupAgendaRows_(config, start, end) {
  var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.AGENDA);
  if (!sh || sh.getLastRow() < 2) return [];
  var n = sh.getLastRow() - 1;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var hm = crm3_headerMap_(headers);
  var cId = crm5x_warmupHeaderIndex_(hm, 'AGENDA_ID');
  var cDate = crm5x_warmupHeaderIndex_(hm, ['DATA_PROGRAMADA', 'DATA']);
  var cStatus = crm5x_warmupHeaderIndex_(hm, ['STATUS_ATIVIDADE', 'STATUS_AGENDA']);
  var cType = crm5x_warmupHeaderIndex_(hm, 'TIPO_ATIVIDADE_ID');
  var cRespId = crm5x_warmupHeaderIndex_(hm, 'RESPONSAVEL_ID');
  var cRespName = crm5x_warmupHeaderIndex_(hm, 'RESPONSAVEL');

  var ids = crm5x_warmupReadColumn_(sh, cId, n);
  var dates = crm5x_warmupReadColumn_(sh, cDate, n);
  var statuses = crm5x_warmupReadColumn_(sh, cStatus, n);
  var types = crm5x_warmupReadColumn_(sh, cType, n);
  var respIds = crm5x_warmupReadColumn_(sh, cRespId, n);
  var respNames = crm5x_warmupReadColumn_(sh, cRespName, n);

  var typeNames = {};
  (config && config.tiposAtividade || []).forEach(function (x) {
    var id = crm3_text_(x.TIPO_ATIVIDADE_ID || x.tipoAtividadeId);
    if (id) typeNames[id] = crm3_text_(x.NOME_EXIBICAO || x.nome || id);
  });

  var out = [];
  for (var i = 0; i < n; i++) {
    var agendaId = crm3_text_(ids[i]);
    if (!agendaId) continue;
    var date = op_dateValueToYmd_(dates[i]);
    if (!date || date < start || date > end) continue;
    var typeId = crm3_text_(types[i]);
    var typeName = typeNames[typeId] || typeId;
    if (typeof crm5_isLegacyColetaText_ === 'function' && crm5_isLegacyColetaText_(typeId + ' ' + typeName)) continue;
    out.push({
      statusAtividade: crm3_text_(statuses[i]),
      tipoAtividadeNome: typeName,
      responsavelId: crm3_text_(respIds[i]),
      responsavelNome: crm3_text_(respNames[i]),
      dataProgramada: date
    });
  }
  return out;
}

function crm5x_warmupTratativaRows_() {
  var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.TRATATIVAS);
  if (!sh || sh.getLastRow() < 2) return [];
  var n = sh.getLastRow() - 1;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var hm = crm3_headerMap_(headers);
  var cId = crm5x_warmupHeaderIndex_(hm, 'TRATATIVA_ID');
  var cStatus = crm5x_warmupHeaderIndex_(hm, 'STATUS_TRATATIVA');
  var cStage = crm5x_warmupHeaderIndex_(hm, 'ETAPA_ID');
  var cResp = crm5x_warmupHeaderIndex_(hm, 'RESPONSAVEL_ID');

  var ids = crm5x_warmupReadColumn_(sh, cId, n);
  var statuses = crm5x_warmupReadColumn_(sh, cStatus, n);
  var stages = crm5x_warmupReadColumn_(sh, cStage, n);
  var resps = crm5x_warmupReadColumn_(sh, cResp, n);
  var out = [];
  for (var i = 0; i < n; i++) {
    if (!crm3_text_(ids[i])) continue;
    out.push({
      STATUS_TRATATIVA: crm3_text_(statuses[i]),
      ETAPA_ID: crm3_text_(stages[i]),
      RESPONSAVEL_ID: crm3_text_(resps[i])
    });
  }
  return out;
}

function crm5x_warmupResponsibleIndex_(config) {
  var idx = {};
  (config && config.responsaveis || []).forEach(function (r) {
    var pid = crm3_normResp_(r.RESPONSAVEL_ID || r.responsavelId);
    if (!pid) return;
    [r.RESPONSAVEL_ID, r.responsavelId, r.USERNAME, r.username, r.DISPLAY_NAME, r.displayName, r.NOME, r.nome].forEach(function (v) {
      var k = crm3_normResp_(v);
      if (k) idx[k] = pid;
    });
  });
  return idx;
}

function crm5x_warmupPersonId_(value, idx) {
  var key = crm3_normResp_(value);
  if (!key) return '';
  return idx[key] || key;
}

function crm5x_warmupBuildDashboard_(agendaRows, tratRows, start, end, resp, respIdx) {
  var wanted = resp ? crm5x_warmupPersonId_(resp, respIdx) : '';
  var activities = agendaRows.filter(function (x) {
    return !wanted || crm5x_warmupPersonId_(x.responsavelId, respIdx) === wanted;
  });
  var treatments = tratRows.filter(function (x) {
    return !wanted || crm5x_warmupPersonId_(x.RESPONSAVEL_ID, respIdx) === wanted;
  });
  var today = op_toYmd_(new Date());
  var planned = activities.filter(function (x) { return crm3_upper_(x.statusAtividade) === 'PLANEJADO'; });
  var completed = activities.filter(function (x) { return crm3_upper_(x.statusAtividade) === 'CONCLUIDO'; });
  var overdue = planned.filter(function (x) { return x.dataProgramada && x.dataProgramada < today; });
  return {
    ok: true,
    period: { start: start, end: end },
    atividades: {
      total: activities.length,
      planejadas: planned.length,
      concluidas: completed.length,
      canceladas: activities.filter(function (x) { return crm3_upper_(x.statusAtividade) === 'CANCELADO'; }).length,
      vencidas: overdue.length,
      taxaExecucao: activities.length ? Math.round((completed.length / activities.length) * 100) : 0,
      porTipo: crm3_countBy_(activities, 'tipoAtividadeNome'),
      porResponsavel: crm3_countBy_(activities, 'responsavelNome')
    },
    tratativas: {
      abertas: treatments.filter(function (x) { return crm3_upper_(x.STATUS_TRATATIVA) === 'ABERTA'; }).length,
      pausadas: treatments.filter(function (x) { return crm3_upper_(x.STATUS_TRATATIVA) === 'PAUSADA'; }).length,
      concluidas: treatments.filter(function (x) { return crm3_upper_(x.STATUS_TRATATIVA) === 'CONCLUIDA'; }).length,
      encerradas: treatments.filter(function (x) { return crm3_upper_(x.STATUS_TRATATIVA) === 'ENCERRADA'; }).length,
      porEtapa: crm3_countBy_(treatments, 'ETAPA_ID')
    }
  };
}

function crm5x_warmupDashboardKey_(start, end, resp) {
  return 'crm5x|dash|' + crm5x_dataRev_() + '|' + crm5x_configRev_() + '|' + start + '|' + end + '|' + crm3_text_(resp || '');
}

function crm5x_apiWarmupFast_() {
  var started = new Date().getTime();
  var meta = { version: 'fast-login-v2', timings: [], warmedDashboards: [] };
  function timed_(step, fn) {
    var t0 = new Date().getTime();
    var value = fn();
    meta.timings.push({ step: step, ms: new Date().getTime() - t0 });
    return value;
  }

  var config = timed_('config', function () { return crm3_apiGetConfig_(); });
  var start = op_getWeekStart_(op_toYmd_(new Date()));
  var end = op_addDays_(start, 6);
  var agendaRows = timed_('agendaColumns', function () { return crm5x_warmupAgendaRows_(config, start, end); });
  var tratRows = timed_('tratativaColumns', function () { return crm5x_warmupTratativaRows_(); });
  var respIdx = crm5x_warmupResponsibleIndex_(config);
  var targets = crm5x_warmupTargets_(config);

  targets.forEach(function (resp) {
    var dash = crm5x_warmupBuildDashboard_(agendaRows, tratRows, start, end, resp, respIdx);
    crm5x_cachePut_(crm5x_warmupDashboardKey_(start, end, resp), dash, CRM5X_CFG.TTL_DATA_SEC);
    meta.warmedDashboards.push(resp || 'TODOS');
  });

  meta.agendaRows = agendaRows.length;
  meta.tratativaRows = tratRows.length;
  meta.totalMs = new Date().getTime() - started;
  meta.ok = true;
  meta.warmed = true;
  try { Logger.log('[CRM5X warmup fast] ' + JSON.stringify(meta)); } catch (e) {}
  return meta;
}

function crm5x_warmupFastTrigger() {
  return crm5x_apiWarmupFast_();
}

function crm5x_removerWarmupTriggers_() {
  var removidos = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h !== CRM5X_WARMUP_TRIGGER_HANDLER && h !== CRM5X_WARMUP_TRIGGER_LEGACY_HANDLER) return;
    ScriptApp.deleteTrigger(t);
    removidos.push(h);
  });
  return removidos;
}

function crm5x_instalarWarmupTrigger() {
  var removidos = crm5x_removerWarmupTriggers_();
  ScriptApp.newTrigger(CRM5X_WARMUP_TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(CRM5X_WARMUP_TRIGGER_MINUTES)
    .create();

  var warmup = crm5x_apiWarmupFast_();
  var status = crm5x_statusWarmupTrigger();
  status.criado = true;
  status.removidos = removidos;
  status.warmup = warmup;
  status.mensagem = 'Warmup rapido instalado a cada 10 minutos; gatilhos legados/duplicados foram removidos e o cache inicial ja foi aquecido.';
  return status;
}

function crm5x_migrarWarmupTrigger() {
  return crm5x_instalarWarmupTrigger();
}
