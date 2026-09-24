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

function normalizeLimit(value, fallback = 20, max = 50) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function normalizeOrderId(value) {
  const orderId = String(value || '').trim();
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId)) {
    throw Object.assign(new Error('order_id Shopify inválido.'), { status: 400 });
  }
  return orderId;
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
  const received = String(url.searchParams.get('hmac') || '');
  if (!received) return false;

  const secret = requireEnv(env, 'SHOPIFY_CLIENT_SECRET');
  const params = Object.fromEntries(
    Array.from(url.searchParams.entries())
      .filter(([key]) => key !== 'hmac')
  );

  const message = Object.entries(params)
    .sort()
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const expected = await hmacHex(message, secret);
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
  const path = `/api/customers/${encodeURIComponent(customerId)}`;
  const init = {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  };

  let response;

  if (env.AGF_CORE && typeof env.AGF_CORE.fetch === 'function') {
    response = await env.AGF_CORE.fetch(
      new Request(`https://agf-core.internal${path}`, init)
    );
  } else {
    const base = requireEnv(env, 'AGF_CORE_API_URL').replace(/\/$/, '');
    response = await fetch(`${base}${path}`, init);
  }

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    console.error('[AGF_CORE_UPSTREAM]', 'Resposta não JSON', response.status, raw.slice(0, 300));
  }

  if (!response.ok || !data || data.ok === false || !data.customer) {
    const error = new Error((data && data.error) || 'Não foi possível validar o cliente no AGF Core.');
    error.status = [401, 403, 404].includes(response.status) ? response.status : 502;
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

async function exchangeClientCredentials(shop, env) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: requireEnv(env, 'SHOPIFY_CLIENT_ID'),
    client_secret: requireEnv(env, 'SHOPIFY_CLIENT_SECRET')
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
    console.error('[SHOPIFY_CLIENT_CREDENTIALS]', shop, response.status, data);
    const message = data?.error_description || data?.error || 'Não foi possível autenticar a loja de desenvolvimento.';
    throw Object.assign(new Error(message), { status: response.status === 401 ? 401 : 502 });
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

async function tokenRecord(tokenData, env, tokenType) {
  return {
    accessEnc: await encryptSecret(tokenData.access_token, env),
    refreshEnc: await encryptSecret(tokenData.refresh_token, env),
    accessExpires: tokenData.expires_in ? addSeconds(tokenData.expires_in) : null,
    refreshExpires: tokenData.refresh_token_expires_in ? addSeconds(tokenData.refresh_token_expires_in) : null,
    scopes: String(tokenData.scope || env.SHOPIFY_SCOPES || ''),
    tokenType
  };
}

function tokenUpsertStatement(env, shop, token) {
  return env.DB.prepare(
    `INSERT INTO shopify_tokens (
       shop_domain, access_token_enc, refresh_token_enc, access_token_expires_at,
       refresh_token_expires_at, scopes, token_type, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(shop_domain) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       access_token_expires_at = excluded.access_token_expires_at,
       refresh_token_expires_at = excluded.refresh_token_expires_at,
       scopes = excluded.scopes,
       token_type = excluded.token_type,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    shop,
    token.accessEnc,
    token.refreshEnc,
    token.accessExpires,
    token.refreshExpires,
    token.scopes,
    token.tokenType
  );
}

function shopUpsertStatement(env, shop, customerId, identity, scopes) {
  return env.DB.prepare(
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
    customerId,
    identity.shop.id || null,
    identity.shop.name || null,
    identity.shop.primaryDomain?.host || null,
    scopes
  );
}

async function saveTokenPair(shop, tokenData, env, tokenType = 'OFFLINE_EXPIRING') {
  const token = await tokenRecord(tokenData, env, tokenType);
  await tokenUpsertStatement(env, shop, token).run();
  return {
    accessExpires: token.accessExpires,
    refreshExpires: token.refreshExpires,
    scopes: token.scopes,
    tokenType: token.tokenType
  };
}

async function saveShopAndToken(shop, customerId, identity, tokenData, env, tokenType) {
  const token = await tokenRecord(tokenData, env, tokenType);
  await env.DB.batch([
    shopUpsertStatement(env, shop, customerId, identity, token.scopes),
    tokenUpsertStatement(env, shop, token)
  ]);
  return token;
}

async function accessTokenForShop(shop, env) {
  const row = await env.DB.prepare('SELECT * FROM shopify_tokens WHERE shop_domain = ?').bind(shop).first();
  if (!row) throw Object.assign(new Error('Loja Shopify sem credenciais.'), { status: 401 });

  if (!isExpiringSoon(row.access_token_expires_at, 300)) {
    return decryptSecret(row.access_token_enc, env);
  }

  if (row.token_type === 'CLIENT_CREDENTIALS') {
    const renewed = await exchangeClientCredentials(shop, env);
    await saveTokenPair(shop, renewed, env, 'CLIENT_CREDENTIALS');
    return renewed.access_token;
  }

  if (!row.refresh_token_enc || (row.refresh_token_expires_at && new Date(row.refresh_token_expires_at).getTime() <= Date.now())) {
    throw Object.assign(new Error('Credenciais Shopify expiradas. Reconecte a loja.'), { status: 401 });
  }

  const refreshToken = await decryptSecret(row.refresh_token_enc, env);
  const refreshed = await refreshOfflineToken(shop, refreshToken, env);
  await saveTokenPair(shop, refreshed, env, 'OFFLINE_EXPIRING');
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
    const denied = Array.isArray(data?.errors)
      ? data.errors.find((item) => item?.extensions?.code === 'ACCESS_DENIED')
      : null;
    if (denied) {
      throw Object.assign(new Error('A Shopify bloqueou o acesso aos dados solicitados. Verifique as permissões de dados protegidos do app.'), { status: 403 });
    }
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

const RECENT_ORDERS_QUERY = `
  query RecentOrders($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        legacyResourceId
        name
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 20) {
          nodes {
            id
            name
            quantity
            sku
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const ORDER_DETAIL_QUERY = `
  query OrderDetail($id: ID!) {
    order(id: $id) {
      id
      legacyResourceId
      name
      createdAt
      processedAt
      displayFinancialStatus
      displayFulfillmentStatus
      requiresShipping
      currentTotalWeight
      email
      phone
      note
      customAttributes {
        key
        value
      }
      localizedFields(first: 5) {
        edges {
          node {
            countryCode
            purpose
            title
            value
          }
        }
      }
      shippingAddress {
        name
        firstName
        lastName
        company
        address1
        address2
        city
        province
        provinceCode
        zip
        country
        countryCodeV2
        phone
      }
      shippingLine {
        title
        code
        source
        carrierIdentifier
        originalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      lineItems(first: 50) {
        nodes {
          id
          name
          title
          quantity
          currentQuantity
          sku
          requiresShipping
          customAttributes {
            key
            value
          }
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

function normalizedAttributeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function documentRecord(value, sourceKey, source) {
  const text = String(value || '').trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  return {
    value: text,
    digits: digits || null,
    type: digits.length === 11 ? 'CPF' : (digits.length === 14 ? 'CNPJ' : null),
    sourceKey: sourceKey || null,
    source
  };
}

function findDocument(localizedFields, customAttributes) {
  const localized = (localizedFields?.edges || [])
    .map((edge) => edge?.node)
    .filter(Boolean);

  const taxField = localized.find((field) => {
    const title = normalizedAttributeKey(field?.title);
    return String(field?.countryCode || '').toUpperCase() === 'BR' &&
      (String(field?.purpose || '').toUpperCase() === 'TAX' || title === 'CPFCNPJ' || title === 'CPF' || title === 'CNPJ');
  });

  if (taxField?.value) {
    return documentRecord(taxField.value, taxField.title || taxField.purpose || 'TAX_CREDENTIAL_BR', 'localizedFields');
  }

  const accepted = new Set(['CPFCNPJ', 'CPF', 'CNPJ']);
  const item = (customAttributes || []).find((attribute) => accepted.has(normalizedAttributeKey(attribute?.key)));
  if (!item?.value) return null;
  return documentRecord(item.value, item.key || null, 'customAttributes');
}

function normalizeOrderDetail(order) {
  const address = order.shippingAddress || null;
  const document = findDocument(order.localizedFields, order.customAttributes);
  const shippingLine = order.shippingLine || null;
  const localizedFields = (order.localizedFields?.edges || [])
    .map((edge) => edge?.node)
    .filter(Boolean);
  const lineItems = (order.lineItems?.nodes || []).map((item) => ({
    id: item.id,
    name: item.name,
    title: item.title || null,
    quantity: item.quantity,
    currentQuantity: item.currentQuantity,
    sku: item.sku || null,
    requiresShipping: Boolean(item.requiresShipping),
    unitPrice: item.originalUnitPriceSet?.shopMoney || null,
    customAttributes: item.customAttributes || []
  }));

  return {
    order: {
      id: order.id,
      legacyResourceId: order.legacyResourceId || null,
      name: order.name,
      createdAt: order.createdAt,
      processedAt: order.processedAt || null,
      financialStatus: order.displayFinancialStatus || null,
      fulfillmentStatus: order.displayFulfillmentStatus || null,
      requiresShipping: Boolean(order.requiresShipping),
      total: order.totalPriceSet?.shopMoney || null,
      totalWeightGrams: Number(order.currentTotalWeight || 0),
      note: order.note || null,
      customAttributes: order.customAttributes || [],
      localizedFields,
      lineItems
    },
    shipmentDraft: {
      recipient: {
        name: address?.name || [address?.firstName, address?.lastName].filter(Boolean).join(' ') || null,
        email: order.email || null,
        phone: address?.phone || order.phone || null,
        document
      },
      address: address ? {
        company: address.company || null,
        address1: address.address1 || null,
        address2: address.address2 || null,
        city: address.city || null,
        province: address.province || null,
        provinceCode: address.provinceCode || null,
        postalCode: address.zip || null,
        country: address.country || null,
        countryCode: address.countryCodeV2 || null
      } : null,
      shipping: shippingLine ? {
        title: shippingLine.title || null,
        code: shippingLine.code || null,
        source: shippingLine.source || null,
        carrierIdentifier: shippingLine.carrierIdentifier || null,
        price: shippingLine.originalPriceSet?.shopMoney || null
      } : null,
      package: {
        weightGrams: Number(order.currentTotalWeight || 0),
        dimensions: null,
        dimensionsSource: null
      },
      items: lineItems
    }
  };
}

async function connectOwnOrgStore(request, env, customerId, shop) {
  await validateAgfCustomer(request, env, customerId);

  const tokenData = await exchangeClientCredentials(shop, env);
  const identity = await graphql(shop, tokenData.access_token, SHOP_IDENTITY_QUERY, {}, env);
  const canonicalDomain = normalizeShop(identity.shop.myshopifyDomain || shop);

  if (canonicalDomain !== shop) {
    throw new Error('Domínio retornado pela Shopify não corresponde à loja informada.');
  }

  await saveShopAndToken(shop, customerId, identity, tokenData, env, 'CLIENT_CREDENTIALS');

  return json({
    ok: true,
    connected: true,
    authMode: 'client_credentials',
    shop: identity.shop
  });
}

async function startOAuth(request, env) {
  const body = await parseBody(request);
  const customerId = normalizeCustomerId(body.customerId || body.customer_id);
  const shop = normalizeShop(body.shop);

  if (String(env.SHOPIFY_AUTH_MODE || '').toLowerCase() === 'client_credentials') {
    return connectOwnOrgStore(request, env, customerId, shop);
  }

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

  await saveShopAndToken(shop, oauthState.customer_id, identity, tokenData, env, 'OFFLINE_EXPIRING');
  await env.DB.prepare('UPDATE shopify_oauth_states SET used_at = CURRENT_TIMESTAMP WHERE state = ?').bind(state).run();

  const platform = requireEnv(env, 'PLATFORM_URL').replace(/\/$/, '');
  return Response.redirect(`${platform}/shopify/?connected=1&shop=${encodeURIComponent(shop)}`, 302);
}

async function listConnections(request, url, env) {
  const customerId = normalizeCustomerId(url.searchParams.get('customer_id'));
  await validateAgfCustomer(request, env, customerId);
  const result = await env.DB.prepare(
    `SELECT s.shop_domain, s.shop_gid, s.shop_name, s.primary_domain, s.status, s.scopes,
            s.installed_at, s.uninstalled_at, s.last_verified_at, s.updated_at,
            CASE WHEN t.shop_domain IS NULL THEN 0 ELSE 1 END AS credential_ready
       FROM shopify_shops s
       LEFT JOIN shopify_tokens t ON t.shop_domain = s.shop_domain
      WHERE s.customer_id = ?
      ORDER BY s.updated_at DESC`
  ).bind(customerId).all();
  return json({ ok: true, shops: result.results || [] });
}

async function listOrders(request, url, env) {
  const shop = normalizeShop(url.searchParams.get('shop'));
  const limit = normalizeLimit(url.searchParams.get('limit'), 20, 50);
  const row = await env.DB.prepare(
    'SELECT customer_id, status FROM shopify_shops WHERE shop_domain = ?'
  ).bind(shop).first();

  if (!row) throw Object.assign(new Error('Loja não vinculada.'), { status: 404 });
  if (row.status !== 'ACTIVE') throw Object.assign(new Error('Loja Shopify não está ativa.'), { status: 409 });

  await validateAgfCustomer(request, env, row.customer_id);
  const token = await accessTokenForShop(shop, env);
  const data = await graphql(shop, token, RECENT_ORDERS_QUERY, { first: limit }, env);
  const nodes = Array.isArray(data?.orders?.nodes) ? data.orders.nodes : [];

  const orders = nodes.map((order) => ({
    id: order.id,
    legacyResourceId: order.legacyResourceId || null,
    name: order.name,
    createdAt: order.createdAt,
    processedAt: order.processedAt || null,
    financialStatus: order.displayFinancialStatus || null,
    fulfillmentStatus: order.displayFulfillmentStatus || null,
    total: order.totalPriceSet?.shopMoney || null,
    lineItems: (order.lineItems?.nodes || []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      sku: item.sku || null,
      unitPrice: item.originalUnitPriceSet?.shopMoney || null
    }))
  }));

  await env.DB.prepare(
    'UPDATE shopify_shops SET last_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE shop_domain = ?'
  ).bind(shop).run();

  return json({
    ok: true,
    shop,
    orders,
    pageInfo: data?.orders?.pageInfo || { hasNextPage: false, endCursor: null }
  });
}

async function getOrderDetail(request, url, env) {
  const shop = normalizeShop(url.searchParams.get('shop'));
  const orderId = normalizeOrderId(url.searchParams.get('order_id'));
  const row = await env.DB.prepare(
    'SELECT customer_id, status FROM shopify_shops WHERE shop_domain = ?'
  ).bind(shop).first();

  if (!row) throw Object.assign(new Error('Loja não vinculada.'), { status: 404 });
  if (row.status !== 'ACTIVE') throw Object.assign(new Error('Loja Shopify não está ativa.'), { status: 409 });

  await validateAgfCustomer(request, env, row.customer_id);
  const token = await accessTokenForShop(shop, env);
  const data = await graphql(shop, token, ORDER_DETAIL_QUERY, { id: orderId }, env);
  if (!data?.order) throw Object.assign(new Error('Pedido não encontrado na Shopify.'), { status: 404 });

  await env.DB.prepare(
    'UPDATE shopify_shops SET last_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE shop_domain = ?'
  ).bind(shop).run();

  const detail = normalizeOrderDetail(data.order);
  return json({
    ok: true,
    shop,
    ...detail
  });
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
    return json({
      ok: true,
      service: 'agf-shopify-api',
      apiVersion: env.SHOPIFY_API_VERSION || null,
      authMode: env.SHOPIFY_AUTH_MODE || 'oauth'
    });
  }
  if (url.pathname === '/api/shopify/auth/start' && method === 'POST') return startOAuth(request, env);
  if (url.pathname === '/api/shopify/auth/callback' && method === 'GET') return oauthCallback(url, env);
  if (url.pathname === '/api/shopify/connections' && method === 'GET') return listConnections(request, url, env);
  if (url.pathname === '/api/shopify/orders' && method === 'GET') return listOrders(request, url, env);
  if (url.pathname === '/api/shopify/order' && method === 'GET') return getOrderDetail(request, url, env);
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
