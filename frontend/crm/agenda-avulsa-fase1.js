(function(){
'use strict';

var cfg=window.CRM_APP_CONFIG||{};
var auth=window.AgfAuth;
var nativeFetch=window.fetch.bind(window);
var feature={
  config:null,
  configPromise:null,
  activities:new Map(),
  mode:'LINKED',
  durationTouched:false,
  linkedDraft:null,
  currentActivity:null,
  saving:false,
  patchTimer:0
};

function text(v){return String(v==null?'':v).trim();}
function upper(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function isYes(v){return ['SIM','TRUE','1','YES','ATIVO'].indexOf(upper(v))>=0;}
function $(s,r){return(r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function isAvulsa(item){return upper(item&&item.entidadeTipo)==='AVULSA'||upper(item&&item.origemTipo)==='AVULSA';}
function fmtDate(v){var m=text(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:'—';}
function fmtTime(v){var m=text(v).match(/(\d{1,2}):(\d{2})/);return m?m[1].padStart(2,'0')+':'+m[2]:'';}
function currentUser(){try{return(auth&&auth.getCachedUser&&auth.getCachedUser())||((auth&&auth.getLocalSession&&auth.getLocalSession())||{}).user||null;}catch(_){return null;}}
function canComplete(){var u=currentUser(),crm=(u&&u.crm)||{};return !!(u&&(u.role==='admin'||crm.canCompleteActivities));}

function toast(message,isError){
  var el=$('#toast');
  if(!el)return;
  clearTimeout(toast._t);
  el.textContent=message||'';
  el.className='toast'+(isError?' error':'');
  void el.offsetWidth;
  el.classList.add('show');
  toast._t=setTimeout(function(){el.classList.remove('show');},3200);
}

function token(){try{return auth&&auth.getToken?auth.getToken():'';}catch(_){return'';}}
function apiUrl(action){var u=new URL(cfg.apiUrl);u.searchParams.set('action',action);var t=token();if(t)u.searchParams.set('st',t);return u.toString();}
async function apiGet(action){
  var res=await nativeFetch(apiUrl(action),{cache:'no-store'}),data=await res.json();
  if(!data||data.ok===false)throw new Error((data&&data.error)||'A API retornou erro.');
  return data;
}
async function apiPost(action,payload){
  var res=await nativeFetch(apiUrl(action),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload||{})}),data=await res.json();
  if(!data||data.ok===false)throw new Error((data&&data.error)||'A API retornou erro.');
  return data;
}

function captureItems(items){
  (items||[]).forEach(function(x){if(x&&x.agendaId)feature.activities.set(text(x.agendaId),x);});
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

// Observa as respostas que o CRM ja faria. Assim o modulo nao cria carga paralela
// de Agenda e respeita o mesmo escopo de responsavel/permissao usado pelo core.
window.fetch=function(){
  var args=arguments;
  return nativeFetch.apply(window,args).then(function(res){
    try{
      var url=typeof args[0]==='string'?args[0]:(args[0]&&args[0].url)||'';
      if(String(url).indexOf(cfg.apiUrl)>=0){
        res.clone().json().then(function(data){capturePayload(data,url);}).catch(function(){});
      }
    }catch(_){}
    return res;
  });
};

function ensureConfig(){
  if(feature.config)return Promise.resolve(feature.config);
  if(!feature.configPromise){
    feature.configPromise=apiGet('get_crm_config_v3').then(function(data){feature.config=data;refreshLocalDatalist();return data;}).finally(function(){feature.configPromise=null;});
  }
  return feature.configPromise;
}
function typeRows(){return(feature.config&&feature.config.tiposAtividade)||[];}
function typeRow(id){return typeRows().find(function(x){return text(x.TIPO_ATIVIDADE_ID)===text(id);})||null;}
function resultRows(){return(feature.config&&feature.config.resultados)||[];}

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
    var obs=$('#agendaObs'),obsLabel=obs&&obs.closest('label');
    var local=document.createElement('label');local.id='agendaAvulsaLocalWrap';local.className='full hidden';
    local.innerHTML='<span>Local</span><input id="agendaAvulsaLocal" list="agendaAvulsaLocalList" maxlength="120" autocomplete="off" placeholder="Opcional"><datalist id="agendaAvulsaLocalList"></datalist>';
    if(obsLabel)obsLabel.parentNode.insertBefore(local,obsLabel);else form.appendChild(local);
  }
  refreshLocalDatalist();
}

function refreshLocalDatalist(){
  var dl=$('#agendaAvulsaLocalList');if(!dl||!feature.config)return;
  var rows=[].concat(feature.config.locais||[],feature.config.prospectLocais||[],feature.config.prospectsLocais||[]),seen=new Set(),vals=[];
  rows.forEach(function(x){var v=text(x.nome||x.NOME_EXIBICAO||x.nomeExibicao||x.local||x.LOCAL);var k=upper(v);if(v&&!seen.has(k)){seen.add(k);vals.push(v);}});
  dl.innerHTML=vals.map(function(v){return'<option value="'+esc(v)+'"></option>';}).join('');
}

function mediaLabel(){var el=$('#agendaMedia');return el&&el.closest('label');}
function entityLabel(){var el=$('#agendaEntitySearch');return el&&el.closest('label');}
function setHidden(el,hidden){if(el)el.classList.toggle('hidden',!!hidden);}
function saveLinkedDraft(){feature.linkedDraft={type:text($('#agendaEntityType')&&$('#agendaEntityType').value),id:text($('#agendaEntityId')&&$('#agendaEntityId').value),treatment:text($('#agendaTratativaId')&&$('#agendaTratativaId').value),search:text($('#agendaEntitySearch')&&$('#agendaEntitySearch').value)};}
function restoreLinkedDraft(){var d=feature.linkedDraft||{};if($('#agendaEntityType'))$('#agendaEntityType').value=d.type||'';if($('#agendaEntityId'))$('#agendaEntityId').value=d.id||'';if($('#agendaTratativaId'))$('#agendaTratativaId').value=d.treatment||'';if($('#agendaEntitySearch'))$('#agendaEntitySearch').value=d.search||'';}

function rebuildTypeOptions(avulsa){
  var select=$('#agendaType');if(!select)return;
  if(!feature.config)return;
  var current=text(select.value),rows=typeRows();
  if(avulsa)rows=rows.filter(function(x){return isYes(x.ATIVA)&&isYes(x.APLICA_AVULSA);});
  else rows=rows.filter(function(x){return isYes(x.ATIVA);});
  select.innerHTML=rows.map(function(x){return'<option value="'+esc(x.TIPO_ATIVIDADE_ID)+'">'+esc(x.NOME_EXIBICAO||x.TIPO_ATIVIDADE_ID)+'</option>';}).join('');
  if(rows.some(function(x){return text(x.TIPO_ATIVIDADE_ID)===current;}))select.value=current;
  if(avulsa&&!rows.length){select.innerHTML='<option value="">Nenhum tipo habilitado para atividade avulsa</option>';}
}

function syncDurationDefault(force){
  var duration=$('#agendaDuration'),type=$('#agendaType');if(!duration||!type||!feature.config)return;
  if(feature.durationTouched&&!force)return;
  var row=typeRow(type.value),value=Number(row&&row.DURACAO_PADRAO_MIN);
  if(value>0)duration.value=String(value);
}

function setMode(mode,options){
  options=options||{};mode=mode==='AVULSA'?'AVULSA':'LINKED';
  if(mode===feature.mode&&!options.force)return;
  if(mode==='AVULSA'&&feature.mode!=='AVULSA')saveLinkedDraft();
  feature.mode=mode;
  $$('[data-agenda-link]').forEach(function(b){b.classList.toggle('active',b.dataset.agendaLink===mode);});
  var avulsa=mode==='AVULSA';
  setHidden(entityLabel(),avulsa);setHidden(mediaLabel(),avulsa);setHidden($('#agendaAvulsaTitleWrap'),!avulsa);setHidden($('#agendaAvulsaLocalWrap'),!avulsa);
  if(avulsa){
    if($('#agendaEntityType'))$('#agendaEntityType').value='AVULSA';
    if($('#agendaEntityId'))$('#agendaEntityId').value='';
    if($('#agendaTratativaId'))$('#agendaTratativaId').value='';
    if($('#agendaEntitySearch'))$('#agendaEntitySearch').value='';
    if($('#agendaEntityOptions')){$('#agendaEntityOptions').innerHTML='';$('#agendaEntityOptions').classList.remove('open');}
    if($('#agendaMedia'))$('#agendaMedia').value='';
  }else restoreLinkedDraft();
  feature.durationTouched=false;
  ensureConfig().then(function(){rebuildTypeOptions(avulsa);syncDurationDefault(true);}).catch(function(err){toast(err.message,true);});
}

function onAgendaOpen(){
  createAgendaFields();
  feature.durationTouched=false;
  feature.linkedDraft=null;
  var linked=!!(text($('#agendaEntityId')&&$('#agendaEntityId').value)||text($('#agendaTratativaId')&&$('#agendaTratativaId').value));
  feature.mode='__RESET__';
  setMode(linked?'LINKED':'LINKED',{force:true});
  ensureConfig().then(function(){rebuildTypeOptions(false);syncDurationDefault(true);}).catch(function(){});
}

function closeAgendaModal(){var b=$('[data-close-modal="agendaModal"]');if(b)b.click();else setHidden($('#agendaModal'),true);}
function closeActivityModal(){var b=$('[data-close-modal="activityModal"]');if(b)b.click();else setHidden($('#activityModal'),true);}
function reloadAgendaSoon(){setTimeout(function(){location.reload();},350);}

async function saveAvulsa(e){
  if(feature.mode!=='AVULSA')return;
  e.preventDefault();e.stopImmediatePropagation();
  if(feature.saving)return;
  var title=text($('#agendaAvulsaTitle')&&$('#agendaAvulsaTitle').value),type=text($('#agendaType')&&$('#agendaType').value),date=text($('#agendaDate')&&$('#agendaDate').value);
  if(!title){toast('Informe o título da atividade.',true);$('#agendaAvulsaTitle')&&$('#agendaAvulsaTitle').focus();return;}
  if(!type){toast('Selecione um tipo permitido para atividade avulsa.',true);return;}
  if(!date){toast('Informe a data da atividade.',true);return;}
  var payload={
    requestId:text($('#agendaRequestId')&&$('#agendaRequestId').value),
    tratativaId:'',tipoEntidade:'AVULSA',entidadeId:'',titulo:title,
    tipoAtividadeId:type,responsavelId:text($('#agendaResponsible')&&$('#agendaResponsible').value),
    dataProgramada:date,blocoId:text($('#agendaBlock')&&$('#agendaBlock').value),
    horaProgramada:text($('#agendaTime')&&$('#agendaTime').value),
    duracaoMin:text($('#agendaDuration')&&$('#agendaDuration').value),
    local:text($('#agendaAvulsaLocal')&&$('#agendaAvulsaLocal').value),
    observacao:text($('#agendaObs')&&$('#agendaObs').value),
    updatedBy:text($('#agendaResponsible')&&$('#agendaResponsible').value)
  };
  var btn=$('#saveAgendaBtn');
  try{
    feature.saving=true;if(btn)btn.disabled=true;
    await apiPost('save_atividade',payload);
    closeAgendaModal();toast('Atividade avulsa registrada.');
    // A recarga permanece escopada à própria URL da Agenda. O boot da view
    // Agenda não solicita jornadas de Cliente/Prospect.
    reloadAgendaSoon();
  }catch(err){toast(err.message,true);}finally{feature.saving=false;if(btn)btn.disabled=false;}
}

function patchAvulsaLabels(){
  $$('.agenda-open[data-agenda-id]').forEach(function(btn){
    var item=feature.activities.get(text(btn.dataset.agendaId));if(!item||!isAvulsa(item))return;
    var title=text(item.titulo)||'Atividade';
    var strong=btn.querySelector('.agenda-body strong, .list-content strong, strong');if(strong)strong.textContent=title;
    if(btn.classList.contains('agenda-mini')){
      var small=btn.querySelector('small');if(small)small.textContent=(fmtTime(item.horaProgramada)?fmtTime(item.horaProgramada)+' ':'')+title;
      btn.title=(text(item.tipoAtividadeNome)||'Atividade')+' · '+title;
    }
    if(item.local&&btn.classList.contains('agenda-card')){
      var body=btn.querySelector('.agenda-body');
      if(body&&!body.querySelector('.agenda-avulsa-local')){
        var loc=document.createElement('span');loc.className='agenda-avulsa-local';loc.textContent=item.local;body.appendChild(loc);
      }
    }
  });
}
function schedulePatch(){clearTimeout(feature.patchTimer);feature.patchTimer=setTimeout(patchAvulsaLabels,25);}

function restoreLinkedWorkspace(){
  var modal=$('#activityModal');if(!modal)return;
  if(modal.dataset.agendaKind==='AVULSA'){
    modal.removeAttribute('data-agenda-kind');
    var stack=$('.workspace-stack',modal);if(stack)stack.style.removeProperty('display');
    var follow=$('#completeFollowup');if(follow&&follow.closest('label'))follow.closest('label').classList.remove('hidden');
  }
  feature.currentActivity=null;
}

function activityResultOptions(item){
  var rows=resultRows().filter(function(x){var applies=text(x.TIPO_ATIVIDADE_ID);return isYes(x.ATIVA)&&(applies==='TODOS'||applies===text(item.tipoAtividadeId));});
  return rows.map(function(x){return'<option value="'+esc(x.RESULTADO_ID)+'">'+esc(x.NOME_EXIBICAO)+'</option>';}).join('');
}
function openAvulsaWorkspace(item){
  var modal=$('#activityModal');if(!modal)return;
  feature.currentActivity=item;modal.dataset.agendaKind='AVULSA';
  $('#completeAgendaId').value=text(item.agendaId);
  $('#activityTitle').textContent=text(item.titulo)||'Atividade';
  var summary=[
    ['Tipo',text(item.tipoAtividadeNome||item.tipoAtividadeId||'Atividade')],
    ['Data',fmtDate(item.dataProgramada)+(fmtTime(item.horaProgramada)?' '+fmtTime(item.horaProgramada):'')],
    ['Responsável',text(item.responsavelNome)||'Sem responsável'],
    ['Status',text(item.statusAtividade)||''],
    ['Local',text(item.local)||'—']
  ];
  $('#activitySummary').innerHTML=summary.map(function(x){return'<div class="detail-line"><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>';}).join('');
  var stack=$('.workspace-stack',modal);if(stack)stack.style.display='none';
  var result=$('#completeResult');if(result){result.innerHTML=activityResultOptions(item);var tr=typeRow(item.tipoAtividadeId);result.required=!!(tr&&isYes(tr.EXIGE_RESULTADO));}
  $('#completeObs').value='';
  var follow=$('#completeFollowup');if(follow){follow.value='';if(follow.closest('label'))follow.closest('label').classList.add('hidden');}
  var done=upper(item.statusAtividade)==='CONCLUIDO';
  $('#completeActivityBtn').classList.toggle('hidden',done||!canComplete());
  $('#cancelActivityBtn').classList.toggle('hidden',done);
  $('#deleteActivityBtn').classList.toggle('hidden',done);
  modal.classList.remove('hidden');
}

async function completeAvulsa(e){
  if(!feature.currentActivity||!isAvulsa(feature.currentActivity))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{
    await apiPost('complete_atividade',{agendaId:text(feature.currentActivity.agendaId),resultadoId:text($('#completeResult').value),observacao:text($('#completeObs').value),responsavelId:text(feature.currentActivity.responsavelId)});
    closeActivityModal();toast('Atividade concluída.');reloadAgendaSoon();
  }catch(err){toast(err.message,true);}
}
async function cancelAvulsa(e){
  if(!feature.currentActivity||!isAvulsa(feature.currentActivity))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!window.confirm('Cancelar esta atividade?'))return;
  try{await apiPost('cancel_atividade',{agendaId:text(feature.currentActivity.agendaId),responsavelId:text(feature.currentActivity.responsavelId)});closeActivityModal();toast('Atividade cancelada.');reloadAgendaSoon();}catch(err){toast(err.message,true);}
}
async function deleteAvulsa(e){
  if(!feature.currentActivity||!isAvulsa(feature.currentActivity))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!window.confirm('Excluir esta atividade? Esta ação remove a linha da Agenda.'))return;
  try{await apiPost('delete_agenda_item',{agendaId:text(feature.currentActivity.agendaId),responsavelId:text(feature.currentActivity.responsavelId)});closeActivityModal();toast('Atividade excluída.');reloadAgendaSoon();}catch(err){toast(err.message,true);}
}

function init(){
  injectStyle();createAgendaFields();
  ensureConfig().catch(function(){});

  $$('[data-agenda-link]').forEach(function(b){b.addEventListener('click',function(){setMode(b.dataset.agendaLink);});});
  var type=$('#agendaType');if(type)type.addEventListener('change',function(){syncDurationDefault(false);});
  var duration=$('#agendaDuration');if(duration){duration.addEventListener('input',function(e){if(e.isTrusted)feature.durationTouched=true;});duration.addEventListener('change',function(e){if(e.isTrusted)feature.durationTouched=true;});}
  var form=$('#agendaForm');if(form)form.addEventListener('submit',saveAvulsa,true);
  var complete=$('#completeForm');if(complete)complete.addEventListener('submit',completeAvulsa,true);
  var cancel=$('#cancelActivityBtn');if(cancel)cancel.addEventListener('click',cancelAvulsa,true);
  var del=$('#deleteActivityBtn');if(del)del.addEventListener('click',deleteAvulsa,true);

  document.addEventListener('click',function(e){
    var btn=e.target.closest&&e.target.closest('.agenda-open[data-agenda-id]');if(!btn)return;
    var item=feature.activities.get(text(btn.dataset.agendaId));
    if(item&&isAvulsa(item)){
      e.preventDefault();e.stopImmediatePropagation();
      ensureConfig().then(function(){openAvulsaWorkspace(item);}).catch(function(err){toast(err.message,true);});
    }else restoreLinkedWorkspace();
  },true);

  var agendaModal=$('#agendaModal');if(agendaModal){
    new MutationObserver(function(){if(!agendaModal.classList.contains('hidden'))setTimeout(onAgendaOpen,0);}).observe(agendaModal,{attributes:true,attributeFilter:['class']});
  }
  var activityModal=$('#activityModal');if(activityModal){
    new MutationObserver(function(){if(activityModal.classList.contains('hidden'))restoreLinkedWorkspace();}).observe(activityModal,{attributes:true,attributeFilter:['class']});
  }
  new MutationObserver(schedulePatch).observe(document.body,{childList:true,subtree:true});
  schedulePatch();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
