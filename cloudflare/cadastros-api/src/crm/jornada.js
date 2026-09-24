/** Funis, tratativas (cards do kanban) e eventos. Regras do CRM3 antigo. */
import { text, upper, isYes, nowIso, hoje, addDays, ymd, hhmm, novoId, falhar, todos, um, insert, update, lote, bumpRev, evento,
  tipoEntidade, funilDoTipo, etapaPadraoDoFunil, statusDaEtapa, tratativaAberta, temColeta } from './util.js';
import { lerResponsaveis, indiceResponsaveis, pessoaId, idRealResponsavel, locaisPermitidos, localPermitido } from './config.js';
import { carregarClientes, carregarProspects, projetarCliente, projetarProspect, obterEntidade, snapshotEntidade } from './entidades.js';

// ------------------------------------------------------------ agenda (projecao compartilhada)
export function mapasTipos(tipos, resultados) {
  return { tipo: Object.fromEntries(tipos.map((t) => [text(t.TIPO_ATIVIDADE_ID), t])), res: Object.fromEntries(resultados.map((r) => [text(r.RESULTADO_ID), r])) };
}
export function projetarAgenda(r, mapas) {
  const t = mapas.tipo[text(r.TIPO_ATIVIDADE_ID)] || {}, res = mapas.res[text(r.RESULTADO_ID)] || {};
  return {
    agendaId: text(r.AGENDA_ID), tratativaId: text(r.TRATATIVA_ID), entidadeTipo: text(r.ENTIDADE_TIPO), entidadeId: text(r.ENTIDADE_ID),
    clienteId: text(r.CLIENTE_ID), prospectId: text(r.PROSPECT_ID), cliente: text(r.CLIENTE), local: text(r.LOCAL),
    dataProgramada: ymd(r.DATA_PROGRAMADA), horaProgramada: hhmm(r.HORA_PROGRAMADA), horaFimProgramada: hhmm(r.HORA_FIM_PROGRAMADA), blocoId: text(r.BLOCO_ID),
    tipoAtividadeId: text(r.TIPO_ATIVIDADE_ID), tipoAtividadeNome: text(t.NOME_EXIBICAO) || text(r.TIPO_ATIVIDADE), icone: text(t.ICONE),
    cor: text(t.COR) || text(r.TIPO_COR), statusAtividade: text(r.STATUS_ATIVIDADE), resultadoId: text(r.RESULTADO_ID),
    resultadoNome: text(res.NOME_EXIBICAO) || text(r.RESULTADO_ID), midiaRecomendadaCodigo: text(r.MIDIA_RECOMENDADA_CODIGO),
    midiaUsadaCodigo: text(r.MIDIA_USADA_CODIGO), linkMidiaDireto: text(r.LINK_MIDIA_USADA) || text(r.LINK_MIDIA_RECOMENDADA),
    responsavelId: text(r.RESPONSAVEL_ID), responsavelNome: text(r.RESPONSAVEL), observacao: text(r.OBSERVACAO) || text(r.OBS_EXECUCAO) || text(r.OBS_PLANEJADA),
  };
}
export async function lerMapasTipos(db) {
  const [t, r] = await db.batch([db.prepare(`SELECT * FROM crm_tipos_atividade`), db.prepare(`SELECT * FROM crm_resultados`)]);
  return mapasTipos(t.results || [], r.results || []);
}

// ------------------------------------------------------------ etapas
async function etapas(db) { return todos(db, `SELECT * FROM crm_etapas ORDER BY rowid`); }
export async function validarEtapa(db, etapaId, funilId) {
  const e = await um(db, `SELECT * FROM crm_etapas WHERE ETAPA_ID=?`, text(etapaId));
  if (!e || !isYes(e.ATIVA) || text(e.FUNIL_ID) !== text(funilId)) falhar('Etapa inválida para o funil: ' + text(etapaId));
  return e;
}
export async function tratativaAbertaDe(db, tipo, id, funil) {
  const rows = await todos(db, `SELECT * FROM crm_tratativas WHERE upper(TIPO_ENTIDADE)=? AND ENTIDADE_ID=? AND FUNIL_ID=? ORDER BY rowid`, tipo, id, funil);
  return rows.find(tratativaAberta) || null;
}

