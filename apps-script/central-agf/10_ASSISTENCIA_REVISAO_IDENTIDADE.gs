function centralAgfReviewCompactKey_(value) {
  return centralAgfNomeBasicoNormalizado_(value).replace(/\s+/g, '');
}

function centralAgfReviewStripNumericSuffix_(value) {
  return centralAgfNomeBasicoNormalizado_(value).replace(/\s+\d{2,5}$/, '').trim();
}

function centralAgfReviewCandidatePriority_(method, score) {
  if (method === 'PREVIA_ALIAS_CONFIAVEL') return 10000;
  if (method === 'COMPACTO_EXATO_COM_PRONTO') return 9000;
  if (method === 'SEM_SUFIXO_NUMERICO_COM_PRONTO') return 8500;
  if (method === 'LEGADO_MANUAL') return 8000;
  if (method === 'LEGADO_EXATO') return 7500;
  return 1000 + Math.max(0, Number(score || 0));
}

function centralAgfReviewAddCandidate_(bucket, candidate) {
  if (!candidate || !candidate.name || centralAgfIsPlaceholderName_(candidate.name)) return;
  const nameNorm = centralAgfNomeBasicoNormalizado_(candidate.name);
  if (!nameNorm) return;

  const item = {
    name: String(candidate.name || '').trim(),
    method: String(candidate.method || '').trim(),
    score: Number(candidate.score || 0),
    evidence: String(candidate.evidence || '').trim()
  };
  item.priority = centralAgfReviewCandidatePriority_(item.method, item.score);

  const previous = bucket[nameNorm];
  if (!previous || item.priority > previous.priority) {
    bucket[nameNorm] = item;
  } else if (previous && item.evidence && previous.evidence.indexOf(item.evidence) < 0) {
    previous.evidence = [previous.evidence, item.evidence].filter(Boolean).join(' | ');
  }
}

function centralAgfBuildLegacySuggestionIndexes_(aliasValues) {
  const specific = Object.create(null);
  const rawOnly = Object.create(null);
  if (aliasValues.length < 2) return { specific: specific, rawOnly: rawOnly };

  const map = centralAgfHeaderMap_(aliasValues[0]);
  [
    'ALIAS_ID', 'NOME_REMETENTE_RAW', 'RAZAO_SOCIAL_ORIGEM', 'RAW_NORMALIZADO',
    'NOME_SUGERIDO_LEGADO', 'SCORE_LEGADO', 'METODO_LEGADO', 'VALIDACAO_LEGADO',
    'NOME_MANUAL_LEGADO', 'NOME_CANONICO_LEGADO'
  ].forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatória ausente em 02_ALIASES_NOME_REMETENTE: ' + name);
  });

  aliasValues.slice(1).forEach(function(row) {
    const raw = String(row[map.NOME_REMETENTE_RAW] || '').trim();
    const rawLegacy = String(row[map.RAW_NORMALIZADO] || '').trim();
    const reason = String(row[map.RAZAO_SOCIAL_ORIGEM] || '').trim();
    const suggested = String(row[map.NOME_SUGERIDO_LEGADO] || '').trim();
    const manual = String(row[map.NOME_MANUAL_LEGADO] || '').trim();
    const canonical = String(row[map.NOME_CANONICO_LEGADO] || '').trim();
    const score = Number(row[map.SCORE_LEGADO] || 0);
    const method = centralAgfNormalizeText_(row[map.METODO_LEGADO]);
    const validation = centralAgfNormalizeText_(row[map.VALIDACAO_LEGADO]);

    let candidateName = '';
    let candidateMethod = '';
    if (validation === 'MANUAL' && (manual || canonical)) {
      candidateName = manual || canonical;
      candidateMethod = 'LEGADO_MANUAL';
    } else if (method === 'EXATO_NORM' && score >= 100 && canonical) {
      candidateName = canonical;
      candidateMethod = 'LEGADO_EXATO';
    } else if (score > 0 && (suggested || canonical)) {
      candidateName = suggested || canonical;
      candidateMethod = 'LEGADO_SCORE';
    }

    if (!candidateName || centralAgfIsPlaceholderName_(candidateName)) return;

    const rawKeys = [raw, rawLegacy]
      .map(centralAgfNomeBasicoNormalizado_)
      .filter(Boolean);
    const reasonKey = centralAgfNomeBasicoNormalizado_(reason);
    const item = {
      name: candidateName,
      method: candidateMethod,
      score: validation === 'MANUAL' ? 100 : score,
      evidence: String(row[map.ALIAS_ID] || '').trim() + ':' + method + ':' + score
    };

    rawKeys.forEach(function(rawKey) {
      const specificKey = rawKey + '|' + reasonKey;
      if (!specific[specificKey]) specific[specificKey] = [];
      specific[specificKey].push(item);

      if (!rawOnly[rawKey]) rawOnly[rawKey] = [];
      rawOnly[rawKey].push(item);
    });
  });

  return { specific: specific, rawOnly: rawOnly };
}

