(function(){
'use strict';

/*
 * Compatibilidade do responsavel de Prospects.
 *
 * O app principal usa RESPONSAVEL como campo visual, mas o <select> recebe
 * RESPONSAVEL_ID como value. Na criacao legada, o backend grava
 * payload.responsavel diretamente na coluna RESPONSAVEL; por isso este shim
 * separa explicitamente nome e ID sem alterar o app.js.
 *
 * Regra de negocio: novo Prospect sem escolha explicita nasce com Manu.
 */

function norm(v){
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toLowerCase();
}

function isNewProspect(){
  var type=document.getElementById('entityFormType');
  var id=document.getElementById('entityFormId');
  return !!type && type.value==='PROSPECT' && !!id && !String(id.value||'').trim();
}

function responsibleSelect(){
  var fields=document.getElementById('entityFields');
  return fields && fields.querySelector('select[data-field="RESPONSAVEL"]');
}

function ensureHiddenId(fields){
  var hidden=fields.querySelector('input[data-field="responsavelId"]');
  if(hidden)return hidden;
  hidden=document.createElement('input');
  hidden.type='hidden';
  hidden.setAttribute('data-field','responsavelId');
  fields.appendChild(hidden);
  return hidden;
}

function prepareResponsible(){
  var fields=document.getElementById('entityFields');
  var select=responsibleSelect();
  if(!fields||!select)return;

  var current=String(select.value||'');
  var options=Array.prototype.slice.call(select.options||[]);

  if(select.dataset.nameValueMode!=='1'){
    options.forEach(function(opt){
      if(!opt.value)return;
      var originalId=String(opt.value||'');
      var name=String(opt.textContent||'').trim();
      opt.dataset.responsavelId=originalId;
      opt.value=name;
    });
    select.dataset.nameValueMode='1';

    if(current){
      var old=options.find(function(opt){return opt.dataset.responsavelId===current;});
      if(old)select.value=old.value;
    }
  }

  var hidden=ensureHiddenId(fields);
  var manu=Array.prototype.slice.call(select.options||[]).find(function(opt){
    return norm(opt.textContent)==='manu';
  });

  if(isNewProspect() && !String(select.value||'').trim() && manu){
    select.value=manu.value;
  }

  function sync(){
    var selected=select.options[select.selectedIndex];
    hidden.value=selected ? String(selected.dataset.responsavelId||'') : '';
  }
  sync();

  if(select.dataset.responsavelSync!=='1'){
    select.dataset.responsavelSync='1';
    select.addEventListener('change',sync);
  }
}

function ensureDefaultBeforeSubmit(e){
  var form=e.target;
  if(!form||form.id!=='entityForm'||!isNewProspect())return;
  var select=responsibleSelect();
  if(!select)return;
  if(!String(select.value||'').trim()){
    var manu=Array.prototype.slice.call(select.options||[]).find(function(opt){
      return norm(opt.textContent)==='manu';
    });
    if(manu){
      select.value=manu.value;
      select.dispatchEvent(new Event('change',{bubbles:false}));
    }
  }
}

function start(){
  var fields=document.getElementById('entityFields');
  if(!fields)return;
  var observer=new MutationObserver(function(){prepareResponsible();});
  observer.observe(fields,{childList:true,subtree:true});
  document.addEventListener('submit',ensureDefaultBeforeSubmit,true);
  prepareResponsible();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
