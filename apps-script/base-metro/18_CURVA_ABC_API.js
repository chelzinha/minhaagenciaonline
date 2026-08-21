/**
 * 18_CURVA_ABC_API.gs
 * ------------------------------------------------------------
 * Fonte de dados da aba Curva ABC do CRM.
 *
 * Modo inicial (SNAPSHOT): lê a planilha gerencial já consolidada.
 * Modo futuro (RAW): agrega a base operacional por cliente e mês.
 *
 * Configuração via Script Properties, sem IDs de planilhas no código:
 *   ABC_SOURCE_MODE=SNAPSHOT
 *   ABC_SNAPSHOT_SPREADSHEET_ID=<id da Analise Curva AGF>
 *   ABC_SNAPSHOT_SHEET=BASE                       (opcional)
 *
 * Para a fonte operacional futura:
 *   ABC_SOURCE_MODE=RAW
 *   ABC_RAW_SPREADSHEET_ID=<id da planilha fonte> (opcional; usa AGF_SPREADSHEET_ID)
 *   ABC_RAW_SHEET=BASE_TOTAL                      (opcional)
 */

var ABC_CFG = {
  VERSION: 'abc-v1-20260821',
  MONTHS: 12,
  NEW_FROM: '2026-03',
  CURVE_A_UNTIL: 0.80,
  CURVE_B_UNTIL: 0.95,
  CURVE_B_REVENUE_FLOOR: 5000,
  CACHE_SECONDS: 900,
  CACHE_CHUNK_SIZE: 70000
};

function abc_apiGetCurva_(params) {
  params = params || {};
  var props = PropertiesService.getScriptProperties();
  var mode = abc_upper_(props.getProperty('ABC_SOURCE_MODE') || 'SNAPSHOT');
  if (mode !== 'SNAPSHOT' && mode !== 'RAW') mode = 'SNAPSHOT';

  var source = abc_sourceConfig_(mode, props);
  if (!source.spreadsheetId) {
    throw new Error(mode === 'SNAPSHOT'
      ? 'Configure ABC_SNAPSHOT_SPREADSHEET_ID nas propriedades do Apps Script.'
      : 'Configure ABC_RAW_SPREADSHEET_ID ou AGF_SPREADSHEET_ID nas propriedades do Apps Script.');
  }

  var revision = abc_sourceRevision_(source.spreadsheetId);
  var signature = abc_hash_([ABC_CFG.VERSION, mode, source.spreadsheetId, source.sheetName, revision].join('|'));
  var cacheKey = 'abc_payload_' + signature;
  var cached = abc_cacheGetChunks_(cacheKey);
  if (cached) return cached;

  var payload = mode === 'RAW'
    ? abc_buildFromRaw_(source)
    : abc_buildFromSnapshot_(source);
  payload.ok = true;
  payload.generatedAt = abc_nowIso_();
  payload.sourceMode = mode;
  payload.sourceRevision = revision;
  payload.rules = abc_rulesPayload_();
  abc_cachePutChunks_(cacheKey, payload, ABC_CFG.CACHE_SECONDS);
  return payload;
}

function abc_configurarFonteSnapshot(spreadsheetId, sheetName) {
  var id = String(spreadsheetId || '').trim();
  if (!id) throw new Error('Informe o ID da planilha gerencial.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ABC_SOURCE_MODE', 'SNAPSHOT');
  props.setProperty('ABC_SNAPSHOT_SPREADSHEET_ID', id);
  props.setProperty('ABC_SNAPSHOT_SHEET', String(sheetName || 'BASE').trim());
  return { ok:true, mode:'SNAPSHOT', sheetName:String(sheetName || 'BASE').trim() };
}

function abc_configurarFonteRaw(spreadsheetId, sheetName) {
  var props = PropertiesService.getScriptProperties();
  var id = String(spreadsheetId || '').trim();
  if (id) props.setProperty('ABC_RAW_SPREADSHEET_ID', id);
  props.setProperty('ABC_SOURCE_MODE', 'RAW');
  props.setProperty('ABC_RAW_SHEET', String(sheetName || 'BASE_TOTAL').trim());
  return { ok:true, mode:'RAW', sheetName:String(sheetName || 'BASE_TOTAL').trim() };
}

