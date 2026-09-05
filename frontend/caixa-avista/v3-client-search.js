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

  const input = () => document.getElementById('clientInput');
  const chip = () => document.getElementById('clientChip');

  function defaultClientIsSelected() {
    const node = chip();
    return Boolean(
      node &&
      !node.classList.contains('hidden') &&
      normalize(node.textContent) === DEFAULT_CLIENT
    );
  }

  function clearDefaultNameFromSearch() {
    const field = input();
    if (!field || !defaultClientIsSelected()) return;

    /*
     * O Cliente de Balcão fica selecionado no estado do Caixa, mas não ocupa
     * o campo de pesquisa. Assim ele funciona como padrão operacional e a
     * busca permanece livre para outro cliente.
     */
    if (normalize(field.value) === DEFAULT_CLIENT) {
      field.value = '';
    }

    field.placeholder = 'Buscar outro cliente';
  }

  function restoreSearchPlaceholder() {
    const field = input();
    if (!field) return;
    field.placeholder = defaultClientIsSelected()
      ? 'Buscar outro cliente'
      : 'Cliente';
  }

  function hideDefaultClientFromSuggestions() {
    document
      .querySelectorAll('#clientSuggestions [data-client-id]')
      .forEach(button => {
        if (normalize(button.textContent) === DEFAULT_CLIENT) {
          button.remove();
        }
      });
  }

  function patchClientUi() {
    clearDefaultNameFromSearch();
    restoreSearchPlaceholder();
    hideDefaultClientFromSuggestions();
  }

  /*
   * O app base escuta focus para recalcular sugestões. Enquanto o cliente
   * padrão está ativo, impedimos apenas esse handler de focus para que clicar
   * na busca não desfaça o padrão. Ao começar a digitar, o evento input do app
   * base assume normalmente e libera a escolha de outro cliente.
   */
  document.addEventListener('focus', event => {
    if (event.target?.id !== 'clientInput') return;
    if (!defaultClientIsSelected()) return;

    clearDefaultNameFromSearch();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('pointerdown', event => {
    if (event.target?.id === 'clientInput') {
      clearDefaultNameFromSearch();
    }
  }, true);

  /*
   * Antes de registrar um atendimento com a busca vazia, recolocamos o nome
   * do cliente padrão apenas para a validação interna do app. Logo depois o
   * campo volta a ficar visualmente vazio. Isso preserva a regra de negócio
   * sem obrigar o atendente a apagar texto.
   */
  document.addEventListener('click', event => {
    const saveButton = event.target.closest?.('#btnSaveSingle');
    if (saveButton && defaultClientIsSelected()) {
      const field = input();
      if (field && !String(field.value || '').trim()) {
        field.value = 'Cliente de Balcão';
        setTimeout(patchClientUi, 0);
      }
    }

    const option = event.target.closest?.('#clientSuggestions [data-client-id]');
    if (option) {
      setTimeout(patchClientUi, 0);
    }
  }, true);

  const observer = new MutationObserver(patchClientUi);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  window.CaixaV3ClientSearch = {
    patch: patchClientUi
  };

  patchClientUi();
})();