function centralAgfReviewFindLegacySuggestions_(variantsValue, reasonsValue, indexes) {
  const bucket = Object.create(null);
  const variants = centralAgfSplitDistinctList_(variantsValue);
  const reasons = centralAgfSplitDistinctList_(reasonsValue);

  variants.forEach(function(variant) {
    const rawKey = centralAgfNomeBasicoNormalizado_(variant);
    if (!rawKey) return;

    let foundSpecific = false;
    reasons.forEach(function(reason) {
      const key = rawKey + '|' + centralAgfNomeBasicoNormalizado_(reason);
      const rows = indexes.specific[key] || [];
      if (rows.length) foundSpecific = true;
      rows.forEach(function(item) { centralAgfReviewAddCandidate_(bucket, item); });
    });

    // Fallback apenas como sugestão: aceita índice sem Razão Social somente quando
    // todos os registros conhecidos para o mesmo raw apontam para um único canônico.
    if (!foundSpecific) {
      const rows = indexes.rawOnly[rawKey] || [];
      const canonicalMap = Object.create(null);
      rows.forEach(function(item) {
        canonicalMap[centralAgfNomeBasicoNormalizado_(item.name)] = item.name;
      });
      if (Object.keys(canonicalMap).length === 1) {
        rows.forEach(function(item) { centralAgfReviewAddCandidate_(bucket, item); });
      }
    }
  });

  return bucket;
}

function centralAgfBuildReadyIdentityIndexes_(previewValues) {
  const compact = Object.create(null);
  const normalized = Object.create(null);
  if (previewValues.length < 2) return { compact: compact, normalized: normalized };

  const map = centralAgfHeaderMap_(previewValues[0]);
  ['CENTRO_SUGERIDO', 'NOME_CANONICO_SUGERIDO', 'STATUS_PREVIA'].forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatória ausente em 14_PREVIA_MIGRACAO_CLIENTES: ' + name);
  });

  function add(index, key, canonical) {
    if (!key || !canonical) return;
    if (!index[key]) index[key] = Object.create(null);
    index[key][centralAgfNomeBasicoNormalizado_(canonical)] = canonical;
  }

  previewValues.slice(1).forEach(function(row) {
    if (centralAgfNormalizeText_(row[map.STATUS_PREVIA]) !== 'PRONTO_PREVIA') return;
    const center = String(row[map.CENTRO_SUGERIDO] || '').trim();
    const canonical = String(row[map.NOME_CANONICO_SUGERIDO] || '').trim();
    if (!center || !canonical || centralAgfIsPlaceholderName_(canonical)) return;

    const norm = centralAgfNomeBasicoNormalizado_(canonical);
    add(normalized, center + '|' + norm, canonical);
    add(compact, center + '|' + centralAgfReviewCompactKey_(canonical), canonical);
  });

  return { compact: compact, normalized: normalized };
}

