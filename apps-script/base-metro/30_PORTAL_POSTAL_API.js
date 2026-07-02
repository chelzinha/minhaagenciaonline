/**
 * 30_PORTAL_POSTAL_API.gs
 * ------------------------------------------------------------
 * Backend isolado do modulo /portal - Portal Postal.
 *
 * V1:
 * - Le cadastro de clientes do Portal Postal.
 * - Le postagens dos ultimos meses.
 * - Cruza POSTAGENS.CLIENTE com CLIENTES_PORTAL.NOME.
 * - Calcula Curva TOP, A, B e C.
 * - Devolve payload para frontend/portal/index.html.
 *
 * Nao altera CRM Clientes, Prospects, Funil atual ou Agenda atual.
 */

var PORTAL_CFG = {
  TZ: 'America/Fortaleza',
  FILES: {
    CLIENTES_ID: '1TgsNL2X3f0lt2UQUrENoxOaQWp75q2mK_lWNVLkjeMs',
    POSTAGENS_ID: '1jMk7niNs7eULxsU9yazVDxz5Q8-V5CN75eA_Dwmq1hI'
  },
  CACHE: {
    CURVA_SEC: 1800,
    CHUNK_SIZE: 85000
  },
  CURVA: {
    CUTS: { TOP: 0.05, A: 0.25, B: 0.60 },
    WEIGHTS: { VALOR: 0.70, QTD: 0.30 }
  }
};

function portal_doGet_(p) {
  p = p || {};
  var action = portalNorm_(p.action || '');

  if (action === 'portal_curva_abc_v1') {
    return portal_apiCurvaAbcV1_(p);
  }

  if (action === 'portal_health_v1') {
    return {
      ok: true,
      module: 'portal-postal',
      version: 'v1',
      now: portalNow_()
    };
  }

  return {
    ok: false,
    error: 'Acao Portal invalida: ' + action
  };
}

function portal_apiCurvaAbcV1_(p) {
  p = p || {};
  var noCache = portalBool_(p.refresh || p.forceRefresh);
  var cacheKey = 'portal_curva_abc_v1_chunked_v1';

  if (!noCache) {
    var cached = portalCacheGet_(cacheKey);
    if (cached) {
      cached.meta = cached.meta || {};
      cached.meta.cacheHit = true;
      return cached;
    }
  }

  var clientes = portalReadClientes_();
  var postagensData = portalReadPostagens_();
  var payload = portalBuildCurvaPayload_(clientes, postagensData.items);
  payload.meta.linhasPostagensIgnoradas = postagensData.ignored.length;
  payload.meta.cacheHit = false;
  payload.ignored = postagensData.ignored.slice(0, 50);

  portalCachePut_(cacheKey, payload, PORTAL_CFG.CACHE.CURVA_SEC);
  return payload;
}

function portalReadClientes_() {
  var ss = SpreadsheetApp.openById(PORTAL_CFG.FILES.CLIENTES_ID);
  var sh = ss.getSheets()[0];
  if (!sh || sh.getLastRow() < 2) return { items: [], byKey: {} };

  var values = sh.getDataRange().getValues();
  var hm = portalHeaderMap_(values[0]);
  var out = [];
  var byKey = {};

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var nome = portalText_(portalCell_(r, hm, ['NOME', 'CLIENTE']));
    if (!nome) continue;

    var item = {
      fonte: 'cadastro',
      codigo: portalText_(portalCell_(r, hm, ['CODIGO', 'ID'])),
      cliente: nome,
      clienteKey: portalKey_(nome),
      cnpj: portalText_(portalCell_(r, hm, ['CNPJ', 'CNPJ_CPF', 'CPF_CNPJ'])),
      email: portalText_(portalCell_(r, hm, ['EMAIL'])),
      telefone: portalText_(portalCell_(r, hm, ['TELEFONE', 'WHATSAPP'])),
      contrato: portalText_(portalCell_(r, hm, ['CONTRATO'])),
      cartao: portalText_(portalCell_(r, hm, ['CARTAO POSTAGEM', 'CARTAO_POSTAGEM', 'CARTÃO'])),
      comSem: portalText_(portalCell_(r, hm, ['COM/SEM', 'COM_SEM', 'TEM_CONTRATO'])) || 'SEM INFORMACAO',
      tipoContrato: portalText_(portalCell_(r, hm, ['TIPO CONTRATO', 'TIPO_CONTRATO'])) || 'SEM TIPO',
      cws: portalText_(portalCell_(r, hm, ['CWS'])) || 'SEM INFORMACAO',
      vigencia: portalDateToIso_(portalCell_(r, hm, ['VIGENCIA', 'VIGÊNCIA'])),
      servicos: portalText_(portalCell_(r, hm, ['SERVICOS', 'SERVIÇOS']))
    };

    out.push(item);
    if (!byKey[item.clienteKey]) byKey[item.clienteKey] = item;
  }

  return { items: out, byKey: byKey };
}

