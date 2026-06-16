import { APP_CONFIG } from './config.js';
import { UI } from './ui.js';
import { Router } from './router.js';
import { Store } from '../state/store.js';
import * as BootScreen from './screens/boot.js';
import * as AuthScreen from './screens/auth.js';
import * as HomeScreen from './screens/home.js';
import * as NovaScreen from './screens/nova.js';
import * as FormReversaScreen from './screens/formReversa.js';
import * as ConfirmScreen from './screens/confirm.js';
import * as SuccessScreen from './screens/success.js';
import * as HistoricoScreen from './screens/historico.js';
import * as DetalheScreen from './screens/detalhe.js';

const ScreenModules = {
  '/boot': BootScreen,
  '/auth': AuthScreen,
  '/home': HomeScreen,
  '/nova': NovaScreen,
  '/form-reversa': FormReversaScreen,
  '/confirm': ConfirmScreen,
  '/success': SuccessScreen,
  '/historico': HistoricoScreen,
  '/detalhe': DetalheScreen
};

function bindBottomNav() {
  document.querySelectorAll('.bottom-nav button').forEach((btn) => {
    btn.classList.toggle('is-active', Router.current() === btn.dataset.route);
    btn.onclick = () => Router.go(btn.dataset.route);
  });
}

function syncShell() {
  const route = Router.current();
  const state = Store.getState();
  const bottomNav = document.getElementById('bottomNav');
  const publicRoute = route === '/boot' || route === '/auth';
  const hideNav = publicRoute || !state.user;
  bottomNav?.classList.toggle('is-hidden', hideNav);
  document.body.classList.toggle('boot-no-scroll', route === '/boot');
}

async function renderRoute() {
  const route = Router.current();
  document.getElementById('appRoot').classList.remove('hidden');
  Router.mountTemplate(route);
  bindBottomNav();
  syncShell();
  const mod = ScreenModules[route];
  if (mod?.mount) await mod.mount();
  bindBottomNav();
  syncShell();
  UI.markReady();
}

function bootstrap() {
  document.title = APP_CONFIG.APP_NAME;
  Router.setRenderer(renderRoute);
  const state = Store.getState();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const slugFromPath = pathParts.length > 1 ? pathParts[pathParts.length - 1] : '';
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || slugFromPath;
  const etiqueta = params.get('etiqueta') || '';
  if (etiqueta) sessionStorage.setItem('reverso_pending_etiqueta', etiqueta);
  if (!location.hash) {
    if (state.user && state.unit) Router.go(etiqueta ? '/nova' : '/home');
    else if (slug || state.unit) Router.go('/auth');
    else Router.go('/boot');
  }
  Router.init();
}

bootstrap();
