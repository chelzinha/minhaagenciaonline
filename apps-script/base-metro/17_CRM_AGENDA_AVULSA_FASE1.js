/**
 * 17_CRM_AGENDA_AVULSA_FASE1.gs
 * ------------------------------------------------------------
 * Fase 1 — fundacao tecnica da Agenda AVULSA.
 *
 * Objetivos:
 * - aplicar a evolucao aditiva de schema necessaria para AVULSA;
 * - gravar/concluir/cancelar/excluir AVULSA sem Cliente, Prospect ou Tratativa;
 * - preservar os fluxos existentes das atividades vinculadas;
 * - nao executar seeds, migracoes amplas ou alteracoes destrutivas de dados;
 * - permitir execucao idempotente e auditavel em producao.
 */

var CRM_AGENDA_AVULSA_F1 = {
  VERSION: '1.1.1',
  AGENDA_HEADERS: ['TITULO'],
  ACTIVITY_TYPE_HEADERS: ['APLICA_AVULSA']
};

/**
 * Adiciona os cabecalhos da Fase 1 sem alterar linhas existentes.
 * Pode ser executada mais de uma vez com seguranca.
 */
function setupCrmAgendaAvulsaFase1() {
  return op_withDocumentLock_(function () {
    var ss = op_getSpreadsheet_();
    var updated = [];

    var agendaResult = crm2_appendMissingHeaders_(
      ss,
      CRM3_CFG.SHEETS.AGENDA,
      CRM_AGENDA_AVULSA_F1.AGENDA_HEADERS
    );
    if (agendaResult.addedHeaders.length) {
      updated.push({
        sheet: CRM3_CFG.SHEETS.AGENDA,
        addedHeaders: agendaResult.addedHeaders
      });
    }

    var typeResult = crm2_appendMissingHeaders_(
      ss,
      CRM3_CFG.SHEETS.TIPOS_ATIVIDADE,
      CRM_AGENDA_AVULSA_F1.ACTIVITY_TYPE_HEADERS
    );
    if (typeResult.addedHeaders.length) {
      updated.push({
        sheet: CRM3_CFG.SHEETS.TIPOS_ATIVIDADE,
        addedHeaders: typeResult.addedHeaders
      });
    }

    if (typeof crm3_bumpCacheRev_ === 'function') crm3_bumpCacheRev_();
    if (typeof crm5x_bumpConfigRev_ === 'function') crm5x_bumpConfigRev_();

    return {
      ok: true,
      version: CRM_AGENDA_AVULSA_F1.VERSION,
      updated: updated,
      schema: auditCrmAgendaAvulsaFase1Schema_(),
      message: updated.length
        ? 'Schema da Agenda AVULSA atualizado de forma aditiva.'
        : 'Schema da Agenda AVULSA ja estava atualizado.'
    };
  });
}

/**
 * Auditoria somente de cabecalhos. Nao grava dados.
 */
function auditCrmAgendaAvulsaFase1Schema() {
  return auditCrmAgendaAvulsaFase1Schema_();
}

function auditCrmAgendaAvulsaFase1Schema_() {
  var ss = op_getSpreadsheet_();
  var agenda = ss.getSheetByName(CRM3_CFG.SHEETS.AGENDA);
  var tipos = ss.getSheetByName(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE);

  var agendaHeaders = agenda && agenda.getLastColumn()
    ? agenda.getRange(1, 1, 1, agenda.getLastColumn()).getValues()[0].map(function (x) { return String(x || '').trim(); })
    : [];
  var typeHeaders = tipos && tipos.getLastColumn()
    ? tipos.getRange(1, 1, 1, tipos.getLastColumn()).getValues()[0].map(function (x) { return String(x || '').trim(); })
    : [];

  var hasTitle = agendaHeaders.indexOf('TITULO') >= 0;
  var hasAplicaAvulsa = typeHeaders.indexOf('APLICA_AVULSA') >= 0;

  return {
    ok: hasTitle && hasAplicaAvulsa,
    agenda: {
      sheet: CRM3_CFG.SHEETS.AGENDA,
      hasTitulo: hasTitle
    },
    tiposAtividade: {
      sheet: CRM3_CFG.SHEETS.TIPOS_ATIVIDADE,
      hasAplicaAvulsa: hasAplicaAvulsa
    }
  };
}

/* ========================= BACKEND AVULSA ========================= */

function crmAgendaAvulsaF1_isRecord_(obj) {
  obj = obj || {};
  return crm3_upper_(obj.ENTIDADE_TIPO || obj.ORIGEM_TIPO || '') === 'AVULSA';
}

function crmAgendaAvulsaF1_assertNoEntity_(payload) {
  payload = payload || {};
  var entityId = crm3_text_(payload.entidadeId || payload.origemId || payload.clienteId || payload.prospectId);
  var treatmentId = crm3_text_(payload.tratativaId);
  if (entityId) throw new Error('Atividade AVULSA não pode ter ENTIDADE_ID.');
  if (treatmentId) throw new Error('Atividade AVULSA não pode ter TRATATIVA_ID.');
}

