const SOURCE_HEADERS = [
  'ATENDIMENTO','ALTURA','CEP_DESTINATARIO','CEP_REMETENTE','MCU','CODIGO_OBJETO',
  'CODIGO_SERVICO','COMPRIMENTO','DATA_POSTAGEM','DIAMETRO','LARGURA','NOME_DESTINATARIO',
  'NOME_REMETENTE','NOME_SERVICO','CARTAO_POSTAGEM','NUMERO_CONTRATO','NUMERO_PLP',
  'SISTEMA_POSTAGEM','PESO','PESO_TARIFADO','VALOR_ATENDIMENTO','VALOR_DECLARADO','ESTORNO',
  'CPF_MATRICULA_ATENDENTE','MODALIDADE_PAGAMENTO','FORMA_PAGAMENTO'
];

const PANEL_COLUMNS = [
  { key:'DATA', field:'r.data_postagem_iso' },
  { key:'CEP DESTINATARIO', field:'r.cep_destinatario' },
  { key:'CEP REMETENTE', field:'r.cep_remetente' },
  { key:'OBJETO', field:'objeto_exibido' },
  { key:'COD SERVICO', field:'r.codigo_servico_norm' },
  { key:'SERVICO', field:'r.nome_servico' },
  { key:'NOME REMETENTE', field:'nome_remetente_exibido' },
  { key:'CARTAO POSTAGEM', field:'r.cartao_postagem' },
  { key:'CONTRATO', field:'r.numero_contrato_norm' },
  { key:'NOME CONTRATO', field:'co.nome' },
  { key:'SISTEMA', field:'r.sistema_postagem' },
  { key:'VALOR', field:'r.valor_atendimento_num' },
  { key:'ESTORNO', field:'r.estorno' },
  { key:'ATENDENTE', field:'r.atendente_norm' },
  { key:'NOME ATENDENTE', field:'a.nome' },
  { key:'MODALIDADE PAGAMENTO', field:'r.modalidade_pagamento' },
  { key:'FORMA PAGAMENTO', field:'r.forma_pagamento' },
  { key:'LOCAL', field:'local_exibido' }
];

