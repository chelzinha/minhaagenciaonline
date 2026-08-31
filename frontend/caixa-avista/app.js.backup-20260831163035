'use strict';
(() => {
  const script = document.createElement('script');
  script.src = '/caixa-avista/app-v2.js';
  script.async = false;
  script.onerror = () => {
    const node = document.getElementById('launchStatus');
    if (node) {
      node.textContent = 'Não foi possível carregar o Caixa à Vista.';
      node.className = 'status-box show error';
    }
  };
  document.head.appendChild(script);
})();
