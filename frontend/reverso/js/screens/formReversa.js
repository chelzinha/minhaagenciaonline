import { Store } from '../../state/store.js';
import { Router } from '../router.js';
import { UI } from '../ui.js';
export function mount(){
  const state=Store.getState(); if(!state.currentEtiqueta) return Router.go('/nova');
  document.getElementById('formUnitName').textContent=state.unit?.nome_unidade || '-';
  document.getElementById('formEtiquetaCode').textContent=state.currentEtiqueta?.codigo_etiqueta || '-';
  const select=document.getElementById('janelaColeta');
  select.innerHTML='<option value="proximo_dia_util">Próximo dia útil</option><option value="ate_2_dias_uteis" selected>Até 2 dias úteis</option><option value="ate_3_dias_uteis">Até 3 dias úteis</option>';
  document.getElementById('btnBackToNova')?.addEventListener('click',()=>Router.go('/nova'));
  document.getElementById('reversaForm')?.addEventListener('submit', e=>{
    e.preventDefault();
    const formData={codigo_autorizacao:document.getElementById('codigoAutorizacao').value.trim(),janela_coleta:document.getElementById('janelaColeta').value,comprimento_cm:document.getElementById('comprimentoCm').value.trim(),largura_cm:document.getElementById('larguraCm').value.trim(),altura_cm:document.getElementById('alturaCm').value.trim(),observacao_usuario:document.getElementById('observacaoUsuario').value.trim()};
    if(!formData.codigo_autorizacao) return UI.toast('Informe o código de autorização.','error');
    Store.setForm(formData); Router.go('/confirm');
  });
}
