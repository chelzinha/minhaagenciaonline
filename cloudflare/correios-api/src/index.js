// AGF Correios API - gateway único dos Correios para a Plataforma AGF.
// Público (sessão de admin validada no AGF Core): contas, teste de credenciais, simulação.
// Interno (X-AGF-Internal-Key, via service binding): cotação para Shopify e outros canais.

import { constantTimeEqual } from './crypto.js';
import { httpError } from './correios.js';
import { readAccount, publicAccount, saveAccount, checkAccount, syncFromCore } from './accounts.js';
import { quote, purgeExpiredCache } from './quote.js';

// ------------------------------------------------------------ HTTP helpers

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin'
  };
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw httpError('JSON inválido.', 400, 'INPUT');
  }
}

function normalizeCustomerId(value) {
  const id = String(value || '').trim();
  if (!/^cus_[A-Za-z0-9_-]{4,80}$/.test(id)) throw httpError('customer_id inválido.', 400, 'INPUT');
  return id;
}

// ------------------------------------------------------------ auth

// Sessão de admin: o AGF Core valida o bearer e devolve o cadastro com a Conta Correios.
async function loadCoreCustomer(request, env, customerId) {
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+.+/i.test(auth)) throw httpError('Faça login na Plataforma AGF para continuar.', 401, 'AUTH');
  if (!env.AGF_CORE || typeof env.AGF_CORE.fetch !== 'function') throw httpError('Binding AGF_CORE ausente.', 503, 'CONFIG');

  const response = await env.AGF_CORE.fetch(new Request(
    `https://agf-core.internal/api/customers/${encodeURIComponent(customerId)}`,
    { headers: { Authorization: auth } }
  ));
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false || !data.customer) {
    const status = [401, 403, 404].includes(response.status) ? response.status : 502;
    throw httpError((data && data.error) || 'Não foi possível validar o cliente no AGF Core.', status, 'CORE');
  }
  return data;
}

function requireInternal(request, env) {
  const expected = String(env.INTERNAL_KEY || '').trim();
  if (!expected) throw httpError('Configuração ausente: INTERNAL_KEY', 503, 'CONFIG');
  if (!constantTimeEqual(String(request.headers.get('X-AGF-Internal-Key') || '').trim(), expected)) {
    throw httpError('Acesso interno negado.', 403, 'AUTH');
  }
}

// ------------------------------------------------------------ handlers

async function getAccountHandler(request, env, customerId) {
  const core = await loadCoreCustomer(request, env, customerId);
  return json({ ok: true, account: publicAccount(await readAccount(env, customerId)), core: { correios: core.correios || null } });
}

async function saveAccountHandler(request, env, customerId) {
  const core = await loadCoreCustomer(request, env, customerId);
  const body = await parseBody(request);
  const account = await saveAccount(env, customerId, core, body, 'admin');
  return json({ ok: true, account: publicAccount(account) });
}

async function checkAccountHandler(request, env, customerId) {
  await loadCoreCustomer(request, env, customerId);
  return json({ ok: true, account: publicAccount(await checkAccount(env, customerId, 'admin')) });
}

async function syncAccountHandler(request, env, customerId) {
  const core = await loadCoreCustomer(request, env, customerId);
  return json({ ok: true, account: publicAccount(await syncFromCore(env, customerId, core, 'admin')) });
}

async function quoteFor(env, customerId, body, options) {
  const account = await readAccount(env, customerId);
  if (!account) throw httpError('Cliente sem conta Correios no gateway.', 404, 'NOT_CONFIGURED');
  const result = await quote(env, account, body, options);
  return { ok: true, customerId, ...result };
}

async function adminQuoteHandler(request, env) {
  const body = await parseBody(request);
  const customerId = normalizeCustomerId(body.customerId);
  await loadCoreCustomer(request, env, customerId);
  return json(await quoteFor(env, customerId, body, { fresh: body.fresh === true }));
}

async function internalQuoteHandler(request, env) {
  requireInternal(request, env);
  const body = await parseBody(request);
  const customerId = normalizeCustomerId(body.customerId);
  return json(await quoteFor(env, customerId, body, {}));
}

async function internalAccountHandler(request, env, customerId) {
  requireInternal(request, env);
  return json({ ok: true, account: publicAccount(await readAccount(env, customerId)) });
}

// ------------------------------------------------------------ router

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/health' && method === 'GET') return json({ ok: true, service: 'agf-correios-api' });

  const account = path.match(/^\/api\/correios\/accounts\/([^/]+)(\/check|\/sync)?$/);
  if (account) {
    const customerId = normalizeCustomerId(decodeURIComponent(account[1]));
    if (!account[2] && method === 'GET') return getAccountHandler(request, env, customerId);
    if (!account[2] && method === 'PUT') return saveAccountHandler(request, env, customerId);
    if (account[2] === '/check' && method === 'POST') return checkAccountHandler(request, env, customerId);
    if (account[2] === '/sync' && method === 'POST') return syncAccountHandler(request, env, customerId);
  }

  if (path === '/api/correios/quote' && method === 'POST') return adminQuoteHandler(request, env);

  if (path === '/internal/quote' && method === 'POST') {
    if (Math.random() < 0.02) ctx.waitUntil(purgeExpiredCache(env).catch(() => null));
    return internalQuoteHandler(request, env);
  }
  const internalAccount = path.match(/^\/internal\/accounts\/([^/]+)$/);
  if (internalAccount && method === 'GET') {
    return internalAccountHandler(request, env, normalizeCustomerId(decodeURIComponent(internalAccount[1])));
  }

  return json({ ok: false, error: 'Rota não encontrada.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), request, env);
    try {
      return withCors(await handle(request, env, ctx), request, env);
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status >= 500) console.error('[AGF_CORREIOS]', error?.code || '', error?.message || String(error));
      return withCors(json({
        ok: false,
        error: status >= 500 && !error?.code ? 'Não foi possível concluir a operação agora.' : String(error?.message || 'Erro inesperado.'),
        code: error?.code || undefined
      }, status), request, env);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(purgeExpiredCache(env));
  }
};
