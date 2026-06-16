/* =====================================================
   APP ETIQUETAS — App Bootstrap
   =====================================================
   Ponto de entrada do frontend. Responsabilidades:
    - Verifica sessão ao carregar (se tem token válido, mostra app;
      se não, mostra tela de login)
    - Bind dos listeners globais (login, logout, home, bottom-nav)
    - Dispara o router após login ok
   ===================================================== */

const App = (function () {

  function applyBranding() {
    document.title = APP_CONFIG.APP_NAME || 'Postagens AGF José Bonifácio';

    const supportLink = document.getElementById('loginSupportLink');
    if (supportLink && APP_CONFIG.WHATSAPP_SUPPORT_URL) {
      supportLink.href = APP_CONFIG.WHATSAPP_SUPPORT_URL;
    }
  }


  function markAppReady() {
    document.body.classList.remove('app-booting');
    document.body.classList.add('app-ready');
  }

  function showLogin() {
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('screen-app').classList.add('hidden');
    markAppReady();
    const userInput = document.getElementById('loginUser');
    if (userInput && !userInput.value) {
      setTimeout(() => {
        try { userInput.focus(); } catch (e) {}
      }, 60);
    }
  }

  function showApp() {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    markAppReady();
    renderHero();
    // Ativa o router (render inicial + hashchange)
    Router.init();
  }

  function renderHero() {
    // Preenche o hero da tela Nova com dados do cliente logado.
    // É re-chamado toda vez que a tela Nova é montada, mas também
    // no bootstrap para o caso de já começar com hero carregado.
    const client = Api.getCachedClient();
    if (!client) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '—';
    };
    set('heroNome', client.NOME_REMETENTE || client.LOGIN_APP || '—');
    set('heroContrato', client.NUM_CONTRATO ? ('Contrato ' + client.NUM_CONTRATO) : '—');
    set('heroCartao', client.CARTAO_POSTAGEM ? ('Cartão ' + client.CARTAO_POSTAGEM) : '—');
  }

  async function doLogout() {
    const ok = await UI.confirm({
      title: 'Sair',
      body: 'Deseja realmente sair do app?',
      confirmText: 'Sair',
      cancelText: 'Ficar'
    });
    if (!ok) return;
    UI.showLoading('Saindo...');
    try {
      await Api.logout();
    } catch (e) { /* ignora */ }
    UI.hideLoading();
    location.hash = '';
    showLogin();
  }

  function bindGlobalListeners() {
    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;
        if (!user || !pass) {
          UI.toast('Informe login e senha', 'error');
          return;
        }
        const btn = document.getElementById('loginBtn');
        btn.disabled = true;
        UI.showLoading('Entrando...');
        try {
          await Api.login(user, pass);
          UI.hideLoading();
          showApp();
          Router.navigate('/nova');
          const c = Api.getCachedClient() || {};
          const saudacao = c.NOME_REMETENTE || c.LOGIN_APP || '';
          UI.toast('Bem-vindo(a)' + (saudacao ? ', ' + saudacao : '') + '!', 'success');
        } catch (e) {
          UI.hideLoading();
          UI.toastError(e);
        } finally {
          btn.disabled = false;
        }
      });
    }

    // Home (volta pra /nova)
    const navHome = document.getElementById('navHome');
    if (navHome) navHome.addEventListener('click', () => Router.navigate('/nova'));

    // Logout
    const navLogout = document.getElementById('navLogout');
    if (navLogout) navLogout.addEventListener('click', doLogout);

    // Bottom nav — delegamos ao hash router (os links já têm href="#/...")
    // mas prevenimos comportamento "duplicado" quando clicar na rota atual
    document.querySelectorAll('.bn-item').forEach(a => {
      a.addEventListener('click', (ev) => {
        const route = a.getAttribute('data-route');
        if ('#' + route === location.hash) {
          ev.preventDefault();
          // Já está nela — não faz nada
        }
      });
    });
  }

  async function boot() {
    applyBranding();
    bindGlobalListeners();

    // Verifica se há sessão salva e se ainda é válida
    const token = Api.getSessionToken();
    if (!token) {
      showLogin();
      return;
    }

    UI.showLoading('Verificando sessão...');
    try {
      const data = await Api.me();
      if (data && data.client) {
        Api.setCachedClient(data.client);
        UI.hideLoading();
        showApp();
      } else {
        Api.setSessionToken('');
        UI.hideLoading();
        showLogin();
      }
    } catch (e) {
      Api.setSessionToken('');
      Api.setCachedClient(null);
      UI.hideLoading();
      showLogin();
    }
  }

  return {
    boot,
    showLogin,
    showApp,
    renderHero
  };
})();

function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

// Namespace global das telas (cada screen se registra aqui)
const Screens = {};

// Boot
document.addEventListener('DOMContentLoaded', () => {
  registerPWA();
  App.boot();
});