function abc_sourceConfig_(mode, props) {
  if (mode === 'RAW') {
    return {
      spreadsheetId: String(props.getProperty('ABC_RAW_SPREADSHEET_ID') || props.getProperty('AGF_SPREADSHEET_ID') || (typeof OP_CFG !== 'undefined' && OP_CFG.SPREADSHEET_ID) || '').trim(),
      sheetName: String(props.getProperty('ABC_RAW_SHEET') || 'BASE_TOTAL').trim()
    };
  }
  return {
    spreadsheetId: String(props.getProperty('ABC_SNAPSHOT_SPREADSHEET_ID') || '').trim(),
    sheetName: String(props.getProperty('ABC_SNAPSHOT_SHEET') || 'BASE').trim()
  };
}

function abc_buildFromSnapshot_(source) {
  var sh = abc_openSheet_(source);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 4 || lastCol < 4) throw new Error('A aba snapshot não possui a estrutura esperada.');
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var groupHeaders = values[0] || [];
  var monthHeaders = values[1] || [];
  var headers = values[2] || [];
  var monthDefs = abc_snapshotMonthDefs_(monthHeaders, headers);
  if (!monthDefs.length) throw new Error('Não foi possível identificar as colunas mensais QTD/VALOR na aba snapshot.');
  var displayMonths = monthDefs.slice(-ABC_CFG.MONTHS);
  var clientCol = abc_findHeader_(headers, ['CLIENTE']);
  if (clientCol < 0) throw new Error('A coluna CLIENTE não foi encontrada na aba snapshot.');

  var col = {
    fantasy: abc_findHeader_(headers, ['FANTASIA', 'NOME FANTASIA']),
    stage: abc_findHeader_(headers, ['ETAPA']),
    cadastroStatus: abc_findHeaderAfter_(headers, ['STATUS'], displayMonths[displayMonths.length - 1].valueCol + 1, 2),
    loginPpn: abc_findHeader_(headers, ['LOGIN PPN']),
    cwsMessage: abc_findHeader_(headers, ['MSG. ERRO', 'MSG ERRO']),
    contract: abc_findHeader_(headers, ['CONTRATO', 'NUMERO CONTRATO']),
    intermediary: abc_findHeader_(headers, ['INTERMEDIADOR']),
    local: abc_findHeader_(headers, ['LOCAL']),
    segment: abc_findHeader_(headers, ['SEGMENTO'])
  };

  var clients = [];
  for (var r = 3; r < values.length; r++) {
    var row = values[r];
    var name = abc_text_(row[clientCol]);
    if (!name) continue;
    var months = {};
    displayMonths.forEach(function(m) {
      months[m.key] = { qtd:abc_number_(row[m.qtdCol]), value:abc_number_(row[m.valueCol]) };
    });
    clients.push(abc_finalizeClient_({
      clientId: 'ABC_' + abc_hash_(abc_normalize_(name)).slice(0, 12),
      client: name,
      fantasy: abc_cell_(row, col.fantasy),
      stage: abc_cell_(row, col.stage),
      cadastroStatus: abc_cell_(row, col.cadastroStatus),
      loginPpn: abc_cell_(row, col.loginPpn),
      cwsMessage: abc_cell_(row, col.cwsMessage),
      contract: abc_cell_(row, col.contract),
      intermediary: abc_cell_(row, col.intermediary),
      local: abc_cell_(row, col.local),
      segment: abc_cell_(row, col.segment),
      months: months,
      firstPost: abc_firstActiveMonth_(monthDefs, row)
    }, displayMonths));
  }
  return abc_finishPayload_(clients, displayMonths, {
    sheetName: sh.getName(),
    rowsRead: Math.max(0, values.length - 3),
    sourceColumns: groupHeaders.length
  });
}

