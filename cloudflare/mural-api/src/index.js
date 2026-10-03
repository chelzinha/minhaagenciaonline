/**
 * agf-mural-api v1.0.0 - Portal Interno vivo (rota /agf)
 * Mural de recados, aniversarios da equipe, elogios e agenda da agencia.
 * Bindings: DB (agf-mural), AGF_AUTH_API_URL, ALLOWED_ORIGINS, PREVIEW_ORIGIN_SUFFIX
 *
 * Regras de permissao
 * - Qualquer usuario logado: le o painel, publica recado, responde, curte, elogia.
 * - Autor ou admin: apaga o proprio recado, resposta ou elogio.
 * - Admin e gestor (manager): fixam recado e cuidam da agenda.
 * - Admin: edita a lista de aniversarios da equipe.
 */

// ================================================================ CFG
const VERSAO = '1.0.0';
const LIMITES = { recado: 600, resposta: 280, elogio: 280, nome: 60, titulo: 80, descricao: 140 };
const CATEGORIAS = ['aviso', 'oper', 'lembrete', 'festa'];
const TZ_OFFSET_MIN = -180;                       // America/Fortaleza, UTC-3, sem horario de verao
const RECADOS_NO_PAINEL = 60;
const ELOGIOS_NO_PAINEL = 20;
const AGENDA_DIAS = 120;
const SESSAO_TTL_MS = 5 * 60 * 1000;

// ================================================================ HTTP
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const erro = (mensagem, status = 400) => { throw Object.assign(new Error(mensagem), { status }); };
const limpar = (v, max = 500) => String(v ?? '').replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max);
const agoraIso = () => new Date().toISOString();
const novoId = () => crypto.randomUUID();

function origemPermitida(request, env) {
  const origin = request.headers.get('Origin') || '';
  const lista = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (lista.includes(origin)) return origin;
  const sufixo = String(env.PREVIEW_ORIGIN_SUFFIX || '');
  if (sufixo && origin.startsWith('https://') && origin.endsWith(sufixo)) return origin;
  return '';
}
function comCors(resp, request, env) {
  const origin = origemPermitida(request, env);
  if (!origin) return resp;
  const h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  h.set('Access-Control-Max-Age', '86400');
  h.set('Vary', 'Origin');
  return new Response(resp.body, { status: resp.status, headers: h });
}
async function corpo(request) {
  try { return await request.json(); } catch { return erro('Conteúdo inválido. Atualize a página e tente de novo.'); }
}

// ================================================================ SESSAO
// Valida no Apps Script de autenticacao e guarda por 5 min (mesmo padrao do agf-cadastros-api).
const sessoes = new Map();
async function hashToken(token) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function validarNoAuth(env, token) {
  let resp, data;
  try {
    resp = await fetch(env.AGF_AUTH_API_URL, {
      method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'validate', token }), redirect: 'follow'
    });
    data = await resp.json();
  } catch { return { falhaTemporaria: true }; }
  if (resp.ok && data && data.ok !== false && data.user) return { user: data.user };
  return { recusado: true };
}
async function usuarioDaSessao(request, env) {
  const token = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) erro('Faça login para continuar.', 401);
  if (!env.AGF_AUTH_API_URL) erro('Validação de sessão não configurada.', 503);
  const h = await hashToken(token);
  const agora = Date.now();
  const mem = sessoes.get(h);
  if (mem && mem.ate > agora) return mem.user;
  const cacheKey = new Request(`https://sessao.agf-mural.local/${h}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) { const user = await hit.json(); sessoes.set(h, { user, ate: agora + SESSAO_TTL_MS }); return user; }
  }
  let r = await validarNoAuth(env, token);
  if (!r.user) { await new Promise((ok) => setTimeout(ok, 600)); r = await validarNoAuth(env, token); }
  if (r.user) {
    sessoes.set(h, { user: r.user, ate: agora + SESSAO_TTL_MS });
    if (cache) await cache.put(cacheKey, new Response(JSON.stringify(r.user), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${SESSAO_TTL_MS / 1000}` } }));
    return r.user;
  }
  if (r.falhaTemporaria) erro('Não foi possível validar a sessão agora. Tente de novo em instantes.', 503);
  erro('Sessão encerrada. Entre novamente.', 401);
}
function perfil(user) {
  const role = String(user.role || '').toLowerCase();
  return {
    username: limpar(user.username, 80),
    nome: limpar(user.displayName || user.username || 'Usuário', LIMITES.nome),
    role,
    admin: role === 'admin',
    gestor: role === 'admin' || role === 'manager'
  };
}

