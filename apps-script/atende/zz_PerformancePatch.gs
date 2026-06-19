// ============================================================
//  ATENDE - PATCH DE PERFORMANCE DO PAINEL MODULAR
//  Otimiza buscarDados/buscarDadosPorData_ usando indice auxiliar de datas.
// ============================================================

var ATENDE_INDEX_SHEET_NAME = 'IDX_POSTAGENS_DATAS';
var ATENDE_INDEX_HEADERS = [
  'DataKey',
  'Data',
  'PrimeiraLinha',
  'UltimaLinha',
  'Total',
  'TotalLinhasPostagens',
  'AtualizadoEm'
];

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
  var cacheKey = ['atende:postagens-fast-v3', version, inicioKey || 'ini', fimKey || 'fim'].join(':');

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
    ? readPostagensByDateRangeRapido_(spreadsheet, sheet, inicioKey, fimKey)
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
      indiceReconstruido: !!metaLeitura.indiceReconstruido,
      modoLeitura: metaLeitura.modoLeitura || (temFiltroData ? 'por_indice_datas' : 'matriz_completa'),
      cacheHit: false,
      tempoCacheMs: marks.tempoCacheMs,
      tempoAbrirPlanilhaMs: marks.tempoAbrirPlanilhaMs,
      tempoLerPlanilhaMs: marks.tempoLerPlanilhaMs,
      tempoLerIndiceMs: metaLeitura.tempoLerIndiceMs || 0,
      tempoReconstruirIndiceMs: metaLeitura.tempoReconstruirIndiceMs || 0,
      tempoLerDatasMs: metaLeitura.tempoLerDatasMs || 0,
      tempoFiltrarIndiceMs: metaLeitura.tempoFiltrarIndiceMs || 0,
      tempoLerBlocosMs: metaLeitura.tempoLerBlocosMs || 0,
      tempoFormatarLinhasMs: marks.tempoFormatarLinhasMs,
      tempoMontarColunasMs: marks.tempoMontarColunasMs,
      tempoMs: Date.now() - startMs
    }
  };

  salvarCacheSeguro_(cacheKey, payload, temFiltroData);
  return payload;
}

function readPostagensByDateRangeRapido_(spreadsheet, sheet, inicioKey, fimKey) {
  var startMs = Date.now();
  var headers = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(safe_)
    : [];

  if (sheet.getLastRow() < 2 || !headers.length) {
    return emptyPostagensMatrix_(headers, 'planilha_vazia', Date.now() - startMs);
  }

  try {
    return readPostagensByDateIndex_(spreadsheet, sheet, headers, inicioKey, fimKey, startMs);
  } catch (err) {
    return readPostagensByDateColumnFallback_(sheet, headers, inicioKey, fimKey, startMs, err);
  }
}

function readPostagensByDateIndex_(spreadsheet, sheet, headers, inicioKey, fimKey, startMs) {
  var totalRows = sheet.getLastRow() - 1;
  var tIndex = Date.now();
  var indexSheet = getOrCreatePostagensDateIndexSheet_(spreadsheet);
  var indexState = readPostagensDateIndexState_(indexSheet, totalRows);
  var tempoLerIndiceMs = Date.now() - tIndex;

  var indiceReconstruido = false;
  var tempoReconstruirIndiceMs = 0;

  if (!indexState.ok) {
    var tRebuild = Date.now();
    rebuildPostagensDateIndex_(spreadsheet, sheet);
    tempoReconstruirIndiceMs = Date.now() - tRebuild;
    indiceReconstruido = true;

    tIndex = Date.now();
    indexState = readPostagensDateIndexState_(indexSheet, totalRows);
    tempoLerIndiceMs += Date.now() - tIndex;
  }

  if (!indexState.ok) {
    throw new Error('Indice de datas indisponivel: ' + indexState.reason);
  }

  var tFilter = Date.now();
  var matchedBlocks = [];
  indexState.rows.forEach(function(item) {
    if (inicioKey && item.dataKey < inicioKey) return;
    if (fimKey && item.dataKey > fimKey) return;
    matchedBlocks.push([item.primeiraLinha, item.ultimaLinha, item.total]);
  });
  var tempoFiltrarIndiceMs = Date.now() - tFilter;

  if (!matchedBlocks.length) {
    return {
      headers: headers,
      rows: [],
      indexByHeader: buildIndexByHeaderAtende_(headers),
      meta: {
        totalPlanilha: totalRows,
        linhasCorrespondentes: 0,
        blocosLidos: 0,
        indiceReconstruido: indiceReconstruido,
        modoLeitura: 'por_indice_sem_resultado',
        tempoLerIndiceMs: tempoLerIndiceMs,
        tempoReconstruirIndiceMs: tempoReconstruirIndiceMs,
        tempoFiltrarIndiceMs: tempoFiltrarIndiceMs,
        tempoLerBlocosMs: 0,
        tempoLeituraTotalMs: Date.now() - startMs
      }
    };
  }

  var blocks = mergePostagensLineBlocks_(matchedBlocks);
  var tBlocks = Date.now();
  var rows = [];
  blocks.forEach(function(block) {
    var firstLine = block[0];
    var lastLine = block[1];
    var numRows = lastLine - firstLine + 1;
    rows = rows.concat(sheet.getRange(firstLine, 1, numRows, headers.length).getValues());
  });
  var tempoLerBlocosMs = Date.now() - tBlocks;

  return {
    headers: headers,
    rows: rows,
    indexByHeader: buildIndexByHeaderAtende_(headers),
    meta: {
      totalPlanilha: totalRows,
      linhasCorrespondentes: rows.length,
      blocosLidos: blocks.length,
      indiceReconstruido: indiceReconstruido,
      modoLeitura: 'por_indice_datas',
      tempoLerIndiceMs: tempoLerIndiceMs,
      tempoReconstruirIndiceMs: tempoReconstruirIndiceMs,
      tempoFiltrarIndiceMs: tempoFiltrarIndiceMs,
      tempoLerBlocosMs: tempoLerBlocosMs,
      tempoLeituraTotalMs: Date.now() - startMs
    }
  };
}

function getOrCreatePostagensDateIndexSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(ATENDE_INDEX_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ATENDE_INDEX_SHEET_NAME);
    sheet.getRange(1, 1, 1, ATENDE_INDEX_HEADERS.length).setValues([ATENDE_INDEX_HEADERS]);
    try { sheet.hideSheet(); } catch (_) {}
  }
  return sheet;
}

function readPostagensDateIndexState_(indexSheet, totalRows) {
  var lastRow = indexSheet.getLastRow();
  if (lastRow < 2) return { ok: false, reason: 'indice_vazio', rows: [] };

  var headers = indexSheet.getRange(1, 1, 1, Math.max(indexSheet.getLastColumn(), ATENDE_INDEX_HEADERS.length)).getValues()[0].map(safe_);
  if (headers.slice(0, ATENDE_INDEX_HEADERS.length).join('|') !== ATENDE_INDEX_HEADERS.join('|')) {
    return { ok: false, reason: 'cabecalho_invalido', rows: [] };
  }

  var values = indexSheet.getRange(2, 1, lastRow - 1, ATENDE_INDEX_HEADERS.length).getValues();
  var rows = [];
  var indexedTotalRows = null;

  values.forEach(function(row) {
    var dataKey = safe_(row[0]).trim();
    var primeiraLinha = Number(row[2]);
    var ultimaLinha = Number(row[3]);
    var total = Number(row[4]);
    var totalLinhasPostagens = Number(row[5]);

    if (!dataKey || !primeiraLinha || !ultimaLinha || !total) return;
    if (indexedTotalRows === null) indexedTotalRows = totalLinhasPostagens;

    rows.push({
      dataKey: dataKey,
      primeiraLinha: primeiraLinha,
      ultimaLinha: ultimaLinha,
      total: total
    });
  });

  if (!rows.length) return { ok: false, reason: 'indice_sem_linhas_validas', rows: [] };
  if (indexedTotalRows !== totalRows) return { ok: false, reason: 'indice_desatualizado', rows: [] };

  return { ok: true, reason: '', rows: rows };
}

function rebuildPostagensDateIndex_(spreadsheet, postagensSheet) {
  var indexSheet = getOrCreatePostagensDateIndexSheet_(spreadsheet);
  var totalRows = Math.max(postagensSheet.getLastRow() - 1, 0);
  var lastCol = Math.max(indexSheet.getLastColumn(), ATENDE_INDEX_HEADERS.length);
  indexSheet.clearContents();
  indexSheet.getRange(1, 1, 1, ATENDE_INDEX_HEADERS.length).setValues([ATENDE_INDEX_HEADERS]);

  if (!totalRows) return { ok: true, totalBlocos: 0, totalLinhasPostagens: 0 };

  var headers = postagensSheet.getRange(1, 1, 1, postagensSheet.getLastColumn()).getValues()[0].map(safe_);
  var dataIndex = headers.indexOf('Data');
  if (dataIndex < 0) throw new Error('Coluna Data nao encontrada para criar indice.');

  var dataValues = postagensSheet.getRange(2, dataIndex + 1, totalRows, 1).getValues();
  var blocks = [];
  var current = null;

  dataValues.forEach(function(row, index) {
    var dataKey = fastDateKeyAtende_(row[0]);
    if (!dataKey) return;

    var sheetLine = index + 2;
    if (current && current.dataKey === dataKey && sheetLine === current.ultimaLinha + 1) {
      current.ultimaLinha = sheetLine;
      current.total++;
      return;
    }

    current = {
      dataKey: dataKey,
      data: isoFromDateKeyAtende_(dataKey),
      primeiraLinha: sheetLine,
      ultimaLinha: sheetLine,
      total: 1
    };
    blocks.push(current);
  });

  if (blocks.length) {
    var now = new Date();
    var rows = blocks.map(function(block) {
      return [
        block.dataKey,
        block.data,
        block.primeiraLinha,
        block.ultimaLinha,
        block.total,
        totalRows,
        now
      ];
    });
    indexSheet.getRange(2, 1, rows.length, ATENDE_INDEX_HEADERS.length).setValues(rows);
  }

  try { indexSheet.hideSheet(); } catch (_) {}
  SpreadsheetApp.flush();
  return { ok: true, totalBlocos: blocks.length, totalLinhasPostagens: totalRows };
}

