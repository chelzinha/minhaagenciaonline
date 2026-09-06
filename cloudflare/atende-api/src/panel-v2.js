const OBJETO_VAZIO_SQL = `(r.codigo_objeto IS NULL OR TRIM(r.codigo_objeto) = '' OR LOWER(TRIM(r.codigo_objeto)) = 'null')`;
const OBJETO_FACET_SQL = `CASE
  WHEN NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR' THEN 'SRO'
  WHEN ${OBJETO_VAZIO_SQL} AND sc.tipo_objeto IN ('PRODUTO ECT','SEM REGISTRO') THEN sc.tipo_objeto
  ELSE ''
END`;
const CONTRATO_TIPO_SQL = `COALESCE(NULLIF(TRIM(co.tipo), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const CONTRATO_INTERMEDIADOR_SQL = `COALESCE(NULLIF(TRIM(co.nome), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const ATENDENTE_EXIBIDO_SQL = `COALESCE(NULLIF(TRIM(a.nome), ''), r.atendente_norm)`;
const LOCAL_EXIBIDO_SQL = `COALESCE(po.local_codigo, c.local_padrao, '')`;

const BASE_FROM = `
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri ON ri.import_key = r.import_key AND ri.concluido_em IS NOT NULL
  LEFT JOIN atende_cliente_aliases ca ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c ON c.id = ca.cliente_id AND c.ativo = 1
  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1
  LEFT JOIN atende_contratos co ON co.numero = r.numero_contrato_norm AND co.ativo = 1
  LEFT JOIN (
    SELECT rr.numero_contrato_norm AS numero, COUNT(*) AS ocorrencias
    FROM atende_postagens_raw rr
    JOIN atende_raw_importacoes rii
      ON rii.import_key = rr.import_key
     AND rii.concluido_em IS NOT NULL
    WHERE rr.numero_contrato_norm IS NOT NULL
      AND TRIM(rr.numero_contrato_norm) <> ''
      AND LOWER(TRIM(rr.numero_contrato_norm)) <> 'null'
    GROUP BY rr.numero_contrato_norm
  ) cc ON cc.numero = r.numero_contrato_norm
  LEFT JOIN atende_servico_classificacao sc ON sc.codigo_servico = r.codigo_servico_norm
  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id
  LEFT JOIN atende_sro_counts sd ON sd.codigo_objeto_norm = r.codigo_objeto_norm
`;

const FACET_SPECS = Object.freeze({
  tiposObjeto: { singular:'tipoObjeto', field:OBJETO_FACET_SQL },
  servicos: { singular:'servico', field:'r.nome_servico' },
  servicoTipos: { singular:'servicoTipo', field:"COALESCE(sc.tipo_servico, '')" },
  servicoSubgrupos: { singular:'servicoSubgrupo', field:"COALESCE(sc.subgrupo, '')" },
  servicoTabelas: { singular:'servicoTabela', field:"COALESCE(sc.tabela, '')" },
  contratoClientes: { singular:'contratoCliente', field:"COALESCE(co.cliente, '')" },
  contratoTipos: { singular:'contratoTipo', field:CONTRATO_TIPO_SQL },
  intermediadores: { singular:'intermediador', field:CONTRATO_INTERMEDIADOR_SQL },
  sistemas: { singular:'sistema', field:'r.sistema_postagem' },
  estornos: { singular:'estorno', field:'r.estorno' },
  atendentes: { singular:'atendente', field:ATENDENTE_EXIBIDO_SQL },
  modalidadesPagamento: { singular:'modalidadePagamento', field:'r.modalidade_pagamento' },
  formasPagamento: { singular:'formaPagamento', field:'r.forma_pagamento' },
  locais: { singular:'local', field:LOCAL_EXIBIDO_SQL }
});

const SORT_FIELDS = Object.freeze({
  'DATA': 'r.data_postagem_iso',
  'CEP DESTINATARIO': 'r.cep_destinatario',
  'CEP REMETENTE': 'r.cep_remetente',
  'OBJETO': 'objeto_exibido',
  'COD SERVICO': 'r.codigo_servico_norm',
  'SERVICO': 'r.nome_servico',
  'NOME REMETENTE': 'nome_remetente_exibido',
  'CARTAO POSTAGEM': 'r.cartao_postagem',
  'CONTRATO': 'r.numero_contrato_norm',
  'OCORR': 'COALESCE(cc.ocorrencias, 0)',
  'CLIENTE': "COALESCE(co.cliente, '')",
  'TIPO': CONTRATO_TIPO_SQL,
  'INTERMEDIADOR': CONTRATO_INTERMEDIADOR_SQL,
  'SISTEMA': 'r.sistema_postagem',
  'VALOR': 'r.valor_atendimento_num',
  'ESTORNO': 'r.estorno',
  'ATENDENTE': 'atendente_exibido',
  'MODALIDADE PAGAMENTO': 'r.modalidade_pagamento',
  'FORMA PAGAMENTO': 'r.forma_pagamento',
  'LOCAL': 'local_exibido'
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/atende') return listAtende(url, env);
    if (request.method === 'GET' && url.pathname === '/filters') return listFilters(url, env);
    return json({ ok:false, error:'not_found' }, 404);
  }
};

function parseFilterState(url) {
  const facets = {};
  for (const [key, spec] of Object.entries(FACET_SPECS)) facets[key] = getMulti(url, spec.singular, key);
  facets.tiposObjeto = facets.tiposObjeto.map(v => v.toUpperCase());
  return {
    dataInicio:clean(url.searchParams.get('dataInicio')),
    dataFim:clean(url.searchParams.get('dataFim')),
    q:clean(url.searchParams.get('q')),
    facets
  };
}

function buildWhere(state, excludeFacet='') {
  const where=[];
  const args=[];
  if (state.dataInicio) { where.push('r.data_postagem_iso >= ?'); args.push(state.dataInicio + ' 00:00:00'); }
  if (state.dataFim) { where.push('r.data_postagem_iso <= ?'); args.push(state.dataFim + ' 23:59:59'); }
  if (state.q) {
    const like=`%${state.q}%`;
    where.push(`(
      r.codigo_objeto LIKE ? OR r.atendimento LIKE ? OR r.nome_remetente LIKE ? OR c.nome_atual LIKE ? OR
      r.cep_destinatario LIKE ? OR r.cep_remetente LIKE ? OR r.numero_contrato LIKE ? OR co.nome LIKE ? OR
      co.cliente LIKE ? OR co.tipo LIKE ? OR r.cartao_postagem LIKE ? OR r.sistema_postagem LIKE ? OR
      r.cpf_matricula_atendente LIKE ? OR a.nome LIKE ? OR r.codigo_servico LIKE ? OR r.nome_servico LIKE ?
    )`);
    args.push(...Array(16).fill(like));
  }
  for (const [key, spec] of Object.entries(FACET_SPECS)) {
    if (key === excludeFacet || key === 'tiposObjeto') continue;
    addMultiFilter(where,args,spec.field,state.facets[key]);
  }
  if (excludeFacet !== 'tiposObjeto') addObjectFilter(where,args,state.facets.tiposObjeto);
  return {where,args,whereSql:where.length?` WHERE ${where.join(' AND ')}`:''};
}

function addObjectFilter(where,args,values) {
  const tipos=unique((values||[]).map(v=>clean(v).toUpperCase()).filter(Boolean));
  if(!tipos.length)return;
  const clauses=[];
  for(const tipo of tipos) {
    if(tipo==='SRO')clauses.push(`(NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR')`);
    else if(tipo==='PRODUTO ECT'||tipo==='SEM REGISTRO') {
      clauses.push(`(${OBJETO_VAZIO_SQL} AND sc.tipo_objeto = ?)`);
      args.push(tipo);
    }
  }
  if(clauses.length)where.push(`(${clauses.join(' OR ')})`);
}

async function listAtende(url,env) {
  const page=Math.max(1,Number(url.searchParams.get('page')||1));
  const pageSize=Math.min(500,Math.max(1,Number(url.searchParams.get('pageSize')||500)));
  const offset=(page-1)*pageSize;
  const state=parseFilterState(url);
  const sortKey=clean(url.searchParams.get('sortKey'))||'DATA';
  const sortField=SORT_FIELDS[sortKey]||SORT_FIELDS.DATA;
  const sortDir=String(url.searchParams.get('sortDir')||'desc').toLowerCase()==='asc'?'ASC':'DESC';
  const built=buildWhere(state);

  const summary=await env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(r.valor_atendimento_num),0) AS total_value ${BASE_FROM}${built.whereSql}`).bind(...built.args).first();
  const total=Number(summary?.total||0),totalValue=Number(summary?.total_value||0);
  const select=`
    r.id AS "_RAW_ID",r.data_postagem_iso AS "DATA",r.cep_destinatario AS "CEP DESTINATARIO",r.cep_remetente AS "CEP REMETENTE",
    CASE WHEN ${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto,'') ELSE r.codigo_objeto END AS "OBJETO",
    r.codigo_servico AS "COD SERVICO",r.nome_servico AS "SERVICO",COALESCE(c.nome_atual,r.nome_remetente) AS "NOME REMETENTE",
    r.nome_remetente AS "_NOME_REMETENTE_ORIGINAL",r.cartao_postagem AS "CARTAO POSTAGEM",r.numero_contrato AS "CONTRATO",
    COALESCE(cc.ocorrencias,0) AS "OCORR",COALESCE(co.cliente,'') AS "CLIENTE",${CONTRATO_TIPO_SQL} AS "TIPO",
    ${CONTRATO_INTERMEDIADOR_SQL} AS "INTERMEDIADOR",r.sistema_postagem AS "SISTEMA",r.valor_atendimento_num AS "VALOR",
    r.estorno AS "ESTORNO",${ATENDENTE_EXIBIDO_SQL} AS "ATENDENTE",r.atendente_norm AS "_ATENDENTE_CODIGO",
    r.modalidade_pagamento AS "MODALIDADE PAGAMENTO",r.forma_pagamento AS "FORMA PAGAMENTO",${LOCAL_EXIBIDO_SQL} AS "LOCAL",
    CASE WHEN COALESCE(sd.ocorrencias,0)>1 THEN 1 ELSE 0 END AS "_SRO_DUPLICADO"
  `;
  const orderExpr=sortField==='objeto_exibido'?`CASE WHEN ${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto,'') ELSE r.codigo_objeto END`
    :sortField==='nome_remetente_exibido'?`COALESCE(c.nome_atual,r.nome_remetente)`
    :sortField==='atendente_exibido'?ATENDENTE_EXIBIDO_SQL
    :sortField==='local_exibido'?LOCAL_EXIBIDO_SQL:sortField;
  const result=await env.DB.prepare(`SELECT ${select} ${BASE_FROM}${built.whereSql} ORDER BY ${orderExpr} ${sortDir},r.id ASC LIMIT ? OFFSET ?`).bind(...built.args,pageSize,offset).all();
  const rows=(result.results||[]).map(row=>{
    row.DATA=formatDateBR(row.DATA);
    for(const key of Object.keys(row))if(key[0]!=='_'&&/^(null|undefined)$/i.test(String(row[key]??'').trim()))row[key]='';
    return row;
  });
  return json({ok:true,rows,page,pageSize,total,totalValue,pages:Math.max(1,Math.ceil(total/pageSize)),sortKey:SORT_FIELDS[sortKey]?sortKey:'DATA',sortDir:sortDir.toLowerCase()});
}

async function listFilters(url,env) {
  const state=parseFilterState(url),facetKeys=Object.keys(FACET_SPECS),statements=[];
  for(const key of facetKeys) {
    const spec=FACET_SPECS[key],built=buildWhere(state,key);
    const condition=`${spec.field} IS NOT NULL AND TRIM(CAST(${spec.field} AS TEXT))<>'' AND LOWER(TRIM(CAST(${spec.field} AS TEXT)))<>'null'`;
    const sql=`SELECT ${spec.field} AS value,COUNT(*) AS count ${BASE_FROM}${appendCondition(built.whereSql,condition)} GROUP BY ${spec.field} ORDER BY ${spec.field} COLLATE NOCASE ASC LIMIT 2000`;
    statements.push(env.DB.prepare(sql).bind(...built.args));
  }
  const results=await env.DB.batch(statements),body={ok:true};
  facetKeys.forEach((key,index)=>{
    const selected=state.facets[key]||[];
    const options=(results[index]?.results||[]).map(row=>({value:clean(row.value),label:key==='locais'&&clean(row.value)==='METRO'?'METRÔ':clean(row.value),count:Number(row.count||0)})).filter(x=>x.value);
    body[key]=mergeSelectedOptions(options,selected,key);
  });
  return json(body);
}

function mergeSelectedOptions(options,selected,key) {
  const out=options.slice(),seen=new Set(out.map(x=>x.value));
  for(const value of unique((selected||[]).map(clean).filter(Boolean)))if(!seen.has(value))out.push({value,label:key==='locais'&&value==='METRO'?'METRÔ':value,count:0});
  return out.sort((a,b)=>String(a.label).localeCompare(String(b.label),'pt-BR',{sensitivity:'base'}));
}
function appendCondition(whereSql,condition){return whereSql?`${whereSql} AND ${condition}`:` WHERE ${condition}`;}
function addMultiFilter(where,args,field,values){const list=unique((values||[]).map(clean).filter(Boolean));if(!list.length)return;where.push(`(${list.map(()=>`${field} = ? COLLATE NOCASE`).join(' OR ')})`);args.push(...list);}
function getMulti(url,singular,plural){const values=[...url.searchParams.getAll(singular),...url.searchParams.getAll(plural)];for(const packed of url.searchParams.getAll(plural))if(packed.includes('|'))values.push(...packed.split('|'));return unique(values.map(clean).filter(Boolean));}
function unique(values){return Array.from(new Set(values));}
function clean(value){if(value===null||value===undefined)return'';const text=String(value).trim();return/^(null|undefined)$/i.test(text)?'':text;}
function formatDateBR(value){const text=clean(value),m=text.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:text;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
