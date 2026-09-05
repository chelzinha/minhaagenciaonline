'use strict';
(() => {
  const VERSION = '20260905011500';

  const showLoadError = message => {
    const node = document.getElementById('launchStatus');
    if (node) {
      node.textContent = message;
      node.className = 'status-box show error';
    }
  };

  const loadApplication = () => {
    const script = document.createElement('script');
    script.src = '/caixa-avista/app-v2.js?v=20260904230000';
    script.async = false;
    script.onerror = () => {
      showLoadError('Não foi possível carregar o Caixa Balcão.');
    };
    document.head.appendChild(script);
  };

  const loadClientSearch = () => {
    const script = document.createElement('script');
    script.src = `/caixa-avista/v3-client-search.js?v=${VERSION}`;
    script.async = false;
    script.onload = loadApplication;
    script.onerror = () => {
      console.warn('[CAIXA_V3_CLIENT_SEARCH] Não foi possível carregar a busca rápida de cliente.');
      loadApplication();
    };
    document.head.appendChild(script);
  };

  const loadV3Controller = () => {
    const script = document.createElement('script');
    script.src = `/caixa-avista/v3-controller.js?v=${VERSION}`;
    script.async = false;
    script.onload = loadClientSearch;
    script.onerror = () => {
      showLoadError('Não foi possível carregar os controles da V3. Atualize a página e tente novamente.');
    };
    document.head.appendChild(script);
  };

  const loadMovementHistory = () => {
    const script = document.createElement('script');
    script.src = '/caixa-avista/movement-history.js?v=20260904230000';
    script.async = false;
    script.onload = loadV3Controller;
    script.onerror = () => {
      console.warn('[CAIXA_MOVEMENT_HISTORY] Não foi possível carregar a data e hora das movimentações.');
      loadV3Controller();
    };
    document.head.appendChild(script);
  };

  const loadPixSafety = () => {
    const pixSafety = document.createElement('script');
    pixSafety.src = '/caixa-avista/pix-safety.js?v=20260904212500';
    pixSafety.async = false;
    pixSafety.onload = loadMovementHistory;
    pixSafety.onerror = () => {
      showLoadError('Não foi possível carregar a validação do Pix. Atualize a página e tente novamente.');
    };
    document.head.appendChild(pixSafety);
  };

  const pixMessageLinkFix = document.createElement('script');
  pixMessageLinkFix.src = '/caixa-avista/pix-message-link-fix.js?v=20260904232000';
  pixMessageLinkFix.async = false;
  pixMessageLinkFix.onload = loadPixSafety;
  pixMessageLinkFix.onerror = () => {
    console.warn('[CAIXA_PIX_LINK] Não foi possível carregar a correção do link Pix.');
    loadPixSafety();
  };

  document.head.appendChild(pixMessageLinkFix);
})();
