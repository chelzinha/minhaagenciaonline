/**
 * agf-cadastros-api v2 - Cadastro de Clientes (identidade comercial para o CRM)
 * Bindings: DB (agf-cadastros), ATENDE_DB (agf-atende, leitura), AGF_AUTH_API_URL, ALLOWED_ORIGINS
 */
import { executarMotorD1, emLotes } from './persistencia.js';
import { sincronizar } from './sincronizacao.js';
import { REGRAS, MOTIVOS_SUGESTAO, MOTOR_VERSAO, nomeExibicao } from './motor.js';

const ABAS = ['PORTAL', 'BALCAO', 'METRO', 'CF'];

// ---------------------------------------------------------------- http
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const erro = (mensagem, status = 400) => { throw Object.assign(new Error(mensagem), { status }); };
const limpar = (v) => String(v ?? '').trim();

function origemPermitida(request, env) {
  const origin = request.headers.get('Origin') || '';
  const lista = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (lista.includes(origin)) return origin;
  // previews do Cloudflare Pages do proprio projeto
  if (env.PREVIEW_ORIGIN_SUFFIX && origin.startsWith('https://') && origin.endsWith(env.PREVIEW_ORIGIN_SUFFIX)) return origin;
  return '';
}
function comCors(resp, request, env) {
  const origin = origemPermitida(request, env);
  if (!origin) return resp;
  const h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Vary', 'Origin');
  return new Response(resp.body, { status: resp.status, headers: h });
}
async function corpo(request) { try { return await request.json(); } catch { return erro('JSON invalido.'); } }

// Sessao: valida no Apps Script de autenticacao e guarda o resultado por alguns minutos.
// Sem cache, cada clique disparava varias validacoes simultaneas e o Apps Script recusava parte delas,
// o que virava 401 e mandava o usuario de volta ao portal.
const SESSAO_TTL_MS = 5 * 60 * 1000;
const sessoes = new Map();                       // cache do isolate: hash do token -> { user, ate }

async function hashToken(token) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function validarNoAuth(env, token) {
  let resp, data;
  try {
    resp = await fetch(env.AGF_AUTH_API_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'validate', token }), redirect: 'follow' });
    data = await resp.json();
  } catch { return { falhaTemporaria: true }; }
  if (resp.ok && data && data.ok !== false && data.user) return { user: data.user };
  return { recusado: true };
}
async function usuarioDaSessao(request, env) {
  const token = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) erro('Faca login para continuar.', 401);
  if (!env.AGF_AUTH_API_URL) erro('Validacao de sessao nao configurada.', 503);
  const h = await hashToken(token);
  const agora = Date.now();
  const mem = sessoes.get(h);
  if (mem && mem.ate > agora) return mem.user;
  const cacheKey = new Request(`https://sessao.agf-cadastros.local/${h}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) { const user = await hit.json(); sessoes.set(h, { user, ate: agora + SESSAO_TTL_MS }); return user; }
  }
  let r = await validarNoAuth(env, token);
  if (!r.user) { await new Promise((ok) => setTimeout(ok, 600)); r = await validarNoAuth(env, token); }   // 2a tentativa
  if (r.user) {
    sessoes.set(h, { user: r.user, ate: agora + SESSAO_TTL_MS });
    if (cache) await cache.put(cacheKey, new Response(JSON.stringify(r.user), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${SESSAO_TTL_MS / 1000}` } }));
    return r.user;
  }
  if (r.falhaTemporaria) erro('Nao foi possivel validar a sessao agora. Tente de novo em instantes.', 503);
  erro('Sessao invalida.', 401);
}
async function exigirAdmin(request, env) {
  const u = await usuarioDaSessao(request, env);
  if (String(u.role || '').toLowerCase() !== 'admin') erro('Acesso restrito ao administrador.', 403);
  return limpar(u.username || u.displayName || 'admin');
}
async function exigirCrm(request, env) {
  const u = await usuarioDaSessao(request, env);
  if (String(u.role || '').toLowerCase() !== 'admin' && !(u.apps || []).includes('crm')) erro('Acesso restrito ao CRM.', 403);
  return u;
}

