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
    'access-control-allow-methods': 'GET,POST,OPTIONS',
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

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
}

function requireEnv(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) throw Object.assign(new Error(`Configuração ausente: ${key}`), { status: 503 });
  return value;
}

function normalizeShop(value) {
  let shop = String(value || '').trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, '').split('/')[0];
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw Object.assign(new Error('Domínio Shopify inválido.'), { status: 400 });
  }
  return shop;
}

function normalizeCustomerId(value) {
  const customerId = String(value || '').trim();
  if (!/^cus_[A-Za-z0-9_-]{8,80}$/.test(customerId)) {
    throw Object.assign(new Error('customer_id inválido.'), { status: 400 });
  }
  return customerId;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function addSeconds(seconds) {
  return new Date(Date.now() + Number(seconds || 0) * 1000).toISOString();
}

function isExpiringSoon(iso, seconds = 300) {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now() + seconds * 1000;
}

async function encryptionKey(env) {
  const raw = requireEnv(env, 'TOKEN_ENCRYPTION_KEY');
  let bytes;
  try {
    const binary = atob(raw);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw Object.assign(new Error('TOKEN_ENCRYPTION_KEY inválida.'), { status: 503 });
  }
  if (bytes.byteLength !== 32) {
    throw Object.assign(new Error('TOKEN_ENCRYPTION_KEY deve conter 32 bytes em Base64.'), { status: 503 });
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(value, env) {
  if (!value) return null;
  const key = await encryptionKey(env);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(String(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

async function decryptSecret(value, env) {
  if (!value) return null;
  const parts = String(value).split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Credencial criptografada inválida.');
  const key = await encryptionKey(env);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(parts[1]) },
    key,
    fromBase64Url(parts[2])
  );
  return new TextDecoder().decode(decrypted);
}

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return Array.from(signature).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function verifyOAuthHmac(url, env) {
  const received = url.searchParams.get('hmac') || '';
  if (!received) return false;
  const message = Array.from(url.searchParams.entries())
    .filter(([key]) => key !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const expected = await hmacHex(message, requireEnv(env, 'SHOPIFY_CLIENT_SECRET'));
  return constantTimeEqual(expected, received);
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Faça login na Plataforma AGF para continuar.'), { status: 401 });
  return match[1];
}

async function validateAgfCustomer(request, env, customerId) {
  const token = bearerToken(request);
  const base = requireEnv(env, 'AGF_CORE_API_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/api/customers/${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false || !data.customer) {
    const error = new Error((data && data.error) || 'Não foi possível validar o cliente no AGF Core.');
    error.status = response.status === 403 ? 403 : 401;
    throw error;
  }
  if (String(data.customer.status) !== 'ACTIVE') {
    throw Object.assign(new Error('Cliente não está ativo no AGF Core.'), { status: 403 });
  }
  const shopifyModule = (data.modules || []).find((item) => item.code === 'SHOPIFY');
  if (!shopifyModule || !['ACTIVE', 'TRIAL'].includes(shopifyModule.customer_status)) {
    throw Object.assign(new Error('O módulo Conector Shopify não está habilitado para este cliente.'), { status: 403 });
  }
  return data.customer;
}

async function exchangeAuthorizationCode(shop, code, env) {
  const body = new URLSearchParams({
    client_id: requireEnv(env, 'SHOPIFY_CLIENT_ID'),
    client_secret: requireEnv(env, 'SHOPIFY_CLIENT_SECRET'),
    code,
    expiring: '1'
  });
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    console.error('[SHOPIFY_OAUTH] token exchange falhou', response.status, data);
    throw new Error('Falha ao obter credenciais da Shopify.');
  }
  return data;
}

async function refreshOfflineToken(shop, refreshToken, env) {
  const body = new URLSearchParams({
    client_id: requireEnv(env, 'SHOPIFY_CLIENT_ID'),
    client_secret: requireEnv(env, 'SHOPIFY_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token || !data?.refresh_token) {
    console.error('[SHOPIFY_OAUTH] refresh falhou', shop, response.status, data);
    throw Object.assign(new Error('Credenciais Shopify expiradas. Reconecte a loja.'), { status: 401 });
  }
  return data;
}

async function saveTokenPair(shop, tokenData, env) {
  const accessEnc = await encryptSecret(tokenData.access_token, env);
  const refreshEnc = await encryptSecret(tokenData.refresh_token, env);
  const accessExpires = tokenData.expires_in ? addSeconds(tokenData.expires_in) : null;
  const refreshExpires = tokenData.refresh_token_expires_in ? addSeconds(tokenData.refresh_token_expires_in) : null;
  const scopes = String(tokenData.scope || env.SHOPIFY_SCOPES || '');

  await env.DB.prepare(
    `INSERT INTO shopify_tokens (
       shop_domain, access_token_enc, refresh_token_enc, access_token_expires_at,
       refresh_token_expires_at, scopes, token_type, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'OFFLINE_EXPIRING', CURRENT_TIMESTAMP)
     ON CONFLICT(shop_domain) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       access_token_expires_at = excluded.access_token_expires_at,
       refresh_token_expires_at = excluded.refresh_token_expires_at,
       scopes = excluded.scopes,
       token_type = 'OFFLINE_EXPIRING',
       updated_at = CURRENT_TIMESTAMP`
  ).bind(shop, accessEnc, refreshEnc, accessExpires, refreshExpires, scopes).run();

  return { accessExpires, refreshExpires, scopes };
}

async function accessTokenForShop(shop, env) {
  const row = await env.DB.prepare('SELECT * FROM shopify_tokens WHERE shop_domain = ?').bind(shop).first();
  if (!row) throw Object.assign(new Error('Loja Shopify sem credenciais.'), { status: 401 });

  if (!isExpiringSoon(row.access_token_expires_at, 300)) {
    return decryptSecret(row.access_token_enc, env);
  }

  if (!row.refresh_token_enc || (row.refresh_token_expires_at && new Date(row.refresh_token_expires_at).getTime() <= Date.now())) {
    throw Object.assign(new Error('Credenciais Shopify expiradas. Reconecte a loja.'), { status: 401 });
  }

  const refreshToken = await decryptSecret(row.refresh_token_enc, env);
  const refreshed = await refreshOfflineToken(shop, refreshToken, env);
  await saveTokenPair(shop, refreshed, env);
  return refreshed.access_token;
}

async function graphql(shop, accessToken, query, variables, env) {
  const version = requireEnv(env, 'SHOPIFY_API_VERSION');
  const response = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Shopify-Access-Token': accessToken
    },
    body: JSON.stringify({ query, variables: variables || {} })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.errors) {
    console.error('[SHOPIFY_GRAPHQL]', shop, response.status, data?.errors || data);
    throw Object.assign(new Error('Falha ao consultar a Shopify.'), { status: response.status === 401 ? 401 : 502 });
  }
  return data.data;
}

const SHOP_IDENTITY_QUERY = `
  query ShopIdentity {
    shop {
      id
      name
      myshopifyDomain
      primaryDomain { host }
    }
  }
`;

async function startOAuth(request, env) {
  const body = await parseBody(request);
  const customerId = normalizeCustomerId(body.customerId || body.customer_id);
  const shop = normalizeShop(body.shop);
  await validateAgfCustomer(request, env, customerId);

  const state = randomToken(32);
  const expiresAt = addSeconds(600);
  await env.DB.prepare(
    `INSERT INTO shopify_oauth_states (state, customer_id, shop_domain, expires_at)
     VALUES (?, ?, ?, ?)`
  ).bind(state, customerId, shop, expiresAt).run();

  const params = new URLSearchParams({
    client_id: requireEnv(env, 'SHOPIFY_CLIENT_ID'),
    scope: requireEnv(env, 'SHOPIFY_SCOPES'),
    redirect_uri: requireEnv(env, 'SHOPIFY_REDIRECT_URI'),
    state
  });
  return json({ ok: true, authorizeUrl: `https://${shop}/admin/oauth/authorize?${params.toString()}` });
}

async function oauthCallback(url, env) {
  const code = String(url.searchParams.get('code') || '');
  const state = String(url.searchParams.get('state') || '');
  const shop = normalizeShop(url.searchParams.get('shop'));
  if (!code || !state) throw Object.assign(new Error('Callback OAuth incompleto.'), { status: 400 });
  if (!(await verifyOAuthHmac(url, env))) throw Object.assign(new Error('Assinatura OAuth inválida.'), { status: 403 });

  const oauthState = await env.DB.prepare(
    `SELECT * FROM shopify_oauth_states WHERE state = ? AND shop_domain = ?`
  ).bind(state, shop).first();
  if (!oauthState || oauthState.used_at) throw Object.assign(new Error('Estado OAuth inválido ou já utilizado.'), { status: 403 });
  if (new Date(oauthState.expires_at).getTime() <= Date.now()) {
    throw Object.assign(new Error('Autorização OAuth expirada. Inicie novamente.'), { status: 403 });
  }

  const tokenData = await exchangeAuthorizationCode(shop, code, env);
  if (!tokenData.refresh_token) {
    throw new Error('A Shopify não retornou refresh_token para o token offline expirável.');
  }

  const identity = await graphql(shop, tokenData.access_token, SHOP_IDENTITY_QUERY, {}, env);
  const canonicalDomain = normalizeShop(identity.shop.myshopifyDomain || shop);
  if (canonicalDomain !== shop) throw new Error('Domínio retornado pela Shopify não corresponde à autorização.');

  const scopes = String(tokenData.scope || env.SHOPIFY_SCOPES || '');
  await env.DB.prepare(
    `INSERT INTO shopify_shops (
       shop_domain, customer_id, shop_gid, shop_name, primary_domain, status,
       scopes, installed_at, last_verified_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(shop_domain) DO UPDATE SET
       customer_id = excluded.customer_id,
       shop_gid = excluded.shop_gid,
       shop_name = excluded.shop_name,
       primary_domain = excluded.primary_domain,
       status = 'ACTIVE',
       scopes = excluded.scopes,
       uninstalled_at = NULL,
       last_verified_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    shop,
    oauthState.customer_id,
    identity.shop.id || null,
    identity.shop.name || null,
    identity.shop.primaryDomain?.host || null,
    scopes
  ).run();

  await saveTokenPair(shop, tokenData, env);
  await env.DB.prepare('UPDATE shopify_oauth_states SET used_at = CURRENT_TIMESTAMP WHERE state = ?').bind(state).run();

  const platform = requireEnv(env, 'PLATFORM_URL').replace(/\/$/, '');
  return Response.redirect(`${platform}/shopify/?connected=1&shop=${encodeURIComponent(shop)}`, 302);
}

async function listConnections(request, url, env) {
  const customerId = normalizeCustomerId(url.searchParams.get('customer_id'));
  await validateAgfCustomer(request, env, customerId);
  const result = await env.DB.prepare(
    `SELECT shop_domain, shop_gid, shop_name, primary_domain, status, scopes,
            installed_at, uninstalled_at, last_verified_at, updated_at
       FROM shopify_shops
      WHERE customer_id = ?
      ORDER BY updated_at DESC`
  ).bind(customerId).all();
  return json({ ok: true, shops: result.results || [] });
}

async function testConnection(request, env) {
  const body = await parseBody(request);
  const shop = normalizeShop(body.shop);
  const row = await env.DB.prepare('SELECT customer_id FROM shopify_shops WHERE shop_domain = ?').bind(shop).first();
  if (!row) throw Object.assign(new Error('Loja não vinculada.'), { status: 404 });
  await validateAgfCustomer(request, env, row.customer_id);
  const token = await accessTokenForShop(shop, env);
  const identity = await graphql(shop, token, SHOP_IDENTITY_QUERY, {}, env);
  await env.DB.prepare('UPDATE shopify_shops SET last_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE shop_domain = ?').bind(shop).run();
  return json({ ok: true, shop: identity.shop });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === '/health' && method === 'GET') {
    return json({ ok: true, service: 'agf-shopify-api', apiVersion: env.SHOPIFY_API_VERSION || null });
  }
  if (url.pathname === '/api/shopify/auth/start' && method === 'POST') return startOAuth(request, env);
  if (url.pathname === '/api/shopify/auth/callback' && method === 'GET') return oauthCallback(url, env);
  if (url.pathname === '/api/shopify/connections' && method === 'GET') return listConnections(request, url, env);
  if (url.pathname === '/api/shopify/test' && method === 'POST') return testConnection(request, env);

  return json({ ok: false, error: 'Rota não encontrada.' }, 404);
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
      if (status >= 500) console.error('[AGF_SHOPIFY]', error?.message || String(error), error?.stack || '');
      return withCors(json({
        ok: false,
        error: status >= 500 ? 'Não foi possível concluir a operação agora.' : String(error?.message || 'Erro inesperado.')
      }, status), request, env);
    }
  }
};
