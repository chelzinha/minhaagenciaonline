/**
 * 06_CRM_JORNADA_FASE3.gs
 * ------------------------------------------------------------
 * Fase 3 — Jornada comercial, tratativas e Agenda genérica.
 *
 * Esta camada é ADITIVA:
 * - preserva rotas antigas durante a homologação;
 * - reaproveita as abas criadas na Fase 2;
 * - separa recomendação automática, etapa comercial e atividade executada;
 * - transforma AGENDA_EXECUCAO em fonte operacional de atividades comerciais;
 * - mantém VISITAR somente como tipo de atividade (ATV_VISITA).
 *
 * IMPORTANTE:
 * - execute setupCrmJornadaFase3() uma vez antes de usar as novas rotas;
 * - a migração inicial de tratativas é manual e reversível;
 * - nenhuma função destrutiva roda automaticamente.
 */

var CRM3_CFG = {
  VERSION: '3.0.0',
  PROPS: {
    SETUP_AT: 'crm3_setup_at',
    SETUP_VERSION: 'crm3_setup_version',
    CACHE_REV: 'crm3_cache_rev',
    MIGRATION_AT: 'crm3_tratativas_migration_at'
  },
  SHEETS: {
    CADASTRO: 'CLIENTES_CADASTRO',
    MASTER: 'CLIENTES_MASTER',
    PROSPECTS: 'PROSPECTS',
    TRATATIVAS: 'CRM_TRATATIVAS',
    FUNIS: 'CRM_FUNIS',
    ETAPAS: 'CRM_FUNIL_ETAPAS',
    TIPOS_ATIVIDADE: 'CRM_TIPOS_ATIVIDADE',
    RESULTADOS: 'CRM_RESULTADOS_ATIVIDADE',
    RESPONSAVEIS: 'CRM_RESPONSAVEIS',
    EVENTOS: 'CRM_EVENTOS',
    AGENDA: 'AGENDA_EXECUCAO',
    BLOCOS: 'AGENDA_BLOCOS',
    INTERACOES: 'CRM_INTERACOES',
    TRANSICOES: 'CRM_TRANSICOES',
    MIDIAS: 'MIDIAS_CRM',
    SEGMENTOS: 'CRM_SEGMENTOS',
    LOCAIS: 'CRM_LOCAIS'
  },
  FUNIL_CLIENTES: 'FUNIL_CLIENTES',
  FUNIL_PROSPECTS: 'FUNIL_PROSPECTS',
  DEFAULT_CLIENT_STAGE: 'C_SINALIZADO',
  DEFAULT_PROSPECT_STAGE: 'P_NOVO',
  OPEN_TREATMENT_STATUSES: ['ABERTA', 'PAUSADA'],
  ACTIONABLE_RECOMMENDATIONS: ['CONVERTER', 'RESGATAR', 'FIDELIZAR', 'CANCELAR'],
  MAX_KANBAN_COLS: 6,
  CACHE_SEC: 300
};

var CRM3_APPEND_HEADERS = {
  CLIENTES_CADASTRO: [
    'TRATATIVA_ATIVA_ID','ULTIMA_ATIVIDADE_ID','PROXIMA_ATIVIDADE_EM'
  ],
  PROSPECTS: [
    'TRATATIVA_ATIVA_ID','ULTIMA_ATIVIDADE_ID','PROXIMA_ATIVIDADE_EM'
  ],
  CRM_TRATATIVAS: [
    'ULTIMA_ATIVIDADE_ID','PROXIMA_ATIVIDADE_ID','MOTIVO_ABERTURA','CRIADO_POR','FECHADA_POR'
  ],
  AGENDA_EXECUCAO: [
    'REQUEST_ID','ENTIDADE_TIPO','ENTIDADE_ID','HORA_FIM_PROGRAMADA','LINK_MIDIA_RECOMENDADA','LINK_MIDIA_USADA',
    'OBSERVACAO','CRIADO_POR','ATUALIZADO_POR','CONCLUIDA_EM','MOTIVO_CANCELAMENTO','PROXIMO_FOLLOWUP_EM'
  ]
};

var CRM3_TRANSITION_HEADERS = [
  'FUNIL_ID','ETAPA_ORIGEM_ID','RESULTADO_ID','ETAPA_DESTINO_ID','FOLLOWUP_DIAS_JORNADA',
  'STATUS_TRATATIVA_DESTINO','ATIVA_JORNADA','DESCRICAO_JORNADA'
];

/* ========================= SETUP PÚBLICO ========================= */

function setupCrmJornadaFase3() {
  return op_withDocumentLock_(function(){
    return crm3_setupUnlocked_();
  });
}

function crm3_setupUnlocked_() {
  if (typeof crm2_setupUnlocked_ === 'function') crm2_setupUnlocked_();
  var ss = op_getSpreadsheet_();
  var updated = [];

  Object.keys(CRM3_APPEND_HEADERS).forEach(function(sheetName){
    var result = crm2_appendMissingHeaders_(ss, sheetName, CRM3_APPEND_HEADERS[sheetName]);
    if (result.addedHeaders.length) updated.push({ sheet:sheetName, addedHeaders:result.addedHeaders });
  });

  crm3_seedAdditionalResults_();
  crm3_prepareTransitionSchema_();
  crm3_seedJourneyTransitions_();
  crm3_validateConfigOrThrow_();

  PropertiesService.getScriptProperties().setProperties({
    crm3_setup_at: op_nowIso_(),
    crm3_setup_version: CRM3_CFG.VERSION
  }, false);
  crm3_bumpCacheRev_();

  return {
    ok:true,
    version:CRM3_CFG.VERSION,
    updated:updated,
    message:'CRM Jornada Fase 3 preparado sem substituir as rotas legadas.'
  };
}

function getStatusCrmJornadaFase3() {
  var p = PropertiesService.getScriptProperties();
  return {
    ok:true,
    version:CRM3_CFG.VERSION,
    setupAt:p.getProperty(CRM3_CFG.PROPS.SETUP_AT) || '',
    setupVersion:p.getProperty(CRM3_CFG.PROPS.SETUP_VERSION) || '',
    migrationAt:p.getProperty(CRM3_CFG.PROPS.MIGRATION_AT) || '',
    cacheRev:p.getProperty(CRM3_CFG.PROPS.CACHE_REV) || '0'
  };
}

function auditCrmJornadaFase3() {
  crm3_assertSetupReady_();
  var ss = op_getSpreadsheet_();
  var issues = [];
  var funis = crm3_readObjects_(CRM3_CFG.SHEETS.FUNIS);
  var etapas = crm3_readObjects_(CRM3_CFG.SHEETS.ETAPAS);
  var tipos = crm3_readObjects_(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE);
  var resultados = crm3_readObjects_(CRM3_CFG.SHEETS.RESULTADOS);
  var tratativas = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS);
  var etapaById = crm3_indexBy_(etapas, 'ETAPA_ID');
  var funilById = crm3_indexBy_(funis, 'FUNIL_ID');
  var tipoById = crm3_indexBy_(tipos, 'TIPO_ATIVIDADE_ID');

  funis.forEach(function(f){
    if (!crm3_isYes_(f.ATIVO)) return;
    var max = Number(f.MAX_COLUNAS_VISIVEIS) || CRM3_CFG.MAX_KANBAN_COLS;
    var visible = etapas.filter(function(e){ return crm3_text_(e.FUNIL_ID) === crm3_text_(f.FUNIL_ID) && crm3_isYes_(e.ATIVA) && crm3_isYes_(e.EXIBE_KANBAN); });
    if (visible.length > max) issues.push(crm3_issue_('BLOQUEANTE','COLUNAS_KANBAN_EXCEDIDAS',crm3_text_(f.FUNIL_ID),'Visíveis: ' + visible.length + '; máximo: ' + max));
  });

  etapas.forEach(function(e){
    if (!funilById[crm3_text_(e.FUNIL_ID)]) issues.push(crm3_issue_('BLOQUEANTE','ETAPA_SEM_FUNIL',crm3_text_(e.ETAPA_ID),crm3_text_(e.FUNIL_ID)));
  });
  resultados.forEach(function(r){
    var type = crm3_text_(r.TIPO_ATIVIDADE_ID);
    if (type && type !== 'TODOS' && !tipoById[type]) issues.push(crm3_issue_('ATENCAO','RESULTADO_TIPO_INEXISTENTE',crm3_text_(r.RESULTADO_ID),type));
  });

  var activeByEntity = {};
  tratativas.forEach(function(t){
    if (!crm3_isOpenTratativaStatus_(t.STATUS_TRATATIVA)) return;
    var entityKey = [crm3_text_(t.TIPO_ENTIDADE), crm3_text_(t.ENTIDADE_ID), crm3_text_(t.FUNIL_ID)].join('|');
    if (activeByEntity[entityKey]) issues.push(crm3_issue_('BLOQUEANTE','TRATATIVA_ATIVA_DUPLICADA',entityKey,activeByEntity[entityKey] + ' / ' + crm3_text_(t.TRATATIVA_ID)));
    else activeByEntity[entityKey] = crm3_text_(t.TRATATIVA_ID);
    if (!etapaById[crm3_text_(t.ETAPA_ID)]) issues.push(crm3_issue_('BLOQUEANTE','TRATATIVA_ETAPA_INEXISTENTE',crm3_text_(t.TRATATIVA_ID),crm3_text_(t.ETAPA_ID)));
  });

  return {
    ok:issues.filter(function(x){ return x.severidade === 'BLOQUEANTE'; }).length === 0,
    blockers:issues.filter(function(x){ return x.severidade === 'BLOQUEANTE'; }).length,
    attention:issues.filter(function(x){ return x.severidade === 'ATENCAO'; }).length,
    issues:issues,
    totals:{ funis:funis.length, etapas:etapas.length, tiposAtividade:tipos.length, resultados:resultados.length, tratativas:tratativas.length }
  };
}