// ---------------------------------------------------------------- leitura
async function resumo(env) {
  const db = env.DB;
  const [abas, total, sug, semPortal, descartadas, estado, ultimoMotor, carteira] = await db.batch([
    db.prepare(`SELECT aba, COUNT(*) clientes, SUM(postagens) postagens, ROUND(SUM(valor),2) valor, SUM(grafias) grafias FROM cid_resumo GROUP BY aba`),
    db.prepare(`SELECT (SELECT COUNT(*) FROM cid_clientes) clientes, (SELECT COUNT(*) FROM cid_postagens) postagens,
      (SELECT COUNT(*) FROM cid_clientes WHERE portal_chave IS NOT NULL) clientes_portal`),
    db.prepare(`SELECT COUNT(*) pares, COUNT(DISTINCT cliente_a) + 0 a FROM cid_sugestoes`),
    db.prepare(`SELECT COUNT(*) postagens FROM cid_postagens WHERE origem='SEM_PORTAL'`),
    db.prepare(`SELECT COUNT(*) grafias, COALESCE(SUM((SELECT COUNT(*) FROM cid_postagens p WHERE p.origem=g.origem AND p.grafia=g.grafia)),0) postagens
      FROM cid_grafias g WHERE g.no_chave IS NULL`),
    db.prepare(`SELECT chave, valor, atualizado_em FROM cid_estado`),
    db.prepare(`SELECT resumo_json, autor, criado_em FROM cid_execucoes WHERE tipo='MOTOR' ORDER BY id DESC LIMIT 1`),
    db.prepare(`SELECT COALESCE(local_carteira, 'FILA') local, COUNT(*) clientes FROM cid_clientes GROUP BY 1`),
  ]);
  const porAba = Object.fromEntries(ABAS.map((a) => [a, { clientes: 0, postagens: 0, valor: 0, grafias: 0 }]));
  for (const r of abas.results || []) porAba[r.aba] = { clientes: r.clientes, postagens: r.postagens, valor: r.valor, grafias: r.grafias };
  const est = Object.fromEntries((estado.results || []).map((x) => [x.chave, x]));
  const um = ultimoMotor.results?.[0];
  return {
    abas: porAba, totais: total.results?.[0] || {}, sugestoes: sug.results?.[0]?.pares || 0,
    semClientePortal: semPortal.results?.[0]?.postagens || 0, descartadas: descartadas.results?.[0] || {},
    sincronizacao: { cursor: Number(est.sync_cursor?.valor || 0), passagens: Number(est.sync_passagem?.valor || 0), atualizadoEm: est.sync_cursor?.atualizado_em, motorPendente: est.motor_pendente?.valor === '1' },
    motor: um ? { ...JSON.parse(um.resumo_json), autor: um.autor, em: um.criado_em } : null,
    versaoMotor: MOTOR_VERSAO, regras: REGRAS, motivos: MOTIVOS_SUGESTAO,
    carteira: Object.fromEntries((carteira.results || []).map((x) => [x.local, x.clientes])),
    filaLocal: await contarFilaLocal(env),
  };
}

// ---------------------------------------------------------------- LOCAL da carteira
const LOCAIS = ['AGF', 'BALCAO', 'METRO'];
const SQL_FILA_LOCAL = `
  SELECT c.id, c.nome, c.portal_chave IS NOT NULL eh_portal,
    SUM(r.local_agf) agf, SUM(r.local_balcao) balcao, SUM(r.local_metro) metro, SUM(r.postagens) postagens, ROUND(SUM(r.valor),2) valor,
    MAX(r.ultima) ultima
  FROM cid_clientes c JOIN cid_resumo r ON r.cliente_id = c.id
  WHERE c.local_carteira IS NULL
  GROUP BY c.id
  HAVING (SUM(r.local_agf) > 0) + (SUM(r.local_balcao) > 0) + (SUM(r.local_metro) > 0) <> 1`;   // mais de um LOCAL, ou nenhum LOCAL informado

async function contarFilaLocal(env) {
  const r = await env.DB.prepare(`SELECT COUNT(*) n FROM (${SQL_FILA_LOCAL})`).first();
  return Number(r?.n || 0);
}

function sugestaoLocal(x) {
  const pares = [['AGF', x.agf || 0], ['BALCAO', x.balcao || 0], ['METRO', x.metro || 0]].sort((a, b) => b[1] - a[1]);
  const total = pares.reduce((s, p) => s + p[1], 0);
  if (!total) return { sugerido: null, participacao: 0 };                 // postagens sem LOCAL no Atende: sem sugestao
  return { sugerido: pares[0][0], participacao: Math.floor((100 * pares[0][1]) / total) };   // floor: 100% so quando e tudo num LOCAL
}

