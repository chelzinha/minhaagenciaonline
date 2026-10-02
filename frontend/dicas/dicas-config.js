/* Configuração da Vitrine do Lojista (/dicas).
   apiUrl é preenchido pelo instalador com o endereço do Worker agf-dicas-api.
   Vazio = a página usa só o catálogo de reserva (catalogo-base.js). */
window.AGF_DICAS_CONFIG = Object.freeze({
  apiUrl: 'https://agf-dicas-api.chelzinha.workers.dev',
  timeoutMs: 6000,
  cacheKey: 'agf_dicas_catalogo_v2',
  maxPorCategoria: 4
});
