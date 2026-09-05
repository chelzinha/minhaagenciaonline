'use strict';

(() => {
  const DEFAULT_CLIENT = 'cliente de balcao';

  const normalize = value =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  function isDefaultClientActive(input) {
    if (!input) return false;

    const chip = document.getElementById('clientChip');
    const inputIsDefault = normalize(input.value) === DEFAULT_CLIENT;
    const chipIsDefault = chip && normalize(chip.textContent) === DEFAULT_CLIENT;

    return Boolean(inputIsDefault || chipIsDefault);
  }

  function prepareOtherClientSearch(input) {
    if (!input || !isDefaultClientActive(input)) return;

    /*
     * O Cliente de Balcão continua sendo o cliente lógico selecionado até que
     * outro cliente seja efetivamente escolhido. Limpamos somente o campo de
     * pesquisa para que o operador possa começar a digitar imediatamente.
     */
    input.value = '';
    input.placeholder = 'Buscar outro cliente';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('pointerdown', event => {
    const input = event.target.closest?.('#clientInput');
    if (input) prepareOtherClientSearch(input);
  }, true);

  document.addEventListener('focusin', event => {
    if (event.target?.id === 'clientInput') {
      prepareOtherClientSearch(event.target);
    }
  }, true);

  document.addEventListener('click', event => {
    const option = event.target.closest?.('#clientSuggestions [data-client-id]');
    if (!option) return;

    const input = document.getElementById('clientInput');
    if (input) input.placeholder = 'Cliente';
  }, true);

  window.CaixaV3ClientSearch = {
    prepare() {
      prepareOtherClientSearch(document.getElementById('clientInput'));
    }
  };
})();