async function filaLocal(url, env) {
  const por = Math.min(100, Math.max(10, Number(url.searchParams.get('por')) || 30));
  const pagina = Math.max(1, Math.trunc(Number(url.searchParams.get('pagina')) || 1));
  const [lista, total] = await env.DB.batch([
    env.DB.prepare(`${SQL_FILA_LOCAL} ORDER BY valor DESC LIMIT ? OFFSET ?`).bind(por, (pagina - 1) * por),
    env.DB.prepare(`SELECT COUNT(*) n FROM (${SQL_FILA_LOCAL})`),
  ]);
  const itens = (lista.results || []).map((x) => ({ ...x, ...sugestaoLocal(x) }));
  // quantos da fila inteira tem 90%+ das postagens num LOCAL so (para o "aplicar sugestao" em lote)
  const todos = await env.DB.prepare(SQL_FILA_LOCAL).all();
  const fortes = (todos.results || []).filter((x) => sugestaoLocal(x).participacao >= 90).length;
  const n = Number(total.results?.[0]?.n || 0);
  return { total: n, pagina, por, paginas: Math.max(1, Math.ceil(n / por)), fortes, itens };
}

async function definirLocal(request, env, autor) {
  const b = await corpo(request);
  let itens = Array.isArray(b.itens) ? b.itens : [];
  if (b.sugestoesFortes === true) {
    const todos = await env.DB.prepare(SQL_FILA_LOCAL).all();
    itens = (todos.results || []).map((x) => ({ clienteId: x.id, ...sugestaoLocal(x) })).filter((x) => x.participacao >= 90).map((x) => ({ clienteId: x.clienteId, local: x.sugerido }));
  }
  itens = itens.map((x) => ({ clienteId: limpar(x.clienteId), local: limpar(x.local).toUpperCase() })).filter((x) => x.clienteId);
  if (!itens.length) erro('Nenhum cliente informado.');
  if (itens.length > 500) erro('Envie no maximo 500 clientes por vez.');
  if (itens.some((x) => !LOCAIS.includes(x.local))) erro('LOCAL invalido. Use AGF, BALCAO ou METRO.');
  const stmts = [];
  for (const it of itens) {
    const nos = await nosDoCliente(env, it.clienteId);
    if (!nos.length) continue;
    for (const k of nos) stmts.push(env.DB.prepare(`INSERT INTO cid_local_decisoes(chave, local, autor) VALUES(?,?,?)
      ON CONFLICT(chave) DO UPDATE SET local=excluded.local, autor=excluded.autor, em=CURRENT_TIMESTAMP`).bind(k, it.local, autor));
    stmts.push(env.DB.prepare(`UPDATE cid_clientes SET local_carteira=?, local_fonte='ADMIN', atualizado_em=CURRENT_TIMESTAMP WHERE id=?`).bind(it.local, it.clienteId));
  }
  await emLotes(env.DB, stmts);
  return { definidos: itens.length, filaLocal: await contarFilaLocal(env) };
}


