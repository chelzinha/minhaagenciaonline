/**
 * Integracao com o CRM atual (Apps Script base-metro), autenticada por segredo compartilhado.
 *  - ponte-legado: recebe os IDs antigos do CRM com o nome e devolve/grava o cliente do Cadastro v2 correspondente.
 *  - exportar: entrega as metricas do CRM (crm_metricas) no formato da aba CLIENTES_MASTER,
 *    usando o ID antigo quando existe par (preserva cadastro manual, tratativas e agenda).
 *  - assinatura: resumo curto para o Apps Script saber se precisa reconstruir a CLIENTES_MASTER.
 */
import { chaveBase, analisarNome } from './motor.js';
import { emLotes } from './persistencia.js';

const limpar = (v) => String(v ?? '').trim();

export function segredoValido(request, env) {
  const esperado = limpar(env.CRM_EXPORT_SEGREDO);
  if (!esperado) return 'nao_configurado';
  const recebido = limpar(request.headers.get('X-AGF-Segredo'));
  if (recebido.length !== esperado.length) return 'invalido';
  let d = 0;
  for (let i = 0; i < esperado.length; i++) d |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return d === 0 ? 'ok' : 'invalido';
}

const nucleo = (nome) => { const p = analisarNome(nome); return p.compact.length >= 4 ? p.compact : ''; };

/** Indice nome -> clientes: grafias do cadastro + NOME REMETENTE das postagens (cobre clientes do Portal). */
async function indiceDeNomes(db) {
  const [grafias, remetentes, pesos] = await db.batch([
    db.prepare(`SELECT g.grafia nome, n.cliente_id FROM cid_grafias g JOIN cid_nos n ON n.chave = g.no_chave WHERE n.cliente_id IS NOT NULL`),
    db.prepare(`SELECT p.nome_remetente nome, n.cliente_id, COUNT(*) q FROM cid_postagens p
      JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia JOIN cid_nos n ON n.chave = g.no_chave
      WHERE n.cliente_id IS NOT NULL AND p.nome_remetente <> '' GROUP BY 1, 2`),
    db.prepare(`SELECT cliente_id, SUM(postagens) postagens FROM cid_resumo GROUP BY 1`),
  ]);
  const peso = new Map((pesos.results || []).map((x) => [x.cliente_id, Number(x.postagens || 0)]));
  const exato = new Map(), nuc = new Map();
  const add = (mapa, k, id, q) => { if (!k) return; if (!mapa.has(k)) mapa.set(k, new Map()); const m = mapa.get(k); m.set(id, (m.get(id) || 0) + q); };
  for (const x of grafias.results || []) { add(exato, chaveBase(x.nome), x.cliente_id, 1000); add(nuc, nucleo(x.nome), x.cliente_id, 1000); }
  for (const x of remetentes.results || []) { add(exato, chaveBase(x.nome), x.cliente_id, Number(x.q || 1)); add(nuc, nucleo(x.nome), x.cliente_id, Number(x.q || 1)); }
  return { exato, nuc, peso };
}

function melhor(candidatos, peso) {
  return [...candidatos.entries()].sort((a, b) => (b[1] - a[1]) || ((peso.get(b[0]) || 0) - (peso.get(a[0]) || 0)))[0][0];
}

export function casarNome(nome, idx) {
  const e = idx.exato.get(chaveBase(nome));
  if (e && e.size === 1) return { idNovo: [...e.keys()][0], metodo: 'NOME_EXATO' };
  if (e && e.size > 1) return { idNovo: melhor(e, idx.peso), metodo: 'AMBIGUO' };
  const n = idx.nuc.get(nucleo(nome));
  if (n && n.size === 1) return { idNovo: [...n.keys()][0], metodo: 'NOME_NUCLEO' };
  if (n && n.size > 1) return { idNovo: melhor(n, idx.peso), metodo: 'AMBIGUO' };
  return { idNovo: null, metodo: 'SEM_PAR' };
}

/** POST /api/v2/crm/ponte-legado  { itens: [{ idAntigo, nome, temDados }] }  (lotes de ate 2000) */
export async function ponteLegado(request, env) {
  let b; try { b = await request.json(); } catch { return { erro: 'JSON invalido.' }; }
  const itens = (Array.isArray(b.itens) ? b.itens : []).map((x) => ({ idAntigo: limpar(x.idAntigo), nome: limpar(x.nome).slice(0, 200), temDados: x.temDados ? 1 : 0 }))
    .filter((x) => /^[A-Za-z0-9_-]{3,40}$/.test(x.idAntigo));
  if (!itens.length) return { erro: 'Nenhum item valido.' };
  if (itens.length > 2000) return { erro: 'Envie no maximo 2000 itens por vez.' };
  // um ID antigo pode ter varios nomes (CLIENTES_ALIAS): vence o nome que casa melhor
  const idx = await indiceDeNomes(env.DB);
  const ordem = { NOME_EXATO: 3, NOME_NUCLEO: 2, AMBIGUO: 1, SEM_PAR: 0 };
  const porId = new Map();
  for (const it of itens) {
    const r = casarNome(it.nome, idx);
    const atual = porId.get(it.idAntigo);
    if (!atual || ordem[r.metodo] > ordem[atual.metodo]) porId.set(it.idAntigo, { ...it, ...r, temDados: Math.max(it.temDados, atual?.temDados || 0) });
    else atual.temDados = Math.max(atual.temDados, it.temDados);
  }
  const stmts = [...porId.values()].map((x) => env.DB.prepare(`INSERT INTO crm_id_legado(id_antigo, id_novo, metodo, tem_dados, nome) VALUES(?,?,?,?,?)
    ON CONFLICT(id_antigo) DO UPDATE SET id_novo=excluded.id_novo, metodo=excluded.metodo, tem_dados=MAX(crm_id_legado.tem_dados, excluded.tem_dados),
      nome=excluded.nome, atualizado_em=CURRENT_TIMESTAMP`).bind(x.idAntigo, x.idNovo, x.metodo, x.temDados, x.nome));
  stmts.push(env.DB.prepare(`UPDATE cid_estado SET valor='1' WHERE chave='crm_pendente'`));
  await emLotes(env.DB, stmts);
  const cont = {}; for (const x of porId.values()) cont[x.metodo] = (cont[x.metodo] || 0) + 1;
  return { recebidos: itens.length, idsAntigos: porId.size, porMetodo: cont };
}

