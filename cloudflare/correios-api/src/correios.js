// Cliente da API Correios (CWS): token por cartão, Preço e Prazo.

import { encryptSecret, decryptSecret } from './crypto.js';

// ------------------------------------------------------------ CFG

export const BASES = Object.freeze({
  PRODUCAO: 'https://api.correios.com.br',
  HOMOLOGACAO: 'https://apihom.correios.com.br'
});

const REQUEST_TIMEOUT_MS = 4500;
const TOKEN_MARGIN_MS = 30 * 60 * 1000;
const TOKEN_MAX_MS = 23 * 60 * 60 * 1000;

// ------------------------------------------------------------ helpers

export function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

function base(environment) {
  return BASES[environment] || BASES.PRODUCAO;
}

export async function fetchWithTimeout(url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, init, { signal: controller.signal }));
  } catch (error) {
    if (error && error.name === 'AbortError') throw httpError('Correios não responderam a tempo.', 504, 'TIMEOUT');
    throw httpError('Falha de rede ao falar com os Correios.', 502, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

export function correiosMessage(data, fallback) {
  if (!data) return fallback;
  if (Array.isArray(data.msgs) && data.msgs.length) return data.msgs.join(' ');
  if (typeof data.message === 'string' && data.message) return data.message;
  if (typeof data.mensagem === 'string' && data.mensagem) return data.mensagem;
  if (Array.isArray(data) && data[0] && data[0].txErro) return data[0].txErro;
  if (data.txErro) return data.txErro;
  return fallback;
}

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return { message: text.slice(0, 200) }; }
}

// expiraEm costuma vir sem fuso (horário de Brasília).
function parseExpiry(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : text + '-03:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

// ------------------------------------------------------------ token

export async function requestToken(environment, login, accessCode, postingCard) {
  const response = await fetchWithTimeout(`${base(environment)}/token/v1/autentica/cartaopostagem`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: 'Basic ' + btoa(`${login}:${accessCode}`)
    },
    body: JSON.stringify({ numero: postingCard })
  });
  const data = await readJson(response);

  if (!response.ok || !data?.token) {
    const message = response.status === 401
      ? 'Login idCorreios ou código de acesso inválidos.'
      : correiosMessage(data, 'Falha ao gerar token (HTTP ' + response.status + ').');
    throw httpError(message, response.status === 401 ? 401 : 502, 'TOKEN');
  }

  const expiry = parseExpiry(data.expiraEm);
  const limit = Date.now() + TOKEN_MAX_MS;
  const expiresAt = new Date(Math.min(expiry ? expiry.getTime() - TOKEN_MARGIN_MS : limit, limit)).toISOString();
  const apis = Array.isArray(data.cartaoPostagem?.api) ? data.cartaoPostagem.api.map(Number).filter(Number.isFinite) : [];

  return { token: data.token, expiresAt, apis, contract: data.cartaoPostagem?.contrato || null, dr: data.cartaoPostagem?.dr || null };
}

export async function credentialsOf(env, account) {
  if (!account?.login_enc || !account?.access_code_enc) {
    throw httpError('Credenciais CWS não cadastradas para este cliente.', 409, 'NOT_CONFIGURED');
  }
  return {
    login: await decryptSecret(account.login_enc, env),
    accessCode: await decryptSecret(account.access_code_enc, env)
  };
}

export async function getToken(env, account, { forceRefresh = false } = {}) {
  if (!account?.posting_card) throw httpError('Cartão de postagem não cadastrado.', 409, 'NOT_CONFIGURED');

  if (!forceRefresh) {
    const row = await env.DB.prepare(
      'SELECT token_enc, expires_at, environment, posting_card FROM correios_tokens WHERE customer_id = ?'
    ).bind(account.customer_id).first();
    if (row && row.environment === account.environment && row.posting_card === account.posting_card &&
        new Date(row.expires_at).getTime() > Date.now()) {
      return decryptSecret(row.token_enc, env);
    }
  }

  const { login, accessCode } = await credentialsOf(env, account);
  const fresh = await requestToken(account.environment, login, accessCode, account.posting_card);
  await env.DB.prepare(
    `INSERT INTO correios_tokens (customer_id, environment, posting_card, token_enc, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(customer_id) DO UPDATE SET environment = excluded.environment, posting_card = excluded.posting_card,
       token_enc = excluded.token_enc, expires_at = excluded.expires_at, created_at = CURRENT_TIMESTAMP`
  ).bind(account.customer_id, account.environment, account.posting_card, await encryptSecret(fresh.token, env), fresh.expiresAt).run();
  return fresh.token;
}

export async function clearToken(env, customerId) {
  await env.DB.prepare('DELETE FROM correios_tokens WHERE customer_id = ?').bind(customerId).run();
}

// ------------------------------------------------------------ preço e prazo

function toPrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function authorizedGet(url, token) {
  return fetchWithTimeout(url, { headers: { accept: 'application/json', authorization: 'Bearer ' + token } });
}

export async function fetchPrice(account, token, serviceCode, params) {
  const query = new URLSearchParams({
    cepOrigem: params.cepOrigem,
    cepDestino: params.cepDestino,
    psObjeto: String(params.weightGrams),
    tpObjeto: params.objectType
  });
  if (params.objectType === '2') {
    query.set('comprimento', String(params.lengthCm));
    query.set('largura', String(params.widthCm));
    query.set('altura', String(params.heightCm));
  }
  if (account.contract_number) {
    query.set('nuContrato', account.contract_number);
    if (account.dr_number) query.set('nuDR', account.dr_number);
  }
  const response = await authorizedGet(`${base(account.environment)}/preco/v1/nacional/${serviceCode}?${query}`, token);
  const data = await readJson(response);
  if (response.status === 401 || response.status === 403) throw httpError(correiosMessage(data, 'Token recusado.'), 401, 'AUTH');
  if (!response.ok) throw httpError(correiosMessage(data, 'Preço indisponível (HTTP ' + response.status + ').'), 502, 'PRICE');
  const price = toPrice(data?.pcFinal);
  if (price === null) throw httpError(correiosMessage(data, 'Correios não informaram o preço.'), 502, 'PRICE');
  return { price, chargedWeight: data?.psCobrado || null };
}

export async function fetchDeadline(account, token, serviceCode, params) {
  const query = new URLSearchParams({ cepOrigem: params.cepOrigem, cepDestino: params.cepDestino });
  const response = await authorizedGet(`${base(account.environment)}/prazo/v1/nacional/${serviceCode}?${query}`, token);
  const data = await readJson(response);
  if (response.status === 401 || response.status === 403) throw httpError(correiosMessage(data, 'Token recusado.'), 401, 'AUTH');
  if (!response.ok) throw httpError(correiosMessage(data, 'Prazo indisponível (HTTP ' + response.status + ').'), 502, 'DEADLINE');
  const days = Number(data?.prazoEntrega);
  return {
    days: Number.isFinite(days) && days > 0 ? days : null,
    deliveryBy: data?.dataMaxima ? String(data.dataMaxima).slice(0, 10) : null,
    homeDelivery: data?.entregaDomiciliar || null,
    saturday: data?.entregaSabado || null
  };
}
