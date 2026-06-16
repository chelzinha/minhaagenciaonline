(function () {
  'use strict';
  const auth = window.AgfAuth;
  const bootView = document.getElementById('portalBoot');
  const loginView = document.getElementById('loginView');
  const portalView = document.getElementById('portalView');
  const topUserPill = document.getElementById('topUserPill');
  const form = document.getElementById('loginForm');
  const status = document.getElementById('loginStatus');
  const submit = document.getElementById('loginSubmit');
  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');
  const roleControlled = document.querySelectorAll('[data-role],[data-roles]');
  const appControlled = document.querySelectorAll('[data-app]');
  const appAnyControlled = document.querySelectorAll('[data-app-any]');

  function setStatus(message) { status.textContent = message || ''; }
  function hideBoot() { bootView && bootView.classList.add('hide'); }
  function reasonText() {
    const reason = new URLSearchParams(location.search).get('reason');
    const map = { config:'Configure primeiro o URL do Apps Script de autenticação.', perfil:'Seu perfil não permite acessar essa página.', sessao:'Sua sessão foi encerrada. Entre novamente.', login:'Faça login para acessar os aplicativos internos.' };
    return map[reason] || '';
  }
  function safeNext(user) {
    const next = new URLSearchParams(location.search).get('next') || '';
    if (!next || next.charAt(0) !== '/' || next.indexOf('//') === 0 || next.indexOf('\\') >= 0 || /^https?:/i.test(next)) return '';
    return auth.isAllowedPath(next, user) ? next : '';
  }
  function cleanPortalUrl() {
    if (history.replaceState && location.search) history.replaceState(null, '', '/agf/' + location.hash);
  }
  function showLogin(message) {
    hideBoot();
    loginView.classList.remove('hide');
    portalView.classList.add('hide');
    topUserPill && topUserPill.classList.add('hide');
    setStatus(message || reasonText());
  }
  function showPortal(user) {
    hideBoot();
    loginView.classList.add('hide');
    portalView.classList.remove('hide');
    topUserPill && topUserPill.classList.remove('hide');
    userName.textContent = user.displayName || user.username || 'Usuário';
    const roleLabels = { admin:'Administrador', manager:'Gestor', user:'Usuário' };
    userRole.textContent = roleLabels[user.role] || 'Usuário';
    roleControlled.forEach((node) => {
      const roles = String(node.dataset.roles || node.dataset.role || '').split(',').map((item) => item.trim()).filter(Boolean);
      node.classList.toggle('hide', roles.length > 0 && roles.indexOf(user.role) === -1);
    });
    appControlled.forEach((node) => {
      node.classList.toggle('hide', !auth.hasApp(user, node.dataset.app));
    });
    appAnyControlled.forEach((node) => {
      const keys = String(node.dataset.appAny || '').split(',').map((item) => item.trim()).filter(Boolean);
      node.classList.toggle('hide', keys.length > 0 && !keys.some((key) => auth.hasApp(user, key)));
    });
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
        input.focus({ preventScroll:true });
      });
    });
  }
  async function validateExisting() {
    if (!auth || !auth.isConfigured()) { showLogin('Falta configurar o URL do Apps Script em /shared/auth/agf-auth-config.js.'); return; }
    const local = auth.getLocalSession();
    if (!local) { showLogin(); return; }
    const cached = local.user || { username:local.payload.sub, displayName:local.payload.sub, role:local.payload.role, apps:local.payload.apps || [] };
    showPortal(cached); // evita piscar a tela de login ao retornar ao portal
    try {
      const result = await auth.validate();
      showPortal(result.user);
      const next = safeNext(result.user);
      if (next && next !== '/agf/' && next !== '/agf') { location.replace(next); return; }
      cleanPortalUrl();
    } catch (err) { auth.clearSession(); showLogin(err.message); }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); setStatus(''); submit.disabled = true;
    try {
      const result = await auth.login(document.getElementById('username').value, document.getElementById('password').value);
      const next = safeNext(result.user);
      if (next && next !== '/agf/' && next !== '/agf') { location.replace(next); return; }
      showPortal(result.user); cleanPortalUrl(); document.getElementById('password').value = '';
    } catch (err) { showLogin(err.message); }
    finally { submit.disabled = false; }
  });
  initPasswordToggles();
  document.getElementById('logoutButton').addEventListener('click', async () => { await auth.logout(); showLogin('Você saiu do acesso interno.'); });
  validateExisting();
})();
