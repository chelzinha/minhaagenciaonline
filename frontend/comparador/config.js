/* Comparador de Tarifas - configuração
   Backend: Worker agf-balcao-api (Cloudflare), rotas /api/comparador/*.
   Preço à vista: tabelas do /balcao no D1. Contrato, Clube e App: tabelas cmp_* no mesmo D1. */
window.AGFCOMPARADOR_CONFIG = {
  apiUrl: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://127.0.0.1:8787/api/comparador'
    : 'https://agf-balcao-api.chelzinha.workers.dev/api/comparador',
  version: '5.3.0',
  exemploCsv: './data/exemplo_postagens.csv',
  loteTamanho: 200,
};