// ================================================================ DATAS
function hojeLocal() {
  return new Date(Date.now() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
function somarDias(isoData, dias) {
  const d = new Date(isoData + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
// Inicio do mes local em UTC: dia 1 as 00:00 de Fortaleza = 03:00Z
function limitesDoMesUtc(hoje) {
  const [y, m] = hoje.split('-').map(Number);
  const ini = new Date(Date.UTC(y, m - 1, 1, 0, -TZ_OFFSET_MIN)).toISOString();
  const fim = new Date(Date.UTC(y, m, 1, 0, -TZ_OFFSET_MIN)).toISOString();
  return { ini, fim };
}
function dataValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ================================================================ LOG
async function registrar(env, quem, acao, alvo, detalhe) {
  try {
    await env.DB.prepare('INSERT INTO mural_log (username, acao, alvo, detalhe, criado_em) VALUES (?,?,?,?,?)')
      .bind(quem.username, acao, alvo || null, detalhe ? String(detalhe).slice(0, 300) : null, agoraIso()).run();
  } catch (e) { console.warn('[MURAL][log]', e?.message || e); }
}

// ================================================================ LEITURA
async function painel(env, eu) {
  const db = env.DB;
  const hoje = hojeLocal();
  const mes = limitesDoMesUtc(hoje);
  const iniMes = hoje.slice(0, 8) + '01';
  const subRecados = `SELECT id FROM mural_recados WHERE excluido_em IS NULL ORDER BY fixado DESC, criado_em DESC LIMIT ${RECADOS_NO_PAINEL}`;
  const [recados, respostas, curtidas, aniversarios, elogios, placar, agenda] = await db.batch([
    db.prepare(`SELECT id, autor_username, autor_nome, categoria, texto, fixado, criado_em FROM mural_recados
                WHERE excluido_em IS NULL ORDER BY fixado DESC, criado_em DESC LIMIT ${RECADOS_NO_PAINEL}`),
    db.prepare(`SELECT id, recado_id, autor_username, autor_nome, texto, criado_em FROM mural_respostas
                WHERE excluido_em IS NULL AND recado_id IN (${subRecados}) ORDER BY criado_em`),
    db.prepare(`SELECT recado_id, username, nome FROM mural_curtidas WHERE recado_id IN (${subRecados}) ORDER BY criado_em`),
    db.prepare('SELECT id, nome, dia, mes FROM equipe_aniversarios ORDER BY mes, dia, nome'),
    db.prepare(`SELECT id, de_username, de_nome, para_nome, texto, criado_em FROM mural_elogios
                WHERE excluido_em IS NULL ORDER BY criado_em DESC LIMIT ${ELOGIOS_NO_PAINEL}`),
    db.prepare(`SELECT para_nome, COUNT(*) total FROM mural_elogios
                WHERE excluido_em IS NULL AND criado_em >= ? AND criado_em < ? GROUP BY para_nome ORDER BY total DESC, para_nome`).bind(mes.ini, mes.fim),
    db.prepare(`SELECT id, data, titulo, descricao, tipo, dia_util FROM agenda_eventos
                WHERE excluido_em IS NULL AND data >= ? AND data <= ? ORDER BY data, tipo, titulo`).bind(iniMes, somarDias(hoje, AGENDA_DIAS))
  ]);

  const porRecado = new Map();
  for (const r of recados.results) {
    porRecado.set(r.id, {
      id: r.id, autor: r.autor_nome, autorUsername: r.autor_username, categoria: r.categoria,
      texto: r.texto, fixado: !!r.fixado, criadoEm: r.criado_em, respostas: [], curtidas: []
    });
  }
  for (const r of respostas.results) {
    porRecado.get(r.recado_id)?.respostas.push({ id: r.id, autor: r.autor_nome, autorUsername: r.autor_username, texto: r.texto, criadoEm: r.criado_em });
  }
  for (const c of curtidas.results) porRecado.get(c.recado_id)?.curtidas.push({ username: c.username, nome: c.nome });

  return {
    ok: true,
    versao: VERSAO,
    hoje,
    eu: { username: eu.username, nome: eu.nome, admin: eu.admin, gestor: eu.gestor },
    recados: [...porRecado.values()],
    aniversarios: aniversarios.results.map((a) => ({ id: a.id, nome: a.nome, dia: a.dia, mes: a.mes })),
    elogios: elogios.results.map((e) => ({ id: e.id, de: e.de_nome, deUsername: e.de_username, para: e.para_nome, texto: e.texto, criadoEm: e.criado_em })),
    placar: placar.results.map((p) => ({ nome: p.para_nome, total: p.total })),
    agenda: agenda.results.map((a) => ({ id: a.id, data: a.data, titulo: a.titulo, descricao: a.descricao, tipo: a.tipo, diaUtil: !!a.dia_util }))
  };
}

// ================================================================ RECADOS
async function recadoAtivo(env, id) {
  const r = await env.DB.prepare('SELECT id, autor_username, fixado FROM mural_recados WHERE id = ? AND excluido_em IS NULL').bind(id).first();
  if (!r) erro('Esse recado não existe mais. Atualize a página.', 404);
  return r;
}
async function criarRecado(env, eu, b) {
  const texto = limpar(b.texto, LIMITES.recado);
  const categoria = CATEGORIAS.includes(b.categoria) ? b.categoria : 'oper';
  const fixado = b.fixado === true;
  if (texto.length < 3) erro('Escreva pelo menos 3 caracteres.');
  if (fixado && !eu.gestor) erro('Só administrador ou gestor pode fixar recado.', 403);
  const id = novoId();
  await env.DB.prepare(`INSERT INTO mural_recados (id, autor_username, autor_nome, categoria, texto, fixado, criado_em) VALUES (?,?,?,?,?,?,?)`)
    .bind(id, eu.username, eu.nome, categoria, texto, fixado ? 1 : 0, agoraIso()).run();
  await registrar(env, eu, 'recado.criar', id, categoria + (fixado ? ' fixado' : ''));
  return { ok: true, id };
}
async function excluirRecado(env, eu, id) {
  const r = await recadoAtivo(env, id);
  if (r.autor_username !== eu.username && !eu.admin) erro('Só quem escreveu ou o administrador pode apagar este recado.', 403);
  await env.DB.prepare('UPDATE mural_recados SET excluido_em = ?, excluido_por = ? WHERE id = ?').bind(agoraIso(), eu.username, id).run();
  await registrar(env, eu, 'recado.excluir', id);
  return { ok: true };
}
async function fixarRecado(env, eu, id, b) {
  if (!eu.gestor) erro('Só administrador ou gestor pode fixar recado.', 403);
  await recadoAtivo(env, id);
  const fixado = b.fixado === true ? 1 : 0;
  await env.DB.prepare('UPDATE mural_recados SET fixado = ? WHERE id = ?').bind(fixado, id).run();
  await registrar(env, eu, fixado ? 'recado.fixar' : 'recado.desafixar', id);
  return { ok: true, fixado: !!fixado };
}
async function curtirRecado(env, eu, id) {
  await recadoAtivo(env, id);
  const db = env.DB;
  const ja = await db.prepare('SELECT 1 FROM mural_curtidas WHERE recado_id = ? AND username = ?').bind(id, eu.username).first();
  if (ja) await db.prepare('DELETE FROM mural_curtidas WHERE recado_id = ? AND username = ?').bind(id, eu.username).run();
  else await db.prepare('INSERT OR IGNORE INTO mural_curtidas (recado_id, username, nome, criado_em) VALUES (?,?,?,?)').bind(id, eu.username, eu.nome, agoraIso()).run();
  const t = await db.prepare('SELECT COUNT(*) n FROM mural_curtidas WHERE recado_id = ?').bind(id).first();
  return { ok: true, curtido: !ja, total: t?.n || 0 };
}
async function responderRecado(env, eu, id, b) {
  await recadoAtivo(env, id);
  const texto = limpar(b.texto, LIMITES.resposta);
  if (texto.length < 1) erro('Escreva a resposta.');
  const rid = novoId();
  await env.DB.prepare('INSERT INTO mural_respostas (id, recado_id, autor_username, autor_nome, texto, criado_em) VALUES (?,?,?,?,?,?)')
    .bind(rid, id, eu.username, eu.nome, texto, agoraIso()).run();
  return { ok: true, id: rid };
}
async function excluirResposta(env, eu, id) {
  const r = await env.DB.prepare('SELECT autor_username FROM mural_respostas WHERE id = ? AND excluido_em IS NULL').bind(id).first();
  if (!r) erro('Essa resposta não existe mais.', 404);
  if (r.autor_username !== eu.username && !eu.admin) erro('Só quem escreveu ou o administrador pode apagar esta resposta.', 403);
  await env.DB.prepare('UPDATE mural_respostas SET excluido_em = ? WHERE id = ?').bind(agoraIso(), id).run();
  await registrar(env, eu, 'resposta.excluir', id);
  return { ok: true };
}

// ================================================================ ELOGIOS
async function criarElogio(env, eu, b) {
  const para = limpar(b.para, LIMITES.nome);
  const texto = limpar(b.texto, LIMITES.elogio);
  if (!para) erro('Escolha o colega.');
  if (texto.length < 5) erro('Conte em poucas palavras o que a pessoa fez.');
  if (para.toLowerCase() === eu.nome.toLowerCase()) erro('O elogio é para um colega, não para você.');
  const id = novoId();
  await env.DB.prepare('INSERT INTO mural_elogios (id, de_username, de_nome, para_nome, texto, criado_em) VALUES (?,?,?,?,?,?)')
    .bind(id, eu.username, eu.nome, para, texto, agoraIso()).run();
  await registrar(env, eu, 'elogio.criar', id, para);
  return { ok: true, id };
}
async function excluirElogio(env, eu, id) {
  const r = await env.DB.prepare('SELECT de_username FROM mural_elogios WHERE id = ? AND excluido_em IS NULL').bind(id).first();
  if (!r) erro('Esse elogio não existe mais.', 404);
  if (r.de_username !== eu.username && !eu.admin) erro('Só quem escreveu ou o administrador pode apagar este elogio.', 403);
  await env.DB.prepare('UPDATE mural_elogios SET excluido_em = ? WHERE id = ?').bind(agoraIso(), id).run();
  await registrar(env, eu, 'elogio.excluir', id);
  return { ok: true };
}

// ================================================================ ANIVERSARIOS
async function salvarAniversarios(env, eu, b) {
  if (!eu.admin) erro('Só o administrador edita os aniversários.', 403);
  const lista = Array.isArray(b.lista) ? b.lista : null;
  if (!lista) erro('Lista inválida.');
  if (lista.length > 200) erro('Máximo de 200 pessoas.');
  const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const vistos = new Set();
  const linhas = lista.map((p, i) => {
    const nome = limpar(p?.nome, LIMITES.nome);
    const dia = Number(p?.dia), mes = Number(p?.mes);
    if (!nome || !(mes >= 1 && mes <= 12) || !(dia >= 1 && dia <= DIAS_MES[mes - 1])) erro(`Linha ${i + 1}: confira nome, dia e mês.`);
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) erro(`Linha ${i + 1}: ${nome} aparece duas vezes.`);
    vistos.add(chave);
    return { nome, dia, mes };
  });
  const db = env.DB, quando = agoraIso();
  const stmts = [db.prepare('DELETE FROM equipe_aniversarios')];
  for (const l of linhas) {
    stmts.push(db.prepare('INSERT INTO equipe_aniversarios (id, nome, dia, mes, atualizado_em, atualizado_por) VALUES (?,?,?,?,?,?)')
      .bind(novoId(), l.nome, l.dia, l.mes, quando, eu.username));
  }
  await db.batch(stmts);                                   // batch = transacao unica no D1
  await registrar(env, eu, 'aniversarios.salvar', null, `${linhas.length} pessoas`);
  return { ok: true, total: linhas.length };
}

// ================================================================ AGENDA
async function criarEvento(env, eu, b) {
  if (!eu.gestor) erro('Só administrador ou gestor cuida da agenda.', 403);
  const data = limpar(b.data, 10);
  const titulo = limpar(b.titulo, LIMITES.titulo);
  const descricao = limpar(b.descricao, LIMITES.descricao);
  const tipo = b.tipo === 'feriado' ? 'feriado' : 'interno';
  const diaUtil = tipo === 'feriado' ? (b.diaUtil === true ? 1 : 0) : 1;
  if (!dataValida(data)) erro('Informe uma data válida.');
  if (titulo.length < 3) erro('Dê um título ao evento.');
  const id = novoId();
  await env.DB.prepare('INSERT INTO agenda_eventos (id, data, titulo, descricao, tipo, dia_util, criado_por, criado_em) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, data, titulo, descricao, tipo, diaUtil, eu.username, agoraIso()).run();
  await registrar(env, eu, 'agenda.criar', id, `${data} ${titulo}`);
  return { ok: true, id };
}
async function excluirEvento(env, eu, id) {
  if (!eu.gestor) erro('Só administrador ou gestor cuida da agenda.', 403);
  const r = await env.DB.prepare('SELECT id FROM agenda_eventos WHERE id = ? AND excluido_em IS NULL').bind(id).first();
  if (!r) erro('Esse evento não existe mais.', 404);
  await env.DB.prepare('UPDATE agenda_eventos SET excluido_em = ? WHERE id = ?').bind(agoraIso(), id).run();
  await registrar(env, eu, 'agenda.excluir', id);
  return { ok: true };
}

// ================================================================ ROTEADOR
async function rotear(request, env) {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const p = url.pathname.replace(/\/+$/, '');

  if (p === '/health' && m === 'GET') return json({ ok: true, service: 'agf-mural-api', versao: VERSAO });

  const eu = perfil(await usuarioDaSessao(request, env));

  if (p === '/api/mural/painel' && m === 'GET') return json(await painel(env, eu));
  if (p === '/api/mural/recados' && m === 'POST') return json(await criarRecado(env, eu, await corpo(request)), 201);
  if (p === '/api/mural/elogios' && m === 'POST') return json(await criarElogio(env, eu, await corpo(request)), 201);
  if (p === '/api/mural/aniversarios' && m === 'PUT') return json(await salvarAniversarios(env, eu, await corpo(request)));
  if (p === '/api/mural/agenda' && m === 'POST') return json(await criarEvento(env, eu, await corpo(request)), 201);

  let r = p.match(/^\/api\/mural\/recados\/([0-9a-f-]{36})\/(excluir|fixar|curtir|respostas)$/);
  if (r && m === 'POST') {
    const [, id, acao] = r;
    if (acao === 'excluir') return json(await excluirRecado(env, eu, id));
    if (acao === 'fixar') return json(await fixarRecado(env, eu, id, await corpo(request)));
    if (acao === 'curtir') return json(await curtirRecado(env, eu, id));
    if (acao === 'respostas') return json(await responderRecado(env, eu, id, await corpo(request)), 201);
  }
  r = p.match(/^\/api\/mural\/(respostas|elogios|agenda)\/([0-9a-z-]{8,40})\/excluir$/);
  if (r && m === 'POST') {
    const [, tipo, id] = r;
    if (tipo === 'respostas') return json(await excluirResposta(env, eu, id));
    if (tipo === 'elogios') return json(await excluirElogio(env, eu, id));
    if (tipo === 'agenda') return json(await excluirEvento(env, eu, id));
  }
  return json({ ok: false, error: 'Rota não encontrada.' }, 404);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    try {
      return comCors(await rotear(request, env), request, env);
    } catch (e) {
      const status = Number(e?.status || 500);
      if (status >= 500) console.error('[MURAL]', e?.message || String(e), e?.stack || '');
      return comCors(json({ ok: false, error: status >= 500 && !e?.status ? 'Não foi possível concluir agora. Tente de novo em instantes.' : String(e?.message || 'Erro inesperado.') }, status), request, env);
    }
  }
};

// exportado para testes
export const _interno = { hojeLocal, somarDias, limitesDoMesUtc, dataValida, limpar, perfil };
