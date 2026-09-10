import baseApp from './table-controls-wrapper.js';

// ============================================================
// ATENDE - DASHBOARD V6 (camada isolada de teste)
//
// Esta camada fica acima do stack atual e nao altera o RAW. Ela:
// - substitui dias uteis manuais por calculo + override explicito;
// - le escada/ajustes/PPCC exclusivamente do D1 por vigencia;
// - separa receita RECORRENTE de CAMPANHA/PONTUAL;
// - calcula projecao ajustada, defesa de receita e Radar R5;
// - acrescenta os modulos de Gestao da Rodada 2.
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
const LOCAL_EXIBIDO_SQL = `COALESCE(pcl.local_codigo, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')`;
const TABELA_NORM_SQL = `REPLACE(REPLACE(UPPER(TRIM(COALESCE(sc.tabela,''))),' ',''),'-','')`;
const IS_MENSAGERIA_SQL = `(${TABELA_NORM_SQL}='R2G1')`;
const IS_ENCOMENDA_SQL = `(${TABELA_NORM_SQL}='R2G2')`;
const IS_ENCOMENDA_BALCAO_SQL = `(${IS_ENCOMENDA_SQL} AND UPPER(TRIM(COALESCE(${CONTRATO_CANAL_SQL},''))) IN ('','SEM CONTRATO','APP','BALCAO','BALCÃO'))`;
const IS_EMBALAGEM_SQL = `(COALESCE(sc.eh_embalagem,0)=1)`;
const CLIENTE_CHAVE_SQL = `CASE
  WHEN TRIM(COALESCE(cp.cliente_portal_norm,''))<>'' THEN 'PORTAL:' || cp.cliente_portal_norm
  WHEN c.id IS NOT NULL THEN 'CLIENTE:' || CAST(c.id AS TEXT)
  WHEN TRIM(COALESCE(r.nome_remetente_norm,''))<>'' THEN 'REMETENTE:' || r.nome_remetente_norm
  ELSE 'REMETENTE:SEM_NOME'
END`;
const CLIENTE_NOME_SQL = `COALESCE(NULLIF(TRIM(cp.cliente_portal),''),NULLIF(TRIM(c.nome_atual),''),NULLIF(TRIM(r.nome_remetente),''),'(sem cliente)')`;
const GRUPO_SQL = `CASE WHEN ${IS_MENSAGERIA_SQL} THEN 'R2G1' WHEN ${IS_ENCOMENDA_SQL} THEN 'R2G2' ELSE 'OUTROS' END`;

const BASE_FROM_V6 = `
  FROM atende_postagens_canonicas r
  LEFT JOIN atende_cliente_aliases ca ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c ON c.id = ca.cliente_id AND c.ativo = 1
  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1
  LEFT JOIN atende_atendente_local atl ON atl.codigo = r.atendente_norm
  LEFT JOIN atende_contratos co ON co.numero = r.numero_contrato_norm AND co.ativo = 1
  LEFT JOIN (
    SELECT rr.numero_contrato_norm AS numero, COUNT(*) AS ocorrencias
    FROM atende_postagens_canonicas rr
    WHERE rr.numero_contrato_norm IS NOT NULL
      AND TRIM(rr.numero_contrato_norm)<>''
      AND LOWER(TRIM(rr.numero_contrato_norm))<>'null'
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
  tiposObjeto: {singular:'tipoObjeto',field:OBJETO_FACET_SQL},
  servicos: {singular:'servico',field:'r.nome_servico'},
  servicoTipos: {singular:'servicoTipo',field:"COALESCE(sc.tipo_servico,'')"},
  servicoSubgrupos: {singular:'servicoSubgrupo',field:"COALESCE(sc.subgrupo,'')"},
  servicoTabelas: {singular:'servicoTabela',field:"COALESCE(sc.tabela,'')"},
  clientesPortal: {singular:'clientePortal',field:CLIENTE_PORTAL_SQL},
  contratoClientes: {singular:'contratoCliente',field:"COALESCE(co.cliente,'')"},
  contratoTipos: {singular:'contratoTipo',field:CONTRATO_TIPO_SQL},
  intermediadores: {singular:'intermediador',field:CONTRATO_CANAL_SQL},
  sistemas: {singular:'sistema',field:'r.sistema_postagem'},
  estornos: {singular:'estorno',field:'r.estorno'},
  atendentes: {singular:'atendente',field:ATENDENTE_EXIBIDO_SQL},
  modalidadesPagamento: {singular:'modalidadePagamento',field:'r.modalidade_pagamento'},
  formasPagamento: {singular:'formaPagamento',field:'r.forma_pagamento'},
  locais: {singular:'local',field:LOCAL_EXIBIDO_SQL}
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/dashboard-targets' && request.method === 'GET') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return getTargetsV6(url, env);
    }
    if (url.pathname === '/admin/dashboard-targets' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveTargetsV6(request, env);
    }
    if (url.pathname === '/admin/dashboard-revenue-clients' && request.method === 'GET') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return getRevenueClients(url, env);
    }
    if (url.pathname === '/admin/dashboard-revenue-client' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ok:false,error:'unauthorized'},401);
      return saveRevenueClient(request, env);
    }

    const response = await baseApp.fetch(request, env, ctx);
    const isDashboard = request.method === 'GET' && url.pathname === '/atende' && url.searchParams.get('view') === 'dashboard';
    if (!isDashboard || !response.ok) return response;

    let body;
    try { body = await response.json(); }
    catch (_) { return response; }

    try {
      const extras = await buildDashboardV6(url, env, body);
      Object.assign(body, extras);
    } catch (err) {
      body.dashboardV6Erro = err && err.message ? String(err.message) : String(err || 'dashboard_v6_error');
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Type','application/json; charset=utf-8');
    return new Response(JSON.stringify(body), {status:response.status, headers});
  }
};

async function buildDashboardV6(url, env, body) {
  const state = parseState(url);
  const anchorMonth = await resolveAnchorMonth(state, env);
  const contractCatalog = await loadContractCatalog(env);
  const contract = contractForMonth(contractCatalog, anchorMonth);
  const allHolidays = await loadHolidays(env, monthAdd(anchorMonth,-12)+'-01', monthRange(monthAdd(anchorMonth,2)).end);
  const targetBundle = await loadTargetBundle(anchorMonth, env, allHolidays);

  const [series, clientAnalytics, health, daily, attendantPack, captacao] = await Promise.all([
    buildMonthlySeries(anchorMonth, state, env, contractCatalog),
    buildClientAnalytics(anchorMonth, state, env, targetBundle.config),
    buildHealth(anchorMonth, env, targetBundle.config, contract, allHolidays),
    buildDaily(state, anchorMonth, env, allHolidays),
    buildAttendantAndPackaging(state, anchorMonth, env),
    buildCaptacao(state, anchorMonth, env)
  ]);

  const projection = buildProjection(clientAnalytics, targetBundle.config);
  const currentM = stepInfo(projection.grupos.mensageria.realizado, contract.mensageria);
  const currentE = stepInfo(projection.grupos.encomendas.realizado, contract.encomendas);
  const projectedM = stepInfo(projection.grupos.mensageria.projetado, contract.mensageria);
  const projectedE = stepInfo(projection.grupos.encomendas.projetado, contract.encomendas);

  const alertaDegrau = buildTierAlert(currentM, projectedM, currentE, projectedE, projection);
  const estouro = buildThresholdDates(anchorMonth, series, {mensageria:currentM,encomendas:currentE}, targetBundle.config, allHolidays);
  const remuneration = {
    fonte:`Contrato AGF Tipo 12 · Anexo 3 · D1 por vigência · PPCC ${fixed(contract.ppcc,2)}`,
    origemTabela:contract.origemTabela,
    ppcc:contract.ppcc,
    tabela:{mensageria:contract.mensageria,encomendas:contract.encomendas},
    mensageria:currentM,
    encomendas:currentE,
    mensageriaProjecao:projectedM,
    encomendasProjecao:projectedE,
    marginal:{
      mensageria:projectedM?.percentual || currentM?.percentual || 0,
      encomendas:projectedE?.percentual || currentE?.percentual || 0,
      base:projection.revisaoNecessaria?'projecao_ajustada_revisar':'projecao_ajustada'
    },
    alertaDegrau,
    estouro
  };

  const taxaEfetiva = buildEffectiveRate(series, anchorMonth);
  const decomposicao = buildDecomposition(series);
  const banda = buildBand(series);
  const baseRecorrente = buildRecurringBase(clientAnalytics, targetBundle.config);
  const quedaClientes = buildClientDrop(clientAnalytics, targetBundle.config, projectedM, projectedE);
  const radarR5 = buildR5Radar(clientAnalytics, targetBundle.config, projectedE);
  const riscoConcentracao = buildConcentrationRisk(clientAnalytics);

  return {
    versaoDashboard:'gestao-v6',
    metas:{
      ...(body.metas || {}),
      disponivel:targetBundle.found,
      competencia:anchorMonth,
      config:targetBundle.config,
      realizado:(body.metas && body.metas.realizado) || {}
    },
    projecaoReceita:projection,
    remuneracao:remuneration,
    oportunidadeEmbalagem:attendantPack.oportunidadeEmbalagem,
    atendentesDesempenho:attendantPack.atendentesDesempenho,
    taxaEfetiva,
    saudeDado:health,
    decomposicao,
    diario:daily,
    banda,
    captacao,
    baseRecorrente,
    quedaClientes,
    radarR5,
    riscoConcentracao,
    dashboardV6Meta:{anchorMonth,geradoEm:new Date().toISOString(),metodoProjecao:'recorrente/dias*mes + eventual_ja_realizado'}
  };
}

// ---------------------------------------------------------------------------
// Metas e dias uteis
// ---------------------------------------------------------------------------

async function loadTargetBundle(competencia, env, holidays) {
  const row = await env.DB.prepare(`SELECT * FROM atende_dashboard_metas_mensais WHERE competencia=?`).bind(competencia).first();
  const range = monthRange(competencia);
  const last = await env.DB.prepare(`
    SELECT MAX(substr(data_postagem_iso,1,10)) AS ultima_data,
           COUNT(DISTINCT substr(data_postagem_iso,1,10)) AS dias_movimento
    FROM atende_postagens_canonicas
    WHERE data_postagem_iso>=? AND data_postagem_iso<=?
  `).bind(range.start+' 00:00:00',range.end+' 23:59:59').first();
  const calc = calculatedDays(competencia, clean(last?.ultima_data), holidays);
  const overrideReal = nullableInt(row?.dias_uteis_realizados_override);
  const overrideMes = nullableInt(row?.dias_uteis_mes_override);
  const efetivoReal = overrideReal === null ? calc.realizados : overrideReal;
  const efetivoMes = overrideMes === null ? calc.mes : overrideMes;
  const config = normalizeTargetRowV6(row, competencia, {
    calcReal:calc.realizados, calcMes:calc.mes,
    efetivoReal, efetivoMes,
    overrideReal, overrideMes,
    diasMovimento:Number(last?.dias_movimento||0),
    ultimaData:clean(last?.ultima_data)
  });
  return {found:!!row, config};
}

async function getTargetsV6(url, env) {
  const competencia = clean(url.searchParams.get('competencia'));
  if (!/^\d{4}-\d{2}$/.test(competencia)) return json({ok:false,error:'competencia_invalid'},400);
  const holidays = await loadHolidays(env, competencia+'-01', monthRange(competencia).end);
  const bundle = await loadTargetBundle(competencia, env, holidays);
  return json({ok:true,found:bundle.found,config:bundle.config});
}

async function saveTargetsV6(request, env) {
  const body = await readJson(request);
  if (!body) return json({ok:false,error:'invalid_json'},400);
  const competencia = clean(body.competencia);
  if (!/^\d{4}-\d{2}$/.test(competencia)) return json({ok:false,error:'competencia_invalid'},400);

  const holidays = await loadHolidays(env, competencia+'-01', monthRange(competencia).end);
  const before = await loadTargetBundle(competencia, env, holidays);
  const hasRealOverride = Object.prototype.hasOwnProperty.call(body,'diasUteisRealizadosOverride');
  const hasMesOverride = Object.prototype.hasOwnProperty.call(body,'diasUteisMesOverride');
  const realOverride = nullableInt(hasRealOverride ? body.diasUteisRealizadosOverride : body.diasUteisRealizados);
  const mesOverride = nullableInt(hasMesOverride ? body.diasUteisMesOverride : body.diasUteisMes);
  const efetivoReal = realOverride === null ? before.config.diasUteisRealizadosCalculado : realOverride;
  const efetivoMes = mesOverride === null ? before.config.diasUteisMesCalculado : mesOverride;

  if (efetivoMes <= 0) return json({ok:false,error:'dias_uteis_mes_invalid'},400);
  if (efetivoReal < 0 || efetivoReal > efetivoMes) return json({ok:false,error:'dias_uteis_realizados_invalid'},400);

  const cfg = {
    encomendasMeta:num(body.encomendasMeta),
    balcaoBronze:num(body.balcaoBronze), balcaoPrata:num(body.balcaoPrata), balcaoOuro:num(body.balcaoOuro), balcaoDiamante:num(body.balcaoDiamante),
    metroBronze:num(body.metroBronze), metroPrata:num(body.metroPrata), metroOuro:num(body.metroOuro), metroDiamante:num(body.metroDiamante)
  };
  const validation = validateTargets(cfg);
  if (validation) return json({ok:false,error:validation},400);

  const user = clean(request.headers.get('X-AGF-Admin-User')) || 'admin';
  const old = await env.DB.prepare(`SELECT * FROM atende_dashboard_metas_mensais WHERE competencia=?`).bind(competencia).first();
  await env.DB.prepare(`
    INSERT INTO atende_dashboard_metas_mensais(
      competencia,dias_uteis_realizados,dias_uteis_mes,
      dias_uteis_realizados_override,dias_uteis_mes_override,
      encomendas_meta,balcao_bronze,balcao_prata,balcao_ouro,balcao_diamante,
      metro_bronze,metro_prata,metro_ouro,metro_diamante,atualizado_por,atualizado_em
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(competencia) DO UPDATE SET
      dias_uteis_realizados=excluded.dias_uteis_realizados,
      dias_uteis_mes=excluded.dias_uteis_mes,
      dias_uteis_realizados_override=excluded.dias_uteis_realizados_override,
      dias_uteis_mes_override=excluded.dias_uteis_mes_override,
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
    competencia,efetivoReal,efetivoMes,realOverride,mesOverride,
    cfg.encomendasMeta,cfg.balcaoBronze,cfg.balcaoPrata,cfg.balcaoOuro,cfg.balcaoDiamante,
    cfg.metroBronze,cfg.metroPrata,cfg.metroOuro,cfg.metroDiamante,user
  ).run();
  await audit(env,'dashboard_meta',competencia,'config',old||{},body,user);
  const after = await loadTargetBundle(competencia, env, holidays);
  return json({ok:true,config:after.config});
}

