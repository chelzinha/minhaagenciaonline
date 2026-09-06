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
  { key: 'NOME CONTRATO', label: 'INTERMEDIADOR', width: 150 },
  { key: 'SISTEMA', label: 'SISTEMA', width: 128 },
  { key: 'VALOR', label: 'VALOR', width: 92, numeric: true, type: 'money' },
  { key: 'ESTORNO', label: 'ESTORNO', width: 76 },
  { key: 'ATENDENTE', label: 'ATENDENTE', width: 150 },
  { key: 'MODALIDADE PAGAMENTO', label: 'MODALIDADE PAGAMENTO', width: 158 },
  { key: 'FORMA PAGAMENTO', label: 'FORMA PAGAMENTO', width: 142 },
  { key: 'LOCAL', label: 'LOCAL', width: 82, editableAdmin: true }
]);

function ATENDE_buscarDadosD1(params) {
  params = params || {};
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(500, Math.max(1, Number(params.pageSize || 500)));
  const q = String(params.q || '').trim();
  const dataInicio = String(params.dataInicio || params.startDate || params.inicio || '').trim();
  const dataFim = String(params.dataFim || params.endDate || params.fim || '').trim();
  const servicos = Array.isArray(params.servicos)
    ? params.servicos.map(function(v) { return String(v || '').trim(); }).filter(Boolean)
    : (params.servico ? [String(params.servico).trim()].filter(Boolean) : []);
  const contrato = String(params.contrato || '').trim();
  const sistema = String(params.sistema || '').trim();
  const estorno = String(params.estorno || '').trim();
  const atendente = String(params.atendente || '').trim();
  const modalidadePagamento = String(params.modalidadePagamento || '').trim();
  const formaPagamento = String(params.formaPagamento || '').trim();
  const tipoObjeto = String(params.tipoObjeto || '').trim();
  const local = String(params.local || '').trim();
  const sortKey = String(params.sortKey || 'DATA').trim() || 'DATA';
  const sortDir = String(params.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  if (dataInicio && dataFim && dataInicio > dataFim) throw new Error('Data inicial maior que data final.');

  const query = [
    'page=' + encodeURIComponent(page),
    'pageSize=' + encodeURIComponent(pageSize),
    'sortKey=' + encodeURIComponent(sortKey),
    'sortDir=' + encodeURIComponent(sortDir)
  ];
  if (dataInicio) query.push('dataInicio=' + encodeURIComponent(dataInicio));
  if (dataFim) query.push('dataFim=' + encodeURIComponent(dataFim));
  if (q) query.push('q=' + encodeURIComponent(q));
  servicos.forEach(function(servico) { query.push('servico=' + encodeURIComponent(servico)); });
  if (contrato) query.push('contrato=' + encodeURIComponent(contrato));
  if (sistema) query.push('sistema=' + encodeURIComponent(sistema));
  if (estorno) query.push('estorno=' + encodeURIComponent(estorno));
  if (atendente) query.push('atendente=' + encodeURIComponent(atendente));
  if (modalidadePagamento) query.push('modalidadePagamento=' + encodeURIComponent(modalidadePagamento));
  if (formaPagamento) query.push('formaPagamento=' + encodeURIComponent(formaPagamento));
  if (tipoObjeto) query.push('tipoObjeto=' + encodeURIComponent(tipoObjeto));
  if (local) query.push('local=' + encodeURIComponent(local));

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
      copy['NOME CONTRATO'] = '';
      copy.LOCAL = '';
      copy._RAW_ID = 0;
      copy._SRO_DUPLICADO = 0;
      copy._NOME_REMETENTE_ORIGINAL = copy['NOME REMETENTE'] || '';
    }

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

function ATENDE_buscarFiltrosD1() {
  const response = ATENDE_fetchD1_('/filters', { method: 'get' });
  return {
    ok: true,
    servicos: response.servicos || [],
    contratos: response.contratos || [],
    sistemas: response.sistemas || [],
    estornos: response.estornos || [],
    atendentes: response.atendentes || [],
    modalidadesPagamento: response.modalidadesPagamento || [],
    formasPagamento: response.formasPagamento || [],
    tiposObjeto: response.tiposObjeto || ['SRO', 'PRODUTO ECT', 'SEM REGISTRO'],
    locais: response.locais || [{ codigo: 'AGF', nome: 'AGF' }, { codigo: 'METRO', nome: 'METRÔ' }]
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
