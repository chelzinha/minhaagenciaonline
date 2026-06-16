import { Store } from '../../state/store.js';
import { Router } from '../router.js';
import { UI } from '../ui.js';
export function mount(){
  const item=Store.getState().currentSuccess; if(!item) return Router.go('/historico');
  document.getElementById('detailSummary').innerHTML=`<div><span>Objeto</span><strong>${item.reversa_id}</strong></div><div><span>Etiqueta</span><strong>${item.etiqueta_id}</strong></div><div><span>Autorização</span><strong>${item.codigo_autorizacao}</strong></div><div><span>Status</span><strong>${item.status_reversa}</strong></div><div><span>Criada em</span><strong>${UI.datetime(item.data_criacao)}</strong></div><div><span>Drop-off</span><strong>${UI.datetime(item.data_confirmacao_dropoff)}</strong></div><div><span>Coleta AGF</span><strong>${UI.datetime(item.data_coleta_agf)}</strong></div><div><span>Recebida na agência</span><strong>${UI.datetime(item.data_recebimento_agencia)}</strong></div><div><span>Postagem</span><strong>${UI.datetime(item.data_postagem)}</strong></div>`;
  document.getElementById('btnBackHistory')?.addEventListener('click',()=>Router.go('/historico'));
}
