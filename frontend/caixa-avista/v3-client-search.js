'use strict';

(() => {
  const DEFAULT_CLIENT_NAME = 'Cliente de Balcão';
  const DEFAULT_CLIENT = 'cliente de balcao';

  const normalize = value =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const field = () => document.getElementById('clientInput');
  const chip = () => document.getElementById('clientChip');
  const section = () => document.getElementById('clientSection');

  function inAttendanceMode() {
    return (
      String(document.body.dataset.entryType || '').toUpperCase() === 'RECEITA' &&
      Boolean(document.querySelector('#modeSwitch [data-mode="ATENDIMENTO"].active'))
    );
  }

  function chipVisible() {
    const node = chip();
    return Boolean(node && !node.classList.contains('hidden'));
  }

  function chipText() {
    const node = chip();
    return normalize(node?.textContent || '');
  }

  function defaultClientIsSelected() {
    return Boolean(
      chipVisible() &&
      chipText().includes(DEFAULT_CLIENT)
    );
  }

  function anotherClientIsSelected() {
    return Boolean(
      chipVisible() &&
      !defaultClientIsSelected()
    );
  }

  function ensureStyles() {
    if (document.getElementById('v3DefaultClientStyles')) return;

    const style = document.createElement('style');
    style.id = 'v3DefaultClientStyles';
    style.textContent = `
      .v3-default-client-badge {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 12px;
        padding: 12px 14px;
        border: 1px solid #cfe2f7;
        border-radius: 16px;
        background: #f4f9ff;
        color: #17324d;
      }
      .v3-default-client-badge.hidden { display: none; }
      .v3-default-client-main {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
        font-weight: 800;
      }
      .v3-default-client-main .material-symbols-rounded {
        color: #0f6ee8;
        font-size: 22px;
      }
      .v3-default-client-tag {
        flex: 0 0 auto;
        padding: 4px 8px;
        border-radius: 999px;
        background: #ddecff;
        color: #0f5fc9;
        font-size: 12px;
        font-weight: 800;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureBadge() {
    const container = section();
    if (!container) return null;

    let badge = document.getElementById('v3DefaultClientBadge');
    if (badge) return badge;

    badge = document.createElement('div');
    badge.id = 'v3DefaultClientBadge';
    badge.className = 'v3-default-client-badge';
    badge.innerHTML = `
      <span class="v3-default-client-main">
        <span class="material-symbols-rounded">person</span>
        <span>${DEFAULT_CLIENT_NAME}</span>
      </span>
      <span class="v3-default-client-tag">Padrão</span>
    `;

    const row = container.querySelector('.client-row');
    if (row) container.insertBefore(badge, row);
    else container.prepend(badge);

    return badge;
  }

  function hideDefaultFromSuggestions() {
    document
      .querySelectorAll('#clientSuggestions [data-client-id]')
      .forEach(button => {
        if (normalize(button.textContent).includes(DEFAULT_CLIENT)) {
          button.remove();
        }
      });
  }

  function patchClientUi() {
    ensureStyles();

    const input = field();
    const nativeChip = chip();
    const badge = ensureBadge();

    if (!input || !badge) return;

    if (!inAttendanceMode()) {
      badge.classList.add('hidden');
      if (nativeChip) nativeChip.style.display = '';
      return;
    }

    const typed = String(input.value || '').trim();
    const defaultSelected = defaultClientIsSelected();
    const otherSelected = anotherClientIsSelected();

    if (defaultSelected) {
      /*
       * O estado interno continua com Cliente de Balcão selecionado, mas o
       * nome não ocupa o campo de pesquisa. O chip nativo permanece marcado
       * como selecionado para não disparar novamente o auto-default da V3.
       */
      nativeChip.style.display = 'none';

      if (normalize(typed) === DEFAULT_CLIENT) {
        input.value = '';
      }

      input.placeholder = 'Buscar outro cliente';
      badge.classList.remove('hidden');
    } else if (otherSelected) {
      nativeChip.style.display = '';
      input.placeholder = 'Cliente';
      badge.classList.add('hidden');
    } else {
      if (nativeChip) nativeChip.style.display = '';
      input.placeholder = 'Buscar outro cliente';

      /*
       * Enquanto o operador está digitando outro nome, escondemos o selo de
       * padrão para deixar claro que a busca está em andamento. Se apagar a
       * busca sem escolher ninguém, o padrão volta automaticamente.
       */
      badge.classList.toggle('hidden', Boolean(typed));
    }

    hideDefaultFromSuggestions();
  }

  function prepareSearch() {
    const input = field();
    if (!input || !inAttendanceMode()) return;

    if (
      defaultClientIsSelected() ||
      normalize(input.value) === DEFAULT_CLIENT
    ) {
      input.value = '';
      input.placeholder = 'Buscar outro cliente';
    }
  }

  function useDefaultForSaveIfNeeded(event) {
    const button = event.target.closest?.('#btnSaveSingle');
    if (!button || !inAttendanceMode()) return;

    const input = field();
    if (!input) return;

    const typed = String(input.value || '').trim();

    /*
     * Se outro cliente já está realmente selecionado, não interferimos.
     * Se o campo está vazio, Cliente de Balcão é o fallback operacional.
     * O valor é recolocado apenas durante a validação síncrona do app base.
     */
    if (!typed && !anotherClientIsSelected()) {
      input.value = DEFAULT_CLIENT_NAME;

      window.setTimeout(() => {
        if (normalize(input.value) === DEFAULT_CLIENT) {
          input.value = '';
        }
        patchClientUi();
      }, 0);
    }
  }

  document.addEventListener('pointerdown', event => {
    if (event.target?.id === 'clientInput') {
      prepareSearch();
    }
  }, true);

  document.addEventListener('focusin', event => {
    if (event.target?.id === 'clientInput') {
      prepareSearch();
      patchClientUi();
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target?.id === 'clientInput') {
      window.requestAnimationFrame(patchClientUi);
    }
  }, true);

  document.addEventListener('click', event => {
    useDefaultForSaveIfNeeded(event);

    if (event.target.closest?.('#clientSuggestions [data-client-id]')) {
      window.setTimeout(patchClientUi, 0);
    }
  }, true);

  const clientSection = section();
  if (clientSection) {
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(patchClientUi);
    });

    observer.observe(clientSection, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  window.CaixaV3ClientSearch = Object.freeze({
    patch: patchClientUi,
    defaultClientName: DEFAULT_CLIENT_NAME
  });

  patchClientUi();
})();
