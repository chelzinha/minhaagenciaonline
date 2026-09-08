// ============================================================
// ATENDE - ADMIN > IMPORTACOES
//
// Permite ao administrador consultar e disparar, pelo proprio painel,
// o MESMO fluxo oficial usado pelo gatilho horario:
//   Drive ENTRADA -> D1 -> PROCESSADA -> rebuild CLIENTE PORTAL
//
// Nenhum token do Worker e exposto ao navegador. A sessao da plataforma
// e validada no Apps Script antes de qualquer leitura ou execucao manual.
// ============================================================

function ATENDE_adminStatusImportacoes(platformToken) {
  ATENDE_validarAdmin_(platformToken);
  return ATENDE_adminStatusImportacoesInterno_();
}

function ATENDE_adminProcessarImportacoes(platformToken) {
  ATENDE_validarAdmin_(platformToken);

  const startedAt = Date.now();
  const run = ATENDE_importarCsvDriveD1Agora();
  const status = ATENDE_adminStatusImportacoesInterno_();
  const errors = run && Array.isArray(run.errors) ? run.errors : [];

  return {
    ok: !!(run && run.ok !== false),
    run: run || {},
    pending: Number(status.pending || 0),
    files: status.files || [],
    trigger: status.trigger || {},
    canContinueAutomatically: Number(status.pending || 0) > 0 && errors.length === 0,
    elapsedMs: Date.now() - startedAt
  };
}

function ATENDE_adminStatusImportacoesInterno_() {
  const folders = ATENDE_getD1DriveFolders_();
  const files = ATENDE_listarCsvEntradaD1_(folders.entrada).map(function(file) {
    let size = 0;
    try { size = Number(file.getSize() || 0); } catch (_) {}
    return {
      id: file.getId(),
      name: file.getName(),
      size: size,
      updatedAt: file.getLastUpdated().toISOString(),
      status: 'AGUARDANDO'
    };
  });

  const triggerInfo = ATENDE_adminImportTriggerInfo_();
  return {
    ok: true,
    pending: files.length,
    files: files,
    entrada: ATENDE_D1_CFG.INPUT_FOLDER_NAME,
    processada: ATENDE_D1_CFG.PROCESSED_FOLDER_NAME,
    trigger: triggerInfo
  };
}

function ATENDE_adminImportTriggerInfo_() {
  const handler = 'ATENDE_importarCsvDriveD1Agora';
  const found = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === handler;
  });
  return {
    installed: found.length > 0,
    count: found.length,
    handler: handler,
    cadence: found.length ? 'A cada 1 hora' : 'Sem gatilho automatico'
  };
}
