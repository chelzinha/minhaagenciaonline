import baseApp from './table-controls-wrapper.js';

// ============================================================
// ATENDE - RETENTATIVA SEGURA DE CLIENTE PORTAL SEM SRO
//
// Nivel 3 (fallback):
// - somente linhas do Atende ainda sem CLIENTE PORTAL;
// - somente linhas sem SRO valido;
// - data + codigo ECT + valor absoluto precisam coincidir;
// - o conjunto correspondente no Consolidador precisa apontar para
//   exatamente um CLIENTE distinto;
// - nao altera nenhum RAW e nao sobrescreve pareamentos existentes.
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const response = await baseApp.fetch(request, env, ctx);
    if (!response.ok) return response;

    if (request.method === 'POST' && path === '/rebuild-cliente-portal') {
      const body = await readJson(response);
      if (!body) return response;
      const retry = await applyDataServiceValueFallback(env);
      return replaceJson(response, {
        ...body,
        retryDataServicoValor: retry
      });
    }

    if (request.method === 'POST' && (path === '/ingest' || path === '/ingest-consolidador')) {
      const body = await readJson(response);
      if (!body || body.completed !== true) return response;
      const retry = await applyDataServiceValueFallback(env);
      return replaceJson(response, {
        ...body,
        retryDataServicoValor: retry
      });
    }

    if (request.method === 'GET' && path === '/portal/status') {
      const body = await readJson(response);
      if (!body) return response;
      const status = await env.DB.prepare(`
        SELECT COUNT(*) AS n
        FROM atende_cliente_portal
        WHERE source_key LIKE 'DSV:%'
      `).first();
      return replaceJson(response, {
        ...body,
        retryDataServicoValor: Number(status?.n || 0)
      });
    }

    return response;
  }
};

async function applyDataServiceValueFallback(env) {
  const result = await env.DB.prepare(FALLBACK_DSV_SQL).run();
  return {
    added: Number(result?.meta?.changes || 0),
    rule: 'DATA+SERVICO+VALOR',
    onlyUniqueClient: true
  };
}

const FALLBACK_DSV_SQL = `
WITH cons_base AS (
  SELECT * FROM (
    SELECT
      cr.*,
      ROW_NUMBER() OVER (
        PARTITION BY CASE
          WHEN TRIM(COALESCE(cr.venda_pp_norm,''))<>'' THEN cr.venda_pp_norm
          ELSE cr.import_key||':'||cr.id
        END
        ORDER BY cr.id DESC
      ) AS dup_rn
    FROM consolidador_raw cr
    JOIN consolidador_importacoes ci
      ON ci.import_key=cr.import_key
     AND ci.concluido_em IS NOT NULL
    WHERE TRIM(COALESCE(cr.cliente_norm,''))<>''
  )
  WHERE dup_rn=1
),
cons_dsv AS (
  SELECT
    cb.data_iso,
    cb.ect_norm,
    ROUND(ABS(COALESCE(cb.valor_num,0)),2) AS valor_abs,
    MAX(cb.cliente) AS cliente,
    MAX(cb.cliente_norm) AS cliente_norm,
    CASE
      WHEN COUNT(DISTINCT NULLIF(TRIM(COALESCE(cb.cx_at,'')),''))=1
      THEN MAX(cb.cx_at)
      ELSE ''
    END AS cx_at,
    COUNT(*) AS qtd_consolidador,
    COUNT(DISTINCT cb.cliente_norm) AS clientes_distintos
  FROM cons_base cb
  WHERE UPPER(TRIM(COALESCE(cb.objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(cb.data_iso,''))<>''
    AND TRIM(COALESCE(cb.ect_norm,''))<>''
    AND TRIM(COALESCE(cb.cliente_norm,''))<>''
  GROUP BY
    cb.data_iso,
    cb.ect_norm,
    ROUND(ABS(COALESCE(cb.valor_num,0)),2)
  HAVING COUNT(DISTINCT cb.cliente_norm)=1
),
at_unmatched AS (
  SELECT
    r.id AS raw_id,
    r.atendimento,
    substr(r.data_postagem_iso,1,10) AS data_iso,
    r.codigo_servico_norm AS ect_norm,
    ROUND(ABS(COALESCE(r.valor_atendimento_num,0)),2) AS valor_abs
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri
    ON ri.import_key=r.import_key
   AND ri.concluido_em IS NOT NULL
  LEFT JOIN atende_cliente_portal ap
    ON ap.raw_id=r.id
  WHERE ap.raw_id IS NULL
    AND UPPER(TRIM(COALESCE(r.codigo_objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(r.data_postagem_iso,''))<>''
    AND TRIM(COALESCE(r.codigo_servico_norm,''))<>''
)
INSERT OR IGNORE INTO atende_cliente_portal(
  raw_id,
  source_key,
  cliente_portal,
  cliente_portal_norm,
  origem_cliente,
  confianca,
  cx_at,
  atualizado_em
)
SELECT
  a.raw_id,
  'DSV:'||a.data_iso||':'||a.ect_norm||':'||printf('%.2f',a.valor_abs),
  c.cliente,
  c.cliente_norm,
  'ATENDIMENTO',
  'MEDIA',
  c.cx_at,
  datetime('now')
FROM at_unmatched a
JOIN cons_dsv c
  ON c.data_iso=a.data_iso
 AND c.ect_norm=a.ect_norm
 AND ABS(c.valor_abs-a.valor_abs)<0.011
`;

async function readJson(response) {
  try { return await response.clone().json(); }
  catch (_) { return null; }
}

function replaceJson(response, body) {
  const headers = new Headers(response.headers);
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
