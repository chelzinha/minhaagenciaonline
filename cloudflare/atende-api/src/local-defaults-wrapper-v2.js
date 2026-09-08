import baseApp from './main.js';

// ============================================================
// ATENDE - REGRA DE LOCAL PADRAO POR ATENDENTE V2
//
// Hierarquia efetiva do LOCAL:
//   override manual > atendente > remetente > vazio
//
// O RAW dos Correios permanece imutavel.
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/attendant' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      return saveAttendantWithLocal(request, env);
    }

    const wrappedEnv = withLocalFallback(env);
    const response = await baseApp.fetch(request, wrappedEnv, ctx);

    if (url.pathname === '/admin/bootstrap' && request.method === 'GET' && response.ok) {
      return augmentAdminBootstrap(response, env);
    }

    return response;
  }
};

function withLocalFallback(env) {
  const db = env.DB;
  const dbProxy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return function(sql) {
          return target.prepare(rewriteLocalSql(sql));
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === 'DB') return dbProxy;
      return Reflect.get(target, prop, receiver);
    }
  });
}

function rewriteLocalSql(sql) {
  return String(sql || '')
    .replace(
      /COALESCE\(\s*po\.local_codigo\s*,\s*c\.local_padrao\s*,\s*a\.local_padrao\s*,\s*''\s*\)/g,
      "COALESCE(po.local_codigo, a.local_padrao, c.local_padrao, '')"
    )
    .replace(
      /COALESCE\(\s*po\.local_codigo\s*,\s*c\.local_padrao\s*,\s*''\s*\)/g,
      "COALESCE(po.local_codigo, a.local_padrao, c.local_padrao, '')"
    );
}

async function augmentAdminBootstrap(response, env) {
  let body;
  try {
    body = await response.json();
  } catch (_) {
    return response;
  }

  if (!body || body.ok === false || !Array.isArray(body.atendentes)) {
    return json(body || { ok:false, error:'invalid_bootstrap_response' }, response.status);
  }

  const result = await env.DB.prepare(`
    SELECT codigo, COALESCE(local_padrao,'') AS local_padrao
    FROM atende_atendentes
    WHERE ativo = 1
  `).all();
  const byCode = new Map((result.results || []).map(row => [clean(row.codigo).toUpperCase(), clean(row.local_padrao)]));

  body.atendentes = body.atendentes.map(row => ({
    ...row,
    local_padrao: byCode.get(clean(row.codigo).toUpperCase()) || ''
  }));

  return json(body, response.status);
}

async function saveAttendantWithLocal(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok:false, error:'invalid_json' }, 400);
  }

  const codigo = clean(body?.codigo).toUpperCase();
  const nome = clean(body?.nome);
  const local = normalizeLocal(body?.localPadrao);
  const user = clean(request.headers.get('X-AGF-Admin-User')) || 'admin';

  if (!codigo) return json({ ok:false, error:'codigo_required' }, 400);
  if (local === null) return json({ ok:false, error:'invalid_local' }, 400);

  const old = await env.DB.prepare(`
    SELECT nome, COALESCE(local_padrao,'') AS local_padrao
    FROM atende_atendentes
    WHERE codigo = ?
  `).bind(codigo).first();

  if (!nome) {
    await env.DB.prepare(`DELETE FROM atende_atendentes WHERE codigo = ?`).bind(codigo).run();
    await audit(env, 'atendente', codigo, 'nome', clean(old?.nome), '', user);
    await audit(env, 'atendente', codigo, 'local_padrao', clean(old?.local_padrao), '', user);
    return json({ ok:true });
  }

  await env.DB.prepare(`
    INSERT INTO atende_atendentes(codigo,nome,local_padrao,ativo,atualizado_por,atualizado_em)
    VALUES(?,?,?,1,?,datetime('now'))
    ON CONFLICT(codigo) DO UPDATE SET
      nome=excluded.nome,
      local_padrao=excluded.local_padrao,
      ativo=1,
      atualizado_por=excluded.atualizado_por,
      atualizado_em=datetime('now')
  `).bind(codigo, nome, local || null, user).run();

  await audit(env, 'atendente', codigo, 'nome', clean(old?.nome), nome, user);
  await audit(env, 'atendente', codigo, 'local_padrao', clean(old?.local_padrao), local || '', user);
  return json({ ok:true, codigo, nome, localPadrao:local || '' });
}

async function audit(env, entidade, chave, campo, anterior, novo, usuario) {
  if (String(anterior ?? '') === String(novo ?? '')) return;
  await env.DB.prepare(`
    INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em)
    VALUES(?,?,?,?,?,?,datetime('now'))
  `).bind(entidade, chave, campo, String(anterior ?? ''), String(novo ?? ''), usuario || 'admin').run();
}

function normalizeLocal(value) {
  const s = clean(value);
  if (!s) return '';
  const normalized = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (normalized === 'AGF') return 'AGF';
  if (normalized === 'METRO') return 'METRO';
  return null;
}

function authorized(request, env) {
  return !!env.ATENDE_API_TOKEN && (request.headers.get('Authorization') || '') === `Bearer ${env.ATENDE_API_TOKEN}`;
}

function clean(value) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  return /^(null|undefined)$/i.test(s) ? '' : s;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}
