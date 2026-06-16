/* =====================================================
   APP ETIQUETAS — Screen: login
   =====================================================
   O handler do submit de login mora em app.js (porque o
   form de login fica FORA do sistema de templates — é uma
   section irmã do #screen-app, e precisa estar ligada antes
   do router entrar em cena).

   Este módulo existe para manter simetria com os outros
   screens (Screens.login.mount(), etc.) e para um ponto de
   extensão futuro (ex: fingerprint, SSO). Hoje não faz nada.
   ===================================================== */

Screens.login = {
  mount: function () {
    // O form já é ligado uma vez em App.bindGlobalListeners.
    // Só dá foco no campo de usuário ao entrar.
    const input = document.getElementById('loginUser');
    if (input) {
      try { input.focus(); } catch (e) {}
    }
  }
};
