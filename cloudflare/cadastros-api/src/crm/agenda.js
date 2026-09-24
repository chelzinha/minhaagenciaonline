/** Agenda (atividades), checklist de visita, anotacoes e indicadores do CRM. Regras do CRM3 antigo. */
import { text, upper, upperNoAccents, isYes, nowIso, hoje, addDays, weekStart, diaSemana, somaMinutos, ymd, novoId, falhar, todos, um, insert, update, lote,
  bumpRev, evento, tipoEntidade, funilDoTipo, tratativaAberta, temColeta } from './util.js';
import { lerResponsaveis, indiceResponsaveis, pessoaId, resolverResponsavel, locaisPermitidos, localPermitido, projBloco, projMidia } from './config.js';
import { obterEntidade, snapshotEntidade } from './entidades.js';
import { projetarAgenda, lerMapasTipos, criarTratativa, tratativaAbertaDe, validarEtapa } from './jornada.js';

// ------------------------------------------------------------ GET get_crm_agenda_v3
export async function getAgenda(env, p, user) {
  const db = env.DB;
  const start = text(p.start || p.dataInicio) || weekStart(hoje());
  const end = text(p.end || p.dataFim) || addDays(start, 6);
  const status = upper(p.status || ''), tipoId = text(p.tipoAtividadeId), respParam = text(p.responsavelId);
  const [rows, mapas, resp] = await Promise.all([
    todos(db, `SELECT * FROM crm_agenda WHERE DATA_PROGRAMADA BETWEEN ? AND ? ORDER BY DATA_PROGRAMADA, HORA_PROGRAMADA, rowid`, start, end),
    lerMapasTipos(db), lerResponsaveis(db)]);
  const idx = indiceResponsaveis(resp), quer = respParam ? pessoaId(respParam, idx) : '';
  const perm = locaisPermitidos(user);
  const items = rows.map((r) => projetarAgenda(r, mapas)).filter((a) => a.agendaId && !temColeta(`${a.tipoAtividadeId} ${a.tipoAtividadeNome}`)
    && (!status || upper(a.statusAtividade) === status) && (!tipoId || a.tipoAtividadeId === tipoId)
    && (!quer || pessoaId(a.responsavelId, idx) === quer) && (!perm || !a.local || localPermitido(perm, a.local)));
  const uniq = (k) => [...new Set(items.map((x) => text(x[k])).filter(Boolean))].sort();
  return { ok: true, start, end, items, filters: { responsaveis: uniq('responsavelId'), tiposAtividade: uniq('tipoAtividadeId'), status: uniq('statusAtividade') } };
}

