import rawApp from './index.js';
import panelV2 from './panel-v2.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((url.pathname === '/atende' || url.pathname === '/filters') && request.method === 'GET') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      const ready = await rawReady(env);
      if (!ready) return url.pathname === '/atende' ? legacyAtende(url, env) : legacyFilters(env);
      return panelV2.fetch(request, env, ctx);
    }

    if (url.pathname === '/admin/bootstrap' && request.method === 'GET') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      return adminBootstrapV2(env);
    }
    if (url.pathname === '/admin/contract' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      return adminSaveContractV2(request, env);
    }
    if (url.pathname === '/admin/services-bulk' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      return adminBulkServices(request, env);
    }
    if (url.pathname === '/admin/contracts-bulk' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      return adminBulkContracts(request, env);
    }
    if (url.pathname === '/admin/client-aliases-bulk' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
      return adminBulkClientAliases(request, env);
    }

    return rawApp.fetch(request, env, ctx);
  }
};

async function rawReady(env) {
  try {
    const [configResult, legacyResult, rawResult] = await env.DB.batch([
      env.DB.prepare(`SELECT valor FROM atende_runtime_config WHERE chave = 'panel_source'`),
      env.DB.prepare(`SELECT COUNT(*) AS total FROM atende_postagens`),
      env.DB.prepare(`SELECT COUNT(*) AS total FROM atende_postagens_raw r JOIN atende_raw_importacoes ri ON ri.import_key=r.import_key AND ri.concluido_em IS NOT NULL`)
    ]);
    const source = String(configResult?.results?.[0]?.valor || 'legacy').toLowerCase();
    if (source !== 'raw') return false;
    const legacyTotal = Number(legacyResult?.results?.[0]?.total || 0);
    const rawTotal = Number(rawResult?.results?.[0]?.total || 0);
    return rawTotal > 0 && (legacyTotal === 0 || rawTotal >= legacyTotal);
  } catch (_) { return false; }
}

function authorized(request, env) {
  return !!env.ATENDE_API_TOKEN && (request.headers.get('Authorization') || '') === `Bearer ${env.ATENDE_API_TOKEN}`;
}

async function adminBootstrapV2(env) {
  const rawJoin = `
    FROM atende_postagens_raw r
    JOIN atende_raw_importacoes ri
      ON ri.import_key=r.import_key
     AND ri.concluido_em IS NOT NULL
  `;
  const [services, attendants, contracts, clients, historyRows] = await Promise.all([
    env.DB.prepare(`
      SELECT r.codigo_servico_norm AS codigo,
             MAX(r.nome_servico) AS nome,
             COUNT(*) AS ocorrencias,
             sc.tipo_objeto
      ${rawJoin}
      LEFT JOIN atende_servico_classificacao sc ON sc.codigo_servico=r.codigo_servico_norm
      WHERE r.codigo_servico_norm <> ''
      GROUP BY r.codigo_servico_norm, sc.tipo_objeto
      ORDER BY MAX(r.nome_servico) COLLATE NOCASE ASC, r.codigo_servico_norm ASC
      LIMIT 2000
    `).all(),
    env.DB.prepare(`
      SELECT r.atendente_norm AS codigo,
             COUNT(*) AS ocorrencias,
             a.nome
      ${rawJoin}
      LEFT JOIN atende_atendentes a ON a.codigo=r.atendente_norm AND a.ativo=1
      WHERE r.atendente_norm <> ''
      GROUP BY r.atendente_norm, a.nome
      ORDER BY COALESCE(a.nome,r.atendente_norm) COLLATE NOCASE ASC
      LIMIT 1000
    `).all(),
    env.DB.prepare(`
      SELECT r.numero_contrato_norm AS numero,
             COUNT(*) AS ocorrencias,
             co.cliente,
             co.tipo,
             co.nome
      ${rawJoin}
      LEFT JOIN atende_contratos co ON co.numero=r.numero_contrato_norm AND co.ativo=1
      WHERE r.numero_contrato_norm <> ''
      GROUP BY r.numero_contrato_norm, co.cliente, co.tipo, co.nome
      ORDER BY COALESCE(co.cliente,co.nome,r.numero_contrato_norm) COLLATE NOCASE ASC
      LIMIT 2000
    `).all(),
    env.DB.prepare(`
      SELECT c.id,c.nome_atual,c.local_padrao,c.ativo,COUNT(ca.id) AS aliases
      FROM atende_clientes c
      LEFT JOIN atende_cliente_aliases ca ON ca.cliente_id=c.id
      GROUP BY c.id
      ORDER BY c.nome_atual COLLATE NOCASE ASC
      LIMIT 2000
    `).all(),
    env.DB.prepare(`
      SELECT entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em
      FROM atende_admin_historico
      ORDER BY id DESC
      LIMIT 100
    `).all()
  ]);
  return json({
    ok:true,
    servicos:services.results||[],
    atendentes:attendants.results||[],
    contratos:contracts.results||[],
    clientes:clients.results||[],
    locais:[{codigo:'AGF',nome:'AGF'},{codigo:'METRO',nome:'METRÔ'}],
    historico:historyRows.results||[]
  });
}