function normalizeTargetRowV6(row, competencia, d) {
  return {
    competencia,
    diasUteisRealizados:d.efetivoReal,
    diasUteisMes:d.efetivoMes,
    diasUteisRealizadosCalculado:d.calcReal,
    diasUteisMesCalculado:d.calcMes,
    diasUteisRealizadosOverride:d.overrideReal,
    diasUteisMesOverride:d.overrideMes,
    diasComMovimento:d.diasMovimento,
    ultimaDataComMovimento:d.ultimaData,
    diasDivergencia:(d.overrideReal!==null&&d.overrideReal!==d.calcReal)||(d.overrideMes!==null&&d.overrideMes!==d.calcMes),
    encomendasMeta:num(row?.encomendas_meta),
    balcaoBronze:num(row?.balcao_bronze),balcaoPrata:num(row?.balcao_prata),balcaoOuro:num(row?.balcao_ouro),balcaoDiamante:num(row?.balcao_diamante),
    metroBronze:num(row?.metro_bronze),metroPrata:num(row?.metro_prata),metroOuro:num(row?.metro_ouro),metroDiamante:num(row?.metro_diamante),
    atualizadoPor:clean(row?.atualizado_por),atualizadoEm:clean(row?.atualizado_em)
  };
}

function validateTargets(c) {
  if (c.encomendasMeta <= 0) return 'encomendas_meta_invalid';
  if (!strictIncreasing([c.balcaoBronze,c.balcaoPrata,c.balcaoOuro,c.balcaoDiamante])) return 'balcao_metas_invalid';
  if (!strictIncreasing([c.metroBronze,c.metroPrata,c.metroOuro,c.metroDiamante])) return 'metro_metas_invalid';
  return '';
}
function strictIncreasing(a){return a.length===4&&a.every((v,i)=>v>0&&(i===0||v>a[i-1]));}

// ---------------------------------------------------------------------------
// Contrato por PPCC / vigencia
// ---------------------------------------------------------------------------

async function loadContractCatalog(env) {
  try {
    const [ppccResult, tableResult] = await env.DB.batch([
      env.DB.prepare(`SELECT vigencia_inicio,vigencia_fim,valor,observacao FROM atende_contrato_ppcc ORDER BY vigencia_inicio ASC`),
      env.DB.prepare(`SELECT grupo,degrau,teto_ppcc,percentual,ajuste_ppcc,vigencia_inicio,vigencia_fim FROM atende_contrato_tabela ORDER BY vigencia_inicio ASC,grupo,degrau`)
    ]);
    const ppcc = ppccResult?.results || [];
    const rows = tableResult?.results || [];
    return {ok:ppcc.length>0&&rows.length>0,ppcc,rows};
  } catch (_) {
    return {ok:false,ppcc:[],rows:[]};
  }
}

