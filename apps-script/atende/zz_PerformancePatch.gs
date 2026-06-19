// ============================================================
//  ATENDE - PATCH DE PERFORMANCE DO PAINEL MODULAR
//  Otimiza buscarDados/buscarDadosPorData_ lendo primeiro a coluna Data.
// ============================================================

function buscarDados(params) {
  try {
    return buscarDadosPorData_(params || {});
  } catch (err) {
    registrarErro_('buscarDados-performance', err, {});
    return erroResposta_(err);
  }
}

function lerPlanilha(params) {
  var result = buscarDados(params || {});
  return result.rows || [];
}

function buscarDadosPorData_(params) {
  return buscarDadosPayloadRapido_(params || {});
}

function buscarDadosPayloadRapido_(params) {
  var startMs = Date.now();
  var marks = {};
  params = params || {};

  var data = safe_(params.data || params.date).trim();
  var dataInicio = safe_(params.dataInicio || params.startDate || params.inicio).trim();
  var dataFim = safe_(params.dataFim || params.endDate || params.fim).trim();

  if (data && !dataInicio && !dataFim) {
    dataInicio = data;
    dataFim = data;
  }

  var inicioKey = fastDateKeyAtende_(dataInicio);
  var fimKey = fastDateKeyAtende_(dataFim);
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
        mensagem: 'Selecione uma data ou periodo para carregar os dados.',
        modoLeitura: 'filtro_obrigatorio',
        tempoMs: Date.now() - startMs
      }
    };
  }

  var version = PropertiesService.getScriptProperties().getProperty('ATENDE_CACHE_VERSION') || '0';
  var cacheKey = ['atende:postagens-fast-v2', version, inicioKey || 'ini', fimKey || 'fim'].join(':');

  if (temFiltroData) {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      var cachedPayload = JSON.parse(cached);
      cachedPayload.meta = cachedPayload.meta || {};
      cachedPayload.meta.cacheHit = true;
      cachedPayload.meta.tempoMs = Date.now() - startMs;
      return cachedPayload;
    }
  }
  marks.tempoCacheMs = Date.now() - startMs;

  var tOpen = Date.now();
  var spreadsheet = getAtendeSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(ATENDE_CONFIG.SHEETS.POSTAGENS);
  if (!sheet) {
    ensureAtendeStructure_(spreadsheet);
    sheet = spreadsheet.getSheetByName(ATENDE_CONFIG.SHEETS.POSTAGENS);
  }
  marks.tempoAbrirPlanilhaMs = Date.now() - tOpen;

  var tRead = Date.now();
  var matrix = temFiltroData
    ? readPostagensByDateRangeRapido_(sheet, inicioKey, fimKey)
    : readSheetMatrix_(sheet);
  marks.tempoLerPlanilhaMs = Date.now() - tRead;

  var tFormat = Date.now();
  var rows = matrix.rows.map(function(row) {
    var obj = {};
    matrix.headers.forEach(function(header, index) {
      obj[header] = formatCellForFront_(row[index], header);
    });
    return obj;
  });
  marks.tempoFormatarLinhasMs = Date.now() - tFormat;

  var tColumns = Date.now();
  var columns = buildColumns_(matrix.headers);
  marks.tempoMontarColunasMs = Date.now() - tColumns;

  var metaLeitura = matrix.meta || {};
  var payload = {
    ok: true,
    rows: rows,
    columns: columns,
    meta: {
      dataInicio: dataInicio,
      dataFim: dataFim,
      filtroServidor: temFiltroData,
      totalPlanilha: metaLeitura.totalPlanilha || (matrix.rows ? matrix.rows.length : 0),
      totalRetornado: rows.length,
      linhasCorrespondentes: metaLeitura.linhasCorrespondentes || rows.length,
      blocosLidos: metaLeitura.blocosLidos || 0,
      modoLeitura: metaLeitura.modoLeitura || (temFiltroData ? 'por_coluna_data_e_blocos' : 'matriz_completa'),
      cacheHit: false,
      tempoCacheMs: marks.tempoCacheMs,
      tempoAbrirPlanilhaMs: marks.tempoAbrirPlanilhaMs,
      tempoLerPlanilhaMs: marks.tempoLerPlanilhaMs,
      tempoLerDatasMs: metaLeitura.tempoLerDatasMs || 0,
      tempoFiltrarDatasMs: metaLeitura.tempoFiltrarDatasMs || 0,
      tempoLerBlocosMs: metaLeitura.tempoLerBlocosMs || 0,
      tempoFormatarLinhasMs: marks.tempoFormatarLinhasMs,
      tempoMontarColunasMs: marks.tempoMontarColunasMs,
      tempoMs: Date.now() - startMs
    }
  };

  salvarCacheSeguro_(cacheKey, payload, temFiltroData);
  return payload;
}

