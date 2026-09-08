import baseApp from './dashboard-management-wrapper.js';

// ============================================================
// ATENDE - DASHBOARD GERENCIAL V3
// - evolucao dos ultimos 6 meses
// - linha correta de remuneracao (R2 G1 x R2 G2)
// - composicao por Local ignorando apenas o filtro Local
// - Canal como alias visual do antigo campo intermediadores
// - oportunidade de embalagem
// - degraus contratuais de Mensageria e Encomendas
// - metas mensais cadastradas manualmente no Admin
// ============================================================

const OBJETO_VAZIO_SQL = `(r.codigo_objeto IS NULL OR TRIM(r.codigo_objeto) = '' OR LOWER(TRIM(r.codigo_objeto)) = 'null')`;
const OBJETO_FACET_SQL = `CASE
  WHEN NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR' THEN 'SRO'
  WHEN ${OBJETO_VAZIO_SQL} AND sc.tipo_objeto IN ('PRODUTO ECT','SEM REGISTRO') THEN sc.tipo_objeto
  ELSE ''
END`;
const CONTRATO_TIPO_SQL = `COALESCE(NULLIF(TRIM(co.tipo), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const CONTRATO_CANAL_SQL = `COALESCE(NULLIF(TRIM(co.nome), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const ATENDENTE_EXIBIDO_SQL = `COALESCE(NULLIF(TRIM(a.nome), ''), r.atendente_norm)`;
const CLIENTE_PORTAL_SQL = `COALESCE(cp.cliente_portal, '')`;
const LOCAL_EXIBIDO_SQL = `COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')`;
const TABELA_NORM_SQL = `REPLACE(REPLACE(UPPER(TRIM(COALESCE(sc.tabela,''))),' ',''),'-','')`;
const IS_MENSAGERIA_SQL = `(${TABELA_NORM_SQL}='R2G1')`;
const IS_ENCOMENDA_SQL = `(${TABELA_NORM_SQL}='R2G2')`;
const IS_EMBALAGEM_SQL = `(
  r.codigo_servico_norm IN ('116601558','116601566','765000911','765000660','116601540','116601728')
  OR (${TABELA_NORM_SQL}='R1G1' AND (
    UPPER(COALESCE(r.nome_servico,'')) LIKE '%CAIXA%'
    OR UPPER(COALESCE(r.nome_servico,'')) LIKE '%ENVELOPE BOLHA%'
    OR UPPER(COALESCE(r.nome_servico,'')) LIKE '%EMBALAGEM%'
  ))
)`;

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
    JOIN atende_raw_importacoes rii ON rii.import_key = rr.import_key AND rii.concluido_em IS NOT NULL
    WHERE rr.numero_contrato_norm IS NOT NULL
      AND TRIM(rr.numero_contrato_norm) <> ''
      AND LOWER(TRIM(rr.numero_contrato_norm)) <> 'null'
    GROUP BY rr.numero_contrato_norm
  ) cc ON cc.numero = r.numero_contrato_norm
  LEFT JOIN atende_servico_classificacao sc ON sc.codigo_servico = r.codigo_servico_norm
  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id
  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id
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
  intermediadores: { singular:'intermediador', field:CONTRATO_CANAL_SQL },
  sistemas: { singular:'sistema', field:'r.sistema_postagem' },
  estornos: { singular:'estorno', field:'r.estorno' },
  atendentes: { singular:'atendente', field:ATENDENTE_EXIBIDO_SQL },
  modalidadesPagamento: { singular:'modalidadePagamento', field:'r.modalidade_pagamento' },
  formasPagamento: { singular:'formaPagamento', field:'r.forma_pagamento' },
  locais: { singular:'local', field:LOCAL_EXIBIDO_SQL }
});