function contractForMonth(catalog, competencia) {
  if (!catalog?.ok) return {origemTabela:'fallback',ppcc:0,mensageria:[],encomendas:[]};
  const date=competencia+'-01';
  const ppccRows=catalog.ppcc.filter(r=>date>=r.vigencia_inicio&&(!r.vigencia_fim||date<=r.vigencia_fim));
  const ppccRow=ppccRows[ppccRows.length-1];
  const ppcc=num(ppccRow?.valor);
  if(!ppcc)return {origemTabela:'fallback',ppcc:0,mensageria:[],encomendas:[]};

  const selected=new Map();
  catalog.rows.forEach(r=>{
    if(date<r.vigencia_inicio||(r.vigencia_fim&&date>r.vigencia_fim))return;
    const key=r.grupo+'|'+r.degrau;
    const old=selected.get(key);
    if(!old||String(r.vigencia_inicio)>String(old.vigencia_inicio))selected.set(key,r);
  });
  function group(code){
    return Array.from(selected.values()).filter(r=>r.grupo===code).sort((a,b)=>num(a.degrau)-num(b.degrau)).map(r=>({
      degrau:num(r.degrau),
      teto:r.teto_ppcc==null?null:round2(num(r.teto_ppcc)*ppcc),
      tetoPpcc:r.teto_ppcc==null?null:num(r.teto_ppcc),
      percentual:num(r.percentual),
      ajuste:round2(num(r.ajuste_ppcc)*ppcc),
      ajustePpcc:num(r.ajuste_ppcc)
    }));
  }
  return {origemTabela:'d1',ppcc,mensageria:group('R2G1'),encomendas:group('R2G2')};
}

function stepInfo(valor, escada) {
  valor=num(valor);
  if(!Array.isArray(escada)||!escada.length)return null;
  let step=escada[escada.length-1];
  for(const item of escada){if(item.teto===null||valor<=num(item.teto)){step=item;break;}}
  const prev=step.degrau===1?0:num(escada[step.degrau-2]?.teto);
  const span=step.teto===null?0:Math.max(1,num(step.teto)-prev);
  const used=step.teto===null?100:Math.max(0,Math.min(100,(valor-prev)*100/span));
  const variavel=valor*num(step.percentual)/100;
  const ajuste=num(step.ajuste);
  return {
    valor:round2(valor),degrau:num(step.degrau),percentual:num(step.percentual),teto:step.teto,
    saldoAteTeto:step.teto===null?0:round2(Math.max(0,num(step.teto)-valor)),
    percentualFaixa:round2(used),ajuste:round2(ajuste),remuneracaoVariavel:round2(variavel),
    remuneracaoTotal:round2(variavel+ajuste)
  };
}

// ---------------------------------------------------------------------------
// Projecao recorrente x eventual + defesa de receita
// ---------------------------------------------------------------------------

async function buildClientAnalytics(competencia, state, env, config) {
  const currentState=cloneState(state);
  const range=monthRange(competencia);
  currentState.dataInicio=range.start;
  currentState.dataFim=range.end;
  const current=buildWhere(currentState);

  const histStart=monthAdd(competencia,-3);
  const histEnd=monthAdd(competencia,-1);
  const histState=cloneState(state);
  histState.dataInicio=histStart+'-01';
  histState.dataFim=monthRange(histEnd).end;
  const hist=buildWhere(histState);

  const sql=(whereSql)=>`
    SELECT ${CLIENTE_CHAVE_SQL} AS cliente_chave,
           ${CLIENTE_NOME_SQL} AS cliente,
           ${GRUPO_SQL} AS grupo,
           ${LOCAL_EXIBIDO_SQL} AS local_codigo,
           substr(r.data_postagem_iso,1,7) AS competencia,
           COUNT(*) AS quantidade,
           COALESCE(SUM(r.valor_atendimento_num),0) AS valor
    ${BASE_FROM_V6}${whereSql}
    GROUP BY 1,2,3,4,5
  `;
  const [currResult,histResult,classResult]=await env.DB.batch([
    env.DB.prepare(sql(current.whereSql)).bind(...current.args),
    env.DB.prepare(sql(hist.whereSql)).bind(...hist.args),
    env.DB.prepare(`SELECT cliente_chave,cliente_nome,tipo_receita,data_fim_prevista,observacao FROM atende_cliente_receita_classificacao WHERE ativo=1`)
  ]);
  const curr=currResult?.results||[], histRows=histResult?.results||[], classes=classResult?.results||[];
  const classMap=new Map(classes.map(x=>[clean(x.cliente_chave),x]));
  const histMonths=[histStart,monthAdd(histStart,1),histEnd];
  const histMap=new Map();
  const names=new Map();
  histRows.forEach(r=>{
    const key=clean(r.cliente_chave)+'|'+clean(r.grupo);
    if(!histMap.has(key))histMap.set(key,new Map());
    histMap.get(key).set(clean(r.competencia),num(r.valor));
    names.set(clean(r.cliente_chave),clean(r.cliente));
  });
  const currMap=new Map();
  curr.forEach(r=>{
    const key=clean(r.cliente_chave)+'|'+clean(r.grupo);
    const old=currMap.get(key)||{clienteChave:clean(r.cliente_chave),cliente:clean(r.cliente),grupo:clean(r.grupo),valor:0,quantidade:0,locais:{}};
    old.valor+=num(r.valor);old.quantidade+=num(r.quantidade);
    const loc=norm(r.local_codigo)||'SEM_LOCAL';old.locais[loc]=(old.locais[loc]||0)+num(r.valor);
    currMap.set(key,old);names.set(old.clienteChave,old.cliente);
  });
  const groupTotals={R2G1:0,R2G2:0,OUTROS:0};
  currMap.forEach(x=>{groupTotals[x.grupo]=(groupTotals[x.grupo]||0)+x.valor;});
  const done=Math.max(0,num(config.diasUteisRealizados)),days=Math.max(0,num(config.diasUteisMes));
  const progress=days?done/days:0;

  const keys=new Set([...histMap.keys(),...currMap.keys()]);
  const items=[];
  keys.forEach(key=>{
    const currentRow=currMap.get(key);
    const [clientKey,group]=splitAnalyticsKey(key);
    const h=histMap.get(key)||new Map();
    const histValues=histMonths.map(m=>num(h.get(m)));
    const avg3=histValues.reduce((a,v)=>a+v,0)/histMonths.length;
    const currentValue=num(currentRow?.valor);
    const cls=classMap.get(clientKey)||{};
    const type=clean(cls.tipo_receita).toUpperCase();
    const dataFim=clean(cls.data_fim_prevista);
    const expired=!!(currentValue>0&&(type==='CAMPANHA'||type==='PONTUAL')&&dataFim&&dataFim<competencia+'-01');
    const effectiveType=expired?'':type;
    const shareGroup=groupTotals[group]?currentValue*100/groupTotals[group]:0;
    const expectedPartial=avg3*progress;
    const reasons=[];
    if(expired)reasons.push('classificacao_vencida');
    if(!effectiveType&&(group==='R2G1'||group==='R2G2')){
      if(shareGroup>=30&&currentValue>=10000)reasons.push('alta_concentracao');
      if(avg3>0&&expectedPartial>0&&currentValue>=5000&&currentValue>=expectedPartial*2)reasons.push('fora_historico');
      if(avg3===0&&shareGroup>=20&&currentValue>=10000)reasons.push('sem_historico_concentrado');
    }
    items.push({
      clienteChave:clientKey,cliente:clean(currentRow?.cliente)||names.get(clientKey)||clean(cls.cliente_nome)||'(sem cliente)',
      grupo:group,valorAtual:round2(currentValue),quantidade:num(currentRow?.quantidade),locais:currentRow?.locais||{},
      historico:histValues.map((v,i)=>({competencia:histMonths[i],valor:round2(v)})),
      media3Meses:round2(avg3),esperadoParcial:round2(expectedPartial),participacaoGrupo:round2(shareGroup),
      tipoReceita:type,tipoReceitaEfetivo:effectiveType,dataFimPrevista:dataFim,observacao:clean(cls.observacao),
      motivos:reasons,precisaRevisao:!effectiveType&&reasons.length>0
    });
  });
  return {competencia,items,groupTotals,histMonths,classMap};
}

