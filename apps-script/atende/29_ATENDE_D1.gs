// ============================================================
// ATENDE - INTEGRACAO APPS SCRIPT -> CLOUDFLARE WORKER -> D1
// CAMADA RAW: 1 linha do CSV = 1 linha no banco, sem deduplicacao.
// Fluxo Drive: ENTRADA -> validacao integral no D1 -> PROCESSADA.
// ============================================================

const ATENDE_D1_CFG = Object.freeze({
  API_URL_PROP: 'ATENDE_D1_API_URL',
  API_TOKEN_PROP: 'ATENDE_D1_API_TOKEN',
  PROCESSED_META_PROP: 'ATENDE_D1_RAW_PROCESSED_META_V2', // legado; pasta PROCESSADA passa a ser o estado visual
  INPUT_FOLDER_NAME: 'ENTRADA',
  PROCESSED_FOLDER_NAME: 'PROCESSADA',
  CHUNK_ROWS: 400,
  MAX_FILES_PER_RUN: 1,
  MAX_EXECUTION_MS: 270000,
  SAFETY_MARGIN_MS: 20000,
  TIMEOUT_LOCK_MS: 25000,
  IMPORT_HISTORY_PROP: 'ATENDE_D1_IMPORT_HISTORY_V1',
  IMPORT_HISTORY_LIMIT: 20
});

function ATENDE_getD1Config_() {
  const props = PropertiesService.getScriptProperties();
  const apiUrl = String(props.getProperty(ATENDE_D1_CFG.API_URL_PROP) || '').trim().replace(/\/$/, '');
  const token = String(props.getProperty(ATENDE_D1_CFG.API_TOKEN_PROP) || '').trim();
  if (!apiUrl) throw new Error('Configure a Script Property "' + ATENDE_D1_CFG.API_URL_PROP + '".');
  if (!token) throw new Error('Configure a Script Property "' + ATENDE_D1_CFG.API_TOKEN_PROP + '".');
  return { apiUrl: apiUrl, token: token };
}

function ATENDE_getProcessedD1Meta_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(ATENDE_D1_CFG.PROCESSED_META_PROP);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function ATENDE_markProcessedD1Meta_(signature) {
  // Mantido apenas por compatibilidade com versoes anteriores.
  if (!signature) return;
  const props = PropertiesService.getScriptProperties();
  const list = ATENDE_getProcessedD1Meta_().filter(function(item) { return item !== signature; });
  list.push(signature);
  while (list.length > 240) list.shift();
  props.setProperty(ATENDE_D1_CFG.PROCESSED_META_PROP, JSON.stringify(list));
}

function ATENDE_resetarControleRawD1() {
  PropertiesService.getScriptProperties().deleteProperty(ATENDE_D1_CFG.PROCESSED_META_PROP);
  const result = {
    ok: true,
    property: ATENDE_D1_CFG.PROCESSED_META_PROP,
    message: 'Controle legado RAW resetado. O fluxo atual usa as pastas ENTRADA e PROCESSADA.'
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_getOrCreateChildFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

function ATENDE_getD1DriveFolders_() {
  const root = DriveApp.getFolderById(ATENDE_getCsvFolderId_());
  const entrada = ATENDE_getOrCreateChildFolder_(root, ATENDE_D1_CFG.INPUT_FOLDER_NAME);
  const processada = ATENDE_getOrCreateChildFolder_(root, ATENDE_D1_CFG.PROCESSED_FOLDER_NAME);
  return { root: root, entrada: entrada, processada: processada };
}

function ATENDE_isCsvFile_(file) {
  const name = String(file && file.getName ? file.getName() : '').trim();
  if (/\.csv$/i.test(name)) return true;
  try {
    const mime = String(file.getMimeType() || '').toLowerCase();
    return mime.indexOf('csv') >= 0;
  } catch (_) {
    return false;
  }
}

function ATENDE_moverCsvRaizParaEntrada_(folders) {
  // Compatibilidade de transicao: CSVs que ainda estiverem diretamente na
  // pasta raiz sao enviados para ENTRADA. O fileId nao muda ao mover.
  let moved = 0;
  const files = folders.root.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!ATENDE_isCsvFile_(file)) continue;
    file.moveTo(folders.entrada);
    moved++;
  }
  return moved;
}