function smokeTestCrmJornadaFase3() {
  crm3_assertSetupReady_();
  var audit = auditCrmJornadaFase3();
  var cfg = crm3_apiGetConfig_();
  return {
    ok:audit.ok && cfg.ok,
    audit:audit,
    config:{ funis:cfg.funis.length, etapas:cfg.etapas.length, tiposAtividade:cfg.tiposAtividade.length, resultados:cfg.resultados.length, blocos:cfg.blocos.length },
    message:audit.ok ? 'Smoke test aprovado.' : 'Smoke test encontrou pendências bloqueantes.'
  };
}

/* ========================= CONFIG API ========================= */

function crm3_apiGetConfig_() {
  crm3_assertSetupReady_();
  return {
    ok:true,
    version:CRM3_CFG.VERSION,
    funis:crm3_readObjects_(CRM3_CFG.SHEETS.FUNIS).filter(function(x){ return crm3_isYes_(x.ATIVO); }),
    etapas:crm3_readObjects_(CRM3_CFG.SHEETS.ETAPAS).filter(function(x){ return crm3_isYes_(x.ATIVA); }),
    tiposAtividade:crm3_readObjects_(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE).filter(function(x){ return crm3_isYes_(x.ATIVA) && !crm5_isLegacyColetaText_(crm3_text_(x.TIPO_ATIVIDADE_ID) + ' ' + crm3_text_(x.NOME_EXIBICAO) + ' ' + crm3_text_(x.CATEGORIA)); }).sort(crm3_sortOrder_),
    resultados:crm3_readObjects_(CRM3_CFG.SHEETS.RESULTADOS).filter(function(x){ return crm3_isYes_(x.ATIVA) && !crm5_isLegacyColetaText_(crm3_text_(x.RESULTADO_ID) + ' ' + crm3_text_(x.TIPO_ATIVIDADE_ID) + ' ' + crm3_text_(x.NOME_EXIBICAO)); }).sort(crm3_sortOrder_),
    blocos:op_readBlocks_().filter(function(x){ return crm3_isYes_(x.ativo) && crm3_isYes_(x.permiteAgendamento); }),
    midias:op_readMidias_(),
    responsaveis:crm3_readObjects_(CRM3_CFG.SHEETS.RESPONSAVEIS).filter(function(x){ return crm3_isYes_(x.USER_ACTIVE) && crm3_isYes_(x.CRM_LINKED); }),
    transicoes:crm3_readJourneyTransitions_(),
    segmentos:(typeof crm82_getActiveSegments_ === 'function' ? crm82_getActiveSegments_() : []),
    locais:(typeof crm83_getActiveLocals_ === 'function' ? crm83_getActiveLocals_() : [])
  };
}

/* ========================= TRATATIVAS ========================= */

function crm3_apiGetJornada_(params) {
  crm3_assertSetupReady_();
  params = params || {};
  var funnelId = crm3_text_(params.funilId || '');
  var entityType = crm3_upper_(params.tipoEntidade || '');
  var status = crm3_upper_(params.statusTratativa || '');
  var responsavelId = crm3_text_(params.responsavelId || '');
  var tratativas = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS);
  var stages = crm3_readObjects_(CRM3_CFG.SHEETS.ETAPAS).filter(function(x){ return crm3_isYes_(x.ATIVA); });
  var stageById = crm3_indexBy_(stages, 'ETAPA_ID');
  var entityMaps = crm3_buildEntityMaps_();
  var nextActivityByTreatment = crm3_findNextActivitiesByTreatment_();

  var items = tratativas.filter(function(t){
    if (funnelId && crm3_text_(t.FUNIL_ID) !== funnelId) return false;
    if (entityType && crm3_upper_(t.TIPO_ENTIDADE) !== entityType) return false;
    if (status && crm3_upper_(t.STATUS_TRATATIVA) !== status) return false;
    if (responsavelId && crm3_text_(t.RESPONSAVEL_ID) !== responsavelId) return false;
    return true;
  }).map(function(t){
    var type = crm3_upper_(t.TIPO_ENTIDADE);
    var entity = type === 'PROSPECT' ? (entityMaps.prospects[crm3_text_(t.ENTIDADE_ID)] || {}) : (entityMaps.clients[crm3_text_(t.ENTIDADE_ID)] || {});
    var next = nextActivityByTreatment[crm3_text_(t.TRATATIVA_ID)] || null;
    return crm3_projectTreatment_(t, entity, stageById[crm3_text_(t.ETAPA_ID)] || {}, next);
  });

  var visibleStages = stages.filter(function(x){ return crm3_isYes_(x.EXIBE_KANBAN); }).sort(crm3_sortOrder_);
  var columns = visibleStages.filter(function(s){ return !funnelId || crm3_text_(s.FUNIL_ID) === funnelId; }).map(function(stage){
    var list = items.filter(function(x){ return x.etapaId === crm3_text_(stage.ETAPA_ID); });
    return { etapaId:crm3_text_(stage.ETAPA_ID), nome:crm3_text_(stage.NOME_EXIBICAO), cor:crm3_text_(stage.COR), icone:crm3_text_(stage.ICONE), total:list.length, items:list };
  });

  return { ok:true, items:items, columns:columns, filters:crm3_buildTreatmentFilters_(items) };
}

function crm3_apiCreateTratativa_(payload) {
  crm3_assertSetupReady_();
  payload = payload || {};
  var entityType = crm3_normalizeEntityType_(payload.tipoEntidade || payload.origemTipo);
  var entityId = crm3_text_(payload.entidadeId || payload.origemId || payload.clienteId || payload.prospectId);
  if (!entityId) throw new Error('entidadeId obrigatório.');
  var funnelId = crm3_text_(payload.funilId || (entityType === 'PROSPECT' ? CRM3_CFG.FUNIL_PROSPECTS : CRM3_CFG.FUNIL_CLIENTES));
  var entity = crm3_getEntity_(entityType, entityId);
  if (!entity) throw new Error('Entidade não encontrada: ' + entityType + ' ' + entityId);

  var existing = crm3_findOpenTratativa_(entityType, entityId, funnelId);
  if (existing && !crm3_isYes_(payload.permitirNova)) {
    return { ok:true, created:false, tratativaId:crm3_text_(existing.TRATATIVA_ID), message:'Já existe tratativa ativa para esta entidade.' };
  }

  var stageId = crm3_text_(payload.etapaId || crm3_defaultStageForFunnel_(funnelId));
  crm3_validateStageForFunnel_(stageId, funnelId);
  var now = op_nowIso_();
  var treatmentId = 'TRT_' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var clientAction = entityType === 'CLIENTE' ? crm3_text_(entity.acaoEngine || entity.acao || '') : '';
  var clientSubAction = entityType === 'CLIENTE' ? crm3_text_(entity.subAcao || '') : '';
  var priority = entityType === 'CLIENTE' ? crm3_text_(entity.prioridadeFila || '') : crm3_text_(entity.prioridade || '');

  var obj = {
    TRATATIVA_ID:treatmentId,
    TIPO_ENTIDADE:entityType,
    ENTIDADE_ID:entityId,
    FUNIL_ID:funnelId,
    ETAPA_ID:stageId,
    STATUS_TRATATIVA:'ABERTA',
    ORIGEM:crm3_text_(payload.origem || 'CRM_PORTAL'),
    ACAO_ENGINE_SNAPSHOT:clientAction,
    SUB_ACAO_SNAPSHOT:clientSubAction,
    PRIORIDADE_SNAPSHOT:priority,
    RESPONSAVEL_ID:crm3_text_(payload.responsavelId),
    ABERTA_EM:now,
    ETAPA_ATUALIZADA_EM:now,
    PROXIMO_FOLLOWUP_EM:crm3_text_(payload.proximoFollowupEm),
    UPDATED_BY:crm3_text_(payload.updatedBy || payload.responsavelId || 'CRM_PORTAL'),
    ATUALIZADO_EM:now,
    MOTIVO_ABERTURA:crm3_text_(payload.motivoAbertura || clientAction),
    CRIADO_POR:crm3_text_(payload.createdBy || payload.responsavelId || 'CRM_PORTAL')
  };
  crm3_appendObject_(CRM3_CFG.SHEETS.TRATATIVAS, obj);
  crm3_updateEntityTreatmentSnapshot_(entityType, entityId, { TRATATIVA_ATIVA_ID:treatmentId });
  crm3_appendEvent_({ entidadeTipo:entityType, entidadeId:entityId, tratativaId:treatmentId, tipoEvento:'TRATATIVA_CRIADA', valorNovo:stageId, responsavelId:obj.RESPONSAVEL_ID, origem:obj.ORIGEM, metadata:{ acaoEngine:clientAction, subAcao:clientSubAction } });
  crm3_bumpCacheRev_();
  return { ok:true, created:true, tratativaId:treatmentId, etapaId:stageId };
}

function crm3_apiMoveTratativa_(payload) {
  crm3_assertSetupReady_();
  payload = payload || {};
  var treatmentId = crm3_text_(payload.tratativaId);
  var destination = crm3_text_(payload.etapaId || payload.etapaDestinoId);
  if (!treatmentId || !destination) throw new Error('tratativaId e etapaId são obrigatórios.');
  var record = crm3_findRowObject_(CRM3_CFG.SHEETS.TRATATIVAS, 'TRATATIVA_ID', treatmentId);
  if (!record) throw new Error('Tratativa não encontrada.');
  crm3_validateStageForFunnel_(destination, crm3_text_(record.obj.FUNIL_ID));
  var current = crm3_text_(record.obj.ETAPA_ID);
  var stage = crm3_findConfigById_(CRM3_CFG.SHEETS.ETAPAS, 'ETAPA_ID', destination);
  var status = crm3_statusFromStage_(stage);
  var now = op_nowIso_();
  var patch = { ETAPA_ID:destination, ETAPA_ATUALIZADA_EM:now, STATUS_TRATATIVA:status, UPDATED_BY:crm3_text_(payload.updatedBy || payload.responsavelId || 'CRM_PORTAL'), ATUALIZADO_EM:now };
  if (status === 'CONCLUIDA' || status === 'ENCERRADA') { patch.ENCERRADA_EM = now; patch.FECHADA_POR = patch.UPDATED_BY; patch.MOTIVO_ENCERRAMENTO = crm3_text_(payload.motivo || stage.NOME_EXIBICAO); }
  crm3_patchRowObject_(record, patch);
  if (status === 'CONCLUIDA' || status === 'ENCERRADA') crm3_updateEntityTreatmentSnapshot_(crm3_text_(record.obj.TIPO_ENTIDADE), crm3_text_(record.obj.ENTIDADE_ID), { TRATATIVA_ATIVA_ID:'' });
  crm3_appendEvent_({ entidadeTipo:record.obj.TIPO_ENTIDADE, entidadeId:record.obj.ENTIDADE_ID, tratativaId:treatmentId, tipoEvento:'ETAPA_ALTERADA', valorAnterior:current, valorNovo:destination, responsavelId:crm3_text_(payload.responsavelId), origem:'CRM_PORTAL', metadata:{ statusTratativa:status } });
  crm3_bumpCacheRev_();
  return { ok:true, tratativaId:treatmentId, etapaAnterior:current, etapaId:destination, statusTratativa:status };
}

