(function(){
'use strict';

function el(id){return document.getElementById(id);}
function token(){var a=window.AgfAuth;return a&&a.getToken?a.getToken():'';}
function say(msg,isErr){
  var t=el('toast');
  if(t){
    clearTimeout(say._timer);
    t.textContent=msg||'';
    t.className='toast'+(isErr?' error':'');
    void t.offsetWidth;
    t.classList.add('show');
    say._timer=setTimeout(function(){t.classList.remove('show');},3200);
    return;
  }
  if(isErr) console.error(msg); else console.log(msg);
}
function authPost(action,payload){
  var cfg=window.AGF_AUTH_CONFIG||{};
  if(!cfg.apiUrl) return Promise.reject(new Error('API de autenticacao nao configurada.'));
  return fetch(cfg.apiUrl,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(Object.assign({action:action},payload||{}))
  }).then(function(r){return r.json();}).then(function(d){
    if(!d||d.ok===false) throw new Error((d&&d.error)||'Falha na comunicacao com o controle de acesso.');
    return d;
  });
}

function bindPasswordFix(){
  var btn=el('userPasswordBtn');
  var modal=el('pwdModal');
  var form=el('pwdForm');
  var err=el('pwdError');
  if(!btn||!modal||!form||!err||btn.dataset.pwdFixBound==='1') return;
  btn.dataset.pwdFixBound='1';

  function open(){
    err.classList.remove('show');
    form.reset();
    modal.classList.remove('hidden');
    var menu=el('userMenu');
    if(menu) menu.style.display='none';
    setTimeout(function(){var f=el('pwdCurrent');if(f)f.focus();},50);
  }
  function close(){modal.classList.add('hidden');}

  btn.addEventListener('click',open);
  ['pwdClose','pwdCancel'].forEach(function(id){var b=el(id);if(b)b.addEventListener('click',close);});
  modal.addEventListener('click',function(e){if(e.target===modal)close();});
  form.addEventListener('submit',function(e){
    e.preventDefault();
    err.classList.remove('show');
    var cur=el('pwdCurrent').value;
    var nv=el('pwdNew').value;
    var cf=el('pwdConfirm').value;
    if(nv.length<8){err.textContent='A nova senha deve ter ao menos 8 caracteres.';err.classList.add('show');return;}
    if(nv!==cf){err.textContent='A confirmacao nao confere com a nova senha.';err.classList.add('show');return;}
    var save=el('pwdSave');
    if(save) save.disabled=true;
    authPost('changeMyPassword',{token:token(),currentPassword:cur,newPassword:nv}).then(function(){
      close();
      say('Senha alterada. Entre novamente com a nova senha.');
      var a=window.AgfAuth;
      if(a&&a.clearSession)a.clearSession();
      setTimeout(function(){location.href='/agf/?reason=password-changed';},900);
    }).catch(function(ex){
      err.textContent=ex.message||'Nao foi possivel alterar a senha.';
      err.classList.add('show');
    }).finally(function(){if(save)save.disabled=false;});
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindPasswordFix);
else bindPasswordFix();
})();
