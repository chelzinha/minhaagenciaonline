import baseApp from './attendant-local-wrapper.js';

// ============================================================
// ATENDE - DASHBOARD GERENCIAL V2
//
// Mantem o endpoint atual e acrescenta somente agregados de gestao:
// - CLIENTES PORTAL ativos e cobertura da ponte
// - top CLIENTES PORTAL e top RAZOES SOCIAIS
// - dias com movimento / media diaria
// - comparacao com periodo imediatamente anterior, quando ha datas
//
// A tabela, o RAW e os filtros continuam intocados.
// ============================================================

const OBJETO_VAZIO_SQL = `(r.codigo_objeto IS NULL OR TRIM(r.codigo_objeto) = '' OR LOWER(TRIM(r.codigo_objeto)) = 'null')`;
const OBJETO_FACET_SQL = `CASE
  WHEN NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR' THEN 'SRO'
  WHEN ${OBJETO_VAZIO_SQL} AND sc.tipo_objeto IN ('PRODUTO ECT','SEM REGISTRO') THEN sc.tipo_objeto
  ELSE ''
END`;
const CONTRATO_TIPO_SQL = `COALESCE(NULLIF(TRIM(co.tipo), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const CONTRATO_INTERMEDIADOR_SQL = `COALESCE(NULLIF(TRIM(co.nome), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const ATENDENTE_EXIBIDO_SQL = `COALESCE(NULLIF(TRIM(a.nome), ''), r.atendente_norm)`;
const CLIENTE_PORTAL_SQL = `COALESCE(cp.cliente_portal, '')`;
const LOCAL_EXIBIDO_SQL = `COALESCE(pcl.local_codigo, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')`;
const ESTORNO_ATIVO_SQL = `(TRIM(COALESCE(r.estorno,'')) <> '' AND UPPER(TRIM(r.estorno)) NOT IN ('N','NAO','NÃO','0','FALSE'))`;

const BASE_FROM = `
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri ON ri.import_key = r.import_key AND ri.concluido_em IS NOT NULL
  LEFT JOIN atende_cliente_aliases ca ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c ON c.id = ca.cliente_id AND c.ativo = 1
  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1
  LEFT JOIN atende_atendente_local atl ON atl.codigo = r.atendente_norm
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
  LEFT JOIN atende_cliente_portal cp ON cp.raw_id = r.id
  LEFT JOIN atende_cliente_portal_local pcl
    ON pcl.cliente_portal_norm = cp.cliente_portal_norm
   AND pcl.ativo = 1
`;

const FACETS = Object.freeze({
  tiposObjeto: { singular:'tipoObjeto', field:OBJETO_FACET_SQL },
  servicos: { singular:'servico', field:'r.nome_servico' },
  servicoTipos: { singular:'servicoTipo', field:"COALESCE(sc.tipo_servico, '')" },
  servicoSubgrupos: { singular:'servicoSubgrupo', field:"COALESCE(sc.subgrupo, '')" },
  servicoTabelas: { singular:'servicoTabela', field:"COALESCE(sc.tabela, '')" },
  clientesPortal: { singular:'clientePortal', field:CLIENTE_PORTAL_SQL },
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await baseApp.fetch(request, env, ctx);

    if (!(request.method === 'GET' && url.pathname === '/atende' && url.searchParams.get('view') === 'dashboard' && response.ok)) {
      return response;
    }

    let body;
    try { body = await response.json(); }
    catch (_) { return response; }

    try {
      const extras = await buildManagement(url, env, body);
      Object.assign(body, extras);
    } catch (err) {
      body.gestaoErro = err && err.message ? String(err.message) : String(err || 'dashboard_management_error');
    }

    return json(body, response.status);
  }
};

async function buildManagement(url, env, baseBody) {
  const state = parseState(url);
  const current = buildWhere(state);
  const previousState = previousPeriodState(state);
  const previous = previousState ? buildWhere(previousState) : null;

  const currentSummarySql = `
    SELECT
      COUNT(*) AS postagens,
      COALESCE(SUM(r.valor_atendimento_num),0) AS faturamento,
      COALESCE(AVG(r.valor_atendimento_num),0) AS valor_medio,
      SUM(CASE WHEN ${ESTORNO_ATIVO_SQL} THEN 1 ELSE 0 END) AS estornos,
      COALESCE(SUM(CASE WHEN ${ESTORNO_ATIVO_SQL} THEN r.valor_atendimento_num ELSE 0 END),0) AS valor_estornos,
      COUNT(DISTINCT CASE WHEN TRIM(COALESCE(cp.cliente_portal_norm,''))<>'' THEN cp.cliente_portal_norm END) AS clientes_portal,
      SUM(CASE WHEN TRIM(COALESCE(cp.cliente_portal_norm,''))<>'' THEN 1 ELSE 0 END) AS vinculadas_portal,
      COUNT(DISTINCT CASE WHEN TRIM(COALESCE(r.data_postagem_iso,''))<>'' THEN substr(r.data_postagem_iso,1,10) END) AS dias_ativos
    ${BASE_FROM}${current.whereSql}
  `;

  const topPortalSql = breakdownSql(CLIENTE_PORTAL_SQL, current.whereSql, 12);
  const topRazaoSql = breakdownSql("COALESCE(co.cliente, '')", current.whereSql, 10);

  const statements = [
    env.DB.prepare(currentSummarySql).bind(...current.args),
    env.DB.prepare(topPortalSql).bind(...current.args),
    env.DB.prepare(topRazaoSql).bind(...current.args)
  ];

  if (previous) {
    statements.push(env.DB.prepare(`
      SELECT
        COUNT(*) AS postagens,
        COALESCE(SUM(r.valor_atendimento_num),0) AS faturamento,
        COALESCE(AVG(r.valor_atendimento_num),0) AS valor_medio,
        SUM(CASE WHEN ${ESTORNO_ATIVO_SQL} THEN 1 ELSE 0 END) AS estornos,
        COALESCE(SUM(CASE WHEN ${ESTORNO_ATIVO_SQL} THEN r.valor_atendimento_num ELSE 0 END),0) AS valor_estornos
      ${BASE_FROM}${previous.whereSql}
    `).bind(...previous.args));
  }

  const results = await env.DB.batch(statements);
  const s = results[0]?.results?.[0] || {};
  const total = Number(s.postagens || baseBody?.kpis?.postagens || 0);
  const linked = Number(s.vinculadas_portal || 0);
  const days = Number(s.dias_ativos || 0);
  const revenue = Number(s.faturamento || baseBody?.kpis?.faturamento || 0);

  const clientesPortal = mapBreakdown(results[1]?.results || []);
  const razoesSociais = mapBreakdown(results[2]?.results || []);
  const previousRow = previous ? (results[3]?.results?.[0] || {}) : null;

  return {
    gestao: {
      clientesPortalAtivos: Number(s.clientes_portal || 0),
      vinculadasPortal: linked,
      semClientePortal: Math.max(0, total - linked),
      coberturaPortal: total ? Number((linked * 100 / total).toFixed(2)) : 0,
      diasAtivos: days,
      mediaDiariaFaturamento: days ? revenue / days : 0,
      mediaDiariaPostagens: days ? total / days : 0
    },
    clientesPortal,
    razoesSociais,
    comparacao: previousRow ? {
      disponivel: true,
      dataInicio: previousState.dataInicio,
      dataFim: previousState.dataFim,
      postagens: Number(previousRow.postagens || 0),
      faturamento: Number(previousRow.faturamento || 0),
      valorMedio: Number(previousRow.valor_medio || 0),
      estornos: Number(previousRow.estornos || 0),
      valorEstornos: Number(previousRow.valor_estornos || 0)
    } : { disponivel:false }
  };
}

function parseState(url) {
  const facets = {};
  for (const [key,spec] of Object.entries(FACETS)) facets[key] = getMulti(url,spec.singular,key);
  facets.tiposObjeto = facets.tiposObjeto.map(v=>v.toUpperCase());
  return {
    dataInicio: clean(url.searchParams.get('dataInicio')),
    dataFim: clean(url.searchParams.get('dataFim')),
    q: clean(url.searchParams.get('q')),
    facets
  };
}

function previousPeriodState(state) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(state.dataFim)) return null;
  const start = new Date(state.dataInicio + 'T00:00:00Z');
  const end = new Date(state.dataFim + 'T00:00:00Z');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return null;
  const span = Math.round((end - start) / 86400000) + 1;
  if (span < 1 || span > 370) return null;
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (span - 1) * 86400000);
  return {
    ...state,
    dataInicio: isoDate(prevStart),
    dataFim: isoDate(prevEnd),
    facets: Object.fromEntries(Object.entries(state.facets).map(([k,v])=>[k,(v||[]).slice()]))
  };
}

