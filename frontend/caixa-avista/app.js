'use strict';
(() => {
  const showLoadError = message => {
    const node = document.getElementById('launchStatus');
    if (node) {
      node.textContent = message;
      node.className = 'status-box show error';
    }
  };

  const loadApplication = () => {
    const script = document.createElement('script');
    script.src = '/caixa-avista/app-v2.js?v=20260902102544';
    script.async = false;
    script.onerror = () => {
      showLoadError('Não foi possível carregar o Caixa Balcão.');
    };
    document.head.appendChild(script);
  };

  const pixSafety = document.createElement('script');
  pixSafety.src = '/caixa-avista/pix-safety.js?v=20260904220000';
  pixSafety.async = false;
  pixSafety.onload = loadApplication;
  pixSafety.onerror = () => {
    showLoadError('Não foi possível carregar a validação do Pix. Atualize a página e tente novamente.');
  };

  document.head.appendChild(pixSafety);
})();