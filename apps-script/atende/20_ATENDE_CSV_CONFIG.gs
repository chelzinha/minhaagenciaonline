// ============================================================
// ATENDE - IMPORTACAO AUTOMATICA DO CSV DIARIO DO DRIVE
// Fonte: pasta _Atende Diario
// Objetivo: alimentar a aba Postagens sem fazer o frontend ler CSV bruto.
// ============================================================

const ATENDE_CSV_DIARIO_CFG = Object.freeze({
  FOLDER_ID: '1CRDJFUg5DQQIluDZOwlmHBRyrT3WbSvw',
  HANDLER: 'ATENDE_importarCsvDriveAgora',
  LOG_SHEET: 'LOG_IMPORTACOES',
  PROCESSED_META_PROP: 'ATENDE_CSV_PROCESSED_META_V1',
  CACHE_VERSION_PROP: 'ATENDE_CACHE_VERSION',
  MAX_PROCESSED_META: 60,
  MAX_FILES_PER_RUN: 5,
  LOCK_TIMEOUT_MS: 25000,
  REQUIRED_HEADERS: [
    'ATENDIMENTO',
    'CODIGO_OBJETO',
    'CODIGO_SERVICO',
    'DATA_POSTAGEM',
    'NOME_SERVICO',
    'VALOR_ATENDIMENTO',
    'CPF_MATRICULA_ATENDENTE',
    'FORMA_PAGAMENTO',
    'MODALIDADE_PAGAMENTO'
  ]
});

/**
 * Executa a sincronizacao dos CSVs novos da pasta configurada.
 * Pode ser executada manualmente e tambem e usada pelo gatilho horario.
 */
function ATENDE_importarCsvDriveAgora() {
  const lock = LockService.getScriptLock();
  const inicio = Date.now();

  try {
    lock.waitLock(ATENDE_CSV_DIARIO_CFG.LOCK_TIMEOUT_MS);

    const arquivos = ATENDE_listarCsvPendentes_();
    if (!arquivos.length) {
      return {
        ok: true,
        message: 'Nenhum CSV novo encontrado.',
        filesProcessed: 0,
        added: 0,
        skipped: 0,
        invalidWithoutObject: 0,
        elapsedMs: Date.now() - inicio
      };
    }

    let totalAdded = 0;
    let totalSkipped = 0;
    let totalInvalidWithoutObject = 0;
    const resultados = [];

    arquivos.slice(0, ATENDE_CSV_DIARIO_CFG.MAX_FILES_PER_RUN).forEach(function(item) {
      const resultado = ATENDE_importarArquivoCsv_(item.file, item.metaSignature);
      resultados.push(resultado);
      totalAdded += Number(resultado.added || 0);
      totalSkipped += Number(resultado.skipped || 0);
      totalInvalidWithoutObject += Number(resultado.invalidWithoutObject || 0);
    });

    if (totalAdded > 0) {
      ATENDE_invalidarCacheEIndice_();
    }

    return {
      ok: true,
      filesProcessed: resultados.length,
      added: totalAdded,
      skipped: totalSkipped,
      invalidWithoutObject: totalInvalidWithoutObject,
      files: resultados,
      elapsedMs: Date.now() - inicio
    };
  } catch (err) {
    ATENDE_registrarErroCsv_(err);
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      elapsedMs: Date.now() - inicio
    };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * Valida o CSV mais recente sem escrever na planilha.
 * Use esta funcao antes do primeiro processamento em producao.
 */
function ATENDE_validarCsvDriveSemGravar() {
  const pasta = DriveApp.getFolderById(ATENDE_CSV_DIARIO_CFG.FOLDER_ID);
  const arquivos = ATENDE_coletarArquivosCsv_(pasta);
  if (!arquivos.length) {
    return { ok: false, error: 'Nenhum arquivo CSV foi encontrado na pasta configurada.' };
  }

  arquivos.sort(function(a, b) {
    return b.file.getLastUpdated().getTime() - a.file.getLastUpdated().getTime();
  });

  const file = arquivos[0].file;
  const parsed = ATENDE_lerCsv_(file);
  const records = [];
  let invalidWithoutObject = 0;

  parsed.rows.forEach(function(raw) {
    const record = ATENDE_mapearLinhaCsv_(raw);
    if (!record.codObjeto) {
      invalidWithoutObject++;
      return;
    }
    records.push(record);
  });

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    modifiedAt: file.getLastUpdated(),
    totalRows: parsed.rows.length,
    validObjects: records.length,
    invalidWithoutObject: invalidWithoutObject,
    preview: records.slice(0, 5).map(function(record) {
      return {
        Data: record.dtAtendimento,
        Atendente: record.idAtendente,
        Objeto: record.codObjeto,
        codigo: record.codigoAtendimento,
        descricao: record.descricaoAtendimento,
        Categoria: record.categoria,
        Contrato: record.contrato,
        'Cartao Postagem': record.cartaoPostagem,
        Remetente: record.rem_nome,
        Valor: record.valorPostagem,
        'Forma Pagamento': record.formaPagamento,
        'Peso (kg)': record.peso,
        'Dest. Nome': record.dest_nome,
        'Dest. CEP': record.dest_cep,
        'Tipo Postagem': record.origem,
        Status: record.statusDesc,
        tipo: record.tipoAtendimento,
        formaPagamento: record.formaPagamentoAtendimento
      };
    })
  };
}

/**
 * Instala um unico gatilho horario. O horario exato de upload do CSV pode variar,
 * por isso o gatilho verifica a pasta a cada hora e so processa arquivos novos.
 */
function ATENDE_instalarGatilhoCsvDrive() {
  const handler = ATENDE_CSV_DIARIO_CFG.HANDLER;
  const existentes = ScriptApp.getProjectTriggers();
  let removidos = 0;

  existentes.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });

  const trigger = ScriptApp
    .newTrigger(handler)
    .timeBased()
    .everyHours(1)
    .create();

  return {
    ok: true,
    handler: handler,
    removedDuplicates: removidos,
    triggerUniqueId: trigger.getUniqueId(),
    cadence: 'a cada 1 hora'
  };
}

function ATENDE_removerGatilhoCsvDrive() {
  const handler = ATENDE_CSV_DIARIO_CFG.HANDLER;
  let removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });
  return { ok: true, removed: removidos };
}

function ATENDE_statusCsvDrive() {
  const props = PropertiesService.getScriptProperties();
  const processed = ATENDE_getProcessedMeta_(props);
  const triggers = ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() === ATENDE_CSV_DIARIO_CFG.HANDLER;
    })
    .map(function(trigger) {
      return {
        handler: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        uniqueId: trigger.getUniqueId()
      };
    });

  return {
    ok: true,
    folderId: ATENDE_CSV_DIARIO_CFG.FOLDER_ID,
    processedMetaCount: processed.length,
    lastProcessedMeta: processed.length ? processed[processed.length - 1] : '',
    triggers: triggers
  };
}

// ============================================================
