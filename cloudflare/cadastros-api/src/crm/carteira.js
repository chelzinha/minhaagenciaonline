/**
 * CRM integrado: carteira do LOCAL (Dashboard, Sinalizado automático, sinais do Visão 360),
 * Curva ABC 12M por LOCAL e "Assumir" cliente da fila.
 *
 * Regras (decisões da Rachel em 29/09/2026):
 * - LOCAL é o filtro pai. Admin vê os 3; os demais só os LOCAIS liberados na autenticação (user.crm.locais).
 * - Sinalizado automático = prioridade CRITICA ou ALTA do motor, sem tratativa aberta. Não grava nada:
 *   a tratativa só nasce quando alguém agenda ou assume.
 * - Curva ABC 12M: por LOCAL da carteira (02/10/2026): o cliente entra só na curva do LOCAL que trata ele, com as
 *   postagens de todos os LOCAIS. A até 80% do acumulado (o cliente que cruza os 80% é A),
 *   B até 95% do acumulado OU total na janela >= R$ 5.000, C o resto. Independente da "Curva 30D" do motor.
 * - NOVO (provisório): primeira postagem (qualquer LOCAL) a partir de NOVO_DESDE, até a base completar 12 meses.
 */
import { text, upper, upperNoAccents, hoje, nowIso, diffDays, falhar, todos, um, isYes } from './util.js';
import { locaisPermitidos, localPermitido, CRM_LOCAIS, lerResponsaveis, idRealResponsavel } from './config.js';
import { criarTratativa, tratativaAbertaDe, moverTratativa } from './jornada.js';
import { mapaGruposCrm } from '../grupos.js';

export const NOVO_DESDE = '2026-07-01';
export const ABC_LIMITE_A = 0.8, ABC_LIMITE_B = 0.95, ABC_PISO_B = 5000;
const ETAPA_TRATATIVA = 'C_TRATATIVA', ETAPA_SINALIZADO = 'C_SINALIZADO';

// ------------------------------------------------------------ LOCAL (filtro pai)
/** LOCAIS que o usuário pode ver, na ordem oficial. */
export function locaisDoUsuario(user) {
  const perm = locaisPermitidos(user);
  return CRM_LOCAIS.filter((l) => !perm || perm.has(l));
}
/** LOCAL pedido, validado contra a permissão. Sem pedido: o primeiro permitido. */
export function resolverLocal(user, pedido) {
  const lista = locaisDoUsuario(user);
  if (!lista.length) falhar('Seu usuário não tem nenhum LOCAL liberado no CRM. Peça ao administrador.');
  const l = upperNoAccents(pedido).trim();
  if (!l) return lista[0];
  if (!lista.includes(l)) falhar('Este LOCAL não está vinculado ao seu usuário.');
  return l;
}

const PR_RANK = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 };
const num = (v) => Number(v) || 0;
const js = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const normPr = (v) => upperNoAccents(v).replace(/\s+/g, '') || 'BAIXA';
const normAc = (v) => { const a = upper(v); return a === 'VISITAR' ? 'FIDELIZAR' : (a || 'MANTER'); };

/** Mapa ENTIDADE_ID -> tratativa aberta (clientes). */
async function tratativasAbertasClientes(db) {
  const rows = await todos(db, `SELECT TRATATIVA_ID, ENTIDADE_ID, ETAPA_ID, ACAO_ENGINE_SNAPSHOT, ABERTA_EM, RESPONSAVEL_ID, PROXIMA_ATIVIDADE_ID
    FROM crm_tratativas WHERE upper(TIPO_ENTIDADE)='CLIENTE' AND FUNIL_ID='FUNIL_CLIENTES' AND upper(STATUS_TRATATIVA) IN ('ABERTA','PAUSADA')`);
  return new Map(rows.map((r) => [r.ENTIDADE_ID, r]));
}
/** Mapa CLIENTE_ID -> WhatsApp do cadastro manual. */
async function whatsappDe(db, ids) {
  const out = new Map(), lista = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < lista.length; i += 90) {
    const parte = lista.slice(i, i + 90);
    const rows = await todos(db, `SELECT CLIENTE_ID, WHATSAPP, TELEFONE FROM crm_cadastro WHERE CLIENTE_ID IN (${parte.map(() => '?').join(',')})`, ...parte);
    for (const r of rows) { const w = text(r.WHATSAPP) || text(r.TELEFONE); if (w) out.set(r.CLIENTE_ID, w); }
  }
  return out;
}
/** Clientes com atividade planejada de hoje em diante. */
async function comAtividadeFutura(db) {
  const rows = await todos(db, `SELECT DISTINCT ENTIDADE_ID FROM crm_agenda WHERE upper(STATUS_ATIVIDADE)='PLANEJADO' AND DATA_PROGRAMADA >= ? AND ENTIDADE_ID <> ''`, hoje());
  return new Set(rows.map((r) => r.ENTIDADE_ID));
}

