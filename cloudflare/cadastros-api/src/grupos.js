/**
 * Grupos comerciais (02/10/2026) - varios cadastros que comercialmente sao um cliente so.
 *
 * Regras (decididas pela Rachel):
 *  1. Serve SOMENTE para o CRM. Nome, ID e postagens de cada cadastro (cid_*) nao mudam; o Visao 360 nao e tocado.
 *  2. Um cadastro so pode estar em um grupo (crm_grupo_membros.cliente_id e chave primaria).
 *  3. LOCAL do grupo e independente dos LOCAIS de cada cadastro: LOCAL com maior percentual de postagens do grupo,
 *     ou o LOCAL fixado manualmente (local_modo). Empate fica com o LOCAL do cadastro principal.
 *  4. No CRM o grupo aparece com o ID do cadastro principal: tratativas, agenda e cadastro manual do CRM seguem iguais.
 *     As metricas usam so as postagens do grupo no LOCAL dele (mesma regra de qualquer cliente).
 *  5. Desfazer o grupo devolve cada cadastro ao CRM separado. O que foi registrado no CRM enquanto era grupo fica no principal.
 */
import { metricasDoCliente } from './crm_motor.js';
import { nomeExibicao } from './motor.js';
import { statementsMoverCrm } from './crm/fundir.js';

export const GRUPO_LOCAIS = ['AGF', 'BALCAO', 'METRO'];
export const GRUPO_MAX_MEMBROS = 50;
const MODOS = ['AUTO', ...GRUPO_LOCAIS];
const num = (v) => Number(v) || 0;
const limpar = (v) => String(v ?? '').trim();
const r2 = (v) => Math.round(num(v) * 100) / 100;
const erro = (mensagem, status = 400, codigo = '') => { throw Object.assign(new Error(mensagem), { status, codigo }); };
const js = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };

// ------------------------------------------------------------ regra do LOCAL
/** LOCAL do grupo. contagem = postagens por LOCAL somando todos os cadastros. */
export function localDoGrupo(modo, contagem, localPrincipal) {
  if (GRUPO_LOCAIS.includes(modo)) return modo;
  const tot = GRUPO_LOCAIS.reduce((t, l) => t + num(contagem[l]), 0);
  if (!tot) return GRUPO_LOCAIS.includes(localPrincipal) ? localPrincipal : '';
  const max = Math.max(...GRUPO_LOCAIS.map((l) => num(contagem[l])));
  const empatados = GRUPO_LOCAIS.filter((l) => num(contagem[l]) === max);
  return empatados.includes(localPrincipal) ? localPrincipal : empatados[0];
}

// ------------------------------------------------------------ leitura
/** Grupos com a lista de membros. */
export async function lerGrupos(db) {
  const [g, m] = await db.batch([
    db.prepare(`SELECT id, nome, principal_id, local_modo, criado_por, criado_em, atualizado_por, atualizado_em FROM crm_grupos ORDER BY nome`),
    db.prepare(`SELECT cliente_id, grupo_id FROM crm_grupo_membros ORDER BY incluido_em, cliente_id`),
  ]);
  const grupos = (g.results || []).map((x) => ({ ...x, membros: [] }));
  const porId = new Map(grupos.map((x) => [x.id, x]));
  for (const x of m.results || []) { const gr = porId.get(x.grupo_id); if (gr) gr.membros.push(x.cliente_id); }
  return grupos;
}

/**
 * Membro -> cadastro principal, conforme o ultimo calculo do CRM (o que o CRM esta mostrando agora).
 * Devolve { principalDe: Map(membro -> principal), grupoDe: Map(principal -> { id, nome, n }) }.
 */
export async function mapaGruposCrm(db) {
  const rows = (await db.prepare(`SELECT cliente_id, local, json_extract(dados,'$.GRUPO_ID') gid, json_extract(dados,'$.GRUPO_NOME') nome,
      json_extract(dados,'$.GRUPO_MEMBROS') membros FROM crm_metricas WHERE json_extract(dados,'$.GRUPO_ID') IS NOT NULL`).all()).results || [];
  const principalDe = new Map(), grupoDe = new Map(), localDoPrincipal = new Map();
  for (const r of rows) {
    const membros = js(r.membros) || [];
    grupoDe.set(r.cliente_id, { id: r.gid, nome: r.nome, n: membros.length });
    localDoPrincipal.set(r.cliente_id, r.local || '');
    for (const mb of membros) if (mb && mb.id) principalDe.set(mb.id, r.cliente_id);
    principalDe.set(r.cliente_id, r.cliente_id);
  }
  return { principalDe, grupoDe, localDoPrincipal };
}

