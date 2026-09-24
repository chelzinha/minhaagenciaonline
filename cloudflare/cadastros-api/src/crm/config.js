/** Configuracao do CRM (antes: abas de configuracao da planilha) e responsaveis. */
import { text, upper, isYes, temColeta, normResp, nowIso, todos, lote, insert, ordemNum, ptSort, upperNoAccents } from './util.js';

export const CRM_LOCAIS = ['AGF', 'BALCAO', 'METRO'];

// ------------------------------------------------------------ escopo por LOCAL
/** null = sem restricao (admin); Set = LOCAIS do responsavel (vazio = nenhum). */
export function locaisPermitidos(user) {
  if (String(user?.role || '').toLowerCase() === 'admin') return null;
  let v = user?.crm?.locais ?? [];
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = v.split(','); } }
  return new Set((Array.isArray(v) ? v : []).map((x) => upperNoAccents(x).trim()).filter((x) => CRM_LOCAIS.includes(x)));
}
export const localPermitido = (perm, local) => !perm || perm.has(upperNoAccents(local).trim());

// ------------------------------------------------------------ responsaveis
export async function lerResponsaveis(db) {
  return todos(db, `SELECT * FROM crm_responsaveis ORDER BY rowid`);
}
/** Indice token normalizado -> RESPONSAVEL_ID normalizado (id, username e nome), como crm3_buildResponsibleIndex_. */
export function indiceResponsaveis(rows) {
  const idx = {};
  for (const r of rows) {
    const id = normResp(r.RESPONSAVEL_ID);
    if (!id) continue;
    for (const t of [r.RESPONSAVEL_ID, r.USERNAME, r.DISPLAY_NAME]) { const k = normResp(t); if (k) idx[k] = id; }
  }
  return idx;
}
export const pessoaId = (v, idx) => { const k = normResp(v); return k ? (idx[k] || k) : ''; };
/** respRealId: id real (caixa original) a partir de id, username ou nome. */
export function idRealResponsavel(v, rows) {
  const k = normResp(v);
  if (!k) return '';
  const r = rows.find((x) => [x.RESPONSAVEL_ID, x.USERNAME, x.DISPLAY_NAME].some((t) => normResp(t) === k));
  return r ? text(r.RESPONSAVEL_ID) : text(v);
}
/** resolveResponsible(id, nome): exato por id, senao exato por nome. */
export function resolverResponsavel(id, nome, rows) {
  id = text(id); nome = text(nome);
  if (id) { const r = rows.find((x) => text(x.RESPONSAVEL_ID) === id); if (r) return { id, nome: text(r.DISPLAY_NAME) || nome }; }
  else if (nome) { const r = rows.find((x) => text(x.DISPLAY_NAME) === nome); if (r) return { id: text(r.RESPONSAVEL_ID), nome }; }
  return { id, nome };
}

const sim = (b) => (b ? 'SIM' : 'NAO');
function linhaResponsavel(u) {
  const c = u.crm || {};
  return {
    RESPONSAVEL_ID: text(c.responsavelId), USERNAME: text(u.username), DISPLAY_NAME: text(u.displayName || u.username), ROLE: text(u.role),
    USER_ACTIVE: sim(u.active !== false), CRM_LINKED: sim(!!c.linked), AGENDA_SCOPE: text(c.agendaScope) || 'OWN',
    CAN_EDIT_CLIENTS: sim(c.canEditClients), CAN_EDIT_PROSPECTS: sim(c.canEditProspects), CAN_MOVE_FUNNEL: sim(c.canMoveFunnel),
    CAN_COMPLETE_ACTIVITIES: sim(c.canCompleteActivities), CAN_VIEW_TEAM: sim(c.canViewTeam), CAN_VIEW_INDICATORS: sim(c.canViewIndicators),
    UPDATED_AT: nowIso(), LOCAIS: (Array.isArray(c.locais) ? c.locais : []).join(';'),
  };
}
const upsertResp = (db, row) => insert(db, 'crm_responsaveis', row, { ou: 'OR REPLACE' });

let ultimaSyncAdmin = 0;
/**
 * Mantem crm_responsaveis igual ao cadastro de usuarios (AGF_AUTH), sem planilha:
 * - o proprio usuario da sessao e gravado sempre que muda;
 * - quando um admin usa o CRM, a lista completa e buscada no AGF_AUTH (no maximo a cada 10 min).
 */