async function adminSaveContractV2(request, env) {
  let body; try { body=await request.json(); } catch (_) { return json({ok:false,error:'invalid_json'},400); }
  const numero=clean(body?.numero).toUpperCase();
  const cliente=clean(body?.cliente);
  const tipo=clean(body?.tipo);
  const nome=clean(body?.nome);
  const user=adminUser(request);
  if(!numero)return json({ok:false,error:'numero_required'},400);
  if(!cliente)return json({ok:false,error:'cliente_required'},400);
  if(!nome)return json({ok:false,error:'intermediador_required'},400);

  const old=await env.DB.prepare(`SELECT cliente,nome,tipo FROM atende_contratos WHERE numero=?`).bind(numero).first();
  const oldObj={cliente:clean(old?.cliente),tipo:clean(old?.tipo),nome:clean(old?.nome)};
  const newObj={cliente,tipo,nome};
  if(old&&JSON.stringify(oldObj)===JSON.stringify(newObj))return json({ok:true,unchanged:true});

  await env.DB.prepare(`
    INSERT INTO atende_contratos(numero,cliente,nome,tipo,observacao,ativo,atualizado_por,atualizado_em)
    VALUES(?,?,?,?,NULL,1,?,datetime('now'))
    ON CONFLICT(numero) DO UPDATE SET
      cliente=excluded.cliente,
      nome=excluded.nome,
      tipo=excluded.tipo,
      observacao=NULL,
      ativo=1,
      atualizado_por=excluded.atualizado_por,
      atualizado_em=datetime('now')
  `).bind(numero,cliente,nome,tipo,user).run();
  await env.DB.prepare(`
    INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em)
    VALUES('contrato',?,'cadastro',?,?,?,datetime('now'))
  `).bind(numero,JSON.stringify(oldObj),JSON.stringify(newObj),user).run();
  return json({ok:true});
}

async function adminBulkServices(request, env) {
  let body; try { body = await request.json(); } catch (_) { return json({ok:false,error:'invalid_json'},400); }
  const source=Array.isArray(body?.items)?body.items:[];
  if(!source.length)return json({ok:false,error:'items_required'},400);
  if(source.length>500)return json({ok:false,error:'max_500_items'},413);
  const seen=new Set(),items=[];
  for(const raw of source){const codigo=clean(raw?.codigo).toUpperCase(),tipoObjeto=clean(raw?.tipoObjeto).toUpperCase(),nomeServico=clean(raw?.nomeServico);if(!codigo||seen.has(codigo))continue;if(tipoObjeto&&!['PRODUTO ECT','SEM REGISTRO'].includes(tipoObjeto))return json({ok:false,error:'invalid_tipo_objeto',codigo},400);seen.add(codigo);items.push({codigo,tipoObjeto,nomeServico});}
  if(!items.length)return json({ok:false,error:'valid_items_required'},400);
  const placeholders=items.map(()=>'?').join(',');
  const currentRows=await env.DB.prepare(`SELECT codigo_servico,nome_servico_referencia,tipo_objeto FROM atende_servico_classificacao WHERE codigo_servico IN (${placeholders})`).bind(...items.map(x=>x.codigo)).all();
  const current=new Map((currentRows.results||[]).map(row=>[String(row.codigo_servico||''),row])),user=adminUser(request),statements=[];let changed=0,unchanged=0;
  for(const item of items){const old=current.get(item.codigo)||null,oldTipo=clean(old?.tipo_objeto).toUpperCase(),oldNome=clean(old?.nome_servico_referencia),typeChanged=oldTipo!==item.tipoObjeto,nameChanged=oldNome!==item.nomeServico;if(!typeChanged&&!nameChanged){unchanged++;continue;}if(!item.tipoObjeto)statements.push(env.DB.prepare(`DELETE FROM atende_servico_classificacao WHERE codigo_servico=?`).bind(item.codigo));else statements.push(env.DB.prepare(`INSERT INTO atende_servico_classificacao(codigo_servico,nome_servico_referencia,tipo_objeto,atualizado_por,atualizado_em) VALUES(?,?,?,?,datetime('now')) ON CONFLICT(codigo_servico) DO UPDATE SET nome_servico_referencia=excluded.nome_servico_referencia,tipo_objeto=excluded.tipo_objeto,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`).bind(item.codigo,item.nomeServico,item.tipoObjeto,user));if(typeChanged)statements.push(auditStmt(env,'servico',item.codigo,'tipo_objeto',oldTipo,item.tipoObjeto,user));changed++;}
  for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
  return json({ok:true,received:items.length,saved:changed,unchanged});
}