function portalReadPostagens_() {
  var ss = SpreadsheetApp.openById(PORTAL_CFG.FILES.POSTAGENS_ID);
  var sh = ss.getSheets()[0];
  if (!sh || sh.getLastRow() < 2) return { items: [], ignored: [] };

  var values = sh.getDataRange().getValues();
  var hm = portalHeaderMap_(values[0]);
  var out = [];
  var ignored = [];

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var cliente = portalText_(portalCell_(r, hm, ['CLIENTE', 'NOME']));
    var dataRaw = portalCell_(r, hm, ['DATA', 'DATA FORMAT', 'DATA_FORMAT']);
    var qtdRaw = portalCell_(r, hm, ['QTD', 'QUANT', 'QUANTIDADE']);
    var valorRaw = portalCell_(r, hm, ['VALOR', 'FATURAMENTO']);

    if (!cliente) continue;

    var dataIso = portalDateToIso_(dataRaw);
    var qtd = portalNumberStrict_(qtdRaw);
    var valor = portalNumberStrict_(valorRaw);

    if (!dataIso || qtd === null || valor === null || qtd < 0 || valor < 0) {
      ignored.push({
        rowNumber: i + 1,
        cliente: cliente,
        data: portalText_(dataRaw),
        qtd: portalText_(qtdRaw),
        valor: portalText_(valorRaw),
        motivo: 'DATA, QTD ou VALOR invalido'
      });
      continue;
    }

    out.push({
      cliente: cliente,
      clienteKey: portalKey_(cliente),
      data: dataIso,
      ym: dataIso.slice(0, 7),
      qtd: qtd,
      valor: valor
    });
  }

  return { items: out, ignored: ignored };
}

function portalBuildCurvaPayload_(clientesData, postagens) {
  var byKey = {};
  var monthsMap = {};
  var latest = '';

  clientesData.items.forEach(function(c) {
    byKey[c.clienteKey] = {
      cliente: c.cliente,
      clienteKey: c.clienteKey,
      codigo: c.codigo,
      cnpj: c.cnpj,
      email: c.email,
      telefone: c.telefone,
      contrato: c.contrato,
      cartao: c.cartao,
      comSem: c.comSem,
      tipoContrato: c.tipoContrato,
      cws: c.cws,
      vigencia: c.vigencia,
      servicos: c.servicos,
      cadastroEncontrado: true,
      totalQtd: 0,
      totalValor: 0,
      ticketMedio: 0,
      ultimaPostagem: '',
      ultimoLabel: 'Sem postagem',
      diasSemPostar: 99999,
      months: {}
    };
  });

  postagens.forEach(function(p) {
    if (!/^\d{4}-\d{2}$/.test(p.ym)) return;
    monthsMap[p.ym] = 1;
    if (!latest || p.data > latest) latest = p.data;

    if (!byKey[p.clienteKey]) {
      byKey[p.clienteKey] = {
        cliente: p.cliente,
        clienteKey: p.clienteKey,
        codigo: '',
        cnpj: '',
        email: '',
        telefone: '',
        contrato: '',
        cartao: '',
        comSem: 'SEM CADASTRO',
        tipoContrato: 'SEM CADASTRO',
        cws: 'SEM CADASTRO',
        vigencia: '',
        servicos: '',
        cadastroEncontrado: false,
        totalQtd: 0,
        totalValor: 0,
        ticketMedio: 0,
        ultimaPostagem: '',
        ultimoLabel: 'Sem postagem',
        diasSemPostar: 99999,
        months: {}
      };
    }

    var row = byKey[p.clienteKey];
    if (!row.months[p.ym]) row.months[p.ym] = { qtd: 0, valor: 0 };
    row.months[p.ym].qtd += p.qtd;
    row.months[p.ym].valor += p.valor;
    row.totalQtd += p.qtd;
    row.totalValor += p.valor;
    if (!row.ultimaPostagem || p.data > row.ultimaPostagem) row.ultimaPostagem = p.data;
  });

  var months = Object.keys(monthsMap).filter(function(x) {
    return /^\d{4}-\d{2}$/.test(x);
  }).sort();
  if (months.length > 8) months = months.slice(months.length - 8);

  var today = portalYmd_(new Date());
  var rows = Object.keys(byKey).map(function(k) {
    var r = byKey[k];
    r.totalQtd = Math.round(r.totalQtd * 1000) / 1000;
    r.totalValor = Math.round(r.totalValor * 100) / 100;
    r.ticketMedio = r.totalQtd > 0 ? Math.round((r.totalValor / r.totalQtd) * 100) / 100 : 0;
    if (r.ultimaPostagem) {
      r.diasSemPostar = portalDiffDays_(today, r.ultimaPostagem);
      r.ultimoLabel = r.diasSemPostar + 'd';
    }
    return r;
  });

  portalApplyCurva_(rows);

  rows.sort(function(a, b) {
    return (b.totalQtd - a.totalQtd) || (b.totalValor - a.totalValor) || a.cliente.localeCompare(b.cliente);
  });

  return {
    ok: true,
    module: 'portal-postal',
    version: 'curva_abc_v1_2026_07_02_cache_chunks',
    generatedAt: portalNow_(),
    months: months,
    rows: rows,
    filters: portalBuildFilters_(rows),
    meta: {
      clientesCadastro: clientesData.items.length,
      postagens: postagens.length,
      clientesRetornados: rows.length,
      latestPostagem: latest,
      regraCurva: 'Score 70% faturamento + 30% quantidade. TOP 5%, A ate 25%, B ate 60%, C restante. Clientes sem movimento ficam SEM CURVA.'
    }
  };
}