export async function sincronizarResponsaveis(env, user, token) {
  const db = env.DB;
  const stmts = [];
  if (user?.crm?.responsavelId && user.crm.linked) stmts.push(upsertResp(db, linhaResponsavel({ ...user, active: true })));
  const admin = String(user?.role || '').toLowerCase() === 'admin';
  if (admin && token && env.AGF_AUTH_API_URL && Date.now() - ultimaSyncAdmin > 10 * 60 * 1000) {
    ultimaSyncAdmin = Date.now();
    try {
      const r = await fetch(env.AGF_AUTH_API_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'adminListUsers', token }), redirect: 'follow' });
      const d = await r.json();
      if (d && d.ok !== false && Array.isArray(d.users)) {
        const vinculados = d.users.filter((u) => u.crm && u.crm.responsavelId);
        for (const u of vinculados) stmts.push(upsertResp(db, linhaResponsavel(u)));
        const ids = new Set(vinculados.map((u) => text(u.crm.responsavelId)));
        const atuais = await todos(db, `SELECT RESPONSAVEL_ID FROM crm_responsaveis`);
        for (const a of atuais) if (!ids.has(a.RESPONSAVEL_ID)) stmts.push(db.prepare(`UPDATE crm_responsaveis SET USER_ACTIVE='NAO', CRM_LINKED='NAO' WHERE RESPONSAVEL_ID=?`).bind(a.RESPONSAVEL_ID));
      }
    } catch (e) { console.warn('[CRM] sincronizar responsaveis', e?.message || e); ultimaSyncAdmin = 0; }
  }
  if (stmts.length) await lote(db, stmts);
}

// ------------------------------------------------------------ config
const semColetaTipo = (x) => !temColeta(`${x.TIPO_ATIVIDADE_ID} ${x.NOME_EXIBICAO} ${x.CATEGORIA}`);
const semColetaRes = (x) => !temColeta(`${x.RESULTADO_ID} ${x.TIPO_ATIVIDADE_ID} ${x.NOME_EXIBICAO}`);
function escopoLocal(exibirEm, escopo) {
  const partes = upperNoAccents(exibirEm || 'CRM').split(/[;,|/]+/).map((s) => s.trim()).filter(Boolean);
  const lista = partes.length ? partes : ['CRM'];
  if (lista.some((p) => ['AMBOS', 'TODOS', 'ALL'].includes(p))) return true;
  return lista.includes(escopo === 'PROSPECT' ? 'PROSPECTS' : escopo);
}
const projLocal = (x) => ({ localId: text(x.LOCAL_ID), nome: text(x.NOME_EXIBICAO), ordem: Number(x.ORDEM) || 999, ativo: text(x.ATIVO), tipo: text(x.TIPO), obs: text(x.OBS), exibirEm: text(x.EXIBIR_EM) || 'CRM' });
export function projMidia(x) {
  return { codigo: text(x.CODIGO_MIDIA), nome: text(x.NOME_MIDIA), titulo: text(x.NOME_MIDIA), tipo: text(x.TIPO), link: text(x.LINK),
    quandoUsar: text(x.QUANDO_USAR), descricao: text(x.QUANDO_USAR), acao: text(x.ACAO), subcategoria: text(x.SUBCATEGORIA),
    ativa: !['NAO', 'NÃO', 'FALSE', '0'].includes(upperNoAccents(x.ATIVA)) };
}
export function projBloco(x) {
  return { blocoId: text(x.BLOCO_ID), ordem: Number(x.ORDEM) || 0, horaInicio: text(x.HORA_INICIO), horaFim: text(x.HORA_FIM), nomeBloco: text(x.NOME_BLOCO),
    tipoAtividade: text(x.TIPO_ATIVIDADE), cor: text(x.COR_PADRAO) || text(x.COR), ativo: text(x.ATIVO) || 'SIM', permiteAgendamento: text(x.PERMITE_AGENDAMENTO) || 'SIM', obs: text(x.OBS) };
}

/** Tabelas de configuracao lidas de uma vez (usadas pelas regras). */
export async function lerTabelasConfig(db) {
  const [funis, etapas, tipos, resultados, transicoes, legado, segmentos, locais, listas, blocos, midias] = await db.batch([
    db.prepare(`SELECT * FROM crm_funis ORDER BY rowid`), db.prepare(`SELECT * FROM crm_etapas ORDER BY rowid`),
    db.prepare(`SELECT * FROM crm_tipos_atividade ORDER BY rowid`), db.prepare(`SELECT * FROM crm_resultados ORDER BY rowid`),
    db.prepare(`SELECT * FROM crm_transicoes ORDER BY ID`), db.prepare(`SELECT * FROM crm_transicoes_legado ORDER BY ORDEM, rowid`),
    db.prepare(`SELECT * FROM crm_segmentos ORDER BY rowid`), db.prepare(`SELECT * FROM crm_locais ORDER BY rowid`),
    db.prepare(`SELECT * FROM crm_listas ORDER BY rowid`), db.prepare(`SELECT * FROM crm_blocos ORDER BY rowid`), db.prepare(`SELECT * FROM crm_midias ORDER BY rowid`),
  ]);
  const r = (x) => x.results || [];
  return { funis: r(funis), etapas: r(etapas), tipos: r(tipos), resultados: r(resultados), transicoes: r(transicoes), legado: r(legado),
    segmentos: r(segmentos), locais: r(locais), listas: r(listas), blocos: r(blocos), midias: r(midias) };
}