async function listarClientes(url, env) {
  const aba = ABAS.includes(url.searchParams.get('aba')) ? url.searchParams.get('aba') : 'PORTAL';
  const q = nomeExibicao(limpar(url.searchParams.get('q')).slice(0, 80));
  const por = Math.min(100, Math.max(10, Number(url.searchParams.get('por')) || 50));
  const pagina = Math.max(1, Math.trunc(Number(url.searchParams.get('pagina')) || 1));
  const ordem = { postagens: 'r.postagens DESC, c.nome', nome: 'c.nome COLLATE NOCASE', grafias: 'r.grafias DESC, r.postagens DESC', valor: 'r.valor DESC' }[url.searchParams.get('ordem')] || 'r.postagens DESC, c.nome';
  const filtro = q ? `AND (c.nome LIKE ? OR EXISTS (SELECT 1 FROM cid_nos n JOIN cid_grafias g ON g.no_chave=n.chave WHERE n.cliente_id=c.id AND upper(g.grafia) LIKE ?))` : '';
  const binds = q ? [`%${q}%`, `%${q}%`] : [];
  // filtro de LOCAL (onde a postagem foi atendida), independente da fonte do cadastro
  const colLocal = { AGF: 'r.local_agf', BALCAO: 'r.local_balcao', METRO: 'r.local_metro' }[url.searchParams.get('local')];
  const filtroLocal = colLocal ? `AND ${colLocal} > 0` : '';
  const [lista, total] = await env.DB.batch([
    env.DB.prepare(`SELECT c.id, c.nome, c.fonte_nome, c.portal_chave IS NOT NULL eh_portal, c.local_carteira, c.local_fonte, r.postagens, r.valor, r.grafias,
        r.local_agf, r.local_balcao, r.local_metro, r.local_vazio, r.ultima,
        (SELECT COUNT(*) FROM cid_sugestoes s WHERE s.cliente_a=c.id OR s.cliente_b=c.id) sugestoes,
        (SELECT GROUP_CONCAT(aba) FROM cid_resumo r2 WHERE r2.cliente_id=c.id) abas
      FROM cid_resumo r JOIN cid_clientes c ON c.id=r.cliente_id
      WHERE r.aba=? ${filtro} ${filtroLocal} ORDER BY ${ordem} LIMIT ? OFFSET ?`).bind(aba, ...binds, por, (pagina - 1) * por),
    env.DB.prepare(`SELECT COUNT(*) n, COALESCE(SUM(r.postagens),0) postagens FROM cid_resumo r JOIN cid_clientes c ON c.id=r.cliente_id WHERE r.aba=? ${filtro} ${filtroLocal}`).bind(aba, ...binds),
  ]);
  const t = total.results?.[0] || { n: 0, postagens: 0 };
  return { aba, pagina, por, total: t.n, postagens: t.postagens, paginas: Math.max(1, Math.ceil(t.n / por)), clientes: lista.results || [] };
}

async function ficha(id, env) {
  const db = env.DB;
  const cliente = await db.prepare(`SELECT * FROM cid_clientes WHERE id=?`).bind(id).first();
  if (!cliente) {
    const f = await db.prepare(`SELECT id_novo FROM cid_ids_fundidos WHERE id_antigo=?`).bind(id).first();
    if (f) return { redirecionar: f.id_novo };
    erro('Cliente nao encontrado.', 404);
  }
  const [grafias, locais, contratos, sugestoes, abas] = await db.batch([
    db.prepare(`SELECT g.origem, g.grafia, n.chave, n.regra, COUNT(p.raw_id) postagens, ROUND(SUM(p.valor),2) valor, MAX(p.data_postagem) ultima
      FROM cid_nos n JOIN cid_grafias g ON g.no_chave=n.chave LEFT JOIN cid_postagens p ON p.origem=g.origem AND p.grafia=g.grafia
      WHERE n.cliente_id=? GROUP BY g.origem, g.grafia ORDER BY postagens DESC`).bind(id),
    db.prepare(`SELECT p.local_codigo, COUNT(*) postagens, ROUND(SUM(p.valor),2) valor
      FROM cid_nos n JOIN cid_grafias g ON g.no_chave=n.chave JOIN cid_postagens p ON p.origem=g.origem AND p.grafia=g.grafia
      WHERE n.cliente_id=? GROUP BY p.local_codigo ORDER BY postagens DESC`).bind(id),
    db.prepare(`SELECT p.contrato, p.cartao, COUNT(*) postagens, MAX(p.data_postagem) ultima
      FROM cid_nos n JOIN cid_grafias g ON g.no_chave=n.chave JOIN cid_postagens p ON p.origem=g.origem AND p.grafia=g.grafia
      WHERE n.cliente_id=? AND (p.contrato<>'' OR p.cartao<>'') GROUP BY p.contrato, p.cartao ORDER BY postagens DESC LIMIT 50`).bind(id),
    db.prepare(`SELECT s.*, c.nome outro_nome, c.portal_chave IS NOT NULL outro_portal,
        (SELECT SUM(postagens) FROM cid_resumo r WHERE r.cliente_id=c.id) outro_postagens
      FROM cid_sugestoes s JOIN cid_clientes c ON c.id = CASE WHEN s.cliente_a=? THEN s.cliente_b ELSE s.cliente_a END
      WHERE s.cliente_a=? OR s.cliente_b=? ORDER BY s.score DESC`).bind(id, id, id),
    db.prepare(`SELECT aba, postagens FROM cid_resumo WHERE cliente_id=?`).bind(id),
  ]);
  const listaContratos = contratos.results || [];
  await anexarTipoContrato(env, listaContratos);
  return { cliente, grafias: grafias.results || [], locais: locais.results || [], contratos: listaContratos, sugestoes: sugestoes.results || [], abas: abas.results || [] };
}

