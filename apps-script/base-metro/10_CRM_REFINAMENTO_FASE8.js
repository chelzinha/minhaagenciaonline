/**
 * 10_CRM_REFINAMENTO_FASE8.gs
 * ------------------------------------------------------------
 * Refinamento aditivo do CRM:
 * - anotações históricas por cliente/prospect
 * - endpoints para leitura e gravação das anotações
 * - nenhuma alteração de regras comerciais existentes
 */
var CRM8_CFG = Object.freeze({
  VERSION:'8.0.0',
  SHEET_NOTES:'CRM_ANOTACOES',
  NOTE_HEADERS:['ANOTACAO_ID','DATA_HORA','ENTIDADE_TIPO','ENTIDADE_ID','TRATATIVA_ID','AGENDA_ID','TEXTO','RESPONSAVEL_ID','RESPONSAVEL_NOME','ORIGEM','REQUEST_ID']
});

function setupCrmRefinamentoFase8(){
  return op_withDocumentLock_(function(){
    var sh=crm8_ensureNotesSheetUnlocked_();
    PropertiesService.getScriptProperties().setProperty('CRM_REFINAMENTO_FASE8_VERSION',CRM8_CFG.VERSION);
    return {ok:true,version:CRM8_CFG.VERSION,sheet:CRM8_CFG.SHEET_NOTES,headers:sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]};
  });
}

function crm8_ensureNotesSheetUnlocked_(){
  // Pode ser chamado dentro de uma operação já protegida por lock.
  // Evita lock aninhado quando a primeira anotação é salva antes do setup manual.
  var ss=op_getSpreadsheet_();
  var sh=ss.getSheetByName(CRM8_CFG.SHEET_NOTES);
  if(!sh)sh=ss.insertSheet(CRM8_CFG.SHEET_NOTES);
  crm8_ensureHeaders_(sh,CRM8_CFG.NOTE_HEADERS);
  return sh;
}

function smokeTestCrmRefinamentoFase8(){
  var sh=op_getSpreadsheet_().getSheetByName(CRM8_CFG.SHEET_NOTES);
  if(!sh)return{ok:false,error:'Aba CRM_ANOTACOES não encontrada. Execute setupCrmRefinamentoFase8().'};
  var hm=op_buildHeaderMap_(sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]);
  var missing=CRM8_CFG.NOTE_HEADERS.filter(function(h){return hm[h]===undefined;});
  return{ok:missing.length===0,version:CRM8_CFG.VERSION,missingHeaders:missing};
}

function crm8_apiGetEntityNotes_(params){
  params=params||{};
  var entityType=op_upperNoAccents_(op_norm_(params.tipoEntidade||params.origemTipo||'CLIENTE'));
  var entityId=op_norm_(params.entidadeId||params.origemId||params.clienteId||params.prospectId);
  var limit=Math.max(1,Math.min(100,Number(params.limit||30)||30));
  if(!entityId)throw new Error('entidadeId obrigatório.');
  var sh=op_getSpreadsheet_().getSheetByName(CRM8_CFG.SHEET_NOTES);
  if(!sh||sh.getLastRow()<2)return{ok:true,items:[]};
  var values=sh.getDataRange().getValues(),hm=op_buildHeaderMap_(values[0]);
  var items=values.slice(1).map(function(r){return crm8_projectNote_(r,hm);}).filter(function(x){return x.anotacaoId&&x.entidadeTipo===entityType&&x.entidadeId===entityId;}).sort(function(a,b){return String(b.dataHora).localeCompare(String(a.dataHora));}).slice(0,limit);
  return{ok:true,entityType:entityType,entityId:entityId,items:items};
}