export function transicoesJornada(t) {
  return t.transicoes.filter((x) => isYes(x.ATIVA_JORNADA) && text(x.FUNIL_ID) && text(x.RESULTADO_ID)).map((x) => ({
    funilId: text(x.FUNIL_ID), etapaOrigemId: text(x.ETAPA_ORIGEM_ID), resultadoId: text(x.RESULTADO_ID), etapaDestinoId: text(x.ETAPA_DESTINO_ID),
    followupDias: Number(x.FOLLOWUP_DIAS_JORNADA) || 0, statusTratativaDestino: text(x.STATUS_TRATATIVA_DESTINO), ativa: true, descricao: text(x.DESCRICAO_JORNADA),
  }));
}
export const midiasAtivas = (t) => t.midias.map(projMidia).filter((m) => m.ativa && m.codigo)
  .sort((a, b) => ptSort([a.acao || 'ZZZ', a.subcategoria || 'ZZZ', a.titulo || a.nome || a.codigo].join('|'), [b.acao || 'ZZZ', b.subcategoria || 'ZZZ', b.titulo || b.nome || b.codigo].join('|')));

/** get_crm_config_v3 (mesmo formato). LOCAIS do CRM e de prospects restritos aos do responsavel. */
export async function montarConfig(env, user) {
  const db = env.DB;
  const t = await lerTabelasConfig(db);
  const resp = await lerResponsaveis(db);
  const perm = locaisPermitidos(user);
  const lista = (nome) => t.listas.filter((x) => upper(x.LISTA) === nome && !['NAO', 'NÃO', 'FALSE'].includes(text(x.ATIVO).toUpperCase()) && text(x.CODIGO))
    .map((x) => ({ codigo: text(x.CODIGO), nome: text(x.NOME_EXIBICAO) || text(x.CODIGO), ordem: Number(x.ORDEM) || 0 })).sort((a, b) => a.ordem - b.ordem);
  const locaisEscopo = (esc) => t.locais.map(projLocal)
    .filter((x) => x.nome && isYes(x.ativo || 'SIM') && escopoLocal(x.exibirEm, esc) && localPermitido(perm, x.localId || x.nome))
    .sort((a, b) => (a.ordem - b.ordem) || ptSort(a.nome, b.nome));
  const locais = locaisEscopo('CRM'), prospectLocais = locaisEscopo('PROSPECTS');
  const vistos = new Set(), homeLocais = [];
  for (const l of [...locais, ...prospectLocais]) { const k = normResp(l.nome || l.localId); if (!vistos.has(k)) { vistos.add(k); homeLocais.push(l); } }
  return {
    ok: true, version: '3.0.0',
    prospectPotenciais: lista('POTENCIAL'), prospectPrioridades: lista('PRIORIDADE'), prospectOrigens: lista('ORIGEM_LEAD'), prospectStatus: lista('STATUS_PROSPECT'),
    funis: t.funis.filter((x) => isYes(x.ATIVO)),
    etapas: t.etapas.filter((x) => isYes(x.ATIVA)),
    tiposAtividade: t.tipos.filter((x) => isYes(x.ATIVA) && semColetaTipo(x)).sort((a, b) => ordemNum(a) - ordemNum(b)),
    resultados: t.resultados.filter((x) => isYes(x.ATIVA) && semColetaRes(x)).sort((a, b) => ordemNum(a) - ordemNum(b)),
    blocos: t.blocos.map(projBloco).filter((x) => isYes(x.ativo) && isYes(x.permiteAgendamento)).sort((a, b) => a.ordem - b.ordem),
    midias: midiasAtivas(t),
    responsaveis: resp.filter((x) => isYes(x.USER_ACTIVE) && isYes(x.CRM_LINKED)),
    transicoes: transicoesJornada(t),
    segmentos: t.segmentos.map((x) => ({ segmentoId: text(x.SEGMENTO_ID), nome: text(x.NOME_EXIBICAO), ativo: text(x.ATIVO), ordem: Number(x.ORDEM) || 999 }))
      .filter((x) => x.nome && isYes(x.ativo || 'SIM')).sort((a, b) => (a.ordem - b.ordem) || ptSort(a.nome, b.nome)),
    locais, prospectLocais, prospectsLocais: prospectLocais, homeLocais,
  };
}