/** TIPO do contrato com a mesma regra do Atende (coluna TIPO do Visao 360):
 *  tipo ativo em atende_contratos; sem tipo, contrato com 1 a 3 postagens = CONTRATO ECT. */
async function anexarTipoContrato(env, lista) {
  const numeros = [...new Set(lista.map((k) => limpar(k.contrato).toUpperCase()).filter(Boolean))];
  for (const k of lista) k.tipo = '';
  if (!numeros.length || !env.ATENDE_DB) return;
  try {
    const marcas = numeros.map(() => '?').join(',');
    const [co, cc] = await env.ATENDE_DB.batch([
      env.ATENDE_DB.prepare(`SELECT numero, tipo FROM atende_contratos WHERE ativo = 1 AND numero IN (${marcas})`).bind(...numeros),
      env.ATENDE_DB.prepare(`SELECT numero, ocorrencias FROM atende_contrato_counts WHERE numero IN (${marcas})`).bind(...numeros),
    ]);
    const tipo = new Map((co.results || []).map((x) => [x.numero, limpar(x.tipo)]));
    const oc = new Map((cc.results || []).map((x) => [x.numero, Number(x.ocorrencias || 0)]));
    for (const k of lista) {
      const n = limpar(k.contrato).toUpperCase();
      if (!n) continue;
      k.tipo = tipo.get(n) || ((oc.get(n) || 0) >= 1 && (oc.get(n) || 0) <= 3 ? 'CONTRATO ECT' : '');
    }
  } catch (e) {
    console.error('[CADASTROS_V2] tipo do contrato', e?.message || e);   // a ficha abre mesmo sem essa informacao
  }
}

/** Sugestoes agrupadas: componentes conexos do grafo de sugestoes ("3 nomes viram 1"). */
async function gruposDeSugestao(url, env) {
  const aba = ABAS.includes(url.searchParams.get('aba')) ? url.searchParams.get('aba') : '';
  const min = Math.max(0, Number(url.searchParams.get('min')) || 0);
  const por = Math.min(50, Math.max(5, Number(url.searchParams.get('por')) || 20));
  const pagina = Math.max(1, Math.trunc(Number(url.searchParams.get('pagina')) || 1));
  const s = await env.DB.prepare(`SELECT cliente_a, cliente_b, chave_a, chave_b, score, motivo FROM cid_sugestoes WHERE score >= ?`).bind(min).all();
  const pares = s.results || [];
  const ids = [...new Set(pares.flatMap((p) => [p.cliente_a, p.cliente_b]))];
  const info = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const lote = ids.slice(i, i + 90);
    const r = await env.DB.prepare(`SELECT c.id, c.nome, c.portal_chave IS NOT NULL eh_portal, COALESCE(SUM(r.postagens),0) postagens, COALESCE(SUM(r.grafias),0) grafias,
        GROUP_CONCAT(r.aba) abas, COALESCE(SUM(r.local_agf),0) local_agf, COALESCE(SUM(r.local_balcao),0) local_balcao, COALESCE(SUM(r.local_metro),0) local_metro
      FROM cid_clientes c LEFT JOIN cid_resumo r ON r.cliente_id=c.id WHERE c.id IN (${lote.map(() => '?').join(',')}) GROUP BY c.id`).bind(...lote).all();
    for (const x of r.results || []) info.set(x.id, x);
  }
  // Grupos em estrela: uma ancora (Portal > nome mais completo > mais postagens) + os nomes sugeridos para ela.
  // Evita correntes do tipo A~B~C~D que juntariam pessoas diferentes.
  const melhor = (x, y) => {
    const a = info.get(x), b = info.get(y);
    if (!a || !b) return a ? x : y;
    const pa = a.nome.split(' ').length, pb = b.nome.split(' ').length;
    const cortA = b.nome.startsWith(a.nome) && b.nome.length > a.nome.length, cortB = a.nome.startsWith(b.nome) && a.nome.length > b.nome.length;
    return ((b.eh_portal - a.eh_portal) || (pb - pa) || (cortA - cortB) || (b.postagens - a.postagens) || (b.nome.length - a.nome.length)) > 0 ? y : x;
  };
  pares.sort((a, b) => b.score - a.score);
  const ancoraDe = new Map(), membroDe = new Map(), grupos = new Map();
  for (const p of pares) {
    if (!info.has(p.cliente_a) || !info.has(p.cliente_b)) continue;
    const anc = melhor(p.cliente_a, p.cliente_b), mem = anc === p.cliente_a ? p.cliente_b : p.cliente_a;
    if (membroDe.has(mem) || grupos.has(mem) || membroDe.has(anc)) continue;
    if (!grupos.has(anc)) grupos.set(anc, { ancora: anc, membros: [], pares: [] });
    const g = grupos.get(anc);
    if (g.membros.length >= 7) continue;
    if (info.get(mem).eh_portal && info.get(anc).eh_portal) continue;
    g.membros.push(mem); g.pares.push(p); membroDe.set(mem, anc);
  }
  let lista = [...grupos.values()].map((g) => {
    const clientes = [g.ancora, ...g.membros].map((id) => info.get(id));
    const scoreMax = Math.max(...g.pares.map((p) => p.score));
    const motivos = [...new Set(g.pares.map((p) => p.motivo))];
    return { clientes, pares: g.pares, scoreMax, motivos, nomeSugerido: clientes[0].nome, postagens: clientes.reduce((s2, c) => s2 + c.postagens, 0) };
  });
  if (aba) lista = lista.filter((g) => g.clientes.some((c) => String(c.abas || '').split(',').includes(aba)));
  lista.sort((a, b) => b.scoreMax - a.scoreMax || b.postagens - a.postagens);
  const total = lista.length;
  return { total, pagina, por, paginas: Math.max(1, Math.ceil(total / por)), grupos: lista.slice((pagina - 1) * por, pagina * por) };
}

