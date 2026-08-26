function centralAgfMaterializarClientes() {
  return centralAgfWithScriptLock_(function() {
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
    const masterSs = SpreadsheetApp.openById(masterId);
    const source = masterSs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENTS);
    if (!source) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENTS);
    const values = source.getDataRange().getValues();

    const querySs = SpreadsheetApp.openById(queryId);
    const target = querySs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.CLIENTS);
    if (!target) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.CLIENTS);
    target.clearContents();
    if (!values.length) return { ok: true, rows: 0 };
    if (target.getMaxColumns() < values[0].length) target.insertColumnsAfter(target.getMaxColumns(), values[0].length - target.getMaxColumns());
    centralAgfEnsureRows_(target, values.length);
    target.getRange(1, 1, values.length, values[0].length).setValues(values);
    target.setFrozenRows(1);
    if (target.getFilter()) target.getFilter().remove();
    if (values.length > 1) target.getRange(1, 1, values.length, values[0].length).createFilter();
    centralAgfSetPanelStatus_('CLIENTES_ATUALIZADOS', Math.max(values.length - 1, 0) + ' clientes materializados.');
    return { ok: true, rows: Math.max(values.length - 1, 0) };
  });
}

function centralAgfAtualizarVisao() {
  const params = centralAgfLerParametrosConsulta_();
  if (params.mode === 'CLIENTES') return centralAgfMaterializarClientes();
  if (params.mode === 'POSTAGENS') return centralAgfMaterializarPostagens();
  throw new Error('MODO não suportado no V1: ' + params.mode + '. Use CLIENTES ou POSTAGENS.');
}
