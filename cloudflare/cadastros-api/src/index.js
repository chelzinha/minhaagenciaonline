import { clean, key, isSharedPortal, resolveIdentity } from './identity.js';

const FEED_SQL = `
  SELECT r.id, r.nome_remetente sender_name, cp.cliente_portal portal_name,
    COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END,
      po.local_codigo, a.local_padrao, c.local_padrao, '') local_code,
    r.numero_contrato contract_number, r.cartao_postagem posting_card,
    r.data_postagem_iso posted_at, r.valor_atendimento_num value_amount
  FROM atende_postagens_canonicas r
  LEFT JOIN atende_cliente_portal cp ON cp.raw_id = r.id
  LEFT JOIN atende_cliente_portal_local pcl ON pcl.cliente_portal_norm = cp.cliente_portal_norm AND pcl.ativo = 1
  LEFT JOIN atende_cliente_aliases ca ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c ON c.id = ca.cliente_id AND c.ativo = 1
  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1
  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id
  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id
  WHERE r.id > ? ORDER BY r.id LIMIT ?`;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).includes(origin) ? origin : '';
}
function cors(response, request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}
async function body(request) {
  try { return await request.json(); } catch { return fail('JSON inválido.'); }
}
async function sessionUser(request, env) {
  const token = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) fail('Faça login para continuar.', 401);
  if (!env.AGF_AUTH_API_URL) fail('Validação de sessão não configurada.', 503);
  let response;
  try {
    response = await fetch(env.AGF_AUTH_API_URL, {
      method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'validate', token }), redirect: 'follow'
    });
  } catch { fail('Não foi possível validar a sessão.', 503); }
  let data;
  try { data = await response.json(); } catch { fail('Resposta inválida da autenticação.', 503); }
  if (!response.ok || !data || data.ok === false || !data.user) fail('Sessão inválida.', 401);
  return data.user;
}
async function admin(request, env) {
  const user = await sessionUser(request,env);
  if (String(user.role || '').toLowerCase() !== 'admin') fail('Acesso restrito ao administrador.', 403);
  return clean(user.username || user.displayName || 'admin');
}
function customerId() { return `cus_${crypto.randomUUID()}`; }
async function directId(normalized) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`PORTAL:${normalized}`));
  return 'cus_p_' + [...new Uint8Array(bytes)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}
function auditStmt(env, actor, action, type, id, before = {}, after = {}) {
  return env.DB.prepare(`INSERT INTO audit_log(actor,action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,?,?,?)`)
    .bind(actor, action, type, String(id), JSON.stringify(before), JSON.stringify(after));
}
async function getAliases(env, specs) {
  const map = new Map();
  const names = [...new Set(specs.map(s => s.normalized).filter(Boolean))];
  for (let i = 0; i < names.length; i += 80) {
    const batch = names.slice(i, i + 80);
    const result = await env.DB.prepare(`SELECT kind,normalized_name,customer_id FROM customer_aliases WHERE normalized_name IN (${batch.map(() => '?').join(',')})`)
      .bind(...batch).all();
    for (const row of result.results || []) map.set(`${row.kind}:${row.normalized_name}`, row.customer_id);
  }
  return map;
}

