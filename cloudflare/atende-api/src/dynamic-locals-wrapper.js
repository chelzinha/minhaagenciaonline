import baseApp from './portal-locais-bulk-wrapper.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/bulk-local' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveBulkLocalDynamic(request, env);
    }

    if (url.pathname === '/admin/client-alias' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveClientAliasDynamic(request, env);
    }

    if (url.pathname === '/admin/client-aliases-bulk' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveClientAliasesBulkDynamic(request, env);
    }

    return baseApp.fetch(request, env, ctx);
  }
};

async function saveBulkLocalDynamic(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const ids=(Array.isArray(body?.rawIds)?body.rawIds:[]).map(Number).filter(n=>n>0);
  if(!ids.length)return json({ok:false,error:'rawIds_required'},400);
  if(ids.length>500)return json({ok:false,error:'max_500_rows'},400);

  const localMap=await loadLocalMap(env);
  const local=resolveLocal(body?.localCodigo,localMap);
  if(clean(body?.localCodigo)&&local===null)return json({ok:false,error:'invalid_local'},400);

  const locked=await lockedRows(ids,env);
  if(locked.length)return json({
    ok:false,
    error:'local_locked_by_cliente_portal',
    message:'Uma ou mais postagens possuem Local travado pelo CLIENTE PORTAL. Altere a trava em Admin > Locais.',
    lockedCount:locked.length,
    locked:locked.slice(0,50)
  },409);

  const oldMap=new Map();
  for(let i=0;i<ids.length;i+=80){
    const chunk=ids.slice(i,i+80);
    const q=await env.DB.prepare(`SELECT raw_id,local_codigo FROM atende_postagem_overrides WHERE raw_id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all();
    (q.results||[]).forEach(r=>oldMap.set(Number(r.raw_id),clean(r.local_codigo)));
  }

  const user=adminUser(request),statements=[];
  for(const id of ids){
    if(local)statements.push(env.DB.prepare(`
      INSERT INTO atende_postagem_overrides(raw_id,local_codigo,atualizado_por,atualizado_em)
      VALUES(?,?,?,datetime('now'))
      ON CONFLICT(raw_id) DO UPDATE SET
        local_codigo=excluded.local_codigo,
        atualizado_por=excluded.atualizado_por,
        atualizado_em=datetime('now')
    `).bind(id,local,user));
    else statements.push(env.DB.prepare(`DELETE FROM atende_postagem_overrides WHERE raw_id=?`).bind(id));
  }
  for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));
  for(const id of ids)await audit(env,'postagem',String(id),'local',oldMap.get(id)||'',local||'',user);
  return json({ok:true,updated:ids.length,localCodigo:local||''});
}

async function saveClientAliasDynamic(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const aliasOriginal=rawValue(body?.aliasOriginal),aliasNorm=normText(aliasOriginal),nomeAtual=clean(body?.nomeAtual),user=adminUser(request);
  let clienteId=Number(body?.clienteId||0);
  if(!aliasNorm||!nomeAtual)return json({ok:false,error:'alias_and_nome_required'},400);

  const localMap=await loadLocalMap(env);
  const local=resolveLocal(body?.localPadrao,localMap);
  if(clean(body?.localPadrao)&&local===null)return json({ok:false,error:'invalid_local'},400);

  if(!clienteId){
    const created=await env.DB.prepare(`
      INSERT INTO atende_clientes(nome_atual,local_padrao,criado_por,atualizado_por)
      VALUES(?,?,?,?) RETURNING id
    `).bind(nomeAtual,local||null,user,user).first();
    clienteId=Number(created?.id||0);
  }else{
    const oldClient=await env.DB.prepare(`SELECT nome_atual,local_padrao FROM atende_clientes WHERE id=?`).bind(clienteId).first();
    if(!oldClient)return json({ok:false,error:'cliente_not_found'},404);
    await env.DB.prepare(`
      UPDATE atende_clientes
      SET nome_atual=?,local_padrao=?,atualizado_por=?,atualizado_em=datetime('now')
      WHERE id=?
    `).bind(nomeAtual,local||null,user,clienteId).run();
    await audit(env,'cliente',String(clienteId),'nome_atual',clean(oldClient.nome_atual),nomeAtual,user);
    await audit(env,'cliente',String(clienteId),'local_padrao',clean(oldClient.local_padrao),local||'',user);
  }

  const oldAlias=await env.DB.prepare(`SELECT cliente_id FROM atende_cliente_aliases WHERE alias_normalizado=?`).bind(aliasNorm).first();
  await env.DB.prepare(`
    INSERT INTO atende_cliente_aliases(cliente_id,alias_original,alias_normalizado,criado_por)
    VALUES(?,?,?,?)
    ON CONFLICT(alias_normalizado) DO UPDATE SET
      cliente_id=excluded.cliente_id,
      alias_original=excluded.alias_original
  `).bind(clienteId,aliasOriginal,aliasNorm,user).run();
  await audit(env,'cliente_alias',aliasNorm,'cliente_id',oldAlias?String(oldAlias.cliente_id):'',String(clienteId),user);
  return json({ok:true,clienteId});
}

async function saveClientAliasesBulkDynamic(request, env) {
  let body;
  try { body=await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }
  const source=Array.isArray(body?.items)?body.items:[];
  if(!source.length)return json({ok:false,error:'items_required'},400);
  if(source.length>1000)return json({ok:false,error:'max_1000_items'},413);

  const localMap=await loadLocalMap(env);
  const errors=[],aliasSeen=new Set(),items=[];
  source.forEach((raw,index)=>{
    const aliasOriginal=clean(raw?.aliasOriginal),aliasNorm=normText(aliasOriginal),nomeAtual=clean(raw?.nomeAtual),clienteExistente=clean(raw?.clienteExistente);
    const rawLocal=clean(raw?.localPadrao),local=resolveLocal(rawLocal,localMap);
    if(!aliasOriginal&&!nomeAtual&&!clienteExistente&&!rawLocal)return;
    if(!aliasNorm){errors.push({linha:index+2,error:'nome_recebido_required'});return;}
    if(!nomeAtual){errors.push({linha:index+2,alias:aliasOriginal,error:'nome_correto_required'});return;}
    if(rawLocal&&local===null){errors.push({linha:index+2,alias:aliasOriginal,error:'invalid_local'});return;}
    if(aliasSeen.has(aliasNorm)){errors.push({linha:index+2,alias:aliasOriginal,error:'duplicate_alias'});return;}
    aliasSeen.add(aliasNorm);
    items.push({linha:index+2,aliasOriginal,aliasNorm,nomeAtual,clienteExistente,local:local||''});
  });
  if(errors.length)return json({ok:false,error:'csv_validation_failed',details:errors.slice(0,50)},400);
  if(!items.length)return json({ok:false,error:'valid_items_required'},400);

  const clientsResult=await env.DB.prepare(`SELECT id,nome_atual,local_padrao FROM atende_clientes WHERE ativo=1 ORDER BY id`).all();
  const clients=clientsResult.results||[],byId=new Map(),byName=new Map();
  clients.forEach(c=>{const id=Number(c.id);byId.set(id,c);const key=normText(c.nome_atual);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(c);});

  const newSpecs=new Map(),targetSpecs=new Map();
  for(const item of items){
    let target=null;
    const ceNorm=normText(item.clienteExistente),createMode=!ceNorm||ceNorm==='CRIAR NOVO CLIENTE';
    if(!createMode){
      if(/^\d+$/.test(item.clienteExistente))target=byId.get(Number(item.clienteExistente))||null;
      else{
        const matches=byName.get(ceNorm)||[];
        if(matches.length===1)target=matches[0];
        else if(matches.length>1){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'cliente_existente_ambiguo'});continue;}
      }
      if(!target){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'cliente_existente_nao_encontrado'});continue;}
      item.targetId=Number(target.id);
    }else{
      const matches=byName.get(normText(item.nomeAtual))||[];
      if(matches.length===1)item.targetId=Number(matches[0].id);
      else if(matches.length>1){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'nome_correto_ambiguo'});continue;}
      else{
        const key=normText(item.nomeAtual),existing=newSpecs.get(key);
        if(existing&&(existing.nomeAtual!==item.nomeAtual||existing.local!==item.local)){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'novo_cliente_conflitante'});continue;}
        newSpecs.set(key,{nomeAtual:item.nomeAtual,local:item.local});
        item.newKey=key;
      }
    }
    const targetKey=item.targetId?'id:'+item.targetId:'new:'+item.newKey,prev=targetSpecs.get(targetKey),spec={nomeAtual:item.nomeAtual,local:item.local};
    if(prev&&(prev.nomeAtual!==spec.nomeAtual||prev.local!==spec.local))errors.push({linha:item.linha,alias:item.aliasOriginal,error:'cliente_alvo_conflitante'});
    else targetSpecs.set(targetKey,spec);
  }
  if(errors.length)return json({ok:false,error:'csv_validation_failed',details:errors.slice(0,50)},400);

  const user=adminUser(request),created=new Map();
  for(const [key,spec] of newSpecs.entries()){
    const row=await env.DB.prepare(`INSERT INTO atende_clientes(nome_atual,local_padrao,criado_por,atualizado_por) VALUES(?,?,?,?) RETURNING id`).bind(spec.nomeAtual,spec.local||null,user,user).first();
    const id=Number(row?.id||0);
    if(!id)return json({ok:false,error:'client_create_failed',nome:spec.nomeAtual},500);
    created.set(key,id);
    byId.set(id,{id,nome_atual:spec.nomeAtual,local_padrao:spec.local||null});
  }
  items.forEach(item=>{if(!item.targetId)item.targetId=created.get(item.newKey)||0;});

  const aliasOld=new Map();
  for(let i=0;i<items.length;i+=80){
    const chunk=items.slice(i,i+80);
    const q=await env.DB.prepare(`SELECT alias_normalizado,alias_original,cliente_id FROM atende_cliente_aliases WHERE alias_normalizado IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk.map(x=>x.aliasNorm)).all();
    (q.results||[]).forEach(r=>aliasOld.set(normText(r.alias_normalizado),r));
  }

  const statements=[],updatedClientIds=new Set();
  let saved=0,unchanged=0;
  for(const [targetKey,spec] of targetSpecs.entries()){
    if(!targetKey.startsWith('id:'))continue;
    const id=Number(targetKey.slice(3));
    if(updatedClientIds.has(id))continue;
    updatedClientIds.add(id);
    const old=byId.get(id)||{},oldName=clean(old.nome_atual),oldLocal=clean(old.local_padrao);
    if(oldName!==spec.nomeAtual||oldLocal!==(spec.local||'')){
      statements.push(env.DB.prepare(`UPDATE atende_clientes SET nome_atual=?,local_padrao=?,atualizado_por=?,atualizado_em=datetime('now') WHERE id=?`).bind(spec.nomeAtual,spec.local||null,user,id));
      if(oldName!==spec.nomeAtual)statements.push(auditStmt(env,'cliente',String(id),'nome_atual',oldName,spec.nomeAtual,user));
      if(oldLocal!==(spec.local||''))statements.push(auditStmt(env,'cliente',String(id),'local_padrao',oldLocal,spec.local||'',user));
    }
  }

  for(const item of items){
    const old=aliasOld.get(item.aliasNorm)||null,oldId=Number(old?.cliente_id||0),oldOriginal=clean(old?.alias_original);
    if(oldId===item.targetId&&oldOriginal===item.aliasOriginal){unchanged++;continue;}
    statements.push(env.DB.prepare(`
      INSERT INTO atende_cliente_aliases(cliente_id,alias_original,alias_normalizado,criado_por)
      VALUES(?,?,?,?)
      ON CONFLICT(alias_normalizado) DO UPDATE SET
        cliente_id=excluded.cliente_id,
        alias_original=excluded.alias_original
    `).bind(item.targetId,item.aliasOriginal,item.aliasNorm,user));
    if(oldId!==item.targetId)statements.push(auditStmt(env,'cliente_alias',item.aliasNorm,'cliente_id',oldId?String(oldId):'',String(item.targetId),user));
    saved++;
  }
  for(let i=0;i<statements.length;i+=60)await env.DB.batch(statements.slice(i,i+60));
  return json({ok:true,received:items.length,saved,unchanged,clientsCreated:created.size});
}

