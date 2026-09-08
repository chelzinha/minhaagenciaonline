const FALLBACK_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzKKJ9mnRRa9E6JLOuDLKadK5D5_I6AgV2Gus5gVISByV5z3TB9KL13hqJrjMowI090Qw/exec';
const MAX_GET_FALLBACK_BODY = 7000;

function buildCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = new Set([
    'https://minhaagenciaonline.com.br',
    'https://www.minhaagenciaonline.com.br'
  ]);

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://minhaagenciaonline.com.br',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function safePreview(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function isJsonLike(text, contentType) {
  const value = String(text || '').trim();
  return Boolean(
    contentType.includes('application/json') ||
    value.startsWith('{') ||
    value.startsWith('[')
  );
}

async function callAppsScriptPost(appsScriptUrl, body) {
  const upstream = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      'Accept': 'application/json,text/plain,*/*'
    },
    body,
    redirect: 'follow'
  });

  const text = await upstream.text();
  return {
    ok: upstream.ok,
    status: upstream.status,
    url: upstream.url,
    contentType: upstream.headers.get('Content-Type') || '',
    text
  };
}

async function callAppsScriptGet(appsScriptUrl, body) {
  const parsed = tryParseJson(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const url = new URL(appsScriptUrl);
  Object.entries(parsed).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'object') {
      url.searchParams.set(key, JSON.stringify(value));
    } else {
      url.searchParams.set(key, String(value));
    }
  });

  const upstream = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json,text/plain,*/*' },
    redirect: 'follow'
  });

  const text = await upstream.text();
  return {
    ok: upstream.ok,
    status: upstream.status,
    url: upstream.url,
    contentType: upstream.headers.get('Content-Type') || '',
    text
  };
}

function buildInvalidUpstreamResponse(request, postResult, getResult, body) {
  const postPreview = safePreview(postResult && postResult.text);
  const getPreview = safePreview(getResult && getResult.text);
  const isGoogleHtml = [postPreview, getPreview].some(preview => /<!doctype html|<html|window\['ppConfig'\]|accounts\.google|ServiceLogin/i.test(preview));

  return jsonResponse(request, {
    ok: false,
    data: null,
    error: {
      code: isGoogleHtml ? 'APPS_SCRIPT_HTML_RESPONSE' : 'UPSTREAM_INVALID_RESPONSE',
      message: isGoogleHtml
        ? 'O Web App do Apps Script respondeu uma página HTML do Google, não o JSON da API. Reimplante o Apps Script como Web App público e atualize APPS_SCRIPT_URL no Cloudflare.'
        : 'O backend do Reverso não respondeu JSON válido.',
      details: {
        post_status: postResult ? postResult.status : null,
        post_content_type: postResult ? postResult.contentType : null,
        post_url: postResult ? postResult.url : null,
        post_preview: postPreview,
        get_fallback_used: Boolean(getResult),
        get_status: getResult ? getResult.status : null,
        get_content_type: getResult ? getResult.contentType : null,
        get_url: getResult ? getResult.url : null,
        get_preview: getPreview,
        body_length: body ? body.length : 0
      }
    },
    ts: new Date().toISOString()
  }, 502);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request)
    });
  }

  const appsScriptUrl = env.APPS_SCRIPT_URL || FALLBACK_APPS_SCRIPT_URL;

  if (request.method === 'GET') {
    const url = new URL(request.url);
    if (url.searchParams.get('debug') === '1') {
      return jsonResponse(request, {
        ok: true,
        data: {
          service: 'reverso-api-cloudflare-proxy',
          status: 'published',
          apps_script_configured: Boolean(env.APPS_SCRIPT_URL),
          apps_script_host: new URL(appsScriptUrl).host,
          now: new Date().toISOString()
        },
        error: null
      });
    }

    return jsonResponse(request, {
      ok: false,
      error: {
        message: 'Método não permitido. Use POST.'
      }
    }, 405);
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, {
      ok: false,
      error: {
        message: 'Método não permitido. Use POST.'
      }
    }, 405);
  }

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
    const postResult = await callAppsScriptPost(appsScriptUrl, body);
    const postJson = tryParseJson(postResult.text);

    if (postJson && isJsonLike(postResult.text, postResult.contentType)) {
      return new Response(JSON.stringify(postJson), {
        status: postResult.status,
        headers: {
          ...buildCorsHeaders(request),
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    let getResult = null;
    if (body.length > 0 && body.length <= MAX_GET_FALLBACK_BODY) {
      getResult = await callAppsScriptGet(appsScriptUrl, body);
      const getJson = getResult ? tryParseJson(getResult.text) : null;
      if (getJson && isJsonLike(getResult.text, getResult.contentType)) {
        return new Response(JSON.stringify(getJson), {
          status: getResult.status,
          headers: {
            ...buildCorsHeaders(request),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
      }
    }

    return buildInvalidUpstreamResponse(request, postResult, getResult, body);
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