// ------------------------------------------------------------ GET get_crm_jornada_data
export async function getJornada(env, p, user) {
  const db = env.DB;
  const funilId = text(p.funilId), tipoEnt = upper(p.tipoEntidade || ''), status = upper(p.statusTratativa || ''), respParam = text(p.responsavelId);
  const resp = await lerResponsaveis(db), idx = indiceResponsaveis(resp);
  const quer = respParam ? pessoaId(respParam, idx) : '';
  const [trat, stg] = await Promise.all([todos(db, `SELECT * FROM crm_tratativas ${funilId ? 'WHERE FUNIL_ID=?' : ''} ORDER BY rowid`, ...(funilId ? [funilId] : [])), etapas(db)]);
  const ativas = stg.filter((e) => isYes(e.ATIVA)), porId = Object.fromEntries(ativas.map((e) => [e.ETAPA_ID, e]));
  const filtradas = trat.filter((t) => (!tipoEnt || upper(t.TIPO_ENTIDADE) === tipoEnt) && (!status || upper(t.STATUS_TRATATIVA) === status)
    && (!quer || pessoaId(t.RESPONSAVEL_ID, idx) === quer));
  const idsCli = filtradas.filter((t) => upper(t.TIPO_ENTIDADE) !== 'PROSPECT').map((t) => t.ENTIDADE_ID);
  const idsPro = filtradas.filter((t) => upper(t.TIPO_ENTIDADE) === 'PROSPECT').map((t) => t.ENTIDADE_ID);
  const [clis, pros, proximas] = await Promise.all([carregarClientes(db, { ids: idsCli }), carregarProspects(db, { ids: idsPro }), proximasAtividades(db)]);
  const perm = locaisPermitidos(user);
  const mapaC = new Map(clis.map((c) => [c.CLIENTE_ID, projetarCliente(c)])), mapaP = new Map(pros.map((x) => [x.PROSPECT_ID, projetarProspect(x)]));
  const items = [];
  for (const t of filtradas) {
    const ehP = upper(t.TIPO_ENTIDADE) === 'PROSPECT';
    const ent = (ehP ? mapaP : mapaC).get(t.ENTIDADE_ID);
    if (perm && (!ent || !localPermitido(perm, ent.local))) continue;          // responsavel ve so os LOCAIS dele
    items.push(projetarTratativa(t, ent || {}, porId[t.ETAPA_ID] || {}, proximas.get(t.TRATATIVA_ID) || null));
  }
  const colunas = ativas.filter((e) => isYes(e.EXIBE_KANBAN) && (!funilId || e.FUNIL_ID === funilId)).sort((a, b) => (Number(a.ORDEM) || 999) - (Number(b.ORDEM) || 999))
    .map((e) => { const l = items.filter((x) => x.etapaId === e.ETAPA_ID); return { etapaId: e.ETAPA_ID, nome: text(e.NOME_EXIBICAO), cor: text(e.COR), icone: text(e.ICONE), total: l.length, items: l }; });
  const uniq = (k) => [...new Set(items.map((x) => text(x[k])).filter(Boolean))].sort();
  return { ok: true, items, columns: colunas, filters: { responsaveis: uniq('responsavelId'), etapas: uniq('etapaId'), recomendacoes: uniq('recomendacao'), locais: uniq('local') } };
}

function projetarTratativa(t, e, st, prox) {
  return {
    tratativaId: text(t.TRATATIVA_ID), tipoEntidade: text(t.TIPO_ENTIDADE), entidadeId: text(t.ENTIDADE_ID), funilId: text(t.FUNIL_ID), etapaId: text(t.ETAPA_ID),
    etapaNome: text(st.NOME_EXIBICAO), etapaCor: text(st.COR), statusTratativa: text(t.STATUS_TRATATIVA),
    cliente: text(e.cliente || e.nomeFantasia || e.razaoSocial || t.ENTIDADE_ID), local: text(e.local), curva: text(e.curva),
    recomendacao: text(e.acaoEngine || t.ACAO_ENGINE_SNAPSHOT), subAcao: text(e.subAcao || t.SUB_ACAO_SNAPSHOT),
    prioridade: text(e.prioridadeFila || e.prioridade || t.PRIORIDADE_SNAPSHOT), diasSemPostar: Number(e.diasSemPostar) || 0,
    ultimaPostagemLabel: text(e.ultimaPostagemLabel), responsavelId: text(t.RESPONSAVEL_ID), proximoFollowupEm: ymd(t.PROXIMO_FOLLOWUP_EM), proximaAtividade: prox,
  };
}

