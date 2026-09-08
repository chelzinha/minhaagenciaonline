import baseApp from './cliente-portal-wrapper.js';
import panelV3 from './panel-v3-portal.js';

// ============================================================
// ATENDE - LOCAIS DINAMICOS + TRAVA POR CLIENTE PORTAL
//
// Hierarquia do LOCAL:
//   CLIENTE PORTAL travado > manual > atendente > remetente > vazio
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((url.pathname === '/atende' || url.pathname === '/filters') && request.method === 'GET') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return panelV3.fetch(request, env, ctx);
    }

    if (url.pathname === '/admin/local' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveLocal(request, env);
    }

    if (url.pathname === '/admin/portal-client-local' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return savePortalClientLocal(request, env);
    }

    if (url.pathname === '/admin/bulk-local' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      const locked = await lockedRowsFromRequest(request.clone(), env);
      if (locked.length) {
        return json({
          ok:false,
          error:'local_locked_by_cliente_portal',
          message:'Uma ou mais postagens possuem Local travado pelo CLIENTE PORTAL. Altere a trava em Admin > Locais.',
          lockedCount:locked.length,
          locked:locked.slice(0,50)
        },409);
      }
      return baseApp.fetch(request, env, ctx);
    }

    const response = await baseApp.fetch(request, env, ctx);

    if (url.pathname === '/admin/bootstrap' && request.method === 'GET' && response.ok) {
      return augmentAdminBootstrap(response, env);
    }

    return response;
  }
};

