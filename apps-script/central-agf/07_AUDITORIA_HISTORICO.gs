function centralAgfNumero_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  const text = String(value == null ? '' : value).trim();
  if (!text) return 0;
  const normalized = text.indexOf(',') >= 0
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const number = Number(normalized);
  return isFinite(number) ? number : 0;
}

function centralAgfMesmoDia_(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return centralAgfDateKey_(a) === centralAgfDateKey_(b);
}

function centralAgfValidarHistorico() {
  return centralAgfWithScriptLock_(function() {
    const startedAt = Date.now();
    const partitions = centralAgfLerCatalogoParticoes_();
    if (!partitions.length) throw new Error('Nenhuma partição ativa cadastrada.');

    const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
    const querySs = SpreadsheetApp.openById(queryId);
    const target = querySs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.HOMOLOGATION);
    if (!target) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.HOMOLOGATION);

    centralAgfSetPanelStatus_('AUDITANDO_HISTORICO', partitions.length + ' partições.');

    const sroOwner = Object.create(null);
    const fatoOwner = Object.create(null);
    const results = [];
    let totalRows = 0;
    let totalBilling = 0;
    let totalSpecial = 0;
    let totalOtherNoSro = 0;

    partitions.forEach(function(partition, partitionIndex) {
      const sourceSs = SpreadsheetApp.openById(partition.spreadsheetId);
      const source = sourceSs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.FACTS);
      if (!source) throw new Error('Aba 01_FATOS ausente em ' + partition.name + '.');

      const values = source.getDataRange().getValues();
      const header = values.length ? values[0].map(function(v) { return String(v == null ? '' : v).trim(); }) : [];
      const map = centralAgfHeaderMap_(header);
      ['DATA', 'OBJETO', 'VALOR'].forEach(function(name) {
        if (map[name] == null) throw new Error('Coluna ' + name + ' ausente em ' + partition.name + '.');
      });

      const localSro = Object.create(null);
      const localFato = Object.create(null);
      const result = {
        partition: partition,
        rowsReal: Math.max(values.length - 1, 0),
        billingReal: 0,
        minDate: null,
        maxDate: null,
        realSro: 0,
        dupSroLocal: 0,
        dupSroCross: 0,
        dupFatoLocal: 0,
        dupFatoCross: 0,
        semRegistro: 0,
        produtoEct: 0,
        otherNoSro: 0,
        notes: []
      };
      results.push(result);

      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        result.billingReal += centralAgfNumero_(row[map.VALOR]);

        const date = centralAgfParseDate_(row[map.DATA]);
        if (date) {
          if (!result.minDate || date < result.minDate) result.minDate = date;
          if (!result.maxDate || date > result.maxDate) result.maxDate = date;
        }

        const object = centralAgfNormalizeText_(row[map.OBJETO]);
        if (object === 'SEM_REGISTRO') {
          result.semRegistro++;
        } else if (object === 'PRODUTO_ECT') {
          result.produtoEct++;
        } else if (CENTRAL_AGF_CFG.AUDIT.SRO_REGEX.test(object)) {
          result.realSro++;
          if (localSro[object]) {
            result.dupSroLocal++;
          } else {
            localSro[object] = true;
          }
          if (sroOwner[object] != null && sroOwner[object] !== partitionIndex) {
            result.dupSroCross++;
            results[sroOwner[object]].dupSroCross++;
          } else if (sroOwner[object] == null) {
            sroOwner[object] = partitionIndex;
          }
        } else {
          result.otherNoSro++;
        }

        if (map.FATO_ID != null) {
          const fatoId = String(row[map.FATO_ID] || '').trim();
          if (fatoId) {
            if (localFato[fatoId]) {
              result.dupFatoLocal++;
            } else {
              localFato[fatoId] = true;
            }
            if (fatoOwner[fatoId] != null && fatoOwner[fatoId] !== partitionIndex) {
              result.dupFatoCross++;
              results[fatoOwner[fatoId]].dupFatoCross++;
            } else if (fatoOwner[fatoId] == null) {
              fatoOwner[fatoId] = partitionIndex;
            }
          }
        }
      }

      totalRows += result.rowsReal;
      totalBilling += result.billingReal;
      totalSpecial += result.semRegistro + result.produtoEct;
      totalOtherNoSro += result.otherNoSro;
    });

    const headerOut = [
      'ANO_MES', 'NOME_ARQUIVO',
      'LINHAS_CATALOGO', 'LINHAS_REAIS', 'STATUS_LINHAS',
      'FATURAMENTO_CATALOGO', 'FATURAMENTO_REAL', 'DIF_FATURAMENTO', 'STATUS_FATURAMENTO',
      'DATA_INICIO_CATALOGO', 'DATA_MIN_REAL', 'DATA_FIM_CATALOGO', 'DATA_MAX_REAL', 'STATUS_PERIODO',
      'SRO_REAIS', 'SRO_DUP_NA_PARTICAO', 'SRO_DUP_ENTRE_PARTICOES',
      'FATO_ID_DUP_NA_PARTICAO', 'FATO_ID_DUP_ENTRE_PARTICOES',
      'SEM_REGISTRO', 'PRODUTO_ECT', 'OUTROS_SEM_SRO',
      'STATUS_GERAL', 'OBSERVACAO'
    ];

    const out = [headerOut];
    let okCount = 0;
    let alertCount = 0;

    results.forEach(function(r) {
      const p = r.partition;
      const rowsOk = p.rows == null || Number(p.rows) === r.rowsReal;
      const billingDiff = p.billing == null ? 0 : Math.round((r.billingReal - Number(p.billing)) * 100) / 100;
      const billingOk = p.billing == null || Math.abs(billingDiff) <= CENTRAL_AGF_CFG.AUDIT.BILLING_TOLERANCE;
      const periodOk = centralAgfMesmoDia_(p.start, r.minDate) && centralAgfMesmoDia_(p.end, r.maxDate);
      const identityOk = r.dupSroLocal === 0 && r.dupSroCross === 0 && r.dupFatoLocal === 0 && r.dupFatoCross === 0;
      const generalOk = rowsOk && billingOk && periodOk && identityOk;

      if (generalOk) okCount++; else alertCount++;
      if (!rowsOk) r.notes.push('contagem diferente do catálogo');
      if (!billingOk) r.notes.push('faturamento diferente do catálogo');
      if (!periodOk) r.notes.push('período real diferente do catálogo');
      if (!identityOk) r.notes.push('duplicidade técnica/SRO detectada');
      if (r.otherNoSro) r.notes.push(r.otherNoSro + ' objetos sem padrão SRO/especial');

      out.push([
        p.anoMes, p.name,
        p.rows, r.rowsReal, rowsOk ? 'OK' : 'DIVERGENTE',
        p.billing, Math.round(r.billingReal * 100) / 100, billingDiff, billingOk ? 'OK' : 'DIVERGENTE',
        p.start, r.minDate, p.end, r.maxDate, periodOk ? 'OK' : 'DIVERGENTE',
        r.realSro, r.dupSroLocal, r.dupSroCross,
        r.dupFatoLocal, r.dupFatoCross,
        r.semRegistro, r.produtoEct, r.otherNoSro,
        generalOk ? 'OK' : 'REVISAR', r.notes.join('; ')
      ]);
    });

    out.push([
      'TOTAL', partitions.length + ' PARTICOES',
      '', totalRows, '',
      '', Math.round(totalBilling * 100) / 100, '', '',
      '', '', '', '', '',
      '', '', '', '', '',
      '', totalSpecial, totalOtherNoSro,
      alertCount === 0 ? 'OK' : 'REVISAR', okCount + ' partições OK; ' + alertCount + ' com alerta.'
    ]);

    target.clearContents();
    centralAgfEnsureRows_(target, out.length);
    if (target.getMaxColumns() < headerOut.length) {
      target.insertColumnsAfter(target.getMaxColumns(), headerOut.length - target.getMaxColumns());
    }
    target.getRange(1, 1, out.length, headerOut.length).setValues(out);
    target.setFrozenRows(1);
    if (target.getFilter()) target.getFilter().remove();
    if (out.length > 1) target.getRange(1, 1, out.length, headerOut.length).createFilter();
    target.autoResizeColumns(1, Math.min(headerOut.length, 12));

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      alertCount === 0 ? 'HISTORICO_HOMOLOGADO' : 'HISTORICO_COM_ALERTAS',
      totalRows + ' fatos auditados em ' + Math.round(elapsedMs / 1000) + 's; ' + alertCount + ' partições com alerta.'
    );

    return {
      ok: alertCount === 0,
      partitions: partitions.length,
      rows: totalRows,
      billing: Math.round(totalBilling * 100) / 100,
      alerts: alertCount,
      elapsedMs: elapsedMs
    };
  });
}