// ------------------------------------------------------------ GET get_carteira_v1
export async function getCarteira(env, p, user) {
  const db = env.DB;
  const local = resolverLocal(user, p.local);
  const [resumo, porAcao, filaRows, quedaRows, abertas, futuras] = await Promise.all([
    um(db, `SELECT COUNT(*) tot, SUM(json_extract(dados,'$.INATIVO_30D')='NAO') at30,
      SUM(json_extract(dados,'$.INATIVO_30D')='SIM' AND json_extract(dados,'$.INATIVO_60D')<>'SIM') esf,
      SUM(json_extract(dados,'$.INATIVO_60D')='SIM') i60, ROUND(SUM(fat_30d),2) fat30,
      SUM(json_extract(dados,'$.NOVO_CLIENTE')='SIM') novos FROM crm_metricas WHERE local=?`, local),
    todos(db, `SELECT acao, prioridade, COUNT(*) n FROM crm_metricas WHERE local=? GROUP BY 1,2`, local),
    todos(db, `SELECT cliente_id, nome, acao, sub_acao, prioridade, curva, fat_30d, ultima, dados FROM crm_metricas
      WHERE local=? AND prioridade IN ('CRITICA','ALTA') ORDER BY prioridade_rank DESC, score DESC, share DESC, nome`, local),
    todos(db, `SELECT cliente_id, nome, acao, prioridade, fat_30d, dados FROM crm_metricas WHERE local=? AND json_extract(dados,'$.QUEDA_REAL')='SIM'
      AND fat_30d > 0 AND json_extract(dados,'$.FAT_31_60D') >= 1000
      ORDER BY (json_extract(dados,'$.FAT_31_60D') - fat_30d) DESC LIMIT 12`, local),
    tratativasAbertasClientes(db), comAtividadeFutura(db),
  ]);
  const acoes = {}, fila = {};
  for (const r of porAcao) {
    const ac = normAc(r.acao), pr = normPr(r.prioridade);
    acoes[ac] = (acoes[ac] || 0) + num(r.n);
    if (pr === 'CRITICA' || pr === 'ALTA') { fila[ac] = fila[ac] || [0, 0]; fila[ac][pr === 'CRITICA' ? 0 : 1] += num(r.n); }
  }
  const wa = await whatsappDe(db, [...filaRows.map((r) => r.cliente_id), ...quedaRows.map((r) => r.cliente_id)]);
  const itens = filaRows.map((r) => {
    const d = js(r.dados), t = abertas.get(r.cliente_id);
    return { clienteId: r.cliente_id, cliente: text(r.nome), local, acao: normAc(r.acao), subAcao: text(r.sub_acao), prioridade: normPr(r.prioridade),
      curva: text(r.curva), fat30: num(r.fat_30d), diasSemPostar: num(d.DIAS_SEM_POSTAR), ultima: text(r.ultima), motivo: text(d.MOTIVO_REGRA),
      canal: text(d.CANAL_SUGERIDO), midia: text(d.MIDIA), temContrato: text(d.TEM_CONTRATO) === 'SIM', intermediador: text(d.TIPO_CONTRATO_PREDOMINANTE) || text(d.INTERMEDIADOR_PREDOMINANTE),
      whatsapp: wa.get(r.cliente_id) || '', tratativaId: t ? text(t.TRATATIVA_ID) : '', etapaId: t ? text(t.ETAPA_ID) : '',
      temAtividade: futuras.has(r.cliente_id), grupoN: Array.isArray(d.GRUPO_MEMBROS) ? d.GRUPO_MEMBROS.length : 0 };
  });

  // Sinais do Visão 360 (tudo calculado, nada gravado)
  const sinais = [];
  const idsAbertos = [...abertas.keys()];
  if (idsAbertos.length) {
    const mets = [];
    for (let i = 0; i < idsAbertos.length; i += 90) {
      const parte = idsAbertos.slice(i, i + 90);
      mets.push(...await todos(db, `SELECT cliente_id, nome, local, ultima, dados FROM crm_metricas WHERE local=? AND cliente_id IN (${parte.map(() => '?').join(',')})`, local, ...parte));
    }
    for (const m of mets) {
      const t = abertas.get(m.cliente_id), d = js(m.dados), snap = upper(t.ACAO_ENGINE_SNAPSHOT), aberta = text(t.ABERTA_EM).slice(0, 10);
      if (snap === 'RESGATAR' && num(d.DIAS_SEM_POSTAR) <= 7 && text(m.ultima) >= aberta)
        sinais.push({ tipo: 'VOLTOU', clienteId: m.cliente_id, cliente: text(m.nome), tratativaId: t.TRATATIVA_ID, ultima: text(m.ultima), diasSemPostar: num(d.DIAS_SEM_POSTAR) });
      else if (snap === 'CONVERTER' && text(d.TEM_CONTRATO) === 'SIM')
        sinais.push({ tipo: 'CONTRATO', clienteId: m.cliente_id, cliente: text(m.nome), tratativaId: t.TRATATIVA_ID, contrato: text(d.NUMERO_CONTRATO) });
    }
  }
  for (const r of quedaRows) {
    if (futuras.has(r.cliente_id) || sinais.length >= 8) continue;
    const d = js(r.dados), antes = num(d.FAT_31_60D), agora = num(r.fat_30d);
    sinais.push({ tipo: 'QUEDA', clienteId: r.cliente_id, cliente: text(r.nome), acao: normAc(r.acao), prioridade: normPr(r.prioridade),
      antes, agora, pct: antes ? Math.round((1 - agora / antes) * 100) : 0, whatsapp: wa.get(r.cliente_id) || '', tratativaId: abertas.get(r.cliente_id)?.TRATATIVA_ID || '' });
  }
  return {
    ok: true, local, locais: locaisDoUsuario(user), geradoEm: nowIso(),
    resumo: { tot: num(resumo?.tot), ativos30: num(resumo?.at30), esfriando: num(resumo?.esf), inativos60: num(resumo?.i60), fat30: num(resumo?.fat30), novos: num(resumo?.novos), acoes, fila },
    fila: itens, sinais,
  };
}

