'use strict';

(() => {
  const CORE = '/caixa-avista/unit-selector-v3-core.js?v=20260911163000';
  const isCaixaRoute = /^\/caixa(?:\/|$)/.test(window.location.pathname);
  const V3_API_URL =
    'https://script.google.com/macros/s/AKfycbxRaTJeaXhGTC0Lbyqf_Osnr_HsOyUnlOWjwtGMvkvPY1d98H0RthjJPCkLJRkP1x8o/exec';

  if (isCaixaRoute) {
    /*
     * A release V3 usa o deployment estável já homologado da V3.
     * O core continua reconhecendo a URL V2 legada para interceptar chamadas
     * do app-v2.js, mas as redireciona para este endpoint antes da requisição.
     */
    try {
      localStorage.setItem('caixa_avista_v3_api_url', V3_API_URL);
    } catch (_) {}

    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.href = '/caixa/manifest.webmanifest';

    let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = '/assets/pwa/caixa/apple-touch-icon.png';

    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = '#00416B';

    if ('serviceWorker' in navigator) {
      const register = () => navigator.serviceWorker
        .register('/caixa/sw.js?v=20260911163000', { scope: '/caixa/' })
        .catch(error => console.warn('[CAIXA_PWA_SW_BOOT]', error));

      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
  }

  const script = document.createElement('script');
  script.src = CORE;
  script.async = false;
  script.dataset.caixaUnitSelectorCore = 'v3';
  script.onerror = () => {
    const node = document.getElementById('launchStatus');
    if (node) {
      node.textContent = 'Não foi possível carregar o seletor de unidade.';
      node.className = 'status-box show error';
    }
  };
  document.body.appendChild(script);
})();
