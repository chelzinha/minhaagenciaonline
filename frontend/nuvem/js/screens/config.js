
window.Screens = window.Screens || {};
Screens.conta = (function () {
  function mount() {
    const refresh = document.getElementById('navRefresh');
    if (refresh) refresh.classList.add('hidden');
    const c = Api.getCachedClient() || {};
    document.getElementById('contaNome').textContent = c.NOME_FANTASIA || c.NOME_REMETENTE || '—';
    document.getElementById('contaLogin').textContent = c.LOGIN_APP || '—';
    document.getElementById('contaStore').textContent = c.STORE_ID || '—';
    document.getElementById('contaCrm').textContent = c.ID_CRM || '—';
    document.getElementById('contaStatus').textContent = c.STATUS_TESTE_CWS || '—';
  }
  return { mount };
})();
