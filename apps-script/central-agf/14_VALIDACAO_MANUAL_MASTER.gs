function centralAgfValidationHashId_(seed) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(seed || ''),
    Utilities.Charset.UTF_8
  );
  const hex = digest.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('').toUpperCase();
  return 'CAS_' + hex.slice(0, 16);
}

function centralAgfValidationAdd_(bucket, value) {
  const text = String(value == null ? '' : value).trim();
  if (text) bucket[text] = true;
}

function centralAgfValidationAddList_(bucket, value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return;
  text.split('|').map(function(part) { return part.trim(); }).filter(Boolean).forEach(function(part) {
    bucket[part] = true;
  });
}

function centralAgfValidationList_(bucket, limit) {
  const values = Object.keys(bucket || {}).sort(function(a, b) {
    return a.localeCompare(b, 'pt-BR');
  });
  const max = Number(limit || 20);
  if (values.length <= max) return values.join(' | ');
  return values.slice(0, max).join(' | ') + ' | +' + (values.length - max) + ' outros';
}

function centralAgfValidationCaseFromRows_(rows, type, keySeed) {
  const data = {
    ids: Object.create(null),
    types: Object.create(null),
    names: Object.create(null),
    reasons: Object.create(null),
    finalNames: Object.create(null),
    contractsOrigin: Object.create(null),
    contractsResolved: Object.create(null),
    portalReasons: Object.create(null),
    resolution999: Object.create(null),
    motives: Object.create(null),
    occurrences: 0,
    billing: 0,
    center: ''
  };

  rows.forEach(function(item) {
    if (!data.center) data.center = item.center;
    centralAgfValidationAdd_(data.ids, item.clientId);
    centralAgfValidationAdd_(data.types, item.identityType);
    centralAgfValidationAdd_(data.names, item.currentName);
    centralAgfValidationAdd_(data.reasons, item.currentReason);
    centralAgfValidationAdd_(data.finalNames, item.finalName);
    centralAgfValidationAddList_(data.contractsOrigin, item.contractsOrigin);
    centralAgfValidationAddList_(data.contractsResolved, item.contractsResolved);
    centralAgfValidationAddList_(data.portalReasons, item.portalReasons);
    centralAgfValidationAddList_(data.resolution999, item.resolution999);
    centralAgfValidationAddList_(data.motives, item.motives);
    data.occurrences += Number(item.occurrences || 0);
    data.billing += Number(item.billing || 0);
  });

  let action;
  if (type === 'COLISAO_NOME_FINAL+AUTORIDADE_MULTIPLA') {
    action = 'VALIDAR SE AS IDENTIDADES SAO O MESMO CLIENTE E QUAL RAZAO SOCIAL DEVE PREVALECER. SE FOR O MESMO CLIENTE, INFORMAR CLIENTE_ID_MANTER.';
  } else if (type === 'COLISAO_NOME_FINAL') {
    action = 'VALIDAR SE AS IDENTIDADES SAO O MESMO CLIENTE. SE SIM, INFORMAR CLIENTE_ID_MANTER; SE NAO, MARCAR CLIENTES_DIFERENTES.';
  } else if (type === 'AUTORIDADE_MULTIPLA') {
    action = 'CONFIRMAR QUAL RAZAO SOCIAL REPRESENTA O CLIENTE. MANTER COMO ESTA, CORRIGIR NOME OU MARCAR PRECISA_VERIFICAR.';
  } else {
    action = 'REVISAR A EVIDENCIA E REGISTRAR A DECISAO MANUAL SEM ALTERAR OS FATOS HISTORICOS.';
  }

  return {
    caseId: centralAgfValidationHashId_('CENTRAL_AGF_VALIDACAO_MASTER_V1|' + keySeed),
    active: 'SIM',
    type: type,
    center: data.center,
    rowCount: rows.length,
    clientIds: centralAgfValidationList_(data.ids, 30),
    identityTypes: centralAgfValidationList_(data.types, 10),
    currentNames: centralAgfValidationList_(data.names, 20),
    currentReasons: centralAgfValidationList_(data.reasons, 20),
    finalNames: centralAgfValidationList_(data.finalNames, 20),
    contractsOrigin: centralAgfValidationList_(data.contractsOrigin, 20),
    contractsResolved: centralAgfValidationList_(data.contractsResolved, 20),
    portalReasons: centralAgfValidationList_(data.portalReasons, 20),
    resolution999: centralAgfValidationList_(data.resolution999, 20),
    motives: centralAgfValidationList_(data.motives, 20),
    occurrences: data.occurrences,
    billing: Math.round(data.billing * 100) / 100,
    action: action
  };
}