function abc_buildFromRaw_(source) {
  var sh = abc_openSheet_(source);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 2) throw new Error('A aba RAW não possui registros para consolidar.');
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0] || [];
  var hm = abc_headerMap_(headers);
  abc_requireRawHeaders_(hm);
  var displayMonths = abc_lastMonths_(ABC_CFG.MONTHS, new Date());
  var displaySet = {};
  displayMonths.forEach(function(m) { displaySet[m.key] = true; });
  var identity = abc_identityMaps_();
  var groups = {};

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var rawName = abc_text_(abc_get_(row, hm, ['NOME_REMETENTE', 'REMETENTE']));
    var ymd = abc_toYmd_(abc_get_(row, hm, ['DATA FORMAT', 'DATA']));
    if (!rawName || !ymd) continue;
    var monthKey = ymd.slice(0, 7);
    var alias = identity.alias[abc_normalize_(rawName)] || null;
    var clientId = alias && alias.clientId ? alias.clientId : 'ABC_' + abc_hash_(abc_normalize_(rawName)).slice(0, 12);
    var displayName = (alias && alias.client) || identity.master[clientId] || rawName;
    if (!groups[clientId]) groups[clientId] = {
      clientId: clientId, client: displayName, fantasy:'', stage:'', cadastroStatus:'', loginPpn:'', cwsMessage:'',
      contract:'', intermediary:'', local:'', segment:'', months:{}, firstPost:ymd, metaCounts:{}
    };
    var g = groups[clientId];
    if (!g.firstPost || ymd < g.firstPost) g.firstPost = ymd;
    if (displaySet[monthKey]) {
      if (!g.months[monthKey]) g.months[monthKey] = { qtd:0, value:0 };
      g.months[monthKey].qtd += Math.max(0, abc_number_(abc_get_(row, hm, ['QTD', 'QUANTIDADE'])));
      g.months[monthKey].value += abc_number_(abc_get_(row, hm, ['VALOR', 'FATURAMENTO']));
    }
    abc_countMeta_(g, 'intermediary', abc_get_(row, hm, ['INTERMEDIADOR']));
    abc_countMeta_(g, 'contract', abc_get_(row, hm, ['NUMERO_CONTRATO']));
    abc_countMeta_(g, 'card', abc_get_(row, hm, ['CARTAO_POSTAGEM']));
    abc_countMeta_(g, 'local', abc_get_(row, hm, ['LOCAL']));
    abc_countMeta_(g, 'segment', abc_get_(row, hm, ['SEGMENTO']));
    abc_countMeta_(g, 'fantasy', abc_get_(row, hm, ['RAZAO_SOCIAL']));
  }

  var clients = Object.keys(groups).map(function(id) {
    var g = groups[id];
    displayMonths.forEach(function(m) { if (!g.months[m.key]) g.months[m.key] = { qtd:0, value:0 }; });
    g.intermediary = abc_topMeta_(g, 'intermediary');
    g.contract = abc_topMeta_(g, 'contract');
    g.card = abc_topMeta_(g, 'card');
    g.local = abc_topMeta_(g, 'local');
    g.segment = abc_topMeta_(g, 'segment');
    g.fantasy = abc_topMeta_(g, 'fantasy');
    delete g.metaCounts;
    return abc_finalizeClient_(g, displayMonths);
  });
  return abc_finishPayload_(clients, displayMonths, {
    sheetName: sh.getName(),
    rowsRead: Math.max(0, values.length - 1),
    sourceColumns: headers.length
  });
}

function abc_finishPayload_(clients, monthDefs, meta) {
  abc_assignCurves_(clients);
  clients.sort(function(a, b) {
    return abc_priorityRank_(b.priority) - abc_priorityRank_(a.priority)
      || b.totals.value - a.totals.value
      || a.client.localeCompare(b.client);
  });
  var evolution = abc_buildEvolution_(clients, monthDefs);
  var curves = { A:0, B:0, C:0 };
  var priorities = {};
  clients.forEach(function(c) {
    curves[c.curve] = (curves[c.curve] || 0) + 1;
    priorities[c.priority] = (priorities[c.priority] || 0) + 1;
  });
  var last = monthDefs[monthDefs.length - 1] || {};
  var previous = monthDefs[monthDefs.length - 2] || {};
  var lastEvolution = evolution[evolution.length - 1] || {};
  return {
    period: {
      months: monthDefs.map(function(m, i) { return { key:m.key, label:m.label, partial:i === monthDefs.length - 1 && abc_isCurrentMonth_(m.key) }; }),
      referenceMonth: last.key || '',
      previousMonth: previous.key || '',
      partial: !!(last.key && abc_isCurrentMonth_(last.key))
    },
    summary: {
      clients: clients.length,
      totalQtd: lastEvolution.qtd || 0,
      totalValue: lastEvolution.value || 0,
      newClients: lastEvolution.newClients || 0,
      reactivatedClients: lastEvolution.reactivatedClients || 0,
      curves: curves,
      priorities: priorities
    },
    evolution: evolution,
    filters: abc_filters_(clients),
    clients: clients,
    meta: meta || {}
  };
}

