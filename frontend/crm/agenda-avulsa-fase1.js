(function(){
'use strict';

var cfg=window.CRM_APP_CONFIG||{};
var auth=window.AgfAuth;
var nativeFetch=window.fetch.bind(window);
var feature={
  config:null,
  configPromise:null,
  activities:new Map(),
  deletedIds:new Set(),
  mode:'LINKED',
  durationTouched:false,
  linkedDraft:null,
  currentActivity:null,
  saving:false,
  patchTimer:0
};

function text(v){return String(v==null?'':v).trim();}
function upper(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function norm(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function isYes(v){return ['SIM','TRUE','1','YES','ATIVO'].indexOf(upper(v))>=0;}
function $(s,r){return(r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function isAvulsa(item){return upper(item&&item.entidadeTipo)==='AVULSA'||upper(item&&item.origemTipo)==='AVULSA';}
function fmtDate(v){var m=text(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:'—';}
function fmtTime(v){var m=text(v).match(/(\d{1,2}):(\d{2})/);return m?m[1].padStart(2,'0')+':'+m[2]:'';}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addMinutes(time,min){var m=text(time).match(/^(\d{1,2}):(\d{2})/);if(!m)return'';var n=(Number(m[1])*60+Number(m[2])+Number(min||0))%(24*60);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function currentUser(){try{return(auth&&auth.getCachedUser&&auth.getCachedUser())||((auth&&auth.getLocalSession&&auth.getLocalSession())||{}).user||null;}catch(_){return null;}}
function canComplete(){var u=currentUser(),crm=(u&&u.crm)||{};return !!(u&&(u.role==='admin'||crm.canCompleteActivities));}

function toast(message,isError){
  var el=$('#toast');if(!el)return;
  clearTimeout(toast._t);el.textContent=message||'';el.className='toast'+(isError?' error':'');
  void el.offsetWidth;el.classList.add('show');toast._t=setTimeout(function(){el.classList.remove('show');},3200);
}
function token(){try{return auth&&auth.getToken?auth.getToken():'';}catch(_){return'';}}
function apiUrl(action){var u=new URL(cfg.apiUrl);u.searchParams.set('action',action);var t=token();if(t)u.searchParams.set('st',t);return u.toString();}
async function apiGet(action){var res=await nativeFetch(apiUrl(action),{cache:'no-store'}),data=await res.json();if(!data||data.ok===false)throw new Error((data&&data.error)||'A API retornou erro.');return data;}
async function apiPost(action,payload){var res=await nativeFetch(apiUrl(action),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload||{})}),data=await res.json();if(!data||data.ok===false)throw new Error((data&&data.error)||'A API retornou erro.');return data;}
function emitAgendaItems(items){try{window.dispatchEvent(new CustomEvent('agf:agenda-f1-items',{detail:{items:items||[]}}));}catch(_){}}

function captureItems(items){
  (items||[]).forEach(function(x){
    var id=text(x&&x.agendaId);if(!id||feature.deletedIds.has(id))return;
    feature.activities.set(id,x);
  });
  emitAgendaItems(items);
  schedulePatch();
}
function capturePayload(data,url){
  if(!data||typeof data!=='object')return;
  if(data.config&&data.config.tiposAtividade)feature.config=data.config;
  if(data.tiposAtividade&&data.resultados)feature.config=data;
  if(data.agenda&&data.agenda.items)captureItems(data.agenda.items);
  if(data.overdue&&data.overdue.items)captureItems(data.overdue.items);
  if(data.items&&String(url||'').indexOf('get_crm_agenda_v3')>=0)captureItems(data.items);
  if(feature.config)refreshLocalDatalist();
}

// Observa o mesmo boot do core. Nenhuma leitura de Clientes/Prospects e
// nenhuma consulta extra de Agenda e criada por este observador.
window.fetch=function(){
  var args=arguments;
  return nativeFetch.apply(window,args).then(function(res){
    try{
      var url=typeof args[0]==='string'?args[0]:(args[0]&&args[0].url)||'';
      if(String(url).indexOf(cfg.apiUrl)>=0){res.clone().json().then(function(data){capturePayload(data,url);}).catch(function(){});}
    }catch(_){}
    return res;
  });
};

function ensureConfig(){
  if(feature.config)return Promise.resolve(feature.config);
  if(!feature.configPromise){feature.configPromise=apiGet('get_crm_config_v3').then(function(data){feature.config=data;refreshLocalDatalist();return data;}).finally(function(){feature.configPromise=null;});}
  return feature.configPromise;
}
function typeRows(){return(feature.config&&feature.config.tiposAtividade)||[];}
function typeRow(id){return typeRows().find(function(x){return text(x.TIPO_ATIVIDADE_ID)===text(id);})||null;}
function resultRows(){return(feature.config&&feature.config.resultados)||[];}
function responsibleName(){var s=$('#agendaResponsible');return s&&s.selectedOptions&&s.selectedOptions[0]?text(s.selectedOptions[0].textContent):'';}

function injectStyle(){
  if($('#agendaAvulsaF1Style'))return;
  var s=document.createElement('style');s.id='agendaAvulsaF1Style';
  s.textContent='\
.agenda-link-mode{display:grid;gap:7px}.agenda-link-mode>span{font-size:11px;font-weight:800;color:var(--muted)}\
.agenda-link-switch{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;border:1px solid var(--line);border-radius:11px;background:#F7FAFC}\
.agenda-link-switch button{border:0;border-radius:8px;background:transparent;padding:9px 10px;color:var(--muted);font:800 11px/1.2 Inter,sans-serif;cursor:pointer}\
.agenda-link-switch button.active{background:#fff;color:var(--navy);box-shadow:0 1px 4px rgba(15,23,42,.09)}\
.agenda-avulsa-note{margin:-2px 0 2px;color:var(--muted);font-size:10px;line-height:1.45}\
.agenda-avulsa-local{display:block;margin-top:4px;color:var(--muted);font-size:10px;font-weight:700}\
#activityModal[data-agenda-kind="AVULSA"] .workspace-stack{display:none!important}\
#activityModal[data-agenda-kind="AVULSA"] .complete-form{margin-top:12px}\
@media(max-width:620px){.agenda-link-switch button{padding:10px 6px}.agenda-link-mode{grid-column:1/-1}}';
  document.head.appendChild(s);
}

function createAgendaFields(){
  var form=$('#agendaForm'),entity=$('#agendaEntitySearch');if(!form||!entity)return;
  var entityLabel=entity.closest('label');
  if(!$('#agendaLinkMode')){
    var mode=document.createElement('div');mode.id='agendaLinkMode';mode.className='agenda-link-mode full';
    mode.innerHTML='<span>Vínculo</span><div class="agenda-link-switch" role="group" aria-label="Vínculo da atividade"><button type="button" data-agenda-link="LINKED" class="active">Cliente ou prospect</button><button type="button" data-agenda-link="AVULSA">Sem vínculo</button></div>';
    entityLabel.parentNode.insertBefore(mode,entityLabel);
  }
  if(!$('#agendaAvulsaTitleWrap')){
    var title=document.createElement('label');title.id='agendaAvulsaTitleWrap';title.className='full hidden';
    title.innerHTML='<span>Título</span><input id="agendaAvulsaTitle" maxlength="160" autocomplete="off" placeholder="Ex.: reunião interna, preparar proposta"><small class="agenda-avulsa-note">Obrigatório para atividade sem Cliente ou Prospect.</small>';
    entityLabel.parentNode.insertBefore(title,entityLabel.nextSibling);
  }
  if(!$('#agendaAvulsaLocalWrap')){
    var obs=$('#agendaObs'),obsLabel=obs&&obs.closest('label'),local=document.createElement('label');
    local.id='agendaAvulsaLocalWrap';local.className='full hidden';
    local.innerHTML='<span>Local</span><input id="agendaAvulsaLocal" list="agendaAvulsaLocalList" maxlength="120" autocomplete="off" placeholder="Opcional"><datalist id="agendaAvulsaLocalList"></datalist>';
    if(obsLabel)obsLabel.parentNode.insertBefore(local,obsLabel);else form.appendChild(local);
  }
  refreshLocalDatalist();
}
function refreshLocalDatalist(){
  var dl=$('#agendaAvulsaLocalList');if(!dl||!feature.config)return;
  var rows=[].concat(feature.config.locais||[],feature.config.prospectLocais||[],feature.config.prospectsLocais||[]),seen=new Set(),vals=[];
  rows.forEach(function(x){var v=text(x.nome||x.NOME_EXIBICAO||x.nomeExibicao||x.local||x.LOCAL),k=upper(v);if(v&&!seen.has(k)){seen.add(k);vals.push(v);}});
  dl.innerHTML=vals.map(function(v){return'<option value="'+esc(v)+'"></option>';}).join('');
}

function mediaLabel(){var el=$('#agendaMedia');return el&&el.closest('label');}
function entityLabel(){var el=$('#agendaEntitySearch');return el&&el.closest('label');}
function setHidden(el,hidden){if(el)el.classList.toggle('hidden',!!hidden);}
function saveLinkedDraft(){feature.linkedDraft={type:text($('#agendaEntityType')&&$('#agendaEntityType').value),id:text($('#agendaEntityId')&&$('#agendaEntityId').value),treatment:text($('#agendaTratativaId')&&$('#agendaTratativaId').value),search:text($('#agendaEntitySearch')&&$('#agendaEntitySearch').value)};}
function restoreLinkedDraft(){var d=feature.linkedDraft||{};if($('#agendaEntityType'))$('#agendaEntityType').value=d.type||'';if($('#agendaEntityId'))$('#agendaEntityId').value=d.id||'';if($('#agendaTratativaId'))$('#agendaTratativaId').value=d.treatment||'';if($('#agendaEntitySearch'))$('#agendaEntitySearch').value=d.search||'';}
function rebuildTypeOptions(avulsa){
  var select=$('#agendaType');if(!select||!feature.config)return;
  var current=text(select.value),rows=typeRows();
  if(avulsa)rows=rows.filter(function(x){return isYes(x.ATIVA)&&isYes(x.APLICA_AVULSA);});else rows=rows.filter(function(x){return isYes(x.ATIVA);});
  select.innerHTML=rows.map(function(x){return'<option value="'+esc(x.TIPO_ATIVIDADE_ID)+'">'+esc(x.NOME_EXIBICAO||x.TIPO_ATIVIDADE_ID)+'</option>';}).join('');
  if(rows.some(function(x){return text(x.TIPO_ATIVIDADE_ID)===current;}))select.value=current;
  if(avulsa&&!rows.length)select.innerHTML='<option value="">Nenhum tipo habilitado para atividade avulsa</option>';
}
function syncDurationDefault(force){
  var duration=$('#agendaDuration'),type=$('#agendaType');if(!duration||!type||!feature.config||feature.durationTouched&&!force)return;
  var row=typeRow(type.value),value=Number(row&&row.DURACAO_PADRAO_MIN);if(value>0)duration.value=String(value);
}
function setMode(mode,options){
  options=options||{};mode=mode==='AVULSA'?'AVULSA':'LINKED';if(mode===feature.mode&&!options.force)return;
  if(mode==='AVULSA'&&feature.mode!=='AVULSA')saveLinkedDraft();feature.mode=mode;
  $$('[data-agenda-link]').forEach(function(b){b.classList.toggle('active',b.dataset.agendaLink===mode);});
  var avulsa=mode==='AVULSA';setHidden(entityLabel(),avulsa);setHidden(mediaLabel(),avulsa);setHidden($('#agendaAvulsaTitleWrap'),!avulsa);setHidden($('#agendaAvulsaLocalWrap'),!avulsa);
  if(avulsa){
    if($('#agendaEntityType'))$('#agendaEntityType').value='AVULSA';if($('#agendaEntityId'))$('#agendaEntityId').value='';if($('#agendaTratativaId'))$('#agendaTratativaId').value='';if($('#agendaEntitySearch'))$('#agendaEntitySearch').value='';
    if($('#agendaEntityOptions')){$('#agendaEntityOptions').innerHTML='';$('#agendaEntityOptions').classList.remove('open');}if($('#agendaMedia'))$('#agendaMedia').value='';
  }else restoreLinkedDraft();
  feature.durationTouched=false;ensureConfig().then(function(){rebuildTypeOptions(avulsa);syncDurationDefault(true);}).catch(function(err){toast(err.message,true);});
}
function onAgendaOpen(){
  createAgendaFields();feature.durationTouched=false;feature.linkedDraft=null;feature.mode='__RESET__';setMode('LINKED',{force:true});
  ensureConfig().then(function(){rebuildTypeOptions(false);syncDurationDefault(true);}).catch(function(){});
}
function closeAgendaModal(){var b=$('[data-close-modal="agendaModal"]');if(b)b.click();else setHidden($('#agendaModal'),true);}
function closeActivityModal(){var b=$('[data-close-modal="activityModal"]');if(b)b.click();else setHidden($('#activityModal'),true);}

function selectedFilter(attr){
  var chip=$('.chip-filter[data-chip-filter="'+attr+'"]');if(!chip)return[];
  return $$('.chip-option.ms.on[data-value]',chip).map(function(x){return text(x.dataset.value);}).filter(Boolean);
}
function matchFilter(values,value){if(!values.length)return true;var n=norm(value);return values.some(function(x){return norm(x)===n;});}
function passesAgendaFilters(item){
  return matchFilter(selectedFilter('agendaType'),item.tipoAtividadeId)
    &&matchFilter(selectedFilter('agendaStatus'),item.statusAtividade)
    &&matchFilter(selectedFilter('agendaResponsible'),item.responsavelNome||item.responsavelId)
    &&matchFilter(selectedFilter('agendaLocal'),item.local);
}
function typeUi(item){var row=typeRow(item.tipoAtividadeId)||{};return{label:text(item.tipoAtividadeNome||row.NOME_EXIBICAO||item.tipoAtividadeId||'Atividade'),icon:text(item.icone||row.ICONE||'event'),color:text(item.cor||row.COR||'#006EA6')};}
function agendaCardHtml(item,mini){
  var ui=typeUi(item),title=text(item.titulo)||'Atividade',time=fmtTime(item.horaProgramada),end=fmtTime(item.horaFimProgramada),status=text(item.statusAtividade);
  if(mini)return'<button type="button" class="agenda-mini agenda-open" style="--activity-color:'+esc(ui.color)+'" data-agenda-id="'+esc(item.agendaId)+'" title="'+esc(ui.label+' · '+title)+'"><span class="material-symbols-rounded">'+esc(ui.icon)+'</span><small>'+esc(time)+(time?' ':'')+esc(title)+'</small></button>';
  return'<button type="button" class="agenda-card agenda-open" style="--activity-color:'+esc(ui.color)+'" data-agenda-id="'+esc(item.agendaId)+'" data-status="'+esc(upper(status))+'"><span class="agenda-time">'+(time?'<b>'+esc(time)+'</b>'+(end?'<i>'+esc(end)+'</i>':''):'<span class="material-symbols-rounded nt" aria-hidden="true">schedule</span><i>sem hora</i>')+'</span><span class="agenda-body"><strong>'+esc(title)+'</strong><small><span class="type-chip" style="--tc:'+esc(ui.color)+'"><span class="material-symbols-rounded">'+esc(ui.icon)+'</span>'+esc(ui.label)+'</span>'+(item.responsavelNome?' <span class="agenda-resp">'+esc(item.responsavelNome)+'</span>':'')+'</small>'+(status?'<span class="agenda-status">'+esc(status)+'</span>':'')+(item.local?'<span class="agenda-avulsa-local">'+esc(item.local)+'</span>':'')+'</span></button>';
}
function removeRendered(id){$$('.agenda-open[data-agenda-id="'+CSS.escape(text(id))+'"]').forEach(function(b){b.remove();});}
function updateDayCount(cell){
  if(!cell)return;var cards=$$('.agenda-open',cell),head=cell.querySelector('.day-head,.day-focus-head'),count=head&&head.querySelector('.day-count');
  if(cards.length){if(!count&&head){count=document.createElement('span');count.className='day-count';head.appendChild(count);}if(count)count.textContent=cards.length+(cell.classList.contains('day-focus')?' atividade'+(cards.length>1?'s':''):'');}
  else if(count)count.remove();
}
function ensureRendered(item){
  var id=text(item.agendaId);if(!id||feature.deletedIds.has(id))return;
  var buttons=$$('.agenda-open[data-agenda-id="'+CSS.escape(id)+'"]');
  if(buttons.length){buttons.forEach(function(b){b.hidden=!passesAgendaFilters(item);});return;}
  if(!passesAgendaFilters(item))return;
  var cal=$('#agendaCalendar');if(!cal)return;var cell=cal.querySelector('[data-day="'+CSS.escape(text(item.dataProgramada))+'"]');if(!cell)return;
  var mini=cal.classList.contains('mode-month'),body=mini?cell.querySelector(':scope > div'):cell.querySelector('.day-body,.day-focus-body');if(!body)return;
  var empty=body.querySelector('.empty-state');if(empty)empty.remove();
  if(mini){
    var minis=$$('.agenda-mini',body);if(minis.length<3)body.insertAdjacentHTML('beforeend',agendaCardHtml(item,true));
    else{var more=body.querySelector('.more-count');if(!more){more=document.createElement('small');more.className='more-count';body.appendChild(more);}more.textContent='+'+(minis.length-2)+' atividades';}
  }else{body.insertAdjacentHTML('beforeend',agendaCardHtml(item,false));updateDayCount(cell);}
}
function patchExisting(item){
  var id=text(item.agendaId),show=passesAgendaFilters(item);
  $$('.agenda-open[data-agenda-id="'+CSS.escape(id)+'"]').forEach(function(btn){
    btn.hidden=!show;if(!show)return;
    var title=text(item.titulo)||'Atividade',strong=btn.querySelector('.agenda-body strong,.list-content strong,strong');if(strong)strong.textContent=title;
    if(btn.classList.contains('agenda-mini')){var small=btn.querySelector('small');if(small)small.textContent=(fmtTime(item.horaProgramada)?fmtTime(item.horaProgramada)+' ':'')+title;}
    var status=btn.querySelector('.agenda-status');if(status)status.textContent=text(item.statusAtividade);
    if(item.local&&btn.classList.contains('agenda-card')){var body=btn.querySelector('.agenda-body');if(body&&!body.querySelector('.agenda-avulsa-local')){var loc=document.createElement('span');loc.className='agenda-avulsa-local';loc.textContent=item.local;body.appendChild(loc);}}
  });
}
function syncOverdueItem(item){
  var host=$('#overdueList');if(!host)return;var id=text(item.agendaId),btn=host.querySelector('.agenda-open[data-agenda-id="'+CSS.escape(id)+'"]');
  var overdue=upper(item.statusAtividade)==='PLANEJADO'&&text(item.dataProgramada)<today();
  if(!overdue){if(btn)btn.remove();return;}
  if(btn)return;
  var ui=typeUi(item),html='<button type="button" class="list-item agenda-open" data-agenda-id="'+esc(id)+'"><span class="activity-icon material-symbols-rounded" style="--activity-color:'+esc(ui.color)+'">'+esc(ui.icon)+'</span><span class="list-content"><strong>'+esc(item.titulo||'Atividade')+'</strong><p>'+esc(ui.label)+' · '+esc(fmtDate(item.dataProgramada))+' '+esc(fmtTime(item.horaProgramada))+'</p></span><span class="chip">'+esc(item.responsavelNome||'Sem responsável')+'</span></button>';
  var empty=host.querySelector('.empty-state');if(empty)empty.remove();host.insertAdjacentHTML('beforeend',html);
}
function syncItemDom(item){if(!item)return;emitAgendaItems([item]);patchExisting(item);ensureRendered(item);syncOverdueItem(item);schedulePatch();}
function deleteItemLocal(id){feature.deletedIds.add(text(id));feature.activities.delete(text(id));removeRendered(id);var host=$('#overdueList');if(host&&!host.querySelector('.agenda-open'))host.innerHTML='<div class="empty-state">Nenhuma atividade vencida.</div>';}
function schedulePatch(){clearTimeout(feature.patchTimer);feature.patchTimer=setTimeout(function(){feature.deletedIds.forEach(removeRendered);feature.activities.forEach(function(item){if(isAvulsa(item)){patchExisting(item);ensureRendered(item);syncOverdueItem(item);}});},25);}
function scheduleAfterCore(){setTimeout(schedulePatch,0);}

function buildLocalItem(payload,response){
  var row=typeRow(payload.tipoAtividadeId)||{},start=text(payload.horaProgramada),duration=Number(payload.duracaoMin||row.DURACAO_PADRAO_MIN||30)||30;
  return{agendaId:text(response&&response.agendaId),tratativaId:'',entidadeTipo:'AVULSA',entidadeId:'',titulo:text(payload.titulo),cliente:'',local:text(payload.local),dataProgramada:text(payload.dataProgramada),horaProgramada:start,horaFimProgramada:addMinutes(start,duration),blocoId:text(payload.blocoId),tipoAtividadeId:text(payload.tipoAtividadeId),tipoAtividadeNome:text(row.NOME_EXIBICAO||payload.tipoAtividadeId),icone:text(row.ICONE),cor:text(row.COR),statusAtividade:'PLANEJADO',resultadoId:'',responsavelId:text(payload.responsavelId),responsavelNome:responsibleName(),observacao:text(payload.observacao)};
}

async function saveAvulsa(e){
  if(feature.mode!=='AVULSA')return;e.preventDefault();e.stopImmediatePropagation();if(feature.saving)return;
  var title=text($('#agendaAvulsaTitle')&&$('#agendaAvulsaTitle').value),type=text($('#agendaType')&&$('#agendaType').value),date=text($('#agendaDate')&&$('#agendaDate').value);
  if(!title){toast('Informe o título da atividade.',true);$('#agendaAvulsaTitle')&&$('#agendaAvulsaTitle').focus();return;}if(!type){toast('Selecione um tipo permitido para atividade avulsa.',true);return;}if(!date){toast('Informe a data da atividade.',true);return;}
  var payload={requestId:text($('#agendaRequestId')&&$('#agendaRequestId').value),tratativaId:'',tipoEntidade:'AVULSA',entidadeId:'',titulo:title,tipoAtividadeId:type,responsavelId:text($('#agendaResponsible')&&$('#agendaResponsible').value),dataProgramada:date,blocoId:text($('#agendaBlock')&&$('#agendaBlock').value),horaProgramada:text($('#agendaTime')&&$('#agendaTime').value),duracaoMin:text($('#agendaDuration')&&$('#agendaDuration').value),local:text($('#agendaAvulsaLocal')&&$('#agendaAvulsaLocal').value),observacao:text($('#agendaObs')&&$('#agendaObs').value),updatedBy:text($('#agendaResponsible')&&$('#agendaResponsible').value)};
  var btn=$('#saveAgendaBtn');
  try{feature.saving=true;if(btn)btn.disabled=true;var response=await apiPost('save_atividade',payload),item=buildLocalItem(payload,response);if(item.agendaId){feature.activities.set(item.agendaId,item);syncItemDom(item);}closeAgendaModal();toast('Atividade avulsa registrada.');}
  catch(err){toast(err.message,true);}finally{feature.saving=false;if(btn)btn.disabled=false;}
}

function restoreLinkedWorkspace(){var modal=$('#activityModal');if(!modal)return;if(modal.dataset.agendaKind==='AVULSA'){modal.removeAttribute('data-agenda-kind');var stack=$('.workspace-stack',modal);if(stack)stack.style.removeProperty('display');var follow=$('#completeFollowup');if(follow&&follow.closest('label'))follow.closest('label').classList.remove('hidden');}feature.currentActivity=null;}
function activityResultOptions(item){return resultRows().filter(function(x){var applies=text(x.TIPO_ATIVIDADE_ID);return isYes(x.ATIVA)&&(applies==='TODOS'||applies===text(item.tipoAtividadeId));}).map(function(x){return'<option value="'+esc(x.RESULTADO_ID)+'">'+esc(x.NOME_EXIBICAO)+'</option>';}).join('');}
function openAvulsaWorkspace(item){
  var modal=$('#activityModal');if(!modal)return;feature.currentActivity=item;modal.dataset.agendaKind='AVULSA';$('#completeAgendaId').value=text(item.agendaId);$('#activityTitle').textContent=text(item.titulo)||'Atividade';
  var summary=[['Tipo',text(item.tipoAtividadeNome||item.tipoAtividadeId||'Atividade')],['Data',fmtDate(item.dataProgramada)+(fmtTime(item.horaProgramada)?' '+fmtTime(item.horaProgramada):'')],['Responsável',text(item.responsavelNome)||'Sem responsável'],['Status',text(item.statusAtividade)||''],['Local',text(item.local)||'—']];
  $('#activitySummary').innerHTML=summary.map(function(x){return'<div class="detail-line"><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>';}).join('');var stack=$('.workspace-stack',modal);if(stack)stack.style.display='none';
  var result=$('#completeResult');if(result){result.innerHTML=activityResultOptions(item);var tr=typeRow(item.tipoAtividadeId);result.required=!!(tr&&isYes(tr.EXIGE_RESULTADO));}$('#completeObs').value='';var follow=$('#completeFollowup');if(follow){follow.value='';if(follow.closest('label'))follow.closest('label').classList.add('hidden');}
  var done=upper(item.statusAtividade)==='CONCLUIDO';$('#completeActivityBtn').classList.toggle('hidden',done||!canComplete());$('#cancelActivityBtn').classList.toggle('hidden',done);$('#deleteActivityBtn').classList.toggle('hidden',done);modal.classList.remove('hidden');
}
async function completeAvulsa(e){
  if(!feature.currentActivity||!isAvulsa(feature.currentActivity))return;e.preventDefault();e.stopImmediatePropagation();var item=feature.currentActivity;
  try{await apiPost('complete_atividade',{agendaId:text(item.agendaId),resultadoId:text($('#completeResult').value),observacao:text($('#completeObs').value),responsavelId:text(item.responsavelId)});item.statusAtividade='CONCLUÍDO';item.resultadoId=text($('#completeResult').value);item.observacao=text($('#completeObs').value);feature.activities.set(text(item.agendaId),item);closeActivityModal();syncItemDom(item);toast('Atividade concluída.');}catch(err){toast(err.message,true);}
}
async function cancelAvulsa(e){
  if(!feature.currentActivity||!isAvulsa(feature.currentActivity))return;e.preventDefault();e.stopImmediatePropagation();if(!window.confirm('Cancelar esta atividade?'))return;var item=feature.currentActivity;
  try{await apiPost('cancel_atividade',{agendaId:text(item.agendaId),responsavelId:text(item.responsavelId)});item.statusAtividade='CANCELADO';feature.activities.set(text(item.agendaId),item);closeActivityModal();syncItemDom(item);toast('Atividade cancelada.');}catch(err){toast(err.message,true);}
}
async function deleteAvulsa(e){
  if(!feature.currentActivity||!isAvulsa(feature.currentActivity))return;e.preventDefault();e.stopImmediatePropagation();if(!window.confirm('Excluir esta atividade? Esta ação remove a linha da Agenda.'))return;var id=text(feature.currentActivity.agendaId);
  try{await apiPost('delete_agenda_item',{agendaId:id,responsavelId:text(feature.currentActivity.responsavelId)});closeActivityModal();deleteItemLocal(id);toast('Atividade excluída.');}catch(err){toast(err.message,true);}
}

function init(){
  injectStyle();createAgendaFields();
  $$('[data-agenda-link]').forEach(function(b){b.addEventListener('click',function(){setMode(b.dataset.agendaLink);});});
  var type=$('#agendaType');if(type)type.addEventListener('change',function(){syncDurationDefault(false);});var duration=$('#agendaDuration');if(duration){duration.addEventListener('input',function(e){if(e.isTrusted)feature.durationTouched=true;});duration.addEventListener('change',function(e){if(e.isTrusted)feature.durationTouched=true;});}
  var form=$('#agendaForm');if(form)form.addEventListener('submit',saveAvulsa,true);var complete=$('#completeForm');if(complete)complete.addEventListener('submit',completeAvulsa,true);var cancel=$('#cancelActivityBtn');if(cancel)cancel.addEventListener('click',cancelAvulsa,true);var del=$('#deleteActivityBtn');if(del)del.addEventListener('click',deleteAvulsa,true);
  document.addEventListener('click',function(e){
    var btn=e.target.closest&&e.target.closest('.agenda-open[data-agenda-id]');
    if(btn){var item=feature.activities.get(text(btn.dataset.agendaId));if(item&&isAvulsa(item)){e.preventDefault();e.stopImmediatePropagation();ensureConfig().then(function(){openAvulsaWorkspace(item);}).catch(function(err){toast(err.message,true);});}else restoreLinkedWorkspace();return;}
    var agendaAction=e.target.closest&&e.target.closest('#view-agenda [data-agenda-mode],#view-agenda #prevPeriodBtn,#view-agenda #nextPeriodBtn,#view-agenda #todayBtn,#view-agenda .chip-filter[data-chip-filter^="agenda"]');
    if(agendaAction)scheduleAfterCore();
  });
  var pick=$('#agendaDatePick');if(pick)pick.addEventListener('change',scheduleAfterCore);
  var agendaModal=$('#agendaModal');if(agendaModal)new MutationObserver(function(){if(!agendaModal.classList.contains('hidden'))setTimeout(onAgendaOpen,0);}).observe(agendaModal,{attributes:true,attributeFilter:['class']});
  var activityModal=$('#activityModal');if(activityModal)new MutationObserver(function(){if(activityModal.classList.contains('hidden'))restoreLinkedWorkspace();}).observe(activityModal,{attributes:true,attributeFilter:['class']});
  schedulePatch();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();