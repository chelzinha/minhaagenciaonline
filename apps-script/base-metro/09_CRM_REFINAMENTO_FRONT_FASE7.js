/**
 * 09_CRM_REFINAMENTO_FRONT_FASE7.gs
 * ------------------------------------------------------------
 * Suporte aditivo ao refinamento UX/UI do CRM.
 * - leitura do histórico de checklists por entidade
 * - idempotência opcional para novos checklists
 * - nenhuma remoção de rota anterior
 */

var CRM7_CFG = Object.freeze({
  VERSION:'7.0.0',
  CHECKLIST_EXTRA_HEADERS:['REQUEST_ID','ATUALIZADO_EM']
});

function setupCrmRefinamentoFase7() {
  return op_withDocumentLock_(function(){
    var ss = op_getSpreadsheet_();
    var sh = ss.getSheetByName(OP_CFG.SHEETS.CHECKLIST);
    if (!sh) sh = op_ensureChecklistSheet_(ss);
    crm7_appendMissingHeaders_(sh, CRM7_CFG.CHECKLIST_EXTRA_HEADERS);
    PropertiesService.getScriptProperties().setProperty('CRM_REFINAMENTO_FASE7_VERSION', CRM7_CFG.VERSION);
    return { ok:true, version:CRM7_CFG.VERSION, checklistHeaders:sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] };
  });
}

function smokeTestCrmRefinamentoFase7() {
  var sh = op_getSpreadsheet_().getSheetByName(OP_CFG.SHEETS.CHECKLIST);
  if (!sh) return { ok:false, error:'Aba CRM_VISITA_CHECKLIST não encontrada.' };
  var hm = op_buildHeaderMap_(sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]);
  var missing = CRM7_CFG.CHECKLIST_EXTRA_HEADERS.filter(function(h){ return hm[h] === undefined; });
  return { ok:missing.length === 0, version:CRM7_CFG.VERSION, missingHeaders:missing };
}

function crm7_apiGetEntityChecklists_(params) {
  params = params || {};
  var entityType = op_upperNoAccents_(op_norm_(params.tipoEntidade || params.origemTipo || 'CLIENTE'));
  var entityId = op_norm_(params.entidadeId || params.origemId || params.clienteId || params.prospectId);
  var limit = Math.max(1, Math.min(50, Number(params.limit || 20) || 20));
  if (!entityId) throw new Error('entidadeId obrigatório.');
  var sh = op_getSpreadsheet_().getSheetByName(OP_CFG.SHEETS.CHECKLIST);
  if (!sh || sh.getLastRow() < 2) return { ok:true, items:[], latest:null };
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var items = values.slice(1).map(function(r){ return crm7_projectChecklist_(r, hm); }).filter(function(x){
    if (!x.checklistId) return false;
    if (entityType === 'PROSPECT') return x.prospectId === entityId || (x.origemTipo === 'PROSPECT' && x.origemId === entityId);
    return x.clienteMasterId === entityId || (x.origemTipo === 'CLIENTE' && x.origemId === entityId);
  }).sort(function(a,b){ return String(b.criadoEm || b.data).localeCompare(String(a.criadoEm || a.data)); }).slice(0, limit);
  return { ok:true, entityType:entityType, entityId:entityId, items:items, latest:items[0] || null };
}

function crm7_findChecklistByRequest_(requestId) {
  requestId = op_norm_(requestId);
  if (!requestId) return null;
  var sh = op_getSpreadsheet_().getSheetByName(OP_CFG.SHEETS.CHECKLIST);
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  if (hm['REQUEST_ID'] === undefined) return null;
  for (var i=1;i<values.length;i++) {
    if (op_norm_(values[i][hm['REQUEST_ID']]) === requestId) return crm7_projectChecklist_(values[i], hm);
  }
  return null;
}

