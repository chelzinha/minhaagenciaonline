import baseApp from './portal-locais-wrapper.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/admin/portal-clients-local-bulk' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return savePortalClientsLocalBulk(request, env);
    }
    return baseApp.fetch(request, env, ctx);
  }
};

async function savePortalClientsLocalBulk(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const clients=Array.isArray(body?.clientesPortal)
    ? Array.from(new Set(body.clientesPortal.map(clean).filter(Boolean)))
    : [];
  const localCodigo=normalizeLocalCode(body?.localCodigo);
  const user=clean(request.headers.get('X-AGF-Admin-User'))||'admin';
  if(!clients.length)return json({ok:false,error:'clientes_portal_required'},400);
  if(clients.length>1000)return json({ok:false,error:'max_1000_clients'},413);

  if(localCodigo){
    const local=await env.DB.prepare(`SELECT codigo FROM atende_locais WHERE codigo=? AND ativo=1`).bind(localCodigo).first();
    if(!local)return json({ok:false,error:'invalid_local',localCodigo},400);
  }

  const statements=[];
  for(const clientePortal of clients){
    const norm=normText(clientePortal);
    if(!norm)continue;
    if(localCodigo){
      statements.push(env.DB.prepare(`
        INSERT INTO atende_cliente_portal_local(
          cliente_portal_norm,cliente_portal,local_codigo,ativo,atualizado_por,atualizado_em
        ) VALUES(?,?,?,1,?,datetime('now'))
        ON CONFLICT(cliente_portal_norm) DO UPDATE SET
          cliente_portal=excluded.cliente_portal,
          local_codigo=excluded.local_codigo,
          ativo=1,
          atualizado_por=excluded.atualizado_por,
          atualizado_em=datetime('now')
      `).bind(norm,clientePortal,localCodigo,user));
    }else{
      statements.push(env.DB.prepare(`DELETE FROM atende_cliente_portal_local WHERE cliente_portal_norm=?`).bind(norm));
    }
  }

  let saved=0;
  for(let i=0;i<statements.length;i+=100){
    const result=await env.DB.batch(statements.slice(i,i+100));
    result.forEach(r=>saved+=Number(r?.meta?.changes||0));
  }

  await env.DB.prepare(`
    INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em)
    VALUES('cliente_portal_lote',?,'local_travado','',?,?,datetime('now'))
  `).bind(String(clients.length),localCodigo||'',user).run();

  return json({ok:true,clientes:clients.length,saved,localCodigo:localCodigo||''});
}

function normalizeLocalCode(value){
  const s=clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return s.replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function normText(value){return clean(value).toUpperCase().replace(/\s+/g,' ');}
function clean(value){if(value===null||value===undefined)return'';const s=String(value).trim();return/^(null|undefined)$/i.test(s)?'':s;}
function authorized(request,env){return !!env.ATENDE_API_TOKEN&&(request.headers.get('Authorization')||'')===`Bearer ${env.ATENDE_API_TOKEN}`;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