/** Mapa cliente do Cadastro v2 -> ID antigo escolhido (com historico primeiro, depois o menor numero). */
export async function mapaLegado(db) {
  const [leg, fund] = await db.batch([
    db.prepare(`SELECT id_antigo, id_novo, tem_dados, metodo FROM crm_id_legado WHERE id_novo IS NOT NULL`),
    db.prepare(`SELECT id_antigo, id_novo FROM cid_ids_fundidos`),
  ]);
  const fundido = new Map((fund.results || []).map((x) => [x.id_antigo, x.id_novo]));
  const resolver = (id) => { let x = id; for (let i = 0; i < 6 && fundido.has(x); i++) x = fundido.get(x); return x; };
  const porNovo = new Map();
  for (const x of leg.results || []) {
    const novo = resolver(x.id_novo);
    if (!porNovo.has(novo)) porNovo.set(novo, []);
    porNovo.get(novo).push(x);
  }
  const escolha = new Map(), conflitos = [];
  for (const [novo, lista] of porNovo) {
    lista.sort((a, b) => (b.tem_dados - a.tem_dados) || a.id_antigo.localeCompare(b.id_antigo, 'en', { numeric: true }));
    escolha.set(novo, lista[0].id_antigo);
    if (lista.filter((x) => x.tem_dados).length > 1) conflitos.push({ idNovo: novo, idsAntigos: lista.filter((x) => x.tem_dados).map((x) => x.id_antigo) });
  }
  return { escolha, conflitos };
}

/** GET /api/v2/crm/exportar?pagina=1&por=500 */
export async function exportarMaster(url, env) {
  const por = Math.min(1000, Math.max(50, Number(url.searchParams.get('por')) || 500));
  const pagina = Math.max(1, Math.trunc(Number(url.searchParams.get('pagina')) || 1));
  const [lista, total, est] = await env.DB.batch([
    env.DB.prepare(`SELECT cliente_id, dados FROM crm_metricas ORDER BY cliente_id LIMIT ? OFFSET ?`).bind(por, (pagina - 1) * por),
    env.DB.prepare(`SELECT COUNT(*) n FROM crm_metricas`),
    env.DB.prepare(`SELECT valor FROM cid_estado WHERE chave='crm_ultimo'`),
  ]);
  const { escolha, conflitos } = await mapaLegado(env.DB);
  const linhas = (lista.results || []).map((x) => {
    const m = JSON.parse(x.dados);
    const legado = escolha.get(x.cliente_id) || '';
    return { ...m, CLIENTE_ID: legado || x.cliente_id, CLIENTE_ID_CADASTRO: x.cliente_id, ID_LEGADO: legado,
      NOME_REMETENTE_BASE: m.CLIENTE || '', LOCAL_PREDOMINANTE: m.LOCAL, RAZAO_SOCIAL_BASE: '' };
  });
  const n = total.results?.[0]?.n || 0;
  const ultimo = est.results?.[0]?.valor ? JSON.parse(est.results[0].valor) : null;
  return { linhas, pagina, por, total: n, paginas: Math.max(1, Math.ceil(n / por)), refDate: ultimo?.refDate || '', calculadoEm: ultimo?.em || '',
    conflitos: pagina === 1 ? conflitos : undefined };
}

/** GET /api/v2/crm/assinatura: muda sempre que o CRM recalcula ou a ponte de IDs muda. */
export async function assinaturaCrm(env) {
  const [est, leg] = await env.DB.batch([
    env.DB.prepare(`SELECT valor, atualizado_em FROM cid_estado WHERE chave='crm_ultimo'`),
    env.DB.prepare(`SELECT COUNT(*) n, MAX(atualizado_em) em FROM crm_id_legado`),
  ]);
  const u = est.results?.[0], l = leg.results?.[0] || {};
  const ultimo = u?.valor ? JSON.parse(u.valor) : {};
  return { assinatura: ['D1', ultimo.refDate || '', ultimo.clientes || 0, u?.atualizado_em || '', l.n || 0, l.em || ''].join('|'),
    refDate: ultimo.refDate || '', clientes: ultimo.clientes || 0, calculadoEm: u?.atualizado_em || '' };
}
