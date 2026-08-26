function centralAgfGetOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function centralAgfSplitDistinctList_(value) {
  return String(value == null ? '' : value)
    .split('|')
    .map(function(item) { return item.trim(); })
    .filter(function(item) { return item && !/^\+\d+\s+OUTROS$/i.test(item); });
}

function centralAgfIsPlaceholderName_(value) {
  const norm = centralAgfNomeBasicoNormalizado_(value);
  if (!norm) return true;
  const placeholders = CENTRAL_AGF_CFG.IDENTITY.PLACEHOLDER_NAMES || [];
  return placeholders.some(function(item) {
    return norm === centralAgfNomeBasicoNormalizado_(item);
  });
}

function centralAgfAliasPriority_(alias) {
  if (!alias.canonical || centralAgfIsPlaceholderName_(alias.canonical)) return 0;
  if (alias.validation === 'MANUAL') return 300;
  if (alias.method === 'EXATO_NORM' && alias.score >= 100) return 200;
  return 0;
}

function centralAgfBuildLegacyAliasIndex_(aliasValues) {
  if (aliasValues.length < 2) return Object.create(null);
  const map = centralAgfHeaderMap_(aliasValues[0]);
  [
    'ALIAS_ID', 'NOME_REMETENTE_RAW', 'RAZAO_SOCIAL_ORIGEM', 'RAW_NORMALIZADO',
    'SCORE_LEGADO', 'METODO_LEGADO', 'VALIDACAO_LEGADO', 'NOME_MANUAL_LEGADO',
    'NOME_CANONICO_LEGADO'
  ].forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatória ausente em 02_ALIASES_NOME_REMETENTE: ' + name);
  });

  const index = Object.create(null);
  aliasValues.slice(1).forEach(function(row) {
    const raw = String(row[map.NOME_REMETENTE_RAW] || '').trim();
    const rawNormalizedLegacy = String(row[map.RAW_NORMALIZADO] || '').trim();
    const reason = String(row[map.RAZAO_SOCIAL_ORIGEM] || '').trim();
    const canonical = String(row[map.NOME_CANONICO_LEGADO] || row[map.NOME_MANUAL_LEGADO] || '').trim();
    const item = {
      aliasId: String(row[map.ALIAS_ID] || '').trim(),
      raw: raw,
      reason: reason,
      canonical: canonical,
      score: Number(row[map.SCORE_LEGADO] || 0),
      method: centralAgfNormalizeText_(row[map.METODO_LEGADO]),
      validation: centralAgfNormalizeText_(row[map.VALIDACAO_LEGADO])
    };
    item.priority = centralAgfAliasPriority_(item);
    if (!item.priority) return;

    const reasonKey = centralAgfNomeBasicoNormalizado_(reason);
    const rawKeys = [raw, rawNormalizedLegacy]
      .map(centralAgfNomeBasicoNormalizado_)
      .filter(Boolean);

    rawKeys.forEach(function(rawKey) {
      const key = rawKey + '|' + reasonKey;
      if (!index[key]) index[key] = [];
      index[key].push(item);
    });
  });
  return index;
}

function centralAgfFindLegacyAlias_(diag, aliasIndex) {
  const rawVariants = centralAgfSplitDistinctList_(diag.variants);
  const reasons = centralAgfSplitDistinctList_(diag.reasons);
  const candidates = [];
  const seen = Object.create(null);

  rawVariants.forEach(function(raw) {
    const rawKey = centralAgfNomeBasicoNormalizado_(raw);
    reasons.forEach(function(reason) {
      const reasonKey = centralAgfNomeBasicoNormalizado_(reason);
      const key = rawKey + '|' + reasonKey;
      (aliasIndex[key] || []).forEach(function(alias) {
        const unique = alias.aliasId + '|' + alias.canonical;
        if (!seen[unique]) {
          seen[unique] = true;
          candidates.push(alias);
        }
      });
    });
  });

  if (!candidates.length) return { status: 'NONE' };
  candidates.sort(function(a, b) { return b.priority - a.priority; });
  const topPriority = candidates[0].priority;
  const top = candidates.filter(function(item) { return item.priority === topPriority; });
  const canonicals = Object.create(null);
  top.forEach(function(item) {
    canonicals[centralAgfNomeBasicoNormalizado_(item.canonical)] = item.canonical;
  });
  const canonicalKeys = Object.keys(canonicals);
  if (canonicalKeys.length !== 1) {
    return {
      status: 'CONFLICT',
      evidence: top.map(function(item) { return item.aliasId + ':' + item.canonical; }).join(' | ')
    };
  }

  const chosen = top[0];
  return {
    status: 'MATCH',
    canonical: canonicals[canonicalKeys[0]],
    aliasId: chosen.aliasId,
    method: chosen.validation === 'MANUAL' ? 'ALIAS_MANUAL_LEGADO' : 'ALIAS_EXATO_NORM_LEGADO',
    confidence: chosen.validation === 'MANUAL' ? 'ALTA_MANUAL' : 'ALTA_EXATA',
    evidence: top.map(function(item) {
      return item.aliasId + ':' + item.method + ':' + item.score;
    }).join(' | ')
  };
}

