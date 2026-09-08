const FALLBACK_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzKKJ9mnRRa9E6JLOuDLKadK5D5_I6AgV2Gus5gVISByV5z3TB9KL13hqJrjMowI090Qw/exec';

function buildCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = new Set([
    'https://minhaagenciaonline.com.br',
    'https://www.minhaagenciaonline.com.br'
  ]);

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://minhaagenciaonline.com.br',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...buildCorsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request)
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, {
      ok: false,
      error: {
        message: 'Método não permitido. Use POST.'
      }
    }, 405);
  }

  const appsScriptUrl = env.APPS_SCRIPT_URL || FALLBACK_APPS_SCRIPT_URL;

  let body = '';
  try {
    body = await request.text();
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: {
        message: 'Não foi possível ler a solicitação.'
      }
    }, 400);
  }

  try {
    const upstream = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body,
      redirect: 'follow'
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('Content-Type') || 'application/json; charset=utf-8';

    return new Response(text, {
      status: upstream.status,
      headers: {
        ...buildCorsHeaders(request),
        'Content-Type': contentType.includes('application/json') ? contentType : 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: {
        message: 'Falha ao conectar ao backend do Reverso.',
        detail: error && error.message ? error.message : String(error)
      }
    }, 502);
  }
}