const ESCADA_MENSAGERIA = [
  {degrau:1,teto:115500,percentual:37.00},
  {degrau:2,teto:231000,percentual:24.00},
  {degrau:3,teto:277200,percentual:20.00},
  {degrau:4,teto:315700,percentual:17.24},
  {degrau:5,teto:369600,percentual:15.24},
  {degrau:6,teto:431200,percentual:13.56},
  {degrau:7,teto:485100,percentual:12.44},
  {degrau:8,teto:631400,percentual:10.40},
  {degrau:9,teto:831600,percentual:8.81},
  {degrau:10,teto:1085700,percentual:7.69},
  {degrau:11,teto:1439900,percentual:6.81},
  {degrau:12,teto:null,percentual:6.02}
];
const ESCADA_ENCOMENDA = [
  {degrau:1,teto:950950,percentual:29.00},
  {degrau:2,teto:1228150,percentual:22.36},
  {degrau:3,teto:1447600,percentual:19.95},
  {degrau:4,teto:1682450,percentual:18.09},
  {degrau:5,teto:1898050,percentual:16.98},
  {degrau:6,teto:2148300,percentual:15.54},
  {degrau:7,teto:2618000,percentual:13.55},
  {degrau:8,teto:3187800,percentual:12.39},
  {degrau:9,teto:null,percentual:8.81}
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/dashboard-targets' && request.method === 'GET') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return getTargets(url, env);
    }
    if (url.pathname === '/admin/dashboard-targets' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveTargets(request, env);
    }

    const response = await baseApp.fetch(request, env, ctx);
    if (!(request.method === 'GET' && url.pathname === '/atende' && url.searchParams.get('view') === 'dashboard' && response.ok)) {
      return response;
    }

    let body;
    try { body = await response.json(); }
    catch (_) { return response; }

    try {
      const extras = await buildV3(url, env, body);
      Object.assign(body, extras);
    } catch (err) {
      body.dashboardV3Erro = err && err.message ? String(err.message) : String(err || 'dashboard_v3_error');
    }
    return json(body, response.status);
  }
};

async function buildV3(url, env, baseBody) {
  const state = parseState(url);
  const current = buildWhere(state);
  const withoutLocalState = cloneState(state);
  withoutLocalState.facets.locais = [];
  const withoutLocal = buildWhere(withoutLocalState);

  const anchorMonth = await resolveAnchorMonth(state, env);
  const sixRange = sixMonthRange(anchorMonth);
  const sixState = cloneState(state);
  sixState.dataInicio = sixRange.start;
  sixState.dataFim = sixRange.end;
  const sixWhere = buildWhere(sixState);

  const lineSql = `
    SELECT CASE WHEN ${IS_MENSAGERIA_SQL} THEN 'Mensageria' WHEN ${IS_ENCOMENDA_SQL} THEN 'Encomendas' ELSE '' END AS label,
           COUNT(*) AS quantidade,
           COALESCE(SUM(r.valor_atendimento_num),0) AS valor
    ${BASE_FROM}${appendCondition(current.whereSql, `(${IS_MENSAGERIA_SQL} OR ${IS_ENCOMENDA_SQL})`)}
    GROUP BY label ORDER BY valor DESC
  `;
  const localGlobalSql = breakdownSql(LOCAL_EXIBIDO_SQL, withoutLocal.whereSql, 50);
  const sixSql = `
    SELECT substr(r.data_postagem_iso,1,7) AS label,
           COUNT(*) AS quantidade,
           COALESCE(SUM(r.valor_atendimento_num),0) AS valor
    ${BASE_FROM}${sixWhere.whereSql}
    GROUP BY substr(r.data_postagem_iso,1,7)
    ORDER BY label ASC
  `;
  const opportunitySql = `
    SELECT
      SUM(CASE WHEN ${IS_ENCOMENDA_SQL} THEN 1 ELSE 0 END) AS encomendas,
      SUM(CASE WHEN ${IS_EMBALAGEM_SQL} THEN 1 ELSE 0 END) AS embalagens
    ${BASE_FROM}${current.whereSql}
  `;
  const canalSql = breakdownSql(CONTRATO_CANAL_SQL, current.whereSql, 12);

  const [lineResult, localResult, sixResult, opportunityResult, canalResult, activeLocals] = await env.DB.batch([
    env.DB.prepare(lineSql).bind(...current.args),
    env.DB.prepare(localGlobalSql).bind(...withoutLocal.args),
    env.DB.prepare(sixSql).bind(...sixWhere.args),
    env.DB.prepare(opportunitySql).bind(...current.args),
    env.DB.prepare(canalSql).bind(...current.args),
    env.DB.prepare(`SELECT codigo,nome FROM atende_locais WHERE ativo=1 ORDER BY nome COLLATE NOCASE ASC`)
  ]);

  const linhaRemuneracao = mapBreakdown(lineResult?.results || []);
  const localGlobal = mergeActiveLocals(mapBreakdown(localResult?.results || []), activeLocals?.results || []);
  const evolucao6Meses = fillMonths(mapBreakdown(sixResult?.results || []), sixRange.months);
  const canais = mapBreakdown(canalResult?.results || []);
  const opp = opportunityResult?.results?.[0] || {};
  const encomendasCount = Number(opp.encomendas || 0);
  const embalagensCount = Number(opp.embalagens || 0);
  const taxaAtual = encomendasCount ? embalagensCount * 100 / encomendasCount : 0;
  const meta10Qtd = Math.max(0, Math.ceil(encomendasCount * 0.10 - embalagensCount));
  const meta20Qtd = Math.max(0, Math.ceil(encomendasCount * 0.20 - embalagensCount));

  const mensageriaValue = valueFor(linhaRemuneracao, 'Mensageria');
  const encomendaValue = valueFor(linhaRemuneracao, 'Encomendas');

  const metas = await buildMonthlyTargets(anchorMonth, env);

  return {
    versaoDashboard:'gestao-v3',
    canais,
    linhaRemuneracao,
    localGlobal,
    evolucao6Meses,
    oportunidadeEmbalagem:{
      encomendas:encomendasCount,
      embalagens:embalagensCount,
      taxaAtual:Number(taxaAtual.toFixed(2)),
      umaACada:embalagensCount ? Number((encomendasCount / embalagensCount).toFixed(1)) : 0,
      meta10:{taxa:10,adicionais:meta10Qtd,ganhoEstimado:meta10Qtd*3.78},
      meta20:{taxa:20,adicionais:meta20Qtd,ganhoEstimado:meta20Qtd*3.78},
      retornoMedioUnitario:3.78
    },
    remuneracao:{
      fonte:'Contrato AGF Tipo 12 - Anexo 3 - vigencia 17/11/2025 - limites em reais com PPCC 3,85',
      mensageria:stepInfo(mensageriaValue, ESCADA_MENSAGERIA),
      encomendas:stepInfo(encomendaValue, ESCADA_ENCOMENDA)
    },
    metas
  };
}

