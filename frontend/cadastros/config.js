/* Endereco da API do Cadastro de Clientes (Worker agf-cadastros-api). */
window.AGF_CADASTROS_API_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'http://127.0.0.1:8787'
  : 'https://agf-cadastros-api.chelzinha.workers.dev';
