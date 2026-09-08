import baseApp from './local-defaults-wrapper-v2.js';

// ============================================================
// ATENDE - CADASTRO PORTAL VINDO DO CONSOLIDADOR
//
// Mantem o RAW do Atende imutavel. O Consolidador tem RAW proprio e
// a ligacao com as postagens e recalculada em atende_cliente_portal.
//
// Nivel 1: SRO exato, pareado por ocorrencia -> ALTA
// Nivel 2: sem SRO, dia + caixa + servico + valor -> MEDIA
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!authorized(request, env) && url.pathname !== '/health') {
      return json({ ok:false, error:'unauthorized' }, 401);
    }

    if (request.method === 'GET' && url.pathname === '/imports/check') {
      return checkAnyImport(url, env);
    }

    if (request.method === 'POST' && url.pathname === '/ingest-consolidador') {
      let body;
      try { body = await request.json(); }
      catch (_) { return json({ ok:false, error:'invalid_json' }, 400); }
      return ingestConsolidador(body, env);
    }

    if (request.method === 'POST' && url.pathname === '/rebuild-cliente-portal') {
      const result = await rebuildClientePortal(env);
      return json({ ok:true, ...result });
    }

    if (request.method === 'GET' && url.pathname === '/portal/status') {
      return portalStatus(env);
    }

    if (request.method === 'POST' && url.pathname === '/ingest') {
      let body;
      try { body = await request.clone().json(); }
      catch (_) { return baseApp.fetch(request, env, ctx); }

      if (looksLikeConsolidador(body?.rows)) {
        return ingestConsolidador(body, env);
      }

      const response = await baseApp.fetch(request, env, ctx);
      if (body?.final === true && response.ok) {
        try {
          const result = await response.clone().json();
          if (result?.completed === true) await rebuildClientePortal(env);
        } catch (_) {}
      }
      return response;
    }

    const response = await baseApp.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/atende' && url.searchParams.get('view') !== 'dashboard' && response.ok) {
      return augmentPanelRows(response, env);
    }

    return response;
  }
};

async function checkAnyImport(url, env) {
  const fileId = clean(url.searchParams.get('fileId'));
  const hash = clean(url.searchParams.get('hash'));
  if (!fileId || !hash) return json({ ok:false, error:'fileId_and_hash_required' }, 400);
  const importKey = makeImportKey(fileId, hash);

  const [atende, consolidador] = await env.DB.batch([
    env.DB.prepare(`
      SELECT arquivo_nome,arquivo_hash,arquivo_id,total_linhas,recebidas,gravadas,concluido_em
      FROM atende_raw_importacoes WHERE import_key=?
    `).bind(importKey),
    env.DB.prepare(`
      SELECT arquivo_nome,arquivo_hash,arquivo_id,total_linhas,recebidas,gravadas,concluido_em
      FROM consolidador_importacoes WHERE import_key=?
    `).bind(importKey)
  ]);

  const a = atende?.results?.[0] || null;
  const c = consolidador?.results?.[0] || null;
  const row = c || a;
  return json({
    ok:true,
    found:!!row,
    completed:!!row?.concluido_em,
    import:row,
    source:c ? 'CONSOLIDADOR' : (a ? 'ATENDE' : '')
  });
}

function looksLikeConsolidador(rows) {
  const first = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!first || typeof first !== 'object') return false;
  const keys = Object.keys(first).map(k => clean(k).toUpperCase());
  const has = (...names) => names.some(n => keys.includes(n));
  return has('OBJETO') &&
    has('VENDA/PP.','VENDA/PP','VENDA_PP','VENDA PP') &&
    has('CX./AT.','CX./AT','CX/AT','CX_AT') &&
    has('CLIENTE','RAZAO_SOCIAL','RAZÃO_SOCIAL');
}