async function buildMonthlyTargets(competencia, env) {
  if (!/^\d{4}-\d{2}$/.test(competencia || '')) return {disponivel:false,competencia:''};
  const row = await env.DB.prepare(`SELECT * FROM atende_dashboard_metas_mensais WHERE competencia=?`).bind(competencia).first();
  const range = monthRange(competencia);
  const monthState = emptyState();
  monthState.dataInicio = range.start;
  monthState.dataFim = range.end;
  const monthWhere = buildWhere(monthState);

  const [localResult,lineResult,activeLocals] = await env.DB.batch([
    env.DB.prepare(breakdownSql(LOCAL_EXIBIDO_SQL, monthWhere.whereSql, 50)).bind(...monthWhere.args),
    env.DB.prepare(`
      SELECT CASE WHEN ${IS_MENSAGERIA_SQL} THEN 'Mensageria' WHEN ${IS_ENCOMENDA_SQL} THEN 'Encomendas' ELSE '' END AS label,
             COUNT(*) AS quantidade, COALESCE(SUM(r.valor_atendimento_num),0) AS valor
      ${BASE_FROM}${appendCondition(monthWhere.whereSql, `(${IS_MENSAGERIA_SQL} OR ${IS_ENCOMENDA_SQL})`)}
      GROUP BY label
    `).bind(...monthWhere.args),
    env.DB.prepare(`SELECT codigo,nome FROM atende_locais WHERE ativo=1 ORDER BY nome COLLATE NOCASE ASC`)
  ]);

  const locals = mergeActiveLocals(mapBreakdown(localResult?.results || []), activeLocals?.results || []);
  const lines = mapBreakdown(lineResult?.results || []);
  const config = normalizeTargetRow(row, competencia);
  return {
    disponivel:!!row,
    competencia,
    config,
    realizado:{
      encomendas:valueFor(lines,'Encomendas'),
      balcao:valueForLocal(locals,'BALCAO'),
      metro:valueForLocal(locals,'METRO')
    }
  };
}

async function getTargets(url, env) {
  const competencia = clean(url.searchParams.get('competencia'));
  if (!/^\d{4}-\d{2}$/.test(competencia)) return json({ok:false,error:'competencia_invalid'},400);
  const row = await env.DB.prepare(`SELECT * FROM atende_dashboard_metas_mensais WHERE competencia=?`).bind(competencia).first();
  return json({ok:true,found:!!row,config:normalizeTargetRow(row,competencia)});
}

