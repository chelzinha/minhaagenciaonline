import baseApp from './dashboard-v3-wrapper.js';

// ============================================================
// ATENDE - CONTROLES DA TABELA
// - excecao de trava de Local por raw_id
// - preserva o override manual anterior ao destravar
// - nao altera o RAW dos Correios
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/row-lock-exception' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      return saveRowLockException(request, env);
    }

    return baseApp.fetch(request, env, ctx);
  }
};

async function saveRowLockException(request, env) {
  let body;
  try { body = await request.json(); }
  catch (_) { return json({ ok:false, error:'invalid_json' }, 400); }

  const rawIds = uniqueIds(body?.rawIds);
  const unlocked = body?.unlocked === true || body?.unlocked === 1 || String(body?.unlocked || '').toLowerCase() === 'true';
  const user = clean(request.headers.get('X-AGF-Admin-User')) || 'admin';

  if (!rawIds.length) return json({ ok:false, error:'raw_ids_required' }, 400);
  if (rawIds.length > 1000) return json({ ok:false, error:'max_1000_rows' }, 413);

  const rows = await loadRows(rawIds, env);
  const byId = new Map(rows.map(row => [Number(row.raw_id), row]));

  let changed = 0;
  let skipped = 0;
  const statements = [];

  for (const rawId of rawIds) {
    const row = byId.get(rawId);
    if (!row) { skipped++; continue; }

    const portalLocal = clean(row.portal_local);
    const hasException = Number(row.has_exception || 0) === 1;

    if (unlocked) {
      if (!portalLocal || hasException) { skipped++; continue; }

      const previousManual = clean(row.manual_local);
      statements.push(env.DB.prepare(`
        INSERT INTO atende_postagem_trava_excecoes(raw_id,local_override_anterior,criado_por,criado_em)
        VALUES(?,?,?,datetime('now'))
        ON CONFLICT(raw_id) DO NOTHING
      `).bind(rawId, previousManual || null, user));

      // Ao destravar, a linha deve continuar visualmente no mesmo Local.
      // Por isso o Local travado atual vira override manual da excecao.
      statements.push(env.DB.prepare(`
        INSERT INTO atende_postagem_overrides(raw_id,local_codigo,atualizado_por,atualizado_em)
        VALUES(?,?,?,datetime('now'))
        ON CONFLICT(raw_id) DO UPDATE SET
          local_codigo=excluded.local_codigo,
          atualizado_por=excluded.atualizado_por,
          atualizado_em=datetime('now')
      `).bind(rawId, portalLocal, user));

      statements.push(auditStatement(
        env,
        rawId,
        'trava_cliente_portal',
        'TRAVADO:' + portalLocal,
        'DESTRAVADO:' + portalLocal,
        user
      ));
      changed++;
      continue;
    }

    if (!hasException) { skipped++; continue; }

    const previousManual = clean(row.previous_manual);
    if (previousManual) {
      statements.push(env.DB.prepare(`
        INSERT INTO atende_postagem_overrides(raw_id,local_codigo,atualizado_por,atualizado_em)
        VALUES(?,?,?,datetime('now'))
        ON CONFLICT(raw_id) DO UPDATE SET
          local_codigo=excluded.local_codigo,
          atualizado_por=excluded.atualizado_por,
          atualizado_em=datetime('now')
      `).bind(rawId, previousManual, user));
    } else {
      statements.push(env.DB.prepare(`DELETE FROM atende_postagem_overrides WHERE raw_id=?`).bind(rawId));
    }

    statements.push(env.DB.prepare(`DELETE FROM atende_postagem_trava_excecoes WHERE raw_id=?`).bind(rawId));
    statements.push(auditStatement(
      env,
      rawId,
      'trava_cliente_portal',
      'DESTRAVADO:' + clean(row.manual_local),
      portalLocal ? 'TRAVADO:' + portalLocal : 'TRAVA_REMOVIDA',
      user
    ));
    changed++;
  }

  for (let i = 0; i < statements.length; i += 80) {
    await env.DB.batch(statements.slice(i, i + 80));
  }

  return json({
    ok:true,
    unlocked,
    requested:rawIds.length,
    changed,
    skipped
  });
}

async function loadRows(rawIds, env) {
  const out = [];
  for (let i = 0; i < rawIds.length; i += 80) {
    const chunk = rawIds.slice(i, i + 80);
    const result = await env.DB.prepare(`
      SELECT
        r.id AS raw_id,
        COALESCE(po.local_codigo,'') AS manual_local,
        COALESCE(pcl.local_codigo,'') AS portal_local,
        CASE WHEN pte.raw_id IS NOT NULL THEN 1 ELSE 0 END AS has_exception,
        COALESCE(pte.local_override_anterior,'') AS previous_manual
      FROM atende_postagens_raw r
      LEFT JOIN atende_postagem_overrides po
        ON po.raw_id=r.id
      LEFT JOIN atende_cliente_portal cp
        ON cp.raw_id=r.id
      LEFT JOIN atende_cliente_portal_local pcl
        ON pcl.cliente_portal_norm=cp.cliente_portal_norm
       AND pcl.ativo=1
      LEFT JOIN atende_postagem_trava_excecoes pte
        ON pte.raw_id=r.id
      WHERE r.id IN (${chunk.map(() => '?').join(',')})
    `).bind(...chunk).all();
    out.push(...(result.results || []));
  }
  return out;
}

function auditStatement(env, rawId, field, before, after, user) {
  return env.DB.prepare(`
    INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em)
    VALUES('postagem_local',?,?,?,?,?,datetime('now'))
  `).bind(String(rawId), field, String(before || ''), String(after || ''), user || 'admin');
}

function uniqueIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(Number).filter(n => Number.isInteger(n) && n > 0)));
}

function clean(value) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  return /^(null|undefined)$/i.test(s) ? '' : s;
}

function authorized(request, env) {
  return !!env.ATENDE_API_TOKEN &&
    (request.headers.get('Authorization') || '') === `Bearer ${env.ATENDE_API_TOKEN}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}
