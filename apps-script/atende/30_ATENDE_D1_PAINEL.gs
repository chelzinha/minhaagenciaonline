// ============================================================
// ATENDE - LEITURA PAGINADA DO PAINEL A PARTIR DO CLOUDFLARE D1
// ============================================================

const ATENDE_D1_PANEL_COLUMNS = Object.freeze([
  { key: 'DATA', label: 'DATA', width: 98, type: 'date', group: 'atendimento' },
  { key: 'CEP DESTINATARIO', label: 'CEP DESTINATARIO', width: 125, mono: true },
  { key: 'CEP REMETENTE', label: 'CEP REMETENTE', width: 115, mono: true },
  { key: 'SRO', label: 'SRO', width: 135, mono: true },
  { key: 'SERVICO', label: 'SERVICO', width: 90, mono: true },
  { key: 'NOME REMETENTE', label: 'NOME REMETENTE', width: 190 },
  { key: 'CARTAO POSTAGEM', label: 'CARTAO POSTAGEM', width: 125, mono: true },
  { key: 'CONTRATO', label: 'CONTRATO', width: 115, mono: true },
  { key: 'SISTEMA', label: 'SISTEMA', width: 130 },
  { key: 'VALOR', label: 'VALOR', width: 105, numeric: true, type: 'money', group: 'atendimento' },
  { key: 'ESTORNO', label: 'ESTORNO', width: 82 },
  { key: 'ATENDENTE', label: 'ATENDENTE', width: 145, mono: true, group: 'atendimento' },
  { key: 'MODALIDADE PAGAMENTO', label: 'MODALIDADE PAGAMENTO', width: 165, group: 'atendimento' },
  { key: 'FORMA PAGAMENTO', label: 'FORMA PAGAMENTO', width: 145, group: 'atendimento' }
]);

function ATENDE_buscarDadosD1(params) {
  params = params || {};

  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 100)));
  const q = String(params.q || '').trim();
  let dataInicio = String(params.dataInicio || params.startDate || params.inicio || '').trim();
  let dataFim = String(params.dataFim || params.endDate || params.fim || '').trim();
  const data = String(params.data || params.date || '').trim();
  const servico = String(params.servico || '').trim();
  const contrato = String(params.contrato || '').trim();
  const sistema = String(params.sistema || '').trim();
  const estorno = String(params.estorno || '').trim();
  const atendente = String(params.atendente || '').trim();
  const modalidadePagamento = String(params.modalidadePagamento || '').trim();
  const formaPagamento = String(params.formaPagamento || '').trim();
  const sortKey = String(params.sortKey || 'DATA').trim() || 'DATA';
  const sortDir = String(params.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  if (data && !dataInicio && !dataFim) {
    dataInicio = data;
    dataFim = data;
  }

  const query = [
    'page=' + encodeURIComponent(page),
    'pageSize=' + encodeURIComponent(pageSize),
    'sortKey=' + encodeURIComponent(sortKey),
    'sortDir=' + encodeURIComponent(sortDir)
  ];

  if (dataInicio) query.push('dataInicio=' + encodeURIComponent(dataInicio));
  if (dataFim) query.push('dataFim=' + encodeURIComponent(dataFim));
  if (q) query.push('q=' + encodeURIComponent(q));
  if (servico) query.push('servico=' + encodeURIComponent(servico));
  if (contrato) query.push('contrato=' + encodeURIComponent(contrato));
  if (sistema) query.push('sistema=' + encodeURIComponent(sistema));
  if (estorno) query.push('estorno=' + encodeURIComponent(estorno));
  if (atendente) query.push('atendente=' + encodeURIComponent(atendente));
  if (modalidadePagamento) query.push('modalidadePagamento=' + encodeURIComponent(modalidadePagamento));
  if (formaPagamento) query.push('formaPagamento=' + encodeURIComponent(formaPagamento));

  const startedAt = Date.now();
  const response = ATENDE_fetchD1_('/atende?' + query.join('&'), { method: 'get' });
  const rows = (response.rows || []).map(function(row) {
    const copy = Object.assign({}, row);
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
    columns: ATENDE_D1_PANEL_COLUMNS.map(function(column) {
      return Object.assign({}, column);
    }),
    page: Number(response.page || page),
    pageSize: Number(response.pageSize || pageSize),
    total: Number(response.total || 0),
    totalValue: Number(response.totalValue || 0),
    pages: Number(response.pages || 1),
    sortKey: String(response.sortKey || sortKey),
    sortDir: String(response.sortDir || sortDir),
    meta: {
      modoLeitura: 'cloudflare_d1',
      totalPlanilha: Number(response.total || 0),
      totalRetornado: rows.length,
      totalValue: Number(response.totalValue || 0),
      page: Number(response.page || page),
      pageSize: Number(response.pageSize || pageSize),
      pages: Number(response.pages || 1),
      dataInicio: dataInicio,
      dataFim: dataFim,
      q: q,
      servico: servico,
      contrato: contrato,
      sistema: sistema,
      estorno: estorno,
      atendente: atendente,
      modalidadePagamento: modalidadePagamento,
      formaPagamento: formaPagamento,
      sortKey: String(response.sortKey || sortKey),
      sortDir: String(response.sortDir || sortDir),
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
    formasPagamento: response.formasPagamento || []
  };
}

function ATENDE_testarLeituraPainelD1() {
  const result = ATENDE_buscarDadosD1({ page: 1, pageSize: 100 });
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
  console.log('ATENDE - TESTE LEITURA PAINEL D1');
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