async function proximasAtividades(db) {
  const h = hoje();
  const rows = await todos(db, `SELECT * FROM crm_agenda WHERE DATA_PROGRAMADA BETWEEN ? AND ? AND TRATATIVA_ID <> '' ORDER BY DATA_PROGRAMADA, HORA_PROGRAMADA`, h, addDays(h, 365));
  const mapas = await lerMapasTipos(db);
  const out = new Map();
  for (const r of rows) {
    if (upper(r.STATUS_ATIVIDADE) !== 'PLANEJADO') continue;
    const a = projetarAgenda(r, mapas);
    if (temColeta(`${a.tipoAtividadeId} ${a.tipoAtividadeNome}`)) continue;
    const atual = out.get(a.tratativaId);
    if (!atual || a.dataProgramada + a.horaProgramada < atual.dataProgramada + atual.horaProgramada) out.set(a.tratativaId, a);
  }
  return out;
}

// ------------------------------------------------------------ POST create_tratativa
export async function criarTratativa(env, p, user) {
  const db = env.DB;
  const tipo = tipoEntidade(p.tipoEntidade || p.origemTipo);
  const id = text(p.entidadeId || p.origemId || p.clienteId || p.prospectId);
  if (!id) falhar('entidadeId obrigatório.');
  const funil = text(p.funilId) || funilDoTipo(tipo);
  const ent = await obterEntidade(db, tipo, id);
  if (!ent) falhar(`Entidade não encontrada: ${tipo} ${id}`);
  const aberta = await tratativaAbertaDe(db, tipo, id, funil);
  if (aberta && !isYes(p.permitirNova)) return { ok: true, created: false, tratativaId: aberta.TRATATIVA_ID, message: 'Já existe tratativa ativa para esta entidade.' };
  const etapaId = text(p.etapaId) || etapaPadraoDoFunil(funil);
  const etapa = await validarEtapa(db, etapaId, funil);
  const agora = nowIso(), trtId = novoId('TRT_', 8);
  const acao = tipo === 'CLIENTE' ? text(ent.acaoEngine || ent.acao) : '', sub = tipo === 'CLIENTE' ? text(ent.subAcao) : '';
  const prio = tipo === 'CLIENTE' ? text(ent.prioridadeFila) : text(ent.prioridade);
  let respId = text(p.responsavelId);
  if (!respId) respId = idRealResponsavel(ent.responsavelId || ent.responsavel || '', await lerResponsaveis(db));
  const obj = {
    TRATATIVA_ID: trtId, TIPO_ENTIDADE: tipo, ENTIDADE_ID: id, FUNIL_ID: funil, ETAPA_ID: etapaId,
    STATUS_TRATATIVA: statusDaEtapa(etapa.TIPO_ETAPA),                           // status coerente com a etapa (antes: sempre ABERTA)
    ORIGEM: text(p.origem) || 'CRM_PORTAL', ACAO_ENGINE_SNAPSHOT: acao, SUB_ACAO_SNAPSHOT: sub, PRIORIDADE_SNAPSHOT: prio, RESPONSAVEL_ID: respId,
    ABERTA_EM: agora, ETAPA_ATUALIZADA_EM: agora, PROXIMO_FOLLOWUP_EM: text(p.proximoFollowupEm), UPDATED_BY: text(p.updatedBy) || respId || 'CRM_PORTAL',
    ATUALIZADO_EM: agora, MOTIVO_ABERTURA: text(p.motivoAbertura) || acao, CRIADO_POR: text(p.createdBy) || respId || text(user?.username) || 'CRM_PORTAL',
  };
  const stmts = [insert(db, 'crm_tratativas', obj)];
  await snapshotEntidade(db, tipo, id, { TRATATIVA_ATIVA_ID: tratativaAberta(obj) ? trtId : '' }, stmts);
  stmts.push(evento(db, { entidadeTipo: tipo, entidadeId: id, tratativaId: trtId, tipoEvento: 'TRATATIVA_CRIADA', valorNovo: etapaId, responsavelId: respId,
    origem: obj.ORIGEM, metadata: { acaoEngine: acao, subAcao: sub } }), bumpRev(db));
  await lote(db, stmts);
  return { ok: true, created: true, tratativaId: trtId, etapaId };
}