// ------------------------------------------------------------ Curva ABC 12M
/** Janela de 12 meses terminando no mês da última postagem (yyyy-MM). */
export function mesesJanela(ultimoYm, n = 12) {
  const [y, m] = ultimoYm.split('-').map(Number), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); out.push(d.toISOString().slice(0, 7)); }
  return out;
}
/**
 * Classifica ABC. rows: [{ tV }] (qualquer ordem). Devolve as mesmas linhas, ordenadas por tV desc,
 * com rank, part, acum e abc. Função pura (testada em test/crm_integrado.test.mjs).
 */
export function classificarAbc(rows, { limA = ABC_LIMITE_A, limB = ABC_LIMITE_B, pisoB = ABC_PISO_B } = {}) {
  const lista = rows.filter((r) => num(r.tV) > 0).sort((a, b) => num(b.tV) - num(a.tV) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  const total = lista.reduce((a, r) => a + num(r.tV), 0);
  let acum = 0;
  lista.forEach((r, i) => {
    const antes = total ? acum / total : 0;
    acum += num(r.tV);
    r.rank = i + 1;
    r.part = total ? num(r.tV) / total : 0;
    r.acum = total ? acum / total : 0;
    r.abc = antes < limA ? 'A' : (antes < limB || num(r.tV) >= pisoB) ? 'B' : 'C';
  });
  return { rows: lista, total };
}

const cacheAbc = new Map();                                     // por isolate: evita recalcular a cada clique
export async function getCurvaAbc(env, p, user) {
  const db = env.DB;
  const local = resolverLocal(user, p.local);
  const lim = await um(db, `SELECT MIN(substr(data_postagem,1,10)) mi, MAX(substr(data_postagem,1,10)) ma FROM cid_postagens WHERE data_postagem <> '' AND estorno = 0`);
  const ultima = text(lim?.ma), baseIni = text(lim?.mi);
  if (!ultima) return { ok: true, local, meses: [], rows: [], resumo: null };
  const rev = await um(db, `SELECT valor, atualizado_em FROM cid_estado WHERE chave='crm_ultimo'`);
  const chave = `${local}|${ultima}|${text(rev?.atualizado_em)}`;
  const c = cacheAbc.get(local);
  if (c && c.chave === chave && Date.now() - c.em < 10 * 60e3) return c.dados;

  const meses = mesesJanela(ultima.slice(0, 7), 12), ini = meses[0];
  // LOCAL da carteira (regra 02/10/2026): o cliente entra na curva do LOCAL que trata ele, com as postagens de TODOS os LOCAIS.
  // Grupos comerciais: postagens dos cadastros somam no principal (linha única). Visão 360 não muda.
  const [agg, pri, mets, nomes] = await db.batch([
    // TIPO do Atende (SUPERFRETE, PLATINUM, CLUBE CORREIOS...); sem TIPO usa o INTERMEDIADOR; sem os dois = SEM CONTRATO
    db.prepare(`SELECT n.cliente_id id, substr(p.data_postagem,1,7) ym, COALESCE(NULLIF(p.contrato_tipo,''), NULLIF(p.intermediador,''), 'SEM CONTRATO') tipo,
      SUM(p.estorno = 0) q, ROUND(SUM(p.valor),2) v
      FROM cid_postagens p JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia JOIN cid_nos n ON n.chave = g.no_chave
      WHERE n.cliente_id IS NOT NULL AND p.data_postagem <> '' AND substr(p.data_postagem,1,7) >= ? GROUP BY 1, 2, 3`).bind(ini),
    db.prepare(`SELECT n.cliente_id id, MIN(substr(p.data_postagem,1,10)) primeira, MAX(substr(p.data_postagem,1,10)) ultima
      FROM cid_postagens p JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia JOIN cid_nos n ON n.chave = g.no_chave
      WHERE n.cliente_id IS NOT NULL AND p.data_postagem <> '' AND p.estorno = 0 GROUP BY 1`),
    db.prepare(`SELECT cliente_id, nome, local, acao, curva, json_extract(dados,'$.INTERMEDIADOR_PREDOMINANTE') inter, json_extract(dados,'$.TEM_CONTRATO') ctr FROM crm_metricas`),
    db.prepare(`SELECT id, nome, local_carteira FROM cid_clientes`),
  ]);
  const idxMes = Object.fromEntries(meses.map((m, i) => [m, i]));
  const { principalDe, grupoDe } = await mapaGruposCrm(db);
  const idCrm = (id) => principalDe.get(id) || id;
  const localDe = new Map();
  for (const n of nomes.results || []) localDe.set(n.id, text(n.local_carteira));
  for (const m of mets.results || []) localDe.set(m.cliente_id, text(m.local));         // motor do CRM vence (grupo usa o LOCAL do grupo)
  const daCarteira = (id) => (localDe.get(id) || '') === local;
  const porId = new Map();
  for (const r of agg.results || []) {
    const i = idxMes[r.ym];
    r.id = idCrm(r.id);
    if (i === undefined || !daCarteira(r.id)) continue;
    let x = porId.get(r.id);
    if (!x) { x = { id: r.id, q: Array(12).fill(0), v: Array(12).fill(0), tQ: 0, tV: 0, tipos: {} }; porId.set(r.id, x); }
    x.q[i] += num(r.q); x.v[i] += num(r.v); x.tQ += num(r.q); x.tV += num(r.v);
    x.tipos[r.tipo] = (x.tipos[r.tipo] || 0) + Math.abs(num(r.v)) + num(r.q) / 1e6;
  }
  const primeira = new Map(), ultimaDe = new Map();
  for (const r of pri.results || []) {
    const id = idCrm(r.id), p1 = text(r.primeira), u1 = text(r.ultima);
    if (!daCarteira(id)) continue;
    if (p1 && (!primeira.get(id) || p1 < primeira.get(id))) primeira.set(id, p1);
    if (u1 && (!ultimaDe.get(id) || u1 > ultimaDe.get(id))) ultimaDe.set(id, u1);
  }
  const tipoPred = (x) => Object.entries(x.tipos).sort((a, b) => b[1] - a[1])[0]?.[0] || 'SEM CONTRATO';
  // nomes e dados do motor (ja lidos no batch acima)
  const info = new Map();
  const nomeCid = new Map((nomes.results || []).filter((n) => porId.has(n.id)).map((n) => [n.id, text(n.nome)]));
  for (const m of mets.results || []) {
    if (!porId.has(m.cliente_id)) continue;
    info.set(m.cliente_id, { nome: text(m.nome) || nomeCid.get(m.cliente_id) || '', localCarteira: text(m.local), acao: normAc(m.acao), curva30: text(m.curva),
      intermediador: text(m.inter) || 'SEM CONTRATO', contrato: text(m.ctr) === 'SIM' });
  }
  for (const [id, nome] of nomeCid) if (!info.has(id)) info.set(id, { nome });
  const brutas = [...porId.values()].map((x) => {
    const i = info.get(x.id) || {};
    const prim = primeira.get(x.id) || '';
    return { id: x.id, nome: i.nome || x.id, q: x.q, v: x.v.map((v) => Math.round(v * 100) / 100), tQ: x.tQ, tV: Math.round(x.tV * 100) / 100,
      tk: x.tQ ? Math.round(x.tV / x.tQ * 100) / 100 : 0, primeira: prim, novo: prim >= NOVO_DESDE, acao: i.acao || '', curva30: i.curva30 || '',
      intermediador: tipoPred(x), canal: i.intermediador || '', contrato: !!i.contrato, localCarteira: i.localCarteira || '', ultima: ultimaDe.get(x.id) || '',
      grupoN: grupoDe.get(x.id)?.n || 0 };
  });
  const { rows, total } = classificarAbc(brutas);
  const cls = { A: [0, 0, 0], B: [0, 0, 0], C: [0, 0, 0] };
  const porMes = meses.map(() => ({ q: 0, v: 0, A: 0, B: 0, C: 0, cli: 0 }));
  const mesAtual = meses.length - 1;
  let semUltimo = 0;
  for (const r of rows) {
    cls[r.abc][0]++; cls[r.abc][1] += r.tV; cls[r.abc][2] += r.tQ;
    r.v.forEach((v, i) => { porMes[i].v += v; porMes[i].q += r.q[i]; porMes[i][r.abc] += v; if (r.q[i] || v) porMes[i].cli++; });
    if (!r.q[mesAtual] && !r.v[mesAtual]) semUltimo++;
    r.acum = Math.round(r.acum * 10000) / 10000; r.part = Math.round(r.part * 10000) / 10000;
  }
  porMes.forEach((m) => { for (const k of ['v', 'A', 'B', 'C']) m[k] = Math.round(m[k] * 100) / 100; });
  const novosPorMes = {};
  for (const r of rows) if (r.novo) { const k = r.primeira.slice(0, 7); novosPorMes[k] = (novosPorMes[k] || 0) + 1; }
  const dados = {
    ok: true, local, meses, baseIni: baseIni.slice(0, 7), mesParcial: ultima.slice(0, 7), ultimaPostagem: ultima, novoDesde: NOVO_DESDE,
    regra: { limA: ABC_LIMITE_A, limB: ABC_LIMITE_B, pisoB: ABC_PISO_B },
    resumo: { total: Math.round(total * 100) / 100, qtd: rows.reduce((a, r) => a + r.tQ, 0), clientes: rows.length,
      A: cls.A.map((v) => Math.round(v * 100) / 100), B: cls.B.map((v) => Math.round(v * 100) / 100), C: cls.C.map((v) => Math.round(v * 100) / 100),
      novos: rows.filter((r) => r.novo).length, novosPorMes, semPostagemMesAtual: semUltimo },
    porMes, rows,
  };
  cacheAbc.set(local, { chave, em: Date.now(), dados });
  return dados;
}

// ------------------------------------------------------------ POST assumir_cliente_v1
/** Cria (ou reaproveita) a tratativa do cliente e a coloca em "Em tratativa" com o responsável da sessão. */
export async function assumirCliente(env, p, user) {
  const db = env.DB;
  const id = text(p.clienteId || p.entidadeId);
  if (!id) falhar('clienteId obrigatório.');
  const met = await um(db, `SELECT local FROM crm_metricas WHERE cliente_id=?`, id);
  const cad = met ? null : await um(db, `SELECT LOCAL_PADRAO FROM crm_cadastro WHERE CLIENTE_ID=?`, id);
  const localCli = text(met?.local || cad?.LOCAL_PADRAO);
  if (!met && !cad) falhar('Cliente não encontrado.');
  if (!localPermitido(locaisPermitidos(user), localCli)) falhar('Este cliente pertence a um LOCAL que não está vinculado ao seu usuário.');
  const resp = idRealResponsavel(text(p.responsavelId) || text(user?.crm?.responsavelId) || text(user?.username), await lerResponsaveis(db));
  const aberta = await tratativaAbertaDe(db, 'CLIENTE', id, 'FUNIL_CLIENTES');
  if (aberta) {
    if (text(aberta.ETAPA_ID) === ETAPA_SINALIZADO) await moverTratativa(env, { tratativaId: aberta.TRATATIVA_ID, etapaId: ETAPA_TRATATIVA, responsavelId: resp, updatedBy: resp }, user);
    if (resp && !text(aberta.RESPONSAVEL_ID)) await db.prepare(`UPDATE crm_tratativas SET RESPONSAVEL_ID=? WHERE TRATATIVA_ID=?`).bind(resp, aberta.TRATATIVA_ID).run();
    return { ok: true, created: false, tratativaId: aberta.TRATATIVA_ID };
  }
  const etapa = await um(db, `SELECT ETAPA_ID, ATIVA FROM crm_etapas WHERE ETAPA_ID=? AND FUNIL_ID='FUNIL_CLIENTES'`, ETAPA_TRATATIVA);
  const r = await criarTratativa(env, { tipoEntidade: 'CLIENTE', entidadeId: id, funilId: 'FUNIL_CLIENTES', etapaId: etapa && isYes(etapa.ATIVA) ? ETAPA_TRATATIVA : '',
    responsavelId: resp, origem: 'CRM_ASSUMIR', createdBy: resp || text(user?.username), motivoAbertura: text(p.motivo) }, user);
  return { ok: true, created: !!r.created, tratativaId: r.tratativaId };
}

/** Etapa inicial da tratativa criada ao agendar um cliente (o card sai de Sinalizado). */
export async function etapaAoAgendar(db) {
  const e = await um(db, `SELECT ATIVA FROM crm_etapas WHERE ETAPA_ID=? AND FUNIL_ID='FUNIL_CLIENTES'`, ETAPA_TRATATIVA);
  return e && isYes(e.ATIVA) ? ETAPA_TRATATIVA : '';
}
export { ETAPA_TRATATIVA, ETAPA_SINALIZADO, PR_RANK, diffDays };
