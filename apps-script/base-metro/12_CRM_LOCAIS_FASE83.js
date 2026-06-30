/**
 * 12_CRM_LOCAIS_FASE83.gs
 * ------------------------------------------------------------
 * Parametrização incremental dos locais do CRM:
 * - mantém uma única aba administrativa: CRM_LOCAIS;
 * - separa onde cada local deve aparecer pela coluna EXIBIR_EM;
 * - EXIBIR_EM aceita: CRM, PROSPECTS, CRM;PROSPECTS, AMBOS, TODOS;
 * - abastece filtros do CRM/clientes e filtros/cadastro de prospects sem misturar as fontes;
 * - não altera registros existentes de clientes ou prospects.
 */
var CRM83_CFG = Object.freeze({
  VERSION:'8.3.1',
  SHEET_LOCALS:'CRM_LOCAIS',
  LOCAL_HEADERS:['LOCAL_ID','NOME_EXIBICAO','ORDEM','ATIVO','TIPO','OBS','EXIBIR_EM'],
  DEFAULT_LOCALS:[
    ['CF','CF',10,'SIM','PONTO','Local padrão já utilizado no CRM.','CRM'],
    ['METRO','METRO',20,'SIM','PONTO','Local padrão já utilizado no CRM.','CRM'],
    ['ROTA_AGF1','ROTA AGF1',30,'SIM','ROTA','Local padrão já utilizado no CRM.','CRM'],
    ['ROTA_AGF2','ROTA AGF2',40,'SIM','ROTA','Local padrão já utilizado no CRM.','CRM']
  ]
});

function setupCrmLocaisFase83(){
  return op_withDocumentLock_(function(){
    var ss=op_getSpreadsheet_();
    var sh=crm83_ensureLocalsSheetUnlocked_(ss);
    crm83_normalizeLocalScopeUnlocked_(ss,sh);
    PropertiesService.getScriptProperties().setProperties({
      CRM_LOCAIS_FASE83_VERSION:CRM83_CFG.VERSION,
      CRM_LOCAIS_FASE83_SETUP_AT:op_nowIso_()
    },false);
    try{op_invalidateOperationCaches_();}catch(_){ }
    return{ok:true,version:CRM83_CFG.VERSION,sheet:sh.getName(),locais:crm83_getActiveLocals_('CRM'),prospectLocais:crm83_getActiveLocals_('PROSPECTS')};
  });
}

function smokeTestCrmLocaisFase83(){
  var ss=op_getSpreadsheet_(),issues=[],sh=ss.getSheetByName(CRM83_CFG.SHEET_LOCALS);
  if(!sh)issues.push('Aba CRM_LOCAIS não encontrada. Execute setupCrmLocaisFase83().');
  if(sh){
    var hm=op_buildHeaderMap_(sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0]);
    CRM83_CFG.LOCAL_HEADERS.forEach(function(h){if(hm[h]===undefined)issues.push('Cabeçalho ausente: '+h);});
  }
  var crmLocais=sh?crm83_getActiveLocals_('CRM'):[];
  var prospectLocais=sh?crm83_getActiveLocals_('PROSPECTS'):[];
  if(sh&&!crmLocais.length)issues.push('Nenhum local ativo configurado para EXIBIR_EM=CRM.');
  if(sh&&!prospectLocais.length)issues.push('Nenhum local ativo configurado para EXIBIR_EM=PROSPECTS.');
  return{ok:issues.length===0,version:CRM83_CFG.VERSION,issues:issues,locais:crmLocais,prospectLocais:prospectLocais};
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
  crm83_collectObservedLocalsUnlocked_(ss,'CRM').forEach(function(name){
    add([crm83_localId_(name),name,100+rows.length,'SIM','HISTORICO','Incluído automaticamente a partir de dados de clientes/CRM.','CRM']);
  });
  crm83_collectObservedLocalsUnlocked_(ss,'PROSPECTS').forEach(function(name){
    add([crm83_localId_(name),name,200+rows.length,'SIM','HISTORICO','Incluído automaticamente a partir da aba PROSPECTS.','PROSPECTS']);
  });
  if(rows.length)sh.getRange(2,1,rows.length,CRM83_CFG.LOCAL_HEADERS.length).setValues(rows);
}

