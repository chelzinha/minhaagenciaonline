// ============================================================
// ATENDE - INTEGRACAO APPS SCRIPT -> CLOUDFLARE WORKER -> D1
// CAMADA RAW: 1 linha do CSV = 1 linha no banco, sem deduplicacao.
// ============================================================

const ATENDE_D1_CFG = Object.freeze({
  API_URL_PROP: 'ATENDE_D1_API_URL',
  API_TOKEN_PROP: 'ATENDE_D1_API_TOKEN',
  PROCESSED_META_PROP: 'ATENDE_D1_RAW_PROCESSED_META_V2',
  MAX_PROCESSED_META: 240,
  CHUNK_ROWS: 500,
  MAX_FILES_PER_RUN: 2,
  TIMEOUT_LOCK_MS: 25000
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
  if (!signature) return;
  const props = PropertiesService.getScriptProperties();
  const list = ATENDE_getProcessedD1Meta_().filter(function(item) { return item !== signature; });
  list.push(signature);
  while (list.length > ATENDE_D1_CFG.MAX_PROCESSED_META) list.shift();
  props.setProperty(ATENDE_D1_CFG.PROCESSED_META_PROP, JSON.stringify(list));
}

function ATENDE_resetarControleRawD1() {
  PropertiesService.getScriptProperties().deleteProperty(ATENDE_D1_CFG.PROCESSED_META_PROP);
  const result = { ok: true, property: ATENDE_D1_CFG.PROCESSED_META_PROP, message: 'Controle local RAW resetado.' };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_listarCsvPendentesD1_() {
  const folder = DriveApp.getFolderById(ATENDE_getCsvFolderId_());
  const arquivos = ATENDE_coletarArquivosCsv_(folder);
  const processed = new Set(ATENDE_getProcessedD1Meta_());

  return arquivos
    .sort(function(a, b) { return b.file.getLastUpdated().getTime() - a.file.getLastUpdated().getTime(); })
    .slice(0, ATENDE_CSV_DIARIO_CFG.MAX_FOLDER_FILES_TO_SCAN)
    .filter(function(item) { return !processed.has(item.metaSignature); })
    .sort(function(a, b) { return a.file.getLastUpdated().getTime() - b.file.getLastUpdated().getTime(); });
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
    const result = {
      ok: true,
      apiUrlConfigured: !!cfg.apiUrl,
      tokenConfigured: !!cfg.token,
      apiUrl: cfg.apiUrl,
      processedRawMetaCount: ATENDE_getProcessedD1Meta_().length
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const result = { ok: false, error: err.message || String(err) };
    console.error(JSON.stringify(result, null, 2));
    return result;
  }
}

function ATENDE_importarArquivoCsvD1_(file, metaSignature) {
  const parsed = ATENDE_lerCsv_(file);
  const fileId = file.getId();
  const fileHash = ATENDE_sha256_(parsed.text);
  const rawRows = parsed.rawRows || parsed.rows || [];
  const totalRows = rawRows.length;
  const modifiedAt = file.getLastUpdated().toISOString();

  const check = ATENDE_fetchD1_(
    '/imports/check?fileId=' + encodeURIComponent(fileId) + '&hash=' + encodeURIComponent(fileHash),
    { method: 'get' }
  );

  if (check.completed) {
    ATENDE_markProcessedD1Meta_(metaSignature);
    return {
      fileName: file.getName(), fileId: fileId, status: 'already_in_raw_d1',
      totalRows: totalRows, sent: 0, inserted: 0, hash: fileHash
    };
  }

  let sent = 0;
  let inserted = 0;
  let invalid = 0;
  let requests = 0;
  let stored = 0;

  for (let offset = 0; offset < totalRows; offset += ATENDE_D1_CFG.CHUNK_ROWS) {
    const rows = rawRows.slice(offset, offset + ATENDE_D1_CFG.CHUNK_ROWS);
    const final = offset + rows.length >= totalRows;
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

    const result = ATENDE_fetchD1_('/ingest', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload)
    });

    if (result.duplicateFile && result.completed) {
      sent = totalRows;
      stored = totalRows;
      break;
    }

    sent += Number(result.received || 0);
    inserted += Number(result.inserted || 0);
    invalid += Number(result.invalid || 0);
    stored = Number(result.stored || stored || 0);
    requests++;
  }

  if (sent < totalRows) throw new Error('Importacao RAW incompleta: ' + sent + ' de ' + totalRows + ' linhas enviadas.');
  if (stored !== totalRows) throw new Error('Integridade RAW falhou: CSV=' + totalRows + ', D1=' + stored + '. O arquivo nao sera marcado como processado.');

  ATENDE_markProcessedD1Meta_(metaSignature);
  return {
    fileName: file.getName(), fileId: fileId, status: 'imported_raw_d1',
    totalRows: totalRows, sent: sent, inserted: inserted, stored: stored,
    invalid: invalid, requests: requests, hash: fileHash
  };
}

function ATENDE_importarCsvDriveD1Agora() {
  const lock = LockService.getScriptLock();
  const inicio = Date.now();
  try {
    lock.waitLock(ATENDE_D1_CFG.TIMEOUT_LOCK_MS);
    ATENDE_getD1Config_();
    const arquivos = ATENDE_listarCsvPendentesD1_();

    if (!arquivos.length) {
      return ATENDE_logResultadoExecucao_('ATENDE - IMPORTACAO DRIVE -> D1 RAW', {
        ok: true, message: 'Nenhum CSV novo encontrado para o D1 RAW.',
        filesProcessed: 0, sent: 0, inserted: 0, elapsedMs: Date.now() - inicio
      });
    }

    const files = [];
    let sent = 0, inserted = 0, invalid = 0;
    arquivos.slice(0, ATENDE_D1_CFG.MAX_FILES_PER_RUN).forEach(function(item) {
      const result = ATENDE_importarArquivoCsvD1_(item.file, item.metaSignature);
      files.push(result);
      sent += Number(result.sent || 0);
      inserted += Number(result.inserted || 0);
      invalid += Number(result.invalid || 0);
    });

    return ATENDE_logResultadoExecucao_('ATENDE - IMPORTACAO DRIVE -> D1 RAW', {
      ok: true, filesProcessed: files.length, sent: sent, inserted: inserted,
      invalid: invalid, files: files, elapsedMs: Date.now() - inicio
    });
  } catch (err) {
    ATENDE_registrarErroCsv_(err);
    return ATENDE_logResultadoExecucao_('ATENDE - ERRO DRIVE -> D1 RAW', {
      ok: false, error: err && err.message ? err.message : String(err), elapsedMs: Date.now() - inicio
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
    if (handler === antigo || handler === novo) { ScriptApp.deleteTrigger(trigger); removed++; }
  });
  const trigger = ScriptApp.newTrigger(novo).timeBased().everyHours(1).create();
  return ATENDE_logResultadoExecucao_('ATENDE - GATILHO D1 INSTALADO', {
    ok: true, handler: novo, removedOldTriggers: removed,
    triggerUniqueId: trigger.getUniqueId(), cadence: 'a cada 1 hora'
  });
}

function ATENDE_statusGatilhoD1() {
  const handlers = ['ATENDE_importarCsvDriveAgora', 'ATENDE_importarCsvDriveD1Agora'];
  const triggers = ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return handlers.indexOf(trigger.getHandlerFunction()) >= 0; })
    .map(function(trigger) {
      return { handler: trigger.getHandlerFunction(), eventType: String(trigger.getEventType()), uniqueId: trigger.getUniqueId() };
    });
  const result = { ok: true, triggers: triggers };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