function centralAgfReviewUniqueIndexedName_(index, key) {
  const values = index[key] || null;
  if (!values) return '';
  const keys = Object.keys(values);
  return keys.length === 1 ? values[keys[0]] : '';
}

function centralAgfReviewClassifyAssistance_(top) {
  if (!top) return 'SEM_SUGESTAO';
  if (top.method === 'PREVIA_ALIAS_CONFIAVEL') return 'JA_TEM_ALIAS_CONFIAVEL_MAS_REQUER_REVISAO';
  if (top.method === 'COMPACTO_EXATO_COM_PRONTO' || top.method === 'SEM_SUFIXO_NUMERICO_COM_PRONTO') {
    return 'SUGESTAO_DETERMINISTICA';
  }
  if (top.method === 'LEGADO_MANUAL' || top.method === 'LEGADO_EXATO') return 'SUGESTAO_LEGADO_FORTE';
  if (top.method === 'LEGADO_SCORE' && top.score >= 90) return 'SUGESTAO_LEGADO_ALTA';
  if (top.method === 'LEGADO_SCORE' && top.score >= 75) return 'SUGESTAO_LEGADO_MEDIA';
  return 'SUGESTAO_LEGADO_BAIXA';
}

function centralAgfGerarAssistenciaRevisaoIdentidade() {
  return centralAgfWithScriptLock_(function() {
    centralAgfAssertHistoricoHomologado_();
    const startedAt = Date.now();
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(masterId);
    const previewSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_MIGRATION_PREVIEW);
    const reviewSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_IDENTITY_REVIEW);
    const aliasSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_SENDER_ALIASES);
    if (!previewSheet || previewSheet.getLastRow() < 2) {
      throw new Error('14_PREVIA_MIGRACAO_CLIENTES vazia. Execute centralAgfGerarPreviaMigracaoClientes() primeiro.');
    }
    if (!reviewSheet || reviewSheet.getLastRow() < 2) {
      throw new Error('15_FILA_REVISAO_IDENTIDADE vazia. Execute centralAgfGerarPreviaMigracaoClientes() primeiro.');
    }
    if (!aliasSheet) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.MASTER_SENDER_ALIASES);

    const previewValues = previewSheet.getDataRange().getValues();
    const reviewValues = reviewSheet.getDataRange().getValues();
    const reviewMap = centralAgfHeaderMap_(reviewValues[0]);
    [
      'CHAVE_DIAGNOSTICO', 'TIPO_IDENTIDADE', 'CENTRO_SUGERIDO', 'NOME_DIAGNOSTICO',
      'NOME_CANONICO_SUGERIDO', 'ESTRATEGIA_SUGERIDA', 'OCORRENCIAS', 'FATURAMENTO_TOTAL',
      'RAZOES_SOCIAIS_OBSERVADAS', 'VARIANTES_NOME', 'LOCAIS_ORIGEM_OBSERVADOS', 'MOTIVO_REVISAO'
    ].forEach(function(name) {
      if (reviewMap[name] == null) throw new Error('Coluna obrigatória ausente em 15_FILA_REVISAO_IDENTIDADE: ' + name);
    });

    const legacyIndexes = centralAgfBuildLegacySuggestionIndexes_(aliasSheet.getDataRange().getValues());
    const readyIndexes = centralAgfBuildReadyIdentityIndexes_(previewValues);

    const header = [
      'CHAVE_DIAGNOSTICO', 'TIPO_IDENTIDADE', 'CENTRO_SUGERIDO', 'NOME_DIAGNOSTICO',
      'RAZOES_SOCIAIS_OBSERVADAS', 'LOCAIS_ORIGEM_OBSERVADOS', 'MOTIVO_REVISAO_BASE',
      'OCORRENCIAS', 'FATURAMENTO_TOTAL',
      'CANDIDATO_1_NOME', 'CANDIDATO_1_METODO', 'CANDIDATO_1_SCORE', 'CANDIDATO_1_EVIDENCIA',
      'CANDIDATO_2_NOME', 'CANDIDATO_2_METODO', 'CANDIDATO_2_SCORE',
      'CANDIDATO_3_NOME', 'CANDIDATO_3_METODO', 'CANDIDATO_3_SCORE',
      'CLASSIFICACAO_ASSISTENCIA', 'DECISAO_HUMANA', 'NOME_CONFIRMADO', 'OBSERVACAO_HUMANA', 'STATUS'
    ];
    const out = [header];
    const assistCounts = Object.create(null);
    const typeCounts = Object.create(null);
    const strategyCounts = Object.create(null);
    const reasonCounts = Object.create(null);

    reviewValues.slice(1).forEach(function(row) {
      const center = String(row[reviewMap.CENTRO_SUGERIDO] || '').trim();
      const name = String(row[reviewMap.NOME_DIAGNOSTICO] || '').trim();
      const existingCanonical = String(row[reviewMap.NOME_CANONICO_SUGERIDO] || '').trim();
      const variants = String(row[reviewMap.VARIANTES_NOME] || '').trim();
      const reasons = String(row[reviewMap.RAZOES_SOCIAIS_OBSERVADAS] || '').trim();
      const reviewReason = String(row[reviewMap.MOTIVO_REVISAO] || '').trim();
      const bucket = Object.create(null);

      if (existingCanonical && !centralAgfIsPlaceholderName_(existingCanonical)) {
        centralAgfReviewAddCandidate_(bucket, {
          name: existingCanonical,
          method: 'PREVIA_ALIAS_CONFIAVEL',
          score: 100,
          evidence: String(row[reviewMap.ESTRATEGIA_SUGERIDA] || '').trim()
        });
      }

      const compactMatch = centralAgfReviewUniqueIndexedName_(
        readyIndexes.compact,
        center + '|' + centralAgfReviewCompactKey_(name)
      );
      if (compactMatch && centralAgfNomeBasicoNormalizado_(compactMatch) !== centralAgfNomeBasicoNormalizado_(name)) {
        centralAgfReviewAddCandidate_(bucket, {
          name: compactMatch,
          method: 'COMPACTO_EXATO_COM_PRONTO',
          score: 100,
          evidence: 'Mesmo nome após remover espaços/pontuação'
        });
      }

      const withoutSuffix = centralAgfReviewStripNumericSuffix_(name);
      if (withoutSuffix && withoutSuffix !== centralAgfNomeBasicoNormalizado_(name)) {
        const suffixMatch = centralAgfReviewUniqueIndexedName_(readyIndexes.normalized, center + '|' + withoutSuffix) ||
          centralAgfReviewUniqueIndexedName_(readyIndexes.compact, center + '|' + withoutSuffix.replace(/\s+/g, ''));
        if (suffixMatch) {
          centralAgfReviewAddCandidate_(bucket, {
            name: suffixMatch,
            method: 'SEM_SUFIXO_NUMERICO_COM_PRONTO',
            score: 100,
            evidence: 'Correspondência única após retirar sufixo numérico'
          });
        }
      }

      const legacy = centralAgfReviewFindLegacySuggestions_(variants, reasons, legacyIndexes);
      Object.keys(legacy).forEach(function(key) {
        centralAgfReviewAddCandidate_(bucket, legacy[key]);
      });

      const candidates = Object.keys(bucket)
        .map(function(key) { return bucket[key]; })
        .sort(function(a, b) {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return b.score - a.score;
        })
        .slice(0, 3);

      const classification = centralAgfReviewClassifyAssistance_(candidates[0]);
      assistCounts[classification] = (assistCounts[classification] || 0) + 1;

      const type = centralAgfNormalizeText_(row[reviewMap.TIPO_IDENTIDADE]);
      const strategy = centralAgfNormalizeText_(row[reviewMap.ESTRATEGIA_SUGERIDA]);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      reviewReason.split('|').map(function(item) { return item.trim(); }).filter(Boolean).forEach(function(reason) {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });

      function candidateValue(index, field) {
        return candidates[index] ? candidates[index][field] : '';
      }

      out.push([
        String(row[reviewMap.CHAVE_DIAGNOSTICO] || '').trim(),
        type,
        center,
        name,
        reasons,
        String(row[reviewMap.LOCAIS_ORIGEM_OBSERVADOS] || '').trim(),
        reviewReason,
        Number(row[reviewMap.OCORRENCIAS] || 0),
        Math.round(Number(row[reviewMap.FATURAMENTO_TOTAL] || 0) * 100) / 100,
        candidateValue(0, 'name'), candidateValue(0, 'method'), candidateValue(0, 'score'), candidateValue(0, 'evidence'),
        candidateValue(1, 'name'), candidateValue(1, 'method'), candidateValue(1, 'score'),
        candidateValue(2, 'name'), candidateValue(2, 'method'), candidateValue(2, 'score'),
        classification,
        '', '', '', 'PENDENTE_REVISAO'
      ]);
    });

    const body = out.slice(1).sort(function(a, b) { return Number(b[8] || 0) - Number(a[8] || 0); });
    out.splice(1, out.length - 1);
    Array.prototype.push.apply(out, body);

    const assistSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_IDENTITY_ASSISTED_REVIEW);
    assistSheet.clearContents();
    centralAgfEnsureRows_(assistSheet, out.length);
    if (assistSheet.getMaxColumns() < header.length) {
      assistSheet.insertColumnsAfter(assistSheet.getMaxColumns(), header.length - assistSheet.getMaxColumns());
    }
    assistSheet.getRange(1, 1, out.length, header.length).setValues(out);
    assistSheet.setFrozenRows(1);
    if (assistSheet.getFilter()) assistSheet.getFilter().remove();
    if (out.length > 1) assistSheet.getRange(1, 1, out.length, header.length).createFilter();

    const previewMap = centralAgfHeaderMap_(previewValues[0]);
    const statusCounts = Object.create(null);
    if (previewMap.STATUS_PREVIA != null) {
      previewValues.slice(1).forEach(function(row) {
        const status = centralAgfNormalizeText_(row[previewMap.STATUS_PREVIA]);
        if (status) statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
    }

    const summary = [['GRUPO', 'ITEM', 'QTD']];
    function appendCounts(group, counts) {
      Object.keys(counts).sort().forEach(function(key) {
        summary.push([group, key, counts[key]]);
      });
    }
    appendCounts('STATUS_PREVIA', statusCounts);
    appendCounts('REVISAO_TIPO', typeCounts);
    appendCounts('REVISAO_ESTRATEGIA', strategyCounts);
    appendCounts('REVISAO_MOTIVO', reasonCounts);
    appendCounts('ASSISTENCIA', assistCounts);

    const summarySheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_IDENTITY_SUMMARY);
    summarySheet.clearContents();
    centralAgfEnsureRows_(summarySheet, summary.length);
    if (summarySheet.getMaxColumns() < 3) summarySheet.insertColumnsAfter(summarySheet.getMaxColumns(), 3 - summarySheet.getMaxColumns());
    summarySheet.getRange(1, 1, summary.length, 3).setValues(summary);
    summarySheet.setFrozenRows(1);

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      'REVISAO_IDENTIDADE_ASSISTIDA_PRONTA',
      'Fila: ' + (out.length - 1) + '; com sugestão: ' + ((out.length - 1) - (assistCounts.SEM_SUGESTAO || 0)) + '; sem sugestão: ' + (assistCounts.SEM_SUGESTAO || 0) + '.'
    );

    return {
      ok: true,
      reviewRows: out.length - 1,
      assistedRows: (out.length - 1) - (assistCounts.SEM_SUGESTAO || 0),
      noSuggestionRows: assistCounts.SEM_SUGESTAO || 0,
      assistCounts: assistCounts,
      elapsedMs: elapsedMs
    };
  });
}