function buildProjection(a, config) {
  const done=num(config.diasUteisRealizados),days=num(config.diasUteisMes);
  const groups={
    mensageria:newProjectionGroup('R2G1'),
    encomendas:newProjectionGroup('R2G2'),
    outros:newProjectionGroup('OUTROS')
  };
  const locs={};
  const signals=[];
  a.items.forEach(x=>{
    const g=x.grupo==='R2G1'?groups.mensageria:x.grupo==='R2G2'?groups.encomendas:groups.outros;
    g.realizado+=x.valorAtual;
    const effective=x.tipoReceitaEfetivo;
    const eventual=effective==='CAMPANHA'||effective==='PONTUAL';
    const pending=!!x.precisaRevisao;
    if(pending)g.pendenteRealizado+=x.valorAtual;
    else if(eventual)g.eventualRealizado+=x.valorAtual;
    else g.recorrenteRealizado+=x.valorAtual;
    if(pending){g.confiavel=false;signals.push({cliente:x.cliente,clienteChave:x.clienteChave,grupo:x.grupo,valorAtual:x.valorAtual,media3Meses:x.media3Meses,participacao:x.participacaoGrupo,motivos:x.motivos});}
    Object.entries(x.locais||{}).forEach(([loc,val])=>{
      const k=norm(loc)||'SEM_LOCAL';if(!locs[k])locs[k]={realizado:0,recorrenteRealizado:0,eventualRealizado:0,pendenteRealizado:0,projetado:0};
      locs[k].realizado+=val;
      if(pending)locs[k].pendenteRealizado+=val;
      else if(eventual)locs[k].eventualRealizado+=val;
      else locs[k].recorrenteRealizado+=val;
    });
  });
  Object.values(groups).forEach(g=>{g.projetado=done&&days?round2(g.recorrenteRealizado/done*days+g.eventualRealizado+g.pendenteRealizado):0;g.realizado=round2(g.realizado);g.recorrenteRealizado=round2(g.recorrenteRealizado);g.eventualRealizado=round2(g.eventualRealizado);g.pendenteRealizado=round2(g.pendenteRealizado);});
  Object.values(locs).forEach(l=>{l.projetado=done&&days?round2(l.recorrenteRealizado/done*days+l.eventualRealizado+l.pendenteRealizado):0;l.realizado=round2(l.realizado);l.recorrenteRealizado=round2(l.recorrenteRealizado);l.eventualRealizado=round2(l.eventualRealizado);l.pendenteRealizado=round2(l.pendenteRealizado);});
  const total={realizado:0,recorrente:0,eventual:0,pendente:0,projetado:0};
  Object.values(groups).forEach(g=>{total.realizado+=g.realizado;total.recorrente+=g.recorrenteRealizado;total.eventual+=g.eventualRealizado;total.pendente+=g.pendenteRealizado;total.projetado+=g.projetado;});
  return {
    disponivel:done>0&&days>0,
    metodo:'(recorrente / dias_decorridos * dias_mes) + eventual_ja_realizado + pendente_ja_realizado',
    diasUteisRealizados:done,diasUteisMes:days,
    recorrenteRealizado:round2(total.recorrente),eventualRealizado:round2(total.eventual),pendenteRealizado:round2(total.pendente),realizado:round2(total.realizado),projetado:round2(total.projetado),
    revisaoNecessaria:signals.length>0,sinaisEventual:signals.slice(0,20),
    grupos:groups,locais:{agf:locs.AGF||{},metro:locs.METRO||{},todos:locs}
  };
}
function newProjectionGroup(grupo){return{grupo,realizado:0,recorrenteRealizado:0,eventualRealizado:0,pendenteRealizado:0,projetado:0,confiavel:true};}

function buildTierAlert(cm,pm,ce,pe,p){
  const items=[];
  function add(label,curr,proj,meta){
    if(!curr||!proj||!meta||meta.confiavel===false||curr.degrau===proj.degrau)return;
    const loss=Math.max(0,(num(curr.percentual)-num(proj.percentual))*num(proj.valor)/100);
    items.push({grupo:label,degrauAtual:curr.degrau,degrauProjetado:proj.degrau,percentualAtual:curr.percentual,percentualProjetado:proj.percentual,valorProjetado:proj.valor,sentido:proj.degrau>curr.degrau?'estoura':'recua',excedenteProjetado:curr.teto?Math.max(0,num(proj.valor)-num(curr.teto)):0,perdaMarginal:round2(loss)});
  }
  add('Mensageria',cm,pm,p.grupos.mensageria);add('Encomendas',ce,pe,p.grupos.encomendas);
  return {ativo:items.length>0,itens:items,suspenso:p.revisaoNecessaria,motivo:p.revisaoNecessaria?'classificacao_pendente':''};
}

function buildRecurringBase(a, config) {
  const done=num(config.diasUteisRealizados),days=num(config.diasUteisMes);
  const groups={R2G1:{hist:[0,0,0],current:0},R2G2:{hist:[0,0,0],current:0},OUTROS:{hist:[0,0,0],current:0}};
  a.items.forEach(x=>{
    if(x.tipoReceita==='CAMPANHA'||x.tipoReceita==='PONTUAL'||x.precisaRevisao)return;
    const g=groups[x.grupo]||groups.OUTROS;
    x.historico.forEach((h,i)=>{g.hist[i]+=num(h.valor);});
    g.current+=num(x.valorAtual);
  });
  function pack(g){
    const hist=g.hist.map(round2),avg=hist.reduce((s,v)=>s+v,0)/hist.length,currentProj=done&&days?g.current/done*days:g.current;
    const last=hist[hist.length-1]||0;
    return{historico:a.histMonths.map((m,i)=>({competencia:m,valor:hist[i]})),media3Meses:round2(avg),ultimoFechado:round2(last),recorrenteRealizado:round2(g.current),projecaoRecorrente:round2(currentProj),variacaoVsMedia:avg?round2((currentProj-avg)*100/avg):0,variacaoVsUltimo:last?round2((currentProj-last)*100/last):0};
  }
  const m=pack(groups.R2G1),e=pack(groups.R2G2),o=pack(groups.OUTROS);
  return{disponivel:done>0&&days>0,baseMeses:a.histMonths,mensageria:m,encomendas:e,outros:o,alertaQuedaEncomendas:e.variacaoVsMedia<=-20,alertaQuedaMensageria:m.variacaoVsMedia<=-20};
}

function buildClientDrop(a, config, projectedM, projectedE) {
  const done=num(config.diasUteisRealizados),days=num(config.diasUteisMes);
  if(!done||!days)return{disponivel:false,limiteQuedaPct:-30,clientes:[],baseMeses:a.histMonths};
  const rows=[];
  a.items.forEach(x=>{
    if(x.grupo!=='R2G1'&&x.grupo!=='R2G2')return;
    if(x.tipoReceita==='CAMPANHA'||x.tipoReceita==='PONTUAL'||x.precisaRevisao)return;
    if(x.media3Meses<5000)return;
    const projected=round2(x.valorAtual/done*days);
    const variation=x.media3Meses?((projected-x.media3Meses)*100/x.media3Meses):0;
    if(variation>-30)return;
    const loss=Math.max(0,x.media3Meses-projected);
    const rate=x.grupo==='R2G2'?num(projectedE?.percentual):num(projectedM?.percentual);
    rows.push({cliente:x.cliente,clienteChave:x.clienteChave,grupo:x.grupo,media3Meses:x.media3Meses,projecaoAtual:projected,quedaPct:round2(variation),faturamentoEmRisco:round2(loss),percentualRemuneracao:rate,remuneracaoEmRisco:round2(loss*rate/100),dataFimPrevista:x.dataFimPrevista});
  });
  rows.sort((a,b)=>b.remuneracaoEmRisco-a.remuneracaoEmRisco||a.quedaPct-b.quedaPct);
  return {disponivel:true,limiteQuedaPct:-30,baseMeses:a.histMonths,clientes:rows.slice(0,20),totalFaturamentoEmRisco:round2(rows.reduce((s,x)=>s+x.faturamentoEmRisco,0)),totalRemuneracaoEmRisco:round2(rows.reduce((s,x)=>s+x.remuneracaoEmRisco,0))};
}

function buildR5Radar(a, config, projectedE) {
  const done=num(config.diasUteisRealizados),days=num(config.diasUteisMes),currentRate=num(projectedE?.percentual),r5=8.52;
  const map=new Map();
  a.items.filter(x=>x.grupo==='R2G2').forEach(x=>{
    if(x.tipoReceita==='CAMPANHA'||x.tipoReceita==='PONTUAL'||x.precisaRevisao)return;
    const current=done&&days?x.valorAtual/done*days:x.valorAtual;
    const base=Math.max(x.media3Meses,current);
    if(base<40000)return;
    map.set(x.clienteChave,{cliente:x.cliente,clienteChave:x.clienteChave,media3Meses:x.media3Meses,projecaoAtual:round2(current),baseMensal:round2(base),taxaAtual:currentRate,taxaR5:r5,diferencaPontos:round2(currentRate-r5),remuneracaoExposta:round2(Math.max(0,currentRate-r5)*base/100)});
  });
  const clientes=Array.from(map.values()).sort((a,b)=>b.baseMensal-a.baseMensal).slice(0,20);
  return {disponivel:true,corteMensal:40000,taxaR5:r5,clientes,totalBaseMensal:round2(clientes.reduce((s,x)=>s+x.baseMensal,0)),totalRemuneracaoExposta:round2(clientes.reduce((s,x)=>s+x.remuneracaoExposta,0)),nota:'Sinal de exposição comercial; enquadramento R5 deve ser confirmado contratualmente.'};
}

function buildConcentrationRisk(a) {
  const out={};
  ['R2G1','R2G2'].forEach(group=>{
    const rows=a.items.filter(x=>x.grupo===group&&x.valorAtual>0).sort((x,y)=>y.valorAtual-x.valorAtual);
    const total=rows.reduce((s,x)=>s+x.valorAtual,0);
    const top=rows.slice(0,5).map(x=>{const t=x.tipoReceitaEfetivo||'';return{cliente:x.cliente,valor:x.valorAtual,share:total?round2(x.valorAtual*100/total):0,tipoReceita:t,dataFimPrevista:x.dataFimPrevista||'',natureza:x.precisaRevisao?'nao_classificada':((t==='CAMPANHA'||t==='PONTUAL')?(x.dataFimPrevista?'temporaria_com_data':'temporaria_sem_data'):(t==='RECORRENTE'?'estrutural':'nao_classificada'))};});
    out[group]={total:round2(total),top,top1:top[0]?.share||0,top3:round2(top.slice(0,3).reduce((s,x)=>s+x.share,0))};
  });
  return out;
}