function centralAgfValidationReadExisting_(sheet, header) {
  const byCaseId = Object.create(null);
  if (!sheet || sheet.getLastRow() < 2) return byCaseId;

  const values = sheet.getDataRange().getValues();
  const existingHeader = values[0].map(function(value) { return String(value || '').trim(); });
  const expected = header.join('|');
  const actual = existingHeader.slice(0, header.length).join('|');
  if (expected !== actual) {
    throw new Error(
      '26_VALIDACAO_MANUAL_MASTER possui cabecalho diferente do esperado. ' +
      'Nao alterei a aba para preservar decisoes humanas existentes.'
    );
  }

  values.slice(1).forEach(function(row) {
    const caseId = String(row[0] || '').trim();
    if (!caseId) return;
    byCaseId[caseId] = row.slice(0, header.length);
  });
  return byCaseId;
}

function centralAgfValidationHumanFields_(existingRow) {
  if (!existingRow) {
    return ['', '', '', '', '', 'PENDENTE', '', ''];
  }
  return existingRow.slice(18, 26);
}

function centralAgfValidationApplyLayout_(sheet, rowCount) {
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);
  sheet.setHiddenGridlines(true);

  const filter = sheet.getFilter();
  if (filter) filter.remove();
  if (rowCount > 0) {
    sheet.getRange(1, 1, rowCount + 1, 26).createFilter();
  }

  sheet.getRange(1, 1, 1, 26)
    .setFontWeight('bold')
    .setWrap(true)
    .setVerticalAlignment('middle');

  if (rowCount > 0) {
    sheet.getRange(2, 1, rowCount, 26).setVerticalAlignment('top');
    sheet.getRange(2, 8, rowCount, 8).setWrap(true);
    sheet.getRange(2, 18, rowCount, 6).setWrap(true);
    sheet.getRange(2, 19, rowCount, 8).setBackground('#FFF8E1');
    sheet.getRange(2, 16, rowCount, 1).setNumberFormat('0');
    sheet.getRange(2, 17, rowCount, 1).setNumberFormat('R$ #,##0.00');

    const decisionRule = SpreadsheetApp.newDataValidation()
      .requireValueInList([
        'MESMO_CLIENTE',
        'CLIENTES_DIFERENTES',
        'MANTER_COMO_ESTA',
        'CORRIGIR_NOME',
        'PRECISA_VERIFICAR'
      ], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, 19, rowCount, 1).setDataValidation(decisionRule);

    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['PENDENTE', 'VALIDADO', 'PRECISA_VERIFICAR'], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, 24, rowCount, 1).setDataValidation(statusRule);
  }

  const widths = [150, 80, 190, 100, 80, 280, 180, 280, 280, 280, 260, 260, 280, 230, 280, 110, 140, 330, 190, 260, 260, 260, 300, 150, 150, 150];
  widths.forEach(function(width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  sheet.getRange('S1').setNote('DECISAO_MANUAL: escolha uma das opcoes do dropdown. A decisao e persistente e nao e apagada ao sincronizar a fila.');
  sheet.getRange('T1').setNote('Preencher somente quando a decisao for MESMO_CLIENTE e houver mais de um CLIENTE_ID envolvido.');
  sheet.getRange('U1').setNote('Nome de exibicao confirmado manualmente, quando necessario.');
  sheet.getRange('V1').setNote('Razao social confirmada manualmente, quando aplicavel.');
  sheet.getRange('X1').setNote('Marque VALIDADO quando a decisao estiver completa; PRECISA_VERIFICAR quando depender de evidencia externa.');
}

/**
 * Cria/sincroniza a fila persistente de validacao humana do Cadastro Mestre.
 * A fonte e 24_AUDITORIA_QUALIDADE_MASTER, mas as colunas humanas da aba 26
 * nunca sao apagadas numa reexecucao. Casos que deixarem de estar ativos sao
 * preservados com ATIVO_NA_AUDITORIA=NAO para manter rastreabilidade.
 *
 * Esta rotina nao escreve em 01_CLIENTES_MASTER, 04_CLIENTES_CENTRO_LOCAL nem
 * nos fatos mensais.
 */
function centralAgfPrepararValidacaoManualMaster() {
  return centralAgfWithScriptLock_(function() {
    centralAgfAssertHistoricoHomologado_();
    const startedAt = Date.now();
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(masterId);

    const auditSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_QUALITY_AUDIT);
    if (!auditSheet || auditSheet.getLastRow() < 2) {
      throw new Error('24_AUDITORIA_QUALIDADE_MASTER vazia. Execute centralAgfAuditarQualidadePropostaMaster() primeiro.');
    }

    const values = auditSheet.getDataRange().getValues();
    const map = centralAgfHeaderMap_(values[0]);
    [
      'CLIENTE_ID_PROPOSTO', 'CENTRO_ID_PRINCIPAL', 'TIPO_IDENTIDADE_ORIGEM',
      'NOME_EXIBICAO_ATUAL', 'RAZAO_SOCIAL_ATUAL', 'CONTRATOS_OBSERVADOS_ORIGEM',
      'CONTRATOS_RESOLVIDOS', 'RESOLUCAO_999_POR_CARTAO', 'RAZOES_PORTAL_POSTAL_CONTRATOS',
      'NOME_FINAL_SUGERIDO', 'STATUS_QUALIDADE', 'MOTIVOS',
      'OCORRENCIAS_REFERENCIA', 'FATURAMENTO_REFERENCIA'
    ].forEach(function(name) {
      if (map[name] == null) throw new Error('Coluna obrigatoria ausente em 24_AUDITORIA_QUALIDADE_MASTER: ' + name);
    });

    const reviewRows = [];
    values.slice(1).forEach(function(row, index) {
      if (centralAgfNormalizeText_(row[map.STATUS_QUALIDADE]) !== 'REVISAR_QUALIDADE') return;
      const finalName = String(row[map.NOME_FINAL_SUGERIDO] || '').trim();
      reviewRows.push({
        sourceRow: index + 2,
        clientId: centralAgfNormalizeText_(row[map.CLIENTE_ID_PROPOSTO]),
        center: centralAgfNormalizeText_(row[map.CENTRO_ID_PRINCIPAL]),
        identityType: centralAgfNormalizeText_(row[map.TIPO_IDENTIDADE_ORIGEM]),
        currentName: String(row[map.NOME_EXIBICAO_ATUAL] || '').trim(),
        currentReason: String(row[map.RAZAO_SOCIAL_ATUAL] || '').trim(),
        contractsOrigin: String(row[map.CONTRATOS_OBSERVADOS_ORIGEM] || '').trim(),
        contractsResolved: String(row[map.CONTRATOS_RESOLVIDOS] || '').trim(),
        resolution999: String(row[map.RESOLUCAO_999_POR_CARTAO] || '').trim(),
        portalReasons: String(row[map.RAZOES_PORTAL_POSTAL_CONTRATOS] || '').trim(),
        finalName: finalName,
        finalNorm: centralAgfNomeBasicoNormalizado_(finalName),
        motives: String(row[map.MOTIVOS] || '').trim(),
        occurrences: centralAgfNumero_(row[map.OCORRENCIAS_REFERENCIA]),
        billing: centralAgfNumero_(row[map.FATURAMENTO_REFERENCIA])
      });
    });

    const collisionGroups = Object.create(null);
    reviewRows.forEach(function(item) {
      if (item.motives.indexOf('COLISAO_APOS_NOME_FINAL_SUGERIDO') < 0) return;
      const key = item.center + '|' + item.finalNorm;
      if (!collisionGroups[key]) collisionGroups[key] = [];
      collisionGroups[key].push(item);
    });

    const processedRows = Object.create(null);
    const cases = [];

    Object.keys(collisionGroups).sort().forEach(function(key) {
      const members = collisionGroups[key];
      if (members.length < 2) return;
      let hasAuthorityMultiple = false;
      members.forEach(function(item) {
        processedRows[item.sourceRow] = true;
        if (item.motives.indexOf('MULTIPLAS_RAZOES_PORTAL_POSTAL_PARA_CONTRATOS_RESOLVIDOS') >= 0) {
          hasAuthorityMultiple = true;
        }
      });
      const type = hasAuthorityMultiple
        ? 'COLISAO_NOME_FINAL+AUTORIDADE_MULTIPLA'
        : 'COLISAO_NOME_FINAL';
      cases.push(centralAgfValidationCaseFromRows_(members, type, 'COLISAO|' + key));
    });

    reviewRows.forEach(function(item) {
      if (processedRows[item.sourceRow]) return;
      const type = item.motives.indexOf('MULTIPLAS_RAZOES_PORTAL_POSTAL_PARA_CONTRATOS_RESOLVIDOS') >= 0
        ? 'AUTORIDADE_MULTIPLA'
        : 'OUTRA_PENDENCIA';
      cases.push(centralAgfValidationCaseFromRows_([item], type, 'CLIENTE|' + item.clientId));
    });

    cases.sort(function(a, b) {
      if (a.type !== b.type) return a.type.localeCompare(b.type, 'pt-BR');
      return b.billing - a.billing;
    });

    const header = [
      'CASO_ID', 'ATIVO_NA_AUDITORIA', 'TIPO_PENDENCIA', 'CENTRO_ID', 'QTD_LINHAS',
      'CLIENTE_IDS_ENVOLVIDOS', 'TIPOS_IDENTIDADE', 'NOMES_ATUAIS', 'RAZOES_SOCIAIS_ATUAIS',
      'NOMES_FINAIS_SUGERIDOS', 'CONTRATOS_ORIGEM', 'CONTRATOS_RESOLVIDOS',
      'RAZOES_PORTAL_POSTAL', 'RESOLUCAO_999', 'MOTIVOS_TECNICOS', 'OCORRENCIAS_TOTAL',
      'FATURAMENTO_TOTAL', 'ACAO_RECOMENDADA', 'DECISAO_MANUAL', 'CLIENTE_ID_MANTER',
      'NOME_EXIBICAO_CONFIRMADO', 'RAZAO_SOCIAL_CONFIRMADA', 'OBSERVACAO',
      'STATUS_VALIDACAO', 'DECIDIDO_EM', 'DECIDIDO_POR'
    ];

    const validationSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_MANUAL_VALIDATION);
    const existing = centralAgfValidationReadExisting_(validationSheet, header);
    const activeCaseIds = Object.create(null);
    const out = [header];

    cases.forEach(function(item) {
      activeCaseIds[item.caseId] = true;
      const human = centralAgfValidationHumanFields_(existing[item.caseId]);
      out.push([
        item.caseId,
        'SIM',
        item.type,
        item.center,
        item.rowCount,
        item.clientIds,
        item.identityTypes,
        item.currentNames,
        item.currentReasons,
        item.finalNames,
        item.contractsOrigin,
        item.contractsResolved,
        item.portalReasons,
        item.resolution999,
        item.motives,
        item.occurrences,
        item.billing,
        item.action
      ].concat(human));
    });

    Object.keys(existing).sort().forEach(function(caseId) {
      if (activeCaseIds[caseId]) return;
      const oldRow = existing[caseId].slice(0, 26);
      while (oldRow.length < 26) oldRow.push('');
      oldRow[1] = 'NAO';
      out.push(oldRow);
    });

    const previousLastRow = validationSheet.getLastRow();
    validationSheet.getRange(1, 1, out.length, 26).setValues(out);
    if (previousLastRow > out.length) {
      validationSheet.getRange(out.length + 1, 1, previousLastRow - out.length, 26).clearContent();
    }
    centralAgfValidationApplyLayout_(validationSheet, out.length - 1);

    const activeCases = cases.length;
    const activeRows = reviewRows.length;
    const totalBilling = Math.round(reviewRows.reduce(function(sum, item) {
      return sum + Number(item.billing || 0);
    }, 0) * 100) / 100;

    centralAgfSetPanelStatus_(
      'VALIDACAO_MANUAL_MASTER_PRONTA',
      'Casos ativos=' + activeCases + '; linhas em revisao=' + activeRows +
      '; faturamento=' + totalBilling + '. Nenhuma escrita em 01_CLIENTES_MASTER.'
    );

    return {
      ok: true,
      activeCases: activeCases,
      reviewRows: activeRows,
      billing: totalBilling,
      persistentSheet: CENTRAL_AGF_CFG.SHEETS.MASTER_MANUAL_VALIDATION,
      elapsedMs: Date.now() - startedAt
    };
  });
}