/* ========================= AGENDA GENÉRICA ========================= */

function crm3_apiGetAgenda_(params) {
  crm3_assertSetupReady_();
  params = params || {};
  var start = crm3_text_(params.start || params.dataInicio || op_getWeekStart_(op_toYmd_(new Date())));
  var end = crm3_text_(params.end || params.dataFim || op_addDays_(start, 6));
  var responsavelId = crm3_text_(params.responsavelId || '');
  var status = crm3_upper_(params.status || '');
  var typeId = crm3_text_(params.tipoAtividadeId || '');
  var items = crm3_readAgendaV3_(start, end).filter(function(x){
    if (responsavelId && x.responsavelId !== responsavelId) return false;
    if (status && crm3_upper_(x.statusAtividade) !== status) return false;
    if (typeId && x.tipoAtividadeId !== typeId) return false;
    return true;
  });
  return { ok:true, start:start, end:end, items:items, filters:crm3_buildAgendaFilters_(items) };
}

function crm3_apiSaveAtividade_(payload) {
  crm3_assertSetupReady_();
  payload = payload || {};
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(CRM3_CFG.SHEETS.AGENDA);
  if (!sh) throw new Error('Aba AGENDA_EXECUCAO não encontrada.');

  var requestId = crm3_text_(payload.requestId);
  if (requestId) {
    var existingRequest = crm3_findRowObject_(CRM3_CFG.SHEETS.AGENDA, 'REQUEST_ID', requestId);
    if (existingRequest) return { ok:true, created:false, agendaId:crm3_text_(existingRequest.obj.AGENDA_ID), idempotent:true };
  }

  var entityType = crm3_normalizeEntityType_(payload.tipoEntidade || payload.origemTipo);
  var entityId = crm3_text_(payload.entidadeId || payload.origemId || payload.clienteId || payload.prospectId);
  if (!entityId) throw new Error('entidadeId obrigatório.');
  var entity = crm3_getEntity_(entityType, entityId);
  if (!entity) throw new Error('Entidade não encontrada: ' + entityType + ' ' + entityId);

  var treatmentId = crm3_text_(payload.tratativaId);
  if (!treatmentId) {
    var open = crm3_findOpenTratativa_(entityType, entityId, entityType === 'PROSPECT' ? CRM3_CFG.FUNIL_PROSPECTS : CRM3_CFG.FUNIL_CLIENTES);
    if (open) treatmentId = crm3_text_(open.TRATATIVA_ID);
    else treatmentId = crm3_apiCreateTratativa_({ tipoEntidade:entityType, entidadeId:entityId, responsavelId:payload.responsavelId, origem:'AGENDA', createdBy:payload.createdBy }).tratativaId;
  }
  var treatment = crm3_findRowObject_(CRM3_CFG.SHEETS.TRATATIVAS, 'TRATATIVA_ID', treatmentId);
  if (!treatment) throw new Error('Tratativa não encontrada: ' + treatmentId);

  var typeId = crm3_text_(payload.tipoAtividadeId);
  if (crm5_isLegacyColetaText_(typeId)) throw new Error('COLETAS foi desativado. Selecione outro tipo de atividade.');
  var activityType = crm3_findConfigById_(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE, 'TIPO_ATIVIDADE_ID', typeId);
  if (!activityType || !crm3_isYes_(activityType.ATIVA)) throw new Error('Tipo de atividade inválido ou inativo.');
  if (entityType === 'CLIENTE' && !crm3_isYes_(activityType.APLICA_CLIENTE)) throw new Error('Tipo de atividade não permitido para clientes.');
  if (entityType === 'PROSPECT' && !crm3_isYes_(activityType.APLICA_PROSPECT)) throw new Error('Tipo de atividade não permitido para prospects.');

  var date = crm3_text_(payload.dataProgramada || payload.data);
  if (!date) throw new Error('Data programada obrigatória.');
  var block = payload.blocoId ? op_readBlocksById_()[crm3_text_(payload.blocoId)] : null;
  var duration = Number(payload.duracaoMin || activityType.DURACAO_PADRAO_MIN || 30) || 30;
  var startTime = crm3_text_(payload.horaProgramada || payload.horaInicio || (block && block.horaInicio) || '');
  if (crm3_isYes_(activityType.USA_BLOCO) && !block && !startTime) throw new Error('Selecione uma janela ou informe horário para esta atividade.');
  var endTime = crm3_text_(payload.horaFimProgramada || payload.horaFim || (block && block.horaFim) || crm3_addMinutesToTime_(startTime, duration));
  var media = crm3_resolveMedia_(payload.midiaRecomendadaCodigo || payload.midiaSugerida || '', entity);
  var responsible = crm3_resolveResponsible_(payload.responsavelId, payload.responsavel);
  var now = op_nowIso_();
  var agendaId = 'AGD_' + Utilities.getUuid().slice(0,8).toUpperCase();
  var name = crm3_text_(entity.cliente || entity.nomeFantasia || entity.razaoSocial || entityId);
  var local = crm3_text_(payload.local || entity.local || '');
  var statusAgenda = crm3_text_(payload.statusAgenda || 'PLANEJADO');

  var obj = {
    AGENDA_ID:agendaId,
    DATA:date,
    DIA_SEMANA:op_weekdayPt_(date),
    BLOCO_ID:crm3_text_(payload.blocoId),
    HORA_INICIO:startTime,
    HORA_FIM:endTime,
    TIPO_ATIVIDADE:crm3_text_(activityType.NOME_EXIBICAO),
    TIPO_COR:crm3_text_(activityType.COR || (block && block.cor) || ''),
    CLIENTE_ID:entityType === 'CLIENTE' ? entityId : '',
    CLIENTE:name,
    LOCAL:local,
    STATUS_AGENDA:statusAgenda,
    PRIORIDADE:crm3_text_(payload.prioridade || treatment.obj.PRIORIDADE_SNAPSHOT || 'MÉDIA'),
    ORDEM_AGENDA:Number(payload.ordemAgenda || 999),
    OBS_PLANEJADA:crm3_text_(payload.observacao || payload.obsPlanejada),
    MIDIA_SUGERIDA:crm3_text_(media.codigo),
    LINK_MIDIA_DIRETO:crm3_text_(media.link),
    RESPONSAVEL:crm3_text_(responsible.nome),
    CRIADO_EM:now,
    ATUALIZADO_EM:now,
    ORIGEM_TIPO:entityType,
    ORIGEM_ID:entityId,
    PROSPECT_ID:entityType === 'PROSPECT' ? entityId : '',
    CLIENTE_MASTER_ID:entityType === 'CLIENTE' ? entityId : '',
    TRATATIVA_ID:treatmentId,
    TIPO_ATIVIDADE_ID:typeId,
    STATUS_ATIVIDADE:statusAgenda,
    AGENDADA:'SIM',
    DATA_PROGRAMADA:date,
    HORA_PROGRAMADA:startTime,
    DURACAO_MIN:duration,
    MIDIA_RECOMENDADA_CODIGO:crm3_text_(media.codigo),
    RESPONSAVEL_ID:crm3_text_(responsible.id),
    REQUEST_ID:requestId,
    ENTIDADE_TIPO:entityType,
    ENTIDADE_ID:entityId,
    HORA_FIM_PROGRAMADA:endTime,
    LINK_MIDIA_RECOMENDADA:crm3_text_(media.link),
    OBSERVACAO:crm3_text_(payload.observacao || payload.obsPlanejada),
    CRIADO_POR:crm3_text_(payload.createdBy || responsible.id || 'CRM_PORTAL'),
    ATUALIZADO_POR:crm3_text_(payload.updatedBy || responsible.id || 'CRM_PORTAL')
  };
  crm3_appendObject_(CRM3_CFG.SHEETS.AGENDA, obj);
  crm3_patchTreatment_(treatmentId, { PROXIMA_ATIVIDADE_ID:agendaId, PROXIMO_FOLLOWUP_EM:date, RESPONSAVEL_ID:crm3_text_(responsible.id) || crm3_text_(treatment.obj.RESPONSAVEL_ID), UPDATED_BY:crm3_text_(payload.updatedBy || responsible.id || 'CRM_PORTAL'), ATUALIZADO_EM:now });
  crm3_updateEntityTreatmentSnapshot_(entityType, entityId, { TRATATIVA_ATIVA_ID:treatmentId, PROXIMA_ATIVIDADE_EM:date });
  crm3_appendEvent_({ entidadeTipo:entityType, entidadeId:entityId, tratativaId:treatmentId, tipoEvento:'ATIVIDADE_AGENDADA', valorNovo:agendaId, responsavelId:responsible.id, origem:'CRM_PORTAL', metadata:{ tipoAtividadeId:typeId, data:date, hora:startTime, midia:media.codigo } });
  crm3_bumpCacheRev_();

  if (crm3_isYes_(payload.executarAgora)) {
    var completePayload = {};
    Object.keys(payload).forEach(function(k){ completePayload[k] = payload[k]; });
    completePayload.agendaId = agendaId;
    completePayload.statusAtividade = 'CONCLUÍDO';
    return crm3_apiCompleteAtividade_(completePayload);
  }
  return { ok:true, created:true, agendaId:agendaId, tratativaId:treatmentId };
}