function abc_finalizeClient_(client, monthDefs) {
  var qtd = 0, value = 0, activeMonths = 0, lastPost = '';
  monthDefs.forEach(function(m) {
    var v = client.months[m.key] || { qtd:0, value:0 };
    v.qtd = abc_number_(v.qtd);
    v.value = abc_number_(v.value);
    client.months[m.key] = v;
    qtd += v.qtd;
    value += v.value;
    if (v.qtd > 0 || v.value > 0) { activeMonths++; lastPost = m.key; }
  });
  client.firstPost = abc_text_(client.firstPost).slice(0, 7);
  client.lastPost = lastPost;
  client.totals = {
    qtd: qtd,
    value: value,
    ticket: qtd > 0 ? value / qtd : 0,
    activeMonths: activeMonths,
    averageActiveMonth: activeMonths > 0 ? value / activeMonths : 0
  };
  client.status = client.firstPost && client.firstPost >= ABC_CFG.NEW_FROM ? 'NOVO' : 'CARTEIRA';
  var commercial = abc_commercialSignal_(client, monthDefs);
  client.signal = commercial.signal;
  client.priority = commercial.priority;
  client.score = commercial.score;
  client.recommendedAction = commercial.action;
  client.curve = 'C';
  client.participation = 0;
  client.cumulativeParticipation = 0;
  return client;
}

function abc_assignCurves_(clients) {
  var ranked = clients.slice().sort(function(a, b) { return b.totals.value - a.totals.value; });
  var grand = ranked.reduce(function(sum, c) { return sum + c.totals.value; }, 0);
  var cumulative = 0;
  ranked.forEach(function(c) {
    var share = grand > 0 ? c.totals.value / grand : 0;
    cumulative += share;
    c.participation = share;
    c.cumulativeParticipation = cumulative;
    if (cumulative <= ABC_CFG.CURVE_A_UNTIL) c.curve = 'A';
    else if (cumulative <= ABC_CFG.CURVE_B_UNTIL || c.totals.value >= ABC_CFG.CURVE_B_REVENUE_FLOOR) c.curve = 'B';
    else c.curve = 'C';
    abc_adjustPriorityForCurve_(c);
  });
}

function abc_adjustPriorityForCurve_(client) {
  var severe = ['INATIVO 60+ DIAS', 'PAROU DE POSTAR', 'QUEDA CRÍTICA'].indexOf(client.signal) >= 0;
  if (severe && client.curve === 'A') {
    client.priority = 'CRÍTICA';
    client.score = Math.max(client.score, 95);
  } else if ((severe && client.curve === 'B') || (client.signal === 'QUEDA RELEVANTE' && (client.curve === 'A' || client.curve === 'B'))) {
    client.priority = 'ALTA';
    client.score = Math.max(client.score, 78);
  } else if (severe && client.priority === 'BAIXA') {
    client.priority = 'MÉDIA';
    client.score = Math.max(client.score, 60);
  }
}