// ------------------------------------------------------------ POST save_atividade
export async function salvarAtividade(env, p, user) {
  const db = env.DB;
  const req = text(p.requestId);
  if (req) { const ja = await um(db, `SELECT AGENDA_ID FROM crm_agenda WHERE REQUEST_ID=?`, req); if (ja) return { ok: true, created: false, agendaId: ja.AGENDA_ID, idempotent: true }; }
  const tipo = tipoEntidade(p.tipoEntidade || p.origemTipo);
  const entId = text(p.entidadeId || p.origemId || p.clienteId || p.prospectId);
  if (!entId) falhar('entidadeId obrigatório.');
  const ent = await obterEntidade(db, tipo, entId);
  if (!ent) falhar(`Entidade não encontrada: ${tipo} ${entId}`);
  let tratId = text(p.tratativaId), trat;
  if (!tratId) {
    trat = await tratativaAbertaDe(db, tipo, entId, funilDoTipo(tipo));
    if (!trat) {
      const c = await criarTratativa(env, { tipoEntidade: tipo, entidadeId: entId, responsavelId: p.responsavelId, origem: 'AGENDA', createdBy: p.createdBy }, user);
      trat = await um(db, `SELECT * FROM crm_tratativas WHERE TRATATIVA_ID=?`, c.tratativaId);
    }
    tratId = trat.TRATATIVA_ID;
  } else {
    trat = await um(db, `SELECT * FROM crm_tratativas WHERE TRATATIVA_ID=?`, tratId);
    if (!trat) falhar('Tratativa não encontrada: ' + tratId);
  }
  const tipoId = text(p.tipoAtividadeId);
  if (temColeta(tipoId)) falhar('COLETAS foi desativado. Selecione outro tipo de atividade.');
  const t = await um(db, `SELECT * FROM crm_tipos_atividade WHERE TIPO_ATIVIDADE_ID=?`, tipoId);
  if (!t || !isYes(t.ATIVA)) falhar('Tipo de atividade inválido ou inativo.');
  if (tipo === 'CLIENTE' && !isYes(t.APLICA_CLIENTE)) falhar('Tipo de atividade não permitido para clientes.');
  if (tipo === 'PROSPECT' && !isYes(t.APLICA_PROSPECT)) falhar('Tipo de atividade não permitido para prospects.');
  const data = ymd(p.dataProgramada || p.data);
  if (!data) falhar('Data programada obrigatória.');
  const bloco = text(p.blocoId) ? await um(db, `SELECT * FROM crm_blocos WHERE BLOCO_ID=?`, text(p.blocoId)) : null;
  const b = bloco ? projBloco(bloco) : {};
  const dur = Number(p.duracaoMin || t.DURACAO_PADRAO_MIN || 30) || 30;
  const ini = text(p.horaProgramada || p.horaInicio) || text(b.horaInicio);
  if (isYes(t.USA_BLOCO) && !bloco && !ini) falhar('Selecione uma janela ou informe horário para esta atividade.');
  const fim = text(p.horaFimProgramada || p.horaFim) || text(b.horaFim) || (ini ? somaMinutos(ini, dur) : '');
  const codMidia = text(p.midiaRecomendadaCodigo || p.midiaSugerida) || text(ent.midia) || text(ent.conteudoSugerido);
  const midia = codMidia ? await um(db, `SELECT * FROM crm_midias WHERE CODIGO_MIDIA=?`, codMidia) : null;
  const m = midia ? projMidia(midia) : { codigo: codMidia, link: '' };
  const resp = resolverResponsavel(p.responsavelId, p.responsavel, await lerResponsaveis(db));
  const nome = text(ent.cliente || ent.nomeFantasia || ent.razaoSocial || entId), agora = nowIso(), agId = novoId('AGD_', 8);
  const status = text(p.statusAgenda) || 'PLANEJADO', obs = text(p.observacao || p.obsPlanejada);
  const row = {
    AGENDA_ID: agId, TRATATIVA_ID: tratId, ENTIDADE_TIPO: tipo, ENTIDADE_ID: entId, CLIENTE_ID: tipo === 'CLIENTE' ? entId : '', PROSPECT_ID: tipo === 'PROSPECT' ? entId : '',
    CLIENTE: nome, LOCAL: text(p.local) || text(ent.local), DATA_PROGRAMADA: data, DIA_SEMANA: diaSemana(data), HORA_PROGRAMADA: ini, HORA_FIM_PROGRAMADA: fim,
    DURACAO_MIN: dur, BLOCO_ID: text(p.blocoId), TIPO_ATIVIDADE_ID: tipoId, TIPO_ATIVIDADE: text(t.NOME_EXIBICAO), TIPO_COR: text(t.COR) || text(b.cor),
    STATUS_ATIVIDADE: status, PRIORIDADE: text(p.prioridade) || text(trat.PRIORIDADE_SNAPSHOT) || 'MÉDIA', ORDEM_AGENDA: Number(p.ordemAgenda || 999) || 999,
    MIDIA_RECOMENDADA_CODIGO: text(m.codigo), LINK_MIDIA_RECOMENDADA: text(m.link), RESPONSAVEL_ID: resp.id, RESPONSAVEL: resp.nome,
    OBSERVACAO: obs, OBS_PLANEJADA: obs, REQUEST_ID: req || null, CRIADO_EM: agora, ATUALIZADO_EM: agora,
    CRIADO_POR: text(p.createdBy) || resp.id || text(user?.username) || 'CRM_PORTAL', ATUALIZADO_POR: text(p.updatedBy) || resp.id || text(user?.username) || 'CRM_PORTAL',
  };
  const stmts = [insert(db, 'crm_agenda', row),
    update(db, 'crm_tratativas', 'TRATATIVA_ID', tratId, { PROXIMA_ATIVIDADE_ID: agId, PROXIMO_FOLLOWUP_EM: data, RESPONSAVEL_ID: resp.id || trat.RESPONSAVEL_ID,
      UPDATED_BY: row.ATUALIZADO_POR, ATUALIZADO_EM: agora })];
  await snapshotEntidade(db, tipo, entId, { TRATATIVA_ATIVA_ID: tratId, PROXIMA_ATIVIDADE_EM: data }, stmts);
  stmts.push(evento(db, { entidadeTipo: tipo, entidadeId: entId, tratativaId: tratId, tipoEvento: 'ATIVIDADE_AGENDADA', valorNovo: agId, responsavelId: resp.id,
    metadata: { tipoAtividadeId: tipoId, data, hora: ini, midia: m.codigo } }), bumpRev(db));
  await lote(db, stmts);
  if (isYes(p.executarAgora)) return concluirAtividade(env, { ...p, agendaId: agId }, user);
  return { ok: true, created: true, agendaId: agId, tratativaId: tratId };
}

// ------------------------------------------------------------ POST complete_atividade
const MAPA_LEGADO = { RES_PROPOSTA_ENVIADA: 'PROPOSTA_APRESENTADA', RES_INTERESSE: 'CLIENTE_INTERESSADO', RES_CONTRATO_FECHADO: 'CONTRATO_FECHADO',
  RES_SEM_INTERESSE: 'SEM_INTERESSE', RES_REAGENDADO: 'REAGENDADO', RES_NAO_ENCONTRADO: 'NAO_ENCONTRADO' };
const FALLBACK_CLIENTE = { PROPOSTA_APRESENTADA: ['PROPOSTA PENDENTE', 'Enviar proposta comercial', 3, 'CONVERTER'], CLIENTE_INTERESSADO: ['EM NEGOCIAÇÃO', 'Enviar proposta comercial', 2, 'CONVERTER'],
  PROPOSTA_ACEITA: ['CONTRATO EM PROCESSO', 'Enviar contrato para assinatura', 2, 'CONVERTER'], CONTRATO_FECHADO: ['CONTRATO ATIVO', 'Acompanhar em 30 dias', 30, 'FIDELIZAR'],
  SEM_INTERESSE: ['SEM INTERESSE', 'Revisitar em 60 dias', 60, 'MANTER'] };
const PROSPECT_LEGADO = { PROPOSTA_APRESENTADA: ['PROPOSTA', 'PROPOSTA PENDENTE', 'Follow-up proposta', 3], CLIENTE_INTERESSADO: ['VISITA', 'INTERESSADO', 'Revisitar / aprofundar visita', 2],
  PROPOSTA_ACEITA: ['PROPOSTA', 'PROPOSTA ACEITA', '', 2], CONTRATO_FECHADO: ['CONTRATO', 'CONVERTIDO', 'Acompanhar primeira postagem', 7], SEM_INTERESSE: ['PERDIDO', 'SEM INTERESSE', 'Encerrar lead', 30] };