function readPostagensByDateRangeRapido_(sheet, inicioKey, fimKey) {
  var startMs = Date.now();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = lastCol
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(safe_)
    : [];

  var indexByHeader = {};
  headers.forEach(function(header, index) {
    indexByHeader[header] = index;
  });

  if (lastRow < 2 || !headers.length) {
    return {
      headers: headers,
      rows: [],
      indexByHeader: indexByHeader,
      meta: {
        totalPlanilha: 0,
        linhasCorrespondentes: 0,
        blocosLidos: 0,
        modoLeitura: 'planilha_vazia',
        tempoLerDatasMs: 0,
        tempoFiltrarDatasMs: 0,
        tempoLerBlocosMs: 0,
        tempoLeituraTotalMs: Date.now() - startMs
      }
    };
  }

  var dataIndex = indexByHeader['Data'];
  if (dataIndex == null) {
    var full = readSheetMatrix_(sheet);
    full.meta = {
      totalPlanilha: full.rows.length,
      linhasCorrespondentes: full.rows.length,
      blocosLidos: 1,
      modoLeitura: 'fallback_sem_coluna_data',
      tempoLeituraTotalMs: Date.now() - startMs
    };
    return full;
  }

  var totalRows = lastRow - 1;
  var tDates = Date.now();
  var dataValues = sheet.getRange(2, dataIndex + 1, totalRows, 1).getValues();
  var tempoLerDatasMs = Date.now() - tDates;

  var tFilter = Date.now();
  var matched = [];
  dataValues.forEach(function(row, index) {
    var rowKey = fastDateKeyAtende_(row[0]);
    if (!rowKey) return;
    if (inicioKey && rowKey < inicioKey) return;
    if (fimKey && rowKey > fimKey) return;
    matched.push(index);
  });
  var tempoFiltrarDatasMs = Date.now() - tFilter;

  if (!matched.length) {
    return {
      headers: headers,
      rows: [],
      indexByHeader: indexByHeader,
      meta: {
        totalPlanilha: totalRows,
        linhasCorrespondentes: 0,
        blocosLidos: 0,
        modoLeitura: 'por_coluna_data_sem_resultado',
        tempoLerDatasMs: tempoLerDatasMs,
        tempoFiltrarDatasMs: tempoFiltrarDatasMs,
        tempoLerBlocosMs: 0,
        tempoLeituraTotalMs: Date.now() - startMs
      }
    };
  }

  var blocks = [];
  var start = matched[0];
  var previous = matched[0];

  for (var i = 1; i < matched.length; i++) {
    var current = matched[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    blocks.push([start, previous]);
    start = current;
    previous = current;
  }
  blocks.push([start, previous]);

  if (blocks.length > 120) {
    var fullMatrix = readSheetMatrix_(sheet);
    var filteredRows = fullMatrix.rows.filter(function(row) {
      var rowKey = fastDateKeyAtende_(row[dataIndex]);
      if (!rowKey) return false;
      if (inicioKey && rowKey < inicioKey) return false;
      if (fimKey && rowKey > fimKey) return false;
      return true;
    });
    fullMatrix.rows = filteredRows;
    fullMatrix.meta = {
      totalPlanilha: totalRows,
      linhasCorrespondentes: filteredRows.length,
      blocosLidos: blocks.length,
      modoLeitura: 'fallback_muitos_blocos',
      tempoLerDatasMs: tempoLerDatasMs,
      tempoFiltrarDatasMs: tempoFiltrarDatasMs,
      tempoLerBlocosMs: Date.now() - startMs - tempoLerDatasMs - tempoFiltrarDatasMs,
      tempoLeituraTotalMs: Date.now() - startMs
    };
    return fullMatrix;
  }

  var tBlocks = Date.now();
  var rows = [];
  blocks.forEach(function(block) {
    var rowStart = block[0];
    var rowEnd = block[1];
    var numRows = rowEnd - rowStart + 1;
    rows = rows.concat(sheet.getRange(rowStart + 2, 1, numRows, headers.length).getValues());
  });
  var tempoLerBlocosMs = Date.now() - tBlocks;

  return {
    headers: headers,
    rows: rows,
    indexByHeader: indexByHeader,
    meta: {
      totalPlanilha: totalRows,
      linhasCorrespondentes: matched.length,
      blocosLidos: blocks.length,
      modoLeitura: 'por_coluna_data_e_blocos',
      tempoLerDatasMs: tempoLerDatasMs,
      tempoFiltrarDatasMs: tempoFiltrarDatasMs,
      tempoLerBlocosMs: tempoLerBlocosMs,
      tempoLeituraTotalMs: Date.now() - startMs
    }
  };
}

function fastDateKeyAtende_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return String(value.getFullYear()) + pad2Atende_(value.getMonth() + 1) + pad2Atende_(value.getDate());
  }

  var text = safe_(value).trim();
  if (!text) return '';

  var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + iso[2] + iso[3];

  var br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + br[2] + br[1];

  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return String(parsed.getFullYear()) + pad2Atende_(parsed.getMonth() + 1) + pad2Atende_(parsed.getDate());
  }

  return '';
}

function pad2Atende_(value) {
  return String(value).padStart(2, '0');
}

function diagnosticarPerformancePainelRapido(params) {
  var start = Date.now();
  var payload = buscarDados(params || {});
  return {
    ok: payload.ok,
    error: payload.error || '',
    rows: payload.rows ? payload.rows.length : 0,
    columns: payload.columns ? payload.columns.length : 0,
    meta: payload.meta || {},
    totalMs: Date.now() - start
  };
}
