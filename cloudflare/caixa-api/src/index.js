'use strict';

import { verifyAgfToken } from './auth.js';
import {
  buildInitResponse,
  importLegacySnapshot,
  importLegacyUnitSnapshot,
  unitAccessResponse,
  upsertClientFromApi,
  upsertEntriesFromApi
} from './db.js';
import {
  postLegacy,
  pullFullSnapshot,
  pullUnitSnapshot
} from './legacy.js';

const ADMIN_PROXY_ACTIONS = new Set([
  'processContaAzulQueue',
  'syncContaAzulLibrary',
  'retryPdfs'
]);

const LEGACY_WRITE_ACTIONS = new Set([
  'saveClient',
  'saveEntry',
  'saveBatch',
  'deleteEntry',
  'syncPixPayment',
  'setOpeningBalance',
  'createWithdrawal',
  'closeCash',
  ...ADMIN_PROXY_ACTIONS
]);

const UNIT_RECONCILE_ACTIONS = new Set([
  'setOpeningBalance',
  'createWithdrawal',
  'closeCash'
]);

function json(data, status = 200, request = null) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  applyCors(headers, request);

  return new Response(JSON.stringify(data), { status, headers });
}

function applyCors(headers, request) {
  const origin = String(request?.headers?.get('Origin') || '').trim();
  const allowed =
    !origin ||
    origin === 'https://minhaagenciaonline.com.br' ||
    origin === 'https://www.minhaagenciaonline.com.br' ||
    /^https:\/\/[a-z0-9-]+\.minhaagenciaonline\.pages\.dev$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

  if (allowed) {
    headers.set('Access-Control-Allow-Origin', origin || '*');
    headers.set('Vary', 'Origin');
  }

  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  headers.set('Access-Control-Max-Age', '86400');
}

function fail(error, request, status = 200) {
  console.error('[CAIXA_D1]', error?.stack || error?.message || String(error));
  return json({
    ok: false,
    error: error?.message || 'Não foi possível concluir a operação.',
    code: error?.code || 'INTERNAL_ERROR'
  }, status, request);
}

