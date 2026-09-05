const SOURCE_HEADERS = [
  'ATENDIMENTO','ALTURA','CEP_DESTINATARIO','CEP_REMETENTE','MCU','CODIGO_OBJETO',
  'CODIGO_SERVICO','COMPRIMENTO','DATA_POSTAGEM','DIAMETRO','LARGURA','NOME_DESTINATARIO',
  'NOME_REMETENTE','NOME_SERVICO','CARTAO_POSTAGEM','NUMERO_CONTRATO','NUMERO_PLP',
  'SISTEMA_POSTAGEM','PESO','PESO_TARIFADO','VALOR_ATENDIMENTO','VALOR_DECLARADO','ESTORNO',
  'CPF_MATRICULA_ATENDENTE','MODALIDADE_PAGAMENTO','FORMA_PAGAMENTO'
];

const PANEL_COLUMNS = [
  ['data_postagem','DATA'],
  ['cep_destinatario','CEP DESTINATARIO'],
  ['cep_remetente','CEP REMETENTE'],
  ['codigo_objeto','SRO'],
  ['codigo_servico','SERVICO'],
  ['nome_remetente','NOME REMETENTE'],
  ['cartao_postagem','CARTAO POSTAGEM'],
  ['numero_contrato','CONTRATO'],
  ['sistema_postagem','SISTEMA'],
  ['valor_atendimento','VALOR'],
  ['estorno','ESTORNO'],
  ['cpf_matricula_atendente','ATENDENTE'],
  ['modalidade_pagamento','MODALIDADE PAGAMENTO'],
  ['forma_pagamento','FORMA PAGAMENTO']
];

const SORT_FIELDS = Object.freeze({
  'DATA': 'data_postagem',
  'CEP DESTINATARIO': 'cep_destinatario',
  'CEP REMETENTE': 'cep_remetente',
  'SRO': 'codigo_objeto',
  'SERVICO': 'codigo_servico',
  'NOME REMETENTE': 'nome_remetente',
  'CARTAO POSTAGEM': 'cartao_postagem',
  'CONTRATO': 'numero_contrato',
  'SISTEMA': 'sistema_postagem',
  'VALOR': 'valor_atendimento',
  'ESTORNO': 'estorno',
  'ATENDENTE': 'cpf_matricula_atendente',
  'MODALIDADE PAGAMENTO': 'modalidade_pagamento',
  'FORMA PAGAMENTO': 'forma_pagamento'
});

const UPSERT_SQL = `
INSERT INTO atende_postagens (
  source_key, atendimento, altura, cep_destinatario, cep_remetente, mcu, codigo_objeto,
  codigo_servico, comprimento, data_postagem, diametro, largura, nome_destinatario,
  nome_remetente, nome_servico, cartao_postagem, numero_contrato, numero_plp,
  sistema_postagem, peso, peso_tarifado, valor_atendimento, valor_declarado, estorno,
  cpf_matricula_atendente, modalidade_pagamento, forma_pagamento, row_hash, arquivo_origem,
  importado_em, atualizado_em
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
ON CONFLICT(source_key) DO UPDATE SET
  atendimento=excluded.atendimento,
  altura=excluded.altura,
  cep_destinatario=excluded.cep_destinatario,
  cep_remetente=excluded.cep_remetente,
  mcu=excluded.mcu,
  codigo_objeto=excluded.codigo_objeto,
  codigo_servico=excluded.codigo_servico,
  comprimento=excluded.comprimento,
  data_postagem=excluded.data_postagem,
  diametro=excluded.diametro,
  largura=excluded.largura,
  nome_destinatario=excluded.nome_destinatario,
  nome_remetente=excluded.nome_remetente,
  nome_servico=excluded.nome_servico,
  cartao_postagem=excluded.cartao_postagem,
  numero_contrato=excluded.numero_contrato,
  numero_plp=excluded.numero_plp,
  sistema_postagem=excluded.sistema_postagem,
  peso=excluded.peso,
  peso_tarifado=excluded.peso_tarifado,
  valor_atendimento=excluded.valor_atendimento,
  valor_declarado=excluded.valor_declarado,
  estorno=excluded.estorno,
  cpf_matricula_atendente=excluded.cpf_matricula_atendente,
  modalidade_pagamento=excluded.modalidade_pagamento,
  forma_pagamento=excluded.forma_pagamento,
  row_hash=excluded.row_hash,
  arquivo_origem=excluded.arquivo_origem,
  atualizado_em=datetime('now')
WHERE atende_postagens.row_hash <> excluded.row_hash
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'agf-atende-api' });
    }

    if (!authorized(request, env)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    if (request.method === 'POST' && url.pathname === '/ingest') {
      return ingest(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/atende') {
      return listAtende(url, env);
    }

    if (request.method === 'GET' && url.pathname === '/filters') {
      return listFilters(env);
    }

    if (request.method === 'GET' && url.pathname === '/imports/check') {
      const hash = (url.searchParams.get('hash') || '').trim();
      if (!hash) return json({ ok: false, error: 'hash_required' }, 400);
      const row = await env.DB.prepare(
        'SELECT arquivo_nome, arquivo_hash, total_linhas, recebidas, gravadas, concluido_em FROM atende_importacoes WHERE arquivo_hash = ?'
      ).bind(hash).first();
      return json({ ok: true, found: !!row, completed: !!(row && row.concluido_em), import: row || null });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }
};

function authorized(request, env) {
  if (!env.ATENDE_API_TOKEN) return false;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.ATENDE_API_TOKEN}`;
}

