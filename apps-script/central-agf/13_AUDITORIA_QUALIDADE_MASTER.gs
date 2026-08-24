function centralAgfQualityAdd_(bucket, value) {
  const text = String(value == null ? '' : value).trim();
  if (text) bucket[text] = true;
}

function centralAgfQualityList_(bucket, limit) {
  return centralAgfDistinctList_(bucket || Object.create(null), limit || 12);
}

/**
 * Normaliza o valor recebido da fonte sem perder 9999999999.
 * Esse codigo e um contrato importado incorretamente e precisa permanecer
 * visivel como evidencia de origem ate a tentativa de resolucao por cartao.
 */
function centralAgfQualityContractRawKey_(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && isFinite(value)) {
    return String(Math.round(value));
  }

  const text = String(value).trim().replace(/\s+/g, '');
  if (!text) return '';
  const upper = text.toUpperCase();
  if (['NULL', 'NULO', 'N/A', 'NA', 'SEMCONTRATO'].indexOf(upper) >= 0) return '';

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

/**
 * Retorna apenas contrato diretamente utilizavel. 9999999999 nao e descartado
 * do historico; ele apenas nao pode ser usado como contrato resolvido antes do
 * chaveamento por CARTAO_POSTAGEM.
 */
function centralAgfQualityContractKey_(value) {
  const key = centralAgfQualityContractRawKey_(value);
  return key === '9999999999' ? '' : key;
}

function centralAgfQualityPostingCardKey_(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && isFinite(value)) {
    return String(Math.round(value));
  }

  const text = String(value).trim().replace(/\s+/g, '');
  if (!text) return '';
  const upper = text.toUpperCase();
  if (['NULL', 'NULO', 'N/A', 'NA', 'SEMCARTAO'].indexOf(upper) >= 0) return '';

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

  match = text.match(/^\d{2}[.]\d{3}[.]\d{3}\/\d{4}-\d{2}\s*[-:–—]?\s*(.+)$/i);
  if (match && /[A-Za-zÀ-ÿ]/.test(match[1])) {
    text = match[1].trim();
    rules.push('REMOVE_CNPJ_PREFIXO');
  }

  if (!rules.length) {
    match = text.match(/^\d{14}\s*[-:–—]?\s*(.+)$/i);
    if (match && /[A-Za-zÀ-ÿ]/.test(match[1])) {
      text = match[1].trim();
      rules.push('REMOVE_CNPJ_14_PREFIXO');
    }
  }

  if (!rules.length) {
    match = text.match(/^\d{2}[.,]\d{3}[.,]\d{3}\s*[-:–—]?\s*(.+)$/i);
    if (match && /[A-Za-zÀ-ÿ]/.test(match[1])) {
      text = match[1].trim();
      rules.push('REMOVE_RAIZ_CNPJ_PREFIXO');
    }
  }

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

function centralAgfQualityLooksMojibake_(value) {
  const text = String(value == null ? '' : value);
  if (!text) return false;
  return /\uFFFD/.test(text) ||
    /Ã[\u0080-\u00BF]/.test(text) ||
    /Â[\u0080-\u00BF]/.test(text) ||
    /Ò[©º¡]/.test(text) ||
    /â[€™œ“”]/.test(text);
}

function centralAgfQualityResidualProblems_(value) {
  const text = String(value == null ? '' : value).trim();
  const problems = [];
  if (!text) problems.push('NOME_VAZIO');
  if (text && centralAgfIsPlaceholderName_(text)) problems.push('PLACEHOLDER_OPERACIONAL');
  if (centralAgfQualityLooksMojibake_(text)) problems.push('POSSIVEL_CODIFICACAO_CORROMPIDA');
  if (text && !/[A-Za-zÀ-ÿ]/.test(text)) problems.push('SEM_LETRAS');
  if (/^\d{2}[.,]\d{3}[.,]\d{3}\s+/i.test(text)) problems.push('PREFIXO_RAIZ_CNPJ_NAO_LIMPO');
  if (/^(?:\d{1,4}\s*,\s*){2,}\d{1,4}\s*[-:–—]/i.test(text)) problems.push('LISTA_CODIGOS_NAO_LIMPA');
  return problems;
}

/**
 * Autoridade cadastral para cliente AGF contratado: somente contratos cujo
 * INTERMEDIADOR seja PORTAL POSTAL. Contratos de marketplaces/integradores
 * podem aparecer em muitos clientes e nao podem substituir a identidade.
 */