function centralAgfGerarPreviaMigracaoClientes() {
  return centralAgfWithScriptLock_(function() {
    centralAgfAssertHistoricoHomologado_();
    const startedAt = Date.now();
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(masterId);
    const diagSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_IDENTITY_DIAGNOSTIC);
    const aliasSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_SENDER_ALIASES);
    if (!diagSheet || diagSheet.getLastRow() < 2) {
      throw new Error('13_DIAGNOSTICO_IDENTIDADE vazio. Execute centralAgfGerarDiagnosticoIdentidade() primeiro.');
    }
    if (!aliasSheet) throw new Error('Aba não encontrada: ' + CENTRAL_AGF_CFG.SHEETS.MASTER_SENDER_ALIASES);

    const diagValues = diagSheet.getDataRange().getValues();
    const diagMap = centralAgfHeaderMap_(diagValues[0]);
    [
      'CHAVE_DIAGNOSTICO', 'TIPO_IDENTIDADE', 'CENTRO_SUGERIDO', 'NOME_NORMALIZADO',
      'VARIANTES_NOME', 'RAZOES_SOCIAIS_OBSERVADAS', 'OCORRENCIAS', 'FATURAMENTO_TOTAL',
      'PRIMEIRA_POSTAGEM', 'ULTIMA_POSTAGEM', 'LOCAIS_ORIGEM_OBSERVADOS'
    ].forEach(function(name) {
      if (diagMap[name] == null) throw new Error('Coluna obrigatória ausente em 13_DIAGNOSTICO_IDENTIDADE: ' + name);
    });

    const aliasIndex = centralAgfBuildLegacyAliasIndex_(aliasSheet.getDataRange().getValues());
    const nameCenters = Object.create(null);
    diagValues.slice(1).forEach(function(row) {
      const name = centralAgfNomeBasicoNormalizado_(row[diagMap.NOME_NORMALIZADO]);
      const center = String(row[diagMap.CENTRO_SUGERIDO] || '').trim();
      if (!name) return;
      if (!nameCenters[name]) nameCenters[name] = Object.create(null);
      if (center) nameCenters[name][center] = true;
    });

    const header = [
      'CHAVE_DIAGNOSTICO', 'TIPO_IDENTIDADE', 'CENTRO_SUGERIDO', 'NOME_DIAGNOSTICO',
      'NOME_CANONICO_SUGERIDO', 'ESTRATEGIA_SUGERIDA', 'CONFIANCA', 'ALIAS_ORIGEM_ID',
      'EVIDENCIA_ALIAS', 'OCORRENCIAS', 'FATURAMENTO_TOTAL', 'PRIMEIRA_POSTAGEM', 'ULTIMA_POSTAGEM',
      'RAZOES_SOCIAIS_OBSERVADAS', 'VARIANTES_NOME', 'LOCAIS_ORIGEM_OBSERVADOS',
      'STATUS_PREVIA', 'MOTIVO_REVISAO'
    ];
    const preview = [header];
    const review = [header];
    const counts = Object.create(null);

    diagValues.slice(1).forEach(function(row) {
      const diag = {
        key: String(row[diagMap.CHAVE_DIAGNOSTICO] || '').trim(),
        type: centralAgfNormalizeText_(row[diagMap.TIPO_IDENTIDADE]),
        center: String(row[diagMap.CENTRO_SUGERIDO] || '').trim(),
        name: String(row[diagMap.NOME_NORMALIZADO] || '').trim(),
        variants: String(row[diagMap.VARIANTES_NOME] || '').trim(),
        reasons: String(row[diagMap.RAZOES_SOCIAIS_OBSERVADAS] || '').trim(),
        occurrences: Number(row[diagMap.OCORRENCIAS] || 0),
        billing: Number(row[diagMap.FATURAMENTO_TOTAL] || 0),
        firstDate: row[diagMap.PRIMEIRA_POSTAGEM] || '',
        lastDate: row[diagMap.ULTIMA_POSTAGEM] || '',
        locals: String(row[diagMap.LOCAIS_ORIGEM_OBSERVADOS] || '').trim()
      };

      let canonical = '';
      let strategy = '';
      let confidence = '';
      let aliasId = '';
      let evidence = '';
      let status = '';
      const reasons = [];
      const nameNorm = centralAgfNomeBasicoNormalizado_(diag.name);
      const crossCenter = nameNorm && Object.keys(nameCenters[nameNorm] || {}).length > 1;

      if (centralAgfIsPlaceholderName_(diag.name)) {
        status = 'NAO_CRIAR_CLIENTE';
        strategy = 'PLACEHOLDER_OPERACIONAL';
        confidence = 'ALTA';
        reasons.push('NOME_GENERICO_OU_OPERACIONAL');
      } else if (diag.type === 'AGF_RAZAO_SOCIAL') {
        canonical = centralAgfSplitDistinctList_(diag.reasons)[0] || diag.name;
        status = 'PRONTO_PREVIA';
        strategy = 'RAZAO_SOCIAL_AGF';
        confidence = 'ALTA_ESTRUTURAL';
      } else if (diag.type === 'AGF_BALCAO_REMETENTE' || diag.type === 'METRO_REMETENTE') {
        const alias = centralAgfFindLegacyAlias_(diag, aliasIndex);
        if (alias.status === 'MATCH') {
          canonical = alias.canonical;
          aliasId = alias.aliasId;
          evidence = alias.evidence;
          strategy = alias.method;
          confidence = alias.confidence;
          status = crossCenter ? 'REVISAR' : 'PRONTO_PREVIA';
          if (crossCenter) reasons.push('MESMO_NOME_EM_CENTROS_DIFERENTES');
        } else if (alias.status === 'CONFLICT') {
          status = 'REVISAR';
          strategy = 'CONFLITO_ALIAS_LEGADO';
          confidence = 'BAIXA';
          evidence = alias.evidence;
          reasons.push('MAIS_DE_UM_CANONICO_LEGADO');
        } else {
          status = 'REVISAR';
          strategy = 'SEM_ALIAS_CONFIAVEL';
          confidence = 'PENDENTE';
          reasons.push('SEM_ALIAS_MANUAL_OU_EXATO');
        }
      } else {
        status = 'REVISAR';
        strategy = 'TIPO_NAO_AUTOMATIZADO';
        confidence = 'PENDENTE';
        reasons.push('TIPO_IDENTIDADE_NAO_TRATADO');
      }

      if (/\s\d{2,5}$/.test(diag.name) && status !== 'NAO_CRIAR_CLIENTE') {
        status = 'REVISAR';
        reasons.push('SUFIXO_NUMERICO');
      }
      if (/^[A-Z0-9]{18,}$/.test(nameNorm.replace(/\s+/g, '')) && nameNorm.indexOf(' ') < 0 && status !== 'NAO_CRIAR_CLIENTE') {
        status = 'REVISAR';
        reasons.push('NOME_COLADO_SEM_ESPACOS');
      }
      if (/[ÃÂ]/.test(diag.variants) && status !== 'NAO_CRIAR_CLIENTE') {
        status = 'REVISAR';
        reasons.push('POSSIVEL_CODIFICACAO_CORROMPIDA');
      }

      const output = [
        diag.key, diag.type, diag.center, diag.name, canonical, strategy, confidence, aliasId,
        evidence, diag.occurrences, Math.round(diag.billing * 100) / 100, diag.firstDate, diag.lastDate,
        diag.reasons, diag.variants, diag.locals, status, reasons.join(' | ')
      ];
      preview.push(output);
      counts[status] = (counts[status] || 0) + 1;
      if (status === 'REVISAR') review.push(output);
    });

    const previewRows = preview.slice(1).sort(function(a, b) { return Number(b[10] || 0) - Number(a[10] || 0); });
    const reviewRows = review.slice(1).sort(function(a, b) { return Number(b[10] || 0) - Number(a[10] || 0); });
    preview.splice(1, preview.length - 1);
    Array.prototype.push.apply(preview, previewRows);
    review.splice(1, review.length - 1);
    Array.prototype.push.apply(review, reviewRows);

    const previewSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_MIGRATION_PREVIEW);
    const reviewSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_IDENTITY_REVIEW);

    [
      { sheet: previewSheet, values: preview },
      { sheet: reviewSheet, values: review }
    ].forEach(function(item) {
      item.sheet.clearContents();
      centralAgfEnsureRows_(item.sheet, item.values.length);
      if (item.sheet.getMaxColumns() < header.length) {
        item.sheet.insertColumnsAfter(item.sheet.getMaxColumns(), header.length - item.sheet.getMaxColumns());
      }
      item.sheet.getRange(1, 1, item.values.length, header.length).setValues(item.values);
      item.sheet.setFrozenRows(1);
      if (item.sheet.getFilter()) item.sheet.getFilter().remove();
      if (item.values.length > 1) item.sheet.getRange(1, 1, item.values.length, header.length).createFilter();
    });

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      'PREVIA_MIGRACAO_PRONTA',
      'Prontos: ' + (counts.PRONTO_PREVIA || 0) +
      '; revisar: ' + (counts.REVISAR || 0) +
      '; não criar: ' + (counts.NAO_CRIAR_CLIENTE || 0) + '.'
    );

    return {
      ok: true,
      candidates: preview.length - 1,
      ready: counts.PRONTO_PREVIA || 0,
      review: counts.REVISAR || 0,
      doNotCreate: counts.NAO_CRIAR_CLIENTE || 0,
      elapsedMs: elapsedMs
    };
  });
}
