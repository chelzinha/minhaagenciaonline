const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export default {
  async fetch(request, env, context) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (request.method === 'GET' && path.endsWith('/health')) {
        return json({
          ok: true,
          service: 'agf-santander-pix',
          mode: env.SANTANDER_MODE || 'disabled',
          hasState: Boolean(env.PIX_STATE),
          hasMtls: Boolean(env.SANTANDER_MTLS),
          configured: Boolean(env.SANTANDER_CLIENT_ID && env.SANTANDER_CLIENT_SECRET)
        });
      }

      if (request.method === 'POST' && path.endsWith('/create')) {
        const user = await requireUser(request, env);
        const body = await readJson(request);
        const result = await createCharge(body, user, env, context);
        return json({ ok: true, charge: result }, 201);
      }

      const statusMatch = path.match(/\/status\/([A-Za-z0-9]{1,64})$/);
      if (request.method === 'GET' && statusMatch) {
        await requireUser(request, env);
        const result = await getChargeStatus(statusMatch[1], env, context);
        return json({ ok: true, charge: result });
      }

      if (request.method === 'POST' && path.endsWith('/webhook')) {
        const result = await handleWebhook(request, env, context);
        return json({ ok: true, processed: result.processed });
      }

      return json({ ok: false, error: 'Rota não encontrada.', code: 'NOT_FOUND' }, 404);
    } catch (error) {
      console.error('[SANTANDER_PIX_WORKER]', error && error.stack ? error.stack : error);
      return json({
        ok: false,
        error: error && error.message ? error.message : 'Falha interna na integração Pix.',
        code: error && error.code ? error.code : 'INTERNAL_ERROR'
      }, Number(error && error.status) || 500);
    }
  }
};

