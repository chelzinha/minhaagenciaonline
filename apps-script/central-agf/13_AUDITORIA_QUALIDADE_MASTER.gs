function centralAgfQualityAdd_(bucket, value) {
  const text = String(value == null ? '' : value).trim();
  if (text) bucket[text] = true;
}

function centralAgfQualityList_(bucket, limit) {
  return centralAgfDistinctList_(bucket || Object.create(null), limit || 12);
}

function centralAgfQualityContractKey_(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && isFinite(value)) {
    return String(Math.round(value));
  }

  const text = String(value).trim().replace(/\s+/g, '');
  if (!text) return '';
  if (/^[+-]?\d+(?:[.,]\d+)?[Ee][+-]?\d+$/.test(text)) {
    const parsed = Number(text.replace(',', '.'));
    return isFinite(parsed) ? String(Math.round(parsed)) : '';
  }
  if (/^\d+(?:[.,]0+)?$/.test(text)) {
    return text.replace(/[.,]0+$/, '');
  }
  const digits = text.replace(/\D/g, '');
  return digits || text;
}

function centralAgfQualityStrongClean_(value) {
  let text = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  const original = text;
  const rules = [];
  let match;

  // CNPJ completo prefixando o nome.
  match = text.match(/^\d{2}[.]\d{3}[.]\d{3}\/\d{4}-\d{2}\s*[-:–—]?\s*(.+)$/i);
  if (match && /[A-Za-zÀ-ÿ]/.test(match[1])) {
    text = match[1].trim();
    rules.push('REMOVE_CNPJ_PREFIXO');
  }

  // CNPJ sem mascara prefixando o nome.
  if (!rules.length) {
    match = text.match(/^\d{14}\s*[-:–—]?\s*(.+)$/i);
    if (match && /[A-Za-zÀ-ÿ]/.test(match[1])) {
      text = match[1].trim();
      rules.push('REMOVE_CNPJ_14_PREFIXO');
    }
  }

  // Raiz de CNPJ/codigo cadastral no formato 00.000.000 antes do nome.
  if (!rules.length) {
    match = text.match(/^\d{2}[.,]\d{3}[.,]\d{3}\s*[-:–—]?\s*(.+)$/i);
    if (match && /[A-Za-zÀ-ÿ]/.test(match[1])) {
      text = match[1].trim();
      rules.push('REMOVE_RAIZ_CNPJ_PREFIXO');
    }
  }

  // Lista operacional de codigos antes do nome, por exemplo 10,20,30 - EMPRESA.
  if (!rules.length) {
    match = text.match(/^(?:\d{1,4}\s*,\s*){2,}\d{1,4}\s*[-:–—]\s*(.+)$/i);
    if (match && /[A-Za-zÀ-ÿ]/.test(match[1])) {
      text = match[1].trim();
      rules.push('REMOVE_LISTA_CODIGOS_PREFIXO');
    }
  }

  text = text.replace(/\s+/g, ' ').trim();
  return {
    value: text,
    changed: centralAgfNomeBasicoNormalizado_(text) !== centralAgfNomeBasicoNormalizado_(original),
    rules: rules.join(' | ')
  };
}

function centralAgfQualityResidualProblems_(value) {
  const text = String(value == null ? '' : value).trim();
  const problems = [];
  if (!text) problems.push('NOME_VAZIO');
  if (text && centralAgfIsPlaceholderName_(text)) problems.push('PLACEHOLDER_OPERACIONAL');
  if (/[ÃÂ�]/.test(text)) problems.push('POSSIVEL_CODIFICACAO_CORROMPIDA');
  if (text && !/[A-Za-zÀ-ÿ]/.test(text)) problems.push('SEM_LETRAS');
  if (/^\d{2}[.,]\d{3}[.,]\d{3}\s+/i.test(text)) problems.push('PREFIXO_RAIZ_CNPJ_NAO_LIMPO');
  if (/^(?:\d{1,4}\s*,\s*){2,}\d{1,4}\s*[-:–—]/i.test(text)) problems.push('LISTA_CODIGOS_NAO_LIMPA');
  return problems;
}