function crm8_apiSaveEntityNote_(payload){
  payload=payload||{};
  var entityType=op_upperNoAccents_(op_norm_(payload.tipoEntidade||payload.origemTipo||'CLIENTE'));
  var entityId=op_norm_(payload.entidadeId||payload.origemId||payload.clienteId||payload.prospectId);
  var texto=op_norm_(payload.texto||payload.observacao);
  var requestId=op_norm_(payload.requestId);
  if(!entityId)throw new Error('entidadeId obrigatório.');
  if(!texto)throw new Error('Texto da anotação obrigatório.');
  var sh=crm8_ensureNotesSheetUnlocked_();
  if(requestId){var existing=crm8_findNoteByRequest_(sh,requestId);if(existing)return{ok:true,created:false,idempotent:true,anotacaoId:existing.anotacaoId};}
  var id='NOT_'+Utilities.getUuid().slice(0,10).toUpperCase(),now=op_nowIso_();
  var obj={ANOTACAO_ID:id,DATA_HORA:now,ENTIDADE_TIPO:entityType,ENTIDADE_ID:entityId,TRATATIVA_ID:op_norm_(payload.tratativaId),AGENDA_ID:op_norm_(payload.agendaId),TEXTO:texto,RESPONSAVEL_ID:op_norm_(payload.responsavelId),RESPONSAVEL_NOME:op_norm_(payload.responsavelNome||payload.responsavel),ORIGEM:op_norm_(payload.origem||'CRM_PORTAL'),REQUEST_ID:requestId};
  crm3_appendObject_(CRM8_CFG.SHEET_NOTES,obj);
  try{crm3_appendEvent_({entidadeTipo:entityType,entidadeId:entityId,tratativaId:obj.TRATATIVA_ID,tipoEvento:'ANOTACAO_ADICIONADA',valorNovo:id,responsavelId:obj.RESPONSAVEL_ID,origem:'CRM_PORTAL',metadata:{agendaId:obj.AGENDA_ID,texto:texto}});}catch(e){Logger.log('[CRM8] Evento anotação: '+e);}
  return{ok:true,created:true,anotacaoId:id,dataHora:now};
}

function crm8_projectNote_(r,hm){return{anotacaoId:op_norm_(op_getCell_(r,hm,'ANOTACAO_ID')),dataHora:op_norm_(op_getCell_(r,hm,'DATA_HORA')),entidadeTipo:op_upperNoAccents_(op_norm_(op_getCell_(r,hm,'ENTIDADE_TIPO'))),entidadeId:op_norm_(op_getCell_(r,hm,'ENTIDADE_ID')),tratativaId:op_norm_(op_getCell_(r,hm,'TRATATIVA_ID')),agendaId:op_norm_(op_getCell_(r,hm,'AGENDA_ID')),texto:op_norm_(op_getCell_(r,hm,'TEXTO')),responsavelId:op_norm_(op_getCell_(r,hm,'RESPONSAVEL_ID')),responsavelNome:op_norm_(op_getCell_(r,hm,'RESPONSAVEL_NOME')),origem:op_norm_(op_getCell_(r,hm,'ORIGEM')),requestId:op_norm_(op_getCell_(r,hm,'REQUEST_ID'))};}
function crm8_findNoteByRequest_(sh,requestId){if(!sh||sh.getLastRow()<2)return null;var values=sh.getDataRange().getValues(),hm=op_buildHeaderMap_(values[0]);if(hm.REQUEST_ID===undefined)return null;for(var i=1;i<values.length;i++)if(op_norm_(values[i][hm.REQUEST_ID])===requestId)return crm8_projectNote_(values[i],hm);return null;}
function crm8_ensureHeaders_(sh,headers){var current=sh.getLastRow()?sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0]:[];var hm=op_buildHeaderMap_(current),missing=headers.filter(function(h){return hm[h]===undefined;});if(!current.filter(Boolean).length){if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');return;}if(!missing.length)return;if(sh.getMaxColumns()<current.length+missing.length)sh.insertColumnsAfter(sh.getMaxColumns(),current.length+missing.length-sh.getMaxColumns());sh.getRange(1,current.length+1,1,missing.length).setValues([missing]).setFontWeight('bold');}