function crm3_apiCompleteAtividade_(payload) {
  crm3_assertSetupReady_();
  payload = payload || {};
  var agendaId = crm3_text_(payload.agendaId);
  if (!agendaId) throw new Error('agendaId obrigatório.');
  var record = crm3_findRowObject_(CRM3_CFG.SHEETS.AGENDA, 'AGENDA_ID', agendaId);
  if (!record) throw new Error('Atividade não encontrada.');
  var oldStatus = crm3_upper_(record.obj.STATUS_ATIVIDADE || record.obj.STATUS_AGENDA);
  if (oldStatus === 'CONCLUIDO') return { ok:true, agendaId:agendaId, tratativaId:crm3_text_(record.obj.TRATATIVA_ID), idempotent:true, message:'Atividade já concluída.' };

  var typeId = crm3_text_(record.obj.TIPO_ATIVIDADE_ID || payload.tipoAtividadeId);
  var activityType = crm3_findConfigById_(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE, 'TIPO_ATIVIDADE_ID', typeId) || {};
  var resultId = crm3_text_(payload.resultadoId || payload.resultado);
  if (crm3_isYes_(activityType.EXIGE_RESULTADO) && !resultId) throw new Error('Resultado obrigatório para concluir esta atividade.');
  if (resultId) crm3_validateResultForActivity_(resultId, typeId);

  var now = op_nowIso_();
  var mediaUsed = crm3_resolveMediaByCode_(payload.midiaUsadaCodigo || payload.midiaRecomendadaCodigo || record.obj.MIDIA_RECOMENDADA_CODIGO || '');
  var patch = {
    STATUS_AGENDA:'CONCLUÍDO', STATUS_ATIVIDADE:'CONCLUÍDO', RESULTADO_ID:resultId,
    OBS_EXECUCAO:crm3_text_(payload.observacao || payload.obsExecucao), OBSERVACAO:crm3_text_(payload.observacao || payload.obsExecucao),
    MIDIA_USADA_CODIGO:crm3_text_(mediaUsed.codigo), LINK_MIDIA_USADA:crm3_text_(mediaUsed.link),
    EXECUTADO_EM:now, CONCLUIDA_EM:now, ATUALIZADO_EM:now, ATUALIZADO_POR:crm3_text_(payload.updatedBy || payload.responsavelId || 'CRM_PORTAL')
  };
  crm3_patchRowObject_(record, patch);

  var treatmentId = crm3_text_(record.obj.TRATATIVA_ID);
  var transition = treatmentId ? crm3_applyJourneyTransition_(treatmentId, resultId, { agendaId:agendaId, responsavelId:payload.responsavelId, updatedBy:payload.updatedBy }) : null;
  var entityType = crm3_normalizeEntityType_(record.obj.ENTIDADE_TIPO || record.obj.ORIGEM_TIPO);
  var entityId = crm3_text_(record.obj.ENTIDADE_ID || record.obj.ORIGEM_ID || record.obj.CLIENTE_ID || record.obj.PROSPECT_ID);
  crm3_appendInteraction_({ agendaId:agendaId, tratativaId:treatmentId, data:record.obj.DATA_PROGRAMADA || record.obj.DATA, entidadeTipo:entityType, entidadeId:entityId, cliente:record.obj.CLIENTE, tipoAtividadeId:typeId, tipoInteracao:record.obj.TIPO_ATIVIDADE, status:'CONCLUÍDO', resultadoId:resultId, resultado:crm3_resultLabel_(resultId), observacao:patch.OBS_EXECUCAO, responsavel:record.obj.RESPONSAVEL, responsavelId:record.obj.RESPONSAVEL_ID, proximaAcao:transition && transition.proximoFollowupEm ? 'Follow-up em ' + transition.proximoFollowupEm : '' });
  crm3_updateEntityTreatmentSnapshot_(entityType, entityId, { ULTIMA_ATIVIDADE_ID:agendaId, PROXIMA_ATIVIDADE_EM:transition ? transition.proximoFollowupEm : '' });
  crm3_syncLegacyLifecycle_(entityType, entityId, resultId, typeId, { observacao:patch.OBS_EXECUCAO, status:'CONCLUIDO' });
  crm3_appendEvent_({ entidadeTipo:entityType, entidadeId:entityId, tratativaId:treatmentId, tipoEvento:'ATIVIDADE_CONCLUIDA', valorAnterior:oldStatus, valorNovo:resultId || 'CONCLUIDO', responsavelId:crm3_text_(record.obj.RESPONSAVEL_ID || payload.responsavelId), origem:'CRM_PORTAL', metadata:{ agendaId:agendaId, tipoAtividadeId:typeId, midiaUsada:mediaUsed.codigo } });
  crm3_bumpCacheRev_();
  return { ok:true, agendaId:agendaId, tratativaId:treatmentId, resultadoId:resultId, transition:transition };
}

function crm3_apiCancelAtividade_(payload) {
  crm3_assertSetupReady_();
  payload = payload || {};
  var agendaId = crm3_text_(payload.agendaId);
  if (!agendaId) throw new Error('agendaId obrigatório.');
  var record = crm3_findRowObject_(CRM3_CFG.SHEETS.AGENDA, 'AGENDA_ID', agendaId);
  if (!record) throw new Error('Atividade não encontrada.');
  var oldStatus = crm3_upper_(record.obj.STATUS_ATIVIDADE || record.obj.STATUS_AGENDA);
  if (oldStatus === 'CONCLUIDO') throw new Error('Atividade concluída não pode ser cancelada.');
  var now = op_nowIso_();
  crm3_patchRowObject_(record, { STATUS_AGENDA:'CANCELADO', STATUS_ATIVIDADE:'CANCELADO', MOTIVO_CANCELAMENTO:crm3_text_(payload.motivo || payload.observacao), OBS_EXECUCAO:crm3_text_(payload.observacao), ATUALIZADO_EM:now, ATUALIZADO_POR:crm3_text_(payload.updatedBy || payload.responsavelId || 'CRM_PORTAL') });
  crm3_appendEvent_({ entidadeTipo:record.obj.ENTIDADE_TIPO || record.obj.ORIGEM_TIPO, entidadeId:record.obj.ENTIDADE_ID || record.obj.ORIGEM_ID, tratativaId:record.obj.TRATATIVA_ID, tipoEvento:'ATIVIDADE_CANCELADA', valorAnterior:oldStatus, valorNovo:'CANCELADO', responsavelId:payload.responsavelId || record.obj.RESPONSAVEL_ID, origem:'CRM_PORTAL', metadata:{ agendaId:agendaId, motivo:payload.motivo || payload.observacao || '' } });
  crm3_bumpCacheRev_();
  return { ok:true, agendaId:agendaId, status:'CANCELADO' };
}

function crm3_apiDeleteAtividade_(payload) {
  crm3_assertSetupReady_();
  payload = payload || {};
  var agendaId = crm3_text_(payload.agendaId || payload.id);
  if (!agendaId) throw new Error('agendaId obrigatório.');
  var record = crm3_findRowObject_(CRM3_CFG.SHEETS.AGENDA, 'AGENDA_ID', agendaId);
  if (!record) throw new Error('Atividade não encontrada.');
  var status = crm3_upper_(record.obj.STATUS_ATIVIDADE || record.obj.STATUS_AGENDA);
  if (status === 'CONCLUIDO') throw new Error('Atividade concluída não pode ser excluída. Use o histórico para preservar a auditoria.');
  crm3_appendEvent_({ entidadeTipo:record.obj.ENTIDADE_TIPO || record.obj.ORIGEM_TIPO, entidadeId:record.obj.ENTIDADE_ID || record.obj.ORIGEM_ID, tratativaId:record.obj.TRATATIVA_ID, tipoEvento:'ATIVIDADE_EXCLUIDA', valorAnterior:agendaId, valorNovo:'', responsavelId:payload.responsavelId || record.obj.RESPONSAVEL_ID, origem:'CRM_PORTAL', metadata:{ status:status, motivo:payload.motivo || '' } });
  record.sheet.deleteRow(record.rowNumber);
  crm3_bumpCacheRev_();
  return { ok:true, agendaId:agendaId, deleted:true };
}

/* ========================= DASHBOARD ========================= */

function crm3_apiGetDashboard_(params) {
  crm3_assertSetupReady_();
  params = params || {};
  var start = crm3_text_(params.start || params.dataInicio || op_getWeekStart_(op_toYmd_(new Date())));
  var end = crm3_text_(params.end || params.dataFim || op_addDays_(start, 6));
  var responsavelId = crm3_text_(params.responsavelId || '');
  var activities = crm3_readAgendaV3_(start, end).filter(function(x){
    return !responsavelId || crm3_text_(x.responsavelId) === responsavelId;
  });
  var treatments = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS).filter(function(x){
    return !responsavelId || crm3_text_(x.RESPONSAVEL_ID) === responsavelId;
  });
  var today = op_toYmd_(new Date());
  var planned = activities.filter(function(x){ return crm3_upper_(x.statusAtividade) === 'PLANEJADO'; });
  var completed = activities.filter(function(x){ return crm3_upper_(x.statusAtividade) === 'CONCLUIDO'; });
  var overdue = planned.filter(function(x){ return x.dataProgramada && x.dataProgramada < today; });
  return {
    ok:true,
    period:{ start:start, end:end },
    atividades:{ total:activities.length, planejadas:planned.length, concluidas:completed.length, canceladas:activities.filter(function(x){ return crm3_upper_(x.statusAtividade) === 'CANCELADO'; }).length, vencidas:overdue.length, taxaExecucao:activities.length ? Math.round((completed.length / activities.length) * 100) : 0, porTipo:crm3_countBy_(activities,'tipoAtividadeNome'), porResponsavel:crm3_countBy_(activities,'responsavelNome') },
    tratativas:{ abertas:treatments.filter(function(x){ return crm3_upper_(x.STATUS_TRATATIVA) === 'ABERTA'; }).length, pausadas:treatments.filter(function(x){ return crm3_upper_(x.STATUS_TRATATIVA) === 'PAUSADA'; }).length, concluidas:treatments.filter(function(x){ return crm3_upper_(x.STATUS_TRATATIVA) === 'CONCLUIDA'; }).length, encerradas:treatments.filter(function(x){ return crm3_upper_(x.STATUS_TRATATIVA) === 'ENCERRADA'; }).length, porEtapa:crm3_countBy_(treatments,'ETAPA_ID') }
  };
}