async function adminBulkContracts(request, env) {
  let body; try { body=await request.json(); } catch (_) { return json({ok:false,error:'invalid_json'},400); }
  const source=Array.isArray(body?.items)?body.items:[];
  if(!source.length)return json({ok:false,error:'items_required'},400);
  if(source.length>1000)return json({ok:false,error:'max_1000_items'},413);

  const map=new Map(),errors=[];
  source.forEach((raw,index)=>{
    const numero=clean(raw?.numero).toUpperCase();
    const cliente=clean(raw?.cliente);
    const tipo=clean(raw?.tipo);
    const nome=clean(raw?.nome);
    if(!numero&&!cliente&&!tipo&&!nome)return;
    if(!numero){errors.push({linha:index+2,error:'contrato_required'});return;}
    if(!cliente){errors.push({linha:index+2,contrato:numero,error:'cliente_required'});return;}
    if(!nome){errors.push({linha:index+2,contrato:numero,error:'intermediador_required'});return;}
    const prev=map.get(numero),next={numero,cliente,tipo,nome};
    if(prev&&JSON.stringify(prev)!==JSON.stringify(next))errors.push({linha:index+2,contrato:numero,error:'duplicate_contract_conflict'});
    else map.set(numero,next);
  });
  if(errors.length)return json({ok:false,error:'csv_validation_failed',details:errors.slice(0,50)},400);

  const items=Array.from(map.values());
  if(!items.length)return json({ok:false,error:'valid_items_required'},400);

  const current=new Map();
  for(let i=0;i<items.length;i+=80){
    const chunk=items.slice(i,i+80);
    const q=await env.DB.prepare(`SELECT numero,cliente,nome,tipo FROM atende_contratos WHERE numero IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk.map(x=>x.numero)).all();
    (q.results||[]).forEach(r=>current.set(clean(r.numero).toUpperCase(),r));
  }

  const user=adminUser(request),statements=[];
  let saved=0,unchanged=0;
  for(const item of items){
    const old=current.get(item.numero)||null;
    const oldObj={cliente:clean(old?.cliente),tipo:clean(old?.tipo),nome:clean(old?.nome)};
    const newObj={cliente:item.cliente,tipo:item.tipo,nome:item.nome};
    if(old&&JSON.stringify(oldObj)===JSON.stringify(newObj)){unchanged++;continue;}
    statements.push(env.DB.prepare(`
      INSERT INTO atende_contratos(numero,cliente,nome,tipo,observacao,ativo,atualizado_por,atualizado_em)
      VALUES(?,?,?,?,NULL,1,?,datetime('now'))
      ON CONFLICT(numero) DO UPDATE SET
        cliente=excluded.cliente,
        nome=excluded.nome,
        tipo=excluded.tipo,
        observacao=NULL,
        ativo=1,
        atualizado_por=excluded.atualizado_por,
        atualizado_em=datetime('now')
    `).bind(item.numero,item.cliente,item.nome,item.tipo,user));
    statements.push(auditStmt(env,'contrato',item.numero,'cadastro',JSON.stringify(oldObj),JSON.stringify(newObj),user));
    saved++;
  }
  for(let i=0;i<statements.length;i+=70)await env.DB.batch(statements.slice(i,i+70));
  return json({ok:true,received:items.length,saved,unchanged});
}

async function adminBulkClientAliases(request, env) {
  let body; try { body=await request.json(); } catch (_) { return json({ok:false,error:'invalid_json'},400); }
  const source=Array.isArray(body?.items)?body.items:[];
  if(!source.length)return json({ok:false,error:'items_required'},400);
  if(source.length>1000)return json({ok:false,error:'max_1000_items'},413);

  const errors=[],aliasSeen=new Set(),items=[];
  source.forEach((raw,index)=>{const aliasOriginal=clean(raw?.aliasOriginal),aliasNorm=normText(aliasOriginal),nomeAtual=clean(raw?.nomeAtual),clienteExistente=clean(raw?.clienteExistente),local=normalizeLocal(raw?.localPadrao);if(!aliasOriginal&&!nomeAtual&&!clienteExistente&&!clean(raw?.localPadrao))return;if(!aliasNorm){errors.push({linha:index+2,error:'nome_recebido_required'});return;}if(!nomeAtual){errors.push({linha:index+2,alias:aliasOriginal,error:'nome_correto_required'});return;}if(local===null){errors.push({linha:index+2,alias:aliasOriginal,error:'invalid_local'});return;}if(aliasSeen.has(aliasNorm)){errors.push({linha:index+2,alias:aliasOriginal,error:'duplicate_alias'});return;}aliasSeen.add(aliasNorm);items.push({linha:index+2,aliasOriginal,aliasNorm,nomeAtual,clienteExistente,local});});
  if(errors.length)return json({ok:false,error:'csv_validation_failed',details:errors.slice(0,50)},400);
  if(!items.length)return json({ok:false,error:'valid_items_required'},400);

  const clientsResult=await env.DB.prepare(`SELECT id,nome_atual,local_padrao FROM atende_clientes WHERE ativo=1 ORDER BY id`).all();
  const clients=clientsResult.results||[],byId=new Map(),byName=new Map();
  clients.forEach(c=>{const id=Number(c.id);byId.set(id,c);const key=normText(c.nome_atual);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(c);});

  const newSpecs=new Map(),targetSpecs=new Map();
  for(const item of items){let target=null;const ceNorm=normText(item.clienteExistente);const createMode=!ceNorm||ceNorm==='CRIAR NOVO CLIENTE';if(!createMode){if(/^\d+$/.test(item.clienteExistente)){target=byId.get(Number(item.clienteExistente))||null;}else{const matches=byName.get(ceNorm)||[];if(matches.length===1)target=matches[0];else if(matches.length>1){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'cliente_existente_ambiguo'});continue;}}if(!target){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'cliente_existente_nao_encontrado'});continue;}item.targetId=Number(target.id);}else{const matches=byName.get(normText(item.nomeAtual))||[];if(matches.length===1)item.targetId=Number(matches[0].id);else if(matches.length>1){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'nome_correto_ambiguo'});continue;}else{const key=normText(item.nomeAtual),existing=newSpecs.get(key);if(existing&&(existing.nomeAtual!==item.nomeAtual||existing.local!==item.local)){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'novo_cliente_conflitante'});continue;}newSpecs.set(key,{nomeAtual:item.nomeAtual,local:item.local});item.newKey=key;}}
    const targetKey=item.targetId?'id:'+item.targetId:'new:'+item.newKey,prev=targetSpecs.get(targetKey),spec={nomeAtual:item.nomeAtual,local:item.local};if(prev&&(prev.nomeAtual!==spec.nomeAtual||prev.local!==spec.local)){errors.push({linha:item.linha,alias:item.aliasOriginal,error:'cliente_alvo_conflitante'});}else targetSpecs.set(targetKey,spec);
  }
  if(errors.length)return json({ok:false,error:'csv_validation_failed',details:errors.slice(0,50)},400);

  const user=adminUser(request),created=new Map();
  for(const [key,spec] of newSpecs.entries()){const row=await env.DB.prepare(`INSERT INTO atende_clientes(nome_atual,local_padrao,criado_por,atualizado_por) VALUES(?,?,?,?) RETURNING id`).bind(spec.nomeAtual,spec.local||null,user,user).first();const id=Number(row?.id||0);if(!id)return json({ok:false,error:'client_create_failed',nome:spec.nomeAtual},500);created.set(key,id);byId.set(id,{id,nome_atual:spec.nomeAtual,local_padrao:spec.local||null});}
  items.forEach(item=>{if(!item.targetId)item.targetId=created.get(item.newKey)||0;});

  const aliasOld=new Map();for(let i=0;i<items.length;i+=80){const chunk=items.slice(i,i+80),q=await env.DB.prepare(`SELECT alias_normalizado,alias_original,cliente_id FROM atende_cliente_aliases WHERE alias_normalizado IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk.map(x=>x.aliasNorm)).all();(q.results||[]).forEach(r=>aliasOld.set(normText(r.alias_normalizado),r));}

  const statements=[],updatedClientIds=new Set();let saved=0,unchanged=0;
  for(const [targetKey,spec] of targetSpecs.entries()){if(!targetKey.startsWith('id:'))continue;const id=Number(targetKey.slice(3));if(updatedClientIds.has(id))continue;updatedClientIds.add(id);const old=byId.get(id)||{},oldName=clean(old.nome_atual),oldLocal=normalizeLocal(old.local_padrao)||'';if(oldName!==spec.nomeAtual||oldLocal!==(spec.local||'')){statements.push(env.DB.prepare(`UPDATE atende_clientes SET nome_atual=?,local_padrao=?,atualizado_por=?,atualizado_em=datetime('now') WHERE id=?`).bind(spec.nomeAtual,spec.local||null,user,id));if(oldName!==spec.nomeAtual)statements.push(auditStmt(env,'cliente',String(id),'nome_atual',oldName,spec.nomeAtual,user));if(oldLocal!==(spec.local||''))statements.push(auditStmt(env,'cliente',String(id),'local_padrao',oldLocal,spec.local||'',user));}}
  for(const item of items){const old=aliasOld.get(item.aliasNorm)||null,oldId=Number(old?.cliente_id||0),oldOriginal=clean(old?.alias_original);if(oldId===item.targetId&&oldOriginal===item.aliasOriginal){unchanged++;continue;}statements.push(env.DB.prepare(`INSERT INTO atende_cliente_aliases(cliente_id,alias_original,alias_normalizado,criado_por) VALUES(?,?,?,?) ON CONFLICT(alias_normalizado) DO UPDATE SET cliente_id=excluded.cliente_id,alias_original=excluded.alias_original`).bind(item.targetId,item.aliasOriginal,item.aliasNorm,user));if(oldId!==item.targetId)statements.push(auditStmt(env,'cliente_alias',item.aliasNorm,'cliente_id',oldId?String(oldId):'',String(item.targetId),user));saved++;}
  for(let i=0;i<statements.length;i+=60)await env.DB.batch(statements.slice(i,i+60));
  return json({ok:true,received:items.length,saved,unchanged,clientsCreated:created.size});
}

