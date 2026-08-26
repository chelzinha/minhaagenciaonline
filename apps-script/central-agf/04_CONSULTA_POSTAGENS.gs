function centralAgfLerParametrosConsulta_() {
  const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
  const ss = SpreadsheetApp.openById(queryId);
  const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.PARAMS);
  if (!sheet) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.PARAMS);
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  const params = {};
  values.slice(1).forEach(function(row) {
    const key = centralAgfNormalizeText_(row[0]);
    if (key) params[key] = row[1];
  });
  return {
    start: centralAgfParseDate_(params.DATA_INICIO),
    end: centralAgfParseDate_(params.DATA_FIM),
    center: centralAgfNormalizeText_(params.CENTRO_ID || 'TODOS'),
    local: centralAgfNormalizeText_(params.LOCAL_ID || 'TODOS'),
    client: String(params.CLIENTE_ID || '').trim(),
    group: String(params.GRUPO_ANALITICO_ID || '').trim(),
    mode: centralAgfNormalizeText_(params.MODO || CENTRAL_AGF_CFG.QUERY.DEFAULT_MODE)
  };
}

function centralAgfParticaoInterseca_(partition, start, end) {
  if (!partition.start || !partition.end) return true;
  if (start && partition.end < start) return false;
  if (end && partition.start > end) return false;
  return true;
}

function centralAgfRowMatches_(row, map, params) {
  const date = centralAgfParseDate_(row[map.DATA]);
  if (params.start && (!date || date < params.start)) return false;
  if (params.end && (!date || date > params.end)) return false;

  const centerFinal = map.CENTRO_ID_FINAL == null ? '' : centralAgfNormalizeText_(row[map.CENTRO_ID_FINAL]);
  const centerOrigin = map.CENTRO_ORIGEM == null ? '' : centralAgfNormalizeText_(row[map.CENTRO_ORIGEM]);
  const center = centerFinal || (CENTRAL_AGF_CFG.QUERY.ALLOW_ORIGIN_FALLBACK ? centerOrigin : '');
  if (params.center !== 'TODOS' && params.center && center !== params.center) return false;

  const localFinal = map.LOCAL_ID_FINAL == null ? '' : centralAgfNormalizeText_(row[map.LOCAL_ID_FINAL]);
  const localOrigin = map.LOCAL_ORIGEM == null ? '' : centralAgfNormalizeText_(row[map.LOCAL_ORIGEM]);
  const local = localFinal || (CENTRAL_AGF_CFG.QUERY.ALLOW_ORIGIN_FALLBACK ? localOrigin : '');
  if (params.local !== 'TODOS' && params.local && local !== params.local) return false;

  if (params.client) {
    const value = map.CLIENTE_ID == null ? '' : String(row[map.CLIENTE_ID] || '').trim();
    if (value !== params.client) return false;
  }
  if (params.group) {
    const value = map.GRUPO_ANALITICO_ID == null ? '' : String(row[map.GRUPO_ANALITICO_ID] || '').trim();
    if (value !== params.group) return false;
  }
  return true;
}

function centralAgfMaterializarPostagens() {
  return centralAgfWithScriptLock_(function() {
    const startedAt = Date.now();
    const params = centralAgfLerParametrosConsulta_();
    const partitions = centralAgfLerCatalogoParticoes_().filter(function(p) {
      return centralAgfParticaoInterseca_(p, params.start, params.end);
    });
    if (!partitions.length) throw new Error('Nenhuma partição ativa cobre o período informado.');

    const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
    const querySs = SpreadsheetApp.openById(queryId);
    const target = querySs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.POSTS);
    if (!target) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.POSTS);

    centralAgfSetPanelStatus_('PROCESSANDO', partitions.length + ' partições selecionadas.');
    centralAgfClearBelowHeader_(target);

    let canonicalHeader = null;
    let canonicalHeaderKey = '';
    let outputRow = 2;
    let totalMatched = 0;

    partitions.forEach(function(partition) {
      const sourceSs = SpreadsheetApp.openById(partition.spreadsheetId);
      const source = sourceSs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.FACTS);
      if (!source) throw new Error('Aba 01_FATOS ausente em ' + partition.name + '.');
      const values = source.getDataRange().getValues();
      if (values.length < 2) return;

      const header = values[0].map(function(v) { return String(v == null ? '' : v).trim(); });
      const headerKey = JSON.stringify(header);
      if (!canonicalHeader) {
        canonicalHeader = header;
        canonicalHeaderKey = headerKey;
        if (target.getMaxColumns() < header.length) target.insertColumnsAfter(target.getMaxColumns(), header.length - target.getMaxColumns());
        target.getRange(1, 1, 1, header.length).setValues([header]);
      } else if (headerKey !== canonicalHeaderKey) {
        throw new Error('Cabeçalhos incompatíveis na partição ' + partition.name + '. A consulta foi interrompida para evitar colunas desalinhadas.');
      }

      const map = centralAgfHeaderMap_(header);
      if (map.DATA == null) throw new Error('Coluna DATA ausente em ' + partition.name + '.');
      const filtered = [];
      for (let i = 1; i < values.length; i++) {
        if (centralAgfRowMatches_(values[i], map, params)) filtered.push(values[i]);
      }
      if (!filtered.length) return;

      totalMatched += filtered.length;
      if (totalMatched > CENTRAL_AGF_CFG.QUERY.HARD_MAX_ROWS) {
        throw new Error('Consulta excedeu o limite de segurança de ' + CENTRAL_AGF_CFG.QUERY.HARD_MAX_ROWS + ' linhas. Aplique um filtro de período/centro/local.');
      }

      for (let offset = 0; offset < filtered.length; offset += CENTRAL_AGF_CFG.QUERY.WRITE_CHUNK_ROWS) {
        const chunk = filtered.slice(offset, offset + CENTRAL_AGF_CFG.QUERY.WRITE_CHUNK_ROWS);
        centralAgfEnsureRows_(target, outputRow + chunk.length - 1);
        target.getRange(outputRow, 1, chunk.length, canonicalHeader.length).setValues(chunk);
        outputRow += chunk.length;
      }
    });

    if (target.getFilter()) target.getFilter().remove();
    if (totalMatched > 0 && canonicalHeader) target.getRange(1, 1, totalMatched + 1, canonicalHeader.length).createFilter();
    target.setFrozenRows(1);

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_('CONSULTA_PRONTA', totalMatched + ' linhas em ' + Math.round(elapsedMs / 1000) + 's.');
    return { ok: true, rows: totalMatched, partitions: partitions.length, elapsedMs: elapsedMs };
  });
}