/* ========================= MIGRAÇÃO INICIAL DE TRATATIVAS ========================= */

function previewMigracaoTratativasFase3(options) {
  crm3_assertSetupReady_();
  return crm3_buildTreatmentMigrationPlan_(options || {}).summary;
}

function migrateTratativasFase3(options) {
  return op_withDocumentLock_(function(){
    crm3_assertSetupReady_();
    var plan = crm3_buildTreatmentMigrationPlan_(options || {});
    if (!plan.rows.length) return { ok:true, inserted:0, summary:plan.summary, message:'Nenhuma tratativa nova necessária.' };
    crm3_appendObjects_(CRM3_CFG.SHEETS.TRATATIVAS, plan.rows);
    plan.entityUpdates.forEach(function(u){ crm3_updateEntityTreatmentSnapshot_(u.tipoEntidade, u.entidadeId, { TRATATIVA_ATIVA_ID:u.tratativaId }); });
    crm3_appendEventsBatch_(plan.events);
    PropertiesService.getScriptProperties().setProperty(CRM3_CFG.PROPS.MIGRATION_AT, op_nowIso_());
    crm3_bumpCacheRev_();
    return { ok:true, inserted:plan.rows.length, summary:plan.summary, message:'Tratativas iniciais criadas sem alterar recomendações automáticas.' };
  });
}

function crm3_buildTreatmentMigrationPlan_(options) {
  options = options || {};
  var includeClients = options.includeClients !== false;
  var includeProspects = options.includeProspects !== false;
  var includeManter = crm3_isYes_(options.includeManter);
  var existing = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS);
  var openKeys = {};
  existing.forEach(function(t){ if (crm3_isOpenTratativaStatus_(t.STATUS_TRATATIVA)) openKeys[[crm3_upper_(t.TIPO_ENTIDADE),crm3_text_(t.ENTIDADE_ID),crm3_text_(t.FUNIL_ID)].join('|')] = true; });
  var rows = [], entityUpdates = [], events = [];
  var now = op_nowIso_();
  var counts = { clientsEligible:0, clientsInserted:0, clientsSkippedExisting:0, prospectsEligible:0, prospectsInserted:0, prospectsSkippedExisting:0 };

  if (includeClients) {
    var clients = op_readClientsMaster_({ projection:'full' }).items;
    clients.forEach(function(c){
      var action = crm3_upper_(c.acaoEngine || c.acao || '');
      var accepted = CRM3_CFG.ACTIONABLE_RECOMMENDATIONS.slice();
      if (includeManter) accepted.push('MANTER');
      if (accepted.indexOf(action) < 0) return;
      counts.clientsEligible++;
      var key = ['CLIENTE',crm3_text_(c.clienteId),CRM3_CFG.FUNIL_CLIENTES].join('|');
      if (openKeys[key]) { counts.clientsSkippedExisting++; return; }
      var id = 'TRT_' + Utilities.getUuid().slice(0,8).toUpperCase();
      var obj = crm3_newTreatmentObject_({ id:id, tipoEntidade:'CLIENTE', entidadeId:c.clienteId, funilId:CRM3_CFG.FUNIL_CLIENTES, etapaId:CRM3_CFG.DEFAULT_CLIENT_STAGE, origem:'MIGRACAO_FASE3', acao:action, subAcao:c.subAcao, prioridade:c.prioridadeFila, now:now });
      rows.push(obj); entityUpdates.push({ tipoEntidade:'CLIENTE', entidadeId:c.clienteId, tratativaId:id }); events.push(crm3_eventObject_({ entidadeTipo:'CLIENTE', entidadeId:c.clienteId, tratativaId:id, tipoEvento:'TRATATIVA_MIGRADA', valorNovo:CRM3_CFG.DEFAULT_CLIENT_STAGE, origem:'MIGRACAO_FASE3', metadata:{ acaoEngine:action } }));
      openKeys[key] = true; counts.clientsInserted++;
    });
  }
  if (includeProspects) {
    var prospects = op_readProspects_().items;
    prospects.forEach(function(p){
      if (crm3_upper_(p.statusProspect) === 'CONVERTIDO') return;
      counts.prospectsEligible++;
      var key = ['PROSPECT',crm3_text_(p.prospectId),CRM3_CFG.FUNIL_PROSPECTS].join('|');
      if (openKeys[key]) { counts.prospectsSkippedExisting++; return; }
      var id = 'TRT_' + Utilities.getUuid().slice(0,8).toUpperCase();
      var stage = crm3_mapLegacyProspectStage_(p.etapaFunil);
      var status = stage === 'P_PERDIDO' ? 'ENCERRADA' : (stage === 'P_CONVERTIDO' ? 'CONCLUIDA' : 'ABERTA');
      var obj = crm3_newTreatmentObject_({ id:id, tipoEntidade:'PROSPECT', entidadeId:p.prospectId, funilId:CRM3_CFG.FUNIL_PROSPECTS, etapaId:stage, origem:'MIGRACAO_FASE3', prioridade:p.prioridade, now:now, statusTratativa:status });
      rows.push(obj); entityUpdates.push({ tipoEntidade:'PROSPECT', entidadeId:p.prospectId, tratativaId:status === 'ABERTA' ? id : '' }); events.push(crm3_eventObject_({ entidadeTipo:'PROSPECT', entidadeId:p.prospectId, tratativaId:id, tipoEvento:'TRATATIVA_MIGRADA', valorNovo:stage, origem:'MIGRACAO_FASE3' }));
      openKeys[key] = true; counts.prospectsInserted++;
    });
  }
  return { rows:rows, entityUpdates:entityUpdates, events:events, summary:{ ok:true, includeManter:includeManter, counts:counts, totalToInsert:rows.length } };
}

/* ========================= RESULTADOS COMPLEMENTARES ========================= */

function crm3_seedAdditionalResults_() {
  var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.RESULTADOS);
  if (!sh) throw new Error('Aba CRM_RESULTADOS_ATIVIDADE não encontrada. Execute setupCrmCanonicoFase2().');
  var values = sh.getDataRange().getValues();
  var hm = crm3_headerMap_(values[0]);
  var exists = false;
  for (var i=1;i<values.length;i++) if (crm3_text_(values[i][hm.RESULTADO_ID]) === 'RES_CONCLUIDO') exists = true;
  if (!exists) crm3_appendObject_(CRM3_CFG.SHEETS.RESULTADOS, { RESULTADO_ID:'RES_CONCLUIDO',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Concluído',ATIVA:'SIM',ORDEM:99 });
}

/* ========================= TRANSIÇÕES DE JORNADA ========================= */

function crm3_prepareTransitionSchema_() {
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(CRM3_CFG.SHEETS.TRANSICOES);
  if (!sh) {
    sh = ss.insertSheet(CRM3_CFG.SHEETS.TRANSICOES);
    sh.getRange('A1').setValue('⚡ MOTOR DE CICLO DE VIDA — Tabela de Transições').setFontSize(13).setFontWeight('bold').setFontColor('#00416B');
    sh.getRange('A2').setValue('Resultados das atividades podem atualizar campos legados e movimentar a jornada comercial.').setFontColor('#666').setFontStyle('italic');
    var legacyHeaders = ['ATIVA','RESULTADO','NOVO_STATUS','PROXIMA_ACAO','DIAS_FOLLOWUP','NOVA_ACAO_FUNIL','DESCRICAO'];
    sh.getRange(4,1,1,legacyHeaders.length).setValues([legacyHeaders]).setFontWeight('bold').setBackground('#00416B').setFontColor('#FFFFFF');
    var legacyRows = [
      ['SIM','CONTRATO_FECHADO','CONTRATO ATIVO','Acompanhar em 30 dias',30,'FIDELIZAR','Cliente assinou contrato.'],
      ['SIM','PROPOSTA_ACEITA','CONTRATO EM PROCESSO','Enviar contrato para assinatura',2,'CONVERTER','Proposta aceita.'],
      ['SIM','PROPOSTA_APRESENTADA','PROPOSTA PENDENTE','Follow-up da proposta',3,'CONVERTER','Proposta apresentada.'],
      ['SIM','CLIENTE_INTERESSADO','EM NEGOCIAÇÃO','Enviar proposta comercial',2,'CONVERTER','Cliente interessado.'],
      ['SIM','SEM_INTERESSE','SEM INTERESSE','Revisitar em 60 dias',60,'MANTER','Sem interesse no momento.'],
      ['SIM','NAO_ENCONTRADO','TENTATIVA S/ CONTATO','Tentar novo contato',1,'','Nova tentativa necessária.'],
      ['SIM','REAGENDADO','REAGENDADO','Agendar novo contato',0,'','Atividade reagendada.'],
      ['SIM','CONCLUIDO','','',0,'','Conclusão genérica.']
    ];
    sh.getRange(5,1,legacyRows.length,legacyHeaders.length).setValues(legacyRows);
  }
  var headerRow = 4;
  var lastCol = Math.max(sh.getLastColumn(), 7);
  var headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var hm = crm3_headerMap_(headers);
  var missing = CRM3_TRANSITION_HEADERS.filter(function(h){ return hm[op_headerKey_(h)] === undefined; });
  if (missing.length) {
    if (sh.getMaxColumns() < headers.length + missing.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length + missing.length - sh.getMaxColumns());
    sh.getRange(headerRow, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#334155').setFontColor('#FFFFFF');
  }
  sh.setFrozenRows(4);
}

function crm3_seedJourneyTransitions_() {
  var seeds = [
    crm3_transitionSeed_('FUNIL_PROSPECTS','*','RES_INTERESSE','P_OPORTUNIDADE',2,'ABERTA','Prospect demonstrou interesse.'),
    crm3_transitionSeed_('FUNIL_PROSPECTS','*','RES_PROPOSTA_ENVIADA','P_NEGOCIACAO',3,'ABERTA','Proposta enviada ao prospect.'),
    crm3_transitionSeed_('FUNIL_PROSPECTS','*','RES_CONTRATO_FECHADO','P_CONVERTIDO',0,'CONCLUIDA','Prospect convertido em cliente.'),
    crm3_transitionSeed_('FUNIL_PROSPECTS','*','RES_SEM_INTERESSE','P_PERDIDO',30,'ENCERRADA','Prospect sem interesse no momento.'),
    crm3_transitionSeed_('FUNIL_PROSPECTS','*','RES_SEM_RESPOSTA','',2,'ABERTA','Manter etapa e criar follow-up.'),
    crm3_transitionSeed_('FUNIL_PROSPECTS','*','RES_REAGENDADO','',0,'ABERTA','Manter etapa após reagendamento.'),
    crm3_transitionSeed_('FUNIL_PROSPECTS','*','RES_NAO_ENCONTRADO','',1,'ABERTA','Nova tentativa de contato.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_INTERESSE','C_NECESSIDADE',2,'ABERTA','Necessidade comercial identificada.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_PROPOSTA_ENVIADA','C_SOLUCAO',3,'ABERTA','Solução ou proposta em andamento.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_CONTRATO_FECHADO','C_CONCLUIDO',0,'CONCLUIDA','Tratativa concluída com contrato.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_CLIENTE_RECUPERADO','C_CONCLUIDO',0,'CONCLUIDA','Cliente recuperado.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_SEM_INTERESSE','C_PAUSADO',30,'PAUSADA','Pausar e revisar futuramente.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_SEM_RESPOSTA','C_ACOMPANHAMENTO',7,'ABERTA','Aguardar retorno e repetir contato.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_REAGENDADO','',0,'ABERTA','Manter etapa após reagendamento.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_NAO_ENCONTRADO','C_TRATATIVA',1,'ABERTA','Realizar nova tentativa.'),
    crm3_transitionSeed_('FUNIL_CLIENTES','*','RES_CONCLUIDO','C_CONCLUIDO',0,'CONCLUIDA','Tratativa concluída manualmente.')
  ];
  var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.TRANSICOES);
  var data = sh.getDataRange().getValues();
  var hm = crm3_headerMap_(data[3]);
  var existing = {};
  data.slice(4).forEach(function(r){
    var key = [crm3_text_(r[hm.FUNIL_ID]),crm3_text_(r[hm.ETAPA_ORIGEM_ID]),crm3_text_(r[hm.RESULTADO_ID])].join('|');
    if (key !== '||') existing[key] = true;
  });
  var newRows = [];
  seeds.forEach(function(seed){
    var key = [seed.FUNIL_ID,seed.ETAPA_ORIGEM_ID,seed.RESULTADO_ID].join('|');
    if (existing[key]) return;
    var row = new Array(sh.getLastColumn()).fill('');
    Object.keys(seed).forEach(function(k){ if (hm[k] !== undefined) row[hm[k]] = seed[k]; });
    newRows.push(row);
  });
  if (newRows.length) sh.getRange(sh.getLastRow()+1,1,newRows.length,sh.getLastColumn()).setValues(newRows);
}

function crm3_readJourneyTransitions_() {
  var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.TRANSICOES);
  if (!sh || sh.getLastRow() < 5) return [];
  var data = sh.getDataRange().getValues();
  var hm = crm3_headerMap_(data[3]);
  return data.slice(4).map(function(r){
    return {
      funilId:crm3_text_(r[hm.FUNIL_ID]), etapaOrigemId:crm3_text_(r[hm.ETAPA_ORIGEM_ID]), resultadoId:crm3_text_(r[hm.RESULTADO_ID]), etapaDestinoId:crm3_text_(r[hm.ETAPA_DESTINO_ID]), followupDias:Number(r[hm.FOLLOWUP_DIAS_JORNADA]) || 0, statusTratativaDestino:crm3_text_(r[hm.STATUS_TRATATIVA_DESTINO]), ativa:crm3_isYes_(r[hm.ATIVA_JORNADA]), descricao:crm3_text_(r[hm.DESCRICAO_JORNADA])
    };
  }).filter(function(x){ return x.ativa && x.funilId && x.resultadoId; });
}

