/**
 * CAIXA V3 - modo Balcao temporario.
 *
 * Enquanto a base mestre de clientes nao for integrada, o bootstrap nao deve
 * ler/enviar o cadastro completo. Mantemos somente um cliente operacional
 * interno para preservar o contrato do frontend e as validacoes existentes.
 *
 * O contato financeiro do Conta Azul continua sendo resolvido pela unidade em
 * Biblioteca_Unidades.default_revenue_contact_ca_id. Este cliente interno nao
 * substitui nem altera essa parametrizacao.
 */
(function v3PrimeBalcaoClientCache_() {
  try {
    CacheService.getScriptCache().put(
      'CAIXA_V3_FAST_CLIENTS_V2',
      JSON.stringify([
        {
          id: 'cliente-balcao',
          name: 'Cliente de Balcão'
        }
      ]),
      21600
    );
  } catch (_) {
    // A indisponibilidade do cache nao pode derrubar o Caixa.
  }
})();
