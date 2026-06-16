/***************************************
 * REVERSA - V1.6.3
 * Logo da unidade no app público
 ***************************************/

function migrateReversaLogoUnidadeV163() {
  const ss = getReversaSpreadsheet_();
  ensureSheetHeaders_(ss, 'UNIDADES', ['logo_unidade_url']);
  applyEditableCellsHighlight_(ss);
  SpreadsheetApp.flush();
  try { SpreadsheetApp.getUi().alert('Migração V1.6.3 concluída: campo logo_unidade_url criado em UNIDADES.'); } catch (_) {}
}
