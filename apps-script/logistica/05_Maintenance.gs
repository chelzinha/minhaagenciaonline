/***************************************
 * REVERSA - ETAPA 5
 * Manutenção e diagnósticos
 ***************************************/

function rebuildLoteCounters() {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS);
  const rows = getDataRowsAsObjects_(sheet);

  rows.forEach(row => {
    if (row.lote_id) {
      updateLoteCounters_(row.lote_id);
    }
  });

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Contadores dos lotes atualizados com sucesso.');
}

function validateReversaData() {
  const ss = getReversaSpreadsheet_();
  const report = [];

  const requiredSheets = [
    REVERSA_CORE_CFG.SHEETS.UNIDADES,
    REVERSA_CORE_CFG.SHEETS.USUARIOS,
    REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS,
    REVERSA_CORE_CFG.SHEETS.ETIQUETAS,
    REVERSA_CORE_CFG.SHEETS.REVERSAS,
    REVERSA_CORE_CFG.SHEETS.COLETAS,
    REVERSA_CORE_CFG.SHEETS.COLETA_ITENS,
    REVERSA_CORE_CFG.SHEETS.EVENTOS,
    REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS,
    REVERSA_CORE_CFG.SHEETS.PARAMETROS,
    REVERSA_CORE_CFG.SHEETS.AUX_LISTAS
  ];

  requiredSheets.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      report.push(`❌ Aba ausente: ${name}`);
    } else {
      report.push(`✅ Aba OK: ${name}`);
    }
  });

  const unidadeRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES));
  const usuarioRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.USUARIOS));
  const etiquetaRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS));
  const reversaRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS));

  report.push(`📦 Unidades: ${unidadeRows.length}`);
  report.push(`👤 Usuários: ${usuarioRows.length}`);
  report.push(`🏷️ Etiquetas: ${etiquetaRows.length}`);
  report.push(`↩️ Reversas: ${reversaRows.length}`);

  SpreadsheetApp.getUi().alert(report.join('\n'));
}
