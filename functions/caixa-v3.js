'use strict';

const APPS_SCRIPT_V3 =
  'https://script.google.com/macros/s/AKfycbxRaTJeaXhGTC0Lbyqf_Osnr_HsOyUnlOWjwtGMvkvPY1d98H0RthjJPCkLJRkP1x8o/exec';

const ALLOWED_ACTIONS = new Set([
  'summary',
  'saveEntry',
  'saveBatch',
  'syncPixPayment',
  'createWithdrawal',
  'closeCash'
]);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

export async function onRequest(context) {
  const request = context.request;

  if (request.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        code: 'METHOD_NOT_ALLOWED',
        error: 'Método não permitido.'
      },
      405
    );
  }

  let body = '';

  try {
    body = await request.text();
  } catch (_) {
    return jsonResponse(
      {
        ok: false,
        code: 'INVALID_REQUEST',
        error: 'Não foi possível ler a solicitação.'
      },
      400
    );
  }

  const parsed = safeJson(body);
  const action = String(parsed?.action || '').trim();

  if (!parsed || !ALLOWED_ACTIONS.has(action)) {
    return jsonResponse(
      {
        ok: false,
        code: 'ACTION_NOT_ALLOWED',
        error: 'Ação não permitida neste endpoint.'
      },
      400
    );
  }

  try {
    const upstream = await fetch(APPS_SCRIPT_V3, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Accept': 'application/json,text/plain,*/*'
      },
      body,
      redirect: 'follow'
    });

    const text = await upstream.text();
    const result = safeJson(text);

    if (!result) {
      return jsonResponse(
        {
          ok: false,
          code: 'UPSTREAM_INVALID_RESPONSE',
          error: 'O backend do Caixa não respondeu JSON válido.'
        },
        502
      );
    }

    return jsonResponse(result, upstream.ok ? 200 : upstream.status);
  } catch (_) {
    return jsonResponse(
      {
        ok: false,
        code: 'UPSTREAM_FETCH_FAILED',
        error: 'Falha de comunicação com o backend do Caixa.'
      },
      502
    );
  }
}
