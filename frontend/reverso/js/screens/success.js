import { Store } from '../../state/store.js';
import { Router } from '../router.js';
export function mount(){
  const success=Store.getState().currentSuccess; if(!success) return Router.go('/home');
  document.getElementById('successSummary').innerHTML=`<div><span>Objeto</span><strong>${success.reversa_id}</strong></div><div><span>Etiqueta</span><strong>${success.etiqueta_id}</strong></div><div><span>Status</span><strong>${success.status_reversa}</strong></div>`;
  document.getElementById('btnSuccessHistory')?.addEventListener('click',()=>Router.go('/historico'));
  document.getElementById('btnSuccessHome')?.addEventListener('click',()=>Router.go('/home'));
}
