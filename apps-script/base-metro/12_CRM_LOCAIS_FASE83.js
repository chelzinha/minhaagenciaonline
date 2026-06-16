/**
 * 12_CRM_LOCAIS_FASE83.gs
 * ------------------------------------------------------------
 * Parametrização incremental dos locais do CRM:
 * - administra locais ativos na aba CRM_LOCAIS;
 * - abastece o filtro global LOCAL e o cadastro de prospects;
 * - preserva compatibilidade com locais históricos encontrados nos dados;
 * - não altera registros existentes de clientes ou prospects.
 */
var CRM83_CFG = Object.freeze({
  VERSION:'8.3.0',
  SHEET_LOCALS:'CRM_LOCAIS',
  LOCAL_HEADERS:['LOCAL_ID','NOME_EXIBICAO','ORDEM','ATIVO','TIPO','OBS'],
  DEFAULT_LOCALS:[
    ['CF','CF',10,'SIM','PONTO','Local padrão já utilizado no CRM.'],
    ['METRO','METRO',20,'SIM','PONTO','Local padrão já utilizado no CRM.'],
    ['ROTA_AGF1','ROTA AGF1',30,'SIM','ROTA','Local padrão já utilizado no CRM.'],
    ['ROTA_AGF2','ROTA AGF2',40,'SIM','ROTA','Local padrão já utilizado no CRM.']
  ]
});

function setupCrmLocaisFase83(){
  return op_withDocumentLock_(function(){
    var ss=op_getSpreadsheet_();
    var sh=crm83_ensureLocalsSheetUnlocked_(ss);
    PropertiesService.getScriptProperties().setProperties({
      CRM_LOCAIS_FASE83_VERSION:CRM83_CFG.VERSION,
      CRM_LOCAIS_FASE83_SETUP_AT:op_nowIso_()
    },false);
    try{op_invalidateOperationCaches_();}catch(_){ }
    return{ok:true,version:CRM83_CFG.VERSION,sheet:sh.getName(),locais:crm83_getActiveLocals_()};
  });
}

function smokeTestCrmLocaisFase83(){
  var ss=op_getSpreadsheet_(),issues=[],sh=ss.getSheetByName(CRM83_CFG.SHEET_LOCALS);
  if(!sh)issues.push('Aba CRM_LOCAIS não encontrada. Execute setupCrmLocaisFase83().');
  if(sh){
    var hm=op_buildHeaderMap_(sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0]);
    CRM83_CFG.LOCAL_HEADERS.forEach(function(h){if(hm[h]===undefined)issues.push('Cabeçalho ausente: '+h);});
  }
  return{ok:issues.length===0,version:CRM83_CFG.VERSION,issues:issues,locais:sh?crm83_getActiveLocals_():[]};
}

function crm83_ensureLocalsSheetUnlocked_(ss){
  var sh=ss.getSheetByName(CRM83_CFG.SHEET_LOCALS);
  if(!sh)sh=ss.insertSheet(CRM83_CFG.SHEET_LOCALS);
  if(typeof crm8_ensureHeaders_==='function')crm8_ensureHeaders_(sh,CRM83_CFG.LOCAL_HEADERS);
  else crm83_ensureHeadersUnlocked_(sh,CRM83_CFG.LOCAL_HEADERS);
  if(sh.getLastRow()<2)crm83_seedLocalsUnlocked_(ss,sh);
  sh.setFrozenRows(1);
  return sh;
}

function crm83_ensureHeadersUnlocked_(sh,headers){
  var lastCol=Math.max(1,sh.getLastColumn()),current=sh.getLastRow()?sh.getRange(1,1,1,lastCol).getValues()[0]:[],hm=op_buildHeaderMap_(current);
  var missing=headers.filter(function(h){return hm[h]===undefined;});
  if(!current.filter(Boolean).length){
    if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    return;
  }
  if(!missing.length)return;
  if(sh.getMaxColumns()<current.length+missing.length)sh.insertColumnsAfter(sh.getMaxColumns(),current.length+missing.length-sh.getMaxColumns());
  sh.getRange(1,current.length+1,1,missing.length).setValues([missing]).setFontWeight('bold');
}

function crm83_seedLocalsUnlocked_(ss,sh){
  var rows=[],seen={};
  function add(row){
    var name=op_norm_(row[1]);if(!name)return;
    var key=op_upperNoAccents_(name);if(seen[key])return;
    seen[key]=true;rows.push(row);
  }
  CRM83_CFG.DEFAULT_LOCALS.forEach(add);
  crm83_collectObservedLocalsUnlocked_(ss).forEach(function(name){
    add([crm83_localId_(name),name,100+rows.length,'SIM','HISTORICO','Incluído automaticamente a partir dos dados existentes.']);
  });
  if(rows.length)sh.getRange(2,1,rows.length,CRM83_CFG.LOCAL_HEADERS.length).setValues(rows);
}

function crm83_collectObservedLocalsUnlocked_(ss){
  var names=[],seen={};
  function collect(sheetName,headers){
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var values=sh.getDataRange().getValues(),hm=op_buildHeaderMap_(values[0]),idx;
    for(var h=0;h<headers.length;h++){if(hm[headers[h]]!==undefined){idx=hm[headers[h]];break;}}
    if(idx===undefined)return;
    values.slice(1).forEach(function(r){var name=op_norm_(r[idx]),key=op_upperNoAccents_(name);if(name&&!seen[key]){seen[key]=true;names.push(name);}});
  }
  collect(OP_CFG.SHEETS.MASTER,['LOCAL_PREDOMINANTE']);
  collect(OP_CFG.SHEETS.PROSPECTS,['LOCAL']);
  collect(CRM3_CFG.SHEETS.CADASTRO,['LOCAL_PADRAO']);
  return names.sort(function(a,b){return String(a).localeCompare(String(b),'pt-BR');});
}

function crm83_localId_(name){
  var id=op_upperNoAccents_(op_norm_(name)).replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return id||('LOCAL_'+Utilities.getUuid().slice(0,8).toUpperCase());
}

function crm83_getActiveLocals_(){
  var ss=op_getSpreadsheet_(),sh=ss.getSheetByName(CRM83_CFG.SHEET_LOCALS);
  if(!sh||sh.getLastRow()<2){
    return CRM83_CFG.DEFAULT_LOCALS.map(function(r){return{localId:r[0],nome:r[1],ordem:r[2],ativo:r[3],tipo:r[4],obs:r[5]};});
  }
  var values=sh.getDataRange().getValues(),hm=op_buildHeaderMap_(values[0]);
  return values.slice(1).map(function(r){return{
    localId:op_norm_(op_getCell_(r,hm,'LOCAL_ID')),
    nome:op_norm_(op_getCell_(r,hm,'NOME_EXIBICAO')),
    ordem:Number(op_getCell_(r,hm,'ORDEM'))||999,
    ativo:op_norm_(op_getCell_(r,hm,'ATIVO')),
    tipo:op_norm_(op_getCell_(r,hm,'TIPO')),
    obs:op_norm_(op_getCell_(r,hm,'OBS'))
  };}).filter(function(x){return x.nome&&crm3_isYes_(x.ativo||'SIM');}).sort(function(a,b){return a.ordem-b.ordem||a.nome.localeCompare(b.nome,'pt-BR');});
}
