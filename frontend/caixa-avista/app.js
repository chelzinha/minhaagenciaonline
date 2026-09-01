'use strict';
(() => {
  const script = document.createElement('script');
  script.src = '/caixa-avista/app-v2.js?v=20260831204825';
  script.async = false;
  script.onerror = () => {
    const node = document.getElementById('launchStatus');
    if (node) {
      node.textContent = 'Não foi possível carregar o Caixa Balcão.';
      node.className = 'status-box show error';
    }
  };
  document.head.appendChild(script);
})();
