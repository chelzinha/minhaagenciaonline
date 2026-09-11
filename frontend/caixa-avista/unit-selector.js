'use strict';

(() => {
  const CORE = '/caixa-avista/unit-selector-v3-core.js?v=20260911151500';
  const isCaixaRoute = /^\/caixa(?:\/|$)/.test(window.location.pathname);

  if (isCaixaRoute) {
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
        .register('/caixa/sw.js?v=20260911151500', { scope: '/caixa/' })
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
