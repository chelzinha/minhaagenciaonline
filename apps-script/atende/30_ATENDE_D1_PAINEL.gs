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

function ATENDE_formatarValorPainelD1_(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0,00';
  return Utilities.formatString('%.2f', number).replace('.', ',');
}

function ATENDE_buscarDadosD1(params) {
  params = params || {};

  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 100)));
  const q = String(params.q || '').trim();
  let dataInicio = String(params.dataInicio || params.startDate || params.inicio || '').trim();
  let dataFim = String(params.dataFim || params.endDate || params.fim || '').trim();
  const data = String(params.data || params.date || '').trim();

  if (data && !dataInicio && !dataFim) {
    dataInicio = data;
    dataFim = data;
  }

  const query = [
    'page=' + encodeURIComponent(page),
    'pageSize=' + encodeURIComponent(pageSize)
  ];

  if (dataInicio) query.push('dataInicio=' + encodeURIComponent(dataInicio));
  if (dataFim) query.push('dataFim=' + encodeURIComponent(dataFim));
  if (q) query.push('q=' + encodeURIComponent(q));

  const startedAt = Date.now();
  const response = ATENDE_fetchD1_('/atende?' + query.join('&'), { method: 'get' });
  const rows = (response.rows || []).map(function(row) {
    const formatted = Object.assign({}, row);
    formatted.VALOR = ATENDE_formatarValorPainelD1_(row.VALOR);
    return formatted;
  });

  const result = {
    ok: true,
    rows: rows,
    columns: ATENDE_D1_PANEL_COLUMNS.map(function(column) {
      return Object.assign({}, column);
    }),
    page: Number(response.page || page),
    pageSize: Number(response.pageSize || pageSize),
    total: Number(response.total || 0),
    pages: Number(response.pages || 1),
    meta: {
      modoLeitura: 'cloudflare_d1',
      totalPlanilha: Number(response.total || 0),
      totalRetornado: rows.length,
      page: Number(response.page || page),
      pageSize: Number(response.pageSize || pageSize),
      pages: Number(response.pages || 1),
      dataInicio: dataInicio,
      dataFim: dataFim,
      q: q,
      tempoMs: Date.now() - startedAt
    }
  };

  return result;
}

function ATENDE_testarLeituraPainelD1() {
  const result = ATENDE_buscarDadosD1({ page: 1, pageSize: 100 });
  const summary = {
    ok: result.ok,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    pages: result.pages,
    rowsReturned: result.rows.length,
    columns: result.columns.map(function(column) { return column.label; }),
    firstRow: result.rows.length ? result.rows[0] : null,
    meta: result.meta
  };
  console.log('ATENDE - TESTE LEITURA PAINEL D1');
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