function buildWhere(state) {
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
      r.cpf_matricula_atendente LIKE ? OR a.nome LIKE ? OR r.codigo_servico LIKE ? OR r.nome_servico LIKE ? OR
      cp.cliente_portal LIKE ?
    )`);
    args.push(...Array(17).fill(like));
  }
  for (const [key,spec] of Object.entries(FACETS)) {
    if (key === 'tiposObjeto') continue;
    addMultiFilter(where,args,spec.field,state.facets[key]);
  }
  addObjectFilter(where,args,state.facets.tiposObjeto);
  return {whereSql:where.length?` WHERE ${where.join(' AND ')}`:'',args};
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

function breakdownSql(field,whereSql,limit) {
  const condition=`${field} IS NOT NULL AND TRIM(CAST(${field} AS TEXT))<>'' AND LOWER(TRIM(CAST(${field} AS TEXT)))<>'null'`;
  return `SELECT ${field} AS label,COUNT(*) AS quantidade,COALESCE(SUM(r.valor_atendimento_num),0) AS valor ${BASE_FROM}${appendCondition(whereSql,condition)} GROUP BY ${field} ORDER BY valor DESC,quantidade DESC LIMIT ${Math.max(1,Number(limit)||10)}`;
}

function mapBreakdown(rows){return (rows||[]).map(r=>({label:clean(r.label),quantidade:Number(r.quantidade||0),valor:Number(r.valor||0)})).filter(r=>r.label);}
function appendCondition(whereSql,condition){return whereSql?`${whereSql} AND ${condition}`:` WHERE ${condition}`;}
function addMultiFilter(where,args,field,values){const list=unique((values||[]).map(clean).filter(Boolean));if(!list.length)return;where.push(`(${list.map(()=>`${field} = ? COLLATE NOCASE`).join(' OR ')})`);args.push(...list);}
function getMulti(url,singular,plural){const values=[...url.searchParams.getAll(singular),...url.searchParams.getAll(plural)];for(const packed of url.searchParams.getAll(plural))if(packed.includes('|'))values.push(...packed.split('|'));return unique(values.map(clean).filter(Boolean));}
function unique(values){return Array.from(new Set(values));}
function clean(value){if(value===null||value===undefined)return'';const text=String(value).trim();return/^(null|undefined)$/i.test(text)?'':text;}
function isoDate(d){return d.toISOString().slice(0,10);}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
