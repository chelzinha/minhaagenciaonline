(function(){
'use strict';

const cfg=window.CRM_APP_CONFIG||{};
const auth=window.AgfAuth;
let started=false;

function apiGet(action,params={},options={}){
  if(!cfg.apiUrl)return Promise.reject(new Error('A fonte de dados não está configurada.'));
  const url=new URL(cfg.apiUrl);
  url.searchParams.set('action',action);
  const token=auth&&auth.getToken?auth.getToken():'';
  if(token)url.searchParams.set('st',token);
  Object.entries(params).forEach(([key,value])=>{if(value!==''&&value!=null)url.searchParams.set(key,value);});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Number(options.timeoutMs||cfg.requestTimeoutMs||60000));
  return fetch(url,{signal:controller.signal,cache:'no-store'})
    .then(response=>response.json())
    .then(data=>{if(!data||data.ok===false)throw new Error(data&&data.error||'A API retornou erro.');return data;})
    .catch(error=>{if(error.name==='AbortError')throw new Error('O servidor demorou para responder.');throw error;})
    .finally(()=>clearTimeout(timer));
}

function toast(message,isError=false){
  const element=document.getElementById('toast');
  if(!element)return;
  element.textContent=message||'';
  element.classList.toggle('error',!!isError);
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>element.classList.remove('show'),4500);
}

function updateUser(){
  const user=(auth&&auth.getCachedUser&&auth.getCachedUser())||(auth&&auth.getLocalSession&&auth.getLocalSession()||{}).user||{};
  const name=String(user.nome||user.name||user.email||'Usuário').trim();
  const avatar=document.getElementById('userAvatar');
  if(avatar){avatar.textContent=(name.charAt(0)||'U').toUpperCase();avatar.title=name;}
}

function bind(){
  const refresh=document.getElementById('refreshBtn');
  if(refresh)refresh.onclick=async()=>{refresh.disabled=true;try{await window.CurvaABC.refresh();toast('Dados atualizados.');}finally{refresh.disabled=false;}};
  const logout=document.getElementById('logoutBtn');
  if(logout)logout.onclick=()=>{const done=()=>{location.href='/agf/?reason=logout';};if(auth&&auth.logout)Promise.resolve(auth.logout()).then(done,done);else done();};
}

function boot(){
  if(started||!window.CurvaABC)return;
  started=true;
  updateUser();
  bind();
  window.CurvaABC.init({apiGet,toast});
  window.CurvaABC.ensureLoaded().catch(()=>{});
}

window.addEventListener('agf:auth-ready',boot);
if(document.documentElement.classList.contains('agf-auth-ready'))boot();
else setTimeout(()=>{if(auth&&auth.getLocalSession&&auth.getLocalSession())boot();},800);
})();