function ATENDE_listarCsvEntradaD1_(entrada) {
  const files = [];
  const iterator = entrada.getFiles();
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (!ATENDE_isCsvFile_(file)) continue;
    files.push(file);
  }
  return files.sort(function(a, b) {
    return a.getLastUpdated().getTime() - b.getLastUpdated().getTime();
  });
}

function ATENDE_prepararPastasD1() {
  const folders = ATENDE_getD1DriveFolders_();
  const movedFromRoot = ATENDE_moverCsvRaizParaEntrada_(folders);
  const pending = ATENDE_listarCsvEntradaD1_(folders.entrada).length;
  const result = {
    ok: true,
    entrada: ATENDE_D1_CFG.INPUT_FOLDER_NAME,
    processada: ATENDE_D1_CFG.PROCESSED_FOLDER_NAME,
    movedFromRoot: movedFromRoot,
    pending: pending
  };
  console.log('ATENDE - PASTAS D1');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_fetchD1_(path, options) {
  const cfg = ATENDE_getD1Config_();
  const opts = Object.assign({}, options || {});
  opts.muteHttpExceptions = true;
  opts.headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + cfg.token });

  const response = UrlFetchApp.fetch(cfg.apiUrl + path, opts);
  const code = response.getResponseCode();
  const text = response.getContentText();
  let body = null;
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }

  if (code < 200 || code >= 300 || !body || body.ok !== true) {
    const detail = body && (body.error || body.raw) ? (body.error || body.raw) : text;
    throw new Error('D1 API HTTP ' + code + ': ' + detail);
  }
  return body;
}