function abc_commercialSignal_(client, months) {
  var n = months.length;
  var current = n ? client.months[months[n - 1].key] : { value:0 };
  var closedIndex = n - 1;
  if (n && abc_isCurrentMonth_(months[n - 1].key)) closedIndex = n - 2;
  var closed = closedIndex >= 0 ? client.months[months[closedIndex].key] : { value:0 };
  var baselineValues = [];
  for (var i = Math.max(0, closedIndex - 3); i < closedIndex; i++) baselineValues.push((client.months[months[i].key] || {}).value || 0);
  var baseline = baselineValues.length ? baselineValues.reduce(function(s, v) { return s + v; }, 0) / baselineValues.length : 0;
  var variation = baseline > 0 ? (closed.value - baseline) / baseline : 0;
  var priorZero = closedIndex > 0 && ((client.months[months[closedIndex - 1].key] || {}).value || 0) === 0;
  var signal = 'ESTÁVEL', priority = 'BAIXA', score = 10, action = 'Monitorar evolução mensal';

  if (client.status === 'NOVO') {
    signal = 'NOVO'; priority = 'OPORTUNIDADE'; score = 55; action = 'Fazer onboarding e acompanhar 30 dias';
  } else if (current.value > 0 && closed.value === 0) {
    signal = 'REATIVADO'; priority = 'OPORTUNIDADE'; score = 58; action = 'Confirmar retorno e incentivar recorrência';
  } else if (client.firstPost && !client.lastPost) {
    signal = 'INATIVO 60+ DIAS'; priority = 'MÉDIA'; score = 72; action = 'Ligar e identificar motivo da perda';
  } else if (closed.value === 0 && baseline > 0) {
    signal = 'PAROU DE POSTAR'; priority = 'MÉDIA'; score = 86; action = 'Contato imediato para recuperação';
  } else if (!client.lastPost && client.totals.value <= 0) {
    signal = 'SEM MOVIMENTO'; priority = 'BAIXA'; score = 5; action = 'Validar cadastro e origem dos dados';
  } else if (variation <= -0.60 && baseline >= 500) {
    signal = 'QUEDA CRÍTICA'; priority = 'MÉDIA'; score = 82; action = 'Revisar operação, concorrência e frequência';
  } else if (variation <= -0.30 && baseline > 0) {
    signal = 'QUEDA RELEVANTE'; priority = 'MÉDIA'; score = 66; action = 'Contato preventivo e oferta de apoio';
  } else if (variation >= 0.30 && closed.value - baseline >= 500) {
    signal = 'CRESCIMENTO'; priority = 'OPORTUNIDADE'; score = 52; action = 'Fidelizar e ampliar relacionamento';
  } else if (priorZero && closed.value > 0) {
    signal = 'REATIVADO'; priority = 'OPORTUNIDADE'; score = 56; action = 'Confirmar retorno e incentivar recorrência';
  }
  return { signal:signal, priority:priority, score:score, action:action, baseline:baseline, variation:variation };
}

function abc_buildEvolution_(clients, months) {
  return months.map(function(m, index) {
    var qtd = 0, value = 0, active = 0, newClients = 0, reactivated = 0;
    clients.forEach(function(c) {
      var v = c.months[m.key] || { qtd:0, value:0 };
      qtd += v.qtd; value += v.value;
      if (v.qtd > 0 || v.value > 0) active++;
      if (c.firstPost === m.key && m.key >= ABC_CFG.NEW_FROM) newClients++;
      if (index >= 2 && v.value > 0) {
        var p1 = (c.months[months[index - 1].key] || {}).value || 0;
        var p2 = (c.months[months[index - 2].key] || {}).value || 0;
        var hadBefore = months.slice(0, index - 1).some(function(pm) { return ((c.months[pm.key] || {}).value || 0) > 0; });
        if (p1 === 0 && p2 === 0 && hadBefore) reactivated++;
      }
    });
    var previousValue = index ? clients.reduce(function(sum, c) { return sum + ((c.months[months[index - 1].key] || {}).value || 0); }, 0) : 0;
    return {
      key:m.key, label:m.label, partial:index === months.length - 1 && abc_isCurrentMonth_(m.key),
      qtd:qtd, value:value, activeClients:active, newClients:newClients, reactivatedClients:reactivated,
      valueChangePct:index && previousValue > 0 ? (value - previousValue) / previousValue : null
    };
  });
}

function abc_snapshotMonthDefs_(monthHeaders, headers) {
  var out = [];
  for (var c = 0; c < headers.length - 1; c++) {
    if (abc_headerKey_(headers[c]) !== 'QTD' || abc_headerKey_(headers[c + 1]) !== 'VALOR') continue;
    var key = abc_monthKey_(monthHeaders[c] || monthHeaders[c + 1]);
    if (!key) continue;
    out.push({ key:key, label:abc_monthLabel_(key), qtdCol:c, valueCol:c + 1 });
  }
  return out.sort(function(a, b) { return a.key.localeCompare(b.key); });
}