async function loadLocalMap(env){
  const q=await env.DB.prepare(`SELECT codigo,nome FROM atende_locais WHERE ativo=1`).all();
  const map=new Map();
  (q.results||[]).forEach(r=>{
    const code=clean(r.codigo).toUpperCase();
    if(!code)return;
    map.set(normText(code),code);
    map.set(normText(r.nome),code);
  });
  return map;
}
function resolveLocal(value,map){const s=clean(value);if(!s)return'';return map.get(normText(s))||null;}
async function lockedRows(ids,env){
  const out=[];
  for(let i=0;i<ids.length;i+=80){
    const chunk=ids.slice(i,i+80);
    const q=await env.DB.prepare(`
      SELECT cp.raw_id,cp.cliente_portal,pcl.local_codigo
      FROM atende_cliente_portal cp
      JOIN atende_cliente_portal_local pcl ON pcl.cliente_portal_norm=cp.cliente_portal_norm AND pcl.ativo=1
      WHERE cp.raw_id IN (${chunk.map(()=>'?').join(',')})
    `).bind(...chunk).all();
    out.push(...(q.results||[]));
  }
  return out;
}
function auditStmt(env,entidade,chave,campo,anterior,novo,usuario){return env.DB.prepare(`INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(entidade,chave,campo,String(anterior??''),String(novo??''),usuario||'admin');}
async function audit(env,entidade,chave,campo,anterior,novo,usuario){if(String(anterior??'')===String(novo??''))return;await auditStmt(env,entidade,chave,campo,anterior,novo,usuario).run();}
function rawValue(v){return v===null||v===undefined?'':String(v);}
function normText(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');}
function adminUser(request){return clean(request.headers.get('X-AGF-Admin-User'))||'admin';}
function authorized(request,env){return !!env.ATENDE_API_TOKEN&&(request.headers.get('Authorization')||'')===`Bearer ${env.ATENDE_API_TOKEN}`;}
function clean(v){if(v===null||v===undefined)return'';const s=String(v).trim();return/^(null|undefined)$/i.test(s)?'':s;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
