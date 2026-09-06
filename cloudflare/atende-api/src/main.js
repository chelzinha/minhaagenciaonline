import rawApp from './index.js';
import panelV2 from './panel-v2.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((url.pathname === '/atende' || url.pathname === '/filters') && request.method === 'GET') {
      if (!authorized(request, env)) return json({ ok:false, error:'unauthorized' }, 401);

      const ready = await rawReady(env);
      if (!ready) {
        return url.pathname === '/atende' ? legacyAtende(url, env) : legacyFilters(env);
      }

      return panelV2.fetch(request, env, ctx);
    }

    return rawApp.fetch(request, env, ctx);
  }
};

async function rawReady(env) {
  try {
    const [configResult, legacyResult, rawResult] = await env.DB.batch([
      env.DB.prepare(`SELECT valor FROM atende_runtime_config WHERE chave = 'panel_source'`),
      env.DB.prepare(`SELECT COUNT(*) AS total FROM atende_postagens`),
      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM atende_postagens_raw r
        JOIN atende_raw_importacoes ri
          ON ri.import_key = r.import_key
         AND ri.concluido_em IS NOT NULL
      `)
    ]);

    const source = String(configResult?.results?.[0]?.valor || 'legacy').toLowerCase();
    if (source !== 'raw') return false;

    const legacyTotal = Number(legacyResult?.results?.[0]?.total || 0);
    const rawTotal = Number(rawResult?.results?.[0]?.total || 0);

    return rawTotal > 0 && (legacyTotal === 0 || rawTotal >= legacyTotal);
  } catch (_) {
    return false;
  }
}

function authorized(request, env) {
  return !!env.ATENDE_API_TOKEN && (request.headers.get('Authorization') || '') === `Bearer ${env.ATENDE_API_TOKEN}`;
}

const SORT = Object.freeze({
  DATA:'data_postagem','CEP DESTINATARIO':'cep_destinatario','CEP REMETENTE':'cep_remetente',
  SRO:'codigo_objeto',SERVICO:'codigo_servico','NOME REMETENTE':'nome_remetente',
  'CARTAO POSTAGEM':'cartao_postagem',CONTRATO:'numero_contrato',SISTEMA:'sistema_postagem',
  VALOR:'valor_atendimento',ESTORNO:'estorno',ATENDENTE:'cpf_matricula_atendente',
  'MODALIDADE PAGAMENTO':'modalidade_pagamento','FORMA PAGAMENTO':'forma_pagamento'
});

async function legacyAtende(url, env) {
  const page=Math.max(1,Number(url.searchParams.get('page')||1));
  const pageSize=Math.min(200,Math.max(1,Number(url.searchParams.get('pageSize')||100)));
  const offset=(page-1)*pageSize;
  const dataInicio=clean(url.searchParams.get('dataInicio'));
  const dataFim=clean(url.searchParams.get('dataFim'));
  const q=clean(url.searchParams.get('q'));
  const servico=clean(url.searchParams.get('servico'));
  const contrato=clean(url.searchParams.get('contrato'));
  const sistema=clean(url.searchParams.get('sistema'));
  const estorno=clean(url.searchParams.get('estorno'));
  const atendente=clean(url.searchParams.get('atendente'));
  const modalidade=clean(url.searchParams.get('modalidadePagamento'));
  const forma=clean(url.searchParams.get('formaPagamento'));
  const sortKey=clean(url.searchParams.get('sortKey'))||'DATA';
  const sortField=SORT[sortKey]||SORT.DATA;
  const sortDir=String(url.searchParams.get('sortDir')||'desc').toLowerCase()==='asc'?'ASC':'DESC';
  const where=[],args=[];
  if(dataInicio){where.push('substr(data_postagem,1,10)>=?');args.push(dataInicio)}
  if(dataFim){where.push('substr(data_postagem,1,10)<=?');args.push(dataFim)}
  if(q){const like=`%${q}%`;where.push(`(codigo_objeto LIKE ? OR atendimento LIKE ? OR nome_remetente LIKE ? OR cep_destinatario LIKE ? OR cep_remetente LIKE ? OR numero_contrato LIKE ? OR cartao_postagem LIKE ? OR sistema_postagem LIKE ? OR cpf_matricula_atendente LIKE ?)`);args.push(...Array(9).fill(like))}
  exact(where,args,'codigo_servico',servico);exact(where,args,'numero_contrato',contrato);exact(where,args,'sistema_postagem',sistema);exact(where,args,'estorno',estorno);exact(where,args,'cpf_matricula_atendente',atendente);exact(where,args,'modalidade_pagamento',modalidade);exact(where,args,'forma_pagamento',forma);
  const ws=where.length?` WHERE ${where.join(' AND ')}`:'';
  const summary=await env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(valor_atendimento),0) AS total_value FROM atende_postagens${ws}`).bind(...args).first();
  const select=`data_postagem AS "DATA",cep_destinatario AS "CEP DESTINATARIO",cep_remetente AS "CEP REMETENTE",codigo_objeto AS "SRO",codigo_servico AS "SERVICO",nome_remetente AS "NOME REMETENTE",cartao_postagem AS "CARTAO POSTAGEM",numero_contrato AS "CONTRATO",sistema_postagem AS "SISTEMA",valor_atendimento AS "VALOR",estorno AS "ESTORNO",cpf_matricula_atendente AS "ATENDENTE",modalidade_pagamento AS "MODALIDADE PAGAMENTO",forma_pagamento AS "FORMA PAGAMENTO"`;
  const result=await env.DB.prepare(`SELECT ${select} FROM atende_postagens${ws} ORDER BY ${sortField} ${sortDir},source_key ASC LIMIT ? OFFSET ?`).bind(...args,pageSize,offset).all();
  const rows=(result.results||[]).map(r=>{r.DATA=formatDateBR(r.DATA);return r});
  const total=Number(summary?.total||0);
  return json({ok:true,rows,page,pageSize,total,totalValue:Number(summary?.total_value||0),pages:Math.max(1,Math.ceil(total/pageSize)),sortKey:SORT[sortKey]?sortKey:'DATA',sortDir:sortDir.toLowerCase()});
}

async function legacyFilters(env) {
  const specs=[['servicos','codigo_servico'],['contratos','numero_contrato'],['sistemas','sistema_postagem'],['estornos','estorno'],['atendentes','cpf_matricula_atendente'],['modalidadesPagamento','modalidade_pagamento'],['formasPagamento','forma_pagamento']];
  const results=await env.DB.batch(specs.map(([,f])=>env.DB.prepare(`SELECT DISTINCT ${f} AS value FROM atende_postagens WHERE ${f} IS NOT NULL AND TRIM(${f})<>'' ORDER BY ${f} COLLATE NOCASE ASC LIMIT 1000`)));
  const body={ok:true};specs.forEach(([k],i)=>body[k]=(results[i]?.results||[]).map(r=>clean(r.value)).filter(Boolean));return json(body);
}

function exact(where,args,field,value){if(!value)return;where.push(`${field}=? COLLATE NOCASE`);args.push(value)}
function clean(v){if(v===null||v===undefined)return'';const s=String(v).trim();return /^(null|undefined)$/i.test(s)?'':s}
function formatDateBR(v){const t=clean(v),m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:t}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