/** Tratativa inicial de um cadastro novo (nunca derruba o cadastro). */
export async function criarTratativaDeCadastro(env, tipo, id, p, user) {
  try {
    const funil = funilDoTipo(tipo);
    let etapa = text(p.etapaFunil || p.ETAPA_FUNIL);
    if (etapa) { const e = await um(env.DB, `SELECT * FROM crm_etapas WHERE ETAPA_ID=?`, etapa); if (!e || !isYes(e.ATIVA) || e.FUNIL_ID !== funil) etapa = ''; }
    const r = await criarTratativa(env, { tipoEntidade: tipo, entidadeId: id, funilId: funil, etapaId: etapa || etapaPadraoDoFunil(funil),
      responsavelId: text(p.responsavelId || p.responsavel), origem: 'CRM_PORTAL_CADASTRO', createdBy: text(p.updatedBy || p.createdBy) || text(user?.username) }, user);
    return r.tratativaId || '';
  } catch (e) { console.warn('[CRM] tratativa do cadastro', e?.message || e); return ''; }
}

// ------------------------------------------------------------ POST move_tratativa
export async function moverTratativa(env, p, user, { semRev = false } = {}) {
  const db = env.DB;
  const id = text(p.tratativaId), destino = text(p.etapaId || p.etapaDestinoId);
  if (!id || !destino) falhar('tratativaId e etapaId são obrigatórios.');
  const t = await um(db, `SELECT * FROM crm_tratativas WHERE TRATATIVA_ID=?`, id);
  if (!t) falhar('Tratativa não encontrada.');
  const etapa = await validarEtapa(db, destino, t.FUNIL_ID);
  const status = statusDaEtapa(etapa.TIPO_ETAPA), agora = nowIso();
  const quem = text(p.updatedBy) || text(p.responsavelId) || text(user?.username) || 'CRM_PORTAL';
  const patch = { ETAPA_ID: destino, ETAPA_ATUALIZADA_EM: agora, STATUS_TRATATIVA: status, UPDATED_BY: quem, ATUALIZADO_EM: agora };
  const fecha = status === 'CONCLUIDA' || status === 'ENCERRADA';
  if (fecha) Object.assign(patch, { ENCERRADA_EM: agora, FECHADA_POR: quem, MOTIVO_ENCERRAMENTO: text(p.motivo) || text(etapa.NOME_EXIBICAO) });
  else Object.assign(patch, { ENCERRADA_EM: '', FECHADA_POR: '', MOTIVO_ENCERRAMENTO: '' });   // reabrir limpa o fechamento
  const stmts = [update(db, 'crm_tratativas', 'TRATATIVA_ID', id, patch)];
  const tipo = tipoEntidade(t.TIPO_ENTIDADE);
  if (tipo === 'PROSPECT') stmts.push(db.prepare(`UPDATE crm_prospects SET ETAPA_FUNIL=?, UPDATED_AT=? WHERE PROSPECT_ID=?`).bind(destino, agora, t.ENTIDADE_ID));
  await snapshotEntidade(db, tipo, t.ENTIDADE_ID, { TRATATIVA_ATIVA_ID: fecha ? '' : id }, stmts);
  stmts.push(evento(db, { entidadeTipo: t.TIPO_ENTIDADE, entidadeId: t.ENTIDADE_ID, tratativaId: id, tipoEvento: 'ETAPA_ALTERADA', valorAnterior: t.ETAPA_ID,
    valorNovo: destino, responsavelId: text(p.responsavelId), origem: 'CRM_PORTAL', metadata: { statusTratativa: status } }));
  if (!semRev) stmts.push(bumpRev(db));
  await lote(db, stmts);
  return { ok: true, tratativaId: id, etapaAnterior: text(t.ETAPA_ID), etapaId: destino, statusTratativa: status };
}