async function buscarClientes(url, env) {
  const q = nomeExibicao(limpar(url.searchParams.get('q')).slice(0, 80));
  if (q.length < 2) return { clientes: [] };
  const r = await env.DB.prepare(`SELECT c.id, c.nome, c.portal_chave IS NOT NULL eh_portal, COALESCE(SUM(r.postagens),0) postagens
    FROM cid_clientes c LEFT JOIN cid_resumo r ON r.cliente_id=c.id WHERE c.nome LIKE ? GROUP BY c.id ORDER BY eh_portal DESC, postagens DESC LIMIT 20`).bind(`%${q}%`).all();
  return { clientes: r.results || [] };
}

// ---------------------------------------------------------------- escrita (decisoes -> motor)
async function nosDoCliente(env, id) {
  const r = await env.DB.prepare(`SELECT n.chave, COALESCE(SUM(p.cnt),0) postagens FROM cid_nos n
    LEFT JOIN (SELECT g.no_chave, COUNT(*) cnt FROM cid_grafias g JOIN cid_postagens p ON p.origem=g.origem AND p.grafia=g.grafia GROUP BY g.no_chave) p ON p.no_chave=n.chave
    WHERE n.cliente_id=? GROUP BY n.chave ORDER BY (n.tipo='P') DESC, postagens DESC`).bind(id).all();
  return (r.results || []).map((x) => x.chave);
}

