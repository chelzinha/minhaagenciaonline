/* Configuracao do Portal Interno vivo (/agf). Worker agf-mural-api.
   Em servidor local (npx serve na porta 8080) aponta para o wrangler dev (8787). */
window.AGF_MURAL_CONFIG = Object.freeze({
  apiUrl: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://127.0.0.1:8787'
    : 'https://agf-mural-api.chelzinha.workers.dev',
  atualizarACadaMs: 120000,     /* recarrega o painel a cada 2 min com a aba visivel */
  recadosVisiveis: 3,
  timeoutMs: 12000
});
