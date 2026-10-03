/* /simulador/opcoes - destaca a opção mais barata vinda do simulador (#platinum, #clube, #app). */
(function () {
  'use strict';
  var alvo = (location.hash || '').replace('#', '');
  var card = alvo && document.getElementById(alvo);
  if (!card || !card.classList.contains('op-card')) return;
  card.classList.add('destaque');
  var selo = card.querySelector('.op-melhor');
  if (selo) selo.hidden = false;
  // fica no topo: a introdução (CNPJ ou CPF) vem antes dos cartões
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* sem histórico */ }
  window.scrollTo(0, 0);
})();