async function createCharge(input, user, env, context) {
  const amountCents = toPositiveInteger(input && input.amountCents);
  const entryId = clean(input && input.entryId);
  const clientName = clean(input && input.clientName);
  const objectCount = Math.max(1, Math.min(999, Number.parseInt(input && input.objectCount, 10) || 1));

  if (!amountCents) throw appError('Informe um valor maior que zero.', 'INVALID_AMOUNT', 400);
  if (!entryId || entryId.length > 100) throw appError('Referência interna inválida.', 'INVALID_ENTRY_ID', 400);
  if (!clientName || clientName.length > 120) throw appError('Cliente inválido.', 'INVALID_CLIENT', 400);

  const mode = clean(env.SANTANDER_MODE || 'disabled').toLowerCase();
  if (mode === 'disabled') throw appError('Integração Santander ainda não ativada.', 'SANTANDER_DISABLED', 503);

  const txid = generateTxid();
  const chargeDraft = {
    txid,
    entryId,
    clientName,
    objectCount,
    amountCents,
    amount: centsToDecimal(amountCents),
    description: clean(input && input.description) || 'Postagem AGF José Bonifácio',
    status: 'CRIANDO',
    provider: 'santander',
    createdAt: new Date().toISOString(),
    createdBy: user.id
  };

  await putCharge(env, chargeDraft);

  if (mode === 'mock') {
    const mock = {
      ...chargeDraft,
      status: 'ATIVA',
      copyPaste: clean(env.SANTANDER_MOCK_PIX_CODE),
      location: '',
      expiresAt: new Date(Date.now() + expirySeconds(env) * 1000).toISOString(),
      rawStatus: 'ATIVA'
    };
    if (!mock.copyPaste) throw appError('Configure SANTANDER_MOCK_PIX_CODE para o modo mock.', 'MOCK_CODE_REQUIRED', 503);
    await putCharge(env, mock);
    return publicCharge(mock);
  }

  assertLiveConfig(env);
  const token = await getAccessToken(env, context);
  const endpoint = applyTemplate(env.SANTANDER_CREATE_URL_TEMPLATE, { txid });
  const payload = buildCreatePayload(chargeDraft, env);
  const response = await bankFetch(env, endpoint, {
    method: clean(env.SANTANDER_CREATE_METHOD || 'PUT').toUpperCase(),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const raw = await parseResponse(response);
  if (!response.ok) throw bankError('Falha ao criar cobrança Pix no Santander.', response, raw);

  const normalized = normalizeBankCharge(raw, chargeDraft);
  if (!normalized.copyPaste) {
    throw appError('O Santander não retornou o Pix Copia e Cola no formato esperado.', 'PIX_CODE_MISSING', 502);
  }
  await putCharge(env, normalized);
  return publicCharge(normalized);
}

async function getChargeStatus(txid, env, context) {
  const saved = await readCharge(env, txid);
  if (!saved) throw appError('Cobrança não encontrada.', 'CHARGE_NOT_FOUND', 404);

  if (isTerminal(saved.status) || !env.SANTANDER_STATUS_URL_TEMPLATE || clean(env.SANTANDER_MODE).toLowerCase() === 'mock') {
    return publicCharge(saved);
  }

  try {
    const token = await getAccessToken(env, context);
    const endpoint = applyTemplate(env.SANTANDER_STATUS_URL_TEMPLATE, { txid });
    const response = await bankFetch(env, endpoint, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
    });
    const raw = await parseResponse(response);
    if (!response.ok) throw bankError('Falha ao consultar cobrança Pix.', response, raw);
    const normalized = normalizeBankCharge(raw, saved);
    await putCharge(env, normalized);
    if (normalized.status === 'CONFIRMADO') {
      context.waitUntil(notifyAppsScript(normalized, env));
    }
    return publicCharge(normalized);
  } catch (error) {
    console.warn('[SANTANDER_PIX_STATUS] consulta de contingência falhou', error && error.message ? error.message : error);
    return publicCharge(saved);
  }
}

async function handleWebhook(request, env, context) {
  const expectedSecret = clean(env.SANTANDER_WEBHOOK_SECRET);
  if (expectedSecret) {
    const received = clean(request.headers.get('x-webhook-secret') || request.headers.get('x-santander-signature'));
    if (!received || !timingSafeEqual(received, expectedSecret)) {
      throw appError('Webhook não autorizado.', 'WEBHOOK_UNAUTHORIZED', 401);
    }
  }

  const body = await readJson(request);
  const events = extractWebhookEvents(body);
  let processed = 0;

  for (const event of events) {
    const txid = clean(event.txid || event.txId || event.idTx);
    if (!txid) continue;
    const existing = await readCharge(env, txid) || { txid, provider: 'santander' };
    const amountCents = moneyToCents(event.valor || event.value || event.amount) || existing.amountCents || 0;
    const updated = {
      ...existing,
      txid,
      status: 'CONFIRMADO',
      rawStatus: clean(event.status || 'CONCLUIDA'),
      amountCents,
      amount: centsToDecimal(amountCents),
      e2eid: clean(event.endToEndId || event.endToEndID || event.e2eid || event.end_to_end_id),
      receivedAt: clean(event.horario || event.receivedAt || event.dataHora) || new Date().toISOString(),
      payerName: clean(event.pagador && (event.pagador.nome || event.pagador.name)),
      payerDocument: clean(event.pagador && (event.pagador.cpf || event.pagador.cnpj || event.pagador.documento)),
      webhookReceivedAt: new Date().toISOString(),
      rawWebhook: body
    };
    await putCharge(env, updated);
    context.waitUntil(notifyAppsScript(updated, env));
    processed += 1;
  }

  return { processed };
}

function buildCreatePayload(charge, env) {
  const profile = clean(env.SANTANDER_API_PROFILE || 'bacen-v2').toLowerCase();
  if (profile !== 'bacen-v2') {
    throw appError('Perfil Santander ainda não implementado: ' + profile, 'UNSUPPORTED_PROFILE', 500);
  }
  return {
    calendario: { expiracao: expirySeconds(env) },
    valor: { original: charge.amount },
    chave: clean(env.SANTANDER_PIX_KEY),
    solicitacaoPagador: charge.description,
    infoAdicionais: [
      { nome: 'referencia', valor: charge.entryId.slice(0, 50) },
      { nome: 'cliente', valor: charge.clientName.slice(0, 50) },
      { nome: 'objetos', valor: String(charge.objectCount) }
    ]
  };
}

function normalizeBankCharge(raw, fallback) {
  const root = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw || {};
  const rawStatus = clean(root.status || root.situacao || fallback.rawStatus || fallback.status);
  const receivedEvent = Array.isArray(root.pix) && root.pix.length ? root.pix[0] : null;
  const amountCents = moneyToCents(
    (receivedEvent && (receivedEvent.valor || receivedEvent.amount)) ||
    (root.valor && (root.valor.original || root.valor.valor)) ||
    root.amount || fallback.amount
  ) || fallback.amountCents || 0;

  return {
    ...fallback,
    txid: clean(root.txid || root.txId || fallback.txid),
    status: normalizeStatus(rawStatus, Boolean(receivedEvent)),
    rawStatus,
    amountCents,
    amount: centsToDecimal(amountCents),
    copyPaste: clean(
      root.pixCopiaECola || root.pixCopiaCola || root.copiaECola || root.brcode || root.brCode ||
      root.qrCode || root.emv || fallback.copyPaste
    ),
    location: clean(root.location || root.loc && root.loc.location || fallback.location),
    e2eid: clean((receivedEvent && (receivedEvent.endToEndId || receivedEvent.e2eid)) || root.e2eid || fallback.e2eid),
    receivedAt: clean((receivedEvent && (receivedEvent.horario || receivedEvent.receivedAt)) || root.receivedAt || fallback.receivedAt),
    expiresAt: fallback.expiresAt || new Date(Date.now() + expirySecondsFromFallback(fallback) * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    rawResponse: raw
  };
}

async function getAccessToken(env, context) {
  const cacheKey = 'oauth:santander';
  if (env.PIX_STATE) {
    const cached = await env.PIX_STATE.get(cacheKey, { type: 'json' });
    if (cached && cached.token && Number(cached.expiresAt || 0) > Date.now() + 30000) return cached.token;
  }

  const form = new URLSearchParams();
  form.set('grant_type', clean(env.SANTANDER_GRANT_TYPE || 'client_credentials'));
  if (env.SANTANDER_SCOPE) form.set('scope', clean(env.SANTANDER_SCOPE));
  const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  const authStyle = clean(env.SANTANDER_AUTH_STYLE || 'basic').toLowerCase();
  if (authStyle === 'body') {
    form.set('client_id', clean(env.SANTANDER_CLIENT_ID));
    form.set('client_secret', clean(env.SANTANDER_CLIENT_SECRET));
  } else {
    headers.authorization = 'Basic ' + encodeBasic(env.SANTANDER_CLIENT_ID, env.SANTANDER_CLIENT_SECRET);
  }

  const response = await bankFetch(env, env.SANTANDER_TOKEN_URL, {
    method: 'POST', headers, body: form.toString()
  });
  const raw = await parseResponse(response);
  if (!response.ok) throw bankError('Falha ao autenticar na API Santander.', response, raw);
  const token = clean(raw.access_token || raw.accessToken || raw.token);
  if (!token) throw appError('O Santander não retornou um access token.', 'TOKEN_MISSING', 502);
  const ttl = Math.max(60, Number(raw.expires_in || raw.expiresIn || 300));
  if (env.PIX_STATE) {
    context.waitUntil(env.PIX_STATE.put(cacheKey, JSON.stringify({ token, expiresAt: Date.now() + ttl * 1000 }), { expirationTtl: ttl }));
  }
  return token;
}

async function notifyAppsScript(charge, env) {
  if (!env.CAIXA_APPS_SCRIPT_URL || !env.CAIXA_INTERNAL_SECRET) return;
  const payload = {
    txid: charge.txid,
    entryId: charge.entryId || '',
    status: charge.status,
    e2eid: charge.e2eid || '',
    amountCents: charge.amountCents || 0,
    receivedAt: charge.receivedAt || '',
    provider: 'santander'
  };
  const timestamp = String(Date.now());
  const signature = await hmacBase64(env.CAIXA_INTERNAL_SECRET, timestamp + '.' + JSON.stringify(payload));
  const response = await fetch(env.CAIXA_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'internalPixWebhook', timestamp, payload, signature })
  });
  if (!response.ok) throw new Error('Apps Script respondeu HTTP ' + response.status);
  const result = await response.json().catch(() => null);
  if (!result || !result.ok) throw new Error(result && result.error ? result.error : 'Apps Script rejeitou a confirmação Pix.');
}

