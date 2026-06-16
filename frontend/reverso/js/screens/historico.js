import { Store } from '../../state/store.js';
import { Router } from '../router.js';
import { Api } from '../../services/api.js';
import { UI } from '../ui.js';
import { statusBadge, emptyState } from '../../components/cards.js';
export async function mount(){
  document.getElementById('btnHistoryLogout')?.addEventListener('click',()=>{ Store.logoutUser(); sessionStorage.removeItem('reverso_pending_etiqueta'); window.location.assign(`${location.pathname}${location.search}#/auth`); });
  const state=Store.getState(); if(!state.user) return Router.go('/auth');
  const list=document.getElementById('historyList');
  try{ UI.showLoading('Buscando seu histórico...'); const data=await Api.getUserHistory(state.user.usuario_id); const items=data.items||[]; if(!items.length){ list.innerHTML=emptyState('package_2','Nenhuma devolução registrada ainda.'); return; }
    list.innerHTML=items.map(item=>`<article class="history-card"><div class="history-card-head"><div><h3 class="history-title">${item.reversa_id}</h3><div class="history-meta">Autorização: ${item.codigo_autorizacao}</div></div>${statusBadge(item.status_reversa)}</div><div class="kv-list"><div><span>Etiqueta</span><strong>${item.etiqueta_id}</strong></div><div><span>Criada em</span><strong>${UI.datetime(item.data_criacao)}</strong></div></div><div class="actions top-gap"><button class="btn btn-ghost btn-sm btn-detail" data-reversa-id="${item.reversa_id}">Ver detalhe</button></div></article>`).join('');
    list.addEventListener('click', e=>{ const btn=e.target.closest('.btn-detail'); if(!btn) return; const item=items.find(x=>x.reversa_id===btn.dataset.reversaId); Store.setSuccess(item); Router.go('/detalhe'); }, {once:true});
  } catch(err){ list.innerHTML=emptyState('error', err.message || 'Não foi possível carregar seu histórico.'); }
  finally{ UI.hideLoading(); }
}

