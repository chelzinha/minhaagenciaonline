function v2EnqueueContaAzul_(env,closureId,entries) {
  var rows=[];
  entries.filter(function(e){return e.status!=='EXCLUIDO';}).forEach(function(e){
    var payload=v2ContaAzulPayload_(e);
    var configured=payload.ready;
    rows.push([Utilities.getUuid(),closureId,e.id,e.unitId,e.type,configured?'PENDENTE':'CONFIGURACAO_PENDENTE',0,'',JSON.stringify(payload.body),configured?'':'Preencha UUIDs de contato, conta, categoria e centro de custo na biblioteca.',new Date(),new Date()]);
  });
  if(rows.length)env.caQueue.getRange(env.caQueue.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
}

function v2ContaAzulPayload_(entry) {
  var env=v2Environment_();
  var unit=v2ReadObjects_(env.units,CAIXA_V2_CFG.HEADERS.UNITS).filter(function(x){return String(x.unit_id)===entry.unitId;})[0]||{};
  var contactId=entry.type==='RECEITA'?String(unit.default_revenue_contact_ca_id||''):String(unit.default_expense_contact_ca_id||'');
  var value=Number(entry.amountCents||0)/100;
  var body={data_competencia:entry.date,valor:value,observacao:'Caixa à Vista | '+entry.unitId+' | '+entry.id,descricao:entry.description||entry.categoryContaAzulName||'Lançamento de caixa',contato:contactId,conta_financeira:entry.accountContaAzulId,rateio:[{id_categoria:entry.categoryContaAzulId,valor:value,rateio_centro_custo:[{id_centro_custo:entry.costCenterContaAzulId,valor:value}]}],condicao_pagamento:{parcelas:[{descricao:entry.description||'Lançamento de caixa',data_vencimento:entry.date,nota:'Baixa manual pelo financeiro. Forma informada: '+entry.paymentName,conta_financeira:entry.accountContaAzulId,detalhe_valor:{multa:0,juros:0,valor_bruto:value,valor_liquido:value,desconto:0,taxa:0},metodo_pagamento:entry.paymentContaAzulMethod}]}};
  return {ready:Boolean(contactId&&entry.accountContaAzulId&&entry.categoryContaAzulId&&entry.costCenterContaAzulId&&entry.paymentContaAzulMethod),body:body};
}

function processContaAzulQueueV2(limitValue) {
  var env=v2Environment_(),limit=Math.max(1,Math.min(100,Number(limitValue||20))),rows=v2ReadObjects_(env.caQueue,CAIXA_V2_CFG.HEADERS.CA_QUEUE),processed=0;
  for(var i=0;i<rows.length&&processed<limit;i++){
    var item=rows[i],status=String(item.status),protocol=String(item.protocol||'');
    if(['PENDENTE','ERRO','AGUARDANDO_PROTOCOLO'].indexOf(status)<0)continue;
    try{
      if(status==='AGUARDANDO_PROTOCOLO'&&protocol){
        var protocolResult=v2CheckContaAzulProtocol_(protocol);
        v2ApplyProtocolResult_(env,item,i,protocolResult);
      }else{
        var body=JSON.parse(String(item.payload_json||'{}'));
        var endpoint=String(item.entry_type)==='DESPESA'?'/v1/financeiro/eventos-financeiros/contas-a-pagar':'/v1/financeiro/eventos-financeiros/contas-a-receber';
        var result=v2ContaAzulFetch_(endpoint,{method:'post',contentType:'application/json',payload:JSON.stringify(body),muteHttpExceptions:true});
        var code=result.getResponseCode(),data=JSON.parse(result.getContentText()||'{}');
        if(code<200||code>=300)throw new Error('HTTP '+code+': '+(data.message||data.error||result.getContentText()));
        protocol=String(data.protocolo||data.protocolId||'');
        if(!protocol)throw new Error('Conta Azul não retornou o protocolo da operação.');
        v2ApplyProtocolResult_(env,item,i,{protocol:protocol,status:String(data.status||'PENDING').toUpperCase(),message:String(data.mensagem||data.message||'')});
      }
    }catch(error){
      v2SetQueueRow_(env,i+2,'ERRO',Number(item.attempts||0)+1,protocol,String(error.message||error),item.created_at||new Date());
      v2UpdateEntryContaAzul_(env,String(item.entry_id),'ERRO',protocol,String(error.message||error));
      v2RefreshClosureContaAzulStatus_(env,String(item.closure_id));
    }
    processed++;
  }
  return {ok:true,processed:processed};
}

function v2CheckContaAzulProtocol_(protocol) {
  var response=v2ContaAzulFetch_('/v1/protocolo/'+encodeURIComponent(protocol),{method:'get',muteHttpExceptions:true});
  var code=response.getResponseCode(),data=JSON.parse(response.getContentText()||'{}');
  if(code<200||code>=300)throw new Error('Falha ao consultar protocolo '+protocol+': HTTP '+code+' '+response.getContentText());
  return {protocol:protocol,status:String(data.status||'PENDING').toUpperCase(),message:String(data.mensagem||data.message||data.erro||data.error||'')};
}

function v2ApplyProtocolResult_(env,item,index,result) {
  var protocol=String(result.protocol||item.protocol||''),status=String(result.status||'PENDING').toUpperCase(),attempts=Number(item.attempts||0)+1;
  if(status==='SUCCESS'){
    v2SetQueueRow_(env,index+2,'SINCRONIZADO',attempts,protocol,'',item.created_at||new Date());
    v2UpdateEntryContaAzul_(env,String(item.entry_id),'SINCRONIZADO',protocol,'');
  }else if(status==='ERROR'){
    var message=result.message||'O protocolo foi concluído com erro no Conta Azul.';
    v2SetQueueRow_(env,index+2,'ERRO',attempts,protocol,message,item.created_at||new Date());
    v2UpdateEntryContaAzul_(env,String(item.entry_id),'ERRO',protocol,message);
  }else{
    v2SetQueueRow_(env,index+2,'AGUARDANDO_PROTOCOLO',attempts,protocol,'',item.created_at||new Date());
    v2UpdateEntryContaAzul_(env,String(item.entry_id),'AGUARDANDO_PROTOCOLO',protocol,'');
  }
  v2RefreshClosureContaAzulStatus_(env,String(item.closure_id));
}

function v2SetQueueRow_(env,sheetRow,status,attempts,protocol,error,createdAt) {
  var payload=env.caQueue.getRange(sheetRow,9).getValue();
  env.caQueue.getRange(sheetRow,6,1,7).setValues([[status,attempts,protocol,payload,error,createdAt,new Date()]]);
}

function v2RefreshClosureContaAzulStatus_(env,closureId) {
  if(!closureId)return;
  var queue=v2ReadObjects_(env.caQueue,CAIXA_V2_CFG.HEADERS.CA_QUEUE).filter(function(x){return String(x.closure_id)===closureId;});
  var status='PENDENTE';
  if(queue.length&&queue.every(function(x){return String(x.status)==='SINCRONIZADO';}))status='SINCRONIZADO';
  else if(queue.some(function(x){return ['ERRO','CONFIGURACAO_PENDENTE'].indexOf(String(x.status))>=0;}))status='COM_ERRO';
  var closures=v2ReadObjects_(env.closures,CAIXA_V2_CFG.HEADERS.CLOSURES);
  for(var i=0;i<closures.length;i++)if(String(closures[i].closure_id)===closureId){env.closures.getRange(i+2,33).setValue(status);break;}
}

function v2UpdateEntryContaAzul_(env,entryId,status,protocol,error) {
  var last=env.entries.getLastRow();if(last<2)return;var rows=env.entries.getRange(2,1,last-1,CAIXA_V2_CFG.HEADERS.ENTRIES.length).getValues();
  for(var i=0;i<rows.length;i++)if(String(rows[i][0])===entryId){rows[i][34]=status;if(protocol)rows[i][35]=protocol;rows[i][36]=error||'';rows[i][37]=Number(rows[i][37]||0)+1;if(status==='SINCRONIZADO')rows[i][38]=new Date();env.entries.getRange(i+2,1,1,rows[i].length).setValues([rows[i]]);break;}
}

function v2ContaAzulFetch_(path,options) {
  var token=v2ContaAzulToken_(); options=options||{};options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+token});
  var response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_API+path,options);
  if(response.getResponseCode()===401){token=v2RefreshContaAzulToken_();options.headers.Authorization='Bearer '+token;response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_API+path,options);}return response;
}