function auditStmt(env,entidade,chave,campo,anterior,novo,usuario){return env.DB.prepare(`INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(entidade,chave,campo,String(anterior??''),String(novo??''),usuario||'admin');}
function adminUser(request){return clean(request.headers.get('X-AGF-Admin-User'))||'admin'}
function normText(v){return clean(v).toUpperCase().replace(/\s+/g,' ')}
function normalizeLocal(v){const s=clean(v);if(!s)return'';const n=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();if(n==='AGF')return'AGF';if(n==='METRO')return'METRO';return null;}

const SORT = Object.freeze({DATA:'data_postagem','CEP DESTINATARIO':'cep_destinatario','CEP REMETENTE':'cep_remetente',SRO:'codigo_objeto',SERVICO:'codigo_servico','NOME REMETENTE':'nome_remetente','CARTAO POSTAGEM':'cartao_postagem',CONTRATO:'numero_contrato',SISTEMA:'sistema_postagem',VALOR:'valor_atendimento',ESTORNO:'estorno',ATENDENTE:'cpf_matricula_atendente','MODALIDADE PAGAMENTO':'modalidade_pagamento','FORMA PAGAMENTO':'forma_pagamento'});

async function legacyAtende(url, env) {
  const page=Math.max(1,Number(url.searchParams.get('page')||1)),pageSize=Math.min(200,Math.max(1,Number(url.searchParams.get('pageSize')||100))),offset=(page-1)*pageSize,dataInicio=clean(url.searchParams.get('dataInicio')),dataFim=clean(url.searchParams.get('dataFim')),q=clean(url.searchParams.get('q')),servico=clean(url.searchParams.get('servico')),contrato=clean(url.searchParams.get('contrato')),sistema=clean(url.searchParams.get('sistema')),estorno=clean(url.searchParams.get('estorno')),atendente=clean(url.searchParams.get('atendente')),modalidade=clean(url.searchParams.get('modalidadePagamento')),forma=clean(url.searchParams.get('formaPagamento')),sortKey=clean(url.searchParams.get('sortKey'))||'DATA',sortField=SORT[sortKey]||SORT.DATA,sortDir=String(url.searchParams.get('sortDir')||'desc').toLowerCase()==='asc'?'ASC':'DESC',where=[],args=[];
  if(dataInicio){where.push('substr(data_postagem,1,10)>=?');args.push(dataInicio)}if(dataFim){where.push('substr(data_postagem,1,10)<=?');args.push(dataFim)}if(q){const like=`%${q}%`;where.push(`(codigo_objeto LIKE ? OR atendimento LIKE ? OR nome_remetente LIKE ? OR cep_destinatario LIKE ? OR cep_remetente LIKE ? OR numero_contrato LIKE ? OR cartao_postagem LIKE ? OR sistema_postagem LIKE ? OR cpf_matricula_atendente LIKE ?)`);args.push(...Array(9).fill(like))}exact(where,args,'codigo_servico',servico);exact(where,args,'numero_contrato',contrato);exact(where,args,'sistema_postagem',sistema);exact(where,args,'estorno',estorno);exact(where,args,'cpf_matricula_atendente',atendente);exact(where,args,'modalidade_pagamento',modalidade);exact(where,args,'forma_pagamento',forma);
  const ws=where.length?` WHERE ${where.join(' AND ')}`:'',summary=await env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(valor_atendimento),0) AS total_value FROM atende_postagens${ws}`).bind(...args).first(),select=`data_postagem AS "DATA",cep_destinatario AS "CEP DESTINATARIO",cep_remetente AS "CEP REMETENTE",codigo_objeto AS "SRO",codigo_servico AS "SERVICO",nome_remetente AS "NOME REMETENTE",cartao_postagem AS "CARTAO POSTAGEM",numero_contrato AS "CONTRATO",sistema_postagem AS "SISTEMA",valor_atendimento AS "VALOR",estorno AS "ESTORNO",cpf_matricula_atendente AS "ATENDENTE",modalidade_pagamento AS "MODALIDADE PAGAMENTO",forma_pagamento AS "FORMA PAGAMENTO"`,result=await env.DB.prepare(`SELECT ${select} FROM atende_postagens${ws} ORDER BY ${sortField} ${sortDir},source_key ASC LIMIT ? OFFSET ?`).bind(...args,pageSize,offset).all(),rows=(result.results||[]).map(r=>{r.DATA=formatDateBR(r.DATA);return r}),total=Number(summary?.total||0);return json({ok:true,rows,page,pageSize,total,totalValue:Number(summary?.total_value||0),pages:Math.max(1,Math.ceil(total/pageSize)),sortKey:SORT[sortKey]?sortKey:'DATA',sortDir:sortDir.toLowerCase()});
}
async function legacyFilters(env){const specs=[['servicos','codigo_servico'],['contratos','numero_contrato'],['sistemas','sistema_postagem'],['estornos','estorno'],['atendentes','cpf_matricula_atendente'],['modalidadesPagamento','modalidade_pagamento'],['formasPagamento','forma_pagamento']],results=await env.DB.batch(specs.map(([,f])=>env.DB.prepare(`SELECT DISTINCT ${f} AS value FROM atende_postagens WHERE ${f} IS NOT NULL AND TRIM(${f})<>'' ORDER BY ${f} COLLATE NOCASE ASC LIMIT 1000`))),body={ok:true};specs.forEach(([k],i)=>body[k]=(results[i]?.results||[]).map(r=>clean(r.value)).filter(Boolean));return json(body);}
function exact(where,args,field,value){if(!value)return;where.push(`${field}=? COLLATE NOCASE`);args.push(value)}
function clean(v){if(v===null||v===undefined)return'';const s=String(v).trim();return /^(null|undefined)$/i.test(s)?'':s}
function formatDateBR(v){const t=clean(v),m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:t}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