async function ingest(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const fileName = clean(body.fileName);
  const fileHash = clean(body.fileHash);
  const totalRows = Math.max(0, Number(body.totalRows || 0));
  const offset = Math.max(0, Number(body.offset || 0));
  const isFinal = body.final === true;
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!fileName || !fileHash) return json({ ok: false, error: 'fileName_and_fileHash_required' }, 400);
  if (!rows.length) return json({ ok: false, error: 'rows_required' }, 400);
  if (rows.length > 1000) return json({ ok: false, error: 'max_1000_rows_per_request' }, 413);

  const previous = await env.DB.prepare(
    'SELECT concluido_em FROM atende_importacoes WHERE arquivo_hash = ?'
  ).bind(fileHash).first();
  if (previous && previous.concluido_em) {
    return json({ ok: true, duplicateFile: true, completed: true, received: 0, changed: 0 });
  }

  await env.DB.prepare(`
    INSERT INTO atende_importacoes (arquivo_nome, arquivo_hash, total_linhas, recebidas, gravadas)
    VALUES (?, ?, ?, 0, 0)
    ON CONFLICT(arquivo_hash) DO UPDATE SET
      arquivo_nome=excluded.arquivo_nome,
      total_linhas=MAX(atende_importacoes.total_linhas, excluded.total_linhas)
  `).bind(fileName, fileHash, totalRows).run();

  const statements = [];
  let invalid = 0;
  for (const raw of rows) {
    const normalized = normalizeRow(raw, fileName);
    if (!normalized) {
      invalid++;
      continue;
    }
    statements.push(env.DB.prepare(UPSERT_SQL).bind(...normalized));
  }

  let changed = 0;
  const DB_BATCH = 100;
  for (let i = 0; i < statements.length; i += DB_BATCH) {
    const results = await env.DB.batch(statements.slice(i, i + DB_BATCH));
    for (const result of results) changed += Number(result?.meta?.changes || 0);
  }

  const receivedThrough = offset + rows.length;
  await env.DB.prepare(`
    UPDATE atende_importacoes
    SET recebidas = MAX(recebidas, ?),
        gravadas = gravadas + ?,
        concluido_em = CASE WHEN ? = 1 THEN datetime('now') ELSE concluido_em END
    WHERE arquivo_hash = ?
  `).bind(receivedThrough, changed, isFinal ? 1 : 0, fileHash).run();

  return json({
    ok: true,
    duplicateFile: false,
    received: rows.length,
    valid: statements.length,
    invalid,
    changed,
    receivedThrough,
    completed: isFinal
  });
}

