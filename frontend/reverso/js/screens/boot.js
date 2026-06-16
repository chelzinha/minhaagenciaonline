import { Router } from '../router.js';
import { Api } from '../../services/api.js';
import { Store } from '../../state/store.js';
import { UI } from '../ui.js';

export async function mount() {
  const params = new URLSearchParams(location.search);
  const pathParts = location.pathname.split('/').filter(Boolean);
  const slugFromPath = pathParts.length > 1 ? pathParts[pathParts.length - 1] : '';
  const savedUnit = Store.getState().unit;
  const input = document.getElementById('bootSlugInput');
  const form = document.getElementById('bootForm');
  const prefilledSlug = params.get('slug') || slugFromPath || savedUnit?.slug_unidade || '';

  if (input) {
    input.value = prefilledSlug;
    if (!prefilledSlug) {
      setTimeout(() => input.focus(), 60);
    }
  }

  async function submitBoot() {
    const slug = input?.value.trim();
    if (!slug) return UI.toast('Informe o slug da unidade.', 'error');
    try {
      UI.showLoading('Buscando unidade...');
      const data = await Api.getUnitBySlug(slug);
      Store.setUnit(data.unidade, data.agenda_disponibilidade || []);
      Router.go('/auth');
    } catch (err) {
      UI.toast(err.message || 'Não foi possível localizar a unidade.', 'error');
    } finally {
      UI.hideLoading();
    }
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitBoot();
  });
}