async function transicaoJornada(db, trat, resultadoId, agendaId, quem, nomeResultado, stmts) {
  const agora = nowIso();
  const regras = resultadoId ? await todos(db, `SELECT * FROM crm_transicoes WHERE FUNIL_ID=? AND RESULTADO_ID=? ORDER BY ID`, trat.FUNIL_ID, resultadoId) : [];
  const ativas = regras.filter((r) => isYes(r.ATIVA_JORNADA));
  const exata = ativas.filter((r) => text(r.ETAPA_ORIGEM_ID) === text(trat.ETAPA_ID)).pop(), coringa = ativas.filter((r) => text(r.ETAPA_ORIGEM_ID) === '*').pop();
  const regra = exata || coringa || null;
  const patch = { ULTIMA_ATIVIDADE_ID: agendaId, PROXIMA_ATIVIDADE_ID: '', UPDATED_BY: quem, ATUALIZADO_EM: agora };
  let etapa = text(trat.ETAPA_ID), status = text(trat.STATUS_TRATATIVA), followup = '';
  if (regra) {
    if (text(regra.ETAPA_DESTINO_ID)) { await validarEtapa(db, regra.ETAPA_DESTINO_ID, trat.FUNIL_ID); etapa = text(regra.ETAPA_DESTINO_ID); Object.assign(patch, { ETAPA_ID: etapa, ETAPA_ATUALIZADA_EM: agora }); }
    if (text(regra.STATUS_TRATATIVA_DESTINO)) { status = text(regra.STATUS_TRATATIVA_DESTINO); patch.STATUS_TRATATIVA = status; }
    if (Number(regra.FOLLOWUP_DIAS_JORNADA) > 0) { followup = addDays(hoje(), Number(regra.FOLLOWUP_DIAS_JORNADA)); patch.PROXIMO_FOLLOWUP_EM = followup; }
    if (['CONCLUIDA', 'ENCERRADA'].includes(upper(status))) Object.assign(patch, { ENCERRADA_EM: agora, FECHADA_POR: quem, MOTIVO_ENCERRAMENTO: nomeResultado || resultadoId });
  }
  stmts.push(update(db, 'crm_tratativas', 'TRATATIVA_ID', trat.TRATATIVA_ID, patch));
  const tipo = tipoEntidade(trat.TIPO_ENTIDADE);
  if (regra && patch.ETAPA_ID && tipo === 'PROSPECT') stmts.push(db.prepare(`UPDATE crm_prospects SET ETAPA_FUNIL=? WHERE PROSPECT_ID=?`).bind(patch.ETAPA_ID, trat.ENTIDADE_ID));
  const fechou = ['CONCLUIDA', 'ENCERRADA'].includes(upper(status));
  if (fechou) await snapshotEntidade(db, tipo, trat.ENTIDADE_ID, { TRATATIVA_ATIVA_ID: '', PROXIMA_ATIVIDADE_EM: '' }, stmts);
  if (regra && patch.ETAPA_ID && patch.ETAPA_ID !== trat.ETAPA_ID) stmts.push(evento(db, { entidadeTipo: trat.TIPO_ENTIDADE, entidadeId: trat.ENTIDADE_ID,
    tratativaId: trat.TRATATIVA_ID, tipoEvento: 'ETAPA_ALTERADA', valorAnterior: trat.ETAPA_ID, valorNovo: patch.ETAPA_ID, responsavelId: quem,
    origem: 'CRM_PORTAL', metadata: { statusTratativa: status, porResultado: resultadoId } }));
  return { applied: !!regra, etapaAnterior: text(trat.ETAPA_ID), etapaId: etapa, statusTratativa: status, proximoFollowupEm: followup };
}

/** Ciclo de vida do cliente/prospect a partir do resultado (motor 15_LIFECYCLE antigo). */
async function cicloDeVida(db, tipo, entId, resultadoId, user, stmts) {
  const leg = MAPA_LEGADO[resultadoId];
  if (!leg) return;
  const h = hoje(), agora = nowIso();
  if (tipo === 'PROSPECT') {
    const patch = { ULTIMO_CONTATO: h, ULTIMO_RESULTADO_VISITA: leg, UPDATED_AT: agora };
    const x = PROSPECT_LEGADO[leg];
    if (x) Object.assign(patch, { ETAPA_FUNIL: x[0], STATUS_PROSPECT: x[1], PROXIMA_ACAO: x[2], DATA_PROXIMO_FOLLOWUP: x[3] > 0 ? addDays(h, x[3]) : '' });
    stmts.push(update(db, 'crm_prospects', 'PROSPECT_ID', entId, patch));
    return;
  }
  const regra = (await todos(db, `SELECT * FROM crm_transicoes_legado WHERE upper(ATIVA)='SIM' ORDER BY ORDEM, rowid`)).find((r) => leg === text(r.RESULTADO) || leg.includes(text(r.RESULTADO)));
  const fb = FALLBACK_CLIENTE[leg] || ['', '', 0, ''];
  const novoStatus = text(regra?.NOVO_STATUS) || fb[0], proxima = text(regra?.PROXIMA_ACAO) || fb[1];
  const dias = Number(regra?.DIAS_FOLLOWUP) || fb[2], acao = text(regra?.NOVA_ACAO_FUNIL) || fb[3];
  const patch = { ULTIMA_VISITA: h, ULTIMO_RESULTADO_VISITA: leg };
  if (novoStatus) patch.STATUS_COMERCIAL = novoStatus;
  if (proxima) patch.PROXIMA_ACAO_MANUAL = proxima;
  if (acao && upper(acao) !== 'VISITAR') patch.ACAO_ATUAL = acao;
  if (dias > 0) patch.DATA_PROXIMO_FOLLOWUP = addDays(h, dias);
  await snapshotEntidade(db, 'CLIENTE', entId, patch, stmts);
}

