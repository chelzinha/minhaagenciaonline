function agfCacheGet_(key) {
  const normalizedKey = agfCleanText_(key);
  if (!normalizedKey) return null;

  const scriptCache = CacheService.getScriptCache();
  const cachedText = scriptCache.get(normalizedKey);
  if (cachedText) {
    const cached = agfSafeParseJson_(cachedText);
    if (cached) {
      cached.cacheHit = true;
      cached.cacheLayer = 'CacheService';
      return cached;
    }
  }

  let sheetPayload = null;
  try {
    sheetPayload = agfSheetCacheGet_(normalizedKey);
  } catch (error) {
    agfLog_('Falha ao ler cache persistente', { key: normalizedKey, error: error.message });
  }

  if (sheetPayload) {
    scriptCache.put(normalizedKey, JSON.stringify(sheetPayload), AGF_ADDRESS_CONFIG.CACHE_TTL_SECONDS);
    sheetPayload.cacheHit = true;
    sheetPayload.cacheLayer = 'Sheet';
    return sheetPayload;
  }

  return null;
}

function agfCachePut_(key, payload) {
  const normalizedKey = agfCleanText_(key);
  if (!normalizedKey || !payload || !payload.ok) return;

  const payloadToStore = Object.assign({}, payload, {
    cacheHit: false,
    cachedAt: agfNowIso_()
  });

  CacheService.getScriptCache().put(
    normalizedKey,
    JSON.stringify(payloadToStore),
    AGF_ADDRESS_CONFIG.CACHE_TTL_SECONDS
  );

  try {
    agfSheetCachePut_(normalizedKey, payloadToStore);
  } catch (error) {
    agfLog_('Falha ao gravar cache persistente', { key: normalizedKey, error: error.message });
  }
}

function agfGetCacheSpreadsheetId_() {
  return PropertiesService
    .getScriptProperties()
    .getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CACHE_SPREADSHEET_ID);
}

function agfGetCacheSheet_() {
  const spreadsheetId = agfGetCacheSpreadsheetId_();
  if (!spreadsheetId) return null;

  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(AGF_ADDRESS_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(AGF_ADDRESS_CONFIG.SHEET_NAME);
    sheet.getRange(1, 1, 1, AGF_ADDRESS_HEADERS.length).setValues([AGF_ADDRESS_HEADERS]);
    sheet.setFrozenRows(1);
  }

  const firstRow = sheet.getRange(1, 1, 1, AGF_ADDRESS_HEADERS.length).getValues()[0];
  const missingHeader = AGF_ADDRESS_HEADERS.some((header, index) => firstRow[index] !== header);
  if (missingHeader) {
    sheet.getRange(1, 1, 1, AGF_ADDRESS_HEADERS.length).setValues([AGF_ADDRESS_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function agfSheetCacheGet_(key) {
  const sheet = agfGetCacheSheet_();
  if (!sheet) return null;

  const finder = sheet.getRange(1, 1, sheet.getLastRow(), 1)
    .createTextFinder(key)
    .matchEntireCell(true)
    .findNext();

  if (!finder) return null;

  const row = finder.getRow();
  const values = sheet.getRange(row, 1, 1, AGF_ADDRESS_HEADERS.length).getValues()[0];
  const updatedAt = values[11] ? new Date(values[11]) : null;

  if (updatedAt && agfDaysBetween_(updatedAt, new Date()) > AGF_ADDRESS_CONFIG.SHEET_CACHE_MAX_AGE_DAYS) {
    return null;
  }

  const payload = agfSafeParseJson_(values[10]);
  return payload && payload.ok ? payload : null;
}

function agfSheetCachePut_(key, payload) {
  const sheet = agfGetCacheSheet_();
  if (!sheet) return;

  const first = agfFirst_(payload.results) || {};
  const rowValues = [
    key,
    payload.type || '',
    first.cep || '',
    first.logradouro || '',
    first.bairro || '',
    first.cidade || '',
    first.uf || '',
    first.ibge || '',
    payload.provider || '',
    payload.confidence || first.confidence || '',
    JSON.stringify(payload),
    new Date()
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const finder = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1)
      .createTextFinder(key)
      .matchEntireCell(true)
      .findNext();

    if (finder) {
      sheet.getRange(finder.getRow(), 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  } finally {
    lock.releaseLock();
  }
}

function clearAddressCache() {
  // O CacheService expira sozinho; aqui limpamos o cache persistente em Sheets.
  const sheet = agfGetCacheSheet_();
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, AGF_ADDRESS_HEADERS.length).clearContent();
  }

  agfLog_('Cache limpo');
}


function clearAddressQueryCache(query) {
  const rawQuery = agfCleanText_(query || 'Maria Tomasia');
  const runtime = agfGetRuntimeConfig_();
  const plan = agfBuildAddressSearchPlan_({ q: rawQuery, maxResults: runtime.maxResults }, runtime);
  const cacheKey = agfBuildAddressCacheKey_(plan, runtime.maxResults);

  CacheService.getScriptCache().remove(cacheKey);

  const sheet = agfGetCacheSheet_();
  if (sheet && sheet.getLastRow() > 1) {
    const finder = sheet.getRange(1, 1, sheet.getLastRow(), 1)
      .createTextFinder(cacheKey)
      .matchEntireCell(true)
      .findNext();
    if (finder && finder.getRow() > 1) {
      sheet.deleteRow(finder.getRow());
    }
  }

  agfLog_('Cache da consulta removido', { query: rawQuery, cacheKey });
  return { ok: true, query: rawQuery, cacheKey, message: 'Cache da consulta removido.' };
}
