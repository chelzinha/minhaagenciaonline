import { Api } from '../../services/api.js';
import { UI } from '../ui.js';
import { emptyState } from '../../components/cards.js';
export async function mount(){
  const grid=document.getElementById('dashboardStats');
  async function load(){
    try{ UI.showLoading('Atualizando painel...'); const data=await Api.getDashboard(); const stats=data.resumo||{}; grid.innerHTML=Object.entries(stats).map(([k,v])=>`<article class="stat-card"><div class="stat-label">${k.replaceAll('_',' ')}</div><div class="stat-value">${v}</div></article>`).join(''); }
    catch(err){ grid.innerHTML=emptyState('monitoring', err.message || 'Não foi possível carregar o painel.'); }
    finally{ UI.hideLoading(); }
  }
  document.getElementById('btnRefreshDashboard')?.addEventListener('click', load);
  load();
}