export async function concluirAtividade(env, p, user) {
  const db = env.DB;
  const agId = text(p.agendaId);
  if (!agId) falhar('agendaId obrigatório.');
  const a = await um(db, `SELECT * FROM crm_agenda WHERE AGENDA_ID=?`, agId);
  if (!a) falhar('Atividade não encontrada.');
  const antes = upper(a.STATUS_ATIVIDADE);
  if (antes === 'CONCLUIDO') return { ok: true, agendaId: agId, tratativaId: text(a.TRATATIVA_ID), idempotent: true, message: 'Atividade já concluída.' };
  const tipoId = text(a.TIPO_ATIVIDADE_ID) || text(p.tipoAtividadeId);
  const t = await um(db, `SELECT * FROM crm_tipos_atividade WHERE TIPO_ATIVIDADE_ID=?`, tipoId) || {};
  const resultadoId = text(p.resultadoId || p.resultado);
  if (isYes(t.EXIGE_RESULTADO) && !resultadoId) falhar('Resultado obrigatório para concluir esta atividade.');
  let res = null;
  if (resultadoId) {
    res = await um(db, `SELECT * FROM crm_resultados WHERE RESULTADO_ID=?`, resultadoId);
    if (!res || !isYes(res.ATIVA)) falhar('Resultado inválido ou inativo.');
    const tr = text(res.TIPO_ATIVIDADE_ID);
    if (tr && tr !== 'TODOS' && tr !== tipoId) falhar('Resultado não permitido para este tipo de atividade.');
  }
  const cod = text(p.midiaUsadaCodigo || p.midiaRecomendadaCodigo) || text(a.MIDIA_RECOMENDADA_CODIGO);
  const midia = cod ? await um(db, `SELECT * FROM crm_midias WHERE CODIGO_MIDIA=?`, cod) : null;
  const obs = text(p.observacao || p.obsExecucao), agora = nowIso();
  const quem = text(p.updatedBy) || text(p.responsavelId) || text(user?.username) || 'CRM_PORTAL';
  const stmts = [update(db, 'crm_agenda', 'AGENDA_ID', agId, { STATUS_ATIVIDADE: 'CONCLUÍDO', RESULTADO_ID: resultadoId, OBS_EXECUCAO: obs, OBSERVACAO: obs || text(a.OBSERVACAO),
    MIDIA_USADA_CODIGO: cod, LINK_MIDIA_USADA: midia ? text(midia.LINK) : '', EXECUTADO_EM: agora, CONCLUIDA_EM: agora, ATUALIZADO_EM: agora, ATUALIZADO_POR: quem })];
  const tipo = tipoEntidade(a.ENTIDADE_TIPO), entId = text(a.ENTIDADE_ID || a.CLIENTE_ID || a.PROSPECT_ID);
  let transition = null;
  const trat = text(a.TRATATIVA_ID) ? await um(db, `SELECT * FROM crm_tratativas WHERE TRATATIVA_ID=?`, a.TRATATIVA_ID) : null;
  if (trat) transition = await transicaoJornada(db, trat, resultadoId, agId, quem, text(res?.NOME_EXIBICAO), stmts);
  // follow-up: o que o usuario escolheu na tela vence; senao o da regra
  const followUsuario = ymd(p.proximoFollowupEm);
  if (trat && followUsuario) { stmts.push(db.prepare(`UPDATE crm_tratativas SET PROXIMO_FOLLOWUP_EM=? WHERE TRATATIVA_ID=?`).bind(followUsuario, trat.TRATATIVA_ID)); if (transition) transition.proximoFollowupEm = followUsuario; }
  const follow = transition?.proximoFollowupEm || '';
  stmts.push(insert(db, 'crm_interacoes', {
    INTERACAO_ID: novoId('INT_', 8), DATA: text(a.DATA_PROGRAMADA) || hoje(), CLIENTE_ID: tipo === 'CLIENTE' ? entId : '', CLIENTE: text(a.CLIENTE),
    TIPO_INTERACAO: text(a.TIPO_ATIVIDADE) || tipoId, STATUS: 'CONCLUÍDO', RESULTADO: text(res?.NOME_EXIBICAO) || resultadoId, OBSERVACAO: obs,
    PROXIMA_ACAO: follow ? `Follow-up em ${follow}` : '', RESPONSAVEL: text(a.RESPONSAVEL), CRIADO_EM: agora, TRATATIVA_ID: text(a.TRATATIVA_ID),
    TIPO_ATIVIDADE_ID: tipoId, RESULTADO_ID: resultadoId, RESPONSAVEL_ID: text(a.RESPONSAVEL_ID), ENTIDADE_TIPO: tipo, ENTIDADE_ID: entId,
  }));
  // proxima atividade da entidade: a proxima planejada que ainda existe (antes ficava vazia mesmo com outras agendadas)
  const outra = await um(db, `SELECT DATA_PROGRAMADA FROM crm_agenda WHERE ENTIDADE_ID=? AND AGENDA_ID<>? AND upper(STATUS_ATIVIDADE)='PLANEJADO' AND DATA_PROGRAMADA>=? ORDER BY DATA_PROGRAMADA LIMIT 1`, entId, agId, hoje());
  if (entId) await snapshotEntidade(db, tipo, entId, { ULTIMA_ATIVIDADE_ID: agId, PROXIMA_ATIVIDADE_EM: text(outra?.DATA_PROGRAMADA) || follow }, stmts);
  if (entId) await cicloDeVida(db, tipo, entId, resultadoId, user, stmts);
  stmts.push(evento(db, { entidadeTipo: tipo, entidadeId: entId, tratativaId: text(a.TRATATIVA_ID), tipoEvento: 'ATIVIDADE_CONCLUIDA', valorAnterior: antes,
    valorNovo: resultadoId || 'CONCLUIDO', responsavelId: text(a.RESPONSAVEL_ID) || text(p.responsavelId), metadata: { agendaId: agId, tipoAtividadeId: tipoId, midiaUsada: cod } }), bumpRev(db));
  await lote(db, stmts);                                                        // tudo junto: nao fica atividade concluida pela metade
  return { ok: true, agendaId: agId, tratativaId: text(a.TRATATIVA_ID), resultadoId, transition };
}

