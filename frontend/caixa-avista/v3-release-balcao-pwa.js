'use strict';

(() => {
  const BUILD = '20260911170000';
  const isCaixaRoute = /^\/caixa(?:\/|$)/.test(window.location.pathname);

  function ensureReleaseStyles() {
    if (document.getElementById('caixaV3ReleaseStyles')) return;

    const style = document.createElement('style');
    style.id = 'caixaV3ReleaseStyles';
    style.textContent = `
      #clientSection { display: none !important; }

      @supports (padding: max(0px)) {
        .topbar-shell {
          padding-top: env(safe-area-inset-top, 0px);
        }
        .topbar {
          padding-left: max(12px, env(safe-area-inset-left, 0px));
          padding-right: max(12px, env(safe-area-inset-right, 0px));
        }
        .page {
          padding-left: max(10px, env(safe-area-inset-left, 0px));
          padding-right: max(10px, env(safe-area-inset-right, 0px));
        }
      }

      .caixa-install-hint {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        z-index: 10000;
        max-width: 520px;
        margin: 0 auto;
        padding: 14px 16px;
        border: 1px solid #d7e2ef;
        border-radius: 16px;
        background: #fff;
        color: #122033;
        box-shadow: 0 16px 40px rgba(23,42,70,.18);
        font: 700 14px/1.35 "Source Sans 3", system-ui, sans-serif;
      }
      .caixa-install-hint button {
        float: right;
        margin-left: 12px;
        border: 0;
        background: transparent;
        color: #0f6ee8;
        font-weight: 900;
      }
    `;
    document.head.appendChild(style);
  }

  function applyBalcaoUi() {
    ensureReleaseStyles();

    const clientSection = document.getElementById('clientSection');
    if (clientSection) {
      clientSection.setAttribute('aria-hidden', 'true');
    }

    const description = document.getElementById('descriptionInput');
    if (description) {
      description.placeholder = 'Nome do cliente ou observação (opcional)';
      description.setAttribute('aria-label', 'Observação opcional');
    }

    const descriptionBox = document.querySelector('.description-box .minor-title');
    if (descriptionBox && descriptionBox.dataset.v3ReleaseReady !== '1') {
      const icon = descriptionBox.querySelector('.material-symbols-rounded');
      descriptionBox.textContent = '';
      if (icon) descriptionBox.appendChild(icon);
      descriptionBox.appendChild(document.createTextNode('Observação'));
      descriptionBox.dataset.v3ReleaseReady = '1';
    }
  }

  function isStandalone() {
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function showIosHint() {
    if (document.getElementById('caixaInstallHint')) return;

    const hint = document.createElement('div');
    hint.id = 'caixaInstallHint';
    hint.className = 'caixa-install-hint';
    hint.innerHTML = '<button type="button" aria-label="Fechar">Fechar</button>No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
    hint.querySelector('button').addEventListener('click', () => hint.remove());
    document.body.appendChild(hint);
  }

  function addInstallButton() {
    const actions = document.querySelector('.top-actions');
    if (!actions || document.getElementById('btnInstallCaixa')) return null;

    const button = document.createElement('button');
    button.id = 'btnInstallCaixa';
    button.type = 'button';
    button.className = 'icon-btn hidden';
    button.title = 'Instalar Caixa';
    button.setAttribute('aria-label', 'Instalar Caixa na tela inicial');
    button.innerHTML = '<span class="material-symbols-rounded">install_mobile</span>';
    actions.prepend(button);
    return button;
  }

  function configurePwa() {
    if (!isCaixaRoute) return;

    let manifest = document.querySelector('link[rel="manifest"]');
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      document.head.appendChild(manifest);
    }
    manifest.href = '/caixa/manifest.webmanifest';

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
      const registerServiceWorker = () => {
        navigator.serviceWorker
          .register(`/caixa/sw.js?v=${BUILD}`, { scope: '/caixa/' })
          .catch(error => console.warn('[CAIXA_PWA_SW]', error));
      };

      if (document.readyState === 'complete') {
        registerServiceWorker();
      } else {
        window.addEventListener('load', registerServiceWorker, { once: true });
      }
    }

    const button = addInstallButton();
    if (!button || isStandalone()) return;

    if (isIos()) {
      button.classList.remove('hidden');
      button.addEventListener('click', showIosHint);
      return;
    }

    const installState = window.CaixaPwaInstall || {
      prompt: null,
      installed: false
    };
    window.CaixaPwaInstall = installState;

    const refreshInstallButton = () => {
      button.classList.toggle(
        'hidden',
        !installState.prompt || installState.installed
      );
    };

    refreshInstallButton();
    window.addEventListener('caixa:pwa-install-ready', refreshInstallButton);
    window.addEventListener('caixa:pwa-installed', refreshInstallButton);

    /* Fallback caso este script seja carregado fora do bootstrap V3. */
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installState.prompt = event;
      refreshInstallButton();
    });

    button.addEventListener('click', async () => {
      const prompt = installState.prompt;
      if (!prompt) return;

      button.disabled = true;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } finally {
        installState.prompt = null;
        button.disabled = false;
        refreshInstallButton();
      }
    });

    window.addEventListener('appinstalled', () => {
      installState.prompt = null;
      installState.installed = true;
      refreshInstallButton();
    });
  }

  applyBalcaoUi();
  configurePwa();

  const observer = new MutationObserver(() => applyBalcaoUi());
  observer.observe(document.body, { childList: true, subtree: true });
})();