// ------------------------------------------------------------ motor do CRM
/**
 * Junta os cadastros de cada grupo antes do motor do CRM.
 * clientes: Map(id -> { nome, local }) e linhas: Map(id -> linhas) sao alterados no lugar:
 * os membros saem e o principal passa a ter o nome do grupo, o LOCAL do grupo e as linhas de todos.
 * Devolve Map(principal -> info) para detalhar o grupo nas metricas.
 */
export function aplicarGruposNoMotor(grupos, clientes, linhas) {
  const info = new Map();
  for (const g of grupos) {
    const validos = [...new Set(g.membros)].filter((id) => clientes.has(id));
    if (validos.length < 2) continue;                                       // grupo incompleto (cadastro sumiu): CRM mostra separado
    const qtdDe = (id) => (linhas.get(id) || []).reduce((t, l) => t + num(l.qtd), 0);
    const principal = validos.includes(g.principal_id) ? g.principal_id : [...validos].sort((a, b) => qtdDe(b) - qtdDe(a) || a.localeCompare(b))[0];
    const contagem = { AGF: 0, BALCAO: 0, METRO: 0 };
    for (const id of validos) for (const l of linhas.get(id) || []) if (l.local in contagem) contagem[l.local] += num(l.qtd);
    const localPrincipal = clientes.get(principal).local;
    const local = localDoGrupo(g.local_modo, contagem, localPrincipal);
    const porMembro = new Map(validos.map((id) => [id, { nome: clientes.get(id).nome, local: clientes.get(id).local, linhas: linhas.get(id) || [] }]));
    info.set(principal, { grupo: g, principal, membros: validos, local, contagem, porMembro });
    const juntas = validos.flatMap((id) => linhas.get(id) || []);
    for (const id of validos) if (id !== principal) { clientes.delete(id); linhas.delete(id); }
    clientes.set(principal, { nome: g.nome, local });                       // o motor soma as postagens de todos os LOCAIS
    linhas.set(principal, juntas);
  }
  return info;
}

