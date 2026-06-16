export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, {
        ok: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }
      });
    }

    const APPS_SCRIPT_EXEC_URL = process.env.APPS_SCRIPT_EXEC_URL;
    if (!APPS_SCRIPT_EXEC_URL) {
      return json(500, {
        ok: false,
        error: { code: 'MISSING_ENV', message: 'APPS_SCRIPT_EXEC_URL não configurada no Netlify.' }
      });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (err) {
      return json(400, {
        ok: false,
        error: { code: 'INVALID_BODY', message: 'JSON inválido no corpo da requisição.' }
      });
    }

    const method = String(body.method || 'GET').toUpperCase();
    const action = String(body.action || '').trim();
    const payload = body.payload || {};

    if (!action) {
      return json(400, {
        ok: false,
        error: { code: 'ACTION_REQUIRED', message: 'Ação não informada.' }
      });
    }

    let upstreamRes;

    if (method === 'GET') {
      const url = new URL(APPS_SCRIPT_EXEC_URL);
      url.searchParams.set('action', action);

      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });

      upstreamRes = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow'
      });
    } else {
      upstreamRes = await fetch(APPS_SCRIPT_EXEC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
        redirect: 'follow'
      });
    }

    const text = await upstreamRes.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return json(502, {
        ok: false,
        error: {
          code: 'INVALID_UPSTREAM_JSON',
          message: 'Resposta inválida do Apps Script.',
          details: text.slice(0, 500)
        }
      });
    }

    return json(upstreamRes.ok ? 200 : 502, data);
  } catch (err) {
    return json(500, {
      ok: false,
      error: {
        code: 'PROXY_ERROR',
        message: err.message || String(err)
      }
    });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}
