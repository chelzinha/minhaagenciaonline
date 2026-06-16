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
}

function limparFiltrosAbaAtual() {
  const sheet = SpreadsheetApp.getActiveSheet();
  limparFiltrosDaAba_(sheet);

  SpreadsheetApp.getActive().toast(
    'Filtros limpos na aba: ' + sheet.getName(),
    'OK',
    4
  );
}

function limparFiltrosTodasAbas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ss.getSheets().forEach(sheet => {
    limparFiltrosDaAba_(sheet);
  });

  ss.toast('Filtros limpos em todas as abas.', 'OK', 4);
}

function limparFiltrosDaAba_(sheet) {
  const filter = sheet.getFilter();
  if (!filter) return;

  const range = filter.getRange();

  const row = range.getRow();
  const col = range.getColumn();
  const numRows = range.getNumRows();
  const numCols = range.getNumColumns();

  // Remove o filtro inteiro
  filter.remove();

  // Recria o filtro no mesmo intervalo
  sheet.getRange(row, col, numRows, numCols).createFilter();
}