/** Detalhe por cadastro dentro das metricas do principal (todas as postagens, de todos os LOCAIS). */
export function decorarMetricasDoGrupo(m, inf, refDate) {
  const tot = GRUPO_LOCAIS.reduce((t, l) => t + num(inf.contagem[l]), 0);
  m.GRUPO_ID = inf.grupo.id;
  m.GRUPO_NOME = inf.grupo.nome;
  m.GRUPO_LOCAL_MODO = inf.grupo.local_modo;
  m.GRUPO_SOMA_LOCAIS = 'SIM';
  m.GRUPO_LOCAL_PCT = tot && inf.local ? r2(num(inf.contagem[inf.local]) / tot * 10000) / 10000 : 0;
  m.GRUPO_POSTAGENS_POR_LOCAL = { ...inf.contagem };
  m.GRUPO_MEMBROS = inf.membros.map((id) => {
    const x = inf.porMembro.get(id);
    const mm = x.linhas.length ? metricasDoCliente(id, x.linhas, refDate) : null;
    const fora = x.linhas.filter((l) => l.local !== inf.local && !l.estorno).reduce((t, l) => t + num(l.qtd), 0);   // somadas no grupo (informativo)
    return {
      id, nome: x.nome, principal: id === inf.principal, localCarteira: x.local || '', noLocal: true, comPostagem: !!mm,
      fat30: mm ? r2(mm.FAT_30D) : 0, fat60: mm ? r2(mm.FAT_31_60D) : 0, qtdTotal: mm ? num(mm.QTD_TOTAL) : 0, valorTotal: mm ? r2(mm.VALOR_TOTAL) : 0,
      ultima: mm ? mm.DATA_ULTIMA_POSTAGEM : '', diasSemPostar: mm ? num(mm.DIAS_SEM_POSTAR) : null,
      contrato: mm ? (mm.NUMERO_CONTRATO_PROPRIO || mm.NUMERO_CONTRATO || '') : '', postagensFora: fora,
    };
  }).sort((a, b) => (b.principal - a.principal) || (b.valorTotal - a.valorTotal) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return m;
}

// ------------------------------------------------------------ tela /cadastros: listar
const SQL_MEMBROS = `SELECT gm.grupo_id, gm.cliente_id id, c.id existe, c.nome, c.portal_chave IS NOT NULL eh_portal, c.local_carteira,
    COALESCE(SUM(r.postagens),0) postagens, ROUND(COALESCE(SUM(r.valor),0),2) valor, MAX(r.ultima) ultima,
    COALESCE(SUM(r.local_agf),0) local_agf, COALESCE(SUM(r.local_balcao),0) local_balcao, COALESCE(SUM(r.local_metro),0) local_metro, GROUP_CONCAT(r.aba) abas
  FROM crm_grupo_membros gm LEFT JOIN cid_clientes c ON c.id = gm.cliente_id LEFT JOIN cid_resumo r ON r.cliente_id = gm.cliente_id
  GROUP BY gm.cliente_id`;

function montarGrupo(g, membros, met) {
  const locais = { AGF: 0, BALCAO: 0, METRO: 0 };
  for (const m of membros) { locais.AGF += num(m.local_agf); locais.BALCAO += num(m.local_balcao); locais.METRO += num(m.local_metro); }
  const principal = membros.find((m) => m.id === g.principal_id);
  const localAuto = localDoGrupo('AUTO', locais, principal ? principal.local_carteira : '');
  const local = GRUPO_LOCAIS.includes(g.local_modo) ? g.local_modo : localAuto;
  const d = met ? js(met.dados) || {} : null;
  const detalhe = new Map(((d && d.GRUPO_MEMBROS) || []).map((x) => [x.id, x]));
  const idsCrm = [...detalhe.keys()].sort().join('|'), idsAgora = membros.filter((m) => m.existe).map((m) => m.id).sort().join('|');
  const emDia = !!d && idsCrm === idsAgora && d.GRUPO_NOME === g.nome && met.local === local && met.cliente_id === g.principal_id;
  return {
    id: g.id, nome: g.nome, principalId: g.principal_id, localModo: g.local_modo, local, localAuto, locais,
    criadoPor: g.criado_por, criadoEm: g.criado_em, atualizadoPor: g.atualizado_por, atualizadoEm: g.atualizado_em,
    membros: membros.map((m) => {
      const x = detalhe.get(m.id);
      return { id: m.id, nome: m.nome || '', existe: !!m.existe, ehPortal: !!Number(m.eh_portal), abas: m.abas || '', localCarteira: m.local_carteira || '',
        postagens: num(m.postagens), valor: num(m.valor), ultima: m.ultima || '', local_agf: num(m.local_agf), local_balcao: num(m.local_balcao), local_metro: num(m.local_metro),
        principal: m.id === g.principal_id, fat30: x ? num(x.fat30) : null, noLocal: x ? !!x.noLocal : null };
    }).sort((a, b) => (b.principal - a.principal) || (b.valor - a.valor)),
    crm: d ? { emDia, local: met.local, acao: met.acao, prioridade: met.prioridade, curva: met.curva, fat30: num(met.fat_30d), fat60: num(d.FAT_31_60D),
      valorTotal: num(d.VALOR_TOTAL), qtdTotal: num(d.QTD_TOTAL), ultima: met.ultima || '', diasSemPostar: num(d.DIAS_SEM_POSTAR),
      temContrato: d.TEM_CONTRATO === 'SIM', contrato: d.NUMERO_CONTRATO || '' } : null,
  };
}

export async function listarGrupos(env, { q = '', local = '' } = {}) {
  const db = env.DB;
  const [gs, ms, mets] = await db.batch([
    db.prepare(`SELECT * FROM crm_grupos ORDER BY nome`),
    db.prepare(SQL_MEMBROS),
    db.prepare(`SELECT cliente_id, local, acao, prioridade, curva, fat_30d, ultima, dados FROM crm_metricas WHERE json_extract(dados,'$.GRUPO_ID') IS NOT NULL`),
  ]);
  const porGrupo = new Map();
  for (const m of ms.results || []) { if (!porGrupo.has(m.grupo_id)) porGrupo.set(m.grupo_id, []); porGrupo.get(m.grupo_id).push(m); }
  const metDe = new Map();
  for (const m of mets.results || []) { const gid = (js(m.dados) || {}).GRUPO_ID; if (gid) metDe.set(gid, m); }
  let grupos = (gs.results || []).map((g) => montarGrupo(g, porGrupo.get(g.id) || [], metDe.get(g.id)));
  const total = grupos.length, cadastros = grupos.reduce((t, g) => t + g.membros.length, 0);
  const busca = nomeExibicao(limpar(q)).slice(0, 80);
  if (busca) grupos = grupos.filter((g) => g.nome.includes(busca) || g.membros.some((m) => m.nome.includes(busca)));
  const l = limpar(local).toUpperCase();
  if (GRUPO_LOCAIS.includes(l)) grupos = grupos.filter((g) => g.local === l);
  return { total, cadastros, grupos };
}

/** Grupo de um cadastro (ficha do /cadastros). */
export async function grupoDoCliente(env, clienteId) {
  const db = env.DB;
  const g = await db.prepare(`SELECT g.* FROM crm_grupo_membros gm JOIN crm_grupos g ON g.id = gm.grupo_id WHERE gm.cliente_id = ?`).bind(clienteId).first();
  if (!g) return null;
  const [ms, met] = await db.batch([
    db.prepare(`${SQL_MEMBROS.replace('GROUP BY gm.cliente_id', 'WHERE gm.grupo_id = ? GROUP BY gm.cliente_id')}`).bind(g.id),
    db.prepare(`SELECT cliente_id, local, acao, prioridade, curva, fat_30d, ultima, dados FROM crm_metricas WHERE json_extract(dados,'$.GRUPO_ID') = ?`).bind(g.id),
  ]);
  return montarGrupo(g, ms.results || [], (met.results || [])[0]);
}

// ------------------------------------------------------------ tela /cadastros: gravar
const novoGrupoId = () => 'GRP_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
const pendente = (db) => db.prepare(`INSERT INTO cid_estado(chave, valor) VALUES('crm_pendente','1') ON CONFLICT(chave) DO UPDATE SET valor='1', atualizado_em=CURRENT_TIMESTAMP`);
const bumpRev = (db) => db.prepare(`UPDATE cid_estado SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT), atualizado_em = CURRENT_TIMESTAMP WHERE chave = 'crm_data_rev'`);
const agoraIso = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19);
function evento(db, tipo, grupoId, autor, meta) {
  return db.prepare(`INSERT INTO crm_eventos(EVENTO_ID, DATA_HORA, ENTIDADE_TIPO, ENTIDADE_ID, TIPO_EVENTO, RESPONSAVEL_ID, ORIGEM, METADADOS_JSON) VALUES(?,?,?,?,?,?,?,?)`)
    .bind('EVT_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(), agoraIso(), 'GRUPO', grupoId, tipo, autor, 'CADASTROS_GRUPOS', JSON.stringify(meta || {}));
}

/** Cria ou atualiza um grupo. body: { id?, nome, membros: [ids], principalId, localModo } */
export async function salvarGrupo(env, b, autor) {
  const db = env.DB;
  const id = limpar(b.id);
  const nome = nomeExibicao(limpar(b.nome)).slice(0, 160);
  const membros = [...new Set((Array.isArray(b.membros) ? b.membros : []).map(limpar).filter(Boolean))];
  const localModo = MODOS.includes(limpar(b.localModo).toUpperCase()) ? limpar(b.localModo).toUpperCase() : 'AUTO';
  if (!nome) erro('Informe o nome do grupo.');
  if (membros.length < 2) erro('O grupo precisa de pelo menos 2 cadastros.');
  if (membros.length > GRUPO_MAX_MEMBROS) erro(`O grupo pode ter no máximo ${GRUPO_MAX_MEMBROS} cadastros.`);
  const principal = membros.includes(limpar(b.principalId)) ? limpar(b.principalId) : membros[0];
  const marcas = membros.map(() => '?').join(',');
  const [existe, conflito, atual] = await db.batch([
    db.prepare(`SELECT id FROM cid_clientes WHERE id IN (${marcas})`).bind(...membros),
    db.prepare(`SELECT gm.cliente_id, c.nome cliente, g.nome grupo FROM crm_grupo_membros gm JOIN crm_grupos g ON g.id = gm.grupo_id LEFT JOIN cid_clientes c ON c.id = gm.cliente_id
      WHERE gm.cliente_id IN (${marcas}) AND gm.grupo_id <> ?`).bind(...membros, id || '-'),
    db.prepare(`SELECT id, principal_id FROM crm_grupos WHERE id = ?`).bind(id || '-'),
  ]);
  const ok = new Set((existe.results || []).map((x) => x.id));
  const sumiu = membros.find((m) => !ok.has(m));
  if (sumiu) erro('Um dos cadastros não existe mais (foi juntado pela limpeza). Recarregue a tela e monte o grupo de novo.', 409, 'CADASTRO_SUMIU');
  const c = (conflito.results || [])[0];
  if (c) erro(`${c.cliente || c.cliente_id} já está no grupo ${c.grupo}. Um cadastro só pode estar em um grupo.`, 409, 'JA_EM_GRUPO');
  const antes = (atual.results || [])[0];
  if (id && !antes) erro('Grupo não encontrado. Recarregue a tela.', 404);

  const gid = id || novoGrupoId();
  const stmts = [];
  if (antes) stmts.push(db.prepare(`UPDATE crm_grupos SET nome=?, principal_id=?, local_modo=?, atualizado_por=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`).bind(nome, principal, localModo, autor, gid));
  else stmts.push(db.prepare(`INSERT INTO crm_grupos(id, nome, principal_id, local_modo, criado_por, atualizado_por) VALUES(?,?,?,?,?,?)`).bind(gid, nome, principal, localModo, autor, autor));
  stmts.push(db.prepare(`DELETE FROM crm_grupo_membros WHERE grupo_id=?`).bind(gid));
  for (const m of membros) stmts.push(db.prepare(`INSERT INTO crm_grupo_membros(cliente_id, grupo_id, incluido_por) VALUES(?,?,?)`).bind(m, gid, autor));
  // o que o CRM tinha nos outros cadastros (e no principal anterior) passa para o principal
  const pares = membros.filter((m) => m !== principal).map((m) => [m, principal]);
  if (antes && antes.principal_id !== principal && !membros.includes(antes.principal_id)) pares.push([antes.principal_id, principal]);
  stmts.push(...statementsMoverCrm(db, pares));
  stmts.push(evento(db, antes ? 'GRUPO_ALTERADO' : 'GRUPO_CRIADO', gid, autor, { nome, membros, principal, localModo }));
  stmts.push(pendente(db), bumpRev(db));
  for (let i = 0; i < stmts.length; i += 90) await db.batch(stmts.slice(i, i + 90));   // grupo comum cabe numa transacao so

  const abertas = await db.prepare(`SELECT COUNT(*) n FROM crm_tratativas WHERE upper(TIPO_ENTIDADE)='CLIENTE' AND FUNIL_ID='FUNIL_CLIENTES'
    AND upper(STATUS_TRATATIVA) IN ('ABERTA','PAUSADA') AND ENTIDADE_ID=?`).bind(principal).first();
  const avisos = num(abertas?.n) > 1 ? [`O grupo ficou com ${num(abertas.n)} tratativas abertas no Funil (cada cadastro tinha a sua). Confira e conclua as repetidas.`] : [];
  return { grupoId: gid, criado: !antes, avisos };
}

/** Desfaz o grupo. Os cadastros voltam separados ao CRM no proximo calculo. */
export async function desfazerGrupo(env, b, autor) {
  const db = env.DB;
  const id = limpar(b.id);
  const g = await db.prepare(`SELECT id, nome, principal_id FROM crm_grupos WHERE id=?`).bind(id).first();
  if (!g) erro('Grupo não encontrado. Recarregue a tela.', 404);
  await db.batch([
    db.prepare(`DELETE FROM crm_grupo_membros WHERE grupo_id=?`).bind(id),
    db.prepare(`DELETE FROM crm_grupos WHERE id=?`).bind(id),
    evento(db, 'GRUPO_DESFEITO', id, autor, { nome: g.nome, principal: g.principal_id }),
    pendente(db), bumpRev(db),
  ]);
  return { grupoId: id, nome: g.nome };
}

// ------------------------------------------------------------ sugestoes de grupo
const PALAVRAS_VAZIAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'A', 'O', 'AS', 'OS', 'LTDA', 'ME', 'EPP', 'SA', 'S', 'EIRELI', 'MEI', 'CIA', 'COM', 'IND']);
const SUFIXOS = /(\s+(LTDA|ME|EPP|S\s?A|EIRELI|MEI|S\/A))+\s*$/;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const nucleo = (s) => semAcento(s).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Nome-base: o que vem antes de " (" ou " - " (setor, filial, processo...), sem sufixo societario. */
export function nomeBase(nome) {
  let s = semAcento(nome);
  const corte = s.search(/\s*\(|\s+-\s+/);
  if (corte > 0) s = s.slice(0, corte);
  s = nucleo(s).replace(SUFIXOS, '').trim();
  return /[A-Z]{3,}/.test(s) && s.length >= 5 ? s : '';
}
/** Duas primeiras palavras com sentido (ignora DE, DA, LTDA...). */
export function inicioDoNome(nome) {
  const t = nucleo(nome).split(' ').filter((w) => w.length >= 3 && !PALAVRAS_VAZIAS.has(w));
  return t.length >= 2 ? t.slice(0, 2).join(' ') : '';
}
const palavras = (nome) => new Set(nucleo(nome).split(' ').filter((w) => w.length >= 4 && !PALAVRAS_VAZIAS.has(w)));

/**
 * Candidatos a grupo (funcao pura, testada).
 * clientes: [{ id, nome, ehPortal, valor, postagens }] ; contratos: [{ id, contrato, n }] ;
 * membroDe: Map(id -> { grupoId, grupoNome }) ; rejeitadas: Set(chave).
 */
export function montarSugestoes(clientes, contratos, membroDe, rejeitadas) {
  const info = new Map(clientes.map((c) => [c.id, c]));
  const brutos = [];
  const agrupar = (lista, chaveDe) => { const m = new Map(); for (const c of lista) { const k = chaveDe(c); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(c.id); } return m; };
  const portal = clientes.filter((c) => c.ehPortal);
  const porBase = agrupar(portal, (c) => nomeBase(c.nome));
  for (const [k, ids] of porBase) if (ids.length >= 2 && ids.length <= 12) brutos.push({ ids, score: 85, motivo: 'NOME_BASE', texto: `Mesmo nome-base: ${k}`, nome: k });
  const jaBase = new Set([...porBase.values()].filter((x) => x.length >= 2).map((x) => [...x].sort().join('|')));
  for (const [k, ids] of agrupar(portal, (c) => inicioDoNome(c.nome))) {
    if (ids.length < 2 || ids.length > 12 || jaBase.has([...ids].sort().join('|'))) continue;
    brutos.push({ ids, score: 60, motivo: 'INICIO_NOME', texto: `Mesmo início de nome: ${k}`, nome: k });
  }
  // contrato usado quase so por um cliente do Portal e por poucos outros cadastros (contrato compartilhado no balcao nao entra)
  const porContrato = new Map();
  for (const x of contratos) { if (!info.has(x.id)) continue; if (!porContrato.has(x.contrato)) porContrato.set(x.contrato, []); porContrato.get(x.contrato).push(x); }
  for (const [ctr, lista] of porContrato) {
    if (lista.length < 2 || lista.length > 4) continue;
    const tot = lista.reduce((t, x) => t + num(x.n), 0);
    const dono = [...lista].sort((a, b) => num(b.n) - num(a.n))[0];
    if (!info.get(dono.id).ehPortal || num(dono.n) / tot < 0.9) continue;
    const pDono = palavras(info.get(dono.id).nome);
    // so contrato nao prova nada (na base real: CEARA x escritorio de advocacia, VIVARA x pessoas fisicas). Exige nome parecido.
    const parecido = lista.filter((x) => x.id !== dono.id).every((x) => [...palavras(info.get(x.id).nome)].some((w) => pDono.has(w)));
    if (!parecido) continue;
    brutos.push({ ids: lista.map((x) => x.id), score: 75, motivo: 'MESMO_CONTRATO',
      texto: `Mesmo contrato ${ctr} e nome parecido`, nome: nomeBase(info.get(dono.id).nome) || nucleo(info.get(dono.id).nome) });
  }
  const porChave = new Map();
  for (const s of brutos) {
    const grupos = new Map();
    for (const id of s.ids) { const g = membroDe.get(id); if (g) grupos.set(g.grupoId, g); }
    if (grupos.size > 1) continue;                                          // cadastros ja em grupos diferentes: decisao humana
    const alvo = grupos.size ? [...grupos.values()][0] : null;
    const livres = s.ids.filter((id) => !membroDe.has(id));
    if (alvo ? livres.length < 1 : livres.length < 2) continue;
    const chave = (alvo ? alvo.grupoId + '|' : '') + [...livres].sort().join('|');
    if (rejeitadas.has(chave)) continue;
    const ant = porChave.get(chave);
    if (ant && ant.score >= s.score) continue;
    const cl = livres.map((id) => info.get(id)).sort((a, b) => (b.ehPortal - a.ehPortal) || num(b.valor) - num(a.valor));
    porChave.set(chave, { chave, score: s.score, motivo: s.motivo, texto: s.texto, alvo: alvo ? { id: alvo.grupoId, nome: alvo.grupoNome } : null,
      nomeSugerido: alvo ? alvo.grupoNome : (s.motivo === 'MESMO_CONTRATO' ? s.nome : (nomeBase(cl[0].nome) || s.nome)), clientes: cl,
      valor: cl.reduce((t, c) => t + num(c.valor), 0) });
  }
  // sugestão contida em outra de confiança igual ou maior (mesmo alvo) não aparece duas vezes
  const todas = [...porChave.values()];
  const ids = (s) => new Set(s.clientes.map((c) => c.id));
  const final = todas.filter((s) => { const a = ids(s); return !todas.some((t) => t !== s && t.score >= s.score && (t.alvo?.id || '') === (s.alvo?.id || '')
    && t.clientes.length > s.clientes.length && [...a].every((id) => ids(t).has(id))); });
  return final.sort((a, b) => b.score - a.score || b.valor - a.valor);
}

export async function sugestoesGrupos(env) {
  const db = env.DB;
  const [cl, ct, rj, mb] = await db.batch([
    db.prepare(`SELECT c.id, c.nome, c.portal_chave IS NOT NULL eh_portal, c.local_carteira, COALESCE(SUM(r.postagens),0) postagens, ROUND(COALESCE(SUM(r.valor),0),2) valor,
        MAX(r.ultima) ultima, COALESCE(SUM(r.local_agf),0) local_agf, COALESCE(SUM(r.local_balcao),0) local_balcao, COALESCE(SUM(r.local_metro),0) local_metro, GROUP_CONCAT(r.aba) abas
      FROM cid_clientes c LEFT JOIN cid_resumo r ON r.cliente_id = c.id GROUP BY c.id`),
    db.prepare(`SELECT n.cliente_id id, p.contrato, COUNT(*) n FROM cid_postagens p JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia
      JOIN cid_nos n ON n.chave = g.no_chave WHERE p.contrato <> '' AND p.estorno = 0 AND n.cliente_id IS NOT NULL GROUP BY 1, 2`),
    db.prepare(`SELECT chave FROM crm_grupo_sugestoes_rejeitadas`),
    db.prepare(`SELECT gm.cliente_id, gm.grupo_id, g.nome FROM crm_grupo_membros gm JOIN crm_grupos g ON g.id = gm.grupo_id`),
  ]);
  const clientes = (cl.results || []).map((c) => ({ id: c.id, nome: c.nome, ehPortal: !!Number(c.eh_portal), localCarteira: c.local_carteira || '', postagens: num(c.postagens),
    valor: num(c.valor), ultima: c.ultima || '', local_agf: num(c.local_agf), local_balcao: num(c.local_balcao), local_metro: num(c.local_metro), abas: c.abas || '' }));
  const membroDe = new Map((mb.results || []).map((x) => [x.cliente_id, { grupoId: x.grupo_id, grupoNome: x.nome }]));
  const lista = montarSugestoes(clientes, ct.results || [], membroDe, new Set((rj.results || []).map((x) => x.chave)));
  return { total: lista.length, sugestoes: lista.slice(0, 200) };
}

export async function rejeitarSugestao(env, b, autor) {
  const chave = limpar(b.chave);
  if (!chave || chave.length > 2000) erro('Sugestão inválida.');
  await env.DB.prepare(`INSERT INTO crm_grupo_sugestoes_rejeitadas(chave, autor) VALUES(?,?) ON CONFLICT(chave) DO NOTHING`).bind(chave, autor).run();
  return { chave };
}
export async function restaurarSugestao(env, b) {
  const chave = limpar(b.chave);
  await env.DB.prepare(`DELETE FROM crm_grupo_sugestoes_rejeitadas WHERE chave=?`).bind(chave).run();
  return { chave };
}