const SORT_FIELDS = Object.freeze(Object.fromEntries(PANEL_COLUMNS.map(x => [x.key, x.field])));
const OBJETO_VAZIO_SQL = `(r.codigo_objeto IS NULL OR TRIM(r.codigo_objeto) = '' OR LOWER(TRIM(r.codigo_objeto)) = 'null')`;
const BASE_FROM = `
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri ON ri.import_key = r.import_key AND ri.concluido_em IS NOT NULL
  LEFT JOIN atende_cliente_aliases ca ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c ON c.id = ca.cliente_id AND c.ativo = 1
  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1
  LEFT JOIN atende_contratos co ON co.numero = r.numero_contrato_norm AND co.ativo = 1
  LEFT JOIN atende_servico_classificacao sc ON sc.codigo_servico = r.codigo_servico_norm
  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id
  LEFT JOIN atende_sro_counts sd ON sd.codigo_objeto_norm = r.codigo_objeto_norm
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const raw = await env.DB.prepare(`SELECT COUNT(*) AS n FROM atende_postagens_raw`).first().catch(() => ({n:0}));
      return json({ ok:true, service:'agf-atende-api', rawRows:Number(raw?.n || 0) });
    }
    if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);
    if (request.method === 'POST' && url.pathname === '/ingest') return ingestRaw(request, env);
    if (request.method === 'GET' && url.pathname === '/atende') return listAtende(url, env);
    if (request.method === 'GET' && url.pathname === '/filters') return listFilters(env);
    if (request.method === 'GET' && url.pathname === '/imports/check') return checkImport(url, env);
    if (url.pathname === '/admin/bootstrap' && request.method === 'GET') return adminBootstrap(env);
    if (url.pathname === '/admin/service' && request.method === 'POST') return adminSaveService(request, env);
    if (url.pathname === '/admin/attendant' && request.method === 'POST') return adminSaveAttendant(request, env);
    if (url.pathname === '/admin/contract' && request.method === 'POST') return adminSaveContract(request, env);
    if (url.pathname === '/admin/client-alias' && request.method === 'POST') return adminSaveClientAlias(request, env);
    if (url.pathname === '/admin/bulk-local' && request.method === 'POST') return adminBulkLocal(request, env);
    return json({ ok:false, error:'not_found' }, 404);
  }
};

function authorized(request, env) {
  if (!env.ATENDE_API_TOKEN) return false;
  return (request.headers.get('Authorization') || '') === `Bearer ${env.ATENDE_API_TOKEN}`;
}

async function checkImport(url, env) {
  const fileId = clean(url.searchParams.get('fileId'));
  const hash = clean(url.searchParams.get('hash'));
  if (!fileId || !hash) return json({ ok:false, error:'fileId_and_hash_required' }, 400);
  const importKey = makeImportKey(fileId, hash);
  const row = await env.DB.prepare(`
    SELECT arquivo_nome, arquivo_hash, arquivo_id, total_linhas, recebidas, gravadas, concluido_em
    FROM atende_raw_importacoes WHERE import_key = ?
  `).bind(importKey).first();
  return json({ ok:true, found:!!row, completed:!!(row && row.concluido_em), import:row || null });
}

async function ingestRaw(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok:false, error:'invalid_json' }, 400); }
  const fileId = clean(body.fileId), fileName = clean(body.fileName), fileHash = clean(body.fileHash), fileModifiedAt = clean(body.fileModifiedAt);
  const totalRows = Math.max(0, Number(body.totalRows || 0)), offset = Math.max(0, Number(body.offset || 0)), isFinal = body.final === true;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!fileId || !fileName || !fileHash) return json({ ok:false, error:'fileId_fileName_fileHash_required' }, 400);
  if (!rows.length) return json({ ok:false, error:'rows_required' }, 400);
  if (rows.length > 1000) return json({ ok:false, error:'max_1000_rows_per_request' }, 413);

  const importKey = makeImportKey(fileId, fileHash);
  const previous = await env.DB.prepare(`SELECT concluido_em FROM atende_raw_importacoes WHERE import_key = ?`).bind(importKey).first();
  if (previous && previous.concluido_em) return json({ ok:true, duplicateFile:true, completed:true, received:0, inserted:0 });

  await env.DB.prepare(`
    INSERT INTO atende_raw_importacoes (import_key, arquivo_id, arquivo_hash, arquivo_nome, arquivo_modificado_em,total_linhas, recebidas, gravadas, invalidas)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
    ON CONFLICT(import_key) DO UPDATE SET arquivo_nome=excluded.arquivo_nome,arquivo_modificado_em=excluded.arquivo_modificado_em,total_linhas=excluded.total_linhas
  `).bind(importKey, fileId, fileHash, fileName, fileModifiedAt, totalRows).run();

  const statements = [];
  let invalid = 0;
  rows.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') { invalid++; return; }
    const lineNumber = offset + index + 1;
    statements.push(env.DB.prepare(rawInsertSql()).bind(...rawInsertValues(raw, { importKey, fileId, fileHash, fileName, lineNumber })));
  });
  let inserted = 0;
  for (let i = 0; i < statements.length; i += 100) {
    const results = await env.DB.batch(statements.slice(i, i + 100));
    for (const result of results) inserted += Number(result?.meta?.changes || 0);
  }

  const receivedThrough = offset + rows.length;
  const shouldComplete = isFinal && receivedThrough >= totalRows;
  await env.DB.prepare(`
    UPDATE atende_raw_importacoes
    SET recebidas = MAX(recebidas, ?),
        gravadas = (SELECT COUNT(*) FROM atende_postagens_raw WHERE import_key = ?),
        invalidas = invalidas + ?,
        concluido_em = CASE WHEN ? = 1 THEN datetime('now') ELSE concluido_em END
    WHERE import_key = ?
  `).bind(receivedThrough, importKey, invalid, shouldComplete ? 1 : 0, importKey).run();

  const state = await env.DB.prepare(`SELECT total_linhas, recebidas, gravadas, invalidas, concluido_em FROM atende_raw_importacoes WHERE import_key = ?`).bind(importKey).first();
  if (shouldComplete && Number(state?.gravadas || 0) !== totalRows) {
    await env.DB.prepare(`UPDATE atende_raw_importacoes SET concluido_em = NULL WHERE import_key = ?`).bind(importKey).run();
    return json({ ok:false, error:'raw_line_count_mismatch', expected:totalRows, stored:Number(state?.gravadas || 0) }, 409);
  }
  if (shouldComplete && state?.concluido_em) await rebuildSroCounts(env);

  return json({ ok:true, duplicateFile:false, received:rows.length, inserted, invalid, receivedThrough, stored:Number(state?.gravadas || 0), completed:!!state?.concluido_em });
}

async function rebuildSroCounts(env) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM atende_sro_counts`),
    env.DB.prepare(`
      INSERT INTO atende_sro_counts(codigo_objeto_norm, ocorrencias)
      SELECT r.codigo_objeto_norm, COUNT(*)
      FROM atende_postagens_raw r
      JOIN atende_raw_importacoes ri ON ri.import_key=r.import_key AND ri.concluido_em IS NOT NULL
      WHERE r.codigo_objeto_norm LIKE '%BR'
      GROUP BY r.codigo_objeto_norm
      HAVING COUNT(*) > 1
    `)
  ]);
}

