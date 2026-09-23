const DEFAULT_ORIGINS = [
  'https://minhaagenciaonline.com.br',
  'https://www.minhaagenciaonline.com.br',
  'http://localhost:8788',
  'http://127.0.0.1:8788'
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ORIGINS;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    'vary': 'Origin'
  };
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function cleanText(value, max = 500) {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function digits(value, max = 20) {
  return String(value ?? '').replace(/\D/g, '').slice(0, max);
}

function safeJson(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return fallback;
  }
}

function createCustomerId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const token = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `cus_${token}`;
}

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON invÃ¡lido.'), { status: 400 });
  }
}

async function requireAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('FaÃ§a login para continuar.'), { status: 401 });
  if (!env.AGF_AUTH_API_URL) throw Object.assign(new Error('ValidaÃ§Ã£o administrativa nÃ£o configurada.'), { status: 503 });

  const response = await fetch(env.AGF_AUTH_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'validate', token: match[1] }),
    redirect: 'follow'
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('NÃ£o foi possÃ­vel validar a sessÃ£o administrativa.'), { status: 503 });
  }

  if (!response.ok || !data || data.ok === false || !data.user) {
    throw Object.assign(new Error('SessÃ£o invÃ¡lida ou expirada.'), { status: 401 });
  }
  if (String(data.user.role || '') !== 'admin') {
    throw Object.assign(new Error('Acesso permitido somente para administrador.'), { status: 403 });
  }
  return data.user;
}

async function audit(env, actor, action, entityType, entityId, details = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_subject, action, entity_type, entity_id, details_json)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      String(actor.username || actor.email || actor.displayName || 'admin'),
      action,
      entityType,
      entityId || null,
      safeJson(details)
    ).run();
  } catch (error) {
    console.warn('[AGF_CORE] Falha ao registrar auditoria:', error?.message || error);
  }
}

async function listModules(env) {
  const result = await env.DB.prepare(
    `SELECT code, name, category, audience, route, description, active, display_order
       FROM modules
      ORDER BY display_order ASC, name ASC`
  ).all();
  return result.results || [];
}