function centralAgfQualityLoadContractAuthority_() {
  const processingId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.PROCESSING_SPREADSHEET_ID);
  const ss = SpreadsheetApp.openById(processingId);
  const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.PROCESSING_CONTRACTS);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('02_CONTRATOS ausente ou vazia em PROCESSAMENTO_POSTAGENS_CORREIOS.');
  }

  const values = sheet.getDataRange().getValues();
  const map = centralAgfHeaderMap_(values[0]);
  ['NUMERO_CONTRATO', 'RAZAO_SOCIAL'].forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatoria ausente em 02_CONTRATOS: ' + name);
  });

  const byContract = Object.create(null);
  values.slice(1).forEach(function(row) {
    const key = centralAgfQualityContractKey_(row[map.NUMERO_CONTRATO]);
    const name = String(row[map.RAZAO_SOCIAL] || '').trim();
    if (!key || !name) return;
    if (!byContract[key]) byContract[key] = Object.create(null);
    centralAgfQualityAdd_(byContract[key], name);
  });

  return byContract;
}

function centralAgfQualityScanHistoricalEvidence_(targetReasonNorms) {
  const evidence = Object.create(null);
  Object.keys(targetReasonNorms || {}).forEach(function(key) {
    evidence[key] = {
      contracts: Object.create(null),
      senders: Object.create(null)
    };
  });

  const partitions = centralAgfLerCatalogoParticoes_();
  partitions.forEach(function(partition) {
    const ss = SpreadsheetApp.openById(partition.spreadsheetId);
    const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.FACTS);
    if (!sheet || sheet.getLastRow() < 2) return;

    const lastColumn = sheet.getLastColumn();
    const header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const map = centralAgfHeaderMap_(header);
    ['NUMERO_CONTRATO', 'NOME_REMETENTE', 'RAZAO_SOCIAL'].forEach(function(name) {
      if (map[name] == null) throw new Error('Coluna ' + name + ' ausente em ' + partition.name + '.');
    });

    const indexes = [map.NUMERO_CONTRATO, map.NOME_REMETENTE, map.RAZAO_SOCIAL];
    const minIndex = Math.min.apply(null, indexes);
    const maxIndex = Math.max.apply(null, indexes);
    const width = maxIndex - minIndex + 1;
    const rows = sheet.getRange(2, minIndex + 1, sheet.getLastRow() - 1, width).getValues();
    const contractOffset = map.NUMERO_CONTRATO - minIndex;
    const senderOffset = map.NOME_REMETENTE - minIndex;
    const reasonOffset = map.RAZAO_SOCIAL - minIndex;

    rows.forEach(function(row) {
      const reasonRaw = String(row[reasonOffset] || '').trim();
      const reasonNorm = centralAgfNomeBasicoNormalizado_(reasonRaw);
      const item = evidence[reasonNorm];
      if (!item) return;

      const contract = centralAgfQualityContractKey_(row[contractOffset]);
      if (contract) item.contracts[contract] = true;
      centralAgfQualityAdd_(item.senders, row[senderOffset]);
    });
  });

  return evidence;
}

function centralAgfQualityAuthorityNames_(contractKeys, authorityByContract) {
  const raw = Object.create(null);
  Object.keys(contractKeys || {}).forEach(function(contractKey) {
    const names = authorityByContract[contractKey] || {};
    Object.keys(names).forEach(function(name) {
      centralAgfQualityAdd_(raw, name);
    });
  });

  const cleanByNorm = Object.create(null);
  Object.keys(raw).forEach(function(name) {
    const cleaned = centralAgfQualityStrongClean_(name);
    const norm = centralAgfNomeBasicoNormalizado_(cleaned.value);
    if (!norm) return;
    if (!cleanByNorm[norm]) cleanByNorm[norm] = cleaned.value;
  });

  return {
    raw: raw,
    cleanedNames: Object.keys(cleanByNorm).map(function(norm) { return cleanByNorm[norm]; }).sort()
  };
}