async function syncPageUnlocked(env, limit = 200) {
  const state = await env.DB.prepare(`SELECT cursor_id,completed_passes FROM sync_state WHERE source_system='ATENDE'`).first();
  const cursor = Number(state?.cursor_id || 0);
  const feed = await env.ATENDE_DB.prepare(FEED_SQL).bind(cursor, limit).all();
  const rows = feed.results || [];
  if (!rows.length) {
    if (cursor > 0) await env.DB.prepare(`DELETE FROM source_postings WHERE source_system='ATENDE' AND last_seen_pass<?`).bind(Number(state.completed_passes) + 1).run();
    await env.DB.prepare(`UPDATE sync_state SET cursor_id=0,completed_passes=completed_passes+1,updated_at=CURRENT_TIMESTAMP WHERE source_system='ATENDE' AND cursor_id=?`).bind(cursor).run();
    return { read: 0, changed: 0, cursor: 0, completedPass: true };
  }
  const input = rows.map(r => ({
    sourceId: Number(r.id), portalName: clean(r.portal_name), portalNorm: key(r.portal_name),
    senderName: clean(r.sender_name), senderNorm: key(r.sender_name), localCode: clean(r.local_code),
    contractNumber: clean(r.contract_number), postingCard: clean(r.posting_card),
    postedAt: clean(r.posted_at), valueAmount: Number(r.value_amount || 0)
  }));
  const specs = input.map(r => ({ kind: isSharedPortal(r.portalNorm) ? 'SENDER' : 'PORTAL', normalized: isSharedPortal(r.portalNorm) ? r.senderNorm : r.portalNorm }));
  const aliases = await getAliases(env, specs);
  const newPortals = new Map();
  input.forEach(r => {
    if (r.portalNorm && !isSharedPortal(r.portalNorm) && !aliases.has(`PORTAL:${r.portalNorm}`)) newPortals.set(r.portalNorm, r.portalName);
  });
  const portalStatements = [];
  for (const [normalized, original] of newPortals) {
    const id = await directId(normalized);
    portalStatements.push(
      env.DB.prepare(`INSERT OR IGNORE INTO customers(id,canonical_name) VALUES(?,?)`).bind(id, original),
      env.DB.prepare(`INSERT OR IGNORE INTO customer_aliases(kind,normalized_name,original_name,customer_id,source) VALUES('PORTAL',?,?,?,'AUTO_PORTAL')`).bind(normalized, original, id)
    );
  }
  for (let i=0; i<portalStatements.length; i+=70) await env.DB.batch(portalStatements.slice(i,i+70));
  const refreshed = await getAliases(env, specs);
  const existing = new Map();
  for (let i = 0; i < input.length; i += 80) {
    const ids = input.slice(i, i + 80).map(r => r.sourceId);
    const r = await env.DB.prepare(`SELECT source_id,portal_norm,sender_norm,customer_id,resolution,source_fingerprint,last_seen_pass FROM source_postings WHERE source_system='ATENDE' AND source_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    for (const item of r.results || []) existing.set(Number(item.source_id), item);
  }
  const statements = [];
  for (const item of input) {
    const old = existing.get(item.sourceId);
    const fingerprint = JSON.stringify(item);
    const resolved = resolveIdentity(item.portalNorm, item.senderNorm, refreshed);
    if (old?.resolution === 'OVERRIDE' && old.portal_norm === item.portalNorm && old.sender_norm === item.senderNorm) {
      resolved.customerId = old.customer_id;
      resolved.resolution = 'OVERRIDE';
    }
    if (old?.source_fingerprint === fingerprint && old.customer_id === resolved.customerId && old.resolution === resolved.resolution && old.last_seen_pass === Number(state.completed_passes) + 1) continue;
    statements.push(env.DB.prepare(`INSERT INTO source_postings
      (source_id,portal_name,portal_norm,sender_name,sender_norm,local_code,contract_number,posting_card,posted_at,value_amount,customer_id,resolution,source_fingerprint,last_seen_pass)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_system,source_id) DO UPDATE SET
      portal_name=excluded.portal_name,portal_norm=excluded.portal_norm,sender_name=excluded.sender_name,sender_norm=excluded.sender_norm,
      local_code=excluded.local_code,contract_number=excluded.contract_number,posting_card=excluded.posting_card,
      posted_at=excluded.posted_at,value_amount=excluded.value_amount,customer_id=excluded.customer_id,
      resolution=excluded.resolution,source_fingerprint=excluded.source_fingerprint,last_seen_pass=excluded.last_seen_pass,updated_at=CURRENT_TIMESTAMP`)
      .bind(item.sourceId,item.portalName,item.portalNorm,item.senderName,item.senderNorm,item.localCode,
        item.contractNumber,item.postingCard,item.postedAt,item.valueAmount,resolved.customerId,resolved.resolution,fingerprint,Number(state.completed_passes)+1));
  }
  for (let i = 0; i < statements.length; i += 75) await env.DB.batch(statements.slice(i, i + 75));
  const next = input[input.length - 1].sourceId;
  await env.DB.prepare(`UPDATE sync_state SET cursor_id=?,updated_at=CURRENT_TIMESTAMP WHERE source_system='ATENDE' AND cursor_id=?`).bind(next,cursor).run();
  return { read: input.length, changed: statements.length, cursor: next, completedPass: false };
}

async function syncPage(env, limit = 200) {
  const owner = crypto.randomUUID();
  const lease = await env.DB.prepare(`UPDATE sync_state SET lease_until=unixepoch()+120,lease_owner=? WHERE source_system='ATENDE' AND lease_until<unixepoch() RETURNING cursor_id`).bind(owner).first();
  if (!lease) fail('Uma sincronização já está em andamento.', 409);
  try { return await syncPageUnlocked(env, limit); }
  finally { await env.DB.prepare(`UPDATE sync_state SET lease_until=0,lease_owner='' WHERE source_system='ATENDE' AND lease_owner=?`).bind(owner).run(); }
}

async function listCustomers(url, env) {
  const q = clean(url.searchParams.get('q')).slice(0, 100);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const r = await env.DB.prepare(`SELECT c.id,c.canonical_name,c.status,c.created_at,
    (SELECT COUNT(*) FROM source_postings p WHERE p.customer_id=c.id) posting_count
    FROM customers c WHERE (?='' OR c.canonical_name LIKE ? OR c.id LIKE ?)
    ORDER BY c.canonical_name COLLATE NOCASE LIMIT ? OFFSET ?`)
    .bind(q, `%${q}%`, `%${q}%`, limit, offset).all();
  return { customers: r.results || [], limit, offset };
}
async function getCustomer(id, env) {
  const customer = await env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(id).first();
  if (!customer) fail('Cliente não encontrado.', 404);
  const [alias, contracts, observed, locals] = await env.DB.batch([
    env.DB.prepare('SELECT id,kind,original_name,normalized_name,source FROM customer_aliases WHERE customer_id=? ORDER BY kind,original_name').bind(id),
    env.DB.prepare('SELECT id,contract_number,posting_card,note FROM customer_contracts WHERE customer_id=? ORDER BY contract_number,posting_card').bind(id),
    env.DB.prepare(`SELECT contract_number,posting_card,COUNT(*) postings FROM source_postings
      WHERE customer_id=? AND (contract_number<>'' OR posting_card<>'') GROUP BY contract_number,posting_card ORDER BY postings DESC LIMIT 100`).bind(id),
    env.DB.prepare(`SELECT local_code,COUNT(*) postings,ROUND(SUM(value_amount),2) amount FROM source_postings
      WHERE customer_id=? GROUP BY local_code ORDER BY postings DESC`).bind(id)
  ]);
  return { customer, aliases: alias.results || [], contracts: contracts.results || [],
    observedContracts: observed.results || [], locals: locals.results || [] };
}
async function createCustomer(request, env, actor) {
  const input = await body(request);
  const name = clean(input.canonicalName).slice(0, 200);
  if (!name) fail('Informe o nome padronizado.');
  const id = customerId();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO customers(id,canonical_name) VALUES(?,?)').bind(id, name),
    auditStmt(env, actor, 'CREATE', 'customer', id, {}, { canonicalName: name })
  ]);
  return { customer: await env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(id).first() };
}
async function updateCustomer(request, env, actor, id) {
  const previous = await env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(id).first();
  if (!previous) fail('Cliente não encontrado.', 404);
  const input = await body(request);
  const name = Object.hasOwn(input, 'canonicalName') ? clean(input.canonicalName).slice(0, 200) : previous.canonical_name;
  const status = Object.hasOwn(input, 'status') ? clean(input.status).toUpperCase() : previous.status;
  if (!name || !['ACTIVE','INACTIVE'].includes(status)) fail('Nome ou situação inválidos.');
  await env.DB.batch([
    env.DB.prepare('UPDATE customers SET canonical_name=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,status,id),
    auditStmt(env,actor,'UPDATE','customer',id,{ name:previous.canonical_name,status:previous.status },{ name,status })
  ]);
  return getCustomer(id, env);
}
async function saveAlias(request, env, actor) {
  const input = await body(request);
  const kind = clean(input.kind).toUpperCase();
  const name = clean(input.originalName).slice(0, 200);
  const normalized = key(name);
  const customerId = clean(input.customerId);
  if (!['PORTAL','SENDER'].includes(kind) || !normalized || !customerId) fail('Informe tipo, nome recebido e cliente.');
  if (kind === 'PORTAL' && isSharedPortal(normalized)) fail('Os portais compartilhados usam aliases de remetente.');
  const target = await env.DB.prepare('SELECT id FROM customers WHERE id=?').bind(customerId).first();
  if (!target) fail('Cliente não encontrado.',404);
  const old = await env.DB.prepare('SELECT id,customer_id FROM customer_aliases WHERE kind=? AND normalized_name=?').bind(kind,normalized).first();
  if (old && old.customer_id !== customerId && input.expectedCustomerId !== old.customer_id) fail('O nome já pertence a outro cliente. Atualize a tela antes de transferir.',409);
  const statements = [env.DB.prepare(`INSERT INTO customer_aliases(kind,normalized_name,original_name,customer_id,source)
    VALUES(?,?,?,?,'MANUAL') ON CONFLICT(kind,normalized_name) DO UPDATE SET
    original_name=excluded.original_name,customer_id=excluded.customer_id,source='MANUAL',updated_at=CURRENT_TIMESTAMP`)
    .bind(kind,normalized,name,customerId),
    auditStmt(env,actor,'ASSIGN','alias',`${kind}:${normalized}`,{ customerId:old?.customer_id || null },{ customerId })];
  await env.DB.batch(statements);
  const condition = kind === 'SENDER'
    ? `portal_norm IN ('BALCAO','GAS SHOPPING METRO','GAS SHOPPING CENTRO FASHION') AND sender_norm=?`
    : `portal_norm=? AND portal_norm NOT IN ('BALCAO','GAS SHOPPING METRO','GAS SHOPPING CENTRO FASHION')`;
  await env.DB.prepare(`UPDATE source_postings SET customer_id=?,resolution=?,updated_at=CURRENT_TIMESTAMP
    WHERE resolution<>'OVERRIDE' AND ${condition}`).bind(customerId,kind==='SENDER'?'SENDER_ALIAS':'PORTAL',normalized).run();
  return { kind, normalizedName: normalized, customerId };
}
async function lookupAlias(url, env) {
  const kind = clean(url.searchParams.get('kind')).toUpperCase();
  const normalized = key(url.searchParams.get('name'));
  if (!['PORTAL','SENDER'].includes(kind) || !normalized) fail('Informe tipo e nome recebido.');
  const alias = await env.DB.prepare(`SELECT a.customer_id,c.canonical_name FROM customer_aliases a JOIN customers c ON c.id=a.customer_id WHERE a.kind=? AND a.normalized_name=?`).bind(kind,normalized).first();
  return { alias: alias || null };
}
async function listReview(url, env) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const q = clean(url.searchParams.get('q')).slice(0, 100);
  const rows = await env.DB.prepare(`SELECT portal_norm,sender_norm,MAX(portal_name) portal_name,
    MAX(sender_name) sender_name,COUNT(*) postings,COUNT(DISTINCT local_code) local_count,
    MAX(local_code) sample_local,MAX(contract_number) sample_contract,MAX(posting_card) sample_card,
    MIN(source_id) first_source_id FROM source_postings WHERE resolution='PENDING'
    AND (?='' OR portal_name LIKE ? OR sender_name LIKE ?)
    GROUP BY portal_norm,sender_norm ORDER BY postings DESC,portal_norm,sender_norm LIMIT ? OFFSET ?`)
    .bind(q,`%${q}%`,`%${q}%`,limit,offset).all();
  return { pending: rows.results || [], limit, offset };
}
async function listPostingIdentities(url, env) {
  const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
  const data = await env.DB.prepare(`SELECT p.source_id,p.customer_id,c.canonical_name,p.local_code,p.resolution
    FROM source_postings p LEFT JOIN customers c ON c.id=p.customer_id
    WHERE p.source_system='ATENDE' AND p.source_id>? ORDER BY p.source_id LIMIT ?`).bind(after,limit).all();
  const postings=data.results || [];
  return { postings, nextAfter:postings.length ? postings[postings.length-1].source_id : null };
}
async function overridePosting(request, env, actor, id) {
  const input = await body(request);
  const target = await env.DB.prepare('SELECT id FROM customers WHERE id=?').bind(clean(input.customerId)).first();
  const current = await env.DB.prepare(`SELECT customer_id,resolution FROM source_postings WHERE source_system='ATENDE' AND source_id=?`).bind(id).first();
  if (!current) fail('Postagem não encontrada.',404);
  if (!target) fail('Cliente não encontrado.',404);
  await env.DB.batch([
    env.DB.prepare(`UPDATE source_postings SET customer_id=?,resolution='OVERRIDE',updated_at=CURRENT_TIMESTAMP WHERE source_system='ATENDE' AND source_id=?`).bind(target.id,id),
    auditStmt(env,actor,'OVERRIDE','posting',id,{customerId:current.customer_id,resolution:current.resolution},{customerId:target.id})
  ]);
  return { sourceId:id, customerId:target.id };
}
async function addContract(request, env, actor) {
  const input = await body(request);
  const customerId = clean(input.customerId), number = clean(input.contractNumber).toUpperCase();
  const card = clean(input.postingCard).toUpperCase(), note = clean(input.note).slice(0, 500);
  if (!customerId || (!number && !card)) fail('Informe cliente e número do contrato ou cartão postagem.');
  if (!await env.DB.prepare('SELECT id FROM customers WHERE id=?').bind(customerId).first()) fail('Cliente não encontrado.',404);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO customer_contracts(customer_id,contract_number,posting_card,note) VALUES(?,?,?,?)
      ON CONFLICT(customer_id,contract_number,posting_card) DO UPDATE SET note=excluded.note,updated_at=CURRENT_TIMESTAMP`).bind(customerId,number,card,note),
    auditStmt(env,actor,'LINK','contract',`${customerId}:${number}:${card}`,{},{customerId,number,card,note})
  ]);
  return { customerId, contractNumber:number, postingCard:card };
}
async function handler(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/health' && method === 'GET') return json({ok:true,service:'agf-cadastros-api'});
  if (path === '/api/v1/postings' && method === 'GET') {
    const user=await sessionUser(request,env);
    if (user.role !== 'admin' && !(user.apps || []).includes('crm')) fail('Acesso restrito ao CRM.',403);
    return json({ok:true,...await listPostingIdentities(url,env)});
  }
  const actor = await admin(request, env);
  if (path === '/api/status' && method === 'GET') {
    const [state, counts] = await env.DB.batch([
      env.DB.prepare(`SELECT * FROM sync_state WHERE source_system='ATENDE'`),
      env.DB.prepare(`SELECT COUNT(*) total,COUNT(CASE WHEN resolution='PENDING' THEN 1 END) pending FROM source_postings`)
    ]);
    return json({ok:true,sync:state.results?.[0],postings:counts.results?.[0]});
  }
  if (path === '/api/sync' && method === 'POST') return json({ok:true,...await syncPage(env)});
  if (path === '/api/customers' && method === 'GET') return json({ok:true,...await listCustomers(url,env)});
  if (path === '/api/customers' && method === 'POST') return json({ok:true,...await createCustomer(request,env,actor)},201);
  const customer = path.match(/^\/api\/customers\/([^/]+)$/);
  if (customer && method === 'GET') return json({ok:true,...await getCustomer(decodeURIComponent(customer[1]),env)});
  if (customer && method === 'PATCH') return json({ok:true,...await updateCustomer(request,env,actor,decodeURIComponent(customer[1]))});
  if (path === '/api/aliases' && method === 'POST') return json({ok:true,...await saveAlias(request,env,actor)});
  if (path === '/api/aliases/lookup' && method === 'GET') return json({ok:true,...await lookupAlias(url,env)});
  if (path === '/api/contracts' && method === 'POST') return json({ok:true,...await addContract(request,env,actor)});
  if (path === '/api/review' && method === 'GET') return json({ok:true,...await listReview(url,env)});
  const posting = path.match(/^\/api\/postings\/(\d+)\/resolve$/);
  if (posting && method === 'POST') return json({ok:true,...await overridePosting(request,env,actor,Number(posting[1]))});
  return json({ok:false,error:'Rota não encontrada.'},404);
}
export default {
  async fetch(request,env) {
    if (request.method === 'OPTIONS') return cors(new Response(null,{status:204}),request,env);
    try { return cors(await handler(request,env),request,env); }
    catch (error) {
      if ((error.status || 500) >= 500) console.error('[CADASTROS]',error);
      return cors(json({ok:false,error:(error.status || 500)>=500?'Falha ao processar solicitação.':error.message},error.status || 500),request,env);
    }
  },
  async scheduled(_event,env,ctx) { ctx.waitUntil((async () => {
    for (let i=0; i<20; i++) {
      const result = await syncPage(env);
      if (result.completedPass) break;
    }
  })()); }
};
