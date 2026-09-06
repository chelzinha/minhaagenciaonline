// ============================================================
// ATENDE - LEITURA PAGINADA DO PAINEL A PARTIR DO CLOUDFLARE D1
// ============================================================

const ATENDE_D1_PANEL_COLUMNS = Object.freeze([
  { key: 'DATA', label: 'DATA', width: 98, type: 'date' },
  { key: 'CEP DESTINATARIO', label: 'CEP DESTINATARIO', width: 118, mono: true },
  { key: 'CEP REMETENTE', label: 'CEP REMETENTE', width: 112, mono: true },
  { key: 'OBJETO', label: 'OBJETO', width: 138, mono: true },
  { key: 'COD SERVICO', label: 'CÓD. SERVIÇO', width: 88, mono: true },
  { key: 'SERVICO', label: 'SERVIÇO', width: 205 },
  { key: 'NOME REMETENTE', label: 'NOME REMETENTE', width: 200 },
  { key: 'CARTAO POSTAGEM', label: 'CARTÃO POSTAGEM', width: 120, mono: true },
  { key: 'CONTRATO', label: 'CONTRATO', width: 112, mono: true },
  { key: 'OCORR', label: 'OCORR.', width: 78, numeric: true },
  { key: 'CLIENTE', label: 'CLIENTE', width: 230 },
  { key: 'TIPO', label: 'TIPO', width: 120 },
  { key: 'INTERMEDIADOR', label: 'INTERMEDIADOR', width: 150 },
  { key: 'SISTEMA', label: 'SISTEMA', width: 128 },
  { key: 'VALOR', label: 'VALOR', width: 92, numeric: true, type: 'money' },
  { key: 'ESTORNO', label: 'ESTORNO', width: 76 },
  { key: 'ATENDENTE', label: 'ATENDENTE', width: 150 },
  { key: 'MODALIDADE PAGAMENTO', label: 'MODALIDADE PAGAMENTO', width: 158 },
  { key: 'FORMA PAGAMENTO', label: 'FORMA PAGAMENTO', width: 142 },
  { key: 'LOCAL', label: 'LOCAL', width: 82, editableAdmin: true }
]);

function ATENDE_listaFiltro_(params, plural, singular) {
  const source = Array.isArray(params[plural])
    ? params[plural]
    : (params[singular] ? [params[singular]] : []);
  const seen = {};
  return source.map(function(v) { return String(v == null ? '' : v).trim(); })
    .filter(function(v) {
      if (!v || seen[v]) return false;
      seen[v] = true;
      return true;
    });
}

function ATENDE_mapaFiltrosD1_(params) {
  params = params || {};
  return {
    servico: ATENDE_listaFiltro_(params, 'servicos', 'servico'),
    servicoTipo: ATENDE_listaFiltro_(params, 'servicoTipos', 'servicoTipo'),
    servicoSubgrupo: ATENDE_listaFiltro_(params, 'servicoSubgrupos', 'servicoSubgrupo'),
    servicoTabela: ATENDE_listaFiltro_(params, 'servicoTabelas', 'servicoTabela'),
    tipoObjeto: ATENDE_listaFiltro_(params, 'tiposObjeto', 'tipoObjeto'),
    contratoCliente: ATENDE_listaFiltro_(params, 'contratoClientes', 'contratoCliente'),
    contratoTipo: ATENDE_listaFiltro_(params, 'contratoTipos', 'contratoTipo'),
    intermediador: ATENDE_listaFiltro_(params, 'intermediadores', 'intermediador'),
    sistema: ATENDE_listaFiltro_(params, 'sistemas', 'sistema'),
    estorno: ATENDE_listaFiltro_(params, 'estornos', 'estorno'),
    atendente: ATENDE_listaFiltro_(params, 'atendentes', 'atendente'),
    modalidadePagamento: ATENDE_listaFiltro_(params, 'modalidadesPagamento', 'modalidadePagamento'),
    formaPagamento: ATENDE_listaFiltro_(params, 'formasPagamento', 'formaPagamento'),
    local: ATENDE_listaFiltro_(params, 'locais', 'local')
  };
}

function ATENDE_adicionarContextoFiltroQuery_(query, params) {
  params = params || {};
  const q = String(params.q || '').trim();
  const dataInicio = String(params.dataInicio || params.startDate || params.inicio || '').trim();
  const dataFim = String(params.dataFim || params.endDate || params.fim || '').trim();
  if (dataInicio && dataFim && dataInicio > dataFim) throw new Error('Data inicial maior que data final.');
  if (dataInicio) query.push('dataInicio=' + encodeURIComponent(dataInicio));
  if (dataFim) query.push('dataFim=' + encodeURIComponent(dataFim));
  if (q) query.push('q=' + encodeURIComponent(q));
  const multi = ATENDE_mapaFiltrosD1_(params);
  Object.keys(multi).forEach(function(key) {
    multi[key].forEach(function(value) { query.push(key + '=' + encodeURIComponent(value)); });
  });
  return query;
}