async function saveTargets(request, env) {
  let body;
  try { body = await request.json(); }
  catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const competencia = clean(body?.competencia);
  if (!/^\d{4}-\d{2}$/.test(competencia)) return json({ok:false,error:'competencia_invalid'},400);
  const cfg = {
    competencia,
    diasUteisRealizados:integer(body?.diasUteisRealizados),
    diasUteisMes:integer(body?.diasUteisMes),
    encomendasMeta:number(body?.encomendasMeta),
    balcaoBronze:number(body?.balcaoBronze), balcaoPrata:number(body?.balcaoPrata), balcaoOuro:number(body?.balcaoOuro), balcaoDiamante:number(body?.balcaoDiamante),
    metroBronze:number(body?.metroBronze), metroPrata:number(body?.metroPrata), metroOuro:number(body?.metroOuro), metroDiamante:number(body?.metroDiamante)
  };
  const validation = validateTargets(cfg);
  if (validation) return json({ok:false,error:validation},400);

  const user = clean(request.headers.get('X-AGF-Admin-User')) || 'admin';
  const old = await env.DB.prepare(`SELECT * FROM atende_dashboard_metas_mensais WHERE competencia=?`).bind(competencia).first();

  await env.DB.prepare(`
    INSERT INTO atende_dashboard_metas_mensais(
      competencia,dias_uteis_realizados,dias_uteis_mes,encomendas_meta,
      balcao_bronze,balcao_prata,balcao_ouro,balcao_diamante,
      metro_bronze,metro_prata,metro_ouro,metro_diamante,atualizado_por,atualizado_em
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(competencia) DO UPDATE SET
      dias_uteis_realizados=excluded.dias_uteis_realizados,
      dias_uteis_mes=excluded.dias_uteis_mes,
      encomendas_meta=excluded.encomendas_meta,
      balcao_bronze=excluded.balcao_bronze,
      balcao_prata=excluded.balcao_prata,
      balcao_ouro=excluded.balcao_ouro,
      balcao_diamante=excluded.balcao_diamante,
      metro_bronze=excluded.metro_bronze,
      metro_prata=excluded.metro_prata,
      metro_ouro=excluded.metro_ouro,
      metro_diamante=excluded.metro_diamante,
      atualizado_por=excluded.atualizado_por,
      atualizado_em=datetime('now')
  `).bind(
    competencia,cfg.diasUteisRealizados,cfg.diasUteisMes,cfg.encomendasMeta,
    cfg.balcaoBronze,cfg.balcaoPrata,cfg.balcaoOuro,cfg.balcaoDiamante,
    cfg.metroBronze,cfg.metroPrata,cfg.metroOuro,cfg.metroDiamante,user
  ).run();

  try {
    await env.DB.prepare(`
      INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em)
      VALUES('dashboard_meta',?,'config',?,?,?,datetime('now'))
    `).bind(competencia,JSON.stringify(old||{}),JSON.stringify(cfg),user).run();
  } catch (_) {}

  return json({ok:true,config:cfg});
}

function validateTargets(c) {
  if (c.diasUteisRealizados < 0) return 'dias_uteis_realizados_invalid';
  if (c.diasUteisMes <= 0) return 'dias_uteis_mes_invalid';
  if (c.diasUteisRealizados > c.diasUteisMes) return 'dias_uteis_realizados_gt_mes';
  if (c.encomendasMeta <= 0) return 'encomendas_meta_invalid';
  const balcao=[c.balcaoBronze,c.balcaoPrata,c.balcaoOuro,c.balcaoDiamante];
  const metro=[c.metroBronze,c.metroPrata,c.metroOuro,c.metroDiamante];
  if (!strictIncreasing(balcao)) return 'balcao_metas_invalid';
  if (!strictIncreasing(metro)) return 'metro_metas_invalid';
  return '';
}

