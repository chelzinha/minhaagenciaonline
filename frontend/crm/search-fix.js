(function(){
'use strict';

/*
 * Correcoes isoladas dos campos de busca do CRM.
 *
 * 1) O filtro do Funil e recriado pelo app a cada tecla. Isso derruba foco
 *    e cursor e pode fazer a digitacao parecer quebrada. Este arquivo guarda
 *    a posicao do cursor e a restaura no novo input.
 * 2) Adiciona um botao X para limpar as buscas do CRM principal.
 * 3) Desliga autocorrecao/spellcheck do navegador nos campos de pesquisa,
 *    evitando alteracoes involuntarias em nomes, CNPJ/CPF e termos comerciais.
 * 4) Padroniza os textos de ajuda sem alterar a logica dos filtros.
 *
 * Mantido fora de app.js para ser pequeno, auditavel e facilmente reversivel.
 */

var lastBoardInput = null;

function now(){ return Date.now ? Date.now() : new Date().getTime(); }

function addStyles(){
  if(document.getElementById('crmSearchFixStyles'))return;
  var style=document.createElement('style');
  style.id='crmSearchFixStyles';
  style.textContent=[
    '.crm-search-clear{border:0;background:transparent;color:var(--muted,#64748B);width:24px;height:24px;min-width:24px;padding:0;border-radius:999px;display:grid;place-items:center;line-height:1;flex:0 0 24px}',
    '.crm-search-clear:hover,.crm-search-clear:focus-visible{background:var(--soft,#EFF6FB);color:var(--navy,#1B3358);outline:0}',
    '.crm-search-clear[hidden]{display:none!important}',
    '.crm-search-clear .material-symbols-rounded{font-size:16px!important;margin:0!important;color:inherit!important}',
    '.crm-search-inline{position:relative;width:100%}',
    '.crm-search-inline>input{padding-right:38px!important}',
    '.crm-search-inline>.crm-search-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%)}'
  ].join('');
  document.head.appendChild(style);
}

function tuneInput(input){
  if(!input)return;
  input.setAttribute('autocomplete','off');
  input.setAttribute('autocorrect','off');
  input.setAttribute('autocapitalize','none');
  input.setAttribute('spellcheck','false');

  if(input.id==='prospectSearch'){
    input.placeholder='Pesquisar prospects…';
    input.setAttribute('aria-label','Pesquisar prospects');
  }else if(input.id==='clientSearch'){
    input.placeholder='Pesquisar clientes…';
    input.setAttribute('aria-label','Pesquisar clientes');
  }else if(input.id==='agendaEntitySearch'){
    input.placeholder='Pesquisar cliente ou prospect por nome, CNPJ/CPF ou WhatsApp…';
    input.setAttribute('aria-label','Pesquisar cliente ou prospect');
  }else if(input.hasAttribute('data-board-search')){
    var type=String(input.getAttribute('data-board-search')||'').toUpperCase();
    input.placeholder=type==='PROSPECT'?'Pesquisar prospects no funil…':'Pesquisar clientes no funil…';
    input.setAttribute('aria-label',type==='PROSPECT'?'Pesquisar prospects no funil':'Pesquisar clientes no funil');
  }
}

function currentEquivalent(input){
  if(!input)return null;
  if(input.id)return document.getElementById(input.id);
  var type=input.getAttribute('data-board-search');
  if(type){
    var all=document.querySelectorAll('input[data-board-search]');
    for(var i=0;i<all.length;i++)if(all[i].getAttribute('data-board-search')===type)return all[i];
  }
  return input.isConnected?input:null;
}

function updateClearButton(input,button){
  if(!input||!button)return;
  button.hidden=!String(input.value||'');
}

function addClearButton(host,input){
  if(!host||!input)return;
  tuneInput(input);
  if(input.dataset.crmSearchClear==='1')return;
  input.dataset.crmSearchClear='1';

  var button=document.createElement('button');
  button.type='button';
  button.className='crm-search-clear';
  button.title='Limpar busca';
  button.setAttribute('aria-label','Limpar busca');
  button.innerHTML='<span class="material-symbols-rounded" aria-hidden="true">close</span>';
  updateClearButton(input,button);

  input.addEventListener('input',function(){ updateClearButton(input,button); });
  button.addEventListener('mousedown',function(e){ e.preventDefault(); });
  button.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    var target=currentEquivalent(input)||input;
    target.value='';
    try{ target.setSelectionRange(0,0); }catch(_e){}
    target.dispatchEvent(new Event('input',{bubbles:true}));
    setTimeout(function(){
      var current=currentEquivalent(target);
      if(!current)return;
      try{ current.focus({preventScroll:true}); }catch(_e2){ current.focus(); }
      try{ current.setSelectionRange(0,0); }catch(_e3){}
    },0);
  });

  host.appendChild(button);
}

