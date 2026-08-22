function centralAgfNomeBasicoNormalizado_(value) {
  let text = String(value == null ? '' : value).trim().toUpperCase();
  if (!text) return '';
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (err) {
    // Apps Script V8 suporta normalize; fallback mantém o texto original.
  }
  return text
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function centralAgfAddDistinct_(map, value) {
  const text = String(value == null ? '' : value).trim();
  if (text) map[text] = true;
}

function centralAgfDistinctList_(map, limit) {
  const values = Object.keys(map || {}).sort();
  const max = limit || 8;
  if (values.length <= max) return values.join(' | ');
  return values.slice(0, max).join(' | ') + ' | +' + (values.length - max) + ' outros';
}

function centralAgfAssertHistoricoHomologado_() {
  const queryId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.QUERY_SPREADSHEET_ID);
  const ss = SpreadsheetApp.openById(queryId);
  const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.HOMOLOGATION);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('Auditoria histórica ainda não executada. Rode centralAgfValidarHistorico() primeiro.');
  }
  const values = sheet.getDataRange().getValues();
  const map = centralAgfHeaderMap_(values[0]);
  if (map.STATUS_GERAL == null || map.ANO_MES == null) {
    throw new Error('07_HOMOLOGACAO ainda não contém o resultado estruturado da auditoria.');
  }
  const alerts = values.slice(1).filter(function(row) {
    const key = centralAgfNormalizeText_(row[map.ANO_MES]);
    if (!key || key === 'TOTAL') return false;
    return centralAgfNormalizeText_(row[map.STATUS_GERAL]) !== 'OK';
  });
  if (alerts.length) {
    throw new Error('Histórico possui ' + alerts.length + ' partições com alerta. Corrija/homologue antes do diagnóstico de identidade.');
  }
}

function centralAgfClassificarIdentidade_(row, map) {
  const remetente = map.NOME_REMETENTE == null ? '' : String(row[map.NOME_REMETENTE] || '').trim();
  const razao = map.RAZAO_SOCIAL == null ? '' : String(row[map.RAZAO_SOCIAL] || '').trim();
  const centerOrigin = map.CENTRO_ORIGEM == null ? '' : centralAgfNormalizeText_(row[map.CENTRO_ORIGEM]);
  const centerFinal = map.CENTRO_ID_FINAL == null ? '' : centralAgfNormalizeText_(row[map.CENTRO_ID_FINAL]);
  const razaoNorm = centralAgfNomeBasicoNormalizado_(razao);

  const balcaoNorm = centralAgfNomeBasicoNormalizado_(CENTRAL_AGF_CFG.IDENTITY.AGF_COUNTER_NAME);
  const metroSharedNorm = centralAgfNomeBasicoNormalizado_(CENTRAL_AGF_CFG.IDENTITY.METRO_SHARED_NAME);

  if (razaoNorm === balcaoNorm) {
    return {
      type: 'AGF_BALCAO_REMETENTE',
      centerSuggested: 'CTR_AGF',
      centerRule: 'RAZAO_SOCIAL_BALCAO',
      rawName: remetente,
      normalizedName: centralAgfNomeBasicoNormalizado_(remetente),
      status: remetente ? 'PRECISA_LIMPEZA_NOME' : 'SEM_NOME_REMETENTE'
    };
  }

  if (razaoNorm === metroSharedNorm) {
    return {
      type: 'METRO_REMETENTE',
      centerSuggested: 'CTR_METRO',
      centerRule: 'RAZAO_SOCIAL_GAS_SHOPPING_METRO',
      rawName: remetente,
      normalizedName: centralAgfNomeBasicoNormalizado_(remetente),
      status: remetente ? 'PRECISA_VALIDAR_ALIAS' : 'SEM_NOME_REMETENTE'
    };
  }

  const center = centerFinal || centerOrigin;
  if (center === 'AGF' || center === 'CTR_AGF') {
    return {
      type: 'AGF_RAZAO_SOCIAL',
      centerSuggested: 'CTR_AGF',
      centerRule: centerFinal ? 'CENTRO_FINAL_EXISTENTE' : 'CENTRO_ORIGEM_PROVISORIO',
      rawName: razao,
      normalizedName: centralAgfNomeBasicoNormalizado_(razao),
      status: razao ? 'CANDIDATO_MASTER_AGF' : 'SEM_RAZAO_SOCIAL'
    };
  }

  if (center === 'METRO' || center === 'CTR_METRO') {
    return {
      type: 'METRO_REMETENTE',
      centerSuggested: 'CTR_METRO',
      centerRule: centerFinal ? 'CENTRO_FINAL_EXISTENTE' : 'CENTRO_ORIGEM_PROVISORIO',
      rawName: remetente,
      normalizedName: centralAgfNomeBasicoNormalizado_(remetente),
      status: remetente ? 'PRECISA_VALIDAR_ALIAS' : 'SEM_NOME_REMETENTE'
    };
  }

  return {
    type: 'INDEFINIDO',
    centerSuggested: '',
    centerRule: 'SEM_REGRA_FORTE',
    rawName: razao || remetente,
    normalizedName: centralAgfNomeBasicoNormalizado_(razao || remetente),
    status: 'REVISAR'
  };
}