async function agrupar(request, env, autor) {
  const b = await corpo(request);
  const ids = [...new Set((b.clientes || []).map(limpar).filter(Boolean))];
  if (ids.length < 2) erro('Selecione pelo menos 2 cadastros para agrupar.');
  if (ids.length > 30) erro('Agrupe no maximo 30 cadastros por vez.');
  const nos = [];
  for (const id of ids) {
    const n = await nosDoCliente(env, id);
    if (!n.length) erro(`Cadastro ${id} nao existe mais. Recarregue a tela.`, 409);
    nos.push({ id, chave: n[0], ehPortal: n[0].startsWith('P:') });
  }
  const portais = nos.filter((n) => n.ehPortal);
  if (portais.length > 1) erro('Dois clientes do Portal nao podem virar um so. O Portal e a referencia oficial.', 409);
  const destino = portais[0] || nos.find((n) => n.id === limpar(b.destino)) || nos[0];
  const stmts = nos.filter((n) => n !== destino).map((n) => env.DB.prepare(`INSERT INTO cid_decisoes(tipo, chave_a, chave_b, autor) VALUES('UNIR',?,?,?)`).bind(destino.chave, n.chave, autor));
  const nome = nomeExibicao(limpar(b.nome)).slice(0, 160);
  if (nome && !destino.ehPortal) stmts.push(env.DB.prepare(`INSERT INTO cid_decisoes(tipo, chave_a, valor, autor) VALUES('NOME',?,?,?)`).bind(destino.chave, nome, autor));
  // desativa "separar" antigos entre esses nos
  for (const n of nos) for (const m of nos) if (n !== m) stmts.push(env.DB.prepare(`UPDATE cid_decisoes SET ativo=0 WHERE tipo='SEPARAR' AND ativo=1 AND chave_a=? AND chave_b=?`).bind(n.chave, m.chave));
  await env.DB.batch(stmts);
  const motor = await executarMotorD1(env, autor);
  const novo = await env.DB.prepare(`SELECT cliente_id FROM cid_nos WHERE chave=?`).bind(destino.chave).first();
  return { clienteId: novo?.cliente_id, motor };
}

async function naoEhOMesmo(request, env, autor) {
  const b = await corpo(request);
  const a = limpar(b.clienteA), c = limpar(b.clienteB);
  if (!a || !c || a === c) erro('Informe os dois cadastros.');
  const [na, nc] = [await nosDoCliente(env, a), await nosDoCliente(env, c)];
  const stmts = [];
  for (const x of na) for (const y of nc) stmts.push(env.DB.prepare(`INSERT INTO cid_decisoes(tipo, chave_a, chave_b, autor) VALUES('SEPARAR',?,?,?)`).bind(x, y, autor));
  stmts.push(env.DB.prepare(`DELETE FROM cid_sugestoes WHERE (cliente_a=? AND cliente_b=?) OR (cliente_a=? AND cliente_b=?)`).bind(a, c, c, a));
  await env.DB.batch(stmts.slice(0, 400));
  return { ok: true };
}

async function tirarGrafia(request, env, autor) {
  const b = await corpo(request);
  const chave = limpar(b.chave), id = limpar(b.clienteId);
  const nos = await nosDoCliente(env, id);
  if (!nos.includes(chave)) erro('Essa grafia nao pertence a este cliente. Recarregue a tela.', 409);
  if (nos.length < 2) erro('O cliente so tem esse nome.');
  const stmts = nos.filter((k) => k !== chave).map((k) => env.DB.prepare(`INSERT INTO cid_decisoes(tipo, chave_a, chave_b, autor) VALUES('SEPARAR',?,?,?)`).bind(chave, k, autor));
  stmts.push(env.DB.prepare(`UPDATE cid_decisoes SET ativo=0 WHERE tipo='UNIR' AND ativo=1 AND (chave_a=? OR chave_b=?)`).bind(chave, chave));
  await env.DB.batch(stmts);
  return { motor: await executarMotorD1(env, autor) };
}

async function renomear(request, env, autor) {
  const b = await corpo(request);
  const id = limpar(b.clienteId), nome = nomeExibicao(limpar(b.nome)).slice(0, 160);
  if (!nome) erro('Informe o nome padronizado.');
  const c = await env.DB.prepare(`SELECT portal_chave FROM cid_clientes WHERE id=?`).bind(id).first();
  if (!c) erro('Cliente nao encontrado.', 404);
  if (c.portal_chave) erro('Cliente do Portal usa o nome do Portal. Corrija no Portal.', 409);
  const nos = await nosDoCliente(env, id);
  await env.DB.batch(nos.map((k) => env.DB.prepare(`INSERT INTO cid_decisoes(tipo, chave_a, valor, autor) VALUES('NOME',?,?,?)`).bind(k, nome, autor)));
  return { motor: await executarMotorD1(env, autor) };
}

// ---------------------------------------------------------------- CRM
async function feedCrm(url, env) {
  const depois = Math.max(0, Number(url.searchParams.get('depois')) || 0);
  const limite = Math.min(1000, Math.max(1, Number(url.searchParams.get('limite')) || 500));
  const r = await env.DB.prepare(`SELECT raw_id, origem, local_codigo, data_postagem, valor, contrato, cartao, cliente_id, cliente_nome
    FROM cid_v_postagem_cliente WHERE raw_id > ? ORDER BY raw_id LIMIT ?`).bind(depois, limite).all();
  const postagens = r.results || [];
  return { postagens, proximo: postagens.length ? postagens[postagens.length - 1].raw_id : null };
}