function portalApplyCurva_(rows) {
  var active = rows.filter(function(r) { return r.totalQtd > 0 || r.totalValor > 0; });
  var maxValor = active.reduce(function(m, r) { return Math.max(m, r.totalValor || 0); }, 0);
  var maxQtd = active.reduce(function(m, r) { return Math.max(m, r.totalQtd || 0); }, 0);

  active.forEach(function(r) {
    var valorScore = maxValor > 0 ? (r.totalValor / maxValor) : 0;
    var qtdScore = maxQtd > 0 ? (r.totalQtd / maxQtd) : 0;
    r.curvaScore = (valorScore * PORTAL_CFG.CURVA.WEIGHTS.VALOR) + (qtdScore * PORTAL_CFG.CURVA.WEIGHTS.QTD);
  });

  active.sort(function(a, b) { return b.curvaScore - a.curvaScore; });

  var total = active.length;
  var topEnd = Math.max(1, Math.ceil(total * PORTAL_CFG.CURVA.CUTS.TOP));
  var aEnd = Math.max(topEnd, Math.ceil(total * PORTAL_CFG.CURVA.CUTS.A));
  var bEnd = Math.max(aEnd, Math.ceil(total * PORTAL_CFG.CURVA.CUTS.B));

  active.forEach(function(r, idx) {
    if (idx < topEnd) r.curva = 'CURVA TOP';
    else if (idx < aEnd) r.curva = 'CURVA A';
    else if (idx < bEnd) r.curva = 'CURVA B';
    else r.curva = 'CURVA C';
  });

  rows.forEach(function(r) {
    if (!r.curva) {
      r.curva = 'SEM CURVA';
      r.curvaScore = 0;
    }
  });
}

function portalBuildFilters_(rows) {
  return {
    comSem: portalUnique_(rows.map(function(r) { return r.comSem; })),
    tipoContrato: portalUnique_(rows.map(function(r) { return r.tipoContrato; })),
    cws: portalUnique_(rows.map(function(r) { return r.cws; })),
    curva: portalUnique_(rows.map(function(r) { return r.curva; }))
  };
}

function portalHeaderMap_(headers) {
  var map = {};
  (headers || []).forEach(function(h, idx) {
    var k = portalHeaderKey_(h);
    if (k && map[k] === undefined) map[k] = idx;
  });
  return map;
}

