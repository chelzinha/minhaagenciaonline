/**
 * 18_CRM_PERF_TRIGGER.gs
 * ------------------------------------------------------------
 * Warmup periodico do CRM V5 focado no PRIMEIRO LOGIN.
 *
 * O warmup antigo (crm5x_warmupTrigger) tentava aquecer, em uma unica
 * execucao, config + agenda inteira + entidades lite + tratativas. Com a base
 * atual isso pode ultrapassar o limite de execucao do Apps Script.
 *
 * Esta versao aquece somente o caminho critico do get_crm_boot_lite_v5:
 * - configuracao;
 * - dashboard da semana atual.
 *
 * O proprio dashboard aquece as dependencias que ele realmente usa
 * (Agenda + Tratativas) e ainda grava o resultado final no cache. Assim o
 * primeiro login deixa de refazer esse trabalho a frio.
 *
 * Este arquivo NAO cria gatilho automaticamente ao ser publicado.
 * Depois da homologacao, execute crm5x_instalarWarmupTrigger() uma vez.
 * A funcao remove o handler legado, remove duplicados e cria um unico gatilho
 * rapido a cada 10 minutos.
 */

var CRM5X_WARMUP_TRIGGER_HANDLER = 'crm5x_warmupFastTrigger';
var CRM5X_WARMUP_TRIGGER_LEGACY_HANDLER = 'crm5x_warmupTrigger';
var CRM5X_WARMUP_TRIGGER_MINUTES = 10;
var CRM5X_WARMUP_SOFT_BUDGET_MS = 120000;

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
  // Compatibilidade com perfis sem responsavel vinculado.
  if (!seen.__SEM_RESPONSAVEL__) out.push('__SEM_RESPONSAVEL__');
  return out;
}

/**
 * Warmup curto e observavel. O primeiro dashboard (sem filtro) aquece Agenda
 * e Tratativas como dependencias; os demais responsaveis reutilizam esses
 * caches e so materializam o dashboard final de cada usuario.
 */
function crm5x_apiWarmupFast_() {
  var started = new Date().getTime();
  var meta = { version: 'fast-login-v1', timings: [], warmedDashboards: [] };

  function timed_(step, fn) {
    var t0 = new Date().getTime();
    var value = fn();
    meta.timings.push({ step: step, ms: new Date().getTime() - t0 });
    return value;
  }

  var config = timed_('config', function () { return crm3_apiGetConfig_(); });
  var start = op_getWeekStart_(op_toYmd_(new Date()));
  var end = op_addDays_(start, 6);
  var targets = crm5x_warmupTargets_(config);

  for (var i = 0; i < targets.length; i++) {
    // Nao inicia um novo dashboard quando a execucao ja consumiu 2 minutos.
    // O proximo disparo de 10 min completa os alvos restantes, se necessario.
    if (new Date().getTime() - started >= CRM5X_WARMUP_SOFT_BUDGET_MS) {
      meta.stoppedByBudget = true;
      meta.remainingTargets = targets.slice(i);
      break;
    }
    (function (resp) {
      timed_('dashboard:' + (resp || 'TODOS'), function () {
        crm5x_dashboardCached_(start, end, resp);
      });
      meta.warmedDashboards.push(resp || 'TODOS');
    })(targets[i]);
  }

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

/**
 * Instalacao/migracao explicita e idempotente.
 * Remove o gatilho antigo que estoura o tempo e garante um unico fast trigger.
 */
function crm5x_instalarWarmupTrigger() {
  var removidos = crm5x_removerWarmupTriggers_();

  ScriptApp.newTrigger(CRM5X_WARMUP_TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(CRM5X_WARMUP_TRIGGER_MINUTES)
    .create();

  var status = crm5x_statusWarmupTrigger();
  status.criado = true;
  status.removidos = removidos;
  status.mensagem = 'Warmup rapido instalado a cada 10 minutos; gatilhos legados/duplicados foram removidos.';
  return status;
}

function crm5x_migrarWarmupTrigger() {
  return crm5x_instalarWarmupTrigger();
}