// ------------------------------------------------------------ POST cancel / delete
export async function cancelarAtividade(env, p, user) {
  const db = env.DB;
  const agId = text(p.agendaId);
  if (!agId) falhar('agendaId obrigatório.');
  const a = await um(db, `SELECT * FROM crm_agenda WHERE AGENDA_ID=?`, agId);
  if (!a) falhar('Atividade não encontrada.');
  const antes = upper(a.STATUS_ATIVIDADE);
  if (antes === 'CONCLUIDO') falhar('Atividade concluída não pode ser cancelada.');
  const motivo = text(p.motivo) || text(p.observacao), agora = nowIso();
  const stmts = [update(db, 'crm_agenda', 'AGENDA_ID', agId, { STATUS_ATIVIDADE: 'CANCELADO', MOTIVO_CANCELAMENTO: motivo, OBS_EXECUCAO: text(p.observacao),
    ATUALIZADO_EM: agora, ATUALIZADO_POR: text(p.updatedBy) || text(p.responsavelId) || text(user?.username) || 'CRM_PORTAL' })];
  if (text(a.TRATATIVA_ID)) stmts.push(db.prepare(`UPDATE crm_tratativas SET PROXIMA_ATIVIDADE_ID='' WHERE TRATATIVA_ID=? AND PROXIMA_ATIVIDADE_ID=?`).bind(a.TRATATIVA_ID, agId));
  stmts.push(evento(db, { entidadeTipo: a.ENTIDADE_TIPO, entidadeId: a.ENTIDADE_ID, tratativaId: a.TRATATIVA_ID, tipoEvento: 'ATIVIDADE_CANCELADA', valorAnterior: antes,
    valorNovo: 'CANCELADO', responsavelId: text(p.responsavelId) || text(a.RESPONSAVEL_ID), metadata: { agendaId: agId, motivo } }), bumpRev(db));
  await lote(db, stmts);
  return { ok: true, agendaId: agId, status: 'CANCELADO' };
}

export async function excluirAtividade(env, p) {
  const db = env.DB;
  const agId = text(p.agendaId || p.id);
  if (!agId) falhar('agendaId obrigatório.');
  const a = await um(db, `SELECT * FROM crm_agenda WHERE AGENDA_ID=?`, agId);
  if (!a) falhar('Atividade não encontrada.');
  if (upper(a.STATUS_ATIVIDADE) === 'CONCLUIDO') falhar('Atividade concluída não pode ser excluída. Use o histórico para preservar a auditoria.');
  const stmts = [evento(db, { entidadeTipo: a.ENTIDADE_TIPO, entidadeId: a.ENTIDADE_ID, tratativaId: a.TRATATIVA_ID, tipoEvento: 'ATIVIDADE_EXCLUIDA', valorAnterior: agId,
    responsavelId: text(p.responsavelId) || text(a.RESPONSAVEL_ID), metadata: { status: a.STATUS_ATIVIDADE, motivo: text(p.motivo) } }),
    db.prepare(`DELETE FROM crm_agenda WHERE AGENDA_ID=?`).bind(agId)];
  if (text(a.TRATATIVA_ID)) stmts.push(db.prepare(`UPDATE crm_tratativas SET PROXIMA_ATIVIDADE_ID='' WHERE TRATATIVA_ID=? AND PROXIMA_ATIVIDADE_ID=?`).bind(a.TRATATIVA_ID, agId));
  stmts.push(bumpRev(db));
  await lote(db, stmts);
  return { ok: true, agendaId: agId, deleted: true };
}

// ------------------------------------------------------------ checklist de visita
const CHK_MAPA = [['agendaId', 'AGENDA_ID'], ['origemId', 'ORIGEM_ID'], ['prospectId', 'PROSPECT_ID'], ['cliente', 'CLIENTE'], ['resultadoVisita', 'RESULTADO_VISITA'],
  ['statusVisita', 'STATUS_VISITA'], ['postagemComoChega', 'POSTAGEM_COMO_CHEGA'], ['origemPostagem', 'ORIGEM_POSTAGEM'], ['solicitaColetaPor', 'DIAG_SOLICITACAO_RETIRADA'],
  ['apresentouPortalColeta', 'DIAG_PORTAL_RETIRADA'], ['canaisVenda', 'CANAIS_VENDA'], ['postaComQuem', 'POSTA_COM_QUEM'], ['dorPrincipal', 'DOR_PRINCIPAL'],
  ['oportunidadePrincipal', 'OPORTUNIDADE_PRINCIPAL'], ['canalEnvioAtual', 'CANAL_ENVIO_ATUAL'], ['frequenciaEnvio', 'FREQUENCIA_ENVIO'], ['volumeMedio', 'VOLUME_MEDIO'],
  ['jaPostaCorreios', 'JA_POSTA_CORREIOS'], ['temContratoCorreios', 'TEM_CONTRATO_CORREIOS'], ['temCartaoPostagem', 'TEM_CARTAO_POSTAGEM'],
  ['usaColetaCorreios', 'DIAG_USA_RETIRADA_CORREIOS'], ['interesseColeta', 'DIAG_INTERESSE_RETIRADA'], ['usaIntermediador', 'USA_INTERMEDIADOR'],
  ['intermediadorQual', 'INTERMEDIADOR_QUAL'], ['parceiroPrincipal', 'PARCEIRO_PRINCIPAL'], ['canalVenda', 'CANAL_VENDA'], ['atendeSacoleirasExcursao', 'ATENDE_SACOLEIRAS_EXCURSAO'],
  ['tratativaId', 'TRATATIVA_ID'], ['resultadoId', 'RESULTADO_ID'], ['responsavelId', 'RESPONSAVEL_ID'], ['agenciaColeta', 'AGENCIA_COLETA']];
