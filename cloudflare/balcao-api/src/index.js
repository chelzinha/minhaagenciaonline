/**
 * agf-balcao-api - Calculadora Balcao a vista (/balcao), Comparador (/comparador) e Simulador (/simulador)
 * Bindings: DB (agf-balcao), BROWSER (PDF do comparador), AGF_AUTH_API_URL, ALLOWED_ORIGINS, CEP_ORIGEM_PADRAO
 * Segredos (so para prazo e CEP): CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO, CORREIOS_CARTAO
 *
 * Rotas:
 *   GET  /api/balcao/saude            publica: versao, vigencia, prazo configurado (sem dados sensiveis)
 *   GET  /api/balcao/config           sessao
 *   GET  /api/balcao/cep?cep=         sessao
 *   POST /api/balcao/cotar            sessao  { cepOrigem, cepDestino, tipoObjeto, pesoG, ... }
 *   POST /api/balcao/rascunhos        sessao  { entrada, opcao, ficha }
 *   GET  /api/balcao/etiquetas?local= sessao  fila do dia (etiquetas digitadas pelo cliente)
 *   POST /api/balcao/etiquetas/status sessao  { id, status, sro? }
 *
 * Rotas públicas do /postar (sem login, com limite por IP):
 *   GET  /api/balcao/publico/config
 *   GET  /api/balcao/publico/cep?cep=
 *   POST /api/balcao/publico/cotar     { cepDestino, pesoG, alturaCm?, larguraCm?, comprimentoCm? }
 *   POST /api/balcao/publico/etiquetas { local, servico, cotacao, remetente, destinatario, aceite }
 *
 * Comparador de Tarifas (/comparador) - mesma base D1:
 *   GET  /api/comparador/config       sessao  pacotes de contrato, App, vigencias
 *   POST /api/comparador/lote         sessao  { linhas[], tabelaContrato, usarMini, incluirValorDeclarado } (ate 400 por chamada)
 *   POST /api/comparador/relatorio    sessao  { relatorio } -> HTML do estudo (impressao)
 *   POST /api/comparador/pdf          sessao  { relatorio } -> PDF (Browser Rendering) e registro em cmp_propostas
 *
 * Simulador de Frete (/simulador) - público, sem login, com limite por IP:
 *   GET  /api/simulador/config        UFs, tipos de cidade, zonas, caixas e pesos
 *   GET  /api/simulador/precos?c&l&a&p preço de todas as zonas para uma embalagem (cm e g)
 *   GET  /api/simulador/cep?cep=      cidade, UF, tipo e zona
 *
 * Agendamento diário: expira etiquetas de dias anteriores e apaga dados com mais de 30 dias.
 */
import { cotar } from './cotacao.js';
import { buscarCep } from './cep/cep.js';
import { carregarBase, PRECO_VERSAO } from './preco/preco-avista.js';
import { prazoConfigurado } from './prazo/prazo-correios.js';
import { salvarEtiquetaCliente, listarEtiquetas, mudarStatus, limpezaDiaria, LOCAIS } from './etiqueta/etiquetas.js';
import { hashIp, conferirLimite } from './limites.js';
import { calcularLote, catalogo } from './comparador/lote.js';
import { montarHtmlRelatorio, validarRelatorio } from './comparador/relatorio.js';
import { gerarPdf } from './comparador/pdf.js';
import { configSimulador, precosSimulador, cepSimulador } from './simulador/simulador.js';

const VERSAO = '2.3.1';