// ---------------------------------------------------------------- roteador
async function rotear(request, env) {
  const url = new URL(request.url), p = url.pathname, m = request.method;
  if (p === '/health' && m === 'GET') return json({ ok: true, servico: 'agf-cadastros-api', versao: 2, motor: MOTOR_VERSAO });
  if (p === '/api/v2/crm/postagens' && m === 'GET') { await exigirCrm(request, env); return json({ ok: true, ...(await feedCrm(url, env)) }); }
  if (p === '/api/v2/crm/ids-fundidos' && m === 'GET') {
    await exigirCrm(request, env);
    const r = await env.DB.prepare(`SELECT id_antigo, id_novo, em FROM cid_ids_fundidos`).all();
    return json({ ok: true, ids: r.results || [] });
  }
  const autor = await exigirAdmin(request, env);
  if (p === '/api/v2/resumo' && m === 'GET') return json({ ok: true, ...(await resumo(env)) });
  if (p === '/api/v2/clientes' && m === 'GET') return json({ ok: true, ...(await listarClientes(url, env)) });
  if (p === '/api/v2/busca' && m === 'GET') return json({ ok: true, ...(await buscarClientes(url, env)) });
  const f = p.match(/^\/api\/v2\/clientes\/([A-Za-z0-9_]+)$/);
  if (f && m === 'GET') return json({ ok: true, ...(await ficha(f[1], env)) });
  if (p === '/api/v2/sugestoes' && m === 'GET') return json({ ok: true, ...(await gruposDeSugestao(url, env)) });
  if (p === '/api/v2/agrupar' && m === 'POST') return json({ ok: true, ...(await agrupar(request, env, autor)) });
  if (p === '/api/v2/nao-e-o-mesmo' && m === 'POST') return json({ ok: true, ...(await naoEhOMesmo(request, env, autor)) });
  if (p === '/api/v2/tirar-grafia' && m === 'POST') return json({ ok: true, ...(await tirarGrafia(request, env, autor)) });
  if (p === '/api/v2/renomear' && m === 'POST') return json({ ok: true, ...(await renomear(request, env, autor)) });
  if (p === '/api/v2/fila-local' && m === 'GET') return json({ ok: true, ...(await filaLocal(url, env)) });
  if (p === '/api/v2/definir-local' && m === 'POST') return json({ ok: true, ...(await definirLocal(request, env, autor)) });
  if (p === '/api/v2/motor' && m === 'POST') return json({ ok: true, motor: await executarMotorD1(env, autor) });
  if (p === '/api/v2/sincronizar' && m === 'POST') {
    const s = await sincronizar(env, { paginas: 10, orcamentoMs: 15000 });
    return json({ ok: true, sincronizacao: s });
  }
  return json({ ok: false, erro: 'Rota nao encontrada.' }, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    try { return comCors(await rotear(request, env), request, env); }
    catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[CADASTROS_V2]', e?.stack || e);
      return comCors(json({ ok: false, erro: status >= 500 ? 'Falha ao processar. Tente de novo em instantes.' : e.message }, status), request, env);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const s = await sincronizar(env, { paginas: 25, orcamentoMs: 20000 });
        const pend = await env.DB.prepare(`SELECT valor FROM cid_estado WHERE chave='motor_pendente'`).first();
        const vazio = await env.DB.prepare(`SELECT COUNT(*) n FROM cid_clientes`).first();
        // primeira carga: roda a limpeza assim que houver postagens, sem esperar o fim da passagem
        if (!s.ocupado && pend?.valor === '1' && (s.fimDaPassagem || !Number(vazio?.n))) await executarMotorD1(env, 'SISTEMA');
      } catch (e) {
        await env.DB.prepare(`INSERT INTO cid_execucoes(tipo, autor, resumo_json) VALUES('SYNC','SISTEMA',?)`)
          .bind(JSON.stringify({ erro: String(e?.message || e).slice(0, 300) })).run();
        throw e;
      }
    })());
  },
};
