function centralAgfAutoConfigurar() {
  const props = PropertiesService.getScriptProperties();
  let queryId = '';
  try {
    queryId = SpreadsheetApp.getActiveSpreadsheet().getId();
  } catch (err) {
    queryId = '';
  }
  if (!queryId) queryId = centralAgfFindUniqueFileIdByName_(CENTRAL_AGF_CFG.FILE_NAMES.QUERY);

  const controlId = centralAgfFindUniqueFileIdByName_(CENTRAL_AGF_CFG.FILE_NAMES.CONTROL);
  const masterId = centralAgfFindUniqueFileIdByName_(CENTRAL_AGF_CFG.FILE_NAMES.MASTER);

  props.setProperties({
    [CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID]: queryId,
    [CENTRAL_AGF_CFG.PROPS.CONTROL_SPREADSHEET_ID]: controlId,
    [CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID]: masterId
  }, false);

  centralAgfSetPanelStatus_('CONFIGURADO', 'IDs resolvidos por nome e gravados em Script Properties.');
  return centralAgfStatusConfiguracao();
}

function centralAgfStatusConfiguracao() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return {
    version: CENTRAL_AGF_CFG.VERSION,
    queryConfigured: Boolean(props[CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID]),
    controlConfigured: Boolean(props[CENTRAL_AGF_CFG.PROPS.CONTROL_SPREADSHEET_ID]),
    masterConfigured: Boolean(props[CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID])
  };
}
