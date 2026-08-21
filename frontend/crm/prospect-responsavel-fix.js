(function(){
'use strict';

/*
 * Compatibilidade isolada para o campo RESPONSAVEL de Prospects.
 * Mantem o valor enviado como nome legivel e preserva o ID real em
 * data-responsavel-id / responsavelId, sem alterar o app principal.
 */

function text(v){return String(v==null?'':v).trim();}
function norm(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function rows(){
  try{
    var cfg=window.CRM_APP_CONFIG||{};
    var stateCfg=(window.__CRM_STATE__&&window.__CRM_STATE__.config)||null;
    var src=(stateCfg&&stateCfg.responsaveis)||cfg.responsaveis||[];
    return Array.isArray(src)?src:[];
  }catch(_e){return [];}
}
function rowId(r){return text(r&&(r.RESPONSAVEL_ID||r.responsavelId||r.id||r.ID||r.EMAIL||r.email||r.USERNAME||r.username));}
function rowName(r){return text(r&&(r.DISPLAY_NAME||r.displayName||r.NOME||r.nome||r.nomeResponsavel||r.NOME_RESPONSAVEL||r.USERNAME||r.username||r.RESPONSAVEL_ID||r.responsavelId));}
function match(value){
  var k=norm(value);
  if(!k)return null;
  var rs=rows();
  for(var i=0;i<rs.length;i++){
    var r=rs[i];
    var vals=[rowId(r),rowName(r),r&&r.USERNAME,r&&r.username,r&&r.EMAIL,r&&r.email,r&&r.RESPONSAVEL,r&&r.responsavel];
    for(var j=0;j<vals.length;j++)if(norm(vals[j])===k)return r;
  }
  return null;
}
function optionIdentity(opt){
  if(!opt)return{value:'',name:'',id:''};
  var raw=text(opt.value),label=text(opt.textContent),rid=text(opt.dataset&&opt.dataset.responsavelId);
  var r=match(raw)||match(label)||match(rid);
  return{value:raw,name:r?rowName(r):(label||raw),id:r?rowId(r):rid};
}
function hiddenIdInput(select){
  var host=select&&select.closest('#entityFields');
  if(!host)return null;
  var input=host.querySelector('[data-field="RESPONSAVEL_ID"],input[name="responsavelId"]');
  if(!input){
    input=document.createElement('input');
    input.type='hidden';
    input.name='responsavelId';
    host.appendChild(input);
  }
  return input;
}
function setSelect(select,name,id){
  if(!select)return;
  var wantedName=text(name),wantedId=text(id),found=null;
  for(var i=0;i<select.options.length;i++){
    var opt=select.options[i],ident=optionIdentity(opt);
    if((wantedId&&ident.id===wantedId)||(wantedName&&norm(ident.name)===norm(wantedName))){found=opt;break;}
  }
  if(found)select.value=found.value;
  var active=select.selectedOptions&&select.selectedOptions[0];
  if(active){
    var ident=optionIdentity(active);
    if(ident.name||ident.id){
      active.value=ident.name||active.value;
      active.dataset.responsavelId=ident.id||'';
      select.value=active.value;
    }
  }
  var hidden=hiddenIdInput(select);
  if(hidden)hidden.value=(select.selectedOptions&&select.selectedOptions[0]&&select.selectedOptions[0].dataset.responsavelId)||wantedId||'';
}
function normalizeOptions(select){
  if(!select)return;
  var previous=text(select.value),previousOpt=select.selectedOptions&&select.selectedOptions[0],prevIdent=optionIdentity(previousOpt);
  for(var i=0;i<select.options.length;i++){
    var opt=select.options[i],ident=optionIdentity(opt);
    if(!ident.name&&!ident.id)continue;
    opt.value=ident.name||opt.value;
    opt.dataset.responsavelId=ident.id||'';
  }
  if(previous||prevIdent.name||prevIdent.id)setSelect(select,prevIdent.name||previous,prevIdent.id);
}
function draftResponsible(){
  try{
    var raw=localStorage.getItem('agf.crm.entityDraft.v1');
    if(!raw)return null;
    var d=JSON.parse(raw);
    if(!d||d.type!=='PROSPECT'||d.id)return null;
    var f=d.fields||{};
    var name=text(f.RESPONSAVEL||f.responsavel);
    var id=text(f.RESPONSAVEL_ID||f.responsavelId);
    return(name||id)?{name:name,id:id}:null;
  }catch(_e){return null;}
}
function applyDefault(select){
  if(!select)return;
  normalizeOptions(select);

  /*
   * Rascunho tem precedencia absoluta sobre o default Manu.
   * Isso evita substituir uma escolha manual restaurada ao reabrir
   * Novo Prospect depois que o MutationObserver converte IDs em nomes.
   */
  var draft=draftResponsible();
  if(draft){setSelect(select,draft.name,draft.id);return;}

  if(select.dataset.prospectDefaultApplied==='1')return;
  select.dataset.prospectDefaultApplied='1';
  if(text(select.value))return;

  var manu=match('manu')||match('Manu');
  if(manu)setSelect(select,rowName(manu)||'Manu',rowId(manu));
  else{
    for(var i=0;i<select.options.length;i++){
      if(norm(select.options[i].textContent)==='manu'||norm(select.options[i].value)==='manu'){
        setSelect(select,select.options[i].textContent,select.options[i].dataset.responsavelId||'');
        break;
      }
    }
  }
}
function syncOnChange(select){
  if(!select||select.dataset.prospectRespFixBound==='1')return;
  select.dataset.prospectRespFixBound='1';
  select.addEventListener('change',function(){
    var opt=select.selectedOptions&&select.selectedOptions[0];
    var ident=optionIdentity(opt);
    if(opt&&ident.name){opt.value=ident.name;opt.dataset.responsavelId=ident.id||'';select.value=opt.value;}
    var hidden=hiddenIdInput(select);if(hidden)hidden.value=ident.id||'';
  });
}
function currentSelect(){
  var type=document.getElementById('entityFormType');
  var id=document.getElementById('entityFormId');
  if(!type||String(type.value).toUpperCase()!=='PROSPECT'||(id&&text(id.value)))return null;
  return document.querySelector('#entityFields [data-field="RESPONSAVEL"]');
}
function refresh(){
  var select=currentSelect();
  if(!select)return;
  applyDefault(select);
  syncOnChange(select);
}
function start(){
  refresh();
  var host=document.getElementById('entityFields');
  if(!host)return;
  new MutationObserver(function(){refresh();}).observe(host,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