async function listCustomers(url, env) {
  const q = cleanText(url.searchParams.get('q'), 120);
  const status = cleanText(url.searchParams.get('status'), 30).toUpperCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('c.status = ?');
    params.push(status);
  }
  if (q) {
    conditions.push(`(
      lower(c.legal_name) LIKE lower(?) OR
      lower(COALESCE(c.trade_name,'')) LIKE lower(?) OR
      COALESCE(c.document_number,'') LIKE ? OR
      lower(COALESCE(c.email,'')) LIKE lower(?)
    )`);
    const needle = `%${q}%`;
    params.push(needle, needle, needle, needle);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const statement = env.DB.prepare(
    `SELECT
       c.*,
       (
         SELECT COUNT(*)
         FROM customer_modules cm
         WHERE cm.customer_id = c.id
           AND cm.status IN ('ACTIVE','TRIAL')
       ) AS active_modules
     FROM customers c
     ${where}
     ORDER BY COALESCE(NULLIF(c.trade_name,''), c.legal_name) COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset);

  const result = await statement.all();
  return { customers: result.results || [], limit, offset };
}

async function getCustomer(customerId, env) {
  const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customerId).first();
  if (!customer) throw Object.assign(new Error('Cliente nÃ£o encontrado.'), { status: 404 });

  const modules = await env.DB.prepare(
    `SELECT
       m.code, m.name, m.category, m.audience, m.route, m.description, m.active,
       COALESCE(cm.status, 'DISABLED') AS customer_status,
       cm.activated_at, cm.expires_at, COALESCE(cm.configuration_json, '{}') AS configuration_json
     FROM modules m
     LEFT JOIN customer_modules cm
       ON cm.module_code = m.code AND cm.customer_id = ?
     ORDER BY m.display_order ASC, m.name ASC`
  ).bind(customerId).all();

  return { customer, modules: modules.results || [] };
}

async function createCustomer(request, env, actor) {
  const body = await parseBody(request);
  const legalName = cleanText(body.legalName, 200);
  if (!legalName) throw Object.assign(new Error('Informe a razÃ£o social ou nome do cliente.'), { status: 400 });

  const documentType = cleanText(body.documentType, 10).toUpperCase() || null;
  const documentNumber = digits(body.documentNumber, 20) || null;
  if (documentType && !['CNPJ','CPF','OTHER'].includes(documentType)) {
    throw Object.assign(new Error('Tipo de documento invÃ¡lido.'), { status: 400 });
  }

  const id = createCustomerId();
  const values = {
    id,
    status: cleanText(body.status, 20).toUpperCase() || 'ACTIVE',
    legalName,
    tradeName: cleanText(body.tradeName, 200) || null,
    documentType,
    documentNumber,
    email: cleanText(body.email, 200) || null,
    phone: digits(body.phone, 20) || null,
    postalCode: digits(body.postalCode, 8) || null,
    addressLine1: cleanText(body.addressLine1, 200) || null,
    addressNumber: cleanText(body.addressNumber, 30) || null,
    addressComplement: cleanText(body.addressComplement, 120) || null,
    district: cleanText(body.district, 120) || null,
    city: cleanText(body.city, 120) || null,
    state: cleanText(body.state, 2).toUpperCase() || null,
    country: cleanText(body.country, 2).toUpperCase() || 'BR',
    notes: cleanText(body.notes, 2000) || null
  };

  if (!['ACTIVE','INACTIVE','SUSPENDED','PROSPECT'].includes(values.status)) {
    throw Object.assign(new Error('Status do cliente invÃ¡lido.'), { status: 400 });
  }

  try {
    await env.DB.prepare(
      `INSERT INTO customers (
        id, status, legal_name, trade_name, document_type, document_number,
        email, phone, postal_code, address_line1, address_number, address_complement,
        district, city, state, country, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      values.id, values.status, values.legalName, values.tradeName, values.documentType,
      values.documentNumber, values.email, values.phone, values.postalCode,
      values.addressLine1, values.addressNumber, values.addressComplement,
      values.district, values.city, values.state, values.country, values.notes
    ).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      throw Object.assign(new Error('JÃ¡ existe um cliente com esse documento.'), { status: 409 });
    }
    throw error;
  }

  await audit(env, actor, 'CUSTOMER_CREATE', 'CUSTOMER', id, { status: values.status });
  return getCustomer(id, env);
}

const CUSTOMER_FIELDS = {
  status: ['status', (v) => cleanText(v, 20).toUpperCase()],
  legalName: ['legal_name', (v) => cleanText(v, 200)],
  tradeName: ['trade_name', (v) => cleanText(v, 200) || null],
  documentType: ['document_type', (v) => cleanText(v, 10).toUpperCase() || null],
  documentNumber: ['document_number', (v) => digits(v, 20) || null],
  email: ['email', (v) => cleanText(v, 200) || null],
  phone: ['phone', (v) => digits(v, 20) || null],
  postalCode: ['postal_code', (v) => digits(v, 8) || null],
  addressLine1: ['address_line1', (v) => cleanText(v, 200) || null],
  addressNumber: ['address_number', (v) => cleanText(v, 30) || null],
  addressComplement: ['address_complement', (v) => cleanText(v, 120) || null],
  district: ['district', (v) => cleanText(v, 120) || null],
  city: ['city', (v) => cleanText(v, 120) || null],
  state: ['state', (v) => cleanText(v, 2).toUpperCase() || null],
  country: ['country', (v) => cleanText(v, 2).toUpperCase() || 'BR'],
  notes: ['notes', (v) => cleanText(v, 2000) || null]
};

