/**
 * Revisor automatico sobre o D1: le cid_sugestoes, decide os casos seguros (revisor.js) e grava UNIR em cid_decisoes
 * com autor REVISOR_AUTO. Nao repete decisao ja existente e respeita qualquer SEPARAR entre os dois clientes.
 * Desfazer: UPDATE cid_decisoes SET ativo=0 WHERE autor='REVISOR_AUTO' (e rodar a limpeza).
 */
import { revisar, REVISOR_VERSAO, REVISOR_AUTOR } from './revisor.js';
import { emLotes } from './persistencia.js';

async function emPartes(db, sql, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 90) {
    const lote = ids.slice(i, i + 90);
    const r = await db.prepare(sql.replace('$IDS', lote.map(() => '?').join(','))).bind(...lote).all();
    out.push(...(r.results || []));
  }
  return out;
}

export async function revisarD1(env) {
  const db = env.DB, t0 = Date.now();
  const pares = (await db.prepare(`SELECT cliente_a, cliente_b, motivo FROM cid_sugestoes`).all()).results || [];
  const resumo = { versao: REVISOR_VERSAO, pares: pares.length, unidos: 0, porRegra: {}, em: new Date().toISOString() };
  if (pares.length) {
    const ids = [...new Set(pares.flatMap((x) => [x.cliente_a, x.cliente_b]))];
    const clientes = await emPartes(db, `SELECT c.id, c.nome, (c.portal_chave IS NOT NULL) eh_portal,
      COALESCE((SELECT SUM(r.postagens) FROM cid_resumo r WHERE r.cliente_id = c.id), 0) postagens FROM cid_clientes c WHERE c.id IN ($IDS)`, ids);
    const info = new Map(clientes.map((c) => [c.id, c]));
    const todos = (await db.prepare(`SELECT id, nome FROM cid_clientes`).all()).results || [];
    const decisoes = revisar(pares, info, todos);
    if (decisoes.length) {
      const nos = await emPartes(db, `SELECT cliente_id, chave, tipo FROM cid_nos WHERE cliente_id IN ($IDS)`, ids);
      const chaveDe = new Map(), clienteDaChave = new Map();
      for (const n of nos) {
        clienteDaChave.set(n.chave, n.cliente_id);
        if (!chaveDe.has(n.cliente_id) || n.tipo === 'P') chaveDe.set(n.cliente_id, n.chave);
      }
      const ativas = (await db.prepare(`SELECT tipo, chave_a, chave_b FROM cid_decisoes WHERE ativo = 1 AND tipo IN ('UNIR','SEPARAR')`).all()).results || [];
      const par = (a, b) => [a, b].sort().join('|');
      const separados = new Set(), unidos = new Set();
      for (const d of ativas) {
        const ca = clienteDaChave.get(d.chave_a), cb = clienteDaChave.get(d.chave_b);
        if (d.tipo === 'SEPARAR' && ca && cb) separados.add(par(ca, cb));
        if (d.tipo === 'UNIR') unidos.add(par(d.chave_a, d.chave_b));
      }
      const stmts = [];
      for (const d of decisoes) {
        const ka = chaveDe.get(d.destino), kb = chaveDe.get(d.outro);
        if (!ka || !kb || separados.has(par(d.destino, d.outro)) || unidos.has(par(ka, kb))) continue;
        unidos.add(par(ka, kb));
        stmts.push(db.prepare(`INSERT INTO cid_decisoes(tipo, chave_a, chave_b, autor) VALUES('UNIR', ?, ?, ?)`).bind(ka, kb, REVISOR_AUTOR));
        resumo.porRegra[d.regra] = (resumo.porRegra[d.regra] || 0) + 1;
      }
      resumo.unidos = stmts.length;
      if (stmts.length) await emLotes(db, stmts);
    }
  }
  resumo.ms = Date.now() - t0;
  await db.batch([
    db.prepare(`INSERT INTO cid_estado(chave, valor) VALUES('revisor_versao', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP`).bind(REVISOR_VERSAO),
    db.prepare(`INSERT INTO cid_estado(chave, valor) VALUES('revisor_ultimo', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP`).bind(JSON.stringify(resumo)),
  ]);
  return resumo;
}

export { REVISOR_VERSAO };