function crm3_applyJourneyTransition_(treatmentId, resultId, ctx) {
  var treatment = crm3_findRowObject_(CRM3_CFG.SHEETS.TRATATIVAS, 'TRATATIVA_ID', treatmentId);
  if (!treatment) return null;
  ctx = ctx || {};
  var funilId = crm3_text_(treatment.obj.FUNIL_ID);
  var currentStage = crm3_text_(treatment.obj.ETAPA_ID);
  var rule = crm3_findJourneyTransition_(funilId, currentStage, resultId);
  var now = op_nowIso_();
  var nextFollowup = '';
  if (rule && rule.followupDias > 0) nextFollowup = op_addDays_(op_toYmd_(new Date()), rule.followupDias);
  var patch = { ULTIMA_ATIVIDADE_ID:crm3_text_(ctx.agendaId), PROXIMA_ATIVIDADE_ID:'', UPDATED_BY:crm3_text_(ctx.updatedBy || ctx.responsavelId || 'CRM_PORTAL'), ATUALIZADO_EM:now };
  if (rule) {
    if (rule.etapaDestinoId) { crm3_validateStageForFunnel_(rule.etapaDestinoId, funilId); patch.ETAPA_ID = rule.etapaDestinoId; patch.ETAPA_ATUALIZADA_EM = now; }
    if (rule.statusTratativaDestino) patch.STATUS_TRATATIVA = rule.statusTratativaDestino;
    if (nextFollowup) patch.PROXIMO_FOLLOWUP_EM = nextFollowup;
    if (patch.STATUS_TRATATIVA === 'CONCLUIDA' || patch.STATUS_TRATATIVA === 'ENCERRADA') { patch.ENCERRADA_EM = now; patch.FECHADA_POR = patch.UPDATED_BY; patch.MOTIVO_ENCERRAMENTO = crm3_resultLabel_(resultId); }
  }
  crm3_patchRowObject_(treatment, patch);
  if (patch.STATUS_TRATATIVA === 'CONCLUIDA' || patch.STATUS_TRATATIVA === 'ENCERRADA') crm3_updateEntityTreatmentSnapshot_(treatment.obj.TIPO_ENTIDADE, treatment.obj.ENTIDADE_ID, { TRATATIVA_ATIVA_ID:'', PROXIMA_ATIVIDADE_EM:'' });
  return { applied:!!rule, etapaAnterior:currentStage, etapaId:patch.ETAPA_ID || currentStage, statusTratativa:patch.STATUS_TRATATIVA || crm3_text_(treatment.obj.STATUS_TRATATIVA), proximoFollowupEm:nextFollowup };
}

function crm3_findJourneyTransition_(funnelId, currentStage, resultId) {
  var rules = crm3_readJourneyTransitions_();
  var exact = null, wildcard = null;
  rules.forEach(function(r){
    if (r.funilId !== funnelId || r.resultadoId !== resultId) return;
    if (r.etapaOrigemId === currentStage) exact = r;
    else if (r.etapaOrigemId === '*') wildcard = r;
  });
  return exact || wildcard;
}

/* ========================= READERS E HELPERS ========================= */

function crm3_readAgendaV3_(start, end) {
  var cacheKey = 'agenda|' + start + '|' + end;
  var cached = crm3_cacheGet_(cacheKey);
  if (cached) return cached;
  var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.AGENDA);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var hm = crm3_headerMap_(values[0]);
  var types = crm3_indexBy_(crm3_readObjects_(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE), 'TIPO_ATIVIDADE_ID');
  var results = crm3_indexBy_(crm3_readObjects_(CRM3_CFG.SHEETS.RESULTADOS), 'RESULTADO_ID');
  var out = values.slice(1).map(function(r){
    var date = op_dateValueToYmd_(crm3_cell_(r,hm,['DATA_PROGRAMADA','DATA']));
    var typeId = crm3_text_(crm3_cell_(r,hm,'TIPO_ATIVIDADE_ID'));
    var type = types[typeId] || {};
    return {
      agendaId:crm3_text_(crm3_cell_(r,hm,'AGENDA_ID')), tratativaId:crm3_text_(crm3_cell_(r,hm,'TRATATIVA_ID')),
      entidadeTipo:crm3_text_(crm3_cell_(r,hm,['ENTIDADE_TIPO','ORIGEM_TIPO'])), entidadeId:crm3_text_(crm3_cell_(r,hm,['ENTIDADE_ID','ORIGEM_ID'])),
      clienteId:crm3_text_(crm3_cell_(r,hm,'CLIENTE_ID')), prospectId:crm3_text_(crm3_cell_(r,hm,'PROSPECT_ID')), cliente:crm3_text_(crm3_cell_(r,hm,'CLIENTE')), local:crm3_text_(crm3_cell_(r,hm,'LOCAL')),
      dataProgramada:date, horaProgramada:op_timeValueToText_(crm3_cell_(r,hm,['HORA_PROGRAMADA','HORA_INICIO'])), horaFimProgramada:op_timeValueToText_(crm3_cell_(r,hm,['HORA_FIM_PROGRAMADA','HORA_FIM'])), blocoId:crm3_text_(crm3_cell_(r,hm,'BLOCO_ID')),
      tipoAtividadeId:typeId, tipoAtividadeNome:crm3_text_(type.NOME_EXIBICAO || crm3_cell_(r,hm,'TIPO_ATIVIDADE')), icone:crm3_text_(type.ICONE), cor:crm3_text_(type.COR || crm3_cell_(r,hm,'TIPO_COR')),
      statusAtividade:crm3_text_(crm3_cell_(r,hm,['STATUS_ATIVIDADE','STATUS_AGENDA'])), resultadoId:crm3_text_(crm3_cell_(r,hm,'RESULTADO_ID')), resultadoNome:(function(){ var rid=crm3_text_(crm3_cell_(r,hm,'RESULTADO_ID')); return rid && results[rid] ? crm3_text_(results[rid].NOME_EXIBICAO) : rid; })(),
      midiaRecomendadaCodigo:crm3_text_(crm3_cell_(r,hm,'MIDIA_RECOMENDADA_CODIGO')), midiaUsadaCodigo:crm3_text_(crm3_cell_(r,hm,'MIDIA_USADA_CODIGO')), linkMidiaDireto:crm3_text_(crm3_cell_(r,hm,['LINK_MIDIA_USADA','LINK_MIDIA_RECOMENDADA','LINK_MIDIA_DIRETO'])),
      responsavelId:crm3_text_(crm3_cell_(r,hm,'RESPONSAVEL_ID')), responsavelNome:crm3_text_(crm3_cell_(r,hm,'RESPONSAVEL')), observacao:crm3_text_(crm3_cell_(r,hm,['OBSERVACAO','OBS_EXECUCAO','OBS_PLANEJADA']))
    };
  }).filter(function(x){ return x.agendaId && !crm5_isLegacyColetaText_(x.tipoAtividadeId + ' ' + x.tipoAtividadeNome) && x.dataProgramada >= start && x.dataProgramada <= end; }).sort(function(a,b){ return (a.dataProgramada + '|' + a.horaProgramada).localeCompare(b.dataProgramada + '|' + b.horaProgramada); });
  crm3_cachePut_(cacheKey, out);
  return out;
}