async function updateCustomer(customerId, request, env, actor) {
  await getCustomer(customerId, env);
  const body = await parseBody(request);
  const sets = [];
  const params = [];
  const changed = [];

  for (const [inputKey, [column, normalize]] of Object.entries(CUSTOMER_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, inputKey)) continue;
    const value = normalize(body[inputKey]);
    if (inputKey === 'legalName' && !value) throw Object.assign(new Error('RazÃ£o social/nome nÃ£o pode ficar vazio.'), { status: 400 });
    if (inputKey === 'status' && !['ACTIVE','INACTIVE','SUSPENDED','PROSPECT'].includes(value)) {
      throw Object.assign(new Error('Status do cliente invÃ¡lido.'), { status: 400 });
    }
    if (inputKey === 'documentType' && value && !['CNPJ','CPF','OTHER'].includes(value)) {
      throw Object.assign(new Error('Tipo de documento invÃ¡lido.'), { status: 400 });
    }
    sets.push(`${column} = ?`);
    params.push(value);
    changed.push(inputKey);
  }

  if (!sets.length) return getCustomer(customerId, env);
  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(customerId);

  try {
    await env.DB.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      throw Object.assign(new Error('JÃ¡ existe um cliente com esse documento.'), { status: 409 });
    }
    throw error;
  }

  await audit(env, actor, 'CUSTOMER_UPDATE', 'CUSTOMER', customerId, { fields: changed });
  return getCustomer(customerId, env);
}

async function setCustomerModules(customerId, request, env, actor) {
  await getCustomer(customerId, env);
  const body = await parseBody(request);
  if (!Array.isArray(body.modules)) throw Object.assign(new Error('Informe a lista de mÃ³dulos.'), { status: 400 });

  const requested = [...new Set(body.modules.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean))];
  const catalog = await listModules(env);
  const validCodes = new Set(catalog.map((item) => item.code));
  const invalid = requested.filter((code) => !validCodes.has(code));
  if (invalid.length) throw Object.assign(new Error(`MÃ³dulo invÃ¡lido: ${invalid.join(', ')}`), { status: 400 });

  const statements = [
    env.DB.prepare(
      `UPDATE customer_modules
          SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = ? AND status <> 'DISABLED'`
    ).bind(customerId)
  ];

  for (const code of requested) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO customer_modules (
           customer_id, module_code, status, activated_at, created_at, updated_at
         ) VALUES (?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(customer_id, module_code) DO UPDATE SET
           status = 'ACTIVE',
           activated_at = COALESCE(customer_modules.activated_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP`
      ).bind(customerId, code)
    );
  }

  await env.DB.batch(statements);
  await audit(env, actor, 'CUSTOMER_MODULES_SET', 'CUSTOMER', customerId, { modules: requested });
  return getCustomer(customerId, env);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === '/health' && method === 'GET') {
    return json({ ok: true, service: 'agf-core-api' });
  }

  const actor = await requireAdmin(request, env);

  if (url.pathname === '/api/modules' && method === 'GET') {
    return json({ ok: true, modules: await listModules(env) });
  }
  if (url.pathname === '/api/customers' && method === 'GET') {
    return json({ ok: true, ...(await listCustomers(url, env)) });
  }
  if (url.pathname === '/api/customers' && method === 'POST') {
    return json({ ok: true, ...(await createCustomer(request, env, actor)) }, 201);
  }

  const match = url.pathname.match(/^\/api\/customers\/([^/]+)(?:\/(modules))?$/);
  if (match) {
    const customerId = decodeURIComponent(match[1]);
    const suffix = match[2] || '';
    if (!suffix && method === 'GET') return json({ ok: true, ...(await getCustomer(customerId, env)) });
    if (!suffix && method === 'PATCH') return json({ ok: true, ...(await updateCustomer(customerId, request, env, actor)) });
    if (suffix === 'modules' && method === 'GET') return json({ ok: true, ...(await getCustomer(customerId, env)) });
    if (suffix === 'modules' && method === 'PUT') return json({ ok: true, ...(await setCustomerModules(customerId, request, env, actor)) });
  }

  return json({ ok: false, error: 'Rota nÃ£o encontrada.' }, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    try {
      const response = await handleApi(request, env);
      return withCors(response, request, env);
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status >= 500) console.error('[AGF_CORE]', error?.message || String(error), error?.stack || '');
      return withCors(json({
        ok: false,
        error: status >= 500 ? 'NÃ£o foi possÃ­vel concluir a operaÃ§Ã£o agora.' : String(error?.message || 'Erro inesperado.')
      }, status), request, env);
    }
  }
};