async function bankFetch(env, url, init) {
  if (!url) throw appError('Endpoint Santander não configurado.', 'ENDPOINT_REQUIRED', 503);
  if (env.SANTANDER_MTLS && typeof env.SANTANDER_MTLS.fetch === 'function') {
    return env.SANTANDER_MTLS.fetch(url, init);
  }
  if (clean(env.SANTANDER_REQUIRE_MTLS).toLowerCase() === 'true') {
    throw appError('Binding mTLS do Santander não configurado.', 'MTLS_REQUIRED', 503);
  }
  return fetch(url, init);
}

async function putCharge(env, charge) {
  if (!env.PIX_STATE) return;
  const ttl = Math.max(86400, Number(env.PIX_STATE_TTL_SECONDS || 2592000));
  await env.PIX_STATE.put('charge:' + charge.txid, JSON.stringify(charge), { expirationTtl: ttl });
}

async function readCharge(env, txid) {
  if (!env.PIX_STATE) throw appError('Binding PIX_STATE não configurado.', 'PIX_STATE_REQUIRED', 503);
  return env.PIX_STATE.get('charge:' + txid, { type: 'json' });
}

async function requireUser(request, env) {
  const mode = clean(env.AGF_API_AUTH_MODE || 'enforce').toLowerCase();
  if (mode === 'off') return { id: 'auth-off' };
  const auth = clean(request.headers.get('authorization'));
  const token = auth.replace(/^Bearer\s+/i, '');
  const user = await verifyJwtHs256(token, env.AGF_AUTH_JWT_SECRET);
  if (user) return { id: clean(user.sub || user.email), name: clean(user.name || user.email), role: clean(user.role) };
  if (mode === 'monitor') return { id: 'sem-sessao-monitor' };
  throw appError('Sessão necessária.', 'AUTH_REQUIRED', 401);
}