const juntar = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean).join(' | ') : text(v));

function derivadosChecklist(x) {
  const pc = text(x.postagemComoChega), op = text(x.origemPostagem);
  const nivel = ['10x15 pronta', 'A4 pronta'].includes(pc) ? 'RÁPIDA' : ['Etiqueta 10x15 WhatsApp', 'A4 WhatsApp', 'Dados digitados WhatsApp'].includes(pc) ? 'ASSISTIDA' : pc === 'Manual' ? 'MANUAL' : '';
  const entrada = op === 'Intermediador' && nivel === 'RÁPIDA' ? 'INTERMEDIADOR PRONTO' : op === 'Portal Postal' ? 'PORTAL POSTAL' : nivel === 'MANUAL' ? 'ATENDIMENTO MANUAL' : 'ATENDIMENTO ASSISTIDO';
  const pot = ['Intermediador', 'Portal Postal'].includes(op) || nivel === 'RÁPIDA' ? 'ALTO' : nivel === 'ASSISTIDA' ? 'MÉDIO' : 'BAIXO';
  return { nivel, entrada, pot };
}
function diasFollowupChecklist(statusVisita, resultado) {
  const st = upper(statusVisita);
  let res = upper(resultado); if (res === 'NAO_LOCALIZADO') res = 'NAO_ENCONTRADO'; if (res === 'REAGENDADA') res = 'REAGENDADO';
  if (st === 'NAO_ENCONTRADO' || st === 'NAO_CONTATO') return 1;
  if (st === 'REAGENDADO' || st === 'CANCELADO') return 0;
  return { PROPOSTA_APRESENTADA: 3, CLIENTE_INTERESSADO: 2, PROPOSTA_ACEITA: 2, CONTRATO_FECHADO: 7, SEM_INTERESSE: 30 }[res] || 0;
}

export async function salvarChecklist(env, p, user) {
  const db = env.DB;
  const req = text(p.requestId);
  if (req) { const ja = await um(db, `SELECT * FROM crm_checklists WHERE REQUEST_ID=?`, req); if (ja) return { ok: true, created: false, idempotent: true, checklistId: ja.CHECKLIST_ID, nivelEsteira: ja.NIVEL_ESTEIRA, entradaSugerida: ja.ENTRADA_SUGERIDA, potencialAutomacao: ja.POTENCIAL_AUTOMACAO }; }
  const id = novoId('CHK_', 8), agora = nowIso(), d = derivadosChecklist(p);
  const row = { CHECKLIST_ID: id, DATA: text(p.data || agora).slice(0, 10), ORIGEM_TIPO: text(p.origemTipo) || 'CLIENTE', CLIENTE_MASTER_ID: text(p.clienteMasterId || p.clienteId),
    NIVEL_ESTEIRA: d.nivel, ENTRADA_SUGERIDA: d.entrada, POTENCIAL_AUTOMACAO: d.pot, OBSERVACAO_CURTA: text(p.observacaoCurta || p.observacao),
    RESPONSAVEL: text(p.responsavel) || text(user?.displayName), CRIADO_EM: agora, ATUALIZADO_EM: agora, TIPO_ATIVIDADE_ID: text(p.tipoAtividadeId) || 'ATV_VISITA', REQUEST_ID: req || null };
  for (const [k, c] of CHK_MAPA) if (row[c] === undefined) row[c] = juntar(p[k]);
  const stmts = [insert(db, 'crm_checklists', row)];
  if (text(p.agendaId)) stmts.push(db.prepare(`UPDATE crm_agenda SET CHECKLIST_ID=? WHERE AGENDA_ID=?`).bind(id, text(p.agendaId)));
  const dias = diasFollowupChecklist(p.statusVisita, p.resultadoVisita), follow = dias > 0 ? addDays(hoje(), dias) : '';
  if (upper(p.origemTipo) === 'PROSPECT') {
    const pid = text(p.prospectId || p.origemId), patch = { UPDATED_AT: agora, ULTIMO_CONTATO: hoje(), CHECKLIST_ULTIMA_VISITA_ID: id };
    for (const [k, c] of [['canalEnvioAtual', 'CANAL_ENVIO_ATUAL'], ['frequenciaEnvio', 'FREQUENCIA_ENVIO'], ['volumeMedio', 'VOLUME_MEDIO'], ['jaPostaCorreios', 'JA_POSTA_CORREIOS'],
      ['temContratoCorreios', 'TEM_CONTRATO_CORREIOS'], ['temCartaoPostagem', 'TEM_CARTAO_POSTAGEM'], ['parceiroPrincipal', 'PARCEIRO_PRINCIPAL'], ['usaIntermediador', 'USA_INTERMEDIADOR'],
      ['intermediadorQual', 'INTERMEDIADOR_QUAL'], ['canalVenda', 'CANAL_VENDA'], ['atendeSacoleirasExcursao', 'ATENDE_SACOLEIRAS_EXCURSAO'], ['dorPrincipal', 'DOR_PRINCIPAL'],
      ['oportunidadePrincipal', 'OPORTUNIDADE_PRINCIPAL'], ['resultadoVisita', 'ULTIMO_RESULTADO_VISITA']]) { const v = juntar(p[k]); if (v) patch[c] = v; }
    if (follow) patch.DATA_PROXIMO_FOLLOWUP = follow;
    if (pid) stmts.push(update(db, 'crm_prospects', 'PROSPECT_ID', pid, patch));
  } else {
    const cid = text(p.clienteMasterId || p.clienteId || p.origemId);
    const patch = { ULTIMA_VISITA: hoje(), ULTIMO_RESULTADO_VISITA: text(p.resultadoVisita), CHECKLIST_ULTIMA_VISITA_ID: id };
    if (follow) patch.DATA_PROXIMO_FOLLOWUP = follow;
    if (cid) await snapshotEntidade(db, 'CLIENTE', cid, patch, stmts);
  }
  stmts.push(evento(db, { entidadeTipo: upper(p.origemTipo || 'CLIENTE'), entidadeId: text(p.origemId || p.clienteId || p.prospectId), tratativaId: text(p.tratativaId),
    tipoEvento: 'CHECKLIST_CORREIOS_SALVO', valorNovo: id, responsavelId: text(p.responsavelId), metadata: { resultado: text(p.resultadoVisita), nivelEsteira: d.nivel, entradaSugerida: d.entrada } }), bumpRev(db));
  await lote(db, stmts);
  return { ok: true, created: true, checklistId: id, nivelEsteira: d.nivel, entradaSugerida: d.entrada, potencialAutomacao: d.pot };
}