function crm3_buildEntityMaps_() {
  var clients = op_readClientsMaster_({ projection:'full' }).byId;
  var prospects = op_readProspects_().byId;
  return { clients:clients, prospects:prospects };
}
function crm3_getEntity_(type, id) { var maps = crm3_buildEntityMaps_(); return type === 'PROSPECT' ? (maps.prospects[id] || null) : (maps.clients[id] || null); }
function crm3_projectTreatment_(t, entity, stage, next) {
  return {
    tratativaId:crm3_text_(t.TRATATIVA_ID), tipoEntidade:crm3_text_(t.TIPO_ENTIDADE), entidadeId:crm3_text_(t.ENTIDADE_ID), funilId:crm3_text_(t.FUNIL_ID), etapaId:crm3_text_(t.ETAPA_ID), etapaNome:crm3_text_(stage.NOME_EXIBICAO), etapaCor:crm3_text_(stage.COR), statusTratativa:crm3_text_(t.STATUS_TRATATIVA),
    cliente:crm3_text_(entity.cliente || entity.nomeFantasia || entity.razaoSocial || t.ENTIDADE_ID), local:crm3_text_(entity.local), curva:crm3_text_(entity.curva), recomendacao:crm3_text_(entity.acaoEngine || t.ACAO_ENGINE_SNAPSHOT), subAcao:crm3_text_(entity.subAcao || t.SUB_ACAO_SNAPSHOT), prioridade:crm3_text_(entity.prioridadeFila || entity.prioridade || t.PRIORIDADE_SNAPSHOT), diasSemPostar:Number(entity.diasSemPostar) || 0, ultimaPostagemLabel:crm3_text_(entity.ultimaPostagemLabel), responsavelId:crm3_text_(t.RESPONSAVEL_ID), proximoFollowupEm:op_dateValueToYmd_(t.PROXIMO_FOLLOWUP_EM), proximaAtividade:next
  };
}
function crm3_findNextActivitiesByTreatment_() {
  var today = op_toYmd_(new Date());
  var items = crm3_readAgendaV3_(today, op_addDays_(today, 365));
  var out = {};
  items.forEach(function(x){ if (crm3_upper_(x.statusAtividade) !== 'PLANEJADO' || !x.tratativaId) return; if (!out[x.tratativaId] || (x.dataProgramada + x.horaProgramada) < (out[x.tratativaId].dataProgramada + out[x.tratativaId].horaProgramada)) out[x.tratativaId] = x; });
  return out;
}
function crm3_buildTreatmentFilters_(items) { return { responsaveis:crm3_unique_(items.map(function(x){ return x.responsavelId; })), etapas:crm3_unique_(items.map(function(x){ return x.etapaId; })), recomendacoes:crm3_unique_(items.map(function(x){ return x.recomendacao; })), locais:crm3_unique_(items.map(function(x){ return x.local; })) }; }
function crm3_buildAgendaFilters_(items) { return { responsaveis:crm3_unique_(items.map(function(x){ return x.responsavelId; })), tiposAtividade:crm3_unique_(items.map(function(x){ return x.tipoAtividadeId; })), status:crm3_unique_(items.map(function(x){ return x.statusAtividade; })) }; }

function crm3_findOpenTratativa_(type, id, funnelId) {
  var rows = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS);
  for (var i=0;i<rows.length;i++) if (crm3_upper_(rows[i].TIPO_ENTIDADE) === crm3_upper_(type) && crm3_text_(rows[i].ENTIDADE_ID) === crm3_text_(id) && crm3_text_(rows[i].FUNIL_ID) === crm3_text_(funnelId) && crm3_isOpenTratativaStatus_(rows[i].STATUS_TRATATIVA)) return rows[i];
  return null;
}
function crm3_patchTreatment_(id, patch) { var rec = crm3_findRowObject_(CRM3_CFG.SHEETS.TRATATIVAS,'TRATATIVA_ID',id); if (!rec) throw new Error('Tratativa não encontrada: ' + id); crm3_patchRowObject_(rec,patch); }
function crm3_newTreatmentObject_(x) { return { TRATATIVA_ID:x.id,TIPO_ENTIDADE:x.tipoEntidade,ENTIDADE_ID:x.entidadeId,FUNIL_ID:x.funilId,ETAPA_ID:x.etapaId,STATUS_TRATATIVA:x.statusTratativa || 'ABERTA',ORIGEM:x.origem || 'CRM_PORTAL',ACAO_ENGINE_SNAPSHOT:x.acao || '',SUB_ACAO_SNAPSHOT:x.subAcao || '',PRIORIDADE_SNAPSHOT:x.prioridade || '',RESPONSAVEL_ID:x.responsavelId || '',ABERTA_EM:x.now || op_nowIso_(),ETAPA_ATUALIZADA_EM:x.now || op_nowIso_(),UPDATED_BY:x.updatedBy || x.origem || 'CRM_PORTAL',ATUALIZADO_EM:x.now || op_nowIso_(),MOTIVO_ABERTURA:x.acao || '',CRIADO_POR:x.origem || 'CRM_PORTAL' }; }
function crm3_mapLegacyProspectStage_(s) { var k = crm3_upper_(s); return { 'NOVO':'P_NOVO','CONTATO':'P_CONTATO','VISITA':'P_OPORTUNIDADE','OPORTUNIDADE':'P_OPORTUNIDADE','PROPOSTA':'P_NEGOCIACAO','CONTRATO':'P_CONVERTIDO','CONVERTIDO':'P_CONVERTIDO','PERDIDO':'P_PERDIDO' }[k] || 'P_NOVO'; }

function crm3_updateEntityTreatmentSnapshot_(type, id, patch) {
  var sheetName = crm3_upper_(type) === 'PROSPECT' ? CRM3_CFG.SHEETS.PROSPECTS : CRM3_CFG.SHEETS.CADASTRO;
  var keyHeader = crm3_upper_(type) === 'PROSPECT' ? 'PROSPECT_ID' : 'CLIENTE_ID';
  var rec = crm3_findRowObject_(sheetName, keyHeader, id);
  if (!rec) return false;
  crm3_patchRowObject_(rec, patch);
  return true;
}

function crm3_appendInteraction_(x) {
  crm3_appendObject_(CRM3_CFG.SHEETS.INTERACOES, {
    INTERACAO_ID:'INT_' + Utilities.getUuid().slice(0,8).toUpperCase(), DATA:x.data || op_toYmd_(new Date()), CLIENTE_ID:x.entidadeTipo === 'CLIENTE' ? x.entidadeId : '', CLIENTE:x.cliente || '', TIPO_INTERACAO:x.tipoInteracao || x.tipoAtividadeId || '', STATUS:x.status || '', RESULTADO:x.resultado || x.resultadoId || '', OBSERVACAO:x.observacao || '', PROXIMA_ACAO:x.proximaAcao || '', RESPONSAVEL:x.responsavel || '', CRIADO_EM:op_nowIso_(), TRATATIVA_ID:x.tratativaId || '', TIPO_ATIVIDADE_ID:x.tipoAtividadeId || '', RESULTADO_ID:x.resultadoId || '', RESPONSAVEL_ID:x.responsavelId || ''
  });
}
function crm3_syncLegacyLifecycle_(type, id, resultId, typeId, ctx) {
  var legacy = { RES_PROPOSTA_ENVIADA:'PROPOSTA_APRESENTADA',RES_INTERESSE:'CLIENTE_INTERESSADO',RES_CONTRATO_FECHADO:'CONTRATO_FECHADO',RES_SEM_INTERESSE:'SEM_INTERESSE',RES_REAGENDADO:'REAGENDADO',RES_NAO_ENCONTRADO:'NAO_ENCONTRADO' }[resultId];
  if (!legacy) return;
  try {
    if (type === 'PROSPECT') op_updateProspectLifecycle_(id, legacy, typeId, 'CONCLUIDO', { resultadoRaw:legacy, observacaoCurta:ctx.observacao || '' });
    else op_updateClienteLifecycle_(id, legacy, typeId, { statusVisita:'CONCLUIDO', resultadoRaw:legacy, observacaoCurta:ctx.observacao || '' });
  } catch(e) { Logger.log('[CRM3] Legacy lifecycle sync: ' + e); }
}

/* ========================= EVENTOS ========================= */

function crm3_appendEvent_(x) { crm3_appendObject_(CRM3_CFG.SHEETS.EVENTOS, crm3_eventObject_(x)); }
function crm3_appendEventsBatch_(events) { crm3_appendObjects_(CRM3_CFG.SHEETS.EVENTOS, events || []); }
function crm3_eventObject_(x) { x = x || {}; return { EVENTO_ID:'EVT_' + Utilities.getUuid().slice(0,10).toUpperCase(), DATA_HORA:op_nowIso_(), ENTIDADE_TIPO:crm3_text_(x.entidadeTipo), ENTIDADE_ID:crm3_text_(x.entidadeId), TRATATIVA_ID:crm3_text_(x.tratativaId), TIPO_EVENTO:crm3_text_(x.tipoEvento), VALOR_ANTERIOR:crm3_text_(x.valorAnterior), VALOR_NOVO:crm3_text_(x.valorNovo), RESPONSAVEL_ID:crm3_text_(x.responsavelId), ORIGEM:crm3_text_(x.origem || 'CRM_PORTAL'), METADADOS_JSON:JSON.stringify(x.metadata || {}) }; }