function crmAgendaAvulsaF1_activityType_(typeId, requireApplies) {
  typeId = crm3_text_(typeId);
  if (!typeId) throw new Error('Tipo de atividade obrigatório.');
  if (crm5_isLegacyColetaText_(typeId)) throw new Error('COLETAS foi desativado. Selecione outro tipo de atividade.');
  var activityType = crm3_findConfigById_(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE, 'TIPO_ATIVIDADE_ID', typeId);
  if (!activityType || !crm3_isYes_(activityType.ATIVA)) throw new Error('Tipo de atividade inválido ou inativo.');
  if (requireApplies !== false && !crm3_isYes_(activityType.APLICA_AVULSA)) throw new Error('Tipo de atividade não permitido para atividade avulsa.');
  return activityType;
}

function crmAgendaAvulsaF1_save_(payload) {
  crm3_assertSetupReady_();
  payload = payload || {};
  crmAgendaAvulsaF1_assertNoEntity_(payload);

  var requestId = crm3_text_(payload.requestId);
  if (requestId) {
    var existingRequest = crm3_findRowObject_(CRM3_CFG.SHEETS.AGENDA, 'REQUEST_ID', requestId);
    if (existingRequest) {
      return {
        ok: true,
        created: false,
        agendaId: crm3_text_(existingRequest.obj.AGENDA_ID),
        idempotent: true,
        entidadeTipo: crm3_text_(existingRequest.obj.ENTIDADE_TIPO || existingRequest.obj.ORIGEM_TIPO)
      };
    }
  }

  var title = crm3_text_(payload.titulo);
  if (!title) throw new Error('Título obrigatório para atividade avulsa.');

  var typeId = crm3_text_(payload.tipoAtividadeId);
  var activityType = crmAgendaAvulsaF1_activityType_(typeId, true);
  var date = crm3_text_(payload.dataProgramada || payload.data);
  if (!date) throw new Error('Data programada obrigatória.');

  var block = payload.blocoId ? op_readBlocksById_()[crm3_text_(payload.blocoId)] : null;
  var rawDuration = crm3_text_(payload.duracaoMin);
  var duration = Number(rawDuration || activityType.DURACAO_PADRAO_MIN || 30) || 30;
  var startTime = crm3_text_(payload.horaProgramada || payload.horaInicio || (block && block.horaInicio) || '');
  if (crm3_isYes_(activityType.USA_BLOCO) && !block && !startTime) {
    throw new Error('Selecione uma janela ou informe horário para esta atividade.');
  }
  var endTime = crm3_text_(payload.horaFimProgramada || payload.horaFim || (block && block.horaFim) || crm3_addMinutesToTime_(startTime, duration));
  var responsible = crm3_resolveResponsible_(payload.responsavelId, payload.responsavel);
  var now = op_nowIso_();
  var agendaId = 'AGD_' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var statusAgenda = crm3_text_(payload.statusAgenda || 'PLANEJADO');
  var observation = crm3_text_(payload.observacao || payload.obsPlanejada);

  var obj = {
    AGENDA_ID: agendaId,
    DATA: date,
    DIA_SEMANA: op_weekdayPt_(date),
    BLOCO_ID: crm3_text_(payload.blocoId),
    HORA_INICIO: startTime,
    HORA_FIM: endTime,
    TIPO_ATIVIDADE: crm3_text_(activityType.NOME_EXIBICAO),
    TIPO_COR: crm3_text_(activityType.COR || (block && block.cor) || ''),
    CLIENTE_ID: '',
    CLIENTE: '',
    LOCAL: crm3_text_(payload.local),
    STATUS_AGENDA: statusAgenda,
    PRIORIDADE: crm3_text_(payload.prioridade || 'MÉDIA'),
    ORDEM_AGENDA: Number(payload.ordemAgenda || 999),
    OBS_PLANEJADA: observation,
    OBS_EXECUCAO: '',
    MIDIA_SUGERIDA: '',
    LINK_MIDIA_DIRETO: '',
    RESPONSAVEL: crm3_text_(responsible.nome),
    EXECUTADO_EM: '',
    CRIADO_EM: now,
    ATUALIZADO_EM: now,
    ORIGEM_TIPO: 'AVULSA',
    ORIGEM_ID: '',
    PROSPECT_ID: '',
    CLIENTE_MASTER_ID: '',
    CHECKLIST_ID: '',
    TRATATIVA_ID: '',
    TIPO_ATIVIDADE_ID: typeId,
    STATUS_ATIVIDADE: statusAgenda,
    AGENDADA: 'SIM',
    DATA_PROGRAMADA: date,
    HORA_PROGRAMADA: startTime,
    DURACAO_MIN: duration,
    RESULTADO_ID: '',
    MIDIA_RECOMENDADA_CODIGO: '',
    MIDIA_USADA_CODIGO: '',
    RESPONSAVEL_ID: crm3_text_(responsible.id),
    REQUEST_ID: requestId,
    ENTIDADE_TIPO: 'AVULSA',
    ENTIDADE_ID: '',
    HORA_FIM_PROGRAMADA: endTime,
    LINK_MIDIA_RECOMENDADA: '',
    LINK_MIDIA_USADA: '',
    OBSERVACAO: observation,
    CRIADO_POR: crm3_text_(payload.createdBy || responsible.id || 'CRM_PORTAL'),
    ATUALIZADO_POR: crm3_text_(payload.updatedBy || responsible.id || 'CRM_PORTAL'),
    CONCLUIDA_EM: '',
    MOTIVO_CANCELAMENTO: '',
    PROXIMO_FOLLOWUP_EM: '',
    TITULO: title
  };

  crm3_appendObject_(CRM3_CFG.SHEETS.AGENDA, obj);
  crm3_bumpCacheRev_();

  if (crm3_isYes_(payload.executarAgora)) {
    var completePayload = {};
    Object.keys(payload).forEach(function (k) { completePayload[k] = payload[k]; });
    completePayload.agendaId = agendaId;
    completePayload.statusAtividade = 'CONCLUÍDO';
    return crm3_apiCompleteAtividade_(completePayload);
  }

  return {
    ok: true,
    created: true,
    agendaId: agendaId,
    tratativaId: '',
    entidadeTipo: 'AVULSA'
  };
}

