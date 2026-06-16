/**
 * 11_CRM_REFINAMENTO_FASE82.gs
 * ------------------------------------------------------------
 * Refinamentos incrementais pós-homologação:
 * - segmentos parametrizáveis em CRM_SEGMENTOS;
 * - campos diagnósticos do checklist de clientes;
 * - nenhuma reativação do módulo operacional de COLETAS.
 */
var CRM82_CFG = Object.freeze({
  VERSION:'8.2.0',
  SHEET_SEGMENTS:'CRM_SEGMENTOS',
  SEGMENT_HEADERS:['SEGMENTO_ID','NOME_EXIBICAO','ATIVO','ORDEM'],
  CHECKLIST_DIAG_HEADERS:[
    'DIAG_SOLICITACAO_RETIRADA','DIAG_PORTAL_RETIRADA',
    'DIAG_USA_RETIRADA_CORREIOS','DIAG_INTERESSE_RETIRADA'
  ]
});

function setupCrmRefinamentoFase82(){
  return op_withDocumentLock_(function(){
    var ss=op_getSpreadsheet_();
    var seg=crm82_ensureSegmentsSheetUnlocked_(ss);
    var check=ss.getSheetByName(OP_CFG.SHEETS.CHECKLIST);
    if(!check)check=op_ensureChecklistSheet_(ss);
    crm7_appendMissingHeaders_(check,CRM82_CFG.CHECKLIST_DIAG_HEADERS);
    PropertiesService.getScriptProperties().setProperty('CRM_REFINAMENTO_FASE82_VERSION',CRM82_CFG.VERSION);
    try{op_invalidateOperationCaches_();}catch(_){ }
    return{ok:true,version:CRM82_CFG.VERSION,segmentSheet:CRM82_CFG.SHEET_SEGMENTS,segments:crm82_getActiveSegments_(),checklistAddedHeaders:CRM82_CFG.CHECKLIST_DIAG_HEADERS};
  });
}

function smokeTestCrmRefinamentoFase82(){
  var ss=op_getSpreadsheet_(),issues=[];
  var seg=ss.getSheetByName(CRM82_CFG.SHEET_SEGMENTS);
  if(!seg)issues.push('Aba CRM_SEGMENTOS não encontrada.');
  var check=ss.getSheetByName(OP_CFG.SHEETS.CHECKLIST);
  if(!check)issues.push('Aba CRM_VISITA_CHECKLIST não encontrada.');
  if(check){
    var hm=op_buildHeaderMap_(check.getRange(1,1,1,check.getLastColumn()).getValues()[0]);
    CRM82_CFG.CHECKLIST_DIAG_HEADERS.forEach(function(h){if(hm[h]===undefined)issues.push('Cabeçalho ausente: '+h);});
  }
  return{ok:issues.length===0,version:CRM82_CFG.VERSION,issues:issues,segments:seg?crm82_getActiveSegments_():[]};
}

function crm82_ensureSegmentsSheetUnlocked_(ss){
  var sh=ss.getSheetByName(CRM82_CFG.SHEET_SEGMENTS);
  if(!sh)sh=ss.insertSheet(CRM82_CFG.SHEET_SEGMENTS);
  crm8_ensureHeaders_(sh,CRM82_CFG.SEGMENT_HEADERS);
  if(sh.getLastRow()<2)crm82_seedExistingSegmentsUnlocked_(ss,sh);
  return sh;
}

function crm82_seedExistingSegmentsUnlocked_(ss,sh){
  var seen={},names=[];
  function collect(sheetName,header){
    var s=ss.getSheetByName(sheetName);if(!s||s.getLastRow()<2)return;
    var v=s.getDataRange().getValues(),hm=op_buildHeaderMap_(v[0]);if(hm[header]===undefined)return;
    v.slice(1).forEach(function(r){var n=op_norm_(r[hm[header]]);if(n&&!seen[n.toUpperCase()]){seen[n.toUpperCase()]=true;names.push(n);}});
  }
  collect('CLIENTES_MASTER','SEGMENTO_PREDOMINANTE');
  collect('PROSPECTS','SEGMENTO');
  if(!names.length)names=['ENCOMENDAS'];
  names.sort(function(a,b){return String(a).localeCompare(String(b),'pt-BR');});
  var rows=names.map(function(name,i){return[crm82_segmentId_(name),name,'SIM',i+1];});
  sh.getRange(2,1,rows.length,CRM82_CFG.SEGMENT_HEADERS.length).setValues(rows);
}

function crm82_segmentId_(name){
  var s=op_upperNoAccents_(op_norm_(name)).replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return 'SEG_'+(s||Utilities.getUuid().slice(0,8).toUpperCase());
}

function crm82_getActiveSegments_(){
  var sh=op_getSpreadsheet_().getSheetByName(CRM82_CFG.SHEET_SEGMENTS);
  if(!sh||sh.getLastRow()<2)return[];
  var v=sh.getDataRange().getValues(),hm=op_buildHeaderMap_(v[0]);
  return v.slice(1).map(function(r){return{
    segmentoId:op_norm_(op_getCell_(r,hm,'SEGMENTO_ID')),
    nome:op_norm_(op_getCell_(r,hm,'NOME_EXIBICAO')),
    ativo:op_norm_(op_getCell_(r,hm,'ATIVO')),
    ordem:Number(op_getCell_(r,hm,'ORDEM'))||999
  };}).filter(function(x){return x.nome&&crm3_isYes_(x.ativo||'SIM');}).sort(function(a,b){return a.ordem-b.ordem||a.nome.localeCompare(b.nome,'pt-BR');});
}