function projetarChecklist(r) {
  return { checklistId: text(r.CHECKLIST_ID), agendaId: text(r.AGENDA_ID), data: ymd(r.DATA), origemTipo: upperNoAccents(r.ORIGEM_TIPO), origemId: text(r.ORIGEM_ID),
    prospectId: text(r.PROSPECT_ID), clienteMasterId: text(r.CLIENTE_MASTER_ID), cliente: text(r.CLIENTE), resultadoVisita: text(r.RESULTADO_VISITA), statusVisita: text(r.STATUS_VISITA),
    postagemComoChega: text(r.POSTAGEM_COMO_CHEGA), origemPostagem: text(r.ORIGEM_POSTAGEM), solicitaColetaPor: text(r.DIAG_SOLICITACAO_RETIRADA),
    apresentouPortalColeta: text(r.DIAG_PORTAL_RETIRADA), canaisVenda: text(r.CANAIS_VENDA), postaComQuem: text(r.POSTA_COM_QUEM), dorPrincipal: text(r.DOR_PRINCIPAL),
    oportunidadePrincipal: text(r.OPORTUNIDADE_PRINCIPAL), nivelEsteira: text(r.NIVEL_ESTEIRA), entradaSugerida: text(r.ENTRADA_SUGERIDA), potencialAutomacao: text(r.POTENCIAL_AUTOMACAO),
    canalEnvioAtual: text(r.CANAL_ENVIO_ATUAL), frequenciaEnvio: text(r.FREQUENCIA_ENVIO), volumeMedio: text(r.VOLUME_MEDIO), jaPostaCorreios: text(r.JA_POSTA_CORREIOS),
    temContratoCorreios: text(r.TEM_CONTRATO_CORREIOS), temCartaoPostagem: text(r.TEM_CARTAO_POSTAGEM), usaColetaCorreios: text(r.DIAG_USA_RETIRADA_CORREIOS),
    interesseColeta: text(r.DIAG_INTERESSE_RETIRADA), usaIntermediador: text(r.USA_INTERMEDIADOR), intermediadorQual: text(r.INTERMEDIADOR_QUAL), parceiroPrincipal: text(r.PARCEIRO_PRINCIPAL),
    canalVenda: text(r.CANAL_VENDA), atendeSacoleirasExcursao: text(r.ATENDE_SACOLEIRAS_EXCURSAO), observacaoCurta: text(r.OBSERVACAO_CURTA), responsavel: text(r.RESPONSAVEL),
    criadoEm: text(r.CRIADO_EM), tratativaId: text(r.TRATATIVA_ID), tipoAtividadeId: text(r.TIPO_ATIVIDADE_ID), resultadoId: text(r.RESULTADO_ID),
    responsavelId: text(r.RESPONSAVEL_ID), requestId: text(r.REQUEST_ID), agenciaColeta: text(r.AGENCIA_COLETA) };
}
export async function getChecklists(env, p) {
  const tipo = upperNoAccents(p.tipoEntidade || p.origemTipo || 'CLIENTE');
  const id = text(p.entidadeId || p.origemId || p.clienteId || p.prospectId);
  if (!id) falhar('entidadeId obrigatório.');
  const lim = Math.min(50, Math.max(1, Number(p.limit) || 20));
  const rows = tipo === 'PROSPECT'
    ? await todos(env.DB, `SELECT * FROM crm_checklists WHERE PROSPECT_ID=? OR (upper(ORIGEM_TIPO)='PROSPECT' AND ORIGEM_ID=?) ORDER BY COALESCE(NULLIF(CRIADO_EM,''), DATA) DESC LIMIT ?`, id, id, lim)
    : await todos(env.DB, `SELECT * FROM crm_checklists WHERE CLIENTE_MASTER_ID=? OR (upper(ORIGEM_TIPO)='CLIENTE' AND ORIGEM_ID=?) ORDER BY COALESCE(NULLIF(CRIADO_EM,''), DATA) DESC LIMIT ?`, id, id, lim);
  const items = rows.map(projetarChecklist);
  return { ok: true, entityType: tipo, entityId: id, items, latest: items[0] || null };
}