function v2ContaAzulToken_() {
  var props=PropertiesService.getScriptProperties(),token=props.getProperty(CAIXA_V2_CFG.PROPS.CA_ACCESS_TOKEN),expires=Number(props.getProperty(CAIXA_V2_CFG.PROPS.CA_EXPIRES_AT)||0);
  if(token&&expires>Date.now()+60000)return token;return v2RefreshContaAzulToken_();
}

function v2RefreshContaAzulToken_() {
  var props=PropertiesService.getScriptProperties(),clientId=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_ID),secret=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_SECRET),refresh=props.getProperty(CAIXA_V2_CFG.PROPS.CA_REFRESH_TOKEN);
  if(!clientId||!secret||!refresh)throw new Error('Credenciais OAuth do Conta Azul não configuradas.');
  var response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',headers:{Authorization:'Basic '+Utilities.base64Encode(clientId+':'+secret)},payload:{grant_type:'refresh_token',refresh_token:refresh},muteHttpExceptions:true});
  var data=JSON.parse(response.getContentText()||'{}');if(response.getResponseCode()<200||response.getResponseCode()>=300)throw new Error(data.error_description||data.error||'Falha ao renovar token Conta Azul.');
  props.setProperty(CAIXA_V2_CFG.PROPS.CA_ACCESS_TOKEN,data.access_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_REFRESH_TOKEN,data.refresh_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_EXPIRES_AT,String(Date.now()+Number(data.expires_in||3600)*1000));return data.access_token;
}