/**
 * Audita a qualidade cadastral das 2.140 propostas antes de qualquer persistencia.
 * A rotina cruza identidades AGF contratadas com 02_CONTRATOS e com evidencias historicas
 * de NUMERO_CONTRATO/NOME_REMETENTE. Nenhuma linha de 01_CLIENTES_MASTER e alterada.
 */
function centralAgfAuditarQualidadePropostaMaster() {
  return centralAgfWithScriptLock_(function() {
    centralAgfAssertHistoricoHomologado_();
    const startedAt = Date.now();
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(masterId);

    const summaryProposal = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENT_ID_PROPOSAL_SUMMARY);
    if (!summaryProposal || summaryProposal.getLastRow() < 2) {
      throw new Error('23_RESUMO_PROPOSTA_ID vazio. Execute centralAgfGerarPropostaClienteId() primeiro.');
    }
    const summaryValues = summaryProposal.getDataRange().getValues();
    const summaryMap = centralAgfHeaderMap_(summaryValues[0]);
    let proposalConflicts = null;
    summaryValues.slice(1).forEach(function(row) {
      if (centralAgfNormalizeText_(row[summaryMap.GRUPO]) === 'PROPOSTA' &&
          centralAgfNormalizeText_(row[summaryMap.ITEM]) === 'CONFLITOS') {
        proposalConflicts = centralAgfNumero_(row[summaryMap.QTD]);
      }
    });
    if (proposalConflicts == null) throw new Error('23_RESUMO_PROPOSTA_ID sem linha PROPOSTA/CONFLITOS.');
    if (proposalConflicts !== 0) {
      throw new Error('A proposta de CLIENTE_ID ainda possui ' + proposalConflicts + ' conflito(s).');
    }

    const proposalSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENT_ID_PROPOSAL);
    if (!proposalSheet || proposalSheet.getLastRow() < 2) {
      throw new Error('21_PROPOSTA_CLIENTES_MASTER vazia.');
    }
    const proposalValues = proposalSheet.getDataRange().getValues();
    const map = centralAgfHeaderMap_(proposalValues[0]);
    [
      'CLIENTE_ID_PROPOSTO', 'LOTE_ITEM_ID', 'NOME_EXIBICAO', 'RAZAO_SOCIAL_OFICIAL',
      'CENTRO_ID_PRINCIPAL', 'TIPO_IDENTIDADE_ORIGEM', 'OCORRENCIAS_REFERENCIA',
      'FATURAMENTO_REFERENCIA', 'STATUS_PROPOSTA'
    ].forEach(function(name) {
      if (map[name] == null) throw new Error('Coluna obrigatoria ausente em 21_PROPOSTA_CLIENTES_MASTER: ' + name);
    });

    const proposalRows = proposalValues.slice(1).filter(function(row) {
      const status = centralAgfNormalizeText_(row[map.STATUS_PROPOSTA]);
      return status === 'PRONTO_PROPOSTA_ID' || status === 'JA_EXISTE_MASTER';
    });

    const targetReasonNorms = Object.create(null);
    proposalRows.forEach(function(row) {
      if (centralAgfNormalizeText_(row[map.TIPO_IDENTIDADE_ORIGEM]) !== 'AGF_RAZAO_SOCIAL') return;
      const reason = String(row[map.RAZAO_SOCIAL_OFICIAL] || row[map.NOME_EXIBICAO] || '').trim();
      const norm = centralAgfNomeBasicoNormalizado_(reason);
      if (norm) targetReasonNorms[norm] = true;
    });

    centralAgfSetPanelStatus_(
      'AUDITANDO_QUALIDADE_MASTER',
      proposalRows.length + ' propostas; cruzando contratos e evidencias historicas sem escrever no Master.'
    );

    const authorityByContract = centralAgfQualityLoadContractAuthority_();
    const evidenceByReason = centralAgfQualityScanHistoricalEvidence_(targetReasonNorms);
    const candidates = [];
    const collisionBuckets = Object.create(null);

    proposalRows.forEach(function(row) {
      const clientId = centralAgfNormalizeText_(row[map.CLIENTE_ID_PROPOSTO]);
      const lotItemId = centralAgfNormalizeText_(row[map.LOTE_ITEM_ID]);
      const center = centralAgfNormalizeText_(row[map.CENTRO_ID_PRINCIPAL]);
      const type = centralAgfNormalizeText_(row[map.TIPO_IDENTIDADE_ORIGEM]);
      const currentDisplay = String(row[map.NOME_EXIBICAO] || '').trim();
      const currentReason = String(row[map.RAZAO_SOCIAL_OFICIAL] || '').trim();
      const currentBase = currentReason || currentDisplay;
      const currentNorm = centralAgfNomeBasicoNormalizado_(currentBase);
      const evidence = evidenceByReason[currentNorm] || {
        contracts: Object.create(null),
        senders: Object.create(null)
      };
      const authority = type === 'AGF_RAZAO_SOCIAL'
        ? centralAgfQualityAuthorityNames_(evidence.contracts, authorityByContract)
        : { raw: Object.create(null), cleanedNames: [] };

      let baseCandidate = currentDisplay;
      let authorityUsed = false;
      let authorityConflict = false;

      if (type === 'AGF_RAZAO_SOCIAL' && authority.cleanedNames.length === 1) {
        baseCandidate = authority.cleanedNames[0];
        authorityUsed = true;
      } else if (type === 'AGF_RAZAO_SOCIAL' && authority.cleanedNames.length > 1) {
        authorityConflict = true;
      }

      const cleaned = centralAgfQualityStrongClean_(baseCandidate);
      const finalName = cleaned.value;
      const finalNorm = centralAgfNomeBasicoNormalizado_(finalName);
      const senderNorms = Object.create(null);
      Object.keys(evidence.senders || {}).forEach(function(sender) {
        senderNorms[centralAgfNomeBasicoNormalizado_(sender)] = true;
      });
      const senderConfirms = Boolean(finalNorm && senderNorms[finalNorm]);
      const residualProblems = centralAgfQualityResidualProblems_(finalName);
      if (authorityConflict) residualProblems.push('MULTIPLAS_RAZOES_ATUAIS_PARA_CONTRATOS_OBSERVADOS');

      const collisionKey = center + '|' + finalNorm;
      if (!collisionBuckets[collisionKey]) collisionBuckets[collisionKey] = Object.create(null);
      if (clientId) collisionBuckets[collisionKey][clientId] = true;

      candidates.push({
        clientId: clientId,
        lotItemId: lotItemId,
        center: center,
        type: type,
        currentDisplay: currentDisplay,
        currentReason: currentReason,
        contracts: evidence.contracts,
        authorityRaw: authority.raw,
        authorityCleaned: authority.cleanedNames,
        senders: evidence.senders,
        authorityUsed: authorityUsed,
        authorityConflict: authorityConflict,
        cleaned: cleaned,
        finalName: finalName,
        finalNorm: finalNorm,
        senderConfirms: senderConfirms,
        residualProblems: residualProblems,
        billing: centralAgfNumero_(row[map.FATURAMENTO_REFERENCIA]),
        occurrences: centralAgfNumero_(row[map.OCORRENCIAS_REFERENCIA])
      });
    });

    const header = [
      'CLIENTE_ID_PROPOSTO', 'LOTE_ITEM_ID', 'CENTRO_ID_PRINCIPAL', 'TIPO_IDENTIDADE_ORIGEM',
      'NOME_EXIBICAO_ATUAL', 'RAZAO_SOCIAL_ATUAL', 'CONTRATOS_OBSERVADOS',
      'RAZOES_ATUAIS_CONTRATOS', 'REMETENTES_OBSERVADOS', 'NOME_FINAL_SUGERIDO',
      'RAZAO_SOCIAL_FINAL_SUGERIDA', 'FONTE_NOME_FINAL', 'REGRA_LIMPEZA',
      'REMETENTE_CONFIRMA_NOME', 'STATUS_QUALIDADE', 'MOTIVOS',
      'OCORRENCIAS_REFERENCIA', 'FATURAMENTO_REFERENCIA'
    ];
    const out = [header];
    const summary = [['GRUPO', 'ITEM', 'QTD', 'FATURAMENTO_TOTAL']];
    const counts = Object.create(null);
    const billingByStatus = Object.create(null);
    let collisions = 0;

    candidates.forEach(function(item) {
      const collisionKey = item.center + '|' + item.finalNorm;
      const collisionIds = Object.keys(collisionBuckets[collisionKey] || {});
      const problems = item.residualProblems.slice();
      if (collisionIds.length > 1) {
        problems.push('COLISAO_APOS_NOME_FINAL_SUGERIDO');
        collisions++;
      }

      let status;
      let source;
      if (problems.length) {
        status = 'REVISAR_QUALIDADE';
      } else if (item.authorityUsed && item.cleaned.changed) {
        status = 'PRONTO_COM_AUTORIDADE_E_LIMPEZA';
      } else if (item.authorityUsed &&
                 centralAgfNomeBasicoNormalizado_(item.finalName) !== centralAgfNomeBasicoNormalizado_(item.currentDisplay)) {
        status = 'PRONTO_COM_AUTORIDADE_CONTRATO';
      } else if (item.cleaned.changed) {
        status = 'PRONTO_COM_LIMPEZA_DETERMINISTICA';
      } else {
        status = 'PRONTO_SEM_AJUSTE';
      }

      if (item.authorityUsed) source = '02_CONTRATOS_POR_NUMERO_CONTRATO';
      else source = '21_PROPOSTA_CLIENTES_MASTER';
      if (item.cleaned.changed) source += '+LIMPEZA_DETERMINISTICA';

      counts[status] = (counts[status] || 0) + 1;
      billingByStatus[status] = (billingByStatus[status] || 0) + item.billing;

      out.push([
        item.clientId,
        item.lotItemId,
        item.center,
        item.type,
        item.currentDisplay,
        item.currentReason,
        centralAgfQualityList_(item.contracts, 12),
        centralAgfQualityList_(item.authorityRaw, 8),
        centralAgfQualityList_(item.senders, 8),
        item.finalName,
        item.type === 'AGF_RAZAO_SOCIAL' ? item.finalName : '',
        source,
        item.cleaned.rules,
        item.senderConfirms ? 'SIM' : 'NAO',
        status,
        problems.join(' | '),
        item.occurrences,
        Math.round(item.billing * 100) / 100
      ]);
    });

    const dataRows = out.slice(1).sort(function(a, b) {
      const statusCmp = String(a[14]).localeCompare(String(b[14]));
      if (statusCmp) return statusCmp;
      return Number(b[17] || 0) - Number(a[17] || 0);
    });
    out.splice(1, out.length - 1);
    Array.prototype.push.apply(out, dataRows);

    summary.push([
      'ENTRADA', 'PROPOSTAS_AUDITADAS', candidates.length,
      Math.round(candidates.reduce(function(sum, item) { return sum + item.billing; }, 0) * 100) / 100
    ]);
    Object.keys(counts).sort().forEach(function(status) {
      summary.push(['QUALIDADE', status, counts[status], Math.round((billingByStatus[status] || 0) * 100) / 100]);
    });
    summary.push(['REGRA', 'COLISOES_APOS_NOME_FINAL_SUGERIDO', collisions, '']);
    summary.push(['REGRA', 'ESCRITAS_EM_01_CLIENTES_MASTER', 0, '']);

    const auditSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_QUALITY_AUDIT);
    const summarySheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_QUALITY_SUMMARY);
    centralAgfLoteWriteDerivedSheet_(auditSheet, out, header);
    centralAgfLoteWriteDerivedSheet_(summarySheet, summary, summary[0]);

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      'AUDITORIA_QUALIDADE_MASTER_PRONTA',
      'Auditadas=' + candidates.length +
      '; revisar=' + (counts.REVISAR_QUALIDADE || 0) +
      '; colisoes=' + collisions +
      '. Nenhuma escrita em 01_CLIENTES_MASTER.'
    );

    return {
      ok: true,
      audited: candidates.length,
      review: counts.REVISAR_QUALIDADE || 0,
      collisions: collisions,
      elapsedMs: elapsedMs
    };
  });
}