async function augmentAdminBootstrap(response, env) {
  let body;
  try { body = await response.json(); }
  catch (_) { return response; }
  if (!body || body.ok === false) return json(body || {ok:false,error:'invalid_bootstrap_response'}, response.status);

  const [locaisResult, portalResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT codigo,nome,ativo,atualizado_por,atualizado_em
      FROM atende_locais
      ORDER BY ativo DESC,nome COLLATE NOCASE ASC
    `),
    env.DB.prepare(`
      WITH portal AS (
        SELECT cr.cliente_norm AS cliente_portal_norm,
               MAX(cr.cliente) AS cliente_portal,
               COUNT(*) AS ocorrencias
        FROM consolidador_raw cr
        JOIN consolidador_importacoes ci
          ON ci.import_key=cr.import_key
         AND ci.concluido_em IS NOT NULL
        WHERE TRIM(COALESCE(cr.cliente_norm,''))<>''
        GROUP BY cr.cliente_norm
      )
      SELECT p.cliente_portal_norm,p.cliente_portal,p.ocorrencias,
             COALESCE(pl.local_codigo,'') AS local_codigo
      FROM portal p
      LEFT JOIN atende_cliente_portal_local pl
        ON pl.cliente_portal_norm=p.cliente_portal_norm
       AND pl.ativo=1
      ORDER BY COALESCE(NULLIF(pl.local_codigo,''),'ZZZZ'),p.cliente_portal COLLATE NOCASE ASC
      LIMIT 5000
    `)
  ]);

  const allLocais=locaisResult?.results||[];
  body.locais=allLocais.filter(x=>Number(x.ativo||0)===1).map(x=>({codigo:clean(x.codigo),nome:clean(x.nome)||clean(x.codigo)}));
  body.locaisAdmin=allLocais;
  body.clientesPortalAdmin=portalResult?.results||[];
  return json(body,response.status);
}

async function saveLocal(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const nome=clean(body?.nome);
  let codigo=normalizeLocalCode(body?.codigo||nome);
  const ativo=body?.ativo===false||body?.ativo===0?0:1;
  const user=adminUser(request);
  if(!nome)return json({ok:false,error:'nome_required'},400);
  if(!codigo)return json({ok:false,error:'codigo_required'},400);
  if(codigo.length>30)return json({ok:false,error:'codigo_too_long'},400);

  const old=await env.DB.prepare(`SELECT codigo,nome,ativo FROM atende_locais WHERE codigo=?`).bind(codigo).first();
  await env.DB.prepare(`
    INSERT INTO atende_locais(codigo,nome,ativo,atualizado_por,atualizado_em)
    VALUES(?,?,?,?,datetime('now'))
    ON CONFLICT(codigo) DO UPDATE SET
      nome=excluded.nome,
      ativo=excluded.ativo,
      atualizado_por=excluded.atualizado_por,
      atualizado_em=datetime('now')
  `).bind(codigo,nome,ativo,user).run();

  await audit(env,'local',codigo,'cadastro',JSON.stringify(old||{}),JSON.stringify({codigo,nome,ativo}),user);
  return json({ok:true,codigo,nome,ativo});
}

async function savePortalClientLocal(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const clientePortal=clean(body?.clientePortal);
  const clienteNorm=normText(clientePortal);
  const localCodigo=normalizeLocalCode(body?.localCodigo);
  const user=adminUser(request);
  if(!clientePortal||!clienteNorm)return json({ok:false,error:'cliente_portal_required'},400);

  const old=await env.DB.prepare(`
    SELECT cliente_portal,local_codigo
    FROM atende_cliente_portal_local
    WHERE cliente_portal_norm=? AND ativo=1
  `).bind(clienteNorm).first();

  if(!localCodigo) {
    await env.DB.prepare(`DELETE FROM atende_cliente_portal_local WHERE cliente_portal_norm=?`).bind(clienteNorm).run();
    await audit(env,'cliente_portal',clienteNorm,'local_travado',clean(old?.local_codigo),'',user);
    return json({ok:true,unlocked:true});
  }

  const local=await env.DB.prepare(`SELECT codigo,nome FROM atende_locais WHERE codigo=? AND ativo=1`).bind(localCodigo).first();
  if(!local)return json({ok:false,error:'invalid_local',localCodigo},400);

  await env.DB.prepare(`
    INSERT INTO atende_cliente_portal_local(
      cliente_portal_norm,cliente_portal,local_codigo,ativo,atualizado_por,atualizado_em
    ) VALUES(?,?,?,1,?,datetime('now'))
    ON CONFLICT(cliente_portal_norm) DO UPDATE SET
      cliente_portal=excluded.cliente_portal,
      local_codigo=excluded.local_codigo,
      ativo=1,
      atualizado_por=excluded.atualizado_por,
      atualizado_em=datetime('now')
  `).bind(clienteNorm,clientePortal,localCodigo,user).run();

  await audit(env,'cliente_portal',clienteNorm,'local_travado',clean(old?.local_codigo),localCodigo,user);
  return json({ok:true,clientePortal,localCodigo});
}

async function lockedRowsFromRequest(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return []; }
  const ids=Array.isArray(body?.rawIds)?body.rawIds.map(Number).filter(n=>n>0):[];
  if(!ids.length)return[];
  const out=[];
  for(let i=0;i<ids.length;i+=80){
    const chunk=ids.slice(i,i+80);
    const rows=await env.DB.prepare(`
      SELECT cp.raw_id,cp.cliente_portal,pcl.local_codigo
      FROM atende_cliente_portal cp
      JOIN atende_cliente_portal_local pcl
        ON pcl.cliente_portal_norm=cp.cliente_portal_norm
       AND pcl.ativo=1
      WHERE cp.raw_id IN (${chunk.map(()=>'?').join(',')})
    `).bind(...chunk).all();
    out.push(...(rows.results||[]));
  }
  return out;
}

async function audit(env,entidade,chave,campo,anterior,novo,usuario){
  if(String(anterior??'')===String(novo??''))return;
  await env.DB.prepare(`
    INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em)
    VALUES(?,?,?,?,?,?,datetime('now'))
  `).bind(entidade,chave,campo,String(anterior??''),String(novo??''),usuario||'admin').run();
}

function normalizeLocalCode(value){
  const s=clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return s.replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function normText(value){return clean(value).toUpperCase().replace(/\s+/g,' ');}
function adminUser(request){return clean(request.headers.get('X-AGF-Admin-User'))||'admin';}
function authorized(request,env){return !!env.ATENDE_API_TOKEN&&(request.headers.get('Authorization')||'')===`Bearer ${env.ATENDE_API_TOKEN}`;}
function clean(value){if(value===null||value===undefined)return'';const s=String(value).trim();return/^(null|undefined)$/i.test(s)?'':s;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
