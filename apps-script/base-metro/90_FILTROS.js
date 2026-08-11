function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const menu = ui.createMenu('🔻 Filtros');

  const filtrosData = ui.createMenu('📅 Filtros por data')
    .addItem('🎛️ Filtrar por ANO / MÊS / DIA', 'MENU_ABRIR_FILTRO_DATA')
    .addItem('✖️ Limpar filtro de data', 'MENU_LIMPAR_FILTRO_DATA');

  menu
    .addItem('Limpar filtros da aba atual', 'limparFiltrosAbaAtual')
    .addItem('Limpar filtros de todas as abas', 'limparFiltrosTodasAbas')
    .addSeparator()
    .addSubMenu(filtrosData)
    .addToUi();

  try {
    if (typeof crmLoteAdicionarMenu_ === 'function') crmLoteAdicionarMenu_(ui);
  } catch (err) {
    Logger.log('[CRM_LOTE] Falha ao adicionar menu CRM: ' + ((err && err.message) || err));
  }
}

// ETAPA 1 (higiene): as funcoes limparFiltrosAbaAtual, limparFiltrosTodasAbas
// e o helper limparFiltrosDaAba_ viviam aqui E em 95_FiltroData.js. No Apps
// Script, quando duas funcoes tem o mesmo nome, a do arquivo carregado por
// ultimo vence silenciosamente - entao estas aqui nunca rodavam, e era esse
// conflito que gerava o aviso amarelo "funcoes com o mesmo nome" ao criar
// acionadores. As versoes que valem continuam em 95_FiltroData.js (que faz o
// mesmo, com SpreadsheetApp.flush() no fim). O menu onOpen acima permanece:
// ele e o ponto de entrada da planilha e segue chamando as versoes do 95.
