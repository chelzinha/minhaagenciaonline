import baseApp from './dynamic-locals-wrapper.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/attendant' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveAttendantDynamic(request, env);
    }

    const wrappedEnv = withAttendantLocal(env);
    const response = await baseApp.fetch(request, wrappedEnv, ctx);

    if (url.pathname === '/admin/bootstrap' && request.method === 'GET' && response.ok) {
      return augmentAdminBootstrap(response, env);
    }

    return response;
  }
};

function withAttendantLocal(env) {
  const db=env.DB;
  const proxy=new Proxy(db,{
    get(target,prop){
      if(prop==='prepare')return function(sql){return target.prepare(rewriteSql(sql));};
      const value=Reflect.get(target,prop,target);
      return typeof value==='function'?value.bind(target):value;
    }
  });
  return new Proxy(env,{
    get(target,prop,receiver){if(prop==='DB')return proxy;return Reflect.get(target,prop,receiver);}
  });
}

function rewriteSql(sql) {
  let text=String(sql||'');

  // Algumas camadas mais novas ja montam explicitamente o JOIN de
  // atende_atendente_local. O wrapper antigo tambem o injetava em runtime,
  // gerando o mesmo alias `atl` duas vezes no Dashboard. Em D1/SQLite isso
  // derruba a consulta e o Worker termina com erro 1101. Torna a reescrita
  // idempotente: so injeta quando o JOIN ainda nao existe no SQL recebido.
  if(!/\bJOIN\s+atende_atendente_local\s+atl\b/i.test(text)){
    text=text.replace(
      'LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1',
      'LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1\n  LEFT JOIN atende_atendente_local atl ON atl.codigo = r.atendente_norm'
    );
  }

  return text.replace(
    /COALESCE\(pcl\.local_codigo,\s*po\.local_codigo,\s*a\.local_padrao,\s*c\.local_padrao,\s*''\)/g,
    "COALESCE(pcl.local_codigo, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')"
  );
}

async function augmentAdminBootstrap(response, env) {
  let body;
  try { body=await response.json(); }
  catch (_) { return response; }
  if(!body||body.ok===false||!Array.isArray(body.atendentes))return json(body||{ok:false,error:'invalid_bootstrap_response'},response.status);

  const q=await env.DB.prepare(`
    SELECT codigo,local_codigo
    FROM atende_atendente_local
  `).all();
  const map=new Map((q.results||[]).map(r=>[clean(r.codigo).toUpperCase(),clean(r.local_codigo)]));
  body.atendentes=body.atendentes.map(r=>({
    ...r,
    local_padrao:map.get(clean(r.codigo).toUpperCase())||clean(r.local_padrao)
  }));
  return json(body,response.status);
}

async function saveAttendantDynamic(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const codigo=clean(body?.codigo).toUpperCase(),nome=clean(body?.nome),user=adminUser(request);
  if(!codigo)return json({ok:false,error:'codigo_required'},400);

  const localMap=await loadLocalMap(env);
  const local=resolveLocal(body?.localPadrao,localMap);
  if(clean(body?.localPadrao)&&local===null)return json({ok:false,error:'invalid_local'},400);

  const old=await env.DB.prepare(`
    SELECT a.nome,COALESCE(atl.local_codigo,a.local_padrao,'') AS local_padrao
    FROM atende_atendentes a
    LEFT JOIN atende_atendente_local atl ON atl.codigo=a.codigo
    WHERE a.codigo=?
  `).bind(codigo).first();

  if(!nome){
    await env.DB.prepare(`DELETE FROM atende_atendente_local WHERE codigo=?`).bind(codigo).run();
    await env.DB.prepare(`DELETE FROM atende_atendentes WHERE codigo=?`).bind(codigo).run();
    await audit(env,'atendente',codigo,'nome',clean(old?.nome),'',user);
    await audit(env,'atendente',codigo,'local_padrao',clean(old?.local_padrao),'',user);
    return json({ok:true});
  }

  await env.DB.prepare(`
    INSERT INTO atende_atendentes(codigo,nome,local_padrao,ativo,atualizado_por,atualizado_em)
    VALUES(?,?,NULL,1,?,datetime('now'))
    ON CONFLICT(codigo) DO UPDATE SET
      nome=excluded.nome,
      local_padrao=NULL,
      ativo=1,
      atualizado_por=excluded.atualizado_por,
      atualizado_em=datetime('now')
  `).bind(codigo,nome,user,user).run();

  if(local){
    await env.DB.prepare(`
      INSERT INTO atende_atendente_local(codigo,local_codigo,atualizado_por,atualizado_em)
      VALUES(?,?,?,datetime('now'))
      ON CONFLICT(codigo) DO UPDATE SET
        local_codigo=excluded.local_codigo,
        atualizado_por=excluded.atualizado_por,
        atualizado_em=datetime('now')
    `).bind(codigo,local,user));
  }else{
    await env.DB.prepare(`DELETE FROM atende_atendente_local WHERE codigo=?`).bind(codigo).run();
  }

  await audit(env,'atendente',codigo,'nome',clean(old?.nome),nome,user);
  await audit(env,'atendente',codigo,'local_padrao',clean(old?.local_padrao),local||'',user);
  return json({ok:true,codigo,nome,localPadrao:local||''});
}

async function loadLocalMap(env){
  const q=await env.DB.prepare(`SELECT codigo,nome FROM atende_locais WHERE ativo=1`).all();
  const map=new Map();
  (q.results||[]).forEach(r=>{const c=clean(r.codigo).toUpperCase();if(!c)return;map.set(normText(c),c);map.set(normText(r.nome),c);});
  return map;
}
function resolveLocal(value,map){const s=clean(value);if(!s)return'';return map.get(normText(s))||null;}
async function audit(env,entidade,chave,campo,anterior,novo,usuario){if(String(anterior??'')===String(novo??''))return;await env.DB.prepare(`INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(entidade,chave,campo,String(anterior??''),String(novo??''),usuario||'admin').run();}
function normText(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');}
function adminUser(request){return clean(request.headers.get('X-AGF-Admin-User'))||'admin';}
function authorized(request,env){return !!env.ATENDE_API_TOKEN&&(request.headers.get('Authorization')||'')===`Bearer ${env.ATENDE_API_TOKEN}`;}
function clean(v){if(v===null||v===undefined)return'';const s=String(v).trim();return/^(null|undefined)$/i.test(s)?'':s;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
