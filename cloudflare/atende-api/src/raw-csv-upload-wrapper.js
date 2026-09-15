import baseApp from './dashboard-v6-wrapper.js';

const RAW_CHUNK_ROWS = 400;
const RAW_ROUND_MS = 18000;

const REQUIRED_ATENDE = [
  'ATENDIMENTO',
  'CODIGO_OBJETO',
  'CODIGO_SERVICO',
  'DATA_POSTAGEM',
  'NOME_SERVICO',
  'VALOR_ATENDIMENTO',
  'CPF_MATRICULA_ATENDENTE',
  'FORMA_PAGAMENTO',
  'MODALIDADE_PAGAMENTO'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      request.method !== 'POST' ||
      url.pathname !== '/ingest-csv-raw'
    ) {
      return baseApp.fetch(request, env, ctx);
    }

    if (!authorized(request, env)) {
      return json({ ok:false, error:'unauthorized' }, 401);
    }

    try {
      return await ingestCsvRaw(request, env, ctx);
    } catch (err) {
      return json({
        ok:false,
        error:err && err.message
          ? String(err.message)
          : String(err || 'raw_csv_upload_error')
      }, 500);
    }
  }
};

async function ingestCsvRaw(request, env, ctx) {
  const startedAt = Date.now();

  const fileId = clean(
    request.headers.get('X-AGF-File-Id')
  );

  const fileName = decodeHeader(
    request.headers.get('X-AGF-File-Name')
  );

  const fileModifiedAt = clean(
    request.headers.get('X-AGF-File-Modified-At')
  );

  if (!fileId || !fileName) {
    return json({
      ok:false,
      error:'file_metadata_required'
    }, 400);
  }

  const buffer = await request.arrayBuffer();

  if (!buffer.byteLength) {
    return json({
      ok:false,
      error:'empty_csv'
    }, 400);
  }

  const decoded = decodeCsvBytes(
    new Uint8Array(buffer)
  );

  const text = decoded.text;

  if (!text.trim()) {
    return json({
      ok:false,
      error:'empty_csv'
    }, 400);
  }

  // Compatível com o hash antigo do Apps Script:
  // SHA-256 do TEXTO decodificado em UTF-8.
  const fileHash = await sha256Text(text);

  const matrix = parseCsv(text, ';');

  if (!matrix.length || matrix.length < 2) {
    return json({
      ok:false,
      error:'csv_without_data'
    }, 400);
  }

  const headers = matrix[0].map(normalizeHeader);

  const sourceType = detectSource(headers);

  if (!sourceType) {
    return json({
      ok:false,
      error:'csv_source_not_detected'
    }, 400);
  }

  validateHeaders(headers, sourceType);

  let writeIndex = 0;

  for (let i = 1; i < matrix.length; i++) {
    let row = matrix[i];

    if (sourceType === 'CONSOLIDADOR') {
      row = repairConsolidadorRow(row, headers);
    }

    if (isBlankRow(row)) continue;

    if (
      sourceType === 'CONSOLIDADOR' &&
      isConsolidadorTotal(row, headers)
    ) {
      continue;
    }

    matrix[writeIndex] = row;
    writeIndex++;
  }

  matrix.length = writeIndex;

  const totalRows = matrix.length;

  if (!totalRows) {
    return json({
      ok:false,
      error:'csv_without_importable_rows'
    }, 400);
  }

  // Consulta o MESMO controle de importações já utilizado hoje.
  const checkPath =
    '/imports/check?fileId=' +
    encodeURIComponent(fileId) +
    '&hash=' +
    encodeURIComponent(fileHash);

  const checkResponse = await baseApp.fetch(
    makeInternalRequest(
      request,
      checkPath,
      'GET'
    ),
    env,
    ctx
  );

  const check = await readJson(checkResponse);

  if (!checkResponse.ok || !check || check.ok !== true) {
    return json({
      ok:false,
      error:'import_check_failed',
      detail:check || null
    }, checkResponse.status || 500);
  }

  if (check.completed) {
    return json({
      ok:true,
      duplicateFile:true,
      completed:true,
      sourceType,
      encoding:decoded.encoding,
      fileHash,
      totalRows,
      sentThisRun:0,
      insertedThisRun:0,
      stored:Number(
        check.import &&
        check.import.gravadas ||
        totalRows
      ),
      invalid:0,
      requests:0,
      elapsedMs:Date.now() - startedAt
    });
  }

  let offset = Math.max(
    0,
    Number(
      check.import &&
      check.import.recebidas ||
      0
    )
  );

  if (offset > totalRows) offset = 0;

  if (
    offset >= totalRows &&
    totalRows > 0
  ) {
    offset = Math.max(
      0,
      totalRows - RAW_CHUNK_ROWS
    );
  }

  let sentThisRun = 0;
  let insertedThisRun = 0;
  let invalid = 0;
  let requests = 0;

  let stored = Number(
    check.import &&
    check.import.gravadas ||
    0
  );

  let completed = false;

  while (offset < totalRows) {
    if (
      requests > 0 &&
      Date.now() - startedAt >= RAW_ROUND_MS
    ) {
      break;
    }

    const rows = rowsToObjects(
      matrix,
      headers,
      offset,
      RAW_CHUNK_ROWS
    );

    if (!rows.length) break;

    const final =
      offset + rows.length >= totalRows;

    const payload = {
      fileId,
      fileName,
      fileHash,
      fileModifiedAt,
      totalRows,
      offset,
      final,
      rows
    };

    // Chama internamente o MESMO /ingest atual.
    // Assim preservamos toda a lógica existente de
    // Atende, Consolidador, idempotência e rebuilds.
    const ingestResponse = await baseApp.fetch(
      makeInternalRequest(
        request,
        '/ingest',
        'POST',
        payload
      ),
      env,
      ctx
    );

    const result = await readJson(ingestResponse);

    if (
      !ingestResponse.ok ||
      !result ||
      result.ok !== true
    ) {
      return json({
        ok:false,
        error:
          result && result.error
            ? result.error
            : 'worker_ingest_failed',
        detail:result || null,
        sourceType,
        totalRows,
        offset,
        stored
      }, ingestResponse.status || 500);
    }

    sentThisRun += Number(
      result.received || 0
    );

    insertedThisRun += Number(
      result.inserted || 0
    );

    invalid += Number(
      result.invalid || 0
    );

    stored = Number(
      result.stored || stored || 0
    );

    completed = result.completed === true;
    requests++;

    offset += rows.length;

    if (completed) break;
  }

  return json({
    ok:true,
    duplicateFile:false,
    completed,
    sourceType,
    encoding:decoded.encoding,
    fileHash,
    totalRows,
    sentThisRun,
    insertedThisRun,
    stored,
    invalid,
    requests,
    status:completed
      ? 'processed'
      : 'partial_waiting_next_run',
    elapsedMs:Date.now() - startedAt
  });
}