function rawInsertSql() {
  return `INSERT OR IGNORE INTO atende_postagens_raw (
    import_key, arquivo_id, arquivo_hash, arquivo_nome, numero_linha,
    atendimento, altura, cep_destinatario, cep_remetente, mcu, codigo_objeto,codigo_servico, comprimento, data_postagem, diametro, largura, nome_destinatario,nome_remetente, nome_servico, cartao_postagem, numero_contrato, numero_plp,sistema_postagem, peso, peso_tarifado, valor_atendimento, valor_declarado, estorno,cpf_matricula_atendente, modalidade_pagamento, forma_pagamento,
    data_postagem_iso, valor_atendimento_num, codigo_objeto_norm, codigo_servico_norm,nome_remetente_norm, numero_contrato_norm, atendente_norm
  ) VALUES (${Array(38).fill('?').join(',')})`;
}

function rawInsertValues(raw, meta) {
  const original = {};
  for (const h of SOURCE_HEADERS) original[h] = rawValue(raw[h]);
  return [meta.importKey, meta.fileId, meta.fileHash, meta.fileName, meta.lineNumber,
    ...SOURCE_HEADERS.map(h => original[h]), normalizeDateTime(original.DATA_POSTAGEM), num(original.VALOR_ATENDIMENTO),
    normCode(original.CODIGO_OBJETO), normCode(original.CODIGO_SERVICO), normText(original.NOME_REMETENTE), normCode(original.NUMERO_CONTRATO), normCode(original.CPF_MATRICULA_ATENDENTE)];
}