// ------------------------------------------------------------ POST move_tratativas_lote
export async function moverTratativasLote(env, p, user) {
  const db = env.DB;
  const destino = text(p.etapaId || p.etapaDestinoId);
  if (!destino) falhar('etapaId (etapa de destino) é obrigatório.');
  const teste = ['TESTE', 'DRY_RUN', 'DRYRUN', 'SIMULAR'].includes(upper(p.modo || 'APLICAR'));
  const funil = text(p.funilId) || 'FUNIL_PROSPECTS';
  const trats = (Array.isArray(p.tratativaIds) ? p.tratativaIds : []).map(text).filter(Boolean);
  const pros = (Array.isArray(p.prospectIds) ? p.prospectIds : Array.isArray(p.entidadeIds) ? p.entidadeIds : []).map(text).filter(Boolean);
  if (!trats.length && !pros.length) falhar('Informe prospectIds ou tratativaIds.');
  const etapa = await validarEtapa(db, destino, funil);
  const respId = idRealResponsavel(p.responsavelId, await lerResponsaveis(db));       // grava o id real, nao o nome
  const itens = [];
  for (const id of trats) {
    try {
      const t = await um(db, `SELECT * FROM crm_tratativas WHERE TRATATIVA_ID=?`, id);
      if (!t) { itens.push({ id, acao: 'ERRO', de: '', para: destino, msg: 'Tratativa não encontrada.' }); continue; }
      if (t.ETAPA_ID === destino) { itens.push({ id, acao: 'PULADO', de: t.ETAPA_ID, para: destino, msg: 'Já está na etapa de destino.' }); continue; }
      if (teste) { itens.push({ id, acao: 'MOVER', de: t.ETAPA_ID, para: destino, msg: '(teste) seria movida.' }); continue; }
      const r = await moverTratativa(env, { tratativaId: id, etapaId: destino, responsavelId: respId, updatedBy: respId }, user, { semRev: true });
      itens.push({ id, acao: 'MOVIDO', de: r.etapaAnterior, para: r.etapaId, msg: '' });
    } catch (e) { itens.push({ id, acao: 'ERRO', de: '', para: destino, msg: e.message }); }
  }
  for (const pid of pros) {
    try {
      const aberta = await tratativaAbertaDe(db, 'PROSPECT', pid, funil);
      if (aberta) {
        if (aberta.ETAPA_ID === destino) { itens.push({ id: pid, acao: 'PULADO', de: aberta.ETAPA_ID, para: destino, msg: `Já está na etapa de destino (${aberta.TRATATIVA_ID}).` }); continue; }
        if (teste) { itens.push({ id: pid, acao: 'MOVER', de: aberta.ETAPA_ID, para: destino, msg: `(teste) moveria ${aberta.TRATATIVA_ID}.` }); continue; }
        const r = await moverTratativa(env, { tratativaId: aberta.TRATATIVA_ID, etapaId: destino, responsavelId: respId, updatedBy: respId }, user, { semRev: true });
        itens.push({ id: pid, acao: 'MOVIDO', de: r.etapaAnterior, para: r.etapaId, msg: aberta.TRATATIVA_ID });
        continue;
      }
      const existe = await um(db, `SELECT PROSPECT_ID FROM crm_prospects WHERE PROSPECT_ID=?`, pid);
      if (!existe) { itens.push({ id: pid, acao: 'ERRO', de: '', para: destino, msg: 'Prospect não encontrado.' }); continue; }
      if (teste) { itens.push({ id: pid, acao: 'CRIAR', de: '', para: destino, msg: '(teste) criaria tratativa na etapa.' }); continue; }
      const c = await criarTratativa(env, { tipoEntidade: 'PROSPECT', entidadeId: pid, funilId: funil, etapaId: destino, responsavelId: respId, origem: 'CRM_PORTAL_LOTE' }, user);
      if (c.created) {
        await db.prepare(`UPDATE crm_prospects SET ETAPA_FUNIL=? WHERE PROSPECT_ID=?`).bind(destino, pid).run();
        itens.push({ id: pid, acao: 'CRIADO', de: '', para: destino, msg: c.tratativaId });
      } else itens.push({ id: pid, acao: 'ERRO', de: '', para: destino, msg: 'Não foi possível criar/mover.' });
    } catch (e) { itens.push({ id: pid, acao: 'ERRO', de: '', para: destino, msg: e.message }); }
  }
  const conta = (...a) => itens.filter((x) => a.includes(x.acao)).length;
  const movidos = conta('MOVER', 'MOVIDO'), criados = conta('CRIAR', 'CRIADO');
  if (!teste && movidos + criados > 0) await bumpRev(db).run();
  return { ok: true, modo: teste ? 'TESTE' : 'APLICAR', etapaId: destino, etapaNome: text(etapa.NOME_EXIBICAO) || destino, total: trats.length + pros.length,
    movidos, criados, pulados: conta('PULADO'), erros: conta('ERRO'), itens };
}