function abc_firstActiveMonth_(monthDefs, row) {
  for (var i = 0; i < monthDefs.length; i++) {
    var m = monthDefs[i];
    if (abc_number_(row[m.qtdCol]) > 0 || abc_number_(row[m.valueCol]) > 0) return m.key;
  }
  return '';
}

function abc_identityMaps_() {
  var out = { alias:{}, master:{} };
  try {
    var masterRows = typeof op_readClientsMaster_ === 'function' ? op_readClientsMaster_({ projection:'full' }) : [];
    (masterRows || []).forEach(function(r) {
      var id = abc_text_(r.CLIENTE_ID || r.clienteId);
      var name = abc_text_(r.CLIENTE || r.cliente);
      if (id && name) out.master[id] = name;
    });
  } catch (e) {}
  try {
    var aliasRows = typeof op_readAliasMap_ === 'function' ? op_readAliasMap_() : {};
    Object.keys(aliasRows || {}).forEach(function(rawName) {
      var id = abc_text_(aliasRows[rawName] && aliasRows[rawName].CLIENTE_ID);
      out.alias[abc_normalize_(rawName)] = { clientId:id, client:out.master[id] || rawName };
    });
  } catch (e2) {}
  return out;
}

function abc_filters_(clients) {
  function unique(field) {
    var seen = {};
    clients.forEach(function(c) { var v = abc_text_(c[field]); if (v) seen[v] = true; });
    return Object.keys(seen).sort(function(a, b) { return a.localeCompare(b); });
  }
  return {
    curves:['A','B','C'],
    statuses:unique('status'),
    signals:unique('signal'),
    priorities:unique('priority'),
    intermediaries:unique('intermediary'),
    cadastroStatuses:unique('cadastroStatus'),
    locals:unique('local'),
    segments:unique('segment')
  };
}

function abc_rulesPayload_() {
  return {
    curveAUntil:ABC_CFG.CURVE_A_UNTIL,
    curveBUntil:ABC_CFG.CURVE_B_UNTIL,
    curveBRevenueFloor:ABC_CFG.CURVE_B_REVENUE_FLOOR,
    newFrom:ABC_CFG.NEW_FROM,
    months:ABC_CFG.MONTHS
  };
}

function abc_requireRawHeaders_(hm) {
  [['DATA FORMAT','DATA'], ['NOME_REMETENTE','REMETENTE'], ['QTD','QUANTIDADE'], ['VALOR','FATURAMENTO']].forEach(function(group) {
    var found = group.some(function(h) { return hm[abc_headerKey_(h)] !== undefined; });
    if (!found) throw new Error('Cabeçalho obrigatório ausente na fonte RAW: ' + group.join(' ou '));
  });
}

function abc_openSheet_(source) {
  var ss = SpreadsheetApp.openById(source.spreadsheetId);
  var sh = ss.getSheetByName(source.sheetName);
  if (!sh) throw new Error('A aba ' + source.sheetName + ' não foi encontrada na planilha configurada.');
  return sh;
}

function abc_sourceRevision_(spreadsheetId) {
  try {
    if (typeof Drive !== 'undefined' && Drive.Files) {
      var file = Drive.Files.get(spreadsheetId, { fields:'modifiedTime' });
      if (file && file.modifiedTime) return String(file.modifiedTime);
    }
  } catch (e) {}
  try { return String(DriveApp.getFileById(spreadsheetId).getLastUpdated().getTime()); } catch (e2) {}
  return 'unknown';
}

function abc_cacheGetChunks_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var manifest = cache.get(key + ':manifest');
    if (!manifest) return null;
    var count = Number(manifest) || 0;
    if (!count) return null;
    var keys = [];
    for (var i = 0; i < count; i++) keys.push(key + ':' + i);
    var parts = cache.getAll(keys);
    var json = '';
    for (var p = 0; p < keys.length; p++) {
      if (!parts[keys[p]]) return null;
      json += parts[keys[p]];
    }
    return JSON.parse(json);
  } catch (e) { return null; }
}