async function listAtende(url, env) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('pageSize') || 100)));
  const offset = (page - 1) * pageSize;
  const dataInicio=clean(url.searchParams.get('dataInicio')),dataFim=clean(url.searchParams.get('dataFim')),q=clean(url.searchParams.get('q')),
    servico=clean(url.searchParams.get('servico')),contrato=clean(url.searchParams.get('contrato')),sistema=clean(url.searchParams.get('sistema')),
    estorno=clean(url.searchParams.get('estorno')),atendente=clean(url.searchParams.get('atendente')),modalidadePagamento=clean(url.searchParams.get('modalidadePagamento')),
    formaPagamento=clean(url.searchParams.get('formaPagamento')),tipoObjeto=clean(url.searchParams.get('tipoObjeto')),local=clean(url.searchParams.get('local'));
  const sortKey = clean(url.searchParams.get('sortKey')) || 'DATA';
  const sortField = SORT_FIELDS[sortKey] || SORT_FIELDS.DATA;
  const sortDir = String(url.searchParams.get('sortDir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const where=[],args=[];
  if (dataInicio) { where.push('r.data_postagem_iso >= ?'); args.push(dataInicio + ' 00:00:00'); }
  if (dataFim) { where.push('r.data_postagem_iso <= ?'); args.push(dataFim + ' 23:59:59'); }
  if (q) {
    const like=`%${q}%`;
    where.push(`(r.codigo_objeto LIKE ? OR r.atendimento LIKE ? OR r.nome_remetente LIKE ? OR c.nome_atual LIKE ? OR r.cep_destinatario LIKE ? OR r.cep_remetente LIKE ? OR r.numero_contrato LIKE ? OR co.nome LIKE ? OR r.cartao_postagem LIKE ? OR r.sistema_postagem LIKE ? OR r.cpf_matricula_atendente LIKE ? OR a.nome LIKE ? OR r.codigo_servico LIKE ? OR r.nome_servico LIKE ?)`);
    args.push(...Array(14).fill(like));
  }
  addExactFilter(where,args,'r.nome_servico',servico);addExactFilter(where,args,'r.numero_contrato_norm',contrato);addExactFilter(where,args,'r.sistema_postagem',sistema);addExactFilter(where,args,'r.estorno',estorno);addExactFilter(where,args,'r.atendente_norm',atendente);addExactFilter(where,args,'r.modalidade_pagamento',modalidadePagamento);addExactFilter(where,args,'r.forma_pagamento',formaPagamento);
  if (tipoObjeto) { where.push(`${OBJETO_VAZIO_SQL} AND sc.tipo_objeto = ?`); args.push(tipoObjeto); }
  if (local) { where.push(`COALESCE(po.local_codigo, c.local_padrao, '') = ?`); args.push(local); }
  const whereSql=where.length?` WHERE ${where.join(' AND ')}`:'';
  const summary=await env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(r.valor_atendimento_num),0) AS total_value ${BASE_FROM}${whereSql}`).bind(...args).first();
  const total=Number(summary?.total||0),totalValue=Number(summary?.total_value||0);
  const select=`r.id AS "_RAW_ID",r.data_postagem_iso AS "DATA",r.cep_destinatario AS "CEP DESTINATARIO",r.cep_remetente AS "CEP REMETENTE",
    CASE WHEN ${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto, '') ELSE r.codigo_objeto END AS "OBJETO",
    r.codigo_servico AS "COD SERVICO",r.nome_servico AS "SERVICO",COALESCE(c.nome_atual, r.nome_remetente) AS "NOME REMETENTE",r.nome_remetente AS "_NOME_REMETENTE_ORIGINAL",r.cartao_postagem AS "CARTAO POSTAGEM",r.numero_contrato AS "CONTRATO",COALESCE(co.nome,'') AS "NOME CONTRATO",r.sistema_postagem AS "SISTEMA",r.valor_atendimento_num AS "VALOR",r.estorno AS "ESTORNO",r.cpf_matricula_atendente AS "ATENDENTE",COALESCE(a.nome,'') AS "NOME ATENDENTE",r.modalidade_pagamento AS "MODALIDADE PAGAMENTO",r.forma_pagamento AS "FORMA PAGAMENTO",COALESCE(po.local_codigo, c.local_padrao, '') AS "LOCAL",CASE WHEN COALESCE(sd.ocorrencias,0)>1 THEN 1 ELSE 0 END AS "_SRO_DUPLICADO"`;
  const orderExpr=sortField==='objeto_exibido'?`CASE WHEN ${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto,'') ELSE r.codigo_objeto END`:sortField==='nome_remetente_exibido'?`COALESCE(c.nome_atual,r.nome_remetente)`:sortField==='local_exibido'?`COALESCE(po.local_codigo,c.local_padrao,'')`:sortField;
  const result=await env.DB.prepare(`SELECT ${select} ${BASE_FROM}${whereSql} ORDER BY ${orderExpr} ${sortDir}, r.id ASC LIMIT ? OFFSET ?`).bind(...args,pageSize,offset).all();
  const rows=(result.results||[]).map(row=>{row.DATA=formatDateBR(row.DATA);for(const k of Object.keys(row)){if(k[0]!=='_'&&/^(null|undefined)$/i.test(String(row[k]??'').trim()))row[k]='';}return row;});
  return json({ok:true,rows,page,pageSize,total,totalValue,pages:Math.max(1,Math.ceil(total/pageSize)),sortKey:SORT_FIELDS[sortKey]?sortKey:'DATA',sortDir:sortDir.toLowerCase()});
}

async function listFilters(env) {
  const specs=[['servicos','r.nome_servico'],['contratos','r.numero_contrato_norm'],['sistemas','r.sistema_postagem'],['estornos','r.estorno'],['atendentes','r.atendente_norm'],['modalidadesPagamento','r.modalidade_pagamento'],['formasPagamento','r.forma_pagamento']];
  const statements=specs.map(([,field])=>env.DB.prepare(`SELECT DISTINCT ${field} AS value ${BASE_FROM} WHERE ${field} IS NOT NULL AND TRIM(${field}) <> '' AND LOWER(TRIM(${field})) <> 'null' ORDER BY ${field} COLLATE NOCASE ASC LIMIT 2000`));
  const results=await env.DB.batch(statements);
  const body={ok:true,tiposObjeto:['PRODUTO ECT','SEM REGISTRO'],locais:[{codigo:'AGF',nome:'AGF'},{codigo:'METRO',nome:'METRÔ'}]};
  specs.forEach(([key],i)=>body[key]=(results[i]?.results||[]).map(r=>clean(r.value)).filter(Boolean));
  return json(body);
}

async function adminBootstrap(env) {
  const [services,attendants,contracts,clients,historyRows]=await Promise.all([
    env.DB.prepare(`SELECT r.codigo_servico_norm AS codigo, MAX(r.nome_servico) AS nome,COUNT(*) AS ocorrencias, sc.tipo_objeto ${BASE_FROM} WHERE r.codigo_servico_norm <> '' GROUP BY r.codigo_servico_norm, sc.tipo_objeto ORDER BY MAX(r.nome_servico) COLLATE NOCASE ASC, r.codigo_servico_norm ASC LIMIT 2000`).all(),
    env.DB.prepare(`SELECT r.atendente_norm AS codigo, COUNT(*) AS ocorrencias, a.nome ${BASE_FROM} WHERE r.atendente_norm <> '' GROUP BY r.atendente_norm, a.nome ORDER BY COALESCE(a.nome,r.atendente_norm) COLLATE NOCASE ASC LIMIT 1000`).all(),
    env.DB.prepare(`SELECT r.numero_contrato_norm AS numero, COUNT(*) AS ocorrencias,co.nome, co.tipo, co.observacao ${BASE_FROM} WHERE r.numero_contrato_norm <> '' GROUP BY r.numero_contrato_norm, co.nome, co.tipo, co.observacao ORDER BY COALESCE(co.nome,r.numero_contrato_norm) COLLATE NOCASE ASC LIMIT 2000`).all(),
    env.DB.prepare(`SELECT c.id,c.nome_atual,c.local_padrao,c.ativo,COUNT(ca.id) AS aliases FROM atende_clientes c LEFT JOIN atende_cliente_aliases ca ON ca.cliente_id=c.id GROUP BY c.id ORDER BY c.nome_atual COLLATE NOCASE ASC LIMIT 2000`).all(),
    env.DB.prepare(`SELECT entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em FROM atende_admin_historico ORDER BY id DESC LIMIT 100`).all()
  ]);
  return json({ok:true,servicos:services.results||[],atendentes:attendants.results||[],contratos:contracts.results||[],clientes:clients.results||[],locais:[{codigo:'AGF',nome:'AGF'},{codigo:'METRO',nome:'METRÔ'}],historico:historyRows.results||[]});
}

async function adminSaveService(request, env) {
  const b=await readJson(request),codigo=normCode(b.codigo),tipo=clean(b.tipoObjeto).toUpperCase(),nome=clean(b.nomeServico),user=adminUser(request);
  if(!codigo)return json({ok:false,error:'codigo_required'},400);if(tipo&&!['PRODUTO ECT','SEM REGISTRO'].includes(tipo))return json({ok:false,error:'invalid_tipo_objeto'},400);
  const old=await env.DB.prepare(`SELECT tipo_objeto FROM atende_servico_classificacao WHERE codigo_servico=?`).bind(codigo).first();
  if(!tipo)await env.DB.prepare(`DELETE FROM atende_servico_classificacao WHERE codigo_servico=?`).bind(codigo).run();
  else await env.DB.prepare(`INSERT INTO atende_servico_classificacao(codigo_servico,nome_servico_referencia,tipo_objeto,atualizado_por,atualizado_em) VALUES(?,?,?,?,datetime('now')) ON CONFLICT(codigo_servico) DO UPDATE SET nome_servico_referencia=excluded.nome_servico_referencia,tipo_objeto=excluded.tipo_objeto,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`).bind(codigo,nome,tipo,user).run();
  await history(env,'servico',codigo,'tipo_objeto',old?.tipo_objeto||'',tipo,user);return json({ok:true});
}

async function adminSaveAttendant(request, env) {
  const b=await readJson(request),codigo=normCode(b.codigo),nome=clean(b.nome),user=adminUser(request);if(!codigo)return json({ok:false,error:'codigo_required'},400);
  const old=await env.DB.prepare(`SELECT nome FROM atende_atendentes WHERE codigo=?`).bind(codigo).first();
  if(!nome)await env.DB.prepare(`DELETE FROM atende_atendentes WHERE codigo=?`).bind(codigo).run();
  else await env.DB.prepare(`INSERT INTO atende_atendentes(codigo,nome,ativo,atualizado_por,atualizado_em) VALUES(?,?,1,?,datetime('now')) ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome,ativo=1,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`).bind(codigo,nome,user).run();
  await history(env,'atendente',codigo,'nome',old?.nome||'',nome,user);return json({ok:true});
}

async function adminSaveContract(request, env) {
  const b=await readJson(request),numero=normCode(b.numero),nome=clean(b.nome),tipo=clean(b.tipo),obs=clean(b.observacao),user=adminUser(request);if(!numero)return json({ok:false,error:'numero_required'},400);
  const old=await env.DB.prepare(`SELECT nome,tipo,observacao FROM atende_contratos WHERE numero=?`).bind(numero).first();
  if(!nome)await env.DB.prepare(`DELETE FROM atende_contratos WHERE numero=?`).bind(numero).run();
  else await env.DB.prepare(`INSERT INTO atende_contratos(numero,nome,tipo,observacao,ativo,atualizado_por,atualizado_em) VALUES(?,?,?,?,1,?,datetime('now')) ON CONFLICT(numero) DO UPDATE SET nome=excluded.nome,tipo=excluded.tipo,observacao=excluded.observacao,ativo=1,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`).bind(numero,nome,tipo,obs,user).run();
  await history(env,'contrato',numero,'cadastro',JSON.stringify(old||{}),JSON.stringify({nome,tipo,observacao:obs}),user);return json({ok:true});
}

async function adminSaveClientAlias(request, env) {
  const b=await readJson(request),aliasOriginal=rawValue(b.aliasOriginal),aliasNorm=normText(aliasOriginal),nomeAtual=clean(b.nomeAtual),local=clean(b.localPadrao).toUpperCase(),user=adminUser(request);let clienteId=Number(b.clienteId||0);
  if(!aliasNorm||!nomeAtual)return json({ok:false,error:'alias_and_nome_required'},400);if(local&&!['AGF','METRO'].includes(local))return json({ok:false,error:'invalid_local'},400);
  if(!clienteId){const created=await env.DB.prepare(`INSERT INTO atende_clientes(nome_atual,local_padrao,criado_por,atualizado_por) VALUES(?,?,?,?) RETURNING id`).bind(nomeAtual,local||null,user,user).first();clienteId=Number(created?.id||0);}
  else {const oldClient=await env.DB.prepare(`SELECT nome_atual,local_padrao FROM atende_clientes WHERE id=?`).bind(clienteId).first();if(!oldClient)return json({ok:false,error:'cliente_not_found'},404);await env.DB.prepare(`UPDATE atende_clientes SET nome_atual=?,local_padrao=?,atualizado_por=?,atualizado_em=datetime('now') WHERE id=?`).bind(nomeAtual,local||null,user,clienteId).run();await history(env,'cliente',String(clienteId),'nome_atual',oldClient.nome_atual||'',nomeAtual,user);await history(env,'cliente',String(clienteId),'local_padrao',oldClient.local_padrao||'',local,user);}
  const oldAlias=await env.DB.prepare(`SELECT cliente_id FROM atende_cliente_aliases WHERE alias_normalizado=?`).bind(aliasNorm).first();
  await env.DB.prepare(`INSERT INTO atende_cliente_aliases(cliente_id,alias_original,alias_normalizado,criado_por) VALUES(?,?,?,?) ON CONFLICT(alias_normalizado) DO UPDATE SET cliente_id=excluded.cliente_id,alias_original=excluded.alias_original`).bind(clienteId,aliasOriginal,aliasNorm,user).run();
  await history(env,'cliente_alias',aliasNorm,'cliente_id',oldAlias?String(oldAlias.cliente_id):'',String(clienteId),user);return json({ok:true,clienteId});
}

async function adminBulkLocal(request, env) {
  const b=await readJson(request),ids=(Array.isArray(b.rawIds)?b.rawIds:[]).map(Number).filter(n=>n>0),local=clean(b.localCodigo).toUpperCase(),user=adminUser(request);
  if(!ids.length)return json({ok:false,error:'rawIds_required'},400);if(ids.length>500)return json({ok:false,error:'max_500_rows'},400);if(local&&!['AGF','METRO'].includes(local))return json({ok:false,error:'invalid_local'},400);
  const oldMap=new Map();for(let i=0;i<ids.length;i+=90){const chunk=ids.slice(i,i+90),q=await env.DB.prepare(`SELECT raw_id,local_codigo FROM atende_postagem_overrides WHERE raw_id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all();(q.results||[]).forEach(r=>oldMap.set(Number(r.raw_id),clean(r.local_codigo)));}
  const statements=[];for(const id of ids){if(local)statements.push(env.DB.prepare(`INSERT INTO atende_postagem_overrides(raw_id,local_codigo,atualizado_por,atualizado_em) VALUES(?,?,?,datetime('now')) ON CONFLICT(raw_id) DO UPDATE SET local_codigo=excluded.local_codigo,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')`).bind(id,local,user));else statements.push(env.DB.prepare(`DELETE FROM atende_postagem_overrides WHERE raw_id=?`).bind(id));}
  for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));for(const id of ids)await history(env,'postagem',String(id),'local',oldMap.get(id)||'',local,user);return json({ok:true,updated:ids.length});
}

