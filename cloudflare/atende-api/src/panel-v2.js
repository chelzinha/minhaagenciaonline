const OBJETO_VAZIO_SQL = `(r.codigo_objeto IS NULL OR TRIM(r.codigo_objeto) = '' OR LOWER(TRIM(r.codigo_objeto)) = 'null')`;

const BASE_FROM = `
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri ON ri.import_key = r.import_key AND ri.concluido_em IS NOT NULL
  LEFT JOIN atende_cliente_aliases ca ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c ON c.id = ca.cliente_id AND c.ativo = 1
  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1
  LEFT JOIN atende_contratos co ON co.numero = r.numero_contrato_norm AND co.ativo = 1
  LEFT JOIN (
    SELECT rr.numero_contrato_norm AS numero, COUNT(*) AS ocorrencias
    FROM atende_postagens_raw rr
    JOIN atende_raw_importacoes rii
      ON rii.import_key = rr.import_key
     AND rii.concluido_em IS NOT NULL
    WHERE rr.numero_contrato_norm IS NOT NULL
      AND TRIM(rr.numero_contrato_norm) <> ''
      AND LOWER(TRIM(rr.numero_contrato_norm)) <> 'null'
    GROUP BY rr.numero_contrato_norm
  ) cc ON cc.numero = r.numero_contrato_norm
  LEFT JOIN atende_servico_classificacao sc ON sc.codigo_servico = r.codigo_servico_norm
  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id
  LEFT JOIN atende_sro_counts sd ON sd.codigo_objeto_norm = r.codigo_objeto_norm
`;

const SORT_FIELDS = Object.freeze({
  'DATA': 'r.data_postagem_iso',
  'CEP DESTINATARIO': 'r.cep_destinatario',
  'CEP REMETENTE': 'r.cep_remetente',
  'OBJETO': 'objeto_exibido',
  'COD SERVICO': 'r.codigo_servico_norm',
  'SERVICO': 'r.nome_servico',
  'NOME REMETENTE': 'nome_remetente_exibido',
  'CARTAO POSTAGEM': 'r.cartao_postagem',
  'CONTRATO': 'r.numero_contrato_norm',
  'OCORR': 'COALESCE(cc.ocorrencias, 0)',
  'CLIENTE': 'COALESCE(co.cliente, \'\')',
  'TIPO': 'COALESCE(co.tipo, \'\')',
  'INTERMEDIADOR': 'COALESCE(co.nome, \'\')',
  'SISTEMA': 'r.sistema_postagem',
  'VALOR': 'r.valor_atendimento_num',
  'ESTORNO': 'r.estorno',
  'ATENDENTE': 'atendente_exibido',
  'MODALIDADE PAGAMENTO': 'r.modalidade_pagamento',
  'FORMA PAGAMENTO': 'r.forma_pagamento',
  'LOCAL': 'local_exibido'
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/atende') return listAtende(url, env);
    if (request.method === 'GET' && url.pathname === '/filters') return listFilters(env);
    return json({ ok:false, error:'not_found' }, 404);
  }
};

