/**
 * Motor do CRM sobre o D1: le postagens ja ligadas ao cliente (Cadastro v2), calcula e grava crm_metricas.
 * So grava as linhas que mudaram (assinatura). Cliente que sumiu do cadastro sai do CRM.
 */
import { executarCrm, priorityRank, CRM_MOTOR_VERSAO } from './crm_motor.js';
import { emLotes } from './persistencia.js';

const CLIENTES_POR_LOTE = 400;

const SQL_LINHAS = `
  SELECT n.cliente_id, substr(p.data_postagem, 1, 10) data, p.local_codigo local, p.intermediador, p.contrato_tipo, p.subgrupo, p.estorno,
    p.contrato, p.cartao, COUNT(*) qtd, ROUND(SUM(p.valor), 2) valor
  FROM cid_nos n
  JOIN cid_grafias g ON g.no_chave = n.chave
  JOIN cid_postagens p ON p.origem = g.origem AND p.grafia = g.grafia
  WHERE n.cliente_id >= ? AND n.cliente_id <= ? AND p.data_postagem <> ''
  GROUP BY 1,2,3,4,5,6,7,8,9`;

async function assinar(texto) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function calcularCrmD1(env, autor = 'SISTEMA') {
  const db = env.DB, t0 = Date.now();
  const cl = await db.prepare(`SELECT id, nome, local_carteira FROM cid_clientes ORDER BY id`).all();
  const clientes = new Map((cl.results || []).map((c) => [c.id, { nome: c.nome, local: c.local_carteira || '' }]));
  const ids = [...clientes.keys()];
  const linhas = new Map();
  for (let i = 0; i < ids.length; i += CLIENTES_POR_LOTE) {
    const lote = ids.slice(i, i + CLIENTES_POR_LOTE);
    const r = await db.prepare(SQL_LINHAS).bind(lote[0], lote[lote.length - 1]).all();
    for (const x of r.results || []) {
      if (!linhas.has(x.cliente_id)) linhas.set(x.cliente_id, []);
      linhas.get(x.cliente_id).push({ data: x.data, qtd: Number(x.qtd || 0), valor: Number(x.valor || 0), estorno: Number(x.estorno || 0), local: x.local,
        intermediador: x.intermediador, contratoTipo: x.contrato_tipo, subgrupo: x.subgrupo, contrato: x.contrato, cartao: x.cartao });
    }
  }
  const resultado = executarCrm(clientes, linhas);

  const atuais = await db.prepare(`SELECT cliente_id, assinatura FROM crm_metricas`).all();
  const assinaturaAtual = new Map((atuais.results || []).map((x) => [x.cliente_id, x.assinatura]));
  const stmts = [];
  let gravadas = 0;
  for (const m of resultado.metricas) {
    const dados = JSON.stringify(m);
    const ass = await assinar(dados);
    const antes = assinaturaAtual.get(m.CLIENTE_ID);
    assinaturaAtual.delete(m.CLIENTE_ID);
    if (antes === ass) continue;
    gravadas++;
    stmts.push(db.prepare(`INSERT INTO crm_metricas(cliente_id, local, nome, curva, acao, sub_acao, prioridade, prioridade_rank, score, share, status, perfil, fat_30d, ultima, dados, assinatura, calculado_em)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(cliente_id) DO UPDATE SET local=excluded.local, nome=excluded.nome, curva=excluded.curva, acao=excluded.acao, sub_acao=excluded.sub_acao,
        prioridade=excluded.prioridade, prioridade_rank=excluded.prioridade_rank, score=excluded.score, share=excluded.share, status=excluded.status,
        perfil=excluded.perfil, fat_30d=excluded.fat_30d, ultima=excluded.ultima, dados=excluded.dados, assinatura=excluded.assinatura, calculado_em=CURRENT_TIMESTAMP`)
      .bind(m.CLIENTE_ID, m.LOCAL, m.CLIENTE || '', m.CURVA, m.ACAO, m.SUB_ACAO, m.PRIORIDADE_FILA, priorityRank(m.PRIORIDADE_FILA), m.SCORE_PRIORIDADE || 0,
        m.SHARE_LOCAL_30D || 0, m.STATUS_ATIVIDADE, m.PERFIL_COMERCIAL, m.FAT_30D || 0, m.DATA_ULTIMA_POSTAGEM || '', dados, ass));
  }
  const removidos = [...assinaturaAtual.keys()];
  for (let i = 0; i < removidos.length; i += 90) {
    const lote = removidos.slice(i, i + 90);
    stmts.push(db.prepare(`DELETE FROM crm_metricas WHERE cliente_id IN (${lote.map(() => '?').join(',')})`).bind(...lote));
  }
  const resumo = { versao: CRM_MOTOR_VERSAO, refDate: resultado.refDate, clientes: resultado.metricas.length, porLocal: resultado.porLocal,
    gravadas, removidos: removidos.length, ms: Date.now() - t0, autor, em: new Date().toISOString() };
  stmts.push(db.prepare(`INSERT INTO cid_estado(chave, valor) VALUES('crm_ultimo', ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=CURRENT_TIMESTAMP`).bind(JSON.stringify(resumo)));
  stmts.push(db.prepare(`UPDATE cid_estado SET valor='0', atualizado_em=CURRENT_TIMESTAMP WHERE chave='crm_pendente'`));
  await emLotes(db, stmts);
  return resumo;
}

/** O CRM so calcula depois de uma passagem completa com as colunas do Atende (intermediador, tipo, subgrupo). */
export async function crmPronto(db) {
  const r = await db.prepare(`SELECT chave, valor FROM cid_estado WHERE chave IN ('sync_passagem','crm_min_passagem','crm_pendente')`).all();
  const e = Object.fromEntries((r.results || []).map((x) => [x.chave, x.valor]));
  return { pronto: Number(e.sync_passagem || 0) >= Number(e.crm_min_passagem || 0), pendente: e.crm_pendente === '1' };
}
