function centralAgfLerCatalogoParticoes_() {
  const controlId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.CONTROL_SPREADSHEET_ID);
  const ss = SpreadsheetApp.openById(controlId);
  const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.PARTITION_CATALOG_SOURCE);
  if (!sheet) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.PARTITION_CATALOG_SOURCE);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const map = centralAgfHeaderMap_(values[0]);
  const required = ['ANO_MES', 'NOME_ARQUIVO', 'SPREADSHEET_ID', 'DATA_INICIO', 'DATA_FIM', 'STATUS'];
  required.forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatória ausente no catálogo: ' + name);
  });

  const seen = {};
  return values.slice(1).filter(function(row) {
    return centralAgfNormalizeText_(row[map.STATUS]) === 'ATIVA';
  }).map(function(row) {
    const anoMes = String(row[map.ANO_MES] || '').trim();
    if (!anoMes) throw new Error('Partição sem ANO_MES.');
    if (seen[anoMes]) throw new Error('Partição duplicada no catálogo: ' + anoMes);
    seen[anoMes] = true;
    return {
      anoMes: anoMes,
      name: String(row[map.NOME_ARQUIVO] || '').trim(),
      spreadsheetId: String(row[map.SPREADSHEET_ID] || '').trim(),
      start: centralAgfParseDate_(row[map.DATA_INICIO]),
      end: centralAgfParseDate_(row[map.DATA_FIM]),
      rows: map.QTD_LINHAS == null ? null : Number(row[map.QTD_LINHAS] || 0),
      billing: map.FATURAMENTO_LEGADO == null ? (map.FATURAMENTO == null ? null : Number(row[map.FATURAMENTO] || 0)) : Number(row[map.FATURAMENTO_LEGADO] || 0),
      status: String(row[map.STATUS] || '')
    };
  }).sort(function(a, b) {
    return a.anoMes.localeCompare(b.anoMes);
  });
}

function centralAgfSincronizarCatalogoParticoes() {
  return centralAgfWithScriptLock_(function() {
    const items = centralAgfLerCatalogoParticoes_();
    const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(queryId);
    const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.PARTITION_CATALOG_VIEW);
    if (!sheet) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.PARTITION_CATALOG_VIEW);

    const out = [['ANO_MES', 'NOME_ARQUIVO', 'SPREADSHEET_ID', 'DATA_INICIO', 'DATA_FIM', 'QTD_LINHAS', 'FATURAMENTO', 'STATUS']];
    items.forEach(function(p) {
      out.push([p.anoMes, p.name, p.spreadsheetId, p.start, p.end, p.rows, p.billing, p.status]);
    });

    sheet.clearContents();
    centralAgfEnsureRows_(sheet, out.length);
    sheet.getRange(1, 1, out.length, out[0].length).setValues(out);
    sheet.setFrozenRows(1);
    centralAgfSetPanelStatus_('CATALOGO_ATUALIZADO', items.length + ' partições ativas.');
    return { ok: true, partitions: items.length };
  });
}