function centralAgfQualityLoadContractAuthority_() {
  const processingId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.PROCESSING_SPREADSHEET_ID);
  const ss = SpreadsheetApp.openById(processingId);
  const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.PROCESSING_CONTRACTS);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('02_CONTRATOS ausente ou vazia em PROCESSAMENTO_POSTAGENS_CORREIOS.');
  }

  const values = sheet.getDataRange().getValues();
  const map = centralAgfHeaderMap_(values[0]);
  ['NUMERO_CONTRATO', 'RAZAO_SOCIAL', 'INTERMEDIADOR'].forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatoria ausente em 02_CONTRATOS: ' + name);
  });

  const byContract = Object.create(null);
  values.slice(1).forEach(function(row) {
    const intermediary = centralAgfNormalizeText_(row[map.INTERMEDIADOR]);
    if (intermediary !== 'PORTAL POSTAL') return;

    const key = centralAgfQualityContractKey_(row[map.NUMERO_CONTRATO]);
    const name = String(row[map.RAZAO_SOCIAL] || '').trim();
    if (!key || !name) return;
    if (!byContract[key]) byContract[key] = Object.create(null);
    centralAgfQualityAdd_(byContract[key], name);
  });

  return byContract;
}

function centralAgfQualityEmptyEvidence_() {
  return {
    rawContracts: Object.create(null),
    contracts: Object.create(null),
    cards: Object.create(null),
    senders: Object.create(null),
    pending999ByCard: Object.create(null),
    resolution: {
      total999: 0,
      resolvedByCard: 0,
      ambiguousCard: 0,
      noReference: 0,
      noCard: 0
    }
  };
}

/**
 * Faz uma unica leitura das particoes. Durante a leitura, constroi o mapa
 * historico CARTAO_POSTAGEM -> contratos reais e guarda as ocorrencias 999.
 * A resolucao acontece somente depois de todo o historico ter sido lido.
 */
function centralAgfQualityScanHistoricalEvidence_(targetReasonNorms) {
  const evidence = Object.create(null);
  Object.keys(targetReasonNorms || {}).forEach(function(key) {
    evidence[key] = centralAgfQualityEmptyEvidence_();
  });

  const contractsByCard = Object.create(null);
  const global999ByCard = Object.create(null);
  const globalResolution = {
    total999: 0,
    resolvedByCard: 0,
    ambiguousCard: 0,
    noReference: 0,
    noCard: 0
  };

  const partitions = centralAgfLerCatalogoParticoes_();
  partitions.forEach(function(partition) {
    const ss = SpreadsheetApp.openById(partition.spreadsheetId);
    const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.FACTS);
    if (!sheet || sheet.getLastRow() < 2) return;

    const lastColumn = sheet.getLastColumn();
    const header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const map = centralAgfHeaderMap_(header);
    ['NUMERO_CONTRATO', 'CARTAO_POSTAGEM', 'NOME_REMETENTE', 'RAZAO_SOCIAL'].forEach(function(name) {
      if (map[name] == null) throw new Error('Coluna ' + name + ' ausente em ' + partition.name + '.');
    });

    const indexes = [map.NUMERO_CONTRATO, map.CARTAO_POSTAGEM, map.NOME_REMETENTE, map.RAZAO_SOCIAL];
    const minIndex = Math.min.apply(null, indexes);
    const maxIndex = Math.max.apply(null, indexes);
    const width = maxIndex - minIndex + 1;
    const rows = sheet.getRange(2, minIndex + 1, sheet.getLastRow() - 1, width).getValues();
    const contractOffset = map.NUMERO_CONTRATO - minIndex;
    const cardOffset = map.CARTAO_POSTAGEM - minIndex;
    const senderOffset = map.NOME_REMETENTE - minIndex;
    const reasonOffset = map.RAZAO_SOCIAL - minIndex;

    rows.forEach(function(row) {
      const rawContract = centralAgfQualityContractRawKey_(row[contractOffset]);
      const realContract = centralAgfQualityContractKey_(row[contractOffset]);
      const card = centralAgfQualityPostingCardKey_(row[cardOffset]);

      if (card && realContract) {
        if (!contractsByCard[card]) contractsByCard[card] = Object.create(null);
        contractsByCard[card][realContract] = true;
      }

      if (rawContract === '9999999999') {
        globalResolution.total999++;
        if (card) {
          global999ByCard[card] = (global999ByCard[card] || 0) + 1;
        } else {
          globalResolution.noCard++;
        }
      }

      const reasonRaw = String(row[reasonOffset] || '').trim();
      const reasonNorm = centralAgfNomeBasicoNormalizado_(reasonRaw);
      const item = evidence[reasonNorm];
      if (!item) return;

      if (rawContract) item.rawContracts[rawContract] = true;
      if (realContract) item.contracts[realContract] = true;
      if (card) item.cards[card] = true;
      centralAgfQualityAdd_(item.senders, row[senderOffset]);

      if (rawContract === '9999999999') {
        item.resolution.total999++;
        if (card) {
          item.pending999ByCard[card] = (item.pending999ByCard[card] || 0) + 1;
        } else {
          item.resolution.noCard++;
        }
      }
    });
  });

  Object.keys(global999ByCard).forEach(function(card) {
    const count = global999ByCard[card];
    const candidates = Object.keys(contractsByCard[card] || {});
    if (candidates.length === 1) globalResolution.resolvedByCard += count;
    else if (candidates.length > 1) globalResolution.ambiguousCard += count;
    else globalResolution.noReference += count;
  });

  Object.keys(evidence).forEach(function(reasonNorm) {
    const item = evidence[reasonNorm];
    Object.keys(item.pending999ByCard).forEach(function(card) {
      const count = item.pending999ByCard[card];
      const candidates = Object.keys(contractsByCard[card] || {});
      if (candidates.length === 1) {
        item.contracts[candidates[0]] = true;
        item.resolution.resolvedByCard += count;
      } else if (candidates.length > 1) {
        item.resolution.ambiguousCard += count;
      } else {
        item.resolution.noReference += count;
      }
    });
  });

  const reconciled999 = globalResolution.resolvedByCard + globalResolution.ambiguousCard +
    globalResolution.noReference + globalResolution.noCard;
  if (reconciled999 !== globalResolution.total999) {
    throw new Error(
      'Falha de reconciliacao do contrato 9999999999: total=' + globalResolution.total999 +
      '; classificados=' + reconciled999 + '.'
    );
  }

  return {
    evidenceByReason: evidence,
    resolutionSummary: globalResolution
  };
}