function abc_cachePutChunks_(key, value, ttl) {
  try {
    var cache = CacheService.getScriptCache();
    var json = JSON.stringify(value);
    var chunks = [];
    for (var i = 0; i < json.length; i += ABC_CFG.CACHE_CHUNK_SIZE) chunks.push(json.slice(i, i + ABC_CFG.CACHE_CHUNK_SIZE));
    var batch = {};
    chunks.forEach(function(part, index) { batch[key + ':' + index] = part; });
    cache.putAll(batch, ttl || ABC_CFG.CACHE_SECONDS);
    cache.put(key + ':manifest', String(chunks.length), ttl || ABC_CFG.CACHE_SECONDS);
  } catch (e) {}
}

function abc_lastMonths_(count, date) {
  var out = [];
  var base = new Date(date.getFullYear(), date.getMonth(), 1);
  for (var i = count - 1; i >= 0; i--) {
    var d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    out.push({ key:key, label:abc_monthLabel_(key) });
  }
  return out;
}

function abc_monthKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0');
  }
  var s = abc_text_(value);
  var br = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (br) return br[2] + '-' + String(br[1]).padStart(2, '0');
  var iso = s.match(/^(\d{4})-(\d{1,2})/);
  return iso ? iso[1] + '-' + String(iso[2]).padStart(2, '0') : '';
}

function abc_monthLabel_(key) {
  var m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  return m ? m[2] + '/' + m[1] : key;
}

function abc_isCurrentMonth_(key) {
  var now = new Date();
  var current = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  return key === current;
}

function abc_toYmd_(value) {
  if (typeof op_toYmd_ === 'function') return op_toYmd_(value);
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = abc_text_(value);
  var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return br[3] + '-' + String(br[2]).padStart(2, '0') + '-' + String(br[1]).padStart(2, '0');
  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return iso ? iso[1] + '-' + String(iso[2]).padStart(2, '0') + '-' + String(iso[3]).padStart(2, '0') : '';
}

function abc_findHeader_(headers, names) { return abc_findHeaderAfter_(headers, names, 0, 1); }
function abc_findHeaderAfter_(headers, names, start, occurrence) {
  var wanted = names.map(abc_headerKey_);
  var seen = 0;
  for (var i = Math.max(0, start || 0); i < headers.length; i++) {
    if (wanted.indexOf(abc_headerKey_(headers[i])) >= 0) {
      seen++;
      if (seen >= (occurrence || 1)) return i;
    }
  }
  return -1;
}
function abc_cell_(row, index) { return index >= 0 ? abc_text_(row[index]) : ''; }
function abc_headerMap_(headers) { var out = {}; headers.forEach(function(h, i) { var k = abc_headerKey_(h); if (k && out[k] === undefined) out[k] = i; }); return out; }
function abc_get_(row, hm, names) { for (var i = 0; i < names.length; i++) { var idx = hm[abc_headerKey_(names[i])]; if (idx !== undefined) return row[idx]; } return ''; }
function abc_headerKey_(value) { return abc_upper_(value).replace(/[%]/g, ' PERCENT ').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function abc_upper_(value) { return abc_normalize_(value).toUpperCase(); }
function abc_normalize_(value) { var s = abc_text_(value); try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {} return s.toLowerCase(); }
function abc_text_(value) { return value == null ? '' : String(value).trim(); }
function abc_number_(value) {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  var s = abc_text_(value);
  if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  var n = Number(s);
  return isNaN(n) ? 0 : n;
}
function abc_countMeta_(group, field, value) { var v = abc_text_(value); if (!v) return; var k = field + '::' + v; group.metaCounts[k] = (group.metaCounts[k] || 0) + 1; }
function abc_topMeta_(group, field) { var prefix = field + '::', best = '', count = -1; Object.keys(group.metaCounts || {}).forEach(function(k) { if (k.indexOf(prefix) !== 0) return; var n = group.metaCounts[k]; if (n > count) { count = n; best = k.slice(prefix.length); } }); return best; }
function abc_priorityRank_(value) { return ({ 'CRÍTICA':5, 'CRITICA':5, 'ALTA':4, 'MÉDIA':3, 'MEDIA':3, 'OPORTUNIDADE':2, 'BAIXA':1 })[abc_upper_(value)] || 0; }
function abc_nowIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"); }
function abc_hash_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { var v = (b + 256) % 256; return ('0' + v.toString(16)).slice(-2); }).join('');
}
