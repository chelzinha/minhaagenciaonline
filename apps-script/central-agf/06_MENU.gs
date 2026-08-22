function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('CENTRAL AGF')
      .addItem('Configurar ambiente', 'centralAgfAutoConfigurar')
      .addItem('Sincronizar catálogo de partições', 'centralAgfSincronizarCatalogoParticoes')
      .addItem('Auditar histórico mensal', 'centralAgfValidarHistorico')
      .addItem('Gerar diagnóstico de identidade', 'centralAgfGerarDiagnosticoIdentidade')
      .addSeparator()
      .addItem('Atualizar visão conforme parâmetros', 'centralAgfAtualizarVisao')
      .addItem('Materializar todas as postagens filtradas', 'centralAgfMaterializarPostagens')
      .addItem('Atualizar lista de clientes', 'centralAgfMaterializarClientes')
      .addToUi();
  } catch (err) {
    console.log('CENTRAL AGF onOpen: ' + err.message);
  }
}