function contaAzulExchangeCodeV2(code) {
  var props=PropertiesService.getScriptProperties(),clientId=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_ID),secret=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_SECRET),redirect=props.getProperty(CAIXA_V2_CFG.PROPS.CA_REDIRECT_URI);
  if(!clientId||!secret||!redirect)throw new Error('Configure client_id, client_secret e redirect_uri.');
  var response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',headers:{Authorization:'Basic '+Utilities.base64Encode(clientId+':'+secret)},payload:{grant_type:'authorization_code',code:code,redirect_uri:redirect},muteHttpExceptions:true});
  var data=JSON.parse(response.getContentText()||'{}');if(response.getResponseCode()<200||response.getResponseCode()>=300)throw new Error(data.error_description||data.error||'Falha ao trocar código.');
  props.setProperty(CAIXA_V2_CFG.PROPS.CA_ACCESS_TOKEN,data.access_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_REFRESH_TOKEN,data.refresh_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_EXPIRES_AT,String(Date.now()+Number(data.expires_in||3600)*1000));return {ok:true};
}

function syncContaAzulLibraryV2() {
  var env=v2Environment_(),now=new Date();
  v2SyncCaSheet_(env.caCategories,CAIXA_V2_CFG.HEADERS.CA_CATEGORIES,v2GetPaged_('/v1/categorias'),function(x){return [x.id,x.codigo||'',x.nome||'',x.tipo||'',x.ativo!==false,now];});
  v2SyncCaSheet_(env.caCostCenters,CAIXA_V2_CFG.HEADERS.CA_COST_CENTERS,v2GetPaged_('/v1/centro-de-custo'),function(x){return [x.id,x.codigo||'',x.nome||'',x.ativo!==false,now];});
  v2SyncCaSheet_(env.caAccounts,CAIXA_V2_CFG.HEADERS.CA_ACCOUNTS,v2GetPaged_('/v1/conta-financeira'),function(x){return [x.id,x.nome||'',x.tipo||'',x.ativo!==false,now];});
  return {ok:true,syncedAt:now.toISOString()};
}

function v2GetPaged_(path) {
  var response=v2ContaAzulFetch_(path,{method:'get',muteHttpExceptions:true});if(response.getResponseCode()<200||response.getResponseCode()>=300)throw new Error('Falha ao sincronizar '+path+': '+response.getContentText());
  var data=JSON.parse(response.getContentText()||'[]');return Array.isArray(data)?data:(data.itens||data.items||data.data||[]);
}

function v2SyncCaSheet_(sheet,headers,items,mapper) {
  if(sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).clearContent();
  var rows=items.map(mapper);if(rows.length)sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
}