function crm7_projectChecklist_(r, hm) {
  return {
    checklistId:op_norm_(op_getCell_(r,hm,'CHECKLIST_ID')),
    agendaId:op_norm_(op_getCell_(r,hm,'AGENDA_ID')),
    data:op_dateValueToYmd_(op_getCell_(r,hm,'DATA')),
    origemTipo:op_upperNoAccents_(op_norm_(op_getCell_(r,hm,'ORIGEM_TIPO'))),
    origemId:op_norm_(op_getCell_(r,hm,'ORIGEM_ID')),
    prospectId:op_norm_(op_getCell_(r,hm,'PROSPECT_ID')),
    clienteMasterId:op_norm_(op_getCell_(r,hm,'CLIENTE_MASTER_ID')),
    cliente:op_norm_(op_getCell_(r,hm,'CLIENTE')),
    resultadoVisita:op_norm_(op_getCell_(r,hm,'RESULTADO_VISITA')),
    statusVisita:op_norm_(op_getCell_(r,hm,'STATUS_VISITA')),
    postagemComoChega:op_norm_(op_getCell_(r,hm,'POSTAGEM_COMO_CHEGA')),
    origemPostagem:op_norm_(op_getCell_(r,hm,'ORIGEM_POSTAGEM')),
    solicitaColetaPor:op_norm_(op_getCell_(r,hm,['DIAG_SOLICITACAO_RETIRADA','SOLICITA_COLETA_POR'])),
    apresentouPortalColeta:op_norm_(op_getCell_(r,hm,['DIAG_PORTAL_RETIRADA','APRESENTOU_PORTAL_COLETA'])),
    canaisVenda:op_norm_(op_getCell_(r,hm,'CANAIS_VENDA')),
    postaComQuem:op_norm_(op_getCell_(r,hm,'POSTA_COM_QUEM')),
    dorPrincipal:op_norm_(op_getCell_(r,hm,'DOR_PRINCIPAL')),
    oportunidadePrincipal:op_norm_(op_getCell_(r,hm,'OPORTUNIDADE_PRINCIPAL')),
    nivelEsteira:op_norm_(op_getCell_(r,hm,'NIVEL_ESTEIRA')),
    entradaSugerida:op_norm_(op_getCell_(r,hm,'ENTRADA_SUGERIDA')),
    potencialAutomacao:op_norm_(op_getCell_(r,hm,'POTENCIAL_AUTOMACAO')),
    canalEnvioAtual:op_norm_(op_getCell_(r,hm,'CANAL_ENVIO_ATUAL')),
    frequenciaEnvio:op_norm_(op_getCell_(r,hm,'FREQUENCIA_ENVIO')),
    volumeMedio:op_norm_(op_getCell_(r,hm,'VOLUME_MEDIO')),
    jaPostaCorreios:op_norm_(op_getCell_(r,hm,'JA_POSTA_CORREIOS')),
    temContratoCorreios:op_norm_(op_getCell_(r,hm,'TEM_CONTRATO_CORREIOS')),
    temCartaoPostagem:op_norm_(op_getCell_(r,hm,'TEM_CARTAO_POSTAGEM')),
    usaColetaCorreios:op_norm_(op_getCell_(r,hm,['DIAG_USA_RETIRADA_CORREIOS','USA_COLETA_CORREIOS'])),
    interesseColeta:op_norm_(op_getCell_(r,hm,['DIAG_INTERESSE_RETIRADA','INTERESSE_COLETA'])),
    usaIntermediador:op_norm_(op_getCell_(r,hm,'USA_INTERMEDIADOR')),
    intermediadorQual:op_norm_(op_getCell_(r,hm,'INTERMEDIADOR_QUAL')),
    parceiroPrincipal:op_norm_(op_getCell_(r,hm,'PARCEIRO_PRINCIPAL')),
    canalVenda:op_norm_(op_getCell_(r,hm,'CANAL_VENDA')),
    atendeSacoleirasExcursao:op_norm_(op_getCell_(r,hm,'ATENDE_SACOLEIRAS_EXCURSAO')),
    observacaoCurta:op_norm_(op_getCell_(r,hm,'OBSERVACAO_CURTA')),
    responsavel:op_norm_(op_getCell_(r,hm,'RESPONSAVEL')),
    criadoEm:op_norm_(op_getCell_(r,hm,'CRIADO_EM')),
    tratativaId:op_norm_(op_getCell_(r,hm,'TRATATIVA_ID')),
    tipoAtividadeId:op_norm_(op_getCell_(r,hm,'TIPO_ATIVIDADE_ID')),
    resultadoId:op_norm_(op_getCell_(r,hm,'RESULTADO_ID')),
    responsavelId:op_norm_(op_getCell_(r,hm,'RESPONSAVEL_ID')),
    requestId:op_norm_(op_getCell_(r,hm,'REQUEST_ID'))
  };
}

function crm7_appendMissingHeaders_(sh, headers) {
  if (!sh) return;
  var last = Math.max(1, sh.getLastColumn());
  var current = sh.getRange(1,1,1,last).getValues()[0];
  var hm = op_buildHeaderMap_(current);
  var missing = headers.filter(function(h){ return hm[h] === undefined; });
  if (!missing.length) return;
  if (sh.getMaxColumns() < current.length + missing.length) sh.insertColumnsAfter(sh.getMaxColumns(), current.length + missing.length - sh.getMaxColumns());
  sh.getRange(1,current.length+1,1,missing.length).setValues([missing]).setFontWeight('bold');
}

function crm7_appendChecklistEventSafe_(payload, checklistId, derived) {
  try {
    if (typeof crm3_appendEvent_ !== 'function') return;
    crm3_appendEvent_({
      entidadeTipo:op_upperNoAccents_(op_norm_(payload.origemTipo || 'CLIENTE')),
      entidadeId:op_norm_(payload.origemId || payload.clienteId || payload.prospectId),
      tratativaId:op_norm_(payload.tratativaId),
      tipoEvento:'CHECKLIST_CORREIOS_SALVO',
      valorNovo:checklistId,
      responsavelId:op_norm_(payload.responsavelId),
      origem:'CRM_PORTAL',
      metadata:{ resultado:op_norm_(payload.resultadoVisita), nivelEsteira:derived.nivelEsteira, entradaSugerida:derived.entradaSugerida }
    });
  } catch (e) { Logger.log('[CRM7] Evento checklist: ' + e); }
}
