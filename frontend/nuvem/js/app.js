
const App = (function () {
  function applyBranding() {
    document.title = APP_CONFIG.APP_NAME;
    const support = document.getElementById('loginSupportLink');
    if (support) support.href = APP_CONFIG.WHATSAPP_SUPPORT_URL;
  }
  function showLogin() {
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('screen-app').classList.add('hidden');
  }
  function showApp() {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    Router.init();
  }
  async function bootstrapSession() {
    const token = Api.getSessionToken();
    if (!token) return showLogin();
    try {
      const data = await Api.me();
      Api.setCachedClient(data.client);
      showApp();
    } catch (e) {
      Api.setSessionToken(''); Api.setCachedClient(''); showLogin();
    }
  }
  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const icon = button.querySelector('.material-symbols-rounded');
      if (!input || button.dataset.passwordReady === '1') return;
      button.dataset.passwordReady = '1';
      button.addEventListener('click', () => {
        const shouldShow = input.type === 'password';
        input.type = shouldShow ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(shouldShow));
        button.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
        button.setAttribute('title', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
        if (icon) icon.textContent = shouldShow ? 'visibility_off' : 'visibility';
        input.focus({ preventScroll: true });
      });
    });
  }
  function bindGlobal() {
    document.getElementById('navHome').addEventListener('click', () => Router.navigate('/pedidos'));
    document.getElementById('navLogout').addEventListener('click', async () => {
      await Api.logout(); showLogin();
    });
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const login = document.getElementById('loginUser').value.trim();
      const senha = document.getElementById('loginPass').value.trim();
      UI.showLoading('Entrando...');
      try {
        const data = await Api.login(login, senha);
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.LAST_LOGIN, login);
        Api.setCachedClient(data.client);
        UI.hideLoading();
        showApp();
      } catch (e) {
        UI.hideLoading(); UI.toastError(e);
      }
    });
  }
  function init() {
    applyBranding(); initPasswordToggles(); bindGlobal(); bootstrapSession();
    document.body.classList.remove('app-booting'); document.body.classList.add('app-ready');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
  return { init };
})();
window.addEventListener('DOMContentLoaded', App.init);

document.addEventListener('click', function (ev) {
  const btnLimpar = ev.target.closest('#btnLimparSelecao');
  if (!btnLimpar) return;

  ev.preventDefault();

  const mount = document.getElementById('screenMount') || document;
  const checkboxes = mount.querySelectorAll('input[type="checkbox"]');

  checkboxes.forEach((cb) => {
    if (!cb.checked) return;
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const bulkCount = document.getElementById('bulkCount');
  if (bulkCount) {
    bulkCount.textContent = 'Nenhum selecionado';
  }

  const btnGerarLote = document.getElementById('btnGerarLote');
  if (btnGerarLote) {
    btnGerarLote.disabled = true;
  }
});