function centralAgfQualityContractResolutionStatus_(resolution) {
  const r = resolution || {};
  if (!Number(r.total999 || 0)) return 'SEM_999';
  const parts = [];
  if (Number(r.resolvedByCard || 0)) parts.push('RESOLVIDO_POR_CARTAO=' + Number(r.resolvedByCard));
  if (Number(r.ambiguousCard || 0)) parts.push('REVISAR_CARTAO_AMBIGUO=' + Number(r.ambiguousCard));
  if (Number(r.noReference || 0)) parts.push('REVISAR_SEM_REFERENCIA=' + Number(r.noReference));
  if (Number(r.noCard || 0)) parts.push('REVISAR_SEM_CARTAO=' + Number(r.noCard));
  return parts.join(' | ');
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
 * Audita a qualidade cadastral das propostas antes de qualquer persistencia.
 * Para AGF contratado, somente PORTAL POSTAL pode atuar como autoridade de
 * Razao Social. Antes disso, ocorrencias 9999999999 tentam recuperar o contrato
 * real por uma associacao historica univoca CARTAO_POSTAGEM -> contrato.
 * Nenhuma linha de 01_CLIENTES_MASTER e alterada.
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
      proposalRows.length + ' propostas; resolvendo contrato 999 por cartao e restringindo autoridade a PORTAL POSTAL.'
    );

    const authorityByContract = centralAgfQualityLoadContractAuthority_();
    const scan = centralAgfQualityScanHistoricalEvidence_(targetReasonNorms);
    const evidenceByReason = scan.evidenceByReason;
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
      const evidence = evidenceByReason[currentNorm] || centralAgfQualityEmptyEvidence_();
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
      if (authorityConflict) residualProblems.push('MULTIPLAS_RAZOES_PORTAL_POSTAL_PARA_CONTRATOS_RESOLVIDOS');

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
        rawContracts: evidence.rawContracts,
        contracts: evidence.contracts,
        cards: evidence.cards,
        resolution: evidence.resolution,
        authorityRaw: authority.raw,
        senders: evidence.senders,
        authorityUsed: authorityUsed,
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
      'NOME_EXIBICAO_ATUAL', 'RAZAO_SOCIAL_ATUAL', 'CONTRATOS_OBSERVADOS_ORIGEM',
      'CARTOES_POSTAGEM_OBSERVADOS', 'CONTRATOS_RESOLVIDOS', 'RESOLUCAO_999_POR_CARTAO',
      'RAZOES_PORTAL_POSTAL_CONTRATOS', 'REMETENTES_OBSERVADOS', 'NOME_FINAL_SUGERIDO',
      'RAZAO_SOCIAL_FINAL_SUGERIDA', 'FONTE_NOME_FINAL', 'REGRA_LIMPEZA',
      'REMETENTE_CONFIRMA_NOME', 'STATUS_QUALIDADE', 'MOTIVOS',
      'OCORRENCIAS_REFERENCIA', 'FATURAMENTO_REFERENCIA'
    ];
    const out = [header];
    const summary = [['GRUPO', 'ITEM', 'QTD', 'FATURAMENTO_TOTAL']];
    const counts = Object.create(null);
    const billingByStatus = Object.create(null);
    let collisionRows = 0;

    candidates.forEach(function(item) {
      const collisionKey = item.center + '|' + item.finalNorm;
      const collisionIds = Object.keys(collisionBuckets[collisionKey] || {});
      const problems = item.residualProblems.slice();
      if (collisionIds.length > 1) {
        problems.push('COLISAO_APOS_NOME_FINAL_SUGERIDO');
        collisionRows++;
      }

      let status;
      let source;
      const authorityChanged = item.authorityUsed &&
        centralAgfNormalizeText_(item.finalName) !== centralAgfNormalizeText_(item.currentDisplay);

      if (problems.length) {
        status = 'REVISAR_QUALIDADE';
      } else if (item.authorityUsed && item.cleaned.changed) {
        status = 'PRONTO_COM_AUTORIDADE_E_LIMPEZA';
      } else if (authorityChanged) {
        status = 'PRONTO_COM_AUTORIDADE_CONTRATO';
      } else if (item.cleaned.changed) {
        status = 'PRONTO_COM_LIMPEZA_DETERMINISTICA';
      } else {
        status = 'PRONTO_SEM_AJUSTE';
      }

      if (item.authorityUsed) source = '02_CONTRATOS_PORTAL_POSTAL';
      else source = '21_PROPOSTA_CLIENTES_MASTER';
      if (Number(item.resolution.resolvedByCard || 0)) source += '+CONTRATO_999_RESOLVIDO_POR_CARTAO';
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
        centralAgfQualityList_(item.rawContracts, 12),
        centralAgfQualityList_(item.cards, 12),
        centralAgfQualityList_(item.contracts, 12),
        centralAgfQualityContractResolutionStatus_(item.resolution),
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

    const collisionGroups = Object.keys(collisionBuckets).filter(function(key) {
      return Object.keys(collisionBuckets[key] || {}).length > 1;
    }).length;

    const dataRows = out.slice(1).sort(function(a, b) {
      const statusCmp = String(a[17]).localeCompare(String(b[17]));
      if (statusCmp) return statusCmp;
      return Number(b[20] || 0) - Number(a[20] || 0);
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
    summary.push(['CONTRATO_999', 'LINHAS_999_TOTAL', scan.resolutionSummary.total999, '']);
    summary.push(['CONTRATO_999', 'RESOLVIDAS_POR_CARTAO_UNIVOCO', scan.resolutionSummary.resolvedByCard, '']);
    summary.push(['CONTRATO_999', 'CARTAO_AMBIGUO', scan.resolutionSummary.ambiguousCard, '']);
    summary.push(['CONTRATO_999', 'CARTAO_SEM_REFERENCIA', scan.resolutionSummary.noReference, '']);
    summary.push(['CONTRATO_999', 'SEM_CARTAO', scan.resolutionSummary.noCard, '']);
    summary.push(['REGRA', 'CONTRATO_999_PRESERVADO_COMO_ORIGEM', 1, '']);
    summary.push(['REGRA', 'RESOLUCAO_999_SOMENTE_CARTAO_UNIVOCO', 1, '']);
    summary.push(['REGRA', 'AUTORIDADE_CONTRATO_RESTRITA_A_PORTAL_POSTAL', 1, '']);
    summary.push(['REGRA', 'LINHAS_EM_COLISAO_APOS_NOME_FINAL_SUGERIDO', collisionRows, '']);
    summary.push(['REGRA', 'GRUPOS_DE_COLISAO_APOS_NOME_FINAL_SUGERIDO', collisionGroups, '']);
    summary.push(['REGRA', 'ESCRITAS_EM_01_CLIENTES_MASTER', 0, '']);

    const auditSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_QUALITY_AUDIT);
    const summarySheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_QUALITY_SUMMARY);
    centralAgfLoteWriteDerivedSheet_(auditSheet, out, header);
    centralAgfLoteWriteDerivedSheet_(summarySheet, summary, summary[0]);

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      'AUDITORIA_QUALIDADE_MASTER_PRONTA',
      'Auditadas=' + candidates.length +
      '; 999 resolvidos por cartao=' + scan.resolutionSummary.resolvedByCard +
      '; revisar=' + (counts.REVISAR_QUALIDADE || 0) +
      '; linhas em colisao=' + collisionRows +
      '; grupos=' + collisionGroups +
      '. Nenhuma escrita em 01_CLIENTES_MASTER.'
    );

    return {
      ok: true,
      audited: candidates.length,
      resolved999ByCard: scan.resolutionSummary.resolvedByCard,
      ambiguous999Card: scan.resolutionSummary.ambiguousCard,
      unresolved999NoReference: scan.resolutionSummary.noReference,
      unresolved999NoCard: scan.resolutionSummary.noCard,
      review: counts.REVISAR_QUALIDADE || 0,
      collisionRows: collisionRows,
      collisionGroups: collisionGroups,
      elapsedMs: elapsedMs
    };
  });
}