// ---------------------------------------------------------------------------
// Serie mensal: taxa efetiva, decomposicao, banda, data de estouro
// ---------------------------------------------------------------------------

async function buildMonthlySeries(anchorMonth, state, env, catalog) {
  const first=monthAdd(anchorMonth,-11), rangeStart=first+'-01',rangeEnd=monthRange(anchorMonth).end;
  const s=cloneState(state);s.dataInicio='';s.dataFim='';
  const where=buildWhere(s);
  const condition=appendCondition(where.whereSql,`r.data_postagem_iso>=? AND r.data_postagem_iso<=?`);
  const q=await env.DB.prepare(`
    SELECT substr(r.data_postagem_iso,1,7) AS competencia,
           ${GRUPO_SQL} AS grupo,
           COUNT(*) AS quantidade,
           COALESCE(SUM(r.valor_atendimento_num),0) AS valor
    ${BASE_FROM_V6}${condition}
    GROUP BY 1,2 ORDER BY 1 ASC
  `).bind(...where.args,rangeStart+' 00:00:00',rangeEnd+' 23:59:59').all();
  const byMonth=new Map();
  (q.results||[]).forEach(r=>{const m=clean(r.competencia);if(!byMonth.has(m))byMonth.set(m,{R2G1:0,R2G2:0,OUTROS:0});byMonth.get(m)[clean(r.grupo)]=num(r.valor);});
  const out=[];
  for(const [comp,v] of byMonth.entries()){
    const c=contractForMonth(catalog,comp),m=stepInfo(v.R2G1,c.mensageria),e=stepInfo(v.R2G2,c.encomendas);
    const remuneration=num(m?.remuneracaoTotal)+num(e?.remuneracaoTotal),fatR2=num(v.R2G1)+num(v.R2G2),fat=fatR2+num(v.OUTROS);
    out.push({competencia:comp,faturamento:round2(fat),faturamentoR2:round2(fatR2),mensageria:round2(v.R2G1),encomendas:round2(v.R2G2),outros:round2(v.OUTROS),remuneracao:round2(remuneration),taxaEfetiva:fat?round2(remuneration*100/fat):0,taxaEfetivaR2:fatR2?round2(remuneration*100/fatR2):0,shareEncomenda:fatR2?round2(v.R2G2*100/fatR2):0,degrauMensageria:m?.degrau||0,degrauEncomendas:e?.degrau||0,taxaMensageria:m?.percentual||0,taxaEncomendas:e?.percentual||0,ajusteMensageria:m?.ajuste||0,ajusteEncomendas:e?.ajuste||0,ppcc:c.ppcc,fechado:comp<new Date().toISOString().slice(0,7),origemTabela:c.origemTabela});
  }
  return out.sort((a,b)=>a.competencia.localeCompare(b.competencia));
}

function buildEffectiveRate(series, anchorMonth) {
  const closed=series.filter(x=>x.fechado&&x.faturamento>0),latest=closed[closed.length-1]||null;
  const mean=closed.length?closed.reduce((s,x)=>s+x.taxaEfetiva,0)/closed.length:0;
  const slope=closed.length>=3?linearSlope(closed.map(x=>x.taxaEfetiva)):0;
  const trend=closed.length<3?'indisponivel':slope<-.15?'queda':slope>.15?'alta':'estavel';
  const first=closed[0],variation=first&&latest?latest.taxaEfetiva-first.taxaEfetiva:0;
  let insight='';
  if(closed.length>=2){const prev=closed[closed.length-2];if(latest.faturamento>prev.faturamento&&latest.taxaEfetiva<prev.taxaEfetiva)insight=`Faturamento subiu ${fixed((latest.faturamento-prev.faturamento)*100/prev.faturamento,1)}% e a taxa efetiva caiu ${fixed(prev.taxaEfetiva-latest.taxaEfetiva,2)} pontos. O mix migrou para linhas de menor retorno.`;}
  return {serie,current:series.find(x=>x.competencia===anchorMonth)||null,atual:series.find(x=>x.competencia===anchorMonth)||null,ultimoFechado:latest,media12m:round2(mean),variacao12m:round2(variation),tendencia:trend,coeficienteMensal:round2(slope),insight};
}

function buildDecomposition(series) {
  const c=series.filter(x=>x.fechado&&x.faturamentoR2>0);
  if(c.length<2)return{disponivel:false};
  const a=c[c.length-2],b=c[c.length-1],F0=a.faturamentoR2,F1=b.faturamentoR2;
  if(!F0||!F1)return{disponivel:false};
  const se1=b.encomendas/F1;
  const b0=(a.mensageria*a.taxaMensageria/100+a.encomendas*a.taxaEncomendas/100)/F0;
  const bMix=se1*a.taxaEncomendas/100+(1-se1)*a.taxaMensageria/100;
  const b1=se1*b.taxaEncomendas/100+(1-se1)*b.taxaMensageria/100;
  const effectVolume=(F1-F0)*b0;
  const effectMix=F1*(bMix-b0);
  const effectTier=F1*(b1-bMix);
  const effectAdjustment=(b.ajusteMensageria+b.ajusteEncomendas)-(a.ajusteMensageria+a.ajusteEncomendas);
  const variation=b.remuneracao-a.remuneracao;
  const sum=effectVolume+effectMix+effectTier+effectAdjustment;
  const residue=variation-sum;
  if(Math.abs(residue)>.02)return{disponivel:false,erro:'identidade_nao_fecha',residuo:round2(residue)};
  const effects=[['volume',effectVolume],['mix',effectMix],['degrau',effectTier],['ajuste',effectAdjustment]].sort((x,y)=>Math.abs(y[1])-Math.abs(x[1]));
  const leader=effects[0];
  return {disponivel:true,base:a.competencia,atual:b.competencia,remuneracaoBase:a.remuneracao,remuneracaoAtual:b.remuneracao,variacao:round2(variation),efeitoVolume:round2(effectVolume),efeitoMix:round2(effectMix),efeitoDegrau:round2(effectTier),efeitoAjuste:round2(effectAdjustment),residuo:round2(residue),leitura:`O maior efeito foi ${leader[0]} (${leader[1]>=0?'positivo':'negativo'}).`,ppccMudou:a.ppcc!==b.ppcc,ppccBase:a.ppcc,ppccAtual:b.ppcc};
}

function buildBand(series) {
  const closed=series.filter(x=>x.fechado&&x.remuneracao>0);
  if(closed.length<6)return{disponivel:false,mesesConsiderados:closed.length};
  const rv=closed.map(x=>x.remuneracao).sort((a,b)=>a-b),fv=closed.map(x=>x.faturamento).sort((a,b)=>a-b);
  const median=percentile(rv,.5),floor=percentile(rv,.1),ceil=percentile(rv,.9),amp=median?(ceil-floor)/median:0;
  const fatMedian=percentile(fv,.5);
  const minRow=closed.reduce((a,b)=>b.remuneracao<a.remuneracao?b:a),maxRow=closed.reduce((a,b)=>b.remuneracao>a.remuneracao?b:a);
  const maxFatRow=closed.reduce((a,b)=>b.faturamento>a.faturamento?b:a);
  return {disponivel:true,mesesConsiderados:closed.length,remuneracao:{piso:round2(floor),mediana:round2(median),teto:round2(ceil),menor:minRow.remuneracao,maior:maxRow.remuneracao,menorMes:minRow.competencia,maiorMes:maxRow.competencia},faturamento:{piso:round2(percentile(fv,.1)),mediana:round2(fatMedian),teto:round2(percentile(fv,.9))},amplitude:round2(amp),previsibilidade:amp<.2?'alta':amp<=.4?'media':'baixa',mesAtipico:maxFatRow.faturamento>1.5*fatMedian?maxFatRow.competencia:'',motivoAtipico:maxFatRow.faturamento>1.5*fatMedian?'faturamento_acima_1_5x_mediana':''};
}

function buildThresholdDates(anchorMonth, series, current, config, holidays) {
  const closed=series.filter(x=>x.fechado).slice(-3),baseMonths=closed.map(x=>x.competencia),last=clean(config.ultimaDataComMovimento)||anchorMonth+'-01';
  function one(kind,field){
    const cur=current[kind];if(!cur||cur.teto==null)return null;
    let sum=0,days=0;
    closed.forEach(x=>{sum+=num(x[field]);days+=businessDaysInMonth(x.competencia,holidays);});
    const avg=days?sum/days:0;if(!avg)return null;
    const balance=num(cur.teto)-num(cur.valor);
    if(balance<=0)return{mediaDiariaHistorica:round2(avg),diasUteisAteTeto:0,dataEstimada:last,estouraNoMes:true,folgaDiasUteis:0,baseMeses:baseMonths,jaCruzado:true,excedente:round2(-balance)};
    const need=balance/avg,date=addBusinessDays(last,Math.ceil(need),holidays),end=monthRange(anchorMonth).end;
    const remaining=businessDaysBetween(addDays(last,1),end,holidays);
    const cross=date<=end;
    return{mediaDiariaHistorica:round2(avg),diasUteisAteTeto:round2(need),dataEstimada:date,estouraNoMes:cross,folgaDiasUteis:cross?0:Math.max(0,Math.ceil(need)-remaining),baseMeses:baseMonths};
  }
  return {mensageria:one('mensageria','mensageria'),encomendas:one('encomendas','encomendas')};
}