function enhanceSearchField(label){
  if(!label)return;
  var input=label.querySelector('input');
  if(!input)return;
  addClearButton(label,input);
}

function enhanceAgendaSearch(){
  var input=document.getElementById('agendaEntitySearch');
  if(!input)return;
  tuneInput(input);
  if(input.dataset.crmSearchWrapped==='1')return;
  var parent=input.parentNode;
  if(!parent)return;
  var wrap=document.createElement('div');
  wrap.className='crm-search-inline';
  parent.insertBefore(wrap,input);
  wrap.appendChild(input);
  input.dataset.crmSearchWrapped='1';
  addClearButton(wrap,input);
}

function enhanceStaticSearches(){
  ['prospectSearch','clientSearch'].forEach(function(id){
    var input=document.getElementById(id);
    if(input)enhanceSearchField(input.closest('.search-field'));
  });
  enhanceAgendaSearch();
}

function enhanceBoardHost(host){
  if(!host)return;
  var labels=host.querySelectorAll('.search-field');
  for(var i=0;i<labels.length;i++)enhanceSearchField(labels[i]);
}

function findBoardInput(host,type){
  if(!host)return null;
  var inputs=host.querySelectorAll('input[data-board-search]');
  for(var i=0;i<inputs.length;i++){
    if(String(inputs[i].getAttribute('data-board-search')||'')===String(type||''))return inputs[i];
  }
  return null;
}

function restoreBoardFocus(host){
  var snap=lastBoardInput;
  if(!snap||now()-snap.at>1200)return;
  var next=findBoardInput(host,snap.type);
  if(!next||String(next.value||'')!==snap.value)return;
  lastBoardInput=null;
  requestAnimationFrame(function(){
    var active=document.activeElement;
    if(active&&active!==document.body&&active!==next&&!host.contains(active))return;
    try{ next.focus({preventScroll:true}); }catch(_e){ next.focus(); }
    try{ next.setSelectionRange(snap.start,snap.end); }catch(_e2){}
  });
}

function observeBoardHost(id){
  var host=document.getElementById(id);
  if(!host)return;
  enhanceBoardHost(host);
  var observer=new MutationObserver(function(){
    enhanceBoardHost(host);
    restoreBoardFocus(host);
  });
  observer.observe(host,{childList:true,subtree:true});
}

function rememberBoardCursor(e){
  var input=e.target;
  if(!input||!input.matches||!input.matches('input[data-board-search]'))return;
  lastBoardInput={
    type:input.getAttribute('data-board-search')||'',
    value:String(input.value||''),
    start:typeof input.selectionStart==='number'?input.selectionStart:String(input.value||'').length,
    end:typeof input.selectionEnd==='number'?input.selectionEnd:String(input.value||'').length,
    at:now()
  };
}

function start(){
  addStyles();
  enhanceStaticSearches();
  document.addEventListener('input',rememberBoardCursor,true);
  observeBoardHost('prospectBoardFilters');
  observeBoardHost('clientBoardFilters');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
