/**
 * 18_CRM_PERF_TRIGGER.gs
 * ------------------------------------------------------------
 * Instalacao explicita do warmup periodico do CRM V5.
 *
 * Este arquivo NAO cria gatilho automaticamente ao ser publicado.
 * Execute crm5x_instalarWarmupTrigger() uma vez no editor do Apps Script
 * depois da homologacao. A funcao e idempotente: se o gatilho ja existir,
 * nao cria outro.
 */

var CRM5X_WARMUP_TRIGGER_HANDLER = 'crm5x_warmupTrigger';
var CRM5X_WARMUP_TRIGGER_MINUTES = 10;

function crm5x_statusWarmupTrigger() {
  var encontrados = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === CRM5X_WARMUP_TRIGGER_HANDLER;
  });
  return {
    ok: true,
    handler: CRM5X_WARMUP_TRIGGER_HANDLER,
    instalado: encontrados.length > 0,
    quantidade: encontrados.length,
    intervaloMinutosEsperado: CRM5X_WARMUP_TRIGGER_MINUTES
  };
}

function crm5x_instalarWarmupTrigger() {
  var status = crm5x_statusWarmupTrigger();
  if (status.instalado) {
    status.criado = false;
    status.mensagem = 'O gatilho de warmup ja estava instalado; nenhum duplicado foi criado.';
    return status;
  }

  ScriptApp.newTrigger(CRM5X_WARMUP_TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(CRM5X_WARMUP_TRIGGER_MINUTES)
    .create();

  var atualizado = crm5x_statusWarmupTrigger();
  atualizado.criado = true;
  atualizado.mensagem = 'Gatilho de warmup instalado para executar a cada 10 minutos.';
  return atualizado;
}