// ---------------------------------------------------------------------------
// Saude do dado e calendario operacional
// ---------------------------------------------------------------------------

async function buildHealth(anchorMonth, env, config, contract, holidays) {
  const range=monthRange(anchorMonth);
  const row=await env.DB.prepare(`
    SELECT MAX(substr(r.data_postagem_iso,1,10)) AS ultima_data,
           COUNT(*) AS total,
           SUM(CASE WHEN TRIM(COALESCE(r.atendente_norm,''))='' THEN 1 ELSE 0 END) AS sem_atendente,
           SUM(CASE WHEN TRIM(COALESCE(cp.cliente_portal,''))='' THEN 1 ELSE 0 END) AS sem_cliente_portal,
           SUM(CASE WHEN TRIM(COALESCE(sc.tabela,''))='' THEN 1 ELSE 0 END) AS sem_tabela,
           SUM(CASE WHEN TRIM(COALESCE(r.cep_remetente,''))='' THEN 1 ELSE 0 END) AS sem_cep_remetente
    ${BASE_FROM_V6}
    WHERE r.data_postagem_iso>=? AND r.data_postagem_iso<=?
  `).bind(range.start+' 00:00:00',range.end+' 23:59:59').first();
  const total=num(row?.total),checks=[];
  if(!total)return{status:'vermelho',verificacoes:[{chave:'sem_dados',rotulo:'Base do mês',valor:'0 postagens',detalhe:'Sem dados na competência.',status:'vermelho',acao:'Verificar importação.'}]};
  const last=clean(row?.ultima_data),today=new Date().toISOString().slice(0,10),ref=anchorMonth===today.slice(0,7)?today:range.end,delay=last?businessDaysBetween(addDays(last,1),ref,holidays):99;
  checks.push(check('atraso_importacao','Última importação',last||'sem data',`${delay} dia(s) útil(eis) desde a última data`,delay<=1?'verde':delay===2?'amarelo':'vermelho','Rodar a importação do Atende/Portal Postal.'));
  checks.push(pctCheck('sem_atendente','Postagens sem atendente',num(row.sem_atendente),total,5,20,'Revisar origem do atendente e vínculo no Admin.'));
  checks.push(pctCheck('sem_cliente_portal','Postagens sem cliente portal',num(row.sem_cliente_portal),total,10,30,'Rodar rebuild do Cliente Portal.'));
  const semTabelaPct=total?num(row.sem_tabela)*100/total:0;
  checks.push(check('sem_tabela','Serviços sem tabela',fixed(semTabelaPct,1)+'%',num(row.sem_tabela)+' postagem(ns) sem classificação',semTabelaPct===0?'verde':semTabelaPct<=1?'amarelo':'vermelho','Classificar o serviço antes de confiar no degrau.'));
  const diffs=[];
  if(config.diasUteisRealizadosOverride!==null)diffs.push(Math.abs(num(config.diasUteisRealizadosOverride)-num(config.diasUteisRealizadosCalculado)));
  if(config.diasUteisMesOverride!==null)diffs.push(Math.abs(num(config.diasUteisMesOverride)-num(config.diasUteisMesCalculado)));
  const diff=diffs.length?Math.max(...diffs):0;
  const hasOverride=config.diasUteisRealizadosOverride!==null||config.diasUteisMesOverride!==null;
  checks.push(check('dias_uteis','Dias úteis',`${config.diasUteisRealizados} / ${config.diasUteisMes}`,hasOverride?`override x calculado: ${config.diasUteisRealizadosCalculado} / ${config.diasUteisMesCalculado}`:'automático',!hasOverride||diff===0?'verde':diff===1?'amarelo':'vermelho','Limpar override ou corrigir calendário.'));
  const contractOk=contract?.origemTabela==='d1'&&Array.isArray(contract.mensageria)&&contract.mensageria.length>0&&Array.isArray(contract.encomendas)&&contract.encomendas.length>0;
  checks.push(check('origem_tabela','Regra contratual',contractOk?'D1':'fallback',contractOk?'Tabela por vigência disponível para a competência.':'Tabela contratual/PPCC indisponível para a competência.',contractOk?'verde':'vermelho','Aplicar/revisar a migration 0015 antes de usar remuneração.'));
  checks.push(pctCheck('sem_cep_remetente','Postagens sem CEP remetente',num(row.sem_cep_remetente),total,10,40,'Completar CEP de origem para habilitar captação por bairro.'));
  return{status:worst(checks.map(x=>x.status)),verificacoes:checks};
}

async function buildDaily(state, anchorMonth, env, holidays) {
  const scoped=cloneState(state);
  if(!scoped.dataInicio&&!scoped.dataFim){const rr=monthRange(anchorMonth);scoped.dataInicio=rr.start;scoped.dataFim=rr.end;}
  const current=buildWhere(scoped);
  const q=await env.DB.prepare(`
    SELECT substr(r.data_postagem_iso,1,10) AS dia,
           COUNT(*) AS quantidade,
           COALESCE(SUM(r.valor_atendimento_num),0) AS valor,
           SUM(CASE WHEN ${IS_ENCOMENDA_SQL} THEN r.valor_atendimento_num ELSE 0 END) AS valor_encomenda,
           SUM(CASE WHEN ${IS_MENSAGERIA_SQL} THEN r.valor_atendimento_num ELSE 0 END) AS valor_mensageria
    ${BASE_FROM_V6}${current.whereSql}
    GROUP BY 1 ORDER BY 1 ASC
  `).bind(...current.args).all();
  const byDate=new Map((q.results||[]).filter(x=>clean(x.dia)).map(x=>[clean(x.dia),x]));
  const rangeStart=scoped.dataInicio||monthRange(anchorMonth).start;
  const rangeEnd=scoped.dataFim||monthRange(anchorMonth).end;
  const rows=[];
  for(let d=rangeStart;d<=rangeEnd;d=addDays(d,1)){
    const x=byDate.get(d)||{},dt=parseDate(d),dow=dt?dt.getUTCDay():0;
    rows.push({data:d,diaSemana:dow,semanaDoMes:dt?Math.ceil(dt.getUTCDate()/7):0,quantidade:num(x.quantidade),valor:round2(x.valor),valorEncomenda:round2(x.valor_encomenda),valorMensageria:round2(x.valor_mensageria),feriado:holidays.has(d),diaUtil:dow!==0&&dow!==6&&!holidays.has(d),teveMovimento:num(x.quantidade)>0});
  }
  const moved=rows.filter(x=>x.teveMovimento);
  const sorted=moved.slice().sort((a,b)=>b.valor-a.valor),total=moved.reduce((s,x)=>s+x.valor,0),top3=sorted.slice(0,3).reduce((s,x)=>s+x.valor,0);
  const byDow=[];for(let i=1;i<=5;i++){const r=rows.filter(x=>x.diaSemana===i&&x.diaUtil);byDow.push({diaSemana:i,rotulo:['','Seg','Ter','Qua','Qui','Sex'][i],valorMedio:r.length?round2(r.reduce((s,x)=>s+x.valor,0)/r.length):0,quantidadeMedia:r.length?round2(r.reduce((s,x)=>s+x.quantidade,0)/r.length):0});}
  return{dias:rows,maxValor:sorted[0]?.valor||0,porDiaSemana:byDow,picoDia:sorted[0]?.data||'',concentracaoTop3Dias:total?round2(top3*100/total):0,periodoDias:rows.length,diasComMovimento:moved.length};
}

// ---------------------------------------------------------------------------
// Atendentes e embalagem de balcao
// ---------------------------------------------------------------------------

