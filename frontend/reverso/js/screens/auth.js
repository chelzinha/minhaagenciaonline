import { Store } from '../../state/store.js';
import { Router } from '../router.js';
import { Api } from '../../services/api.js';
import { UI } from '../ui.js';
import { getUnitLogo, renderUnitBrandTitle } from '../unitBrand.js';

function readUnitSlugCandidate(unit = {}) {
  const params = new URLSearchParams(location.search || '');
  const pathParts = location.pathname.split('/').filter(Boolean);
  const slugFromPath = pathParts.length > 1 ? pathParts[pathParts.length - 1] : '';
  return String(
    params.get('slug') ||
    slugFromPath ||
    unit.slug_unidade ||
    unit.slugUnidade ||
    unit.slug ||
    unit.codigo_unidade ||
    unit.codigoUnidade ||
    unit.nome_unidade ||
    unit.nomeUnidade ||
    ''
  ).trim();
}

function mergeUnit(base = {}, fresh = {}) {
  return { ...(base || {}), ...(fresh || {}) };
}

async function fetchUnitWithBestLogo(currentUnit = {}) {
  let unit = currentUnit || {};
  let availability = Store.getState().availability || [];
  const slug = readUnitSlugCandidate(unit);

  if (slug) {
    try {
      const data = await Api.getUnitBySlug(slug);
      if (data?.unidade) {
        unit = mergeUnit(unit, data.unidade);
        availability = data.agenda_disponibilidade || availability;
      }
    } catch (_) {
      // Continua com os dados locais para não bloquear o login.
    }
  }

  // Alguns backends antigos ainda não devolvem logo_unidade_url em getUnitBySlug,
  // mas devolvem no status da unidade. Tentamos uma segunda fonte antes de renderizar texto.
  if (!getUnitLogo(unit) && unit?.unidade_id) {
    try {
      const data = await Api.getUnitStatus({ unidade_id: unit.unidade_id });
      if (data?.unidade) {
        unit = mergeUnit(unit, data.unidade);
        availability = data.agenda_disponibilidade || availability;
      }
    } catch (_) {
      // Login/cadastro deve continuar funcionando mesmo sem a logo visual.
    }
  }

  return { unit, availability };
}

export async function mount() {
  let state = Store.getState();
  let unit = state.unit;

  // Quando o usuário chega direto pelo QR da unidade, pode existir slug na URL
  // antes de existir unidade salva no localStorage. Neste caso buscamos a unidade aqui.
  if (!unit) {
    const slug = readUnitSlugCandidate({});
    if (slug) {
      try {
        UI.showLoading('Carregando os dados da unidade...');
        const data = await Api.getUnitBySlug(slug);
        if (data?.unidade) {
          Store.setUnit(data.unidade, data.agenda_disponibilidade || []);
          unit = data.unidade;
          state = Store.getState();
        }
      } catch (err) {
        UI.toast(err.message || 'Não foi possível localizar a unidade.', 'error');
      } finally {
        UI.hideLoading();
      }
    }
  }

  if (!unit) return Router.go('/boot');

  const title = document.getElementById('authUnitTitle');
  const unidadeNome = document.getElementById('authUnidadeNome');
  const form = document.getElementById('authForm');
  const modeWrap = document.getElementById('authMode');
  const cadastroFields = document.getElementById('authCadastroFields');
  let mode = 'login';

  const cpfInput = document.getElementById('authCpf');
  const applyCpfMask = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  };
  cpfInput?.addEventListener('input', (event) => {
    event.target.value = applyCpfMask(event.target.value);
  });

  renderUnitBrandTitle(title, unit, { imgClass: 'unit-logo-title-auth-img' });
  if (unidadeNome) unidadeNome.value = unit.nome_unidade || '';

  const refresh = await fetchUnitWithBestLogo(unit);
  unit = refresh.unit || unit;
  Store.setUnit(unit, refresh.availability || state.availability || []);
  renderUnitBrandTitle(title, unit, { imgClass: 'unit-logo-title-auth-img' });
  if (unidadeNome) unidadeNome.value = unit.nome_unidade || unidadeNome.value || '';

  document.getElementById('btnBackToBoot')?.addEventListener('click', () => Router.go('/boot'));

  modeWrap?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-mode]');
    if (!btn) return;
    mode = btn.dataset.mode;
    UI.qsa('.segmented-btn', modeWrap).forEach((el) => el.classList.toggle('is-active', el === btn));
    cadastroFields.classList.toggle('hidden', mode !== 'cadastro');
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentUnit = Store.getState().unit || unit || state.unit;
    const payload = {
      slug_unidade: currentUnit.slug_unidade,
      cpf: document.getElementById('authCpf').value,
      nome: document.getElementById('authNome').value,
      sala_apto_empresa: document.getElementById('authSala').value,
      telefone: document.getElementById('authTelefone').value,
      email: document.getElementById('authEmail').value,
      aceite_termos: document.getElementById('authAceite').checked ? 'SIM' : 'NAO'
    };

    if (mode === 'login') {
      delete payload.nome;
      delete payload.sala_apto_empresa;
      delete payload.telefone;
      delete payload.email;
      delete payload.aceite_termos;
    }

    try {
      UI.showLoading(mode === 'login' ? 'Entrando com segurança...' : 'Finalizando seu cadastro...');
      const data = await Api.registerOrLoginUser(payload);
      Store.setUser(data.usuario);
      Store.setUnit(data.unidade || currentUnit, Store.getState().availability);
      Router.go(sessionStorage.getItem('reverso_pending_etiqueta') ? '/nova' : '/home');
    } catch (err) {
      UI.toast(err.message || 'Não foi possível entrar. Confira os dados e tente novamente.', 'error');
    } finally {
      UI.hideLoading();
    }
  });
}