function ADMIN_reconstruirIndicePostagensAtende() {
  var start = Date.now();
  var spreadsheet = getAtendeSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(ATENDE_CONFIG.SHEETS.POSTAGENS);
  if (!sheet) throw new Error('Aba Postagens nao encontrada.');
  var result = rebuildPostagensDateIndex_(spreadsheet, sheet);
  result.tempoMs = Date.now() - start;
  return result;
}

function readPostagensByDateColumnFallback_(sheet, headers, inicioKey, fimKey, startMs, originalErr) {
  var totalRows = sheet.getLastRow() - 1;
  var dataIndex = headers.indexOf('Data');
  if (dataIndex < 0) {
    var full = readSheetMatrix_(sheet);
    full.meta = {
      totalPlanilha: full.rows.length,
      linhasCorrespondentes: full.rows.length,
      blocosLidos: 1,
      modoLeitura: 'fallback_sem_coluna_data',
      erroIndice: originalErr ? String(originalErr.message || originalErr) : '',
      tempoLeituraTotalMs: Date.now() - startMs
    };
    return full;
  }

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
      indexByHeader: buildIndexByHeaderAtende_(headers),
      meta: {
        totalPlanilha: totalRows,
        linhasCorrespondentes: 0,
        blocosLidos: 0,
        modoLeitura: 'fallback_coluna_data_sem_resultado',
        erroIndice: originalErr ? String(originalErr.message || originalErr) : '',
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
    blocks.push([start + 2, previous + 2]);
    start = current;
    previous = current;
  }
  blocks.push([start + 2, previous + 2]);

  var tBlocks = Date.now();
  var rows = [];
  blocks.forEach(function(block) {
    var firstLine = block[0];
    var lastLine = block[1];
    var numRows = lastLine - firstLine + 1;
    rows = rows.concat(sheet.getRange(firstLine, 1, numRows, headers.length).getValues());
  });

  return {
    headers: headers,
    rows: rows,
    indexByHeader: buildIndexByHeaderAtende_(headers),
    meta: {
      totalPlanilha: totalRows,
      linhasCorrespondentes: rows.length,
      blocosLidos: blocks.length,
      modoLeitura: 'fallback_coluna_data',
      erroIndice: originalErr ? String(originalErr.message || originalErr) : '',
      tempoLerDatasMs: tempoLerDatasMs,
      tempoFiltrarDatasMs: tempoFiltrarDatasMs,
      tempoLerBlocosMs: Date.now() - tBlocks,
      tempoLeituraTotalMs: Date.now() - startMs
    }
  };
}

function mergePostagensLineBlocks_(blocks) {
  var sorted = blocks.slice().sort(function(a, b) { return a[0] - b[0]; });
  var merged = [];

  sorted.forEach(function(block) {
    if (!merged.length) {
      merged.push([block[0], block[1]]);
      return;
    }
    var last = merged[merged.length - 1];
    if (block[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], block[1]);
      return;
    }
    merged.push([block[0], block[1]]);
  });

  return merged;
}

function emptyPostagensMatrix_(headers, mode, timeMs) {
  return {
    headers: headers,
    rows: [],
    indexByHeader: buildIndexByHeaderAtende_(headers),
    meta: {
      totalPlanilha: 0,
      linhasCorrespondentes: 0,
      blocosLidos: 0,
      modoLeitura: mode,
      tempoLeituraTotalMs: timeMs
    }
  };
}

function buildIndexByHeaderAtende_(headers) {
  var index = {};
  headers.forEach(function(header, position) {
    index[header] = position;
  });
  return index;
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

function isoFromDateKeyAtende_(dateKey) {
  var text = safe_(dateKey).trim();
  if (!text || text.length !== 8) return '';
  return text.substring(0, 4) + '-' + text.substring(4, 6) + '-' + text.substring(6, 8);
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