function crmAgendaAvulsaF1_complete_(payload, record) {
  payload = payload || {};
  if (!record) throw new Error('Atividade não encontrada.');

  var agendaId = crm3_text_(record.obj.AGENDA_ID);
  var oldStatus = crm3_upper_(record.obj.STATUS_ATIVIDADE || record.obj.STATUS_AGENDA);
  if (oldStatus === 'CONCLUIDO') {
    return {
      ok: true,
      agendaId: agendaId,
      tratativaId: '',
      entidadeTipo: 'AVULSA',
      idempotent: true,
      message: 'Atividade já concluída.'
    };
  }

  var typeId = crm3_text_(record.obj.TIPO_ATIVIDADE_ID || payload.tipoAtividadeId);
  var activityType = crmAgendaAvulsaF1_activityType_(typeId, false);
  var resultId = crm3_text_(payload.resultadoId || payload.resultado);
  if (crm3_isYes_(activityType.EXIGE_RESULTADO) && !resultId) {
    throw new Error('Resultado obrigatório para concluir esta atividade.');
  }
  if (resultId) crm3_validateResultForActivity_(resultId, typeId);

  var now = op_nowIso_();
  var observation = crm3_text_(payload.observacao || payload.obsExecucao);
  crm3_patchRowObject_(record, {
    STATUS_AGENDA: 'CONCLUÍDO',
    STATUS_ATIVIDADE: 'CONCLUÍDO',
    RESULTADO_ID: resultId,
    OBS_EXECUCAO: observation,
    OBSERVACAO: observation,
    MIDIA_USADA_CODIGO: '',
    LINK_MIDIA_USADA: '',
    EXECUTADO_EM: now,
    CONCLUIDA_EM: now,
    ATUALIZADO_EM: now,
    ATUALIZADO_POR: crm3_text_(payload.updatedBy || payload.responsavelId || 'CRM_PORTAL')
  });
  crm3_bumpCacheRev_();

  return {
    ok: true,
    agendaId: agendaId,
    tratativaId: '',
    resultadoId: resultId,
    transition: null,
    entidadeTipo: 'AVULSA'
  };
}

function crmAgendaAvulsaF1_cancel_(payload, record) {
  payload = payload || {};
  if (!record) throw new Error('Atividade não encontrada.');

  var agendaId = crm3_text_(record.obj.AGENDA_ID);
  var oldStatus = crm3_upper_(record.obj.STATUS_ATIVIDADE || record.obj.STATUS_AGENDA);
  if (oldStatus === 'CONCLUIDO') throw new Error('Atividade concluída não pode ser cancelada.');

  var now = op_nowIso_();
  crm3_patchRowObject_(record, {
    STATUS_AGENDA: 'CANCELADO',
    STATUS_ATIVIDADE: 'CANCELADO',
    MOTIVO_CANCELAMENTO: crm3_text_(payload.motivo || payload.observacao),
    OBS_EXECUCAO: crm3_text_(payload.observacao),
    ATUALIZADO_EM: now,
    ATUALIZADO_POR: crm3_text_(payload.updatedBy || payload.responsavelId || 'CRM_PORTAL')
  });
  crm3_bumpCacheRev_();

  return {
    ok: true,
    agendaId: agendaId,
    status: 'CANCELADO',
    entidadeTipo: 'AVULSA'
  };
}

function crmAgendaAvulsaF1_delete_(payload, record) {
  payload = payload || {};
  if (!record) throw new Error('Atividade não encontrada.');

  var agendaId = crm3_text_(record.obj.AGENDA_ID);
  var status = crm3_upper_(record.obj.STATUS_ATIVIDADE || record.obj.STATUS_AGENDA);
  if (status === 'CONCLUIDO') {
    throw new Error('Atividade concluída não pode ser excluída. Use o histórico para preservar a auditoria.');
  }

  record.sheet.deleteRow(record.rowNumber);
  crm3_bumpCacheRev_();
  return {
    ok: true,
    agendaId: agendaId,
    deleted: true,
    entidadeTipo: 'AVULSA'
  };
}
