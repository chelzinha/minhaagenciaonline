import worker from './index.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export default {
  async fetch(request, env, context) {
    try {
      const url = new URL(request.url);
      let safeRequest = request;

      if (request.method === 'POST' && url.pathname.replace(/\/+$/, '').endsWith('/webhook')) {
        safeRequest = await authenticateAndSanitizeWebhook(request, env);
      }

      const safeEnv = {
        ...env,
        PIX_STATE: wrapPixState(env.PIX_STATE, env)
      };

      return worker.fetch(safeRequest, safeEnv, context);
    } catch (error) {
      console.error('[SANTANDER_PIX_SECURITY]', error && error.stack ? error.stack : error);
      return new Response(JSON.stringify({
        ok: false,
        error: error && error.message ? error.message : 'Falha de segurança na integração Pix.',
        code: error && error.code ? error.code : 'SECURITY_ERROR'
      }), {
        status: Number(error && error.status) || 500,
        headers: JSON_HEADERS
      });
    }
  }
};

async function authenticateAndSanitizeWebhook(request, env) {
  const mode = clean(env.SANTANDER_MODE || 'disabled').toLowerCase();
  const authMode = clean(
    env.SANTANDER_WEBHOOK_AUTH_MODE || (mode === 'production' ? 'shared-secret' : 'none')
  ).toLowerCase();

  if (authMode === 'shared-secret') {
    const expected = clean(env.SANTANDER_WEBHOOK_SECRET);
    if (!expected) {
      throw appError('Autenticação do webhook não configurada.', 'WEBHOOK_AUTH_NOT_CONFIGURED', 503);
    }
    const received = clean(
      request.headers.get('x-webhook-secret') || request.headers.get('x-santander-signature')
    );
    if (!received || !timingSafeEqual(received, expected)) {
      throw appError('Webhook não autorizado.', 'WEBHOOK_UNAUTHORIZED', 401);
    }
  } else if (authMode === 'none') {
    if (!['mock', 'sandbox'].includes(mode)) {
      throw appError(
        'Webhook sem autenticação só é permitido em mock ou sandbox.',
        'WEBHOOK_AUTH_REQUIRED',
        503
      );
    }
  } else {
    throw appError(
      'Modo de autenticação do webhook ainda não suportado: ' + authMode,
      'WEBHOOK_AUTH_UNSUPPORTED',
      503
    );
  }

  let body;
  try {
    body = await request.clone().json();
  } catch (_) {
    throw appError('JSON inválido no webhook.', 'INVALID_WEBHOOK_JSON', 400);
  }

  const events = extractEvents(body).map(sanitizeEvent).filter(event => event.txid);
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({ pix: events })
  });
}

function wrapPixState(binding, env) {
  if (!binding) return binding;
  return {
    get: binding.get.bind(binding),
    put: async (key, value, options) => {
      let safeValue = value;
      if (String(key).startsWith('charge:') && !shouldStoreRaw(env)) {
        try {
          const charge = JSON.parse(String(value));
          delete charge.rawResponse;
          delete charge.rawWebhook;
          delete charge.payerName;
          delete charge.payerDocument;
          safeValue = JSON.stringify(charge);
        } catch (_) {}
      }
      return binding.put(key, safeValue, options);
    },
    delete: binding.delete ? binding.delete.bind(binding) : undefined,
    list: binding.list ? binding.list.bind(binding) : undefined
  };
}

function extractEvents(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body && body.pix)) return body.pix;
  if (Array.isArray(body && body.eventos)) return body.eventos;
  if (body && body.data && Array.isArray(body.data.pix)) return body.data.pix;
  return body && typeof body === 'object' ? [body] : [];
}

function sanitizeEvent(event) {
  return {
    txid: clean(event && (event.txid || event.txId || event.idTx)),
    valor: event && (event.valor || event.value || event.amount),
    status: clean(event && event.status),
    endToEndId: clean(event && (
      event.endToEndId || event.endToEndID || event.e2eid || event.end_to_end_id
    )),
    horario: clean(event && (event.horario || event.receivedAt || event.dataHora))
  };
}

function shouldStoreRaw(env) {
  return clean(env.SANTANDER_STORE_RAW_RESPONSES).toLowerCase() === 'true';
}

function timingSafeEqual(a, b) {
  const left = clean(a);
  const right = clean(b);
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    diff |= (left.charCodeAt(index % Math.max(1, left.length)) || 0) ^
      (right.charCodeAt(index % Math.max(1, right.length)) || 0);
  }
  return diff === 0;
}

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function appError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