async function history(env,entidade,chave,campo,anterior,novo,usuario){if(String(anterior??'')===String(novo??''))return;await env.DB.prepare(`INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario) VALUES(?,?,?,?,?,?)`).bind(entidade,chave,campo,String(anterior??''),String(novo??''),usuario||'').run();}
function addExactFilter(where,args,field,value){if(!value)return;where.push(`${field} = ? COLLATE NOCASE`);args.push(value)}
function makeImportKey(fileId,hash){return `${fileId}:${hash}`}
function adminUser(request){return clean(request.headers.get('X-AGF-Admin-User'))||'admin'}
async function readJson(request){try{return await request.json()}catch(_){return{}}}
function rawValue(v){return v===null||v===undefined?'':String(v)}
function clean(v){if(v===null||v===undefined)return'';const s=String(v).trim();return /^(null|undefined)$/i.test(s)?'':s}
function normCode(v){return clean(v).toUpperCase()}
function normText(v){return clean(v).toUpperCase().replace(/\s+/g,' ')}
function num(v){const s=clean(v);if(!s)return 0;const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);return Number.isFinite(n)?n:0}
function normalizeDateTime(value){const text=clean(value);let m=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);if(m)return `${m[1]}-${m[2]}-${m[3]} ${m[4]||'00'}:${m[5]||'00'}:${m[6]||'00'}`;m=text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);if(m)return `${m[3]}-${m[2]}-${m[1]} ${m[4]||'00'}:${m[5]||'00'}:${m[6]||'00'}`;return text}
function formatDateBR(value){const t=clean(value),m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:t}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