function ATENDE_testarD1() {
  const cfg = ATENDE_getD1Config_();
  const response = UrlFetchApp.fetch(cfg.apiUrl + '/health', { muteHttpExceptions: true });
  const result = {
    ok: response.getResponseCode() === 200,
    httpCode: response.getResponseCode(),
    apiUrl: cfg.apiUrl,
    body: response.getContentText()
  };
  console.log('ATENDE - TESTE D1');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_statusD1() {
  try {
    const cfg = ATENDE_getD1Config_();
    const folders = ATENDE_getD1DriveFolders_();
    const result = {
      ok: true,
      apiUrlConfigured: !!cfg.apiUrl,
      tokenConfigured: !!cfg.token,
      apiUrl: cfg.apiUrl,
      pendingInEntrada: ATENDE_listarCsvEntradaD1_(folders.entrada).length,
      inputFolder: ATENDE_D1_CFG.INPUT_FOLDER_NAME,
      processedFolder: ATENDE_D1_CFG.PROCESSED_FOLDER_NAME
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const result = { ok: false, error: err.message || String(err) };
    console.error(JSON.stringify(result, null, 2));
    return result;
  }
}

function ATENDE_lerCsvD1Leve_(file) {
  const decoded = ATENDE_lerTextoCsv_(file);
  let text = String(decoded.text || '');

  if (!text.trim()) {
    throw new Error('O arquivo CSV esta vazio: ' + file.getName());
  }

  const fileHash = ATENDE_sha256_(text);
  const matrix = Utilities.parseCsv(text, ';');

  // O hash ja foi calculado. Nao precisamos manter outra copia do texto
  // durante todo o envio ao D1.
  decoded.text = '';
  text = '';

  if (!matrix || matrix.length < 2) {
    throw new Error('O CSV nao possui linhas de dados: ' + file.getName());
  }

  const headers = matrix[0].map(function(value) {
    return ATENDE_cleanCsvValue_(value).trim().toUpperCase();
  });

  const sourceType = ATENDE_detectarFonteCsv_(headers);

  if (!sourceType) {
    throw new Error(
      'CSV com estrutura inesperada. Nao foi possivel identificar ATENDE ou CONSOLIDADOR pelos cabecalhos.'
    );
  }

  if (sourceType === 'ATENDE') {
    const missing = ATENDE_CSV_DIARIO_CFG.REQUIRED_HEADERS.filter(function(header) {
      return headers.indexOf(header) < 0;
    });

    if (missing.length) {
      throw new Error(
        'CSV ATENDE com estrutura inesperada. Cabecalhos ausentes: ' +
        missing.join(', ')
      );
    }
  } else {
    const missingCons = ATENDE_validarHeadersConsolidador_(headers);

    if (missingCons.length) {
      throw new Error(
        'CSV CONSOLIDADOR com estrutura inesperada. Cabecalhos ausentes: ' +
        missingCons.join(', ')
      );
    }
  }

  // Reaproveita a propria matriz retornada pelo parseCsv.
  // Em vez de criar rawRows + rows para o arquivo inteiro, compactamos
  // as linhas validas dentro do mesmo array.
  let writeIndex = 0;

  for (let i = 1; i < matrix.length; i++) {
    let row = matrix[i];

    if (sourceType === 'CONSOLIDADOR') {
      row = ATENDE_repararLinhaConsolidador_(row, headers);
    }

    let hasValue = false;

    for (let j = 0; j < row.length; j++) {
      if (String(row[j] == null ? '' : row[j]) !== '') {
        hasValue = true;
        break;
      }
    }

    if (!hasValue) continue;

    if (
      sourceType === 'CONSOLIDADOR' &&
      ATENDE_linhaTotalConsolidador_(row, headers)
    ) {
      continue;
    }

    matrix[writeIndex] = row;
    writeIndex++;
  }

  matrix.length = writeIndex;

  return {
    encoding: decoded.encoding,
    headers: headers,
    rows: matrix,
    sourceType: sourceType,
    fileHash: fileHash
  };
}

function ATENDE_criarChunkD1_(parsed, offset, limit) {
  const source = parsed.rows || [];
  const headers = parsed.headers || [];
  const end = Math.min(source.length, offset + limit);
  const result = new Array(Math.max(0, end - offset));

  for (let i = offset; i < end; i++) {
    const sourceRow = source[i] || [];
    const obj = {};

    for (let j = 0; j < headers.length; j++) {
      const value = sourceRow[j];
      obj[headers[j]] =
        value === null || value === undefined ? '' : String(value);
    }

    result[i - offset] = obj;
  }

  return result;
}

function ATENDE_getD1ImportHistory_() {
  try {
    const raw = PropertiesService
      .getScriptProperties()
      .getProperty(ATENDE_D1_CFG.IMPORT_HISTORY_PROP);

    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed.slice(0, ATENDE_D1_CFG.IMPORT_HISTORY_LIMIT);
  } catch (_) {
    return [];
  }
}

function ATENDE_registrarHistoricoImportacaoD1_(result) {
  if (!result) return;

  const fileId = String(result.fileId || '');
  const fileName = String(result.fileName || '');

  const item = {
    fileId: fileId,
    fileName: fileName,
    status: String(result.status || ''),
    totalRows: Number(result.totalRows || 0),
    importedRows: Number(
      result.stored ||
      (result.completed ? result.totalRows : 0) ||
      0
    ),
    insertedThisRun: Number(result.insertedThisRun || 0),
    sentThisRun: Number(result.sentThisRun || 0),
    invalid: Number(result.invalid || 0),
    completed: result.completed === true,
    error: String(result.error || ''),
    importedAt: new Date().toISOString()
  };

  let history = ATENDE_getD1ImportHistory_();

  history = history.filter(function(old) {
    if (fileId) return String(old.fileId || '') !== fileId;
    return String(old.fileName || '') !== fileName;
  });

  history.unshift(item);

  if (history.length > ATENDE_D1_CFG.IMPORT_HISTORY_LIMIT) {
    history = history.slice(0, ATENDE_D1_CFG.IMPORT_HISTORY_LIMIT);
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(
      ATENDE_D1_CFG.IMPORT_HISTORY_PROP,
      JSON.stringify(history)
    );
}
function ATENDE_importarArquivoCsvD1_(file, processada, deadlineMs) {
  const parsed = ATENDE_lerCsvD1Leve_(file);

  const fileId = file.getId();
  const fileHash = parsed.fileHash;
  const totalRows = parsed.rows.length;
  const modifiedAt = file.getLastUpdated().toISOString();

  const check = ATENDE_fetchD1_(
    '/imports/check?fileId=' +
      encodeURIComponent(fileId) +
      '&hash=' +
      encodeURIComponent(fileHash),
    { method: 'get' }
  );

  if (check.completed) {
    file.moveTo(processada);

    return {
      fileId: fileId,
      fileName: file.getName(),
      status: 'already_complete_moved_to_processed',
      totalRows: totalRows,
      sentThisRun: 0,
      insertedThisRun: 0,
      stored: Number(
        check.import && check.import.gravadas || totalRows
      ),
      invalid: 0,
      requests: 0,
      completed: true
    };
  }

  let offset = Math.max(
    0,
    Number(check.import && check.import.recebidas || 0)
  );

  if (offset > totalRows) offset = 0;

  // Se uma execucao anterior enviou tudo mas nao concluiu o lote,
  // reenvia somente o ultimo chunk com final=true.
  if (offset >= totalRows && totalRows > 0) {
    offset = Math.max(
      0,
      totalRows - ATENDE_D1_CFG.CHUNK_ROWS
    );
  }

  let sentThisRun = 0;
  let insertedThisRun = 0;
  let invalid = 0;
  let requests = 0;

  let stored = Number(
    check.import && check.import.gravadas || 0
  );

  let completed = false;

  for (
    ;
    offset < totalRows;
    offset += ATENDE_D1_CFG.CHUNK_ROWS
  ) {
    if (
      Date.now() >=
      deadlineMs - ATENDE_D1_CFG.SAFETY_MARGIN_MS
    ) {
      break;
    }

    const rows = ATENDE_criarChunkD1_(
      parsed,
      offset,
      ATENDE_D1_CFG.CHUNK_ROWS
    );

    const final =
      offset + rows.length >= totalRows;

    const payload = {
      fileId: fileId,
      fileName: file.getName(),
      fileHash: fileHash,
      fileModifiedAt: modifiedAt,
      totalRows: totalRows,
      offset: offset,
      final: final,
      rows: rows
    };

    let payloadText = JSON.stringify(payload);

    // A partir daqui o array de objetos fica somente dentro
    // do texto JSON enviado ao Worker.
    payload.rows = [];

    const result = ATENDE_fetchD1_('/ingest', {
      method: 'post',
      contentType: 'application/json',
      payload: payloadText
    });

    payloadText = '';
    rows.length = 0;

    if (result.duplicateFile && result.completed) {
      stored = totalRows;
      completed = true;
      break;
    }

    sentThisRun += Number(result.received || 0);
    insertedThisRun += Number(result.inserted || 0);
    invalid += Number(result.invalid || 0);
    stored = Number(result.stored || stored || 0);
    completed = result.completed === true;
    requests++;

    if (completed) break;
  }

  if (completed) {
    if (stored !== totalRows) {
      throw new Error(
        'Integridade RAW falhou: CSV=' +
        totalRows +
        ', D1=' +
        stored +
        '. O arquivo permanecera em ENTRADA.'
      );
    }

    file.moveTo(processada);

    return {
      fileId: fileId,
      fileName: file.getName(),
      status: 'processed',
      totalRows: totalRows,
      sentThisRun: sentThisRun,
      insertedThisRun: insertedThisRun,
      stored: stored,
      invalid: invalid,
      requests: requests,
      completed: true
    };
  }

  return {
    fileId: fileId,
    fileName: file.getName(),
    status: 'partial_waiting_next_run',
    totalRows: totalRows,
    sentThisRun: sentThisRun,
    insertedThisRun: insertedThisRun,
    stored: stored,
    invalid: invalid,
    requests: requests,
    completed: false
  };
}

function ATENDE_importarCsvDriveD1Agora() {
  const lock = LockService.getScriptLock();
  const inicio = Date.now();
  const deadlineMs = inicio + ATENDE_D1_CFG.MAX_EXECUTION_MS;

  try {
    lock.waitLock(ATENDE_D1_CFG.TIMEOUT_LOCK_MS);
    ATENDE_getD1Config_();

    const folders = ATENDE_getD1DriveFolders_();
    const movedFromRoot = ATENDE_moverCsvRaizParaEntrada_(folders);
    const arquivos = ATENDE_listarCsvEntradaD1_(folders.entrada);

    if (!arquivos.length) {
      return ATENDE_logResultadoExecucao_('ATENDE - IMPORTACAO DRIVE -> D1 RAW', {
        ok: true,
        message: 'Nenhum CSV aguardando em ENTRADA.',
        movedFromRoot: movedFromRoot,
        filesProcessed: 0,
        elapsedMs: Date.now() - inicio
      });
    }

    const files = [];
    const errors = [];
    let completed = 0;
    let partial = 0;
    let sent = 0;
    let inserted = 0;

    const arquivosDaRodada = arquivos.slice(
      0,
      ATENDE_D1_CFG.MAX_FILES_PER_RUN
    );

    for (let i = 0; i < arquivosDaRodada.length; i++) {
      if (Date.now() >= deadlineMs - ATENDE_D1_CFG.SAFETY_MARGIN_MS) break;

      const file = arquivosDaRodada[i];
      try {
        const result = ATENDE_importarArquivoCsvD1_(file, folders.processada, deadlineMs);

        ATENDE_registrarHistoricoImportacaoD1_(result);

        files.push(result);
        sent += Number(result.sentThisRun || 0);
        inserted += Number(result.insertedThisRun || 0);
        if (result.completed) completed++;
        else {
          partial++;
          // Prioriza concluir o mesmo arquivo no proximo gatilho em vez de
          // iniciar arquivos seguintes com pouco tempo restante.
          break;
        }
      } catch (fileErr) {
        const message =
          fileErr && fileErr.message
            ? fileErr.message
            : String(fileErr);

        ATENDE_registrarHistoricoImportacaoD1_({
          fileId: file.getId(),
          fileName: file.getName(),
          status: 'error',
          totalRows: 0,
          stored: 0,
          insertedThisRun: 0,
          sentThisRun: 0,
          invalid: 0,
          completed: false,
          error: message
        });

        errors.push({
          fileName: file.getName(),
          error: message
        });

        ATENDE_registrarErroCsv_(fileErr);
        // O arquivo permanece em ENTRADA.
      }
    }

    const pendingAfter = ATENDE_listarCsvEntradaD1_(folders.entrada).length;
    return ATENDE_logResultadoExecucao_('ATENDE - IMPORTACAO DRIVE -> D1 RAW', {
      ok: errors.length === 0,
      movedFromRoot: movedFromRoot,
      filesAttempted: files.length + errors.length,
      filesCompleted: completed,
      filesPartial: partial,
      pendingInEntrada: pendingAfter,
      sentThisRun: sent,
      insertedThisRun: inserted,
      files: files,
      errors: errors,
      elapsedMs: Date.now() - inicio
    });
  } catch (err) {
    ATENDE_registrarErroCsv_(err);
    return ATENDE_logResultadoExecucao_('ATENDE - ERRO DRIVE -> D1 RAW', {
      ok: false,
      error: err && err.message ? err.message : String(err),
      elapsedMs: Date.now() - inicio
    });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function ATENDE_instalarGatilhoD1() {
  const antigo = 'ATENDE_importarCsvDriveAgora';
  const novo = 'ATENDE_importarCsvDriveD1Agora';
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === antigo || handler === novo) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  const trigger = ScriptApp.newTrigger(novo).timeBased().everyHours(1).create();
  return ATENDE_logResultadoExecucao_('ATENDE - GATILHO D1 INSTALADO', {
    ok: true,
    handler: novo,
    removedOldTriggers: removed,
    triggerUniqueId: trigger.getUniqueId(),
    cadence: 'a cada 1 hora',
    flow: 'ENTRADA -> PROCESSADA'
  });
}

function ATENDE_statusGatilhoD1() {
  const handlers = ['ATENDE_importarCsvDriveAgora', 'ATENDE_importarCsvDriveD1Agora'];
  const triggers = ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return handlers.indexOf(trigger.getHandlerFunction()) >= 0; })
    .map(function(trigger) {
      return {
        handler: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        uniqueId: trigger.getUniqueId()
      };
    });
  const result = { ok: true, triggers: triggers };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_rebuildClientePortalD1() {
  const result = ATENDE_fetchD1_('/rebuild-cliente-portal', {
    method: 'post'
  });
  console.log('ATENDE - REBUILD CLIENTE PORTAL D1');
  console.log(JSON.stringify(result, null, 2));
  return result;
}
