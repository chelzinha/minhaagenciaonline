(function(){
'use strict';

var items=new Map();
var timer=0;

function text(v){return String(v==null?'':v).trim();}
function norm(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function $(s,r){return(r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}

function capture(list){(list||[]).forEach(function(x){if(x&&x.agendaId)items.set(text(x.agendaId),x);});schedule();}

function selected(attr){
  var chip=$('.chip-filter[data-chip-filter="'+attr+'"]');
  if(!chip)return[];
  return $$('.chip-option.ms.on[data-value]',chip).map(function(x){return text(x.dataset.value);}).filter(Boolean);
}
function matchOne(selectedValues,value){if(!selectedValues.length)return true;var n=norm(value);return selectedValues.some(function(x){return norm(x)===n;});}
function matches(item){
  return matchOne(selected('agendaType'),item.tipoAtividadeId)
    &&matchOne(selected('agendaStatus'),item.statusAtividade)
    &&matchOne(selected('agendaResponsible'),item.responsavelNome||item.responsavelId)
    &&matchOne(selected('agendaLocal'),item.local);
}
function hasFilter(){return ['agendaType','agendaStatus','agendaResponsible','agendaLocal'].some(function(x){return selected(x).length>0;});}

function apply(){
  var host=$('#overdueList');if(!host)return;
  var buttons=$$('.agenda-open[data-agenda-id]',host),visible=0;
  buttons.forEach(function(btn){
    var item=items.get(text(btn.dataset.agendaId));
    var show=!item||matches(item);
    if(btn.hidden===show)btn.hidden=!show;
    if(show)visible++;
  });
  var empty=$('#overdueFilteredEmpty');
  if(buttons.length&&visible===0&&hasFilter()){
    if(!empty){empty=document.createElement('div');empty.id='overdueFilteredEmpty';empty.className='empty-state';empty.textContent='Nenhuma atividade vencida corresponde aos filtros.';host.appendChild(empty);}
    empty.hidden=false;
  }else if(empty)empty.hidden=true;
}
function schedule(){clearTimeout(timer);timer=setTimeout(apply,25);}

function init(){
  var host=$('#overdueList');if(host)new MutationObserver(schedule).observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  window.addEventListener('agf:agenda-f1-items',function(e){capture(e&&e.detail&&e.detail.items);});
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.chip-filter[data-chip-filter^="agenda"]'))setTimeout(schedule,0);});
  schedule();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
