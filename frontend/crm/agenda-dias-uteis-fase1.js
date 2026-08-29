(function(){
'use strict';

function $(s,r){return(r||document).querySelector(s);}
function text(v){return String(v==null?'':v).trim();}
function toDate(v){var m=text(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(+m[1],+m[2]-1,+m[3]):new Date();}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmt(v){var m=text(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:'—';}
function today(){return ymd(new Date());}
function isWeekend(v){var d=toDate(v).getDay();return d===0||d===6;}
function businessStep(v,dir){
  var d=toDate(v),step=dir<0?-1:1;
  do{d.setDate(d.getDate()+step);}while(d.getDay()===0||d.getDay()===6);
  return ymd(d);
}
function nextBusinessOrSame(v){
  var d=toDate(v),day=d.getDay();
  if(day===6)d.setDate(d.getDate()+2);
  else if(day===0)d.setDate(d.getDate()+1);
  return ymd(d);
}
function weekStart(v){var d=toDate(v),day=d.getDay();d.setDate(d.getDate()-(day===0?6:day-1));return ymd(d);}
function addDays(v,n){var d=toDate(v);d.setDate(d.getDate()+n);return ymd(d);}
function mode(){var b=$('[data-agenda-mode].active');return b?text(b.dataset.agendaMode):'week';}
function cursor(){var p=$('#agendaDatePick');return p&&p.value?p.value:today();}
function setCursor(v){var p=$('#agendaDatePick');if(!p)return;p.value=v;p.dispatchEvent(new Event('change',{bubbles:true}));}

function patchWeekLabel(){
  if(mode()!=='week')return;
  var label=$('#agendaPeriodLabel');if(!label)return;
  var start=weekStart(cursor()),end=addDays(start,4),wanted=fmt(start)+' — '+fmt(end);
  if(label.textContent!==wanted)label.textContent=wanted;
}
function schedulePatch(){clearTimeout(schedulePatch._t);schedulePatch._t=setTimeout(patchWeekLabel,20);}

function init(){
  document.addEventListener('click',function(e){
    var prev=e.target.closest&&e.target.closest('#prevPeriodBtn'),next=e.target.closest&&e.target.closest('#nextPeriodBtn');
    if((prev||next)&&mode()==='day'){
      e.preventDefault();e.stopImmediatePropagation();
      setCursor(businessStep(cursor(),prev?-1:1));
      return;
    }

    var todayBtn=e.target.closest&&e.target.closest('#todayBtn');
    if(todayBtn&&mode()==='day'&&isWeekend(today())){
      e.preventDefault();e.stopImmediatePropagation();
      setCursor(nextBusinessOrSame(today()));
      return;
    }

    var dayMode=e.target.closest&&e.target.closest('[data-agenda-mode="day"]');
    if(dayMode){
      setTimeout(function(){
        // Normaliza somente o caso operacional padrao: abrir a Diaria no
        // proprio fim de semana atual. Data escolhida manualmente continua livre.
        if(cursor()===today()&&isWeekend(cursor()))setCursor(nextBusinessOrSame(cursor()));
      },0);
    }

    var newActivity=e.target.closest&&e.target.closest('#view-agenda [data-open-agenda]');
    if(newActivity){
      var selected=cursor();
      setTimeout(function(){
        var input=$('#agendaDate');if(!input)return;
        // Nova atividade aberta pela Agenda parte da data que o usuario esta vendo.
        // Se a tela ainda estiver no fim de semana atual, usa a proxima data util.
        input.value=(selected===today()&&isWeekend(selected))?nextBusinessOrSame(selected):selected;
      },0);
    }
  },true);

  var root=$('#view-agenda')||document.body;
  new MutationObserver(schedulePatch).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  var pick=$('#agendaDatePick');if(pick)pick.addEventListener('change',schedulePatch);
  schedulePatch();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
