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

/**
 * Audita a copia mensal derivada do legado contra o catalogo atual.
 * IMPORTANTE: isto NAO comprova reconciliacao contra os arquivos fonte
 * do Consolidador. A reconciliacao da fonte vive em 09_RECONCILIACAO_FONTES.
 */
function centralAgfValidarHistorico() {
  return centralAgfWithScriptLock_(function() {
    const startedAt = Date.now();
    const partitions = centralAgfLerCatalogoParticoes_();
    if (!partitions.length) throw new Error('Nenhuma partição ativa cadastrada.');

    const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
    const querySs = SpreadsheetApp.openById(queryId);
    const target = querySs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.HOMOLOGATION);
    if (!target) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.HOMOLOGATION);

    centralAgfSetPanelStatus_('AUDITANDO_PARTICOES_LEGADO', partitions.length + ' partições.');

    const sroOwner = Object.create(null);
    const fatoOwner = Object.create(null);
    const results = [];
    let totalRows = 0;
    let totalBilling = 0;
    let totalSemRegistro = 0;
    let totalProdutoEct = 0;
    let totalOtherNoSro = 0;
    let totalSro = 0;
    let totalDupSroLocal = 0;
    let totalDupSroCrossLater = 0;
    let totalDupFatoLocal = 0;
    let totalDupFatoCrossLater = 0;

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
            totalDupSroCrossLater++;
          } else if (sroOwner[object] == null) {
            sroOwner[object] = partitionIndex;
          }
        } else if (object) {
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
              totalDupFatoCrossLater++;
            } else if (fatoOwner[fatoId] == null) {
              fatoOwner[fatoId] = partitionIndex;
            }
          }
        }
      }

      totalRows += result.rowsReal;
      totalBilling += result.billingReal;
      totalSemRegistro += result.semRegistro;
      totalProdutoEct += result.produtoEct;
      totalOtherNoSro += result.otherNoSro;
      totalSro += result.realSro;
      totalDupSroLocal += result.dupSroLocal;
      totalDupFatoLocal += result.dupFatoLocal;
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
    let legacyOkCount = 0;
    let alertCount = 0;

    results.forEach(function(r) {
      const p = r.partition;
      const rowsOk = p.rows == null || Number(p.rows) === r.rowsReal;
      const billingDiff = p.billing == null ? 0 : Math.round((r.billingReal - Number(p.billing)) * 100) / 100;
      const billingOk = p.billing == null || Math.abs(billingDiff) <= CENTRAL_AGF_CFG.AUDIT.BILLING_TOLERANCE;
      const periodOk = centralAgfMesmoDia_(p.start, r.minDate) && centralAgfMesmoDia_(p.end, r.maxDate);
      const duplicateAlert = r.dupSroLocal > 0 || r.dupSroCross > 0 || r.dupFatoLocal > 0 || r.dupFatoCross > 0;
      const legacyOk = rowsOk && billingOk && periodOk && !duplicateAlert;

      if (legacyOk) legacyOkCount++; else alertCount++;
      if (!rowsOk) r.notes.push('contagem diferente do catálogo legado');
      if (!billingOk) r.notes.push('faturamento diferente do catálogo legado');
      if (!periodOk) r.notes.push('período real diferente do catálogo legado');
      if (duplicateAlert) r.notes.push('SRO/FATO_ID repetido: preservar fatos e reconciliar com fonte; não deduplicar automaticamente');
      if (r.otherNoSro) r.notes.push(r.otherNoSro + ' objetos sem padrão SRO/especial');
      if (legacyOk) r.notes.push('cópia interna consistente; reconciliação com Consolidador ainda é etapa separada');

      out.push([
        p.anoMes, p.name,
        p.rows, r.rowsReal, rowsOk ? 'OK' : 'DIVERGENTE',
        p.billing, Math.round(r.billingReal * 100) / 100, billingDiff, billingOk ? 'OK' : 'DIVERGENTE',
        p.start, r.minDate, p.end, r.maxDate, periodOk ? 'OK' : 'DIVERGENTE',
        r.realSro, r.dupSroLocal, r.dupSroCross,
        r.dupFatoLocal, r.dupFatoCross,
        r.semRegistro, r.produtoEct, r.otherNoSro,
        legacyOk ? 'OK_LEGADO' : 'REVISAR', r.notes.join('; ')
      ]);
    });

    out.push([
      'TOTAL', partitions.length + ' PARTICOES',
      '', totalRows, '',
      '', Math.round(totalBilling * 100) / 100, '', '',
      '', '', '', '', '',
      totalSro, totalDupSroLocal, totalDupSroCrossLater,
      totalDupFatoLocal, totalDupFatoCrossLater,
      totalSemRegistro, totalProdutoEct, totalOtherNoSro,
      alertCount === 0 ? 'OK_LEGADO' : 'REVISAR',
      legacyOkCount + ' partições internamente consistentes; ' + alertCount + ' com alerta. Fonte Consolidador deve ser reconciliada em 09_RECONCILIACAO_FONTES.'
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
      alertCount === 0 ? 'PARTICOES_LEGADO_AUDITADAS' : 'PARTICOES_LEGADO_COM_ALERTAS',
      totalRows + ' fatos auditados em ' + Math.round(elapsedMs / 1000) + 's; ' + alertCount + ' partições com alerta. Reconciliação de fonte continua obrigatória.'
    );

    return {
      okLegacy: alertCount === 0,
      sourceReconciled: false,
      partitions: partitions.length,
      rows: totalRows,
      billing: Math.round(totalBilling * 100) / 100,
      alerts: alertCount,
      elapsedMs: elapsedMs
    };
  });
}