async function listAtende(url, env) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || 500)));
  const offset = (page - 1) * pageSize;

  const dataInicio = clean(url.searchParams.get('dataInicio'));
  const dataFim = clean(url.searchParams.get('dataFim'));
  const q = clean(url.searchParams.get('q'));
  const contrato = clean(url.searchParams.get('contrato'));
  const contratoOcorr = clean(url.searchParams.get('contratoOcorr'));
  const contratoCliente = clean(url.searchParams.get('contratoCliente'));
  const contratoTipo = clean(url.searchParams.get('contratoTipo'));
  const intermediador = clean(url.searchParams.get('intermediador'));
  const sistema = clean(url.searchParams.get('sistema'));
  const estorno = clean(url.searchParams.get('estorno'));
  const atendente = clean(url.searchParams.get('atendente'));
  const modalidadePagamento = clean(url.searchParams.get('modalidadePagamento'));
  const formaPagamento = clean(url.searchParams.get('formaPagamento'));
  const tipoObjeto = clean(url.searchParams.get('tipoObjeto')).toUpperCase();
  const local = clean(url.searchParams.get('local'));

  const servicos = unique([
    ...url.searchParams.getAll('servico').map(clean),
    ...clean(url.searchParams.get('servicos')).split('|').map(clean)
  ].filter(Boolean));

  const sortKey = clean(url.searchParams.get('sortKey')) || 'DATA';
  const sortField = SORT_FIELDS[sortKey] || SORT_FIELDS.DATA;
  const sortDir = String(url.searchParams.get('sortDir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where = [];
  const args = [];

  if (dataInicio) { where.push('r.data_postagem_iso >= ?'); args.push(dataInicio + ' 00:00:00'); }
  if (dataFim) { where.push('r.data_postagem_iso <= ?'); args.push(dataFim + ' 23:59:59'); }

  if (q) {
    const like = `%${q}%`;
    where.push(`(
      r.codigo_objeto LIKE ? OR r.atendimento LIKE ? OR r.nome_remetente LIKE ? OR c.nome_atual LIKE ? OR
      r.cep_destinatario LIKE ? OR r.cep_remetente LIKE ? OR r.numero_contrato LIKE ? OR co.nome LIKE ? OR
      co.cliente LIKE ? OR co.tipo LIKE ? OR r.cartao_postagem LIKE ? OR r.sistema_postagem LIKE ? OR
      r.cpf_matricula_atendente LIKE ? OR a.nome LIKE ? OR r.codigo_servico LIKE ? OR r.nome_servico LIKE ?
    )`);
    args.push(...Array(16).fill(like));
  }

  if (servicos.length) {
    where.push(`(${servicos.map(() => 'r.nome_servico = ? COLLATE NOCASE').join(' OR ')})`);
    args.push(...servicos);
  }

  addExactFilter(where, args, 'r.numero_contrato_norm', contrato);
  if (contratoOcorr) {
    const ocorr = Number(contratoOcorr);
    if (Number.isFinite(ocorr) && ocorr >= 0) { where.push('COALESCE(cc.ocorrencias, 0) = ?'); args.push(ocorr); }
  }
  addExactFilter(where, args, 'co.cliente', contratoCliente);
  addExactFilter(where, args, 'co.tipo', contratoTipo);
  addExactFilter(where, args, 'co.nome', intermediador);
  addExactFilter(where, args, 'r.sistema_postagem', sistema);
  addExactFilter(where, args, 'r.estorno', estorno);
  addExactFilter(where, args, 'r.atendente_norm', atendente);
  addExactFilter(where, args, 'r.modalidade_pagamento', modalidadePagamento);
  addExactFilter(where, args, 'r.forma_pagamento', formaPagamento);

  if (tipoObjeto === 'SRO') {
    where.push(`NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR'`);
  } else if (tipoObjeto === 'PRODUTO ECT' || tipoObjeto === 'SEM REGISTRO') {
    where.push(`${OBJETO_VAZIO_SQL} AND sc.tipo_objeto = ?`);
    args.push(tipoObjeto);
  }

  if (local) {
    where.push(`COALESCE(po.local_codigo, c.local_padrao, '') = ?`);
    args.push(local);
  }

  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const summary = await env.DB.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(r.valor_atendimento_num), 0) AS total_value
    ${BASE_FROM}${whereSql}
  `).bind(...args).first();

  const total = Number(summary?.total || 0);
  const totalValue = Number(summary?.total_value || 0);

  const select = `
    r.id AS "_RAW_ID",
    r.data_postagem_iso AS "DATA",
    r.cep_destinatario AS "CEP DESTINATARIO",
    r.cep_remetente AS "CEP REMETENTE",
    CASE WHEN ${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto, '') ELSE r.codigo_objeto END AS "OBJETO",
    r.codigo_servico AS "COD SERVICO",
    r.nome_servico AS "SERVICO",
    COALESCE(c.nome_atual, r.nome_remetente) AS "NOME REMETENTE",
    r.nome_remetente AS "_NOME_REMETENTE_ORIGINAL",
    r.cartao_postagem AS "CARTAO POSTAGEM",
    r.numero_contrato AS "CONTRATO",
    COALESCE(cc.ocorrencias, 0) AS "OCORR",
    COALESCE(co.cliente, '') AS "CLIENTE",
    COALESCE(co.tipo, '') AS "TIPO",
    COALESCE(co.nome, '') AS "INTERMEDIADOR",
    r.sistema_postagem AS "SISTEMA",
    r.valor_atendimento_num AS "VALOR",
    r.estorno AS "ESTORNO",
    COALESCE(NULLIF(a.nome, ''), r.cpf_matricula_atendente) AS "ATENDENTE",
    r.atendente_norm AS "_ATENDENTE_CODIGO",
    r.modalidade_pagamento AS "MODALIDADE PAGAMENTO",
    r.forma_pagamento AS "FORMA PAGAMENTO",
    COALESCE(po.local_codigo, c.local_padrao, '') AS "LOCAL",
    CASE WHEN COALESCE(sd.ocorrencias, 0) > 1 THEN 1 ELSE 0 END AS "_SRO_DUPLICADO"
  `;

  const orderExpr = sortField === 'objeto_exibido'
    ? `CASE WHEN ${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto, '') ELSE r.codigo_objeto END`
    : sortField === 'nome_remetente_exibido'
      ? `COALESCE(c.nome_atual, r.nome_remetente)`
      : sortField === 'atendente_exibido'
        ? `COALESCE(NULLIF(a.nome, ''), r.atendente_norm)`
        : sortField === 'local_exibido'
          ? `COALESCE(po.local_codigo, c.local_padrao, '')`
          : sortField;

  const result = await env.DB.prepare(`
    SELECT ${select}
    ${BASE_FROM}${whereSql}
    ORDER BY ${orderExpr} ${sortDir}, r.id ASC
    LIMIT ? OFFSET ?
  `).bind(...args, pageSize, offset).all();

  const rows = (result.results || []).map(row => {
    row.DATA = formatDateBR(row.DATA);
    for (const key of Object.keys(row)) {
      if (key[0] !== '_' && /^(null|undefined)$/i.test(String(row[key] ?? '').trim())) row[key] = '';
    }
    return row;
  });

  return json({
    ok:true, rows, page, pageSize, total, totalValue,
    pages:Math.max(1, Math.ceil(total / pageSize)),
    sortKey:SORT_FIELDS[sortKey] ? sortKey : 'DATA',
    sortDir:sortDir.toLowerCase()
  });
}

async function listFilters(env) {
  const simpleSpecs = [
    ['servicos', 'r.nome_servico'],
    ['contratos', 'r.numero_contrato_norm'],
    ['contratoOcorrencias', 'cc.ocorrencias'],
    ['contratoClientes', 'co.cliente'],
    ['contratoTipos', 'co.tipo'],
    ['intermediadores', 'co.nome'],
    ['sistemas', 'r.sistema_postagem'],
    ['estornos', 'r.estorno'],
    ['modalidadesPagamento', 'r.modalidade_pagamento'],
    ['formasPagamento', 'r.forma_pagamento']
  ];

  const statements = simpleSpecs.map(([key, field]) => env.DB.prepare(`
    SELECT DISTINCT ${field} AS value
    ${BASE_FROM}
    WHERE ${field} IS NOT NULL
      AND TRIM(CAST(${field} AS TEXT)) <> ''
      AND LOWER(TRIM(CAST(${field} AS TEXT))) <> 'null'
    ORDER BY ${key === 'contratoOcorrencias' ? field + ' ASC' : field + ' COLLATE NOCASE ASC'}
    LIMIT 2000
  `));

  statements.push(env.DB.prepare(`
    SELECT r.atendente_norm AS value,
           COALESCE(NULLIF(MAX(a.nome), ''), r.atendente_norm) AS label
    ${BASE_FROM}
    WHERE r.atendente_norm IS NOT NULL
      AND TRIM(r.atendente_norm) <> ''
      AND LOWER(TRIM(r.atendente_norm)) <> 'null'
    GROUP BY r.atendente_norm
    ORDER BY COALESCE(NULLIF(MAX(a.nome), ''), r.atendente_norm) COLLATE NOCASE ASC
    LIMIT 2000
  `));

  const results = await env.DB.batch(statements);
  const body = {
    ok:true,
    tiposObjeto:['SRO', 'PRODUTO ECT', 'SEM REGISTRO'],
    locais:[{codigo:'AGF', nome:'AGF'}, {codigo:'METRO', nome:'METRÔ'}]
  };

  simpleSpecs.forEach(([key], i) => {
    body[key] = (results[i]?.results || []).map(row => clean(row.value)).filter(Boolean);
  });

  const attendantResult = results[simpleSpecs.length];
  body.atendentes = (attendantResult?.results || []).map(row => ({
    value:clean(row.value),
    label:clean(row.label) || clean(row.value)
  })).filter(row => row.value);

  return json(body);
}

function addExactFilter(where, args, field, value) {
  if (!value) return;
  where.push(`${field} = ? COLLATE NOCASE`);
  args.push(value);
}

function unique(values) { return Array.from(new Set(values)); }
function clean(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return /^(null|undefined)$/i.test(text) ? '' : text;
}
function formatDateBR(value) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}
function json(body, status=200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{'content-type':'application/json; charset=utf-8', 'cache-control':'no-store'}
  });
}