function rowsToObjects(
  matrix,
  headers,
  offset,
  limit
) {
  const end = Math.min(
    matrix.length,
    offset + limit
  );

  const result = [];

  for (let i = offset; i < end; i++) {
    const row = matrix[i] || [];
    const obj = {};

    for (
      let column = 0;
      column < headers.length;
      column++
    ) {
      const value = row[column];

      obj[headers[column]] =
        value === null ||
        value === undefined
          ? ''
          : String(value);
    }

    result.push(obj);
  }

  return result;
}

function parseCsv(text, delimiter) {
  const rows = [];

  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }

      continue;
    }

    if (ch === '"' && field === '') {
      quoted = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      rows.push(row);

      row = [];
      field = '';

      continue;
    }

    if (ch !== '\r') {
      field += ch;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function decodeCsvBytes(bytes) {
  let text = new TextDecoder('utf-8')
    .decode(bytes)
    .replace(/^\uFEFF/, '');

  let encoding = 'UTF-8';

  const utfBroken = countChar(
    text,
    '\uFFFD'
  );

  if (utfBroken > 0) {
    const latin = new TextDecoder(
      'windows-1252'
    )
      .decode(bytes)
      .replace(/^\uFEFF/, '');

    const latinBroken = countChar(
      latin,
      '\uFFFD'
    );

    if (latinBroken < utfBroken) {
      text = latin;
      encoding = 'ISO-8859-1';
    }
  }

  return { text, encoding };
}

function countChar(text, value) {
  let count = 0;
  let pos = 0;

  while (true) {
    pos = text.indexOf(value, pos);

    if (pos < 0) return count;

    count++;
    pos += value.length;
  }
}

function normalizeHeader(value) {
  return String(value == null ? '' : value)
    .replace(/^\uFEFF/, '')
    .trim()
    .toUpperCase();
}

function detectSource(headers) {
  const has = name =>
    headers.indexOf(name) >= 0;

  if (
    has('ATENDIMENTO') &&
    has('CODIGO_OBJETO') &&
    has('DATA_POSTAGEM')
  ) {
    return 'ATENDE';
  }

  const venda = hasAny(
    headers,
    [
      'VENDA/PP.',
      'VENDA/PP',
      'VENDA_PP',
      'VENDA PP'
    ]
  );

  const cxat = hasAny(
    headers,
    [
      'CX./AT.',
      'CX./AT',
      'CX/AT',
      'CX_AT'
    ]
  );

  if (
    has('OBJETO') &&
    venda &&
    cxat
  ) {
    return 'CONSOLIDADOR';
  }

  return '';
}

function validateHeaders(
  headers,
  sourceType
) {
  if (sourceType === 'ATENDE') {
    const missing =
      REQUIRED_ATENDE.filter(
        header =>
          headers.indexOf(header) < 0
      );

    if (missing.length) {
      throw new Error(
        'CSV ATENDE sem cabecalhos: ' +
        missing.join(', ')
      );
    }

    return;
  }

  const specs = [
    ['OBJETO'],
    [
      'VENDA/PP.',
      'VENDA/PP',
      'VENDA_PP',
      'VENDA PP'
    ],
    [
      'CX./AT.',
      'CX./AT',
      'CX/AT',
      'CX_AT'
    ],
    [
      'CLIENTE',
      'RAZAO_SOCIAL',
      'RAZÃO_SOCIAL'
    ],
    ['ECT'],
    ['DATA'],
    ['VALOR']
  ];

  const missing = specs
    .filter(
      aliases =>
        !hasAny(headers, aliases)
    )
    .map(
      aliases => aliases[0]
    );

  if (missing.length) {
    throw new Error(
      'CSV CONSOLIDADOR sem cabecalhos: ' +
      missing.join(', ')
    );
  }
}

function hasAny(headers, aliases) {
  return aliases.some(
    alias =>
      headers.indexOf(alias) >= 0
  );
}

function repairConsolidadorRow(
  row,
  headers
) {
  const source = Array.isArray(row)
    ? row.slice()
    : [];

  if (source.length <= headers.length) {
    while (
      source.length < headers.length
    ) {
      source.push('');
    }

    return source;
  }

  const destIdx = headerIndex(
    headers,
    [
      'DESTINATARIO',
      'DESTINATÁRIO'
    ]
  );

  if (destIdx < 0) {
    return source.slice(
      0,
      headers.length
    );
  }

  const extra =
    source.length - headers.length;

  const merged = source
    .slice(
      destIdx,
      destIdx + extra + 1
    )
    .join(';');

  const fixed = source
    .slice(0, destIdx)
    .concat(
      [merged],
      source.slice(
        destIdx + extra + 1
      )
    );

  while (
    fixed.length < headers.length
  ) {
    fixed.push('');
  }

  return fixed.slice(
    0,
    headers.length
  );
}

function headerIndex(
  headers,
  aliases
) {
  for (
    let i = 0;
    i < aliases.length;
    i++
  ) {
    const index =
      headers.indexOf(aliases[i]);

    if (index >= 0) return index;
  }

  return -1;
}

function isBlankRow(row) {
  return !(row || []).some(
    value =>
      String(
        value == null ? '' : value
      ) !== ''
  );
}

function isConsolidadorTotal(
  row,
  headers
) {
  const objIndex =
    headerIndex(
      headers,
      ['OBJETO']
    );

  const object =
    objIndex >= 0
      ? clean(row[objIndex])
      : '';

  if (object) return false;

  return (row || []).some(
    value =>
      clean(value).toUpperCase() ===
      'TOTAL'
  );
}

async function sha256Text(text) {
  const bytes = new TextEncoder()
    .encode(String(text || ''));

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      bytes
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map(
      value =>
        value
          .toString(16)
          .padStart(2, '0')
    )
    .join('');
}

function makeInternalRequest(
  original,
  pathAndQuery,
  method,
  body
) {
  const url = new URL(original.url);

  const relative = new URL(
    pathAndQuery,
    'https://internal.invalid'
  );

  url.pathname = relative.pathname;
  url.search = relative.search;

  const headers = new Headers();

  const auth =
    original.headers.get(
      'Authorization'
    );

  if (auth) {
    headers.set(
      'Authorization',
      auth
    );
  }

  const options = {
    method,
    headers
  };

  if (
    body !== undefined &&
    body !== null
  ) {
    headers.set(
      'Content-Type',
      'application/json'
    );

    options.body =
      JSON.stringify(body);
  }

  return new Request(
    url.toString(),
    options
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function decodeHeader(value) {
  const text = String(
    value || ''
  );

  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function authorized(request, env) {
  return (
    !!env.ATENDE_API_TOKEN &&
    (
      request.headers.get(
        'Authorization'
      ) || ''
    ) ===
    `Bearer ${env.ATENDE_API_TOKEN}`
  );
}

function clean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  const text =
    String(value).trim();

  return /^(null|undefined)$/i
    .test(text)
      ? ''
      : text;
}

function json(body, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:{
        'content-type':
          'application/json; charset=utf-8',
        'cache-control':'no-store'
      }
    }
  );
}