function centralAgfGerarDiagnosticoIdentidade() {
  return centralAgfWithScriptLock_(function() {
    centralAgfAssertHistoricoHomologado_();
    const startedAt = Date.now();
    const partitions = centralAgfLerCatalogoParticoes_();
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const masterSs = SpreadsheetApp.openById(masterId);
    const target = masterSs.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_IDENTITY_DIAGNOSTIC);
    if (!target) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.MASTER_IDENTITY_DIAGNOSTIC);

    centralAgfSetPanelStatus_('DIAGNOSTICANDO_IDENTIDADE', partitions.length + ' partições.');

    const groups = Object.create(null);
    let sourceRows = 0;
    let eligibleRows = 0;
    let skippedSpecial = 0;
    let skippedOtherNoSro = 0;

    partitions.forEach(function(partition) {
      const ss = SpreadsheetApp.openById(partition.spreadsheetId);
      const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.FACTS);
      if (!sheet) throw new Error('Aba 01_FATOS ausente em ' + partition.name + '.');
      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return;
      const map = centralAgfHeaderMap_(values[0]);
      ['DATA', 'OBJETO', 'QTD', 'VALOR', 'NOME_REMETENTE', 'RAZAO_SOCIAL'].forEach(function(name) {
        if (map[name] == null) throw new Error('Coluna ' + name + ' ausente em ' + partition.name + '.');
      });

      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        sourceRows++;

        const object = centralAgfNormalizeText_(row[map.OBJETO]);
        if (CENTRAL_AGF_CFG.AUDIT.SPECIAL_OBJECTS.indexOf(object) >= 0) {
          skippedSpecial++;
          continue;
        }
        if (!CENTRAL_AGF_CFG.AUDIT.SRO_REGEX.test(object)) {
          skippedOtherNoSro++;
          continue;
        }
        eligibleRows++;

        const classified = centralAgfClassificarIdentidade_(row, map);
        const norm = classified.normalizedName || '(SEM_NOME)';
        const key = classified.type + '|' + classified.centerSuggested + '|' + norm;
        let item = groups[key];
        if (!item) {
          item = groups[key] = {
            key: key,
            type: classified.type,
            centerSuggested: classified.centerSuggested,
            centerRules: Object.create(null),
            normalizedName: classified.normalizedName,
            rawVariants: Object.create(null),
            razaoVariants: Object.create(null),
            remetenteVariants: Object.create(null),
            centersOrigin: Object.create(null),
            localsOrigin: Object.create(null),
            attendants: Object.create(null),
            count: 0,
            qty: 0,
            billing: 0,
            firstDate: null,
            lastDate: null,
            statuses: Object.create(null)
          };
        }

        item.count++;
        item.qty += centralAgfNumero_(row[map.QTD]);
        item.billing += centralAgfNumero_(row[map.VALOR]);
        centralAgfAddDistinct_(item.centerRules, classified.centerRule);
        centralAgfAddDistinct_(item.rawVariants, classified.rawName);
        centralAgfAddDistinct_(item.razaoVariants, row[map.RAZAO_SOCIAL]);
        centralAgfAddDistinct_(item.remetenteVariants, row[map.NOME_REMETENTE]);
        if (map.CENTRO_ORIGEM != null) centralAgfAddDistinct_(item.centersOrigin, row[map.CENTRO_ORIGEM]);
        if (map.LOCAL_ORIGEM != null) centralAgfAddDistinct_(item.localsOrigin, row[map.LOCAL_ORIGEM]);
        if (map.ATENDENTE_ORIGEM != null) centralAgfAddDistinct_(item.attendants, row[map.ATENDENTE_ORIGEM]);
        centralAgfAddDistinct_(item.statuses, classified.status);

        const date = centralAgfParseDate_(row[map.DATA]);
        if (date) {
          if (!item.firstDate || date < item.firstDate) item.firstDate = date;
          if (!item.lastDate || date > item.lastDate) item.lastDate = date;
        }
      }
    });

    const items = Object.keys(groups).map(function(key) { return groups[key]; });
    items.sort(function(a, b) {
      const typeCmp = a.type.localeCompare(b.type);
      if (typeCmp) return typeCmp;
      return b.billing - a.billing;
    });

    const header = [
      'CHAVE_DIAGNOSTICO', 'TIPO_IDENTIDADE', 'CENTRO_SUGERIDO', 'ORIGEM_SUGESTAO_CENTRO',
      'NOME_NORMALIZADO', 'VARIANTES_NOME', 'QTD_VARIANTES_NOME',
      'RAZOES_SOCIAIS_OBSERVADAS', 'REMETENTES_OBSERVADOS',
      'OCORRENCIAS', 'QTD_TOTAL', 'FATURAMENTO_TOTAL', 'PRIMEIRA_POSTAGEM', 'ULTIMA_POSTAGEM',
      'CENTROS_ORIGEM_OBSERVADOS', 'LOCAIS_ORIGEM_OBSERVADOS', 'ATENDENTES_OBSERVADOS', 'STATUS_DIAGNOSTICO'
    ];
    const out = [header];

    items.forEach(function(item) {
      out.push([
        item.key,
        item.type,
        item.centerSuggested,
        centralAgfDistinctList_(item.centerRules, 5),
        item.normalizedName,
        centralAgfDistinctList_(item.rawVariants, 8),
        Object.keys(item.rawVariants).length,
        centralAgfDistinctList_(item.razaoVariants, 6),
        centralAgfDistinctList_(item.remetenteVariants, 8),
        item.count,
        item.qty,
        Math.round(item.billing * 100) / 100,
        item.firstDate,
        item.lastDate,
        centralAgfDistinctList_(item.centersOrigin, 5),
        centralAgfDistinctList_(item.localsOrigin, 8),
        centralAgfDistinctList_(item.attendants, 8),
        centralAgfDistinctList_(item.statuses, 5)
      ]);
    });

    target.clearContents();
    centralAgfEnsureRows_(target, out.length);
    if (target.getMaxColumns() < header.length) {
      target.insertColumnsAfter(target.getMaxColumns(), header.length - target.getMaxColumns());
    }
    target.getRange(1, 1, out.length, header.length).setValues(out);
    target.setFrozenRows(1);
    if (target.getFilter()) target.getFilter().remove();
    if (out.length > 1) target.getRange(1, 1, out.length, header.length).createFilter();

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      'DIAGNOSTICO_IDENTIDADE_PRONTO',
      items.length + ' candidatos; ' + eligibleRows + ' fatos SRO elegíveis; ' + skippedSpecial + ' especiais excluídos; ' + skippedOtherNoSro + ' outros sem SRO.'
    );

    return {
      ok: true,
      candidates: items.length,
      sourceRows: sourceRows,
      eligibleRows: eligibleRows,
      skippedSpecial: skippedSpecial,
      skippedOtherNoSro: skippedOtherNoSro,
      elapsedMs: elapsedMs
    };
  });
}
