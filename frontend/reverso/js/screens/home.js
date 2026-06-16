import { Store } from '../../state/store.js';
import { Router } from '../router.js';
import { Api } from '../../services/api.js';
import { UI } from '../ui.js';
import { statusBadge } from '../../components/cards.js';
import { renderUnitBrandTitle } from '../unitBrand.js';

export async function mount() {
  const state = Store.getState();
  if (!state.unit || !state.user) return Router.go('/auth');

  renderUnitBrandTitle(document.getElementById('homeTitle'), state.unit, { imgClass: 'unit-logo-title-home-img' });
  document.getElementById('homeSubtitle').textContent = `Coleta em até ${state.unit.prazo_coleta_dias_uteis} dias úteis.`;

  try {
    UI.showLoading('Atualizando a disponibilidade da unidade...');
    const data = await Api.getUnitStatus({ unidade_id: state.unit.unidade_id });
    Store.setUnit(data.unidade, data.agenda_disponibilidade || []);
    renderUnitBrandTitle(document.getElementById('homeTitle'), data.unidade, { imgClass: 'unit-logo-title-home-img' });
    document.getElementById('homeChips').innerHTML = `${statusBadge(data.status_ponto.status_ocupacao)}<span class="hero-chip">Pendentes: ${data.status_ponto.pacotes_pendentes}</span><span class="hero-chip">Etiquetas: ${data.status_ponto.etiquetas_disponiveis}</span>`;
    document.getElementById('availabilityGrid').innerHTML = (data.agenda_disponibilidade || []).map((item) => `<div class="calendar-card"><div class="calendar-row"><div class="calendar-date">${item.data_label}</div>${item.disponivel ? statusBadge('normal') : statusBadge('indisponivel')}</div></div>`).join('');
  } catch (err) {
    document.getElementById('availabilityGrid').innerHTML = '<div class="empty-state"><strong>Não foi possível carregar a agenda.</strong></div>';
  } finally {
    UI.hideLoading();
  }

  document.getElementById('btnStartNova')?.addEventListener('click', () => Router.go('/nova'));
  document.getElementById('btnOpenInstructions')?.addEventListener('click', () => UI.toast('Pegue 1 etiqueta, leia o QR ou digite o código e informe 1 autorização por objeto.'));
  document.getElementById('btnQuickHistory')?.addEventListener('click', () => Router.go('/historico'));
  document.getElementById('btnQuickLogout')?.addEventListener('click', () => {
    Store.logoutUser();
    sessionStorage.removeItem('reverso_pending_etiqueta');
    window.location.assign(`${location.pathname}${location.search}#/auth`);
  });
}

