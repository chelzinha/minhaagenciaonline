// ============================================================
// ATENDE - IMPORTACAO AUTOMATICA DO CSV DIARIO DO DRIVE
// Fonte: pasta _Atende Diario
// Objetivo: alimentar a aba Postagens sem fazer o frontend ler CSV bruto.
// ============================================================

const ATENDE_CSV_DIARIO_CFG = Object.freeze({
  FOLDER_ID_PROP: 'ATENDE_CSV_FOLDER_ID',
  HANDLER: 'ATENDE_importarCsvDriveAgora',
  LOG_SHEET: 'LOG_IMPORTACOES',
  PROCESSED_META_PROP: 'ATENDE_CSV_PROCESSED_META_V1',
  CACHE_VERSION_PROP: 'ATENDE_CACHE_VERSION',
  MAX_PROCESSED_META: 60,
  MAX_FOLDER_FILES_TO_SCAN: 30,
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

function ATENDE_getCsvFolderId_() {
  const folderId = PropertiesService.getScriptProperties()
    .getProperty(ATENDE_CSV_DIARIO_CFG.FOLDER_ID_PROP);
  if (!folderId || !String(folderId).trim()) {
    throw new Error(
      'Configure a Script Property "' + ATENDE_CSV_DIARIO_CFG.FOLDER_ID_PROP + '" com o ID da pasta _Atende Diario.'
    );
  }
  return String(folderId).trim();
}

function ATENDE_logResultadoExecucao_(titulo, resultado) {
  console.log(titulo);
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function ATENDE_importarCsvDriveAgora() {
  const lock = LockService.getScriptLock();
  const inicio = Date.now();

  try {
    lock.waitLock(ATENDE_CSV_DIARIO_CFG.LOCK_TIMEOUT_MS);
    const arquivos = ATENDE_listarCsvPendentes_();
    if (!arquivos.length) {
      return ATENDE_logResultadoExecucao_('ATENDE - IMPORTACAO CSV', {
        ok: true,
        message: 'Nenhum CSV novo encontrado.',
        filesProcessed: 0,
        added: 0,
        updated: 0,
        skipped: 0,
        withoutObject: 0,
        invalidMissingKey: 0,
        elapsedMs: Date.now() - inicio
      });
    }

    let totalAdded = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalWithoutObject = 0;
    let totalInvalidMissingKey = 0;
    const resultados = [];

    arquivos.slice(0, ATENDE_CSV_DIARIO_CFG.MAX_FILES_PER_RUN).forEach(function(item) {
      const resultado = ATENDE_importarArquivoCsv_(item.file, item.metaSignature);
      resultados.push(resultado);
      totalAdded += Number(resultado.added || 0);
      totalUpdated += Number(resultado.updated || 0);
      totalSkipped += Number(resultado.skipped || 0);
      totalWithoutObject += Number(resultado.withoutObject || 0);
      totalInvalidMissingKey += Number(resultado.invalidMissingKey || 0);
    });

    if (totalAdded > 0 || totalUpdated > 0) ATENDE_invalidarCacheEIndice_();

    return ATENDE_logResultadoExecucao_('ATENDE - IMPORTACAO CSV', {
      ok: true,
      filesProcessed: resultados.length,
      added: totalAdded,
      updated: totalUpdated,
      skipped: totalSkipped,
      withoutObject: totalWithoutObject,
      invalidMissingKey: totalInvalidMissingKey,
      files: resultados,
      elapsedMs: Date.now() - inicio
    });
  } catch (err) {
    ATENDE_registrarErroCsv_(err);
    return ATENDE_logResultadoExecucao_('ATENDE - ERRO NA IMPORTACAO CSV', {
      ok: false,
      error: err && err.message ? err.message : String(err),
      elapsedMs: Date.now() - inicio
    });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function ATENDE_validarCsvDriveSemGravar() {
  const pasta = DriveApp.getFolderById(ATENDE_getCsvFolderId_());
  const arquivos = ATENDE_coletarArquivosCsv_(pasta);
  if (!arquivos.length) {
    return ATENDE_logResultadoExecucao_('ATENDE - VALIDACAO CSV SEM GRAVAR', {
      ok: false,
      error: 'Nenhum arquivo CSV foi encontrado na pasta configurada.'
    });
  }

  arquivos.sort(function(a, b) {
    return b.file.getLastUpdated().getTime() - a.file.getLastUpdated().getTime();
  });

  const file = arquivos[0].file;
  const parsed = ATENDE_lerCsv_(file);
  const records = [];
  let validObjects = 0;
  let withoutObject = 0;
  let invalidMissingKey = 0;

  parsed.rows.forEach(function(raw) {
    const record = ATENDE_mapearLinhaCsv_(raw);
    if (record.codObjeto) validObjects++;
    else {
      withoutObject++;
      if (!record.csvAtendimentoId) {
        invalidMissingKey++;
        return;
      }
    }
    records.push(record);
  });

  const resultado = {
    ok: true,
    fileName: file.getName(),
    modifiedAt: file.getLastUpdated(),
    totalRows: parsed.rows.length,
    importableRows: records.length,
    validObjects: validObjects,
    withoutObject: withoutObject,
    invalidMissingKey: invalidMissingKey,
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

  return ATENDE_logResultadoExecucao_('ATENDE - VALIDACAO CSV SEM GRAVAR', resultado);
}

function ATENDE_instalarGatilhoCsvDrive() {
  ATENDE_getCsvFolderId_();
  const handler = ATENDE_CSV_DIARIO_CFG.HANDLER;
  const existentes = ScriptApp.getProjectTriggers();
  let removidos = 0;

  existentes.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });

  const trigger = ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
  return ATENDE_logResultadoExecucao_('ATENDE - GATILHO CSV INSTALADO', {
    ok: true,
    handler: handler,
    removedDuplicates: removidos,
    triggerUniqueId: trigger.getUniqueId(),
    cadence: 'a cada 1 hora'
  });
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
  return ATENDE_logResultadoExecucao_('ATENDE - GATILHO CSV REMOVIDO', {
    ok: true,
    removed: removidos
  });
}

function ATENDE_statusCsvDrive() {
  const props = PropertiesService.getScriptProperties();
  const processed = ATENDE_getProcessedMeta_(props);
  const configured = !!String(props.getProperty(ATENDE_CSV_DIARIO_CFG.FOLDER_ID_PROP) || '').trim();
  const triggers = ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return trigger.getHandlerFunction() === ATENDE_CSV_DIARIO_CFG.HANDLER; })
    .map(function(trigger) {
      return {
        handler: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        uniqueId: trigger.getUniqueId()
      };
    });

  return ATENDE_logResultadoExecucao_('ATENDE - STATUS CSV DRIVE', {
    ok: true,
    folderConfigured: configured,
    processedMetaCount: processed.length,
    triggers: triggers
  });
}