function strictIncreasing(a){return a.length===4&&a.every((v,i)=>v>0&&(i===0||v>a[i-1]));}
function normalizeTargetRow(row,competencia){
  return {
    competencia,
    diasUteisRealizados:Number(row?.dias_uteis_realizados||0),
    diasUteisMes:Number(row?.dias_uteis_mes||0),
    encomendasMeta:Number(row?.encomendas_meta||0),
    balcaoBronze:Number(row?.balcao_bronze||0),balcaoPrata:Number(row?.balcao_prata||0),balcaoOuro:Number(row?.balcao_ouro||0),balcaoDiamante:Number(row?.balcao_diamante||0),
    metroBronze:Number(row?.metro_bronze||0),metroPrata:Number(row?.metro_prata||0),metroOuro:Number(row?.metro_ouro||0),metroDiamante:Number(row?.metro_diamante||0),
    atualizadoPor:clean(row?.atualizado_por),atualizadoEm:clean(row?.atualizado_em)
  };
}

function stepInfo(valor,escada){
  valor=Number(valor||0);
  let step=escada[escada.length-1];
  for(const item of escada){if(item.teto===null||valor<=item.teto){step=item;break;}}
  const previousCeiling=step.degrau===1?0:(escada[step.degrau-2].teto||0);
  const span=step.teto===null?0:Math.max(1,step.teto-previousCeiling);
  const used=step.teto===null?100:Math.max(0,Math.min(100,(valor-previousCeiling)*100/span));
  return {
    valor,
    degrau:step.degrau,
    percentual:step.percentual,
    teto:step.teto,
    saldoAteTeto:step.teto===null?0:Math.max(0,step.teto-valor),
    percentualFaixa:Number(used.toFixed(2)),
    remuneracaoVariavel:valor*step.percentual/100,
    observacao:'Parcela variavel; o ajuste fixo do degrau nao esta incluido.'
  };
}

async function resolveAnchorMonth(state,env){
  if(/^\d{4}-\d{2}-\d{2}$/.test(state.dataFim))return state.dataFim.slice(0,7);
  if(/^\d{4}-\d{2}-\d{2}$/.test(state.dataInicio))return state.dataInicio.slice(0,7);
  const row=await env.DB.prepare(`
    SELECT MAX(substr(r.data_postagem_iso,1,7)) AS mes
    FROM atende_postagens_raw r
    JOIN atende_raw_importacoes ri ON ri.import_key=r.import_key AND ri.concluido_em IS NOT NULL
    WHERE r.data_postagem_iso IS NOT NULL AND TRIM(r.data_postagem_iso)<>''
  `).first();
  const mes=clean(row?.mes);
  return /^\d{4}-\d{2}$/.test(mes)?mes:new Date().toISOString().slice(0,7);
}

function sixMonthRange(anchor){
  const [y,m]=anchor.split('-').map(Number),months=[];
  for(let i=5;i>=0;i--){const d=new Date(Date.UTC(y,m-1-i,1));months.push(d.toISOString().slice(0,7));}
  return {months,start:months[0]+'-01',end:monthRange(months[months.length-1]).end};
}
function monthRange(comp){const [y,m]=comp.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();return{start:comp+'-01',end:comp+'-'+String(last).padStart(2,'0')}}
function fillMonths(rows,months){const map=new Map((rows||[]).map(r=>[r.label,r]));return months.map(m=>map.get(m)||{label:m,quantidade:0,valor:0});}
function valueFor(rows,label){const r=(rows||[]).find(x=>normText(x.label)===normText(label));return Number(r?.valor||0);}
function valueForLocal(rows,code){const n=normText(code);const r=(rows||[]).find(x=>normText(x.codigo||x.label)===n||normText(x.label)===n);return Number(r?.valor||0);}
function mergeActiveLocals(rows,active){
  const map=new Map();
  (rows||[]).forEach(r=>map.set(normText(r.label),{label:r.label,codigo:r.label,quantidade:Number(r.quantidade||0),valor:Number(r.valor||0)}));
  (active||[]).forEach(l=>{const code=clean(l.codigo),name=clean(l.nome)||code,key=normText(code);let existing=map.get(key)||map.get(normText(name));if(existing){existing.codigo=code;existing.label=name;map.delete(normText(existing.label));map.set(key,existing);}else map.set(key,{label:name,codigo:code,quantidade:0,valor:0});});
  return Array.from(map.values()).sort((a,b)=>b.valor-a.valor||String(a.label).localeCompare(String(b.label),'pt-BR'));
}