async function ingestConsolidador(body, env) {
  const fileId=clean(body?.fileId),fileName=clean(body?.fileName),fileHash=clean(body?.fileHash),fileModifiedAt=clean(body?.fileModifiedAt);
  const totalRows=Math.max(0,Number(body?.totalRows||0));
  const offset=Math.max(0,Number(body?.offset||0));
  const isFinal=body?.final===true;
  const rows=Array.isArray(body?.rows)?body.rows:[];

  if(!fileId||!fileName||!fileHash)return json({ok:false,error:'fileId_fileName_fileHash_required'},400);
  if(!rows.length)return json({ok:false,error:'rows_required'},400);
  if(rows.length>1000)return json({ok:false,error:'max_1000_rows_per_request'},413);

  const importKey=makeImportKey(fileId,fileHash);
  const previous=await env.DB.prepare(`SELECT concluido_em FROM consolidador_importacoes WHERE import_key=?`).bind(importKey).first();
  if(previous?.concluido_em)return json({ok:true,duplicateFile:true,completed:true,received:0,inserted:0,stored:totalRows});

  await env.DB.prepare(`
    INSERT INTO consolidador_importacoes(
      import_key,arquivo_id,arquivo_hash,arquivo_nome,arquivo_modificado_em,total_linhas,recebidas,gravadas,invalidas
    ) VALUES(?,?,?,?,?,?,0,0,0)
    ON CONFLICT(import_key) DO UPDATE SET
      arquivo_nome=excluded.arquivo_nome,
      arquivo_modificado_em=excluded.arquivo_modificado_em,
      total_linhas=excluded.total_linhas
  `).bind(importKey,fileId,fileHash,fileName,fileModifiedAt,totalRows).run();

  const statements=[];
  let invalid=0;
  rows.forEach((raw,index)=>{
    if(!raw||typeof raw!=='object'){invalid++;return;}
    const lineNumber=offset+index+1;
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO consolidador_raw(
        import_key,arquivo_id,arquivo_hash,arquivo_nome,numero_linha,
        venda_pp,objeto,ect,cliente,data,qtd,valor,ad,cx_at,contrato,cartao,destinatario,raw_json,
        venda_pp_norm,objeto_norm,ect_norm,cliente_norm,data_iso,qtd_num,valor_num,caixa
      ) VALUES(${Array(26).fill('?').join(',')})
    `).bind(...consolidadorValues(raw,{importKey,fileId,fileHash,fileName,lineNumber})));
  });

  let inserted=0;
  for(let i=0;i<statements.length;i+=100){
    const results=await env.DB.batch(statements.slice(i,i+100));
    for(const result of results)inserted+=Number(result?.meta?.changes||0);
  }

  const receivedThrough=offset+rows.length;
  const shouldComplete=isFinal&&receivedThrough>=totalRows;
  await env.DB.prepare(`
    UPDATE consolidador_importacoes
    SET recebidas=MAX(recebidas,?),
        gravadas=(SELECT COUNT(*) FROM consolidador_raw WHERE import_key=?),
        invalidas=invalidas+?,
        concluido_em=CASE WHEN ?=1 THEN datetime('now') ELSE concluido_em END
    WHERE import_key=?
  `).bind(receivedThrough,importKey,invalid,shouldComplete?1:0,importKey).run();

  let state=await env.DB.prepare(`
    SELECT total_linhas,recebidas,gravadas,invalidas,concluido_em
    FROM consolidador_importacoes WHERE import_key=?
  `).bind(importKey).first();

  if(shouldComplete&&Number(state?.gravadas||0)!==totalRows){
    await env.DB.prepare(`UPDATE consolidador_importacoes SET concluido_em=NULL WHERE import_key=?`).bind(importKey).run();
    return json({ok:false,error:'consolidador_line_count_mismatch',expected:totalRows,stored:Number(state?.gravadas||0)},409);
  }

  let bridge=null;
  if(shouldComplete&&state?.concluido_em)bridge=await rebuildClientePortal(env);

  return json({
    ok:true,duplicateFile:false,received:rows.length,inserted,invalid,receivedThrough,
    stored:Number(state?.gravadas||0),completed:!!state?.concluido_em,bridge
  });
}

function consolidadorValues(raw,meta){
  const venda=rawValue(pick(raw,['VENDA/PP.','VENDA/PP','VENDA_PP','VENDA PP']));
  const objeto=rawValue(pick(raw,['OBJETO']));
  const ect=rawValue(pick(raw,['ECT']));
  const cliente=rawValue(pick(raw,['CLIENTE','RAZAO_SOCIAL','RAZÃO_SOCIAL']));
  const data=rawValue(pick(raw,['DATA']));
  const qtd=rawValue(pick(raw,['QTD']));
  const valor=rawValue(pick(raw,['VALOR']));
  const ad=rawValue(pick(raw,['AD.','AD','AD_CODIGO']));
  const cxAt=rawValue(pick(raw,['CX./AT.','CX./AT','CX/AT','CX_AT']));
  const contrato=rawValue(pick(raw,['CONTRATO','NUMERO_CONTRATO']));
  const cartao=rawValue(pick(raw,['CARTÃO','CARTAO','CARTAO_POSTAGEM']));
  const destinatario=rawValue(pick(raw,['DESTINATARIO','DESTINATÁRIO']));
  return [
    meta.importKey,meta.fileId,meta.fileHash,meta.fileName,meta.lineNumber,
    venda,objeto,ect,cliente,data,qtd,valor,ad,cxAt,contrato,cartao,destinatario,JSON.stringify(raw),
    normCode(venda),normCode(objeto),normServiceCode(ect),normText(cliente),normalizeDate(data),numBR(qtd),numBR(valor),caixaFromCxAt(cxAt)
  ];
}

async function rebuildClientePortal(env){
  await env.DB.prepare(`DELETE FROM atende_cliente_portal`).run();

  await env.DB.prepare(SRO_REBUILD_SQL).run();
  await env.DB.prepare(ATENDIMENTO_REBUILD_SQL).run();

  const counts=await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN origem_cliente='SRO' THEN 1 ELSE 0 END) AS sro,
      SUM(CASE WHEN origem_cliente='ATENDIMENTO' THEN 1 ELSE 0 END) AS atendimento
    FROM atende_cliente_portal
  `).first();
  const totalAtende=await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM atende_postagens_raw r
    JOIN atende_raw_importacoes ri ON ri.import_key=r.import_key AND ri.concluido_em IS NOT NULL
  `).first();
  const total=Number(counts?.total||0),atende=Number(totalAtende?.n||0);
  return {
    total,
    sro:Number(counts?.sro||0),
    atendimento:Number(counts?.atendimento||0),
    semCliente:Math.max(0,atende-total),
    cobertura:atende?Number((total*100/atende).toFixed(2)):0
  };
}

const SRO_REBUILD_SQL=`
WITH cons_base AS (
  SELECT * FROM (
    SELECT cr.*,
           ROW_NUMBER() OVER (
             PARTITION BY CASE
               WHEN TRIM(COALESCE(cr.venda_pp_norm,''))<>'' THEN cr.venda_pp_norm
               ELSE cr.import_key||':'||cr.id
             END
             ORDER BY cr.id DESC
           ) AS dup_rn
    FROM consolidador_raw cr
    JOIN consolidador_importacoes ci ON ci.import_key=cr.import_key AND ci.concluido_em IS NOT NULL
    WHERE TRIM(COALESCE(cr.cliente,''))<>''
  ) WHERE dup_rn=1
),
cons_sro AS (
  SELECT cb.*,
         ROW_NUMBER() OVER (PARTITION BY cb.objeto_norm ORDER BY cb.data_iso,cb.id) AS ocorr
  FROM cons_base cb
  WHERE UPPER(TRIM(COALESCE(cb.objeto_norm,''))) LIKE '%BR'
),
at_sro AS (
  SELECT r.*,
         ROW_NUMBER() OVER (PARTITION BY r.codigo_objeto_norm ORDER BY r.data_postagem_iso,r.id) AS ocorr
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri ON ri.import_key=r.import_key AND ri.concluido_em IS NOT NULL
  WHERE UPPER(TRIM(COALESCE(r.codigo_objeto_norm,''))) LIKE '%BR'
)
INSERT INTO atende_cliente_portal(
  raw_id,source_key,cliente_portal,cliente_portal_norm,origem_cliente,confianca,cx_at,atualizado_em
)
SELECT a.id,'OBJ:'||a.codigo_objeto_norm,c.cliente,c.cliente_norm,'SRO','ALTA',c.cx_at,datetime('now')
FROM at_sro a
JOIN cons_sro c ON c.objeto_norm=a.codigo_objeto_norm AND c.ocorr=a.ocorr
WHERE TRIM(COALESCE(c.cliente,''))<>''
`;

const ATENDIMENTO_REBUILD_SQL=`
WITH cons_base AS (
  SELECT * FROM (
    SELECT cr.*,
           ROW_NUMBER() OVER (
             PARTITION BY CASE
               WHEN TRIM(COALESCE(cr.venda_pp_norm,''))<>'' THEN cr.venda_pp_norm
               ELSE cr.import_key||':'||cr.id
             END
             ORDER BY cr.id DESC
           ) AS dup_rn
    FROM consolidador_raw cr
    JOIN consolidador_importacoes ci ON ci.import_key=cr.import_key AND ci.concluido_em IS NOT NULL
    WHERE TRIM(COALESCE(cr.cliente,''))<>''
  ) WHERE dup_rn=1
),
cons_sro AS (
  SELECT cb.*,
         ROW_NUMBER() OVER (PARTITION BY cb.objeto_norm ORDER BY cb.data_iso,cb.id) AS ocorr
  FROM cons_base cb
  WHERE UPPER(TRIM(COALESCE(cb.objeto_norm,''))) LIKE '%BR'
),
at_sro AS (
  SELECT r.*,
         ROW_NUMBER() OVER (PARTITION BY r.codigo_objeto_norm ORDER BY r.data_postagem_iso,r.id) AS ocorr
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri ON ri.import_key=r.import_key AND ri.concluido_em IS NOT NULL
  WHERE UPPER(TRIM(COALESCE(r.codigo_objeto_norm,''))) LIKE '%BR'
),
paired_sro AS (
  SELECT a.atendente_norm,c.caixa
  FROM at_sro a
  JOIN cons_sro c ON c.objeto_norm=a.codigo_objeto_norm AND c.ocorr=a.ocorr
  WHERE TRIM(COALESCE(a.atendente_norm,''))<>'' AND TRIM(COALESCE(c.caixa,''))<>''
),
box_votes AS (
  SELECT atendente_norm,caixa,COUNT(*) AS votos
  FROM paired_sro
  GROUP BY atendente_norm,caixa
),
box_ranked AS (
  SELECT *,DENSE_RANK() OVER (PARTITION BY atendente_norm ORDER BY votos DESC) AS rk
  FROM box_votes
),
att_box AS (
  SELECT atendente_norm,MAX(caixa) AS caixa
  FROM box_ranked
  WHERE rk=1
  GROUP BY atendente_norm
  HAVING COUNT(*)=1
),
cons_groups0 AS (
  SELECT cb.data_iso,cb.cx_at,cb.caixa,cb.ect_norm,
         ROUND(ABS(SUM(COALESCE(cb.valor_num,0))),2) AS valor_abs,
         MAX(cb.cliente) AS cliente,
         MAX(cb.cliente_norm) AS cliente_norm,
         COUNT(DISTINCT cb.cliente_norm) AS clientes
  FROM cons_base cb
  WHERE UPPER(TRIM(COALESCE(cb.objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(cb.data_iso,''))<>''
    AND TRIM(COALESCE(cb.caixa,''))<>''
    AND TRIM(COALESCE(cb.ect_norm,''))<>''
    AND TRIM(COALESCE(cb.cliente_norm,''))<>''
  GROUP BY cb.data_iso,cb.cx_at,cb.caixa,cb.ect_norm
  HAVING COUNT(DISTINCT cb.cliente_norm)=1
),
cons_groups AS (
  SELECT cg.*,
         ROW_NUMBER() OVER (
           PARTITION BY cg.data_iso,cg.caixa,cg.ect_norm,cg.valor_abs
           ORDER BY cg.cx_at
         ) AS ocorr
  FROM cons_groups0 cg
),
at_groups0 AS (
  SELECT r.id,r.atendimento,r.atendente_norm,ab.caixa,
         substr(r.data_postagem_iso,1,10) AS data_iso,
         r.codigo_servico_norm AS ect_norm,
         ROUND(ABS(COALESCE(r.valor_atendimento_num,0)),2) AS valor_abs
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri ON ri.import_key=r.import_key AND ri.concluido_em IS NOT NULL
  JOIN att_box ab ON ab.atendente_norm=r.atendente_norm
  WHERE UPPER(TRIM(COALESCE(r.codigo_objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(r.atendimento,''))<>''
    AND TRIM(COALESCE(r.codigo_servico_norm,''))<>''
    AND TRIM(COALESCE(r.data_postagem_iso,''))<>''
),
at_groups AS (
  SELECT ag.*,
         ROW_NUMBER() OVER (
           PARTITION BY ag.data_iso,ag.caixa,ag.ect_norm,ag.valor_abs
           ORDER BY ag.id
         ) AS ocorr
  FROM at_groups0 ag
)
INSERT INTO atende_cliente_portal(
  raw_id,source_key,cliente_portal,cliente_portal_norm,origem_cliente,confianca,cx_at,atualizado_em
)
SELECT a.id,'ATD:'||a.atendimento,c.cliente,c.cliente_norm,'ATENDIMENTO','MEDIA',c.cx_at,datetime('now')
FROM at_groups a
JOIN cons_groups c
  ON c.data_iso=a.data_iso
 AND c.caixa=a.caixa
 AND c.ect_norm=a.ect_norm
 AND ABS(c.valor_abs-a.valor_abs)<0.011
 AND c.ocorr=a.ocorr
WHERE NOT EXISTS(SELECT 1 FROM atende_cliente_portal p WHERE p.raw_id=a.id)
`;

async function augmentPanelRows(response,env){
  let body;
  try{body=await response.json();}
  catch(_){return response;}
  if(!body||body.ok===false||!Array.isArray(body.rows))return json(body||{ok:false,error:'invalid_panel_response'},response.status);

  const ids=body.rows.map(r=>Number(r?._RAW_ID||0)).filter(n=>n>0);
  const byId=new Map();
  for(let i=0;i<ids.length;i+=80){
    const chunk=ids.slice(i,i+80);
    const q=await env.DB.prepare(`
      SELECT raw_id,cliente_portal,origem_cliente,confianca,cx_at
      FROM atende_cliente_portal
      WHERE raw_id IN (${chunk.map(()=>'?').join(',')})
    `).bind(...chunk).all();
    (q.results||[]).forEach(r=>byId.set(Number(r.raw_id),r));
  }

  body.rows=body.rows.map(row=>{
    const p=byId.get(Number(row?._RAW_ID||0))||{};
    return {
      ...row,
      'CADASTRO PORTAL':p.cliente_portal||'',
      'ORIGEM PORTAL':p.origem_cliente||'',
      _CONFIANCA_PORTAL:p.confianca||'',
      _CX_AT_PORTAL:p.cx_at||''
    };
  });
  return json(body,response.status);
}

async function portalStatus(env){
  const [imports,raw,bridge]=await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN concluido_em IS NOT NULL THEN 1 ELSE 0 END) AS completos FROM consolidador_importacoes`),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM consolidador_raw`),
    env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN origem_cliente='SRO' THEN 1 ELSE 0 END) AS sro,SUM(CASE WHEN origem_cliente='ATENDIMENTO' THEN 1 ELSE 0 END) AS atendimento FROM atende_cliente_portal`)
  ]);
  return json({ok:true,
    importacoes:Number(imports?.results?.[0]?.total||0),
    importacoesCompletas:Number(imports?.results?.[0]?.completos||0),
    consolidadorRaw:Number(raw?.results?.[0]?.total||0),
    vinculados:Number(bridge?.results?.[0]?.total||0),
    porSro:Number(bridge?.results?.[0]?.sro||0),
    porAtendimento:Number(bridge?.results?.[0]?.atendimento||0)
  });
}

function pick(raw,names){
  for(const name of names){if(Object.prototype.hasOwnProperty.call(raw,name))return raw[name];}
  return'';
}
function makeImportKey(fileId,hash){return `${fileId}:${hash}`;}
function rawValue(v){return v===null||v===undefined?'':String(v);}
function clean(v){if(v===null||v===undefined)return'';const s=String(v).trim();return /^(null|undefined)$/i.test(s)?'':s;}
function normCode(v){return clean(v).toUpperCase();}
function normText(v){return clean(v).toUpperCase().replace(/\s+/g,' ');}
function normServiceCode(v){const s=normCode(v);return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):s;}
function caixaFromCxAt(v){const s=clean(v);return s.includes('/')?clean(s.split('/')[0]):s;}
function normalizeDate(v){
  const s=clean(v);let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return`${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(m)return`${m[3]}-${m[2]}-${m[1]}`;
  return s;
}
function numBR(v){
  let s=clean(v);if(!s)return 0;s=s.replace(/\s/g,'').replace(/^R\$/i,'');
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  const n=Number(s);return Number.isFinite(n)?n:0;
}
function authorized(request,env){return !!env.ATENDE_API_TOKEN&&(request.headers.get('Authorization')||'')===`Bearer ${env.ATENDE_API_TOKEN}`;}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
