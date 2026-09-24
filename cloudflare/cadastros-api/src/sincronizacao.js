/**
 * Ponte Atende -> cid_postagens (somente leitura no Atende).
 * LOCAL efetivo = mesma prioridade do Atende:
 *   trava do Cliente Portal (exceto excecao da trava) > ajuste manual da postagem > local do atendente > atendente padrao > cliente (alias Atende)
 * Observacao: o Atende hoje usa duas variantes (tabela sem "atendente_local", dashboards sem "excecao da trava");
 * aqui as duas camadas sao consideradas, que e a regra completa.
 */
import { chaveBase, ORIGENS_COMPARTILHADAS } from './motor.js';
import { emLotes } from './persistencia.js';

const FEED_SQL = `
  SELECT r.id, COALESCE(r.nome_remetente,'') nome_remetente, COALESCE(cp.cliente_portal,'') cliente_portal,
    COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo END, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '') local_codigo,
    COALESCE(r.numero_contrato,'') contrato, COALESCE(r.cartao_postagem,'') cartao,
    COALESCE(r.data_postagem_iso,'') data_postagem, COALESCE(r.valor_atendimento_num,0) valor
  FROM atende_postagens_canonicas r
  LEFT JOIN atende_cliente_portal cp ON cp.raw_id = r.id
  LEFT JOIN atende_cliente_portal_local pcl ON pcl.cliente_portal_norm = cp.cliente_portal_norm AND pcl.ativo = 1
  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id
  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id
  LEFT JOIN atende_atendente_local atl ON atl.codigo = r.atendente_norm
  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1
  LEFT JOIN atende_cliente_aliases ca ON ca.alias_normalizado = r.nome_remetente_norm
  LEFT JOIN atende_clientes c ON c.id = ca.cliente_id AND c.ativo = 1
  WHERE r.id > ? ORDER BY r.id LIMIT ?`;

const limpar = (v) => { const s = String(v ?? '').trim(); return /^(null|undefined)$/i.test(s) ? '' : s.replace(/\s+/g, ' '); };

export function classificar(clientePortal, nomeRemetente) {
  const portal = limpar(clientePortal);
  if (!portal) return { origem: 'SEM_PORTAL', grafia: limpar(nomeRemetente) };
  const compartilhada = ORIGENS_COMPARTILHADAS[chaveBase(portal)];
  if (compartilhada) return { origem: compartilhada, grafia: limpar(nomeRemetente) };
  return { origem: 'PORTAL', grafia: portal };
}

async function estado(db) {
  const r = await db.prepare(`SELECT chave, valor FROM cid_estado`).all();
  return Object.fromEntries((r.results || []).map((x) => [x.chave, x.valor]));
}

async function obterLease(db, dono) {
  const agora = Math.floor(Date.now() / 1000);
  const r = await db.prepare(`UPDATE cid_estado SET valor=?, atualizado_em=CURRENT_TIMESTAMP WHERE chave='sync_lease' AND CAST(valor AS INTEGER) < ? RETURNING valor`)
    .bind(String(agora + 150), agora).first();
  if (!r) return false;
  await db.prepare(`INSERT INTO cid_estado(chave, valor) VALUES('sync_dono', ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`).bind(dono).run();
  return true;
}
async function liberarLease(db) {
  await db.prepare(`UPDATE cid_estado SET valor='0' WHERE chave='sync_lease'`).run();
}

