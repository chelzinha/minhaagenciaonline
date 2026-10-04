// Motor de Cotação AGF: preço + prazo pelo contrato do cliente, com cache.
// Usado pelo admin (simulação), pelo checkout Shopify e pela página do produto.

import { getToken, fetchPrice, fetchDeadline, httpError } from './correios.js';

// ------------------------------------------------------------ CFG

export const SERVICES = Object.freeze(['SEDEX', 'PAC', 'MINI_ENVIOS']);
export const DEFAULT_SERVICE_CODES = Object.freeze({ SEDEX: '03220', PAC: '03298', MINI_ENVIOS: '04227' });

const LIMITS = Object.freeze({
  maxWeightGrams: 30000,
  min: { length: 15, width: 10, height: 1 },
  maxSide: 100,
  maxSum: 200,
  miniEnvios: { length: 24, width: 16, height: 4, weightGrams: 300 }
});

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ------------------------------------------------------------ helpers

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function num(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function todayBrt() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function serviceCodes(account) {
  let parsed = {};
  try { parsed = JSON.parse(account?.services_json || '{}') || {}; } catch { parsed = {}; }
  const out = {};
  for (const service of SERVICES) out[service] = digits(parsed[service]) || DEFAULT_SERVICE_CODES[service];
  return out;
}

export function normalizeQuoteInput(input, account) {
  const cepDestino = digits(input.cepDestino);
  if (cepDestino.length !== 8) throw httpError('CEP de destino inválido.', 400, 'INPUT');
  const cepOrigem = digits(input.cepOrigem) || account.origin_cep || '';
  if (cepOrigem.length !== 8) throw httpError('CEP de origem não configurado para este cliente.', 409, 'NOT_CONFIGURED');

  const weightGrams = Math.ceil(num(input.weightGrams) || 0);
  if (weightGrams <= 0) throw httpError('Peso inválido.', 400, 'INPUT');
  if (weightGrams > LIMITS.maxWeightGrams) throw httpError('Peso acima de 30 kg.', 400, 'INPUT');

  const envelope = String(input.format || '').toUpperCase() === 'ENVELOPE';
  const dims = {
    lengthCm: Math.ceil(num(input.lengthCm) || 0),
    widthCm: Math.ceil(num(input.widthCm) || 0),
    heightCm: Math.ceil(num(input.heightCm) || 0)
  };
  if (!envelope) {
    if (!dims.lengthCm || !dims.widthCm || !dims.heightCm) throw httpError('Informe as dimensões da embalagem.', 400, 'INPUT');
    dims.lengthCm = Math.max(dims.lengthCm, LIMITS.min.length);
    dims.widthCm = Math.max(dims.widthCm, LIMITS.min.width);
    dims.heightCm = Math.max(dims.heightCm, LIMITS.min.height);
    if (Math.max(dims.lengthCm, dims.widthCm, dims.heightCm) > LIMITS.maxSide ||
        dims.lengthCm + dims.widthCm + dims.heightCm > LIMITS.maxSum) {
      throw httpError('Embalagem acima do limite dos Correios (100 cm por lado, soma 200 cm).', 400, 'INPUT');
    }
  }

  const requested = Array.isArray(input.services) && input.services.length
    ? input.services.map((item) => String(item).toUpperCase()).filter((item) => SERVICES.includes(item))
    : ['SEDEX', 'PAC'];

  return {
    cepOrigem,
    cepDestino,
    weightGrams,
    objectType: envelope ? '1' : '2',
    ...dims,
    services: Array.from(new Set(requested))
  };
}

function miniEnviosBlocked(params) {
  const lim = LIMITS.miniEnvios;
  if (params.weightGrams > lim.weightGrams) return 'Mini Envios aceita até ' + lim.weightGrams + ' g.';
  if (params.objectType === '2' &&
      (params.lengthCm > lim.length || params.widthCm > lim.width || params.heightCm > lim.height)) {
    return 'Mini Envios aceita até ' + lim.length + ' x ' + lim.width + ' x ' + lim.height + ' cm.';
  }
  return null;
}

function cacheKey(account, code, params) {
  return [
    account.customer_id, account.environment, account.contract_number || '-', code,
    params.cepOrigem, params.cepDestino, params.weightGrams, params.objectType,
    params.lengthCm, params.widthCm, params.heightCm, todayBrt()
  ].join('|');
}

// ------------------------------------------------------------ cotação

export async function quote(env, account, input, options = {}) {
  if (account.check_status !== 'OK' && !options.allowUnchecked) {
    throw httpError('Credenciais CWS ainda não validadas para este cliente.', 409, 'NOT_CONFIGURED');
  }

  const params = normalizeQuoteInput(input, account);
  const codes = serviceCodes(account);
  const results = [];
  const toFetch = [];

  for (const service of params.services) {
    const code = codes[service];
    if (service === 'MINI_ENVIOS') {
      const blocked = miniEnviosBlocked(params);
      if (blocked) { results.push({ service, code, ok: false, error: blocked, reason: 'LIMIT' }); continue; }
    }
    toFetch.push({ service, code, key: cacheKey(account, code, params) });
  }

  // Cache
  let cached = new Map();
  if (toFetch.length && !options.fresh) {
    const rows = await env.DB.prepare(
      `SELECT cache_key, payload_json FROM correios_quote_cache
        WHERE cache_key IN (SELECT value FROM json_each(?1)) AND expires_at > ?2`
    ).bind(JSON.stringify(toFetch.map((item) => item.key)), new Date().toISOString()).all();
    cached = new Map((rows.results || []).map((row) => [row.cache_key, JSON.parse(row.payload_json)]));
  }

  const misses = toFetch.filter((item) => !cached.has(item.key));
  for (const item of toFetch) {
    if (cached.has(item.key)) results.push(Object.assign({ service: item.service, code: item.code, cached: true }, cached.get(item.key)));
  }

  if (misses.length) {
    let token = await getToken(env, account);
    let refreshed = false;

    const run = async (item) => {
      const [price, deadline] = await Promise.all([
        fetchPrice(account, token, item.code, params),
        fetchDeadline(account, token, item.code, params).catch((error) => ({ error: error.message }))
      ]);
      return {
        ok: true,
        price: Math.round(price.price * 100) / 100,
        chargedWeight: price.chargedWeight,
        days: deadline.days ?? null,
        deliveryBy: deadline.deliveryBy ?? null,
        deadlineError: deadline.error || null
      };
    };

    const settled = await Promise.allSettled(misses.map(run));
    const authFailed = settled.some((item) => item.status === 'rejected' && item.reason?.code === 'AUTH');
    let finalSettled = settled;

    if (authFailed && !refreshed) {
      refreshed = true;
      token = await getToken(env, account, { forceRefresh: true });
      finalSettled = await Promise.allSettled(misses.map(run));
    }

    const writes = [];
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    finalSettled.forEach((outcome, index) => {
      const item = misses[index];
      if (outcome.status === 'fulfilled') {
        results.push(Object.assign({ service: item.service, code: item.code, cached: false }, outcome.value));
        if (!outcome.value.deadlineError) {
          writes.push(env.DB.prepare(
            `INSERT INTO correios_quote_cache (cache_key, payload_json, expires_at) VALUES (?, ?, ?)
             ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, expires_at = excluded.expires_at`
          ).bind(item.key, JSON.stringify(outcome.value), expiresAt));
        }
      } else {
        results.push({ service: item.service, code: item.code, ok: false, error: outcome.reason?.message || 'Falha na cotação.', reason: outcome.reason?.code || 'ERROR' });
      }
    });
    if (writes.length) await env.DB.batch(writes);
  }

  const order = (service) => params.services.indexOf(service);
  results.sort((a, b) => order(a.service) - order(b.service));
  return { params, quotes: results };
}

export async function purgeExpiredCache(env) {
  await env.DB.prepare('DELETE FROM correios_quote_cache WHERE expires_at <= ?').bind(new Date().toISOString()).run();
}