async function verifyJwtHs256(token, secret) {
  try {
    if (!token || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    if (!payload || !payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function extractWebhookEvents(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body && body.pix)) return body.pix;
  if (Array.isArray(body && body.eventos)) return body.eventos;
  if (body && body.data && Array.isArray(body.data.pix)) return body.data.pix;
  return body && typeof body === 'object' ? [body] : [];
}

function normalizeStatus(value, hasPix) {
  if (hasPix) return 'CONFIRMADO';
  const status = clean(value).toUpperCase();
  if (['CONCLUIDA', 'CONCLUIDO', 'PAGO', 'PAGA', 'LIQUIDADO', 'LIQUIDADA', 'CONFIRMADO'].includes(status)) return 'CONFIRMADO';
  if (['REMOVIDA_PELO_USUARIO_RECEBEDOR', 'CANCELADA', 'CANCELADO'].includes(status)) return 'CANCELADO';
  if (['EXPIRADA', 'EXPIRADO'].includes(status)) return 'EXPIRADO';
  if (['ATIVA', 'CRIADA', 'CRIADO', 'PENDENTE'].includes(status)) return 'ATIVA';
  return status || 'ATIVA';
}

function publicCharge(charge) {
  return {
    provider: 'santander',
    automaticConfirmation: true,
    entryId: charge.entryId || '',
    txid: charge.txid,
    status: charge.status,
    rawStatus: charge.rawStatus || '',
    amountCents: charge.amountCents || 0,
    copyPaste: charge.copyPaste || '',
    location: charge.location || '',
    e2eid: charge.e2eid || '',
    receivedAt: charge.receivedAt || '',
    expiresAt: charge.expiresAt || ''
  };
}

function assertLiveConfig(env) {
  const required = ['SANTANDER_CLIENT_ID', 'SANTANDER_CLIENT_SECRET', 'SANTANDER_TOKEN_URL', 'SANTANDER_CREATE_URL_TEMPLATE', 'SANTANDER_PIX_KEY'];
  const missing = required.filter(key => !clean(env[key]));
  if (missing.length) throw appError('Configuração Santander incompleta: ' + missing.join(', '), 'CONFIG_INCOMPLETE', 503);
}

function applyTemplate(template, values) {
  let result = clean(template);
  Object.entries(values).forEach(([key, value]) => { result = result.replaceAll('{' + key + '}', encodeURIComponent(value)); });
  return result;
}

function generateTxid() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let random = '';
  for (const byte of bytes) random += alphabet[byte % alphabet.length];
  return ('AGF' + Date.now().toString(36).toUpperCase() + random).slice(0, 35).padEnd(26, '0');
}

function expirySeconds(env) { return Math.max(60, Math.min(86400, Number(env.SANTANDER_PIX_EXPIRATION_SECONDS || 300))); }
function expirySecondsFromFallback(fallback) { return fallback && fallback.expiresAt ? Math.max(60, Math.floor((Date.parse(fallback.expiresAt) - Date.now()) / 1000)) : 300; }
function centsToDecimal(value) { return (Number(value || 0) / 100).toFixed(2); }
function toPositiveInteger(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.round(number) : 0; }
function moneyToCents(value) {
  if (value && typeof value === 'object') value = value.original || value.valor || value.value;
  const text = clean(value).replace(/\s/g, '').replace(/R\$/gi, '');
  if (!text) return 0;
  let normalized = text;
  if (text.includes(',') && text.includes('.')) normalized = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) normalized = text.replace(',', '.');
  const number = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? Math.round(Math.abs(number) * 100) : 0;
}
function clean(value) { return String(value == null ? '' : value).trim(); }
function isTerminal(status) { return ['CONFIRMADO', 'EXPIRADO', 'CANCELADO', 'ERRO'].includes(clean(status).toUpperCase()); }
function timingSafeEqual(a, b) {
  const left = clean(a); const right = clean(b); let diff = left.length ^ right.length; const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) diff |= (left.charCodeAt(i % Math.max(1, left.length)) || 0) ^ (right.charCodeAt(i % Math.max(1, right.length)) || 0);
  return diff === 0;
}
function encodeBasic(id, secret) { return btoa(unescape(encodeURIComponent(clean(id) + ':' + clean(secret)))); }
function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function hmacBase64(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  let binary = ''; signed.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary);
}
async function readJson(request) {
  try { return await request.json(); }
  catch (_) { throw appError('JSON inválido.', 'INVALID_JSON', 400); }
}
async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (_) { return { rawText: text }; }
}
function bankError(message, response, raw) {
  const error = appError(message, 'SANTANDER_API_ERROR', response.status || 502);
  error.details = raw;
  return error;
}
function appError(message, code, status) { const error = new Error(message); error.code = code; error.status = status; return error; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS }); }