async function buildAttendantAndPackaging(state, anchorMonth, env) {
  const scoped=cloneState(state);
  if(!scoped.dataInicio&&!scoped.dataFim){const rr=monthRange(anchorMonth);scoped.dataInicio=rr.start;scoped.dataFim=rr.end;}
  const current=buildWhere(scoped);
  const q=await env.DB.prepare(`
    SELECT ${ATENDENTE_EXIBIDO_SQL} AS atendente,
           COUNT(*) AS quantidade,
           COALESCE(SUM(r.valor_atendimento_num),0) AS valor,
           SUM(CASE WHEN ${IS_ENCOMENDA_BALCAO_SQL} THEN 1 ELSE 0 END) AS encomendas_balcao,
           SUM(CASE WHEN ${IS_EMBALAGEM_SQL} THEN 1 ELSE 0 END) AS embalagens
    ${BASE_FROM_V6}${appendCondition(current.whereSql,`${ATENDENTE_EXIBIDO_SQL} IS NOT NULL AND TRIM(${ATENDENTE_EXIBIDO_SQL})<>''`)}
    GROUP BY 1 ORDER BY valor DESC
  `).bind(...current.args).all();
  const rows=(q.results||[]).map(x=>{const qtd=num(x.quantidade),enc=num(x.encomendas_balcao),emb=num(x.embalagens);return{label:clean(x.atendente),quantidade:qtd,valor:round2(x.valor),ticketMedio:qtd?round2(num(x.valor)/qtd):0,encomendasBalcao:enc,embalagens:emb,taxaEmbalagem:enc?round2(emb*100/enc):0};}).filter(x=>x.label);
  const enc=rows.reduce((s,x)=>s+x.encomendasBalcao,0),emb=rows.reduce((s,x)=>s+x.embalagens,0),rate=enc?emb*100/enc:0;
  const add10=Math.max(0,Math.ceil(enc*.10-emb)),add20=Math.max(0,Math.ceil(enc*.20-emb));
  return{atendentesDesempenho:rows,oportunidadeEmbalagem:{encomendas:enc,encomendasBalcao:enc,embalagens:emb,taxaAtual:round2(rate),umaACada:emb?round2(enc/emb):0,meta10:{taxa:10,adicionais:add10,ganhoEstimado:round2(add10*3.78)},meta20:{taxa:20,adicionais:add20,ganhoEstimado:round2(add20*3.78)},retornoMedioUnitario:3.78,baseCalculo:'encomendas_balcao',flagEmbalagem:'atende_servico_classificacao.eh_embalagem'}};
}

// ---------------------------------------------------------------------------
// Captacao por CEP/bairro
// ---------------------------------------------------------------------------

async function buildCaptacao(state, anchorMonth, env) {
  const scoped=cloneState(state);
  if(!scoped.dataInicio&&!scoped.dataFim){const rr=monthRange(anchorMonth);scoped.dataInicio=rr.start;scoped.dataFim=rr.end;}
  const current=buildWhere(scoped);
  try{
    const originSql=`
      SELECT COALESCE(NULLIF(TRIM(cb.bairro),''),'(sem bairro)') AS bairro,
             COALESCE(NULLIF(TRIM(cb.localidade),''),'(sem cidade)') AS cidade,
             COUNT(DISTINCT r.nome_remetente_norm) AS remetentes,
             COUNT(*) AS postagens,
             COALESCE(SUM(r.valor_atendimento_num),0) AS valor
      ${BASE_FROM_V6}
      LEFT JOIN atende_cep_bairro cb ON cb.cep=REPLACE(REPLACE(COALESCE(r.cep_remetente,''),'-',''),' ','')
      ${appendCondition(current.whereSql,`TRIM(COALESCE(r.cep_remetente,''))<>''`)}
      GROUP BY 1,2 ORDER BY valor DESC LIMIT 40`;
    const destSql=`
      SELECT COALESCE(NULLIF(TRIM(cb.localidade),''),'(sem cidade)') AS cidade,
             COALESCE(NULLIF(TRIM(cb.uf),''),'') AS uf,
             COUNT(*) AS postagens,
             COALESCE(SUM(r.valor_atendimento_num),0) AS valor
      ${BASE_FROM_V6}
      LEFT JOIN atende_cep_bairro cb ON cb.cep=REPLACE(REPLACE(COALESCE(r.cep_destinatario,''),'-',''),' ','')
      ${appendCondition(current.whereSql,`TRIM(COALESCE(r.cep_destinatario,''))<>''`)}
      GROUP BY 1,2 ORDER BY valor DESC LIMIT 60`;
    const statsSql=`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN cbo.cep IS NOT NULL AND TRIM(COALESCE(cbo.bairro,''))<>'' THEN 1 ELSE 0 END) AS origem_resolvida,
             COALESCE(SUM(CASE WHEN TRIM(COALESCE(r.cep_remetente,''))<>'' THEN r.valor_atendimento_num ELSE 0 END),0) AS origem_valor_total,
             COALESCE(SUM(CASE WHEN TRIM(COALESCE(r.cep_destinatario,''))<>'' THEN r.valor_atendimento_num ELSE 0 END),0) AS destino_valor_total,
             COALESCE(SUM(CASE WHEN cbd.cep IS NOT NULL AND UPPER(TRIM(COALESCE(cbd.localidade,'')))='FORTALEZA' AND UPPER(TRIM(COALESCE(cbd.uf,'')))='CE' THEN r.valor_atendimento_num ELSE 0 END),0) AS destino_local_valor,
             COALESCE(SUM(CASE WHEN cbd.cep IS NOT NULL AND UPPER(TRIM(COALESCE(cbd.uf,'')))='CE' AND UPPER(TRIM(COALESCE(cbd.localidade,'')))<>'FORTALEZA' THEN r.valor_atendimento_num ELSE 0 END),0) AS destino_interior_ce_valor
      ${BASE_FROM_V6}
      LEFT JOIN atende_cep_bairro cbo ON cbo.cep=REPLACE(REPLACE(COALESCE(r.cep_remetente,''),'-',''),' ','')
      LEFT JOIN atende_cep_bairro cbd ON cbd.cep=REPLACE(REPLACE(COALESCE(r.cep_destinatario,''),'-',''),' ','')
      ${current.whereSql}`;
    const [o,d,statsResult]=await env.DB.batch([
      env.DB.prepare(originSql).bind(...current.args),
      env.DB.prepare(destSql).bind(...current.args),
      env.DB.prepare(statsSql).bind(...current.args)
    ]);
    const stats=statsResult?.results?.[0]||{},total=num(stats.total),originTotal=num(stats.origem_valor_total),destTotal=num(stats.destino_valor_total);
    const orows=(o?.results||[]).map(x=>({bairro:clean(x.bairro),cidade:clean(x.cidade),remetentes:num(x.remetentes),postagens:num(x.postagens),valor:round2(x.valor)}));
    const drows=(d?.results||[]).map(x=>({cidade:clean(x.cidade),uf:clean(x.uf),postagens:num(x.postagens),valor:round2(x.valor)}));
    orows.forEach(x=>x.share=originTotal?round2(x.valor*100/originTotal):0);
    drows.forEach(x=>{x.share=destTotal?round2(x.valor*100/destTotal):0;x.local=norm(x.cidade)==='FORTALEZA'&&norm(x.uf)==='CE';});
    return{
      cobertura:total?round2(num(stats.origem_resolvida)*100/total):0,
      origem:orows,destino:drows,
      shareLocal:destTotal?round2(num(stats.destino_local_valor)*100/destTotal):0,
      shareInteriorCE:destTotal?round2(num(stats.destino_interior_ce_valor)*100/destTotal):0,
      totalPostagens:total
    };
  }catch(_){return{cobertura:0,origem:[],destino:[],shareLocal:0,shareInteriorCE:0,indisponivel:true,motivo:'biblioteca_cep_bairro_vazia_ou_migration_ausente'};}
}

// ---------------------------------------------------------------------------
// Admin de classificacao de receita
// ---------------------------------------------------------------------------

async function getRevenueClients(url, env) {
  const competencia=clean(url.searchParams.get('competencia'));
  if(!/^\d{4}-\d{2}$/.test(competencia))return json({ok:false,error:'competencia_invalid'},400);
  const holidays=await loadHolidays(env,competencia+'-01',monthRange(competencia).end);
  const target=await loadTargetBundle(competencia,env,holidays);
  const a=await buildClientAnalytics(competencia,emptyState(),env,target.config);
  const total=a.items.reduce((s,x)=>s+x.valorAtual,0);
  const byClient=new Map();
  a.items.forEach(x=>{
    const old=byClient.get(x.clienteChave)||{clienteChave:x.clienteChave,cliente:x.cliente,faturamento:0,media3Meses:0,tipoReceita:x.tipoReceita,dataFimPrevista:x.dataFimPrevista,observacao:x.observacao,sinais:[],precisaRevisao:false};
    old.faturamento+=x.valorAtual;old.media3Meses+=x.media3Meses;if(x.precisaRevisao){old.precisaRevisao=true;old.sinais.push({grupo:x.grupo,motivos:x.motivos});}byClient.set(x.clienteChave,old);
  });
  const clientes=Array.from(byClient.values()).map(x=>({...x,faturamento:round2(x.faturamento),media3Meses:round2(x.media3Meses),participacaoTotal:total?round2(x.faturamento*100/total):0})).sort((a,b)=>b.faturamento-a.faturamento).slice(0,200);
  return json({ok:true,competencia,clientes});
}

