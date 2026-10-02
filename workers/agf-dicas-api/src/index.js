/* ============================================================================
   agf-dicas-api - backend da Vitrine do Lojista (/dicas)
   Cloudflare Worker + D1 (binding DB)

   Público
     GET  /api/saude
     GET  /api/catalogo                 categorias + produtos ativos (cache 2 min)
     POST /api/clique/:id               contador de cliques (sendBeacon)
   Admin (Authorization: Bearer ADMIN_TOKEN)
     GET  /api/admin/status
     GET  /api/admin/catalogo           tudo, inclusive inativos, com cliques
     POST /api/admin/produtos           cria produto
     PUT  /api/admin/produtos/:id       edita produto (parcial)
     DEL  /api/admin/produtos/:id       exclui produto
     POST /api/admin/categorias         cria categoria
     PUT  /api/admin/categorias/:id     edita categoria
     DEL  /api/admin/categorias/:id     exclui categoria vazia

   Links de compra são genéricos: qualquer endereço https (loja, marketplace,
   site do fabricante ou link de parceria).

   Segredo (wrangler secret put):
     ADMIN_TOKEN       obrigatório
   ========================================================================== */

/* ================================================================ 1. CFG */
const CFG = Object.freeze({
  CACHE_TTL_S: 120,
  TZ_OFFSET_H: -3,
  ORIGENS_PADRAO: [
    'https://minhaagenciaonline.com.br',
    'https://www.minhaagenciaonline.com.br',
    'http://localhost:8788',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
  ],
  LOG: '[agf-dicas-api]'
});

/* ============================================================ 2. HELPERS */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function origensPermitidas(env) {
  const extra = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return CFG.ORIGENS_PADRAO.concat(extra);
}

function corsHeaders(req, env, publico) {
  const origin = req.headers.get('Origin') || '';
  const ok = origensPermitidas(env).includes(origin) || /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev$/.test(origin);
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (publico) h['Access-Control-Allow-Origin'] = '*';
  else if (ok) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {})
  });
}

async function lerJson(req) {
  try { return await req.json(); } catch (e) { throw new HttpError(400, 'JSON inválido no corpo da requisição.'); }
}

