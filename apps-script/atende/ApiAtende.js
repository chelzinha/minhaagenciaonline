// ============================================================
//  API DO ATENDE - FRONT ATUAL E IMPORTACAO FUTURA
// ============================================================

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'dados' || action === 'postagens') {
    return jsonOutput_(buscarDadosPorData_(e.parameter || {}));
  }

  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Postagens - AGF Jose Bonifacio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    var body = parsePostBody_(e);
    validarIngestToken_(body.token || (e.parameter && e.parameter.token));

    var tipo = safe_(body.tipo || body.type || '').trim();
    if (tipo === 'atendimentos') {
      return jsonOutput_(importarAtendimentosCorreiosAtende_(JSON.stringify(body.payload || body.atendimentos || body), {
        origem: 'doPost',
      }));
    }
    if (tipo === 'objetos_captados' || tipo === 'objetos') {
      return jsonOutput_(importarObjetosCaptadosCorreiosAtende_(JSON.stringify(body.payload || body.objetos || body), {
        origem: 'doPost',
      }));
    }
    if (tipo === 'correios_atende_duplo') {
      return jsonOutput_(importarCorreiosAtendeDuplo_(body));
    }

    throw new Error('Tipo de importacao nao reconhecido.');
  } catch (err) {
    registrarErro_('doPost', err, {});
    return jsonOutput_(erroResposta_(err));
  }
}

function buscarDados(params) {
  try {
    return buscarDadosPorData_(params || {});
  } catch (err) {
    registrarErro_('buscarDados', err, {});
    return erroResposta_(err);
  }
}

function lerPlanilha(params) {
  var result = buscarDados(params || {});
  return result.rows || [];
}

function buscarDadosPorData_(params) {
  params = params || {};
  var data = safe_(params.data || params.date).trim();
  var dataInicio = safe_(params.dataInicio || params.startDate || params.inicio).trim();
  var dataFim = safe_(params.dataFim || params.endDate || params.fim).trim();

  if (data && (!dataInicio && !dataFim)) {
    dataInicio = data;
    dataFim = data;
  }

  var inicioKey = dateFilterKey_(dataInicio);
  var fimKey = dateFilterKey_(dataFim);
  var temFiltroData = !!(inicioKey || fimKey);

  if (inicioKey && fimKey && inicioKey > fimKey) {
    throw new Error('Data inicial maior que data final.');
  }

  if (ATENDE_CONFIG.REQUIRE_FRONT_DATE_FILTER && !temFiltroData) {
    return {
      ok: true,
      rows: [],
      columns: buildColumns_(ATENDE_POSTAGENS_HEADERS),
      meta: {
        filtroObrigatorio: true,
        mensagem: 'Selecione uma data ou periodo para carregar os dados.'
      }
    };
  }

  var version = PropertiesService.getScriptProperties().getProperty('ATENDE_CACHE_VERSION') || '0';
  var cacheKey = [
    'atende:postagens',
    version,
    inicioKey || 'ini',
    fimKey || 'fim'
  ].join(':');

  if (temFiltroData) {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  var spreadsheet = getAtendeSpreadsheet_();
  ensureAtendeStructure_(spreadsheet);
  var sheet = spreadsheet.getSheetByName(ATENDE_CONFIG.SHEETS.POSTAGENS);
  var matrix = readSheetMatrix_(sheet);
  var dataIndex = matrix.indexByHeader['Data'];

  var rows = matrix.rows.filter(function(row) {
    if (!temFiltroData || dataIndex == null) return true;
    var rowKey = dateFilterKey_(row[dataIndex]);
    if (!rowKey) return false;
    if (inicioKey && rowKey < inicioKey) return false;
    if (fimKey && rowKey > fimKey) return false;
    return true;
  }).map(function(row) {
    var obj = {};
    matrix.headers.forEach(function(header, index) {
      obj[header] = formatCellForFront_(row[index], header);
    });
    return obj;
  });

  var payload = {
    ok: true,
    rows: rows,
    columns: buildColumns_(matrix.headers),
    meta: {
      dataInicio: dataInicio,
      dataFim: dataFim,
      filtroServidor: temFiltroData,
      totalRetornado: rows.length
    }
  };

  salvarCacheSeguro_(cacheKey, payload, temFiltroData);
  return payload;
}

function importarCorreiosAtendeDuplo_(body) {
  validarIngestToken_(body.token);
  var atendimentosJson = JSON.stringify(body.atendimentos || body.resumo || {});
  var objetosJson = JSON.stringify(body.objetosCaptados || body.objetos_captados || body.objetos || {});
  var atendimentos = importarAtendimentosCorreiosAtende_(atendimentosJson, { origem: 'doPost-duplo' });
  var objetos = importarObjetosCaptadosCorreiosAtende_(objetosJson, { origem: 'doPost-duplo' });
  return {
    ok: atendimentos.ok && objetos.ok,
    atendimentos: atendimentos,
    objetosCaptados: objetos,
  };
}

function aplicarEstruturaFinal() {
  return setupInicial();
}

function padronizarColunaData() {
  return setupInicial();
}

function diagnosticarPerformancePainel() {
  var start = Date.now();
  var payload = buscarDados();
  return {
    ok: payload.ok,
    rows: payload.rows ? payload.rows.length : 0,
    columns: payload.columns ? payload.columns.length : 0,
    totalMs: Date.now() - start,
  };
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function parsePostBody_(e) {
  var contents = e && e.postData && e.postData.contents;
  if (!contents) return {};
  return JSON.parse(contents);
}

function buildImportResponse_(result, extras) {
  clearAtendeCache_();

  return Object.assign({
    ok: true,
    created: result.created || 0,
    added: result.created || 0,
    updated: result.updated || 0,
    skipped: result.skipped || 0,
    backfilledExisting: result.updated || 0,
  }, extras || {});
}

function formatDateFilter_(data) {
  var parsed = parseDateTimeValue_(data);
  if (!parsed) return data;
  return Utilities.formatDate(parsed, ATENDE_CONFIG.TIMEZONE, 'dd/MM/yyyy');
}

function dateFilterKey_(value) {
  var parsed = parseDateTimeValue_(value);
  if (!parsed) return '';
  return Utilities.formatDate(parsed, ATENDE_CONFIG.TIMEZONE, 'yyyyMMdd');
}

function salvarCacheSeguro_(cacheKey, payload, podeUsarCache) {
  if (!podeUsarCache) return;

  try {
    var text = JSON.stringify(payload);
    var maxChars = ATENDE_CONFIG.CACHE_MAX_CHARS || 90000;
    if (text.length <= maxChars) {
      CacheService.getScriptCache().put(cacheKey, text, ATENDE_CONFIG.CACHE_SECONDS);
    }
  } catch (err) {
    registrarErro_('salvarCacheSeguro', err, { cacheKey: cacheKey });
  }
}

function clearAtendeCache_() {
  try {
    PropertiesService.getScriptProperties().setProperty('ATENDE_CACHE_VERSION', String(Date.now()));
    CacheService.getScriptCache().removeAll([
      'atende:postagens:all',
    ]);
  } catch (_) {}
}