function parseState(url){const facets={};for(const [key,spec] of Object.entries(FACETS))facets[key]=getMulti(url,spec.singular,key);facets.tiposObjeto=facets.tiposObjeto.map(v=>v.toUpperCase());return{dataInicio:clean(url.searchParams.get('dataInicio')),dataFim:clean(url.searchParams.get('dataFim')),q:clean(url.searchParams.get('q')),facets};}
function cloneState(state){return{dataInicio:state.dataInicio,dataFim:state.dataFim,q:state.q,facets:Object.fromEntries(Object.entries(state.facets||{}).map(([k,v])=>[k,(v||[]).slice()]))};}
function emptyState(){const facets={};for(const key of Object.keys(FACETS))facets[key]=[];return{dataInicio:'',dataFim:'',q:'',facets};}
function buildWhere(state){
  const where=[],args=[];
  if(state.dataInicio){where.push('r.data_postagem_iso >= ?');args.push(state.dataInicio+' 00:00:00');}
  if(state.dataFim){where.push('r.data_postagem_iso <= ?');args.push(state.dataFim+' 23:59:59');}
  if(state.q){const like=`%${state.q}%`;where.push(`(r.codigo_objeto LIKE ? OR r.atendimento LIKE ? OR r.nome_remetente LIKE ? OR c.nome_atual LIKE ? OR r.cep_destinatario LIKE ? OR r.cep_remetente LIKE ? OR r.numero_contrato LIKE ? OR co.nome LIKE ? OR co.cliente LIKE ? OR co.tipo LIKE ? OR r.cartao_postagem LIKE ? OR r.sistema_postagem LIKE ? OR r.cpf_matricula_atendente LIKE ? OR a.nome LIKE ? OR r.codigo_servico LIKE ? OR r.nome_servico LIKE ? OR cp.cliente_portal LIKE ?)`);args.push(...Array(17).fill(like));}
  for(const [key,spec] of Object.entries(FACETS)){if(key==='tiposObjeto')continue;addMultiFilter(where,args,spec.field,state.facets[key]);}
  addObjectFilter(where,args,state.facets.tiposObjeto);
  return{whereSql:where.length?` WHERE ${where.join(' AND ')}`:'',args};
}
function addObjectFilter(where,args,values){const tipos=unique((values||[]).map(v=>clean(v).toUpperCase()).filter(Boolean));if(!tipos.length)return;const clauses=[];for(const tipo of tipos){if(tipo==='SRO')clauses.push(`(NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR')`);else if(tipo==='PRODUTO ECT'||tipo==='SEM REGISTRO'){clauses.push(`(${OBJETO_VAZIO_SQL} AND sc.tipo_objeto = ?)`);args.push(tipo);}}if(clauses.length)where.push(`(${clauses.join(' OR ')})`);}
function breakdownSql(field,whereSql,limit){const condition=`${field} IS NOT NULL AND TRIM(CAST(${field} AS TEXT))<>'' AND LOWER(TRIM(CAST(${field} AS TEXT)))<>'null'`;return`SELECT ${field} AS label,COUNT(*) AS quantidade,COALESCE(SUM(r.valor_atendimento_num),0) AS valor ${BASE_FROM}${appendCondition(whereSql,condition)} GROUP BY ${field} ORDER BY valor DESC,quantidade DESC LIMIT ${Math.max(1,Number(limit)||10)}`;}
function mapBreakdown(rows){return(rows||[]).map(r=>({label:clean(r.label),quantidade:Number(r.quantidade||0),valor:Number(r.valor||0)})).filter(r=>r.label);}
function appendCondition(whereSql,condition){return whereSql?`${whereSql} AND ${condition}`:` WHERE ${condition}`;}
function addMultiFilter(where,args,field,values){const list=unique((values||[]).map(clean).filter(Boolean));if(!list.length)return;where.push(`(${list.map(()=>`${field} = ? COLLATE NOCASE`).join(' OR ')})`);args.push(...list);}
function getMulti(url,singular,plural){const values=[...url.searchParams.getAll(singular),...url.searchParams.getAll(plural)];for(const packed of url.searchParams.getAll(plural))if(packed.includes('|'))values.push(...packed.split('|'));return unique(values.map(clean).filter(Boolean));}
function unique(values){return Array.from(new Set(values));}
function authorized(request,env){return !!env.ATENDE_API_TOKEN&&(request.headers.get('Authorization')||'')===`Bearer ${env.ATENDE_API_TOKEN}`;}
function integer(v){const n=Math.round(number(v));return Number.isFinite(n)?n:0;}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function normText(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');}
function clean(v){if(v===null||v===undefined)return'';const s=String(v).trim();return/^(null|undefined)$/i.test(s)?'':s;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