function texto(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

function numeroOuNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function urlHttps(v, obrigatorio, campo) {
  const s = texto(v, 2000);
  if (!s) { if (obrigatorio) throw new HttpError(400, `Informe ${campo}.`); return ''; }
  let u;
  try { u = new URL(s); } catch (e) { throw new HttpError(400, `${campo} não é um endereço válido.`); }
  if (u.protocol !== 'https:') throw new HttpError(400, `${campo} precisa começar com https://`);
  return u.toString();
}

function dominioLink(link) {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

function hojeBR() {
  const d = new Date(Date.now() + CFG.TZ_OFFSET_H * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function diaBR(offsetDias) {
  const d = new Date(Date.now() + CFG.TZ_OFFSET_H * 3600 * 1000 - offsetDias * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

function exigirAdmin(req, env) {
  const esperado = String(env.ADMIN_TOKEN || '');
  if (esperado.length < 16) throw new HttpError(503, 'ADMIN_TOKEN não configurado no Worker.');
  const h = req.headers.get('Authorization') || '';
  const recebido = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(esperado);
  const igual = a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
  if (!igual) throw new HttpError(401, 'Chave de administração inválida.');
}

/* ======================================================= 3. MAPEAMENTO */
function mapCategoria(r) {
  return { id: r.id, nome: r.nome, descricao: r.descricao, icone: r.icone, cor: r.cor, ordem: r.ordem, ativo: r.ativo };
}

function mapProduto(r, admin) {
  const p = {
    id: r.id,
    categoriaId: r.categoria_id,
    titulo: r.titulo,
    dica: r.dica,
    imagemUrl: r.imagem_url,
    icone: r.icone || '',
    link: r.link,
    precoMin: r.preco_min,
    precoMax: r.preco_max,
    avaliacao: r.avaliacao,
    vendas: r.vendas,
    loja: r.loja,
    destaque: r.destaque,
    ordem: r.ordem,
    origem: r.origem,
    atualizadoEm: r.atualizado_em
  };
  if (admin) {
    p.ativo = r.ativo;
    p.cliques = r.cliques;
    p.cliques7d = r.cliques7d || 0;
    p.dominio = dominioLink(r.link);
  }
  return p;
}

/* ===================================================== 4. REPOSITÓRIO */
async function listarCatalogo(env, admin) {
  const filtroCat = admin ? '' : 'WHERE ativo = 1';
  const filtroProd = admin ? '' : 'WHERE p.ativo = 1';
  const cliques7d = admin
    ? `, (SELECT COALESCE(SUM(total),0) FROM cliques_dia c WHERE c.produto_id = p.id AND c.dia >= ?1) AS cliques7d`
    : '';
  const stmtProd = env.DB.prepare(`SELECT p.*${cliques7d} FROM produtos p ${filtroProd} ORDER BY p.categoria_id, p.ordem, p.id`);
  const [cats, prods] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM categorias ${filtroCat} ORDER BY ordem, nome`),
    admin ? stmtProd.bind(diaBR(6)) : stmtProd
  ]);
  const categorias = cats.results.map(mapCategoria);
  const ativas = new Set(categorias.filter(c => admin || c.ativo).map(c => c.id));
  const produtos = prods.results.filter(r => admin || ativas.has(r.categoria_id)).map(r => mapProduto(r, admin));
  const versao = produtos.reduce((m, p) => (p.atualizadoEm > m ? p.atualizadoEm : m), '');
  return { ok: true, versao, geradoEm: new Date().toISOString(), categorias, produtos };
}

async function categoriaExiste(env, id) {
  const r = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?1').bind(id).first();
  return Boolean(r);
}

function validarProduto(body, parcial) {
  const out = {};
  const tem = k => Object.prototype.hasOwnProperty.call(body, k);
  if (!parcial || tem('titulo')) {
    out.titulo = texto(body.titulo, 160);
    if (out.titulo.length < 3) throw new HttpError(400, 'O título precisa ter pelo menos 3 caracteres.');
  }
  if (!parcial || tem('categoriaId')) {
    out.categoria_id = texto(body.categoriaId, 40);
    if (!out.categoria_id) throw new HttpError(400, 'Escolha uma categoria.');
  }
  if (!parcial || tem('link')) out.link = urlHttps(body.link, true, 'o link do produto');
  if (tem('imagemUrl')) out.imagem_url = urlHttps(body.imagemUrl, false, 'o link da imagem');
  if (tem('dica')) out.dica = texto(body.dica, 400);
  if (tem('icone')) out.icone = texto(body.icone, 40).replace(/[^a-z0-9_]/g, '');
  if (tem('loja')) out.loja = texto(body.loja, 120);
  if (tem('precoMin')) out.preco_min = numeroOuNull(body.precoMin);
  if (tem('precoMax')) out.preco_max = numeroOuNull(body.precoMax);
  if (tem('avaliacao')) { const a = numeroOuNull(body.avaliacao); out.avaliacao = a === null ? null : Math.min(a, 5); }
  if (tem('vendas')) { const v = numeroOuNull(body.vendas); out.vendas = v === null ? null : Math.round(v); }
  if (tem('destaque')) out.destaque = body.destaque ? 1 : 0;
  if (tem('ativo')) out.ativo = body.ativo ? 1 : 0;
  if (tem('ordem')) { const o = numeroOuNull(body.ordem); out.ordem = o === null ? 100 : Math.round(o); }
  if (tem('origem')) out.origem = ['manual', 'busca'].includes(body.origem) ? body.origem : 'manual';
  if (out.preco_min !== undefined && out.preco_max !== undefined && out.preco_min !== null && out.preco_max !== null && out.preco_max < out.preco_min) {
    throw new HttpError(400, 'O preço máximo não pode ser menor que o mínimo.');
  }
  return out;
}

async function inserirProduto(env, dados) {
  if (!(await categoriaExiste(env, dados.categoria_id))) throw new HttpError(400, 'Categoria inexistente.');
  const cols = Object.keys(dados);
  const sql = `INSERT INTO produtos (${cols.join(',')}) VALUES (${cols.map((_, i) => '?' + (i + 1)).join(',')}) RETURNING *`;
  const r = await env.DB.prepare(sql).bind(...cols.map(c => dados[c])).first();
  return mapProduto(r, true);
}

async function atualizarProduto(env, id, dados) {
  if (dados.categoria_id && !(await categoriaExiste(env, dados.categoria_id))) throw new HttpError(400, 'Categoria inexistente.');
  const cols = Object.keys(dados);
  if (!cols.length) throw new HttpError(400, 'Nada para atualizar.');
  const sets = cols.map((c, i) => `${c} = ?${i + 1}`).join(', ');
  const sql = `UPDATE produtos SET ${sets}, atualizado_em = datetime('now') WHERE id = ?${cols.length + 1} RETURNING *`;
  const r = await env.DB.prepare(sql).bind(...cols.map(c => dados[c]), id).first();
  if (!r) throw new HttpError(404, 'Produto não encontrado.');
  return mapProduto(r, true);
}

function validarCategoria(body, parcial) {
  const out = {};
  const tem = k => Object.prototype.hasOwnProperty.call(body, k);
  if (!parcial) {
    out.id = texto(body.id, 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!out.id) throw new HttpError(400, 'Informe o identificador da categoria (ex.: sacolas).');
  }
  if (!parcial || tem('nome')) {
    out.nome = texto(body.nome, 60);
    if (out.nome.length < 2) throw new HttpError(400, 'Informe o nome da categoria.');
  }
  if (tem('descricao')) out.descricao = texto(body.descricao, 200);
  if (tem('icone')) out.icone = texto(body.icone, 40).replace(/[^a-z0-9_]/g, '') || 'sell';
  if (tem('cor')) { const c = texto(body.cor, 7); out.cor = /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#00416B'; }
  if (tem('ordem')) { const o = numeroOuNull(body.ordem); out.ordem = o === null ? 100 : Math.round(o); }
  if (tem('ativo')) out.ativo = body.ativo ? 1 : 0;
  return out;
}

/* ========================================================= 5. HANDLERS */
async function handleCatalogoPublico(req, env, ctx) {
  const cache = caches.default;
  const chave = new Request(new URL('/api/catalogo', req.url).toString(), { method: 'GET' });
  const hit = await cache.match(chave);
  if (hit) return hit;
  const dados = await listarCatalogo(env, false);
  const res = json(dados, 200, { 'Cache-Control': `public, max-age=${CFG.CACHE_TTL_S}` });
  ctx.waitUntil(cache.put(chave, res.clone()));
  return res;
}

async function limparCacheCatalogo(req) {
  try { await caches.default.delete(new Request(new URL('/api/catalogo', req.url).toString())); } catch (e) { /* cache por colo; TTL curto cobre */ }
}

async function handleClique(env, id) {
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, 'Produto inválido.');
  const dia = hojeBR();
  await env.DB.batch([
    env.DB.prepare('UPDATE produtos SET cliques = cliques + 1 WHERE id = ?1 AND ativo = 1').bind(pid),
    env.DB.prepare(`INSERT INTO cliques_dia (produto_id, dia, total) SELECT ?1, ?2, 1 WHERE EXISTS (SELECT 1 FROM produtos WHERE id = ?1 AND ativo = 1)
                    ON CONFLICT(produto_id, dia) DO UPDATE SET total = total + 1`).bind(pid, dia)
  ]);
  return json({ ok: true });
}

async function handleStatus(env) {
  const tot = await env.DB.prepare(
    `SELECT COUNT(*) AS produtos, COALESCE(SUM(ativo),0) AS ativos, COALESCE(SUM(cliques),0) AS cliques,
            COALESCE(SUM(CASE WHEN ativo = 1 AND imagem_url = '' THEN 1 ELSE 0 END),0) AS sem_foto,
            (SELECT COALESCE(SUM(total),0) FROM cliques_dia WHERE dia >= ?1) AS cliques7d
       FROM produtos`).bind(diaBR(6)).first();
  return json({
    ok: true,
    produtos: tot.produtos || 0,
    ativos: tot.ativos || 0,
    cliques: tot.cliques || 0,
    cliques7d: tot.cliques7d || 0,
    ativosSemFoto: tot.sem_foto || 0
  });
}

/* =========================================================== 6. ROUTER */
async function rotear(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;

  if (p === '/api/saude' && m === 'GET') return json({ ok: true, servico: 'agf-dicas-api' });
  if (p === '/api/catalogo' && m === 'GET') return handleCatalogoPublico(req, env, ctx);

  let r = p.match(/^\/api\/clique\/(\d+)$/);
  if (r && m === 'POST') return handleClique(env, r[1]);

  if (!p.startsWith('/api/admin/')) throw new HttpError(404, 'Rota não encontrada.');
  exigirAdmin(req, env);

  if (p === '/api/admin/status' && m === 'GET') return handleStatus(env);
  if (p === '/api/admin/catalogo' && m === 'GET') return json(await listarCatalogo(env, true));

  if (p === '/api/admin/produtos' && m === 'POST') {
    const dados = validarProduto(await lerJson(req), false);
    if (!dados.origem) dados.origem = 'manual';
    const prod = await inserirProduto(env, dados);
    await limparCacheCatalogo(req);
    return json({ ok: true, produto: prod }, 201);
  }
  r = p.match(/^\/api\/admin\/produtos\/(\d+)$/);
  if (r && m === 'PUT') {
    const prod = await atualizarProduto(env, Number(r[1]), validarProduto(await lerJson(req), true));
    await limparCacheCatalogo(req);
    return json({ ok: true, produto: prod });
  }
  if (r && m === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM cliques_dia WHERE produto_id = ?1').bind(Number(r[1])),
      env.DB.prepare('DELETE FROM produtos WHERE id = ?1').bind(Number(r[1]))
    ]);
    await limparCacheCatalogo(req);
    return json({ ok: true });
  }

  if (p === '/api/admin/categorias' && m === 'POST') {
    const d = validarCategoria(await lerJson(req), false);
    if (await categoriaExiste(env, d.id)) throw new HttpError(409, 'Já existe uma categoria com esse identificador.');
    const cols = Object.keys(d);
    const row = await env.DB.prepare(`INSERT INTO categorias (${cols.join(',')}) VALUES (${cols.map((_, i) => '?' + (i + 1)).join(',')}) RETURNING *`)
      .bind(...cols.map(c => d[c])).first();
    await limparCacheCatalogo(req);
    return json({ ok: true, categoria: mapCategoria(row) }, 201);
  }
  r = p.match(/^\/api\/admin\/categorias\/([a-z0-9-]+)$/);
  if (r && m === 'PUT') {
    const d = validarCategoria(await lerJson(req), true);
    const cols = Object.keys(d);
    if (!cols.length) throw new HttpError(400, 'Nada para atualizar.');
    const row = await env.DB.prepare(`UPDATE categorias SET ${cols.map((c, i) => `${c} = ?${i + 1}`).join(', ')} WHERE id = ?${cols.length + 1} RETURNING *`)
      .bind(...cols.map(c => d[c]), r[1]).first();
    if (!row) throw new HttpError(404, 'Categoria não encontrada.');
    await limparCacheCatalogo(req);
    return json({ ok: true, categoria: mapCategoria(row) });
  }
  if (r && m === 'DELETE') {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM produtos WHERE categoria_id = ?1').bind(r[1]).first();
    if (n && n.n > 0) throw new HttpError(409, `A categoria tem ${n.n} produto(s). Mova ou exclua os produtos antes.`);
    await env.DB.prepare('DELETE FROM categorias WHERE id = ?1').bind(r[1]).run();
    await limparCacheCatalogo(req);
    return json({ ok: true });
  }

  throw new HttpError(404, 'Rota não encontrada.');
}

/* ========================================================== 7. ENTRADA */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const publico = url.pathname === '/api/catalogo' || url.pathname.startsWith('/api/clique/') || url.pathname === '/api/saude';
    const cors = corsHeaders(req, env, publico);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      res = await rotear(req, env, ctx);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(CFG.LOG, req.method, url.pathname, e && e.stack || e);
      res = json({ ok: false, erro: status === 500 ? 'Erro interno. Tente de novo em instantes.' : e.message }, status);
    }
    const out = new Response(res.body, res);
    Object.keys(cors).forEach(k => out.headers.set(k, cors[k]));
    return out;
  }
};