async function listAtende(url, env) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('pageSize') || 100)));
  const offset = (page - 1) * pageSize;
  const dataInicio = clean(url.searchParams.get('dataInicio'));
  const dataFim = clean(url.searchParams.get('dataFim'));
  const q = clean(url.searchParams.get('q'));
  const servico = clean(url.searchParams.get('servico'));
  const contrato = clean(url.searchParams.get('contrato'));
  const sistema = clean(url.searchParams.get('sistema'));
  const estorno = clean(url.searchParams.get('estorno'));
  const atendente = clean(url.searchParams.get('atendente'));
  const modalidadePagamento = clean(url.searchParams.get('modalidadePagamento'));
  const formaPagamento = clean(url.searchParams.get('formaPagamento'));
  const sortKey = clean(url.searchParams.get('sortKey')) || 'DATA';
  const sortField = SORT_FIELDS[sortKey] || SORT_FIELDS.DATA;
  const sortDir = String(url.searchParams.get('sortDir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where = [];
  const args = [];

  if (dataInicio) {
    where.push('substr(data_postagem,1,10) >= ?');
    args.push(dataInicio);
  }
  if (dataFim) {
    where.push('substr(data_postagem,1,10) <= ?');
    args.push(dataFim);
  }
  if (q) {
    where.push(`(
      codigo_objeto LIKE ? OR atendimento LIKE ? OR nome_remetente LIKE ? OR
      cep_destinatario LIKE ? OR cep_remetente LIKE ? OR numero_contrato LIKE ? OR
      cartao_postagem LIKE ? OR sistema_postagem LIKE ? OR cpf_matricula_atendente LIKE ?
    )`);
    const like = `%${q}%`;
    args.push(like, like, like, like, like, like, like, like, like);
  }

  addExactFilter(where, args, 'codigo_servico', servico);
  addExactFilter(where, args, 'numero_contrato', contrato);
  addExactFilter(where, args, 'sistema_postagem', sistema);
  addExactFilter(where, args, 'estorno', estorno);
  addExactFilter(where, args, 'cpf_matricula_atendente', atendente);
  addExactFilter(where, args, 'modalidade_pagamento', modalidadePagamento);
  addExactFilter(where, args, 'forma_pagamento', formaPagamento);

  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(valor_atendimento),0) AS total_value FROM atende_postagens${whereSql}`
  ).bind(...args).first();
  const total = Number(summary?.total || 0);
  const totalValue = Number(summary?.total_value || 0);

  const selectSql = PANEL_COLUMNS.map(([field, label]) => `${field} AS "${label}"`).join(', ');
  const result = await env.DB.prepare(
    `SELECT ${selectSql} FROM atende_postagens${whereSql} ORDER BY ${sortField} ${sortDir}, source_key ASC LIMIT ? OFFSET ?`
  ).bind(...args, pageSize, offset).all();

  const rows = (result.results || []).map((row) => {
    row.DATA = formatDateBR(row.DATA);
    return row;
  });

  return json({
    ok: true,
    rows,
    page,
    pageSize,
    total,
    totalValue,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    sortKey: SORT_FIELDS[sortKey] ? sortKey : 'DATA',
    sortDir: sortDir.toLowerCase()
  });
}

function addExactFilter(where, args, field, value) {
  if (!value) return;
  where.push(`${field} = ? COLLATE NOCASE`);
  args.push(value);
}

async function listFilters(env) {
  const fields = [
    ['servicos', 'codigo_servico'],
    ['contratos', 'numero_contrato'],
    ['sistemas', 'sistema_postagem'],
    ['estornos', 'estorno'],
    ['atendentes', 'cpf_matricula_atendente'],
    ['modalidadesPagamento', 'modalidade_pagamento'],
    ['formasPagamento', 'forma_pagamento']
  ];

  const statements = fields.map(([, field]) => env.DB.prepare(
    `SELECT DISTINCT ${field} AS value FROM atende_postagens WHERE ${field} IS NOT NULL AND TRIM(${field}) <> '' ORDER BY ${field} COLLATE NOCASE ASC LIMIT 1000`
  ));
  const results = await env.DB.batch(statements);
  const body = { ok: true };
  fields.forEach(([key], index) => {
    body[key] = (results[index]?.results || []).map((row) => clean(row.value)).filter(Boolean);
  });
  return json(body);
}

function normalizeRow(raw, fileName) {
  if (!raw || typeof raw !== 'object') return null;
  const row = {};
  for (const header of SOURCE_HEADERS) row[header] = clean(raw[header]);

  const objectCode = row.CODIGO_OBJETO.toUpperCase();
  const attendance = row.ATENDIMENTO;
  const sourceKey = objectCode ? `OBJ:${objectCode}` : (attendance ? `ATD:${attendance}` : '');
  if (!sourceKey || !row.DATA_POSTAGEM) return null;

  const hashInput = SOURCE_HEADERS.map((header) => row[header]).join('\u001f');
  const rowHash = fnv1aPair(hashInput);

  return [
    sourceKey,
    attendance,
    num(row.ALTURA),
    digits(row.CEP_DESTINATARIO),
    digits(row.CEP_REMETENTE),
    row.MCU,
    objectCode,
    row.CODIGO_SERVICO,
    num(row.COMPRIMENTO),
    normalizeDateTime(row.DATA_POSTAGEM),
    num(row.DIAMETRO),
    num(row.LARGURA),
    row.NOME_DESTINATARIO,
    row.NOME_REMETENTE,
    row.NOME_SERVICO,
    row.CARTAO_POSTAGEM,
    row.NUMERO_CONTRATO,
    row.NUMERO_PLP,
    row.SISTEMA_POSTAGEM,
    num(row.PESO),
    num(row.PESO_TARIFADO),
    num(row.VALOR_ATENDIMENTO),
    num(row.VALOR_DECLARADO),
    row.ESTORNO,
    row.CPF_MATRICULA_ATENDENTE,
    row.MODALIDADE_PAGAMENTO,
    row.FORMA_PAGAMENTO,
    rowHash,
    fileName
  ];
}

function normalizeDateTime(value) {
  const text = clean(value);
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}`;
  m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}`;
  return text;
}

function formatDateBR(value) {
  const text = clean(value);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : text;
}

function num(value) {
  const text = clean(value);
  if (!text) return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function digits(value) {
  return clean(value).replace(/\D/g, '');
}

function clean(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return /^(null|undefined)$/i.test(text) ? '' : text;
}

function fnv1aPair(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
