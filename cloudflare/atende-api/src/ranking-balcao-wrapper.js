import baseApp from './balcao-weekly-wrapper.js';

// ============================================================
// ATENDE - RANKING COMERCIAL DO BALCAO
//
// Regra de atribuicao:
// 1. LOCAL precisa ser BALCAO pela mesma hierarquia canonica do V6.
// 2. Se o ATENDENTE exibido for ELEN, a receita pertence a ELEN.
// 3. Todo o restante e atribuido a ALESSON ou LEVY conforme a escala
//    semanal historica salva no Admin.
// 4. Receita sem escala correspondente nunca e atribuida silenciosamente.
// ============================================================

const OBJETO_VAZIO_SQL = `(r.codigo_objeto IS NULL OR TRIM(r.codigo_objeto) = '' OR LOWER(TRIM(r.codigo_objeto)) = 'null')`;
const CONTRATO_TIPO_SQL = `COALESCE(NULLIF(TRIM(co.tipo), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const CONTRATO_CANAL_SQL = `COALESCE(NULLIF(TRIM(co.nome), ''), CASE WHEN COALESCE(cc.ocorrencias, 0) BETWEEN 1 AND 3 THEN 'CONTRATO ECT' ELSE '' END)`;
const ATENDENTE_EXIBIDO_SQL = `COALESCE(NULLIF(TRIM(a.nome), ''), r.atendente_norm)`;
const CLIENTE_PORTAL_SQL = `COALESCE(cp.cliente_portal, '')`;
const LOCAL_EXIBIDO_SQL = `COALESCE(pcl.local_codigo, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')`;

const BASE_FROM = `
  FROM atende_postagens_canonicas r
  LEFT JOIN atende_cliente_aliases ca
    ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c
    ON c.id = ca.cliente_id
   AND c.ativo = 1
  LEFT JOIN atende_atendentes a
    ON a.codigo = r.atendente_norm
   AND a.ativo = 1
  LEFT JOIN atende_atendente_local atl
    ON atl.codigo = r.atendente_norm
  LEFT JOIN atende_contratos co
    ON co.numero = r.numero_contrato_norm
   AND co.ativo = 1
  LEFT JOIN atende_contrato_counts cc
    ON cc.numero = r.numero_contrato_norm
  LEFT JOIN atende_servico_classificacao sc
    ON sc.codigo_servico = r.codigo_servico_norm
  LEFT JOIN atende_postagem_overrides po
    ON po.raw_id = r.id
  LEFT JOIN atende_cliente_portal cp
    ON cp.raw_id = r.id
  LEFT JOIN atende_cliente_portal_local pcl
    ON pcl.cliente_portal_norm = cp.cliente_portal_norm
   AND pcl.ativo = 1
`;

const FACETS = Object.freeze({
  tiposObjeto: {
    singular:'tipoObjeto',
    field:null
  },
  servicos: {
    singular:'servico',
    field:'r.nome_servico'
  },
  servicoTipos: {
    singular:'servicoTipo',
    field:"COALESCE(sc.tipo_servico,'')"
  },
  servicoSubgrupos: {
    singular:'servicoSubgrupo',
    field:"COALESCE(sc.subgrupo,'')"
  },
  servicoTabelas: {
    singular:'servicoTabela',
    field:"COALESCE(sc.tabela,'')"
  },
  clientesPortal: {
    singular:'clientePortal',
    field:CLIENTE_PORTAL_SQL
  },
  contratoClientes: {
    singular:'contratoCliente',
    field:"COALESCE(co.cliente,'')"
  },
  contratoTipos: {
    singular:'contratoTipo',
    field:CONTRATO_TIPO_SQL
  },
  intermediadores: {
    singular:'intermediador',
    field:CONTRATO_CANAL_SQL
  },
  sistemas: {
    singular:'sistema',
    field:'r.sistema_postagem'
  },
  estornos: {
    singular:'estorno',
    field:'r.estorno'
  },
  atendentes: {
    singular:'atendente',
    field:ATENDENTE_EXIBIDO_SQL
  },
  modalidadesPagamento: {
    singular:'modalidadePagamento',
    field:'r.modalidade_pagamento'
  },
  formasPagamento: {
    singular:'formaPagamento',
    field:'r.forma_pagamento'
  },
  locais: {
    singular:'local',
    field:LOCAL_EXIBIDO_SQL
  }
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isDashboard =
      request.method === 'GET' &&
      url.pathname === '/atende' &&
      url.searchParams.get('view') === 'dashboard';

    if (!isDashboard) {
      return baseApp.fetch(request, env, ctx);
    }

    const response = await baseApp.fetch(request, env, ctx);

    if (!response.ok) {
      return response;
    }

    let body;

    try {
      body = await response.json();
    } catch (_) {
      return response;
    }

    try {
      body.rankingBalcao = await buildRankingBalcao(url, env);
    } catch (err) {
      body.rankingBalcao = {
        disponivel:false,
        erro:
          err && err.message
            ? String(err.message)
            : String(err || 'ranking_balcao_error'),
        linhas:[]
      };
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Type','application/json; charset=utf-8');

    return new Response(
      JSON.stringify(body),
      {
        status:response.status,
        headers
      }
    );
  }
};

async function buildRankingBalcao(url, env) {
  const state = parseState(url);

  // O campo ATENDENTE operacional nao representa ALESSON/LEVY no ranking,
  // pois o login do balcao pode ser compartilhado. Para evitar uma leitura
  // falsa, o ranking fica suspenso quando esse filtro esta ativo.
  if ((state.facets.atendentes || []).length) {
    return {
      disponivel:false,
      suspensoPorFiltroAtendente:true,
      motivo:'filtro_atendente_ativo',
      linhas:[]
    };
  }

  const range = await resolveRange(state, env);
  const scoped = cloneState(state);
  scoped.dataInicio = range.start;
  scoped.dataFim = range.end;

  const where = buildWhere(scoped);
  const condition = appendCondition(
    where.whereSql,
    `UPPER(TRIM(${LOCAL_EXIBIDO_SQL})) IN ('BALCAO','BALCÃO','BALCAO AGF','BALCÃO AGF')`
  );

  const [dailyResult, scheduleResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT
        substr(r.data_postagem_iso,1,10) AS dia,
        ${ATENDENTE_EXIBIDO_SQL} AS atendente,
        COUNT(*) AS quantidade,
        COALESCE(SUM(r.valor_atendimento_num),0) AS valor
      ${BASE_FROM}
      ${condition}
      GROUP BY 1,2
      ORDER BY 1 ASC,2 ASC
    `).bind(...where.args),

    env.DB.prepare(`
      SELECT
        competencia,
        semana_inicio,
        semana_fim,
        responsavel
      FROM atende_balcao_responsavel_semanal
      WHERE semana_fim>=?
        AND semana_inicio<=?
      ORDER BY semana_inicio ASC
    `).bind(range.start, range.end)
  ]);

  const daily = dailyResult?.results || [];
  const schedule = (scheduleResult?.results || [])
    .map(x => ({
      competencia:clean(x.competencia),
      inicio:clean(x.semana_inicio),
      fim:clean(x.semana_fim),
      responsavel:norm(x.responsavel)
    }))
    .filter(x =>
      x.inicio &&
      x.fim &&
      (x.responsavel === 'ALESSON' || x.responsavel === 'LEVY')
    );

  const totals = {
    ELEN:{valor:0,quantidade:0},
    ALESSON:{valor:0,quantidade:0},
    LEVY:{valor:0,quantidade:0},
    NAO_ATRIBUIDO:{valor:0,quantidade:0}
  };

  let totalBalcao = 0;
  let quantidadeBalcao = 0;
  const missingDates = new Set();

  daily.forEach(row => {
    const day = clean(row.dia);
    const attendant = norm(row.atendente);
    const value = num(row.valor);
    const quantity = num(row.quantidade);

    totalBalcao += value;
    quantidadeBalcao += quantity;

    let owner = '';

    if (attendant === 'ELEN') {
      owner = 'ELEN';
    } else {
      const week = schedule.find(x => day >= x.inicio && day <= x.fim);
      owner = week ? week.responsavel : 'NAO_ATRIBUIDO';
    }

    if (!totals[owner]) {
      owner = 'NAO_ATRIBUIDO';
    }

    totals[owner].valor += value;
    totals[owner].quantidade += quantity;

    if (owner === 'NAO_ATRIBUIDO' && day) {
      missingDates.add(day);
    }
  });

  const naoAtribuido = totals.NAO_ATRIBUIDO.valor;
  const atribuido =
    totals.ELEN.valor +
    totals.ALESSON.valor +
    totals.LEVY.valor;

  const linhas = ['ELEN','ALESSON','LEVY']
    .map(nome => ({
      nome,
      realizado:round2(totals[nome].valor),
      quantidade:Math.round(totals[nome].quantidade),
      percentualDoBalcao:
        totalBalcao
          ? round2(totals[nome].valor * 100 / totalBalcao)
          : 0
    }))
    .sort((a,b) =>
      b.realizado - a.realizado ||
      a.nome.localeCompare(b.nome)
    )
    .map((x,index) => ({
      ...x,
      posicao:index + 1
    }));

  return {
    disponivel:totalBalcao > 0,
    periodo:{
      inicio:range.start,
      fim:range.end
    },
    totalBalcao:round2(totalBalcao),
    quantidadeBalcao:Math.round(quantidadeBalcao),
    totalAtribuido:round2(atribuido),
    naoAtribuido:round2(naoAtribuido),
    percentualAtribuido:
      totalBalcao
        ? round2(atribuido * 100 / totalBalcao)
        : 0,
    escalaCompleta:
      totalBalcao === 0 ||
      Math.abs(naoAtribuido) < 0.005,
    datasSemEscala:Array.from(missingDates).sort(),
    linhas,
    regra:{
      elen:'ATENDENTE = ELEN',
      demais:'Responsável semanal do Balcão'
    }
  };
}

function parseState(url) {
  const facets = {};

  for (const [key,spec] of Object.entries(FACETS)) {
    facets[key] = getMulti(url, spec.singular, key);
  }

  facets.tiposObjeto = (facets.tiposObjeto || [])
    .map(v => clean(v).toUpperCase());

  return {
    dataInicio:clean(url.searchParams.get('dataInicio')),
    dataFim:clean(url.searchParams.get('dataFim')),
    q:clean(url.searchParams.get('q')),
    facets
  };
}

function cloneState(state) {
  return {
    dataInicio:state.dataInicio || '',
    dataFim:state.dataFim || '',
    q:state.q || '',
    facets:Object.fromEntries(
      Object.entries(state.facets || {})
        .map(([key,value]) => [key,(value || []).slice()])
    )
  };
}

function buildWhere(state) {
  const where = [];
  const args = [];

  if (state.dataInicio) {
    where.push('r.data_postagem_iso >= ?');
    args.push(state.dataInicio + ' 00:00:00');
  }

  if (state.dataFim) {
    where.push('r.data_postagem_iso <= ?');
    args.push(state.dataFim + ' 23:59:59');
  }

  if (state.q) {
    const like = `%${state.q}%`;

    where.push(`(
      r.codigo_objeto LIKE ? OR
      r.atendimento LIKE ? OR
      r.nome_remetente LIKE ? OR
      c.nome_atual LIKE ? OR
      r.cep_destinatario LIKE ? OR
      r.cep_remetente LIKE ? OR
      r.numero_contrato LIKE ? OR
      co.nome LIKE ? OR
      co.cliente LIKE ? OR
      co.tipo LIKE ? OR
      r.cartao_postagem LIKE ? OR
      r.sistema_postagem LIKE ? OR
      r.cpf_matricula_atendente LIKE ? OR
      a.nome LIKE ? OR
      r.codigo_servico LIKE ? OR
      r.nome_servico LIKE ? OR
      cp.cliente_portal LIKE ?
    )`);

    args.push(...Array(17).fill(like));
  }

  for (const [key,spec] of Object.entries(FACETS)) {
    if (key === 'tiposObjeto' || key === 'atendentes') continue;
    addMultiFilter(where,args,spec.field,state.facets[key]);
  }

  addObjectFilter(where,args,state.facets.tiposObjeto);

  return {
    whereSql:
      where.length
        ? ` WHERE ${where.join(' AND ')}`
        : '',
    args
  };
}

function addObjectFilter(where,args,values) {
  const tipos = unique(
    (values || [])
      .map(v => clean(v).toUpperCase())
      .filter(Boolean)
  );

  if (!tipos.length) return;

  const clauses = [];

  for (const tipo of tipos) {
    if (tipo === 'SRO') {
      clauses.push(
        `(NOT ${OBJETO_VAZIO_SQL} AND UPPER(TRIM(r.codigo_objeto)) LIKE '%BR')`
      );
    } else if (tipo === 'PRODUTO ECT' || tipo === 'SEM REGISTRO') {
      clauses.push(`(${OBJETO_VAZIO_SQL} AND sc.tipo_objeto=?)`);
      args.push(tipo);
    }
  }

  if (clauses.length) {
    where.push(`(${clauses.join(' OR ')})`);
  }
}

function addMultiFilter(where,args,field,values) {
  const list = unique(
    (values || [])
      .map(clean)
      .filter(Boolean)
  );

  if (!field || !list.length) return;

  where.push(
    `(${list.map(() => `${field} = ? COLLATE NOCASE`).join(' OR ')})`
  );
  args.push(...list);
}

function getMulti(url,singular,plural) {
  const values = [
    ...url.searchParams.getAll(singular),
    ...url.searchParams.getAll(plural)
  ];

  for (const packed of url.searchParams.getAll(plural)) {
    if (packed.includes('|')) {
      values.push(...packed.split('|'));
    }
  }

  return unique(values.map(clean).filter(Boolean));
}

function appendCondition(whereSql,condition) {
  return whereSql
    ? `${whereSql} AND ${condition}`
    : ` WHERE ${condition}`;
}

async function resolveRange(state,env) {
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(state.dataInicio);
  const validEnd = /^\d{4}-\d{2}-\d{2}$/.test(state.dataFim);

  if (validStart && validEnd) {
    return {
      start:state.dataInicio,
      end:state.dataFim
    };
  }

  let anchor = '';

  if (validEnd) {
    anchor = state.dataFim.slice(0,7);
  } else if (validStart) {
    anchor = state.dataInicio.slice(0,7);
  } else {
    const row = await env.DB.prepare(`
      SELECT MAX(substr(data_postagem_iso,1,10)) AS ultima_data
      FROM atende_postagens_canonicas
      WHERE data_postagem_iso IS NOT NULL
        AND TRIM(data_postagem_iso)<>''
    `).first();

    const latest = clean(row?.ultima_data);
    anchor = /^\d{4}-\d{2}-\d{2}$/.test(latest)
      ? latest.slice(0,7)
      : new Date().toISOString().slice(0,7);
  }

  const month = monthRange(anchor);

  return {
    start:validStart ? state.dataInicio : month.start,
    end:validEnd ? state.dataFim : month.end
  };
}

function monthRange(comp) {
  const [year,month] = comp.split('-').map(Number);
  const last = new Date(Date.UTC(year,month,0)).getUTCDate();

  return {
    start:comp + '-01',
    end:comp + '-' + String(last).padStart(2,'0')
  };
}

function unique(values) {
  return Array.from(new Set(values));
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toUpperCase()
    .replace(/\s+/g,' ')
    .trim();
}