/* ========================= HELPERS PLANILHA ========================= */

function crm3_assertSetupReady_() { if (PropertiesService.getScriptProperties().getProperty(CRM3_CFG.PROPS.SETUP_VERSION) !== CRM3_CFG.VERSION) throw new Error('CRM Jornada Fase 3 ainda não preparado. Execute setupCrmJornadaFase3() uma vez no editor do Apps Script.'); }
function crm3_readObjects_(sheetName) { return crm2_readSheetObjects_(op_getSpreadsheet_(), sheetName); }
function crm3_indexBy_(rows,key) { var out={}; (rows||[]).forEach(function(x){ var id=crm3_text_(x[key]); if(id) out[id]=x; }); return out; }
function crm3_headerMap_(headers) { var out={}; (headers||[]).forEach(function(h,i){ var k=op_headerKey_(h); if(k && out[k]===undefined) out[k]=i; }); return out; }
function crm3_cell_(row,hm,names) { names=Array.isArray(names)?names:[names]; for(var i=0;i<names.length;i++){ var k=op_headerKey_(names[i]); if(hm[k]!==undefined) return row[hm[k]]; } return ''; }
function crm3_text_(v) { return v == null ? '' : String(v).trim(); }
function crm3_upper_(v) { return op_upperNoAccents_(crm3_text_(v)).replace(/\s+/g,'_'); }
function crm3_isYes_(v) { var s=crm3_upper_(v); return s==='SIM'||s==='TRUE'||s==='1'||s==='YES'||s==='ATIVO'; }
function crm3_isOpenTratativaStatus_(v) { return CRM3_CFG.OPEN_TREATMENT_STATUSES.indexOf(crm3_upper_(v))>=0; }
function crm3_normalizeEntityType_(v) { var s=crm3_upper_(v||'CLIENTE'); if(s==='PROSPECT'||s==='PROSPECTS') return 'PROSPECT'; return 'CLIENTE'; }
function crm3_sortOrder_(a,b) { return (Number(a.ORDEM)||999)-(Number(b.ORDEM)||999); }
function crm3_unique_(arr) { var seen={},out=[]; (arr||[]).forEach(function(v){ var x=crm3_text_(v); if(x&&!seen[x]){seen[x]=1;out.push(x);} }); return out.sort(); }
function crm3_countBy_(arr,field) { var out={}; (arr||[]).forEach(function(x){ var k=crm3_text_(x[field]); if(k) out[k]=(out[k]||0)+1; }); return out; }
function crm3_issue_(severity,category,key,detail) { return { severidade:severity,categoria:category,chave:key,detalhe:detail }; }
function crm3_transitionSeed_(f,o,r,d,days,status,desc) { return { FUNIL_ID:f,ETAPA_ORIGEM_ID:o,RESULTADO_ID:r,ETAPA_DESTINO_ID:d,FOLLOWUP_DIAS_JORNADA:days,STATUS_TRATATIVA_DESTINO:status,ATIVA_JORNADA:'SIM',DESCRICAO_JORNADA:desc }; }
function crm3_defaultStageForFunnel_(f) { return f===CRM3_CFG.FUNIL_PROSPECTS?CRM3_CFG.DEFAULT_PROSPECT_STAGE:CRM3_CFG.DEFAULT_CLIENT_STAGE; }
function crm3_findConfigById_(sheet,key,id) { var rows=crm3_readObjects_(sheet); for(var i=0;i<rows.length;i++) if(crm3_text_(rows[i][key])===crm3_text_(id)) return rows[i]; return null; }
function crm3_validateStageForFunnel_(stageId,funnelId) { var s=crm3_findConfigById_(CRM3_CFG.SHEETS.ETAPAS,'ETAPA_ID',stageId); if(!s||!crm3_isYes_(s.ATIVA)||crm3_text_(s.FUNIL_ID)!==crm3_text_(funnelId)) throw new Error('Etapa inválida para o funil: '+stageId); return s; }
function crm3_statusFromStage_(s) { var type=crm3_upper_(s&&s.TIPO_ETAPA); if(type==='GANHA')return 'CONCLUIDA'; if(type==='PERDIDA')return 'ENCERRADA'; if(type==='PAUSADA')return 'PAUSADA'; return 'ABERTA'; }
function crm3_validateResultForActivity_(resultId,typeId) { var r=crm3_findConfigById_(CRM3_CFG.SHEETS.RESULTADOS,'RESULTADO_ID',resultId); if(!r||!crm3_isYes_(r.ATIVA)) throw new Error('Resultado inválido ou inativo.'); var applies=crm3_text_(r.TIPO_ATIVIDADE_ID); if(applies&&applies!=='TODOS'&&applies!==typeId) throw new Error('Resultado não permitido para este tipo de atividade.'); return r; }
function crm3_resultLabel_(id) { if(!id)return ''; var r=crm3_findConfigById_(CRM3_CFG.SHEETS.RESULTADOS,'RESULTADO_ID',id); return r?crm3_text_(r.NOME_EXIBICAO):id; }
function crm3_resolveMediaByCode_(code) { code=crm3_text_(code); if(!code)return {codigo:'',link:'',nome:''}; var list=op_readMidias_(); for(var i=0;i<list.length;i++) if(crm3_text_(list[i].codigo)===code)return {codigo:code,link:crm3_text_(list[i].link),nome:crm3_text_(list[i].nome)}; return {codigo:code,link:'',nome:code}; }
function crm3_resolveMedia_(code,entity) { var chosen=crm3_text_(code||entity.midia||entity.conteudoSugerido||''); return crm3_resolveMediaByCode_(chosen); }
function crm3_resolveResponsible_(id,name) { id=crm3_text_(id); name=crm3_text_(name); var rows=crm3_readObjects_(CRM3_CFG.SHEETS.RESPONSAVEIS); for(var i=0;i<rows.length;i++){ if(id&&crm3_text_(rows[i].RESPONSAVEL_ID)===id)return{id:id,nome:crm3_text_(rows[i].DISPLAY_NAME||name)}; if(!id&&name&&crm3_text_(rows[i].DISPLAY_NAME)===name)return{id:crm3_text_(rows[i].RESPONSAVEL_ID),nome:name}; } return{id:id,nome:name}; }
function crm3_addMinutesToTime_(time,min) { var m=String(time||'').match(/^(\d{1,2}):(\d{2})/); if(!m)return ''; var total=(Number(m[1])*60+Number(m[2])+Number(min||0))%(24*60); return Utilities.formatString('%02d:%02d',Math.floor(total/60),total%60); }

function crm3_appendObject_(sheetName,obj) { return crm3_appendObjects_(sheetName,[obj])[0]; }
function crm3_appendObjects_(sheetName,objects) { if(!objects||!objects.length)return[]; var sh=op_getSpreadsheet_().getSheetByName(sheetName); if(!sh)throw new Error('Aba não encontrada: '+sheetName); var headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; var rows=objects.map(function(obj){ return headers.map(function(h){ var k=op_headerKey_(h); return obj[k]!==undefined?obj[k]:(obj[h]!==undefined?obj[h]:''); }); }); var start=sh.getLastRow()+1; var needed=start+rows.length-1; if(sh.getMaxRows()<needed)sh.insertRowsAfter(sh.getMaxRows(),needed-sh.getMaxRows()); if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns()); sh.getRange(start,1,rows.length,headers.length).setValues(rows); return rows; }
function crm3_findRowObject_(sheetName,keyHeader,keyValue) { var sh=op_getSpreadsheet_().getSheetByName(sheetName); if(!sh||sh.getLastRow()<2)return null; var values=sh.getDataRange().getValues(); var hm=crm3_headerMap_(values[0]); var key=op_headerKey_(keyHeader); if(hm[key]===undefined)return null; for(var i=1;i<values.length;i++){ if(crm3_text_(values[i][hm[key]])===crm3_text_(keyValue)){ var obj={}; Object.keys(hm).forEach(function(h){ obj[h]=values[i][hm[h]]; }); return{sheet:sh,rowNumber:i+1,headers:values[0],hm:hm,row:values[i],obj:obj}; } } return null; }
function crm3_patchRowObject_(record,patch) { var row=record.row.slice(); Object.keys(patch||{}).forEach(function(k){ var hk=op_headerKey_(k); if(record.hm[hk]!==undefined)row[record.hm[hk]]=patch[k]; }); record.sheet.getRange(record.rowNumber,1,1,row.length).setValues([row]); return row; }

function crm3_bumpCacheRev_() { try { var p=PropertiesService.getScriptProperties(); var n=Number(p.getProperty(CRM3_CFG.PROPS.CACHE_REV)||0)+1; p.setProperty(CRM3_CFG.PROPS.CACHE_REV,String(n)); } catch(e){} }
function crm3_cacheKey_(suffix) { var rev=PropertiesService.getScriptProperties().getProperty(CRM3_CFG.PROPS.CACHE_REV)||'0'; return 'crm3|'+rev+'|'+suffix; }
function crm3_cacheGet_(suffix) { try{return op_cacheGetJson_(crm3_cacheKey_(suffix));}catch(e){return null;} }
function crm3_cachePut_(suffix,val) { try{op_cachePutJson_(crm3_cacheKey_(suffix),val,CRM3_CFG.CACHE_SEC);}catch(e){} }

function crm3_validateConfigOrThrow_() { var funis=crm3_readObjects_(CRM3_CFG.SHEETS.FUNIS),etapas=crm3_readObjects_(CRM3_CFG.SHEETS.ETAPAS); funis.forEach(function(f){ if(!crm3_isYes_(f.ATIVO))return; var max=Number(f.MAX_COLUNAS_VISIVEIS)||CRM3_CFG.MAX_KANBAN_COLS; var count=etapas.filter(function(e){return crm3_text_(e.FUNIL_ID)===crm3_text_(f.FUNIL_ID)&&crm3_isYes_(e.ATIVA)&&crm3_isYes_(e.EXIBE_KANBAN);}).length; if(count>max)throw new Error('Funil '+f.FUNIL_ID+' possui '+count+' colunas visíveis; máximo permitido: '+max); }); }