function crm83_collectObservedLocalsUnlocked_(ss,scope){
  var names=[],seen={};
  function addName(name){
    name=op_norm_(name);var key=op_upperNoAccents_(name);
    if(name&&!seen[key]){seen[key]=true;names.push(name);}
  }
  function collect(sheetName,headers){
    var sh=ss.getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return;
    var values=sh.getDataRange().getValues(),hm=op_buildHeaderMap_(values[0]),idx;
    for(var h=0;h<headers.length;h++){if(hm[headers[h]]!==undefined){idx=hm[headers[h]];break;}}
    if(idx===undefined)return;
    values.slice(1).forEach(function(r){addName(r[idx]);});
  }
  if(String(scope).toUpperCase()==='PROSPECTS'){
    collect(OP_CFG.SHEETS.PROSPECTS,['LOCAL']);
  }else{
    collect(OP_CFG.SHEETS.MASTER,['LOCAL_PREDOMINANTE']);
    collect(CRM3_CFG.SHEETS.CADASTRO,['LOCAL_PADRAO']);
  }
  return names.sort(function(a,b){return String(a).localeCompare(String(b),'pt-BR');});
}

function crm83_normalizeLocalScopeUnlocked_(ss,sh){
  if(!sh||sh.getLastRow()<2)return;
  var range=sh.getDataRange(),values=range.getValues(),hm=op_buildHeaderMap_(values[0]);
  if(hm.EXIBIR_EM===undefined)return;
  var prospectSet=crm83_scopeNameSet_(crm83_collectObservedLocalsUnlocked_(ss,'PROSPECTS'));
  var crmSet=crm83_scopeNameSet_(crm83_collectObservedLocalsUnlocked_(ss,'CRM'));
  var defaultCrm=crm83_scopeNameSet_(CRM83_CFG.DEFAULT_LOCALS.map(function(r){return r[1];}));
  var changed=false;
  for(var i=1;i<values.length;i++){
    var name=op_norm_(op_getCell_(values[i],hm,'NOME_EXIBICAO'));
    if(!name)continue;
    var scope=op_norm_(op_getCell_(values[i],hm,'EXIBIR_EM'));
    if(scope)continue;
    var key=op_upperNoAccents_(name),inProspect=prospectSet[key],inCrm=crmSet[key]||defaultCrm[key];
    values[i][hm.EXIBIR_EM]=inProspect&&inCrm?'CRM;PROSPECTS':inProspect?'PROSPECTS':'CRM';
    changed=true;
  }
  if(changed)range.setValues(values);
}

function crm83_scopeNameSet_(names){
  var out={};
  (names||[]).forEach(function(n){n=op_norm_(n);if(n)out[op_upperNoAccents_(n)]=true;});
  return out;
}

function crm83_localId_(name){
  var id=op_upperNoAccents_(op_norm_(name)).replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return id||('LOCAL_'+Utilities.getUuid().slice(0,8).toUpperCase());
}

function crm83_getActiveLocals_(scope){
  scope=op_upperNoAccents_(scope||'CRM');
  var ss=op_getSpreadsheet_(),sh=ss.getSheetByName(CRM83_CFG.SHEET_LOCALS);
  if(!sh||sh.getLastRow()<2){
    return CRM83_CFG.DEFAULT_LOCALS.map(function(r){return crm83_localRowObject_(r);}).filter(function(x){return crm83_localMatchesScope_(x.exibirEm,scope);});
  }
  var values=sh.getDataRange().getValues(),hm=op_buildHeaderMap_(values[0]);
  return values.slice(1).map(function(r){return{
    localId:op_norm_(op_getCell_(r,hm,'LOCAL_ID')),
    nome:op_norm_(op_getCell_(r,hm,'NOME_EXIBICAO')),
    ordem:Number(op_getCell_(r,hm,'ORDEM'))||999,
    ativo:op_norm_(op_getCell_(r,hm,'ATIVO')),
    tipo:op_norm_(op_getCell_(r,hm,'TIPO')),
    obs:op_norm_(op_getCell_(r,hm,'OBS')),
    exibirEm:op_norm_(op_getCell_(r,hm,'EXIBIR_EM'))||'CRM'
  };}).filter(function(x){return x.nome&&crm3_isYes_(x.ativo||'SIM')&&crm83_localMatchesScope_(x.exibirEm,scope);}).sort(function(a,b){return a.ordem-b.ordem||a.nome.localeCompare(b.nome,'pt-BR');});
}

function crm83_localRowObject_(r){
  return{localId:r[0],nome:r[1],ordem:r[2],ativo:r[3],tipo:r[4],obs:r[5],exibirEm:r[6]||'CRM'};
}

function crm83_localMatchesScope_(exibirEm,scope){
  scope=op_upperNoAccents_(scope||'CRM');
  var raw=op_upperNoAccents_(exibirEm||'CRM');
  var parts=raw.split(/[;,|/]+/).map(function(x){return op_norm_(x).toUpperCase();}).filter(Boolean);
  if(!parts.length)parts=['CRM'];
  if(parts.indexOf('AMBOS')>=0||parts.indexOf('TODOS')>=0||parts.indexOf('ALL')>=0)return true;
  if(scope==='PROSPECT')scope='PROSPECTS';
  return parts.indexOf(scope)>=0;
}