/** Uma pagina da sincronizacao. Retorna {lidas, gravadas, fimDaPassagem, grafiasNovas}. */
export async function sincronizarPagina(env, limite = 400) {
  const db = env.DB;
  const st = await estado(db);
  const cursor = Number(st.sync_cursor || 0);
  const passagem = Number(st.sync_passagem || 0) + 1;
  const feed = await env.ATENDE_DB.prepare(FEED_SQL).bind(cursor, limite).all();
  const linhas = feed.results || [];

  if (!linhas.length) {
    // fim da passagem: remove postagens que sumiram do Atende e marca motor pendente se algo mudou
    const removidas = cursor > 0 ? await db.prepare(`DELETE FROM cid_postagens WHERE passagem < ?`).bind(passagem).run() : null;
    await db.batch([
      db.prepare(`UPDATE cid_estado SET valor='0' WHERE chave='sync_cursor'`),
      db.prepare(`UPDATE cid_estado SET valor=? WHERE chave='sync_passagem'`).bind(String(passagem)),
      ...(removidas?.meta?.changes ? [db.prepare(`UPDATE cid_estado SET valor='1' WHERE chave='motor_pendente'`)] : []),
    ]);
    return { lidas: 0, gravadas: 0, fimDaPassagem: true, removidas: removidas?.meta?.changes || 0 };
  }

  const ids = linhas.map((l) => Number(l.id));
  const atuais = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const lote = ids.slice(i, i + 90);
    const r = await db.prepare(`SELECT raw_id, impressao, origem, grafia FROM cid_postagens WHERE raw_id IN (${lote.map(() => '?').join(',')})`).bind(...lote).all();
    for (const x of r.results || []) atuais.set(Number(x.raw_id), x);
  }
  const stmts = [];
  const tocadas = [];
  let grafiasNovas = 0, gravadas = 0;
  for (const l of linhas) {
    const { origem, grafia } = classificar(l.cliente_portal, l.nome_remetente);
    const reg = {
      origem, grafia, cp: limpar(l.cliente_portal), nr: limpar(l.nome_remetente), local: limpar(l.local_codigo).toUpperCase(),
      contrato: limpar(l.contrato), cartao: limpar(l.cartao), data: limpar(l.data_postagem).slice(0, 10), valor: Number(l.valor || 0),
    };
    const impressao = JSON.stringify(reg);
    const atual = atuais.get(Number(l.id));
    if (atual && atual.impressao === impressao) { tocadas.push(Number(l.id)); continue; }
    if (!atual || atual.origem !== origem || atual.grafia !== grafia) grafiasNovas++;
    gravadas++;
    stmts.push(db.prepare(`INSERT INTO cid_postagens(raw_id, origem, grafia, cliente_portal, nome_remetente, local_codigo, contrato, cartao, data_postagem, valor, impressao, passagem)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(raw_id) DO UPDATE SET origem=excluded.origem, grafia=excluded.grafia,
      cliente_portal=excluded.cliente_portal, nome_remetente=excluded.nome_remetente, local_codigo=excluded.local_codigo,
      contrato=excluded.contrato, cartao=excluded.cartao, data_postagem=excluded.data_postagem, valor=excluded.valor,
      impressao=excluded.impressao, passagem=excluded.passagem`)
      .bind(Number(l.id), origem, grafia, reg.cp, reg.nr, reg.local, reg.contrato, reg.cartao, reg.data, reg.valor, impressao, passagem));
  }
  // marca como vistas as que nao mudaram
  for (let i = 0; i < tocadas.length; i += 90) {
    const lote = tocadas.slice(i, i + 90);
    stmts.push(db.prepare(`UPDATE cid_postagens SET passagem=? WHERE raw_id IN (${lote.map(() => '?').join(',')})`).bind(passagem, ...lote));
  }
  stmts.push(db.prepare(`UPDATE cid_estado SET valor=? WHERE chave='sync_cursor'`).bind(String(ids[ids.length - 1])));
  if (gravadas) stmts.push(db.prepare(`UPDATE cid_estado SET valor='1' WHERE chave='motor_pendente'`));
  await emLotes(db, stmts);
  return { lidas: linhas.length, gravadas, fimDaPassagem: false, grafiasNovas };
}

/** Roda paginas ate terminar a passagem ou estourar o orcamento de tempo. */
export async function sincronizar(env, { paginas = 25, orcamentoMs = 20000 } = {}) {
  const db = env.DB;
  const dono = crypto.randomUUID();
  if (!(await obterLease(db, dono))) return { ocupado: true };
  const t0 = Date.now();
  const total = { paginas: 0, lidas: 0, fimDaPassagem: false };
  try {
    for (let i = 0; i < paginas && Date.now() - t0 < orcamentoMs; i++) {
      const r = await sincronizarPagina(env);
      total.paginas++; total.lidas += r.lidas;
      if (r.fimDaPassagem) { total.fimDaPassagem = true; total.removidas = r.removidas; break; }
    }
  } finally { await liberarLease(db); }
  return total;
}