async function readBody(request) {
  const text = await request.text();

  if (!String(text || '').trim()) {
    const error = new Error('Corpo da requisição ausente.');
    error.code = 'EMPTY_REQUEST';
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    const error = new Error('Corpo da requisição inválido.');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

async function requireUser(request, env, body) {
  const bearer = String(request.headers.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const token = bearer || String(body?.st || '').trim();
  const user = await verifyAgfToken(token, env.AGF_AUTH_JWT_SECRET);

  if (!user) {
    const error = new Error('Sessão necessária. Faça login no Portal AGF e tente novamente.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  return { user, token };
}

function requireAdmin(user) {
  if (String(user?.role || '').toLowerCase() !== 'admin') {
    const error = new Error('Ação disponível somente para administrador.');
    error.code = 'ADMIN_REQUIRED';
    throw error;
  }
}

async function d1Ready(db) {
  try {
    const row = await db.prepare(
      `SELECT value FROM caixa_meta WHERE key = 'legacy_snapshot_version' LIMIT 1`
    ).first();
    return Boolean(row?.value);
  } catch (_) {
    return false;
  }
}

async function statusSnapshot(db) {
  const meta = await db.prepare(
    `SELECT key,value,updated_at FROM caixa_meta ORDER BY key`
  ).all();

  const tables = [
    'caixa_units',
    'caixa_user_units',
    'caixa_clients',
    'caixa_entries',
    'caixa_withdrawals',
    'caixa_closures',
    'caixa_closure_supplements',
    'caixa_conta_azul_queue'
  ];

  const counts = {};
  for (const table of tables) {
    const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first();
    counts[table] = Number(row?.total || 0);
  }

  return {
    ok: true,
    backend: 'D1_HYBRID',
    ready: await d1Ready(db),
    meta: meta.results || [],
    counts
  };
}

async function reconcileUnitFromLegacy(env, token, unitId) {
  const id = String(unitId || '').trim();
  if (!id) return;

  const snapshot = await pullUnitSnapshot(env, token, id);
  await importLegacyUnitSnapshot(env.DB, snapshot);
}

async function mirrorLegacyResult(env, ctx, action, body, result, token) {
  if (!result?.ok) return;

  if (action === 'saveClient' && result.client) {
    ctx.waitUntil(upsertClientFromApi(env.DB, result.client));
    return;
  }

  if (['saveEntry','deleteEntry','syncPixPayment'].includes(action) && result.entry) {
    ctx.waitUntil(upsertEntriesFromApi(env.DB, result.entry));
    return;
  }

  if (action === 'saveBatch' && Array.isArray(result.entries)) {
    ctx.waitUntil(upsertEntriesFromApi(env.DB, result.entries));
    return;
  }

  /*
   * Saldo, sangria e fechamento alteram mais de uma informação relacionada ao
   * caixa diário. Nesses casos o D1 é reconciliado pela visão oficial do
   * Apps Script antes de devolver sucesso ao frontend.
   */
  if (UNIT_RECONCILE_ACTIONS.has(action)) {
    await reconcileUnitFromLegacy(
      env,
      token,
      String(body?.unitId || '').trim()
    );
  }
}

async function handlePost(request, env, ctx) {
  const body = await readBody(request);
  const action = String(body?.action || '').trim();
  const auth = await requireUser(request, env, body);

  if (!action) {
    const error = new Error('Ação inválida ou ausente.');
    error.code = 'INVALID_ACTION';
    throw error;
  }

  if (action === 'ping') {
    return json({
      ok: true,
      service: 'agf-caixa-api',
      backend: 'D1_HYBRID',
      ready: await d1Ready(env.DB)
    }, 200, request);
  }

  if (action === 'adminSyncFromLegacy') {
    requireAdmin(auth.user);
    const snapshot = await pullFullSnapshot(env, auth.token);
    const imported = await importLegacySnapshot(env.DB, snapshot);
    return json({
      ok: true,
      backend: 'D1_HYBRID',
      imported
    }, 200, request);
  }

  if (action === 'd1Status') {
    requireAdmin(auth.user);
    return json(await statusSnapshot(env.DB), 200, request);
  }

  const ready = await d1Ready(env.DB);
  if (!ready) {
    const error = new Error(
      'A base D1 do Caixa ainda não foi preparada. Execute a sincronização inicial antes de usar esta homologação.'
    );
    error.code = 'D1_NOT_SEEDED';
    throw error;
  }

  if (action === 'unitAccess') {
    return json(
      await unitAccessResponse(env.DB, auth.user, body.unitId),
      200,
      request
    );
  }

  if (action === 'init' || action === 'summary') {
    return json(
      await buildInitResponse(env.DB, auth.user, body.unitId),
      200,
      request
    );
  }

  if (LEGACY_WRITE_ACTIONS.has(action)) {
    if (ADMIN_PROXY_ACTIONS.has(action)) requireAdmin(auth.user);

    const result = await postLegacy(env, {
      ...body,
      st: auth.token
    });

    if (result?.ok) {
      await mirrorLegacyResult(
        env,
        ctx,
        action,
        body,
        result,
        auth.token
      );
    }

    return json({
      ...result,
      backend: 'D1_HYBRID'
    }, 200, request);
  }

  const error = new Error('Ação ainda não disponível no backend D1.');
  error.code = 'D1_ACTION_NOT_IMPLEMENTED';
  throw error;
}

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === 'OPTIONS') {
        const headers = new Headers();
        applyCors(headers, request);
        return new Response(null, { status: 204, headers });
      }

      const url = new URL(request.url);

      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return json({
          ok: true,
          service: 'agf-caixa-api',
          backend: 'D1_HYBRID',
          ready: await d1Ready(env.DB),
          now: new Date().toISOString()
        }, 200, request);
      }

      if (request.method !== 'POST') {
        return json({
          ok: false,
          error: 'Método não permitido.',
          code: 'METHOD_NOT_ALLOWED'
        }, 405, request);
      }

      return await handlePost(request, env, ctx);
    } catch (error) {
      return fail(error, request);
    }
  }
};