async function saveRevenueClient(request, env) {
  const body=await readJson(request);if(!body)return json({ok:false,error:'invalid_json'},400);
  const key=clean(body.clienteChave),name=clean(body.clienteNome),type=clean(body.tipoReceita).toUpperCase(),end=clean(body.dataFimPrevista),obs=clean(body.observacao),user=clean(request.headers.get('X-AGF-Admin-User'))||'admin';
  if(!key||!name)return json({ok:false,error:'cliente_required'},400);
  if(type&&!['RECORRENTE','CAMPANHA','PONTUAL'].includes(type))return json({ok:false,error:'tipo_receita_invalid'},400);
  if(end&&!/^\d{4}-\d{2}-\d{2}$/.test(end))return json({ok:false,error:'data_fim_invalid'},400);
  const old=await env.DB.prepare(`SELECT * FROM atende_cliente_receita_classificacao WHERE cliente_chave=?`).bind(key).first();
  if(!type){await env.DB.prepare(`DELETE FROM atende_cliente_receita_classificacao WHERE cliente_chave=?`).bind(key).run();}
  else await env.DB.prepare(`
    INSERT INTO atende_cliente_receita_classificacao(cliente_chave,cliente_nome,tipo_receita,data_fim_prevista,observacao,ativo,atualizado_por,atualizado_em)
    VALUES(?,?,?,?,?,1,?,datetime('now'))
    ON CONFLICT(cliente_chave) DO UPDATE SET cliente_nome=excluded.cliente_nome,tipo_receita=excluded.tipo_receita,data_fim_prevista=excluded.data_fim_prevista,observacao=excluded.observacao,ativo=1,atualizado_por=excluded.atualizado_por,atualizado_em=datetime('now')
  `).bind(key,name,type,end||null,obs,user).run();
  await audit(env,'cliente_receita',key,'classificacao',old||{},body,user);
  return json({ok:true,clienteChave:key,tipoReceita:type});
}

// ---------------------------------------------------------------------------
// Helpers de filtro/data
// ---------------------------------------------------------------------------

function parseState(url){const facets={};for(const [key,spec] of Object.entries(FACETS))facets[key]=getMulti(url,spec.singular,key);facets.tiposObjeto=facets.tiposObjeto.map(v=>v.toUpperCase());return{dataInicio:clean(url.searchParams.get('dataInicio')),dataFim:clean(url.searchParams.get('dataFim')),q:clean(url.searchParams.get('q')),facets};}
function cloneState(state){return{dataInicio:state.dataInicio||'',dataFim:state.dataFim||'',q:state.q||'',facets:Object.fromEntries(Object.entries(state.facets||{}).map(([k,v])=>[k,(v||[]).slice()]))};}
function emptyState(){const facets={};for(const k of Object.keys(FACETS))facets[k]=[];return{dataInicio:'',dataFim:'',q:'',facets};}
function buildWhere(state){
  const where=[],args=[];
  if(state.dataInicio){where.push('r.data_postagem_iso >= ?');args.push(state.dataInicio+' 00:00:00');}
  if(state.dataFim){where.push('r.data_postagem_iso <= ?');args.push(state.dataFim+' 23:59:59');}
  if(state.q){const like=`%${state.q}%`;where.push(`(r.codigo_objeto LIKE ? OR r.atendimento LIKE ? OR r.nome_remetente LIKE ? OR c.nome_atual LIKE ? OR r.cep_destinatario LIKE ? OR r.cep_remetente LIKE ? OR r.numero_contrato LIKE ? OR co.nome LIKE ? OR co.cliente LIKE ? OR co.tipo LIKE ? OR r.cartao_postagem LIKE ? OR r.sistema_postagem LIKE ? OR r.cpf_matricula_atendente LIKE ? OR a.nome LIKE ? OR r.codigo_servico LIKE ? OR r.nome_servico LIKE ? OR cp.cliente_portal LIKE ?)`);args.push(...Array(17).fill(like));}
  for(const [key,spec] of Object.entries(FACETS)){if(key==='tiposObjeto')continue;addMultiFilter(where,args,spec.field,state.facets[key]);}
  addObjectFilter(where,args,state.facets.tiposObjeto);
  return{whereSql:where.length?` WHERE ${where.join(' AND ')}`:'',args};
}
function addObjectFilter(where,args,values){const tipos=unique((values||[]).map(v=>clean(v).toUpperCase()).filter(Boolean));if(!tipos.length)return;const clauses=[];for(const tipo of tipos){if(tipo==='SRO')clauses.push(`(NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR')`);else if(tipo==='PRODUTO ECT'||tipo==='SEM REGISTRO'){clauses.push(`(${OBJETO_VAZIO_SQL} AND sc.tipo_objeto=?)`);args.push(tipo);}}if(clauses.length)where.push(`(${clauses.join(' OR ')})`);}
function addMultiFilter(where,args,field,values){const list=unique((values||[]).map(clean).filter(Boolean));if(!list.length)return;where.push(`(${list.map(()=>`${field} = ? COLLATE NOCASE`).join(' OR ')})`);args.push(...list);}
function getMulti(url,singular,plural){const values=[...url.searchParams.getAll(singular),...url.searchParams.getAll(plural)];for(const packed of url.searchParams.getAll(plural))if(packed.includes('|'))values.push(...packed.split('|'));return unique(values.map(clean).filter(Boolean));}
function appendCondition(whereSql,condition){return whereSql?`${whereSql} AND ${condition}`:` WHERE ${condition}`;}
function unique(v){return Array.from(new Set(v));}

async function resolveAnchorMonth(state,env){if(/^\d{4}-\d{2}-\d{2}$/.test(state.dataFim))return state.dataFim.slice(0,7);if(/^\d{4}-\d{2}-\d{2}$/.test(state.dataInicio))return state.dataInicio.slice(0,7);const row=await env.DB.prepare(`SELECT MAX(substr(data_postagem_iso,1,7)) AS mes FROM atende_postagens_canonicas WHERE data_postagem_iso IS NOT NULL AND TRIM(data_postagem_iso)<>''`).first();const mes=clean(row?.mes);return /^\d{4}-\d{2}$/.test(mes)?mes:new Date().toISOString().slice(0,7);}
function monthRange(comp){const [y,m]=comp.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return{start:comp+'-01',end:comp+'-'+String(last).padStart(2,'0')}}
function monthAdd(comp,delta){const [y,m]=comp.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7);}
function parseDate(s){const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null;}
function addDays(s,n){const d=parseDate(s);if(!d)return s;d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
async function loadHolidays(env,start,end){const set=new Set();try{const q=await env.DB.prepare(`SELECT data FROM atende_calendario_feriados WHERE ativo=1 AND data>=? AND data<=?`).bind(start,end).all();(q.results||[]).forEach(x=>set.add(clean(x.data)));}catch(_){}return set;}
function isBusinessDay(s,holidays){const d=parseDate(s);if(!d)return false;const w=d.getUTCDay();return w!==0&&w!==6&&!holidays.has(s);}
function businessDaysBetween(start,end,holidays){if(!start||!end||start>end)return 0;let cur=start,n=0;while(cur<=end){if(isBusinessDay(cur,holidays))n++;cur=addDays(cur,1);}return n;}
function businessDaysInMonth(comp,holidays){const r=monthRange(comp);return businessDaysBetween(r.start,r.end,holidays);}
function calculatedDays(comp,last,holidays){const r=monthRange(comp),mes=businessDaysBetween(r.start,r.end,holidays),realizados=last&&last>=r.start?businessDaysBetween(r.start,last>r.end?r.end:last,holidays):0;return{mes,realizados};}
function addBusinessDays(start,count,holidays){let cur=start,left=Math.max(0,Math.ceil(count));while(left>0){cur=addDays(cur,1);if(isBusinessDay(cur,holidays))left--;}return cur;}

function check(chave,rotulo,valor,detalhe,status,acao){return{chave,rotulo,valor,detalhe,status,acao};}
function pctCheck(chave,rotulo,bad,total,yellow,red,acao){const p=total?bad*100/total:0;return check(chave,rotulo,fixed(p,1)+'%',bad+' de '+total,p<yellow?'verde':p<=red?'amarelo':'vermelho',acao);}
function worst(statuses){if(statuses.includes('vermelho'))return'vermelho';if(statuses.includes('amarelo'))return'amarelo';return'verde';}
function percentile(sorted,p){if(!sorted.length)return 0;const pos=(sorted.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?sorted[lo]:sorted[lo]+(pos-lo)*(sorted[hi]-sorted[lo]);}
function linearSlope(vals){const n=vals.length;if(n<2)return 0;const mx=(n-1)/2,my=vals.reduce((s,v)=>s+v,0)/n;let nume=0,den=0;vals.forEach((v,i)=>{nume+=(i-mx)*(v-my);den+=(i-mx)*(i-mx);});return den?nume/den:0;}
function splitAnalyticsKey(key){const pos=key.lastIndexOf('|');return pos<0?[key,'']:[key.slice(0,pos),key.slice(pos+1)];}

async function audit(env,entity,key,field,oldVal,newVal,user){try{await env.DB.prepare(`INSERT INTO atende_admin_historico(entidade,chave,campo,valor_anterior,valor_novo,usuario,criado_em) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(entity,key,field,JSON.stringify(oldVal||{}),JSON.stringify(newVal||{}),user).run();}catch(_){} }
async function readJson(request){try{return await request.json();}catch(_){return null;}}
function authorized(request,env){return !!env.ATENDE_API_TOKEN&&(request.headers.get('Authorization')||'')===`Bearer ${env.ATENDE_API_TOKEN}`;}
function nullableInt(v){if(v===null||v===undefined||String(v).trim()==='')return null;const x=Math.round(Number(v));return Number.isFinite(x)?x:null;}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function round2(v){return Math.round((num(v)+Number.EPSILON)*100)/100;}
function fixed(v,d=2){return num(v).toFixed(d).replace('.',',');}
function clean(v){return String(v==null?'':v).trim();}
function norm(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'}});}
