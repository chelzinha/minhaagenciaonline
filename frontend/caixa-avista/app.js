'use strict';

(() => {
  const modules = [
    '/caixa-avista/app-utils.js',
    '/caixa-avista/app-core.js',
    '/caixa-avista/app-ui-shell.js',
    '/caixa-avista/app-client-keypad.js',
    '/caixa-avista/app-sales-pix.js',
    '/caixa-avista/app-movements.js',
    '/caixa-avista/app-summary-settings.js',
    '/caixa-avista/app-repository.js',
    '/caixa-avista/app-bootstrap.js'
  ];

  const loadNext = index => {
    if (index >= modules.length) return;
    const script = document.createElement('script');
    script.src = modules[index];
    script.async = false;
    script.onload = () => loadNext(index + 1);
    script.onerror = () => {
      console.error('[CAIXA_AVISTA] Falha ao carregar módulo:', modules[index]);
      const status = document.getElementById('saleStatus');
      if (status) {
        status.textContent = 'Não foi possível carregar todos os módulos do caixa. Atualize a página.';
        status.className = 'status-box show error';
      }
    };
    document.head.appendChild(script);
  };

  loadNext(0);
})();
