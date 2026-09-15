import baseApp from './raw-csv-upload-wrapper.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      url.pathname === '/admin/dashboard-balcao-weekly' &&
      request.method === 'GET'
    ) {
      if (!authorized(request, env)) {
        return json({ok:false,error:'unauthorized'},401);
      }

      return getWeekly(url, env);
    }

    if (
      url.pathname === '/admin/dashboard-balcao-weekly' &&
      request.method === 'POST'
    ) {
      if (!authorized(request, env)) {
        return json({ok:false,error:'unauthorized'},401);
      }

      return saveWeekly(request, env);
    }

    return baseApp.fetch(request, env, ctx);
  }
};

async function getWeekly(url, env) {
  const competencia = clean(
    url.searchParams.get('competencia')
  );

  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return json(
      {ok:false,error:'competencia_invalid'},
      400
    );
  }

  const holidays = await loadHolidays(
    env,
    competencia
  );

  const generated = buildWeeks(
    competencia,
    holidays
  );

  const result = await env.DB.prepare(`
    SELECT
      semana_inicio,
      semana_fim,
      responsavel,
      atualizado_por,
      atualizado_em
    FROM atende_balcao_responsavel_semanal
    WHERE competencia=?
    ORDER BY semana_inicio
  `)
    .bind(competencia)
    .all();

  const saved = result?.results || [];

  const savedMap = new Map(
    saved.map(x => [
      clean(x.semana_inicio),
      x
    ])
  );

  const semanas = generated.map(
    (week,index) => {
      const old =
        savedMap.get(week.inicio) ||
        {};

      return {
        numero:index + 1,
        inicio:week.inicio,
        fim:week.fim,
        responsavel:
          clean(old.responsavel)
            .toUpperCase(),
        atualizadoPor:
          clean(old.atualizado_por),
        atualizadoEm:
          clean(old.atualizado_em)
      };
    }
  );

  return json({
    ok:true,
    competencia,
    found:saved.length > 0,

    complete:
      semanas.length > 0 &&
      semanas.every(x =>
        x.responsavel === 'ALESSON' ||
        x.responsavel === 'LEVY'
      ),

    semanas
  });
}

async function saveWeekly(request, env) {
  let body;

  try {
    body = await request.json();
  } catch (_) {
    return json(
      {ok:false,error:'invalid_json'},
      400
    );
  }

  const competencia =
    clean(body?.competencia);

  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return json(
      {ok:false,error:'competencia_invalid'},
      400
    );
  }

  const holidays = await loadHolidays(
    env,
    competencia
  );

  const expected = buildWeeks(
    competencia,
    holidays
  );

  const received =
    Array.isArray(body?.semanas)
      ? body.semanas
      : [];

  if (received.length !== expected.length) {
    return json({
      ok:false,
      error:'quantidade_semanas_invalida',
      esperado:expected.length,
      recebido:received.length
    },400);
  }

  const map = new Map();

  received.forEach(x => {
    const inicio = clean(x?.inicio);

    if (inicio) {
      map.set(inicio,x);
    }
  });

  const normalized = [];

  for (const week of expected) {
    const row = map.get(week.inicio);

    if (
      !row ||
      clean(row.fim) !== week.fim
    ) {
      return json({
        ok:false,
        error:'periodo_semana_invalido',
        inicio:week.inicio,
        fim:week.fim
      },400);
    }

    const responsavel =
      clean(row.responsavel)
        .toUpperCase();

    if (
      responsavel !== 'ALESSON' &&
      responsavel !== 'LEVY'
    ) {
      return json({
        ok:false,
        error:'responsavel_invalido',
        inicio:week.inicio
      },400);
    }

    normalized.push({
      inicio:week.inicio,
      fim:week.fim,
      responsavel
    });
  }

  const user =
    clean(
      request.headers.get(
        'X-AGF-Admin-User'
      )
    ) || 'admin';

  const statements = [
    env.DB.prepare(`
      DELETE FROM atende_balcao_responsavel_semanal
      WHERE competencia=?
    `).bind(competencia)
  ];

  normalized.forEach(x => {
    statements.push(
      env.DB.prepare(`
        INSERT INTO atende_balcao_responsavel_semanal(
          competencia,
          semana_inicio,
          semana_fim,
          responsavel,
          atualizado_por,
          atualizado_em
        )
        VALUES(
          ?,?,?,?,?,datetime('now')
        )
      `).bind(
        competencia,
        x.inicio,
        x.fim,
        x.responsavel,
        user
      )
    );
  });

  await env.DB.batch(statements);

  return json({
    ok:true,
    competencia,
    semanas:normalized
  });
}

async function loadHolidays(
  env,
  competencia
) {
  const range = monthRange(
    competencia
  );

  const holidays = new Set();

  try {
    const result = await env.DB.prepare(`
      SELECT data
      FROM atende_calendario_feriados
      WHERE ativo=1
        AND data>=?
        AND data<=?
    `)
      .bind(
        range.start,
        range.end
      )
      .all();

    (result?.results || [])
      .forEach(x => {
        holidays.add(
          clean(x.data)
        );
      });

  } catch (_) {}

  return holidays;
}

function buildWeeks(
  competencia,
  holidays
) {
  const range =
    monthRange(competencia);

  const weeks = new Map();

  for (
    let day = range.start;
    day <= range.end;
    day = addDays(day,1)
  ) {
    if (!isBusinessDay(
      day,
      holidays
    )) {
      continue;
    }

    const date =
      parseDate(day);

    const dow =
      date.getUTCDay();

    const monday =
      addDays(
        day,
        -(dow - 1)
      );

    if (!weeks.has(monday)) {
      weeks.set(
        monday,
        []
      );
    }

    weeks.get(monday)
      .push(day);
  }

  return Array.from(
    weeks.entries()
  )
    .sort(
      (a,b) =>
        a[0].localeCompare(b[0])
    )
    .map(([,days]) => ({
      inicio:days[0],
      fim:days[
        days.length - 1
      ]
    }));
}

function monthRange(comp) {
  const parts =
    comp.split('-')
      .map(Number);

  const y = parts[0];
  const m = parts[1];

  const last =
    new Date(
      Date.UTC(y,m,0)
    ).getUTCDate();

  return {
    start:
      comp + '-01',

    end:
      comp + '-' +
      String(last)
        .padStart(2,'0')
  };
}

function parseDate(value) {
  const match =
    String(value || '')
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

  if (!match) return null;

  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );
}

function addDays(value,amount) {
  const date =
    parseDate(value);

  if (!date) return value;

  date.setUTCDate(
    date.getUTCDate() +
    amount
  );

  return date
    .toISOString()
    .slice(0,10);
}

function isBusinessDay(
  value,
  holidays
) {
  const date =
    parseDate(value);

  if (!date) return false;

  const dow =
    date.getUTCDay();

  return (
    dow !== 0 &&
    dow !== 6 &&
    !holidays.has(value)
  );
}

function clean(value) {
  return String(
    value == null
      ? ''
      : value
  ).trim();
}

function authorized(
  request,
  env
) {
  return (
    !!env.ATENDE_API_TOKEN &&
    (
      request.headers.get(
        'Authorization'
      ) || ''
    ) ===
    `Bearer ${env.ATENDE_API_TOKEN}`
  );
}

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        'Content-Type':
          'application/json; charset=utf-8',
        'Access-Control-Allow-Origin':
          '*'
      }
    }
  );
}