function portalCell_(row, hm, names) {
  names = Array.isArray(names) ? names : [names];
  for (var i = 0; i < names.length; i++) {
    var k = portalHeaderKey_(names[i]);
    if (hm[k] !== undefined) return row[hm[k]];
  }
  return '';
}

function portalHeaderKey_(v) {
  return portalNoAcc_(v).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function portalKey_(v) {
  return portalNoAcc_(v).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function portalNoAcc_(v) {
  var s = String(v == null ? '' : v);
  try {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch(e) {
    return s;
  }
}

function portalText_(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function portalNorm_(v) {
  return portalText_(v).toLowerCase();
}

function portalNumber_(v) {
  var n = portalNumberStrict_(v);
  return n === null ? 0 : n;
}

function portalNumberStrict_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).trim();
  if (!s) return null;

  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) {
    return null;
  }

  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isNaN(n) ? null : n;
}

function portalDateToIso_(v) {
  if (v == null || v === '') return '';

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return portalValidateIso_(portalYmd_(v));
  }

  var s = String(v).trim();
  if (!s) return '';

  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|T|$)/);
  if (iso) {
    return portalValidateIso_(Utilities.formatString('%04d-%02d-%02d', Number(iso[1]), Number(iso[2]), Number(iso[3])));
  }

  var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (br) {
    return portalValidateIso_(Utilities.formatString('%04d-%02d-%02d', Number(br[3]), Number(br[2]), Number(br[1])));
  }

  return '';
}

function portalValidateIso_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var y = Number(m[1]);
  var mo = Number(m[2]);
  var d = Number(m[3]);
  if (y < 2020 || y > 2035 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  var dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
  return iso;
}

function portalYmd_(d) {
  return Utilities.formatDate(d, PORTAL_CFG.TZ, 'yyyy-MM-dd');
}

function portalNow_() {
  return Utilities.formatDate(new Date(), PORTAL_CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function portalDateLabel_(iso) {
  if (!iso) return '';
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return m[3] + '/' + m[2] + '/' + String(m[1]).slice(2);
}

function portalDiffDays_(aIso, bIso) {
  var a = portalIsoToDate_(aIso);
  var b = portalIsoToDate_(bIso);
  if (!a || !b) return 99999;
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function portalIsoToDate_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function portalUnique_(arr) {
  var seen = {};
  var out = [];
  (arr || []).forEach(function(v) {
    var s = portalText_(v);
    if (s && !seen[s]) {
      seen[s] = 1;
      out.push(s);
    }
  });
  return out.sort(function(a, b) { return a.localeCompare(b); });
}

function portalBool_(v) {
  var s = portalNoAcc_(v).toUpperCase().trim();
  return s === '1' || s === 'TRUE' || s === 'SIM' || s === 'YES';
}

function portalCacheGet_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var metaRaw = cache.get(key + ':meta');

    if (metaRaw) {
      var meta = JSON.parse(metaRaw);
      var chunkCount = Number(meta.chunkCount || 0);
      if (chunkCount <= 0) return null;

      var keys = [];
      for (var i = 0; i < chunkCount; i++) keys.push(key + ':chunk:' + i);
      var chunks = cache.getAll(keys);
      var json = '';

      for (var c = 0; c < chunkCount; c++) {
        var part = chunks[key + ':chunk:' + c];
        if (!part) return null;
        json += part;
      }

      return JSON.parse(json);
    }

    var raw = cache.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

function portalCachePut_(key, obj, sec) {
  try {
    var cache = CacheService.getScriptCache();
    var json = JSON.stringify(obj);
    var ttl = sec || 300;
    var chunkSize = PORTAL_CFG.CACHE.CHUNK_SIZE || 85000;

    if (json.length < chunkSize) {
      cache.put(key, json, ttl);
      cache.put(key + ':meta', JSON.stringify({ chunkCount: 0, storedAt: portalNow_(), size: json.length }), ttl);
      return;
    }

    var payload = {};
    var chunkCount = Math.ceil(json.length / chunkSize);
    for (var i = 0; i < chunkCount; i++) {
      payload[key + ':chunk:' + i] = json.slice(i * chunkSize, (i + 1) * chunkSize);
    }

    cache.putAll(payload, ttl);
    cache.put(key + ':meta', JSON.stringify({ chunkCount: chunkCount, storedAt: portalNow_(), size: json.length }), ttl);
  } catch(e) {}
}