function ATENDE_buscarDadosD1(params) {
  params = params || {};
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(500, Math.max(1, Number(params.pageSize || 500)));
  const sortKey = String(params.sortKey || 'DATA').trim() || 'DATA';
  const sortDir = String(params.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const query = [
    'page=' + encodeURIComponent(page),
    'pageSize=' + encodeURIComponent(pageSize),
    'sortKey=' + encodeURIComponent(sortKey),
    'sortDir=' + encodeURIComponent(sortDir)
  ];
  ATENDE_adicionarContextoFiltroQuery_(query, params);

  const startedAt = Date.now();
  const response = ATENDE_fetchD1_('/atende?' + query.join('&'), { method: 'get' });
  let compatibilityMode = false;
  const rows = (response.rows || []).map(function(row) {
    const copy = Object.assign({}, row);

    if (!Object.prototype.hasOwnProperty.call(copy, 'OBJETO')) {
      compatibilityMode = true;
      copy.OBJETO = copy.SRO || '';
      copy['COD SERVICO'] = copy.SERVICO || '';
      copy.SERVICO = '';
      copy.OCORR = '';
      copy.CLIENTE = '';
      copy.TIPO = '';
      copy.INTERMEDIADOR = copy['NOME CONTRATO'] || '';
      copy.LOCAL = '';
      copy._RAW_ID = 0;
      copy._SRO_DUPLICADO = 0;
      copy._NOME_REMETENTE_ORIGINAL = copy['NOME REMETENTE'] || '';
    }

    if (!Object.prototype.hasOwnProperty.call(copy, 'OCORR')) copy.OCORR = '';
    if (!Object.prototype.hasOwnProperty.call(copy, 'CLIENTE')) copy.CLIENTE = '';
    if (!Object.prototype.hasOwnProperty.call(copy, 'TIPO')) copy.TIPO = '';
    if (!Object.prototype.hasOwnProperty.call(copy, 'INTERMEDIADOR')) copy.INTERMEDIADOR = copy['NOME CONTRATO'] || '';

    if (copy.VALOR !== '' && copy.VALOR != null) {
      const n = Number(copy.VALOR);
      copy.VALOR = isFinite(n)
        ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(copy.VALOR);
    }
    return copy;
  });

  return {
    ok: true,
    rows: rows,
    columns: ATENDE_D1_PANEL_COLUMNS.map(function(column) { return Object.assign({}, column); }),
    page: Number(response.page || page),
    pageSize: Number(response.pageSize || pageSize),
    total: Number(response.total || 0),
    totalValue: Number(response.totalValue || 0),
    pages: Number(response.pages || 1),
    sortKey: String(response.sortKey || sortKey),
    sortDir: String(response.sortDir || sortDir),
    meta: {
      modoLeitura: compatibilityMode ? 'cloudflare_d1_legacy_transition' : 'cloudflare_d1_raw',
      totalRetornado: rows.length,
      totalValue: Number(response.totalValue || 0),
      page: Number(response.page || page),
      pageSize: Number(response.pageSize || pageSize),
      pages: Number(response.pages || 1),
      tempoMs: Date.now() - startedAt
    }
  };
}

function ATENDE_buscarFiltrosD1(params) {
  const query = [];
  ATENDE_adicionarContextoFiltroQuery_(query, params || {});
  const response = ATENDE_fetchD1_('/filters' + (query.length ? '?' + query.join('&') : ''), { method: 'get' });
  return {
    ok: true,
    servicos: response.servicos || [],
    servicoTipos: response.servicoTipos || [],
    servicoSubgrupos: response.servicoSubgrupos || [],
    servicoTabelas: response.servicoTabelas || [],
    contratoClientes: response.contratoClientes || [],
    contratoTipos: response.contratoTipos || [],
    intermediadores: response.intermediadores || [],
    sistemas: response.sistemas || [],
    estornos: response.estornos || [],
    atendentes: response.atendentes || [],
    modalidadesPagamento: response.modalidadesPagamento || [],
    formasPagamento: response.formasPagamento || [],
    tiposObjeto: response.tiposObjeto || [],
    locais: response.locais || []
  };
}

function ATENDE_testarLeituraPainelD1() {
  const result = ATENDE_buscarDadosD1({ page: 1, pageSize: 500 });
  const summary = {
    ok: result.ok,
    total: result.total,
    totalValue: result.totalValue,
    page: result.page,
    pageSize: result.pageSize,
    pages: result.pages,
    rowsReturned: result.rows.length,
    sortKey: result.sortKey,
    sortDir: result.sortDir,
    columns: result.columns.map(function(column) { return column.label; }),
    firstRow: result.rows.length ? result.rows[0] : null,
    meta: result.meta
  };
  console.log('ATENDE - TESTE LEITURA PAINEL D1 RAW');
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
