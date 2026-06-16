const routes={'/boot':'tpl-boot','/auth':'tpl-auth','/home':'tpl-home','/nova':'tpl-nova','/form-reversa':'tpl-form-reversa','/confirm':'tpl-confirm','/success':'tpl-success','/historico':'tpl-historico','/detalhe':'tpl-detalhe'};
let renderFn=null;
export const Router={
  setRenderer(fn){ renderFn=fn; },
  current(){ const h=(location.hash||'#/boot').replace(/^#/,''); return routes[h]?h:'/boot'; },
  go(route){ if(location.hash !== '#'+route) location.hash='#'+route; else renderFn&&renderFn(); },
  mountTemplate(route){ const tpl=document.getElementById(routes[route]||routes['/boot']); const mount=document.getElementById('screenMount'); mount.innerHTML=''; mount.appendChild(tpl.content.cloneNode(true)); },
  init(){ window.addEventListener('hashchange', ()=>renderFn&&renderFn()); renderFn&&renderFn(); }
};
