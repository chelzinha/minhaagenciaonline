/**
 * agf-balcao-api - Calculadora Balcao a vista (/balcao)
 * Bindings: DB (agf-balcao), AGF_AUTH_API_URL, ALLOWED_ORIGINS, CEP_ORIGEM_PADRAO
 * Segredos (so para prazo e CEP): CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO, CORREIOS_CARTAO
 *
 * Rotas:
 *   GET  /api/balcao/saude            publica: versao, vigencia, prazo configurado (sem dados sensiveis)
 *   GET  /api/balcao/config           sessao
 *   GET  /api/balcao/cep?cep=         sessao
 *   POST /api/balcao/cotar            sessao  { cepOrigem, cepDestino, tipoObjeto, pesoG, ... }
 *   POST /api/balcao/rascunhos        sessao  { entrada, opcao, ficha }
 */
import { cotar } from './cotacao.js';
import { buscarCep } from './cep/cep.js';
import { carregarBase, PRECO_VERSAO } from './preco/preco-avista.js';
import { prazoConfigurado } from './prazo/prazo-correios.js';

const VERSAO = '2.0.0';

// ---------------------------------------------------------------- http
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const erro = (mensagem, status = 400) => { throw Object.assign(new Error(mensagem), { status }); };

function origemPermitida(request, env) {
  const origin = request.headers.get('Origin') || '';
  const lista = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return lista.includes(origin) ? origin : '';
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
async function corpo(request) { try { return await request.json(); } catch { return erro('JSON inválido.'); } }

// ---------------------------------------------------------------- sessao (mesmo padrao do agf-cadastros-api)
const SESSAO_TTL_MS = 5 * 60 * 1000;
const sessoes = new Map();

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
  if (!token) erro('Faça login para continuar.', 401);
  if (!env.AGF_AUTH_API_URL) erro('Validação de sessão não configurada.', 503);
  const h = await hashToken(token);
  const agora = Date.now();
  const mem = sessoes.get(h);
  if (mem && mem.ate > agora) return mem.user;
  const cacheKey = new Request(`https://sessao.agf-balcao.local/${h}`);
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
  erro('Sessão inválida.', 401);
}
/** Mesma regra do controle de acesso da pagina: app "balcao" liberado (admin sempre passa). */
async function exigirBalcao(request, env) {
  const u = await usuarioDaSessao(request, env);
  const apps = (Array.isArray(u.apps) ? u.apps : []).map((a) => String(a || '').trim().toLowerCase());
  if (String(u.role || '').toLowerCase() !== 'admin' && !apps.includes('balcao')) erro('Acesso restrito ao Balcão.', 403);
  return u;
}

// ---------------------------------------------------------------- handlers
async function saude(env) {
  let vigencia = '', tarifas = 0;
  try {
    const r = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM balcao_tarifas) n, (SELECT MAX(vigencia) FROM balcao_servicos) v').first();
    tarifas = Number(r?.n || 0); vigencia = r?.v || '';
  } catch (e) { console.warn('[BALCAO][saude]', e.message); }
  return { ok: tarifas > 0, versao: VERSAO, preco: PRECO_VERSAO, vigencia, tarifas, prazoConfigurado: prazoConfigurado(env) };
}

async function config(env) {
  const base = await carregarBase(env.DB);
  const cepPadrao = String(env.CEP_ORIGEM_PADRAO || '60055974');
  let origem = { cep: cepPadrao, municipio: 'Fortaleza', uf: 'CE' };
  try { origem = await buscarCep(env, cepPadrao); } catch (_) { /* usa o padrao */ }
  return {
    version: VERSAO,
    cepOrigemDefault: origem.cep, cidadeOrigemDefault: origem.municipio, ufOrigemDefault: origem.uf,
    vigencia: base.vigencia,
    servicos: base.servicos.map((s) => ({ chave: s.chave, codigoServico: s.codigo, nome: s.nome, limitePesoG: Number(s.limite_peso_g) })),
    apiPrazoConfigurada: prazoConfigurado(env),
  };
}

async function salvarRascunho(env, usuario, p) {
  const opcao = p.opcao || {};
  const entrada = p.entrada || {};
  if (!opcao.codigoServico) erro('Selecione uma opção de serviço antes.');
  const id = 'BALCAO-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  await env.DB.prepare(`INSERT INTO balcao_rascunhos (id, usuario, cep_destino, servico, total, prazo_dias, payload_json)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(id, String(usuario.username || usuario.displayName || ''), String(entrada.cepDestino || ''), String(opcao.codigoServico),
      Number(opcao.total) || 0, Number(opcao.prazoDias) || null, JSON.stringify(p).slice(0, 50000)).run();
  return { id, message: 'Rascunho salvo.' };
}

async function rotear(request, env) {
  const url = new URL(request.url);
  const rota = url.pathname.replace(/\/+$/, '');
  if (request.method === 'GET' && rota === '/api/balcao/saude') return json(await saude(env));

  const usuario = await exigirBalcao(request, env);
  if (request.method === 'GET' && rota === '/api/balcao/config') return json({ ok: true, data: await config(env) });
  if (request.method === 'GET' && rota === '/api/balcao/cep') return json({ ok: true, data: await buscarCep(env, url.searchParams.get('cep')) });
  if (request.method === 'POST' && rota === '/api/balcao/cotar') {
    const p = await corpo(request);
    return json({ ok: true, data: await cotar(env, p.payload || p) });
  }
  if (request.method === 'POST' && rota === '/api/balcao/rascunhos') {
    const p = await corpo(request);
    return json({ ok: true, data: await salvarRascunho(env, usuario, p.payload || p) });
  }
  return erro('Rota não encontrada.', 404);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    let resp;
    try {
      resp = await rotear(request, env);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      if (status >= 500) console.error('[BALCAO][erro]', e.stack || e.message);
      resp = json({ ok: false, erro: status === 500 ? 'Erro interno ao calcular. Tente de novo.' : e.message }, status);
    }
    return comCors(resp, request, env);
  },
};
