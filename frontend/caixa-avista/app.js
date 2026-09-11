'use strict';
(() => {
  const VERSION = '20260911143000';

  const PATHS = Object.freeze({
    pixLink: '/caixa-avista/pix-message-link-fix.js?v=20260904232000',
    pixSafety: '/caixa-avista/pix-safety.js?v=20260904212500',
    movement: '/caixa-avista/movement-history.js?v=20260904230000',
    controller: `/caixa-avista/v3-controller.js?v=${VERSION}`,
    release: `/caixa-avista/v3-release-balcao-pwa.js?v=${VERSION}`,
    application: '/caixa-avista/app-v2.js?v=20260904230000'
  });

  /*
   * As camadas interceptam fetch/window.open e por isso continuam executando
   * numa ordem deterministica. O preload baixa os arquivos em paralelo sem
   * alterar essa ordem.
   */
  [
    PATHS.pixSafety,
    PATHS.movement,
    PATHS.controller,
    PATHS.release,
    PATHS.application
  ].forEach(href => {
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = href;
    document.head.appendChild(link);
  });

  const showLoadError = message => {
    const node = document.getElementById('launchStatus');
    if (node) {
      node.textContent = message;
      node.className = 'status-box show error';
    }
  };

  const appendScript = (src, onload, onerror) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    if (onload) script.onload = onload;
    if (onerror) script.onerror = onerror;
    document.head.appendChild(script);
  };

  const loadApplication = () => {
    appendScript(
      PATHS.application,
      null,
      () => showLoadError('Não foi possível carregar o Caixa Balcão.')
    );
  };

  const loadReleaseLayer = () => {
    appendScript(
      PATHS.release,
      loadApplication,
      () => {
        console.warn('[CAIXA_V3_RELEASE] A camada Balcão/PWA não foi carregada.');
        loadApplication();
      }
    );
  };

  const loadV3Controller = () => {
    appendScript(
      PATHS.controller,
      loadReleaseLayer,
      () => showLoadError('Não foi possível carregar os controles da V3. Atualize a página e tente novamente.')
    );
  };

  const loadMovementHistory = () => {
    appendScript(
      PATHS.movement,
      loadV3Controller,
      () => {
        console.warn('[CAIXA_MOVEMENT_HISTORY] Não foi possível carregar a data e hora das movimentações.');
        loadV3Controller();
      }
    );
  };

  const loadPixSafety = () => {
    appendScript(
      PATHS.pixSafety,
      loadMovementHistory,
      () => showLoadError('Não foi possível carregar a validação do Pix. Atualize a página e tente novamente.')
    );
  };

  appendScript(
    PATHS.pixLink,
    loadPixSafety,
    () => {
      console.warn('[CAIXA_PIX_LINK] Não foi possível carregar a correção do link Pix.');
      loadPixSafety();
    }
  );
})();
