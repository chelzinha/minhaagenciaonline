import { Store } from '../../state/store.js';
import { Router } from '../router.js';
import { Api } from '../../services/api.js';
import { UI } from '../ui.js';
export function mount(){
  const state=Store.getState(); if(!state.currentEtiqueta || !state.currentForm || !state.user) return Router.go('/nova');
  document.getElementById('confirmSummary').innerHTML=`<div><span>Unidade</span><strong>${state.unit.nome_unidade}</strong></div><div><span>Etiqueta</span><strong>${state.currentEtiqueta.codigo_etiqueta}</strong></div><div><span>Autorização</span><strong>${state.currentForm.codigo_autorizacao}</strong></div><div><span>Janela</span><strong>${state.currentForm.janela_coleta.replaceAll('_',' ')}</strong></div><div><span>Medidas</span><strong>${state.currentForm.comprimento_cm || '-'} × ${state.currentForm.largura_cm || '-'} × ${state.currentForm.altura_cm || '-'}</strong></div>`;
  document.getElementById('btnBackToForm')?.addEventListener('click',()=>Router.go('/form-reversa'));
  document.getElementById('btnConfirmDropoff')?.addEventListener('click', async()=>{
    if(!document.getElementById('confirmChecklist').checked) return UI.toast('Confirme o checklist antes de continuar.','error');
    try{ UI.showLoading('Registrando a entrega do pacote...'); const data=await Api.confirmDropoff({usuario_id:state.user.usuario_id,codigo_etiqueta:state.currentEtiqueta.codigo_etiqueta,...state.currentForm}); Store.setSuccess(data); Router.go('/success'); }
    catch(err){ UI.toast(err.message || 'Não foi possível registrar a entrega. Confira os dados e tente novamente.','error'); }
    finally{ UI.hideLoading(); }
  });
}