// ---------------------------------------------------------------- http
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const jsonCache = (data, segundos) => Response.json(data, { headers: { 'cache-control': `public, max-age=${segundos}` } });
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
/** Comparador: admin, ou app "intra" (gestão) ou "comparador" liberado. */
async function exigirComparador(request, env) {
  const u = await usuarioDaSessao(request, env);
  const apps = (Array.isArray(u.apps) ? u.apps : []).map((a) => String(a || '').trim().toLowerCase());
  if (String(u.role || '').toLowerCase() !== 'admin' && !apps.includes('intra') && !apps.includes('comparador')) erro('Acesso restrito ao Comparador.', 403);
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

/** Tipo do objeto aceito no /postar (o rolo cobra manuseio especial). */
export const tipoPublico = (v) => (['PACOTE', 'ENVELOPE', 'ROLO'].includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : 'PACOTE');

/** Rotas do /postar: sem login. Origem fixa da agência; o preço sempre é recalculado no servidor. */
async function rotearPublico(request, env, url, rota) {
  const ip = await hashIp(request, env);
  if (request.method === 'GET' && rota === '/api/balcao/publico/config') {
    const base = await carregarBase(env.DB);
    return json({ ok: true, data: { versao: VERSAO, vigencia: base.vigencia, locais: LOCAIS, prazoConfigurado: prazoConfigurado(env) } });
  }
  if (request.method === 'GET' && rota === '/api/balcao/publico/cep') {
    await conferirLimite(env, 'cep', ip);
    return json({ ok: true, data: await buscarCep(env, url.searchParams.get('cep')) });
  }
  if (request.method === 'POST' && rota === '/api/balcao/publico/cotar') {
    await conferirLimite(env, 'cotar', ip);
    const p = await corpo(request);
    const r = await cotar(env, {
      cepOrigem: env.CEP_ORIGEM_PADRAO || '60055974', cepDestino: p.cepDestino, tipoObjeto: tipoPublico(p.tipoObjeto),
      pesoG: p.pesoG, alturaCm: p.alturaCm, larguraCm: p.larguraCm, comprimentoCm: p.comprimentoCm,
    }, { exigirDimensoes: false });
    return json({ ok: true, data: { destino: { cidade: r.destino.municipio, uf: r.destino.uf, cep: r.destino.cep }, pesoTarifadoG: r.entrada.pesoTarifadoG,
      opcoes: r.opcoes.map((o) => ({ ok: o.ok, codigoServico: o.codigoServico, nome: o.nome, total: o.total, prazoDias: o.prazoDias, erro: o.erro })) } });
  }
  if (request.method === 'POST' && rota === '/api/balcao/publico/etiquetas') {
    await conferirLimite(env, 'salvar', ip);
    return json({ ok: true, data: await salvarEtiquetaCliente(env, await corpo(request), ip) });
  }
  return erro('Rota não encontrada.', 404);
}

/** Rotas do /simulador: sem login, só leitura do D1 (e busca de CEP). */
async function rotearSimulador(request, env, url, rota) {
  if (request.method !== 'GET') return erro('Rota não encontrada.', 404);
  const ip = await hashIp(request, env);
  if (rota === '/api/simulador/config') return jsonCache({ ok: true, data: await configSimulador(env) }, 600);
  if (rota === '/api/simulador/precos') {
    await conferirLimite(env, 'simular', ip);
    return jsonCache({ ok: true, data: await precosSimulador(env, Object.fromEntries(url.searchParams)) }, 600);
  }
  if (rota === '/api/simulador/cep') {
    await conferirLimite(env, 'cep', ip);
    return json({ ok: true, data: await cepSimulador(env, buscarCep, url.searchParams.get('cep')) });
  }
  return erro('Rota não encontrada.', 404);
}

async function salvarProposta(env, usuario, r) {
  const id = 'CMP-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  const ref = r.totais[r.referencia];
  const prop = Math.min(...r.cenarios.filter((c) => c !== r.referencia).map((c) => r.totais[c]));
  try {
    await env.DB.prepare(`INSERT INTO cmp_propostas (id, usuario, cliente, cenarios, referencia, postagens, total_referencia, total_proposta, payload_json)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
      .bind(id, String(usuario.username || usuario.displayName || ''), r.cliente, r.cenarios.join(','), r.referencia, r.postagens,
        ref, prop, JSON.stringify(r).slice(0, 60000)).run();
  } catch (e) { console.warn('[COMPARADOR][proposta]', e.message); }
  return id;
}

function nomeArquivo(cliente) {
  const base = String(cliente || 'cliente').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return 'Estudo_de_frete_' + (base || 'cliente') + '.pdf';
}

async function rotearComparador(request, env, rota) {
  const usuario = await exigirComparador(request, env);
  if (request.method === 'GET' && rota === '/api/comparador/config') return json({ ok: true, data: await catalogo(env) });
  if (request.method === 'POST' && rota === '/api/comparador/lote') {
    const p = await corpo(request);
    return json({ ok: true, data: await calcularLote(env, p.payload || p) });
  }
  if (request.method === 'POST' && rota === '/api/comparador/relatorio') {
    const p = await corpo(request);
    return new Response(montarHtmlRelatorio(p.relatorio || p), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (request.method === 'POST' && rota === '/api/comparador/pdf') {
    const p = await corpo(request);
    const r = validarRelatorio(p.relatorio || p);
    const pdf = await gerarPdf(env, montarHtmlRelatorio(r));
    const id = await salvarProposta(env, usuario, r);
    return new Response(pdf, { headers: {
      'content-type': 'application/pdf', 'cache-control': 'no-store', 'x-proposta-id': id,
      'content-disposition': 'attachment; filename="' + nomeArquivo(r.cliente) + '"',
      'access-control-expose-headers': 'content-disposition, x-proposta-id',
    } });
  }
  return erro('Rota não encontrada.', 404);
}

async function rotear(request, env) {
  const url = new URL(request.url);
  const rota = url.pathname.replace(/\/+$/, '');
  if (request.method === 'GET' && rota === '/api/balcao/saude') return json(await saude(env));

  if (rota.startsWith('/api/balcao/publico/')) return rotearPublico(request, env, url, rota);
  if (rota.startsWith('/api/simulador/')) return rotearSimulador(request, env, url, rota);
  if (rota.startsWith('/api/comparador/')) return rotearComparador(request, env, rota);

  const usuario = await exigirBalcao(request, env);
  if (request.method === 'GET' && rota === '/api/balcao/etiquetas') return json({ ok: true, data: await listarEtiquetas(env, url.searchParams.get('local')) });
  if (request.method === 'POST' && rota === '/api/balcao/etiquetas/status') return json({ ok: true, data: await mudarStatus(env, usuario, await corpo(request)) });
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
      resp = json({ ok: false, erro: status === 500 ? 'Erro interno. Tente de novo.' : e.message, campos: e.campos, campo: e.campo, etiqueta: e.etiqueta, codigo: e.code || undefined }, status);
    }
    return comCors(resp, request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(limpezaDiaria(env).catch((e) => console.error('[BALCAO][limpeza] falhou:', e.message)));
  },
};