// ------------------------------------------------------------ anotacoes
export async function getNotas(env, p) {
  const tipo = upperNoAccents(p.tipoEntidade || p.origemTipo || 'CLIENTE');
  const id = text(p.entidadeId || p.origemId || p.clienteId || p.prospectId);
  if (!id) falhar('entidadeId obrigatório.');
  const lim = Math.min(100, Math.max(1, Number(p.limit) || 30));
  const rows = await todos(env.DB, `SELECT * FROM crm_anotacoes WHERE ENTIDADE_TIPO=? AND ENTIDADE_ID=? ORDER BY DATA_HORA DESC LIMIT ?`, tipo, id, lim);
  return { ok: true, entityType: tipo, entityId: id, items: rows.map((r) => ({ anotacaoId: r.ANOTACAO_ID, dataHora: r.DATA_HORA, entidadeTipo: r.ENTIDADE_TIPO,
    entidadeId: r.ENTIDADE_ID, tratativaId: r.TRATATIVA_ID, agendaId: r.AGENDA_ID, texto: r.TEXTO, responsavelId: r.RESPONSAVEL_ID, responsavelNome: r.RESPONSAVEL_NOME,
    origem: r.ORIGEM, requestId: text(r.REQUEST_ID) })) };
}
export async function salvarNota(env, p, user) {
  const db = env.DB;
  const tipo = upperNoAccents(p.tipoEntidade || p.origemTipo || 'CLIENTE');
  const id = text(p.entidadeId || p.origemId || p.clienteId || p.prospectId);
  if (!id) falhar('entidadeId obrigatório.');
  const textoNota = text(p.texto || p.observacao);
  if (!textoNota) falhar('Texto da anotação obrigatório.');
  const req = text(p.requestId);
  if (req) { const ja = await um(db, `SELECT ANOTACAO_ID FROM crm_anotacoes WHERE REQUEST_ID=?`, req); if (ja) return { ok: true, created: false, idempotent: true, anotacaoId: ja.ANOTACAO_ID }; }
  const nid = novoId('NOT_', 10), agora = nowIso();
  await lote(db, [insert(db, 'crm_anotacoes', { ANOTACAO_ID: nid, DATA_HORA: agora, ENTIDADE_TIPO: tipo, ENTIDADE_ID: id, TRATATIVA_ID: text(p.tratativaId),
    AGENDA_ID: text(p.agendaId), TEXTO: textoNota, RESPONSAVEL_ID: text(p.responsavelId), RESPONSAVEL_NOME: text(p.responsavelNome || p.responsavel) || text(user?.displayName),
    ORIGEM: text(p.origem) || 'CRM_PORTAL', REQUEST_ID: req || null }),
    evento(db, { entidadeTipo: tipo, entidadeId: id, tratativaId: p.tratativaId, tipoEvento: 'ANOTACAO_ADICIONADA', valorNovo: nid, responsavelId: p.responsavelId,
      metadata: { agendaId: text(p.agendaId), texto: textoNota } }), bumpRev(db)]);
  return { ok: true, created: true, anotacaoId: nid, dataHora: agora };
}

// ------------------------------------------------------------ GET get_crm_dashboard_v3
export async function getDashboard(env, p, user) {
  const db = env.DB;
  const start = text(p.start || p.dataInicio) || weekStart(hoje()), end = text(p.end || p.dataFim) || addDays(start, 6);
  const ag = (await getAgenda(env, { start, end, responsavelId: p.responsavelId }, user)).items;
  const resp = await lerResponsaveis(db), idx = indiceResponsaveis(resp), quer = text(p.responsavelId) ? pessoaId(p.responsavelId, idx) : '';
  const trats = (await todos(db, `SELECT STATUS_TRATATIVA, ETAPA_ID, RESPONSAVEL_ID FROM crm_tratativas`)).filter((t) => !quer || pessoaId(t.RESPONSAVEL_ID, idx) === quer);
  const h = hoje(), conta = (arr, f) => arr.filter(f).length;
  const porTipo = {}, porResp = {}, porEtapa = {};
  for (const a of ag) { if (a.tipoAtividadeNome) porTipo[a.tipoAtividadeNome] = (porTipo[a.tipoAtividadeNome] || 0) + 1; if (a.responsavelNome) porResp[a.responsavelNome] = (porResp[a.responsavelNome] || 0) + 1; }
  for (const t of trats) if (text(t.ETAPA_ID)) porEtapa[t.ETAPA_ID] = (porEtapa[t.ETAPA_ID] || 0) + 1;
  const planejadas = ag.filter((a) => upper(a.statusAtividade) === 'PLANEJADO'), concluidas = conta(ag, (a) => upper(a.statusAtividade) === 'CONCLUIDO');
  return { ok: true, period: { start, end },
    atividades: { total: ag.length, planejadas: planejadas.length, concluidas, canceladas: conta(ag, (a) => upper(a.statusAtividade) === 'CANCELADO'),
      vencidas: conta(planejadas, (a) => a.dataProgramada < h), taxaExecucao: ag.length ? Math.round(concluidas / ag.length * 100) : 0, porTipo, porResponsavel: porResp },
    tratativas: { abertas: conta(trats, (t) => upper(t.STATUS_TRATATIVA) === 'ABERTA'), pausadas: conta(trats, (t) => upper(t.STATUS_TRATATIVA) === 'PAUSADA'),
      concluidas: conta(trats, (t) => upper(t.STATUS_TRATATIVA) === 'CONCLUIDA'), encerradas: conta(trats, (t) => upper(t.STATUS_TRATATIVA) === 'ENCERRADA'), porEtapa } };
}
