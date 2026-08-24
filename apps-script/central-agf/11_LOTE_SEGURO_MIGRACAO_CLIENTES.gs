function centralAgfLoteStableId_(center, canonical) {
  const text = centralAgfNormalizeText_(center) + '|' + centralAgfNomeBasicoNormalizado_(canonical);
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  const hex = digest.map(function(byte) {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('').toUpperCase();
  return 'LOT_' + hex.slice(0, 16);
}

function centralAgfLoteAddDistinctValue_(bucket, value) {
  const text = String(value == null ? '' : value).trim();
  if (text) bucket[text] = true;
}

function centralAgfLoteList_(bucket, limit) {
  return centralAgfDistinctList_(bucket || Object.create(null), limit || 12);
}

function centralAgfLoteMinDate_(current, value) {
  const parsed = centralAgfParseDate_(value);
  if (!parsed) return current;
  return !current || parsed < current ? parsed : current;
}

function centralAgfLoteMaxDate_(current, value) {
  const parsed = centralAgfParseDate_(value);
  if (!parsed) return current;
  return !current || parsed > current ? parsed : current;
}

function centralAgfLoteAllowedStrategy_(strategy) {
  return [
    'ALIAS_MANUAL_LEGADO',
    'ALIAS_EXATO_NORM_LEGADO',
    'RAZAO_SOCIAL_AGF'
  ].indexOf(centralAgfNormalizeText_(strategy)) >= 0;
}

function centralAgfLoteIdentityCenterCompatible_(type, center) {
  const normalizedType = centralAgfNormalizeText_(type);
  const normalizedCenter = centralAgfNormalizeText_(center);
  if (normalizedType === 'AGF_BALCAO_REMETENTE' || normalizedType === 'AGF_RAZAO_SOCIAL') {
    return normalizedCenter === 'CTR_AGF';
  }
  if (normalizedType === 'METRO_REMETENTE') {
    return normalizedCenter === 'CTR_METRO';
  }
  return false;
}

/**
 * Resolve o tipo consolidado sem transformar canal de postagem em conflito de identidade.
 * No AGF, a mesma entidade pode aparecer em postagem de Balcao e em postagem contratada.
 * Quando Centro e nome canonico sao exatamente os mesmos e as unicas evidencias sao
 * AGF_BALCAO_REMETENTE + AGF_RAZAO_SOCIAL, a identidade contratada prevalece como
 * autoridade cadastral e o remetente de Balcao permanece como alias/evidencia.
 */
function centralAgfLoteResolveIdentityType_(typeKeys, center) {
  const normalizedCenter = centralAgfNormalizeText_(center);
  const types = (typeKeys || []).map(centralAgfNormalizeText_).filter(Boolean).sort();

  if (types.length === 1) {
    return {
      ok: centralAgfLoteIdentityCenterCompatible_(types[0], normalizedCenter),
      type: types[0],
      motive: 'TIPO_UNICO_COMPATIVEL_COM_CENTRO'
    };
  }

  const agfDual = normalizedCenter === 'CTR_AGF' &&
    types.length === 2 &&
    types[0] === 'AGF_BALCAO_REMETENTE' &&
    types[1] === 'AGF_RAZAO_SOCIAL';

  if (agfDual) {
    return {
      ok: true,
      type: 'AGF_RAZAO_SOCIAL',
      motive: 'AGF_CONTRATO_PREVALECE_SOB_BALCAO_MESMO_CANONICO'
    };
  }

  return {
    ok: false,
    type: '',
    motive: 'TIPOS_IDENTIDADE_DIFERENTES_NO_MESMO_CANONICO'
  };
}

function centralAgfLoteWriteDerivedSheet_(sheet, values, header) {
  sheet.clearContents();
  centralAgfEnsureRows_(sheet, values.length);
  if (sheet.getMaxColumns() < header.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, values.length, header.length).setValues(values);
  sheet.setFrozenRows(1);
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (values.length > 1) sheet.getRange(1, 1, values.length, header.length).createFilter();
}

/**
 * Consolida somente candidatos PRONTO_PREVIA em identidades unicas por Centro + nome canonico.
 * A rotina e apenas derivada: nao cria CLIENTE_ID, nao grava no Master e nao altera fatos.
 * Qualquer colisao estrutural real sai do lote seguro e vai para a aba de conflitos.
 */
function centralAgfGerarLoteSeguroMigracaoClientes() {
  return centralAgfWithScriptLock_(function() {
    centralAgfAssertHistoricoHomologado_();
    const startedAt = Date.now();
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(masterId);
    const previewSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_MIGRATION_PREVIEW);
    if (!previewSheet || previewSheet.getLastRow() < 2) {
      throw new Error('14_PREVIA_MIGRACAO_CLIENTES vazia. Execute centralAgfGerarPreviaMigracaoClientes() primeiro.');
    }

    const values = previewSheet.getDataRange().getValues();
    const map = centralAgfHeaderMap_(values[0]);
    [
      'CHAVE_DIAGNOSTICO', 'TIPO_IDENTIDADE', 'CENTRO_SUGERIDO', 'NOME_CANONICO_SUGERIDO',
      'ESTRATEGIA_SUGERIDA', 'ALIAS_ORIGEM_ID', 'OCORRENCIAS', 'FATURAMENTO_TOTAL',
      'PRIMEIRA_POSTAGEM', 'ULTIMA_POSTAGEM', 'RAZOES_SOCIAIS_OBSERVADAS',
      'VARIANTES_NOME', 'LOCAIS_ORIGEM_OBSERVADOS', 'STATUS_PREVIA'
    ].forEach(function(name) {
      if (map[name] == null) {
        throw new Error('Coluna obrigatoria ausente em 14_PREVIA_MIGRACAO_CLIENTES: ' + name);
      }
    });

    centralAgfSetPanelStatus_('GERANDO_LOTE_SEGURO_CLIENTES', 'Consolidando candidatos PRONTO_PREVIA sem escrever no Cadastro Mestre.');

    const groups = Object.create(null);
    const canonicalCenters = Object.create(null);
    let readyInputRows = 0;
    let readyInputBilling = 0;

    values.slice(1).forEach(function(row) {
      if (centralAgfNormalizeText_(row[map.STATUS_PREVIA]) !== 'PRONTO_PREVIA') return;

      const center = centralAgfNormalizeText_(row[map.CENTRO_SUGERIDO]);
      const canonical = String(row[map.NOME_CANONICO_SUGERIDO] || '').trim();
      const canonicalNorm = centralAgfNomeBasicoNormalizado_(canonical);
      const type = centralAgfNormalizeText_(row[map.TIPO_IDENTIDADE]);
      const strategy = centralAgfNormalizeText_(row[map.ESTRATEGIA_SUGERIDA]);
      const key = center + '|' + canonicalNorm;

      readyInputRows++;
      readyInputBilling += centralAgfNumero_(row[map.FATURAMENTO_TOTAL]);

      if (!canonicalCenters[canonicalNorm]) canonicalCenters[canonicalNorm] = Object.create(null);
      if (center) canonicalCenters[canonicalNorm][center] = true;

      let item = groups[key];
      if (!item) {
        item = groups[key] = {
          key: key,
          center: center,
          canonicalNorm: canonicalNorm,
          canonicalVariants: Object.create(null),
          types: Object.create(null),
          strategies: Object.create(null),
          aliasIds: Object.create(null),
          reasons: Object.create(null),
          variants: Object.create(null),
          locals: Object.create(null),
          rows: 0,
          occurrences: 0,
          billing: 0,
          firstDate: null,
          lastDate: null
        };
      }

      item.rows++;
      item.occurrences += centralAgfNumero_(row[map.OCORRENCIAS]);
      item.billing += centralAgfNumero_(row[map.FATURAMENTO_TOTAL]);
      item.firstDate = centralAgfLoteMinDate_(item.firstDate, row[map.PRIMEIRA_POSTAGEM]);
      item.lastDate = centralAgfLoteMaxDate_(item.lastDate, row[map.ULTIMA_POSTAGEM]);

      centralAgfLoteAddDistinctValue_(item.canonicalVariants, canonical);
      centralAgfLoteAddDistinctValue_(item.types, type);
      centralAgfLoteAddDistinctValue_(item.strategies, strategy);
      centralAgfLoteAddDistinctValue_(item.aliasIds, row[map.ALIAS_ORIGEM_ID]);
      centralAgfSplitDistinctList_(row[map.RAZOES_SOCIAIS_OBSERVADAS]).forEach(function(value) {
        centralAgfLoteAddDistinctValue_(item.reasons, value);
      });
      centralAgfSplitDistinctList_(row[map.VARIANTES_NOME]).forEach(function(value) {
        centralAgfLoteAddDistinctValue_(item.variants, value);
      });
      centralAgfSplitDistinctList_(row[map.LOCAIS_ORIGEM_OBSERVADOS]).forEach(function(value) {
        centralAgfLoteAddDistinctValue_(item.locals, value);
      });
    });

    const safeHeader = [
      'LOTE_ITEM_ID', 'CENTRO_SUGERIDO', 'TIPO_IDENTIDADE', 'NOME_CANONICO',
      'QTD_DIAGNOSTICOS_AGRUPADOS', 'OCORRENCIAS_TOTAL', 'FATURAMENTO_TOTAL',
      'PRIMEIRA_POSTAGEM', 'ULTIMA_POSTAGEM', 'ESTRATEGIAS_ORIGEM', 'ALIAS_ORIGEM_IDS',
      'RAZOES_SOCIAIS_OBSERVADAS', 'VARIANTES_NOME', 'LOCAIS_ORIGEM_OBSERVADOS',
      'STATUS_LOTE', 'MOTIVO'
    ];
    const conflictHeader = [
      'LOTE_ITEM_ID', 'CENTRO_SUGERIDO', 'NOME_CANONICO', 'CENTROS_CANONICO',
      'TIPOS_IDENTIDADE', 'ESTRATEGIAS_ORIGEM', 'QTD_DIAGNOSTICOS_AGRUPADOS',
      'OCORRENCIAS_TOTAL', 'FATURAMENTO_TOTAL', 'PRIMEIRA_POSTAGEM', 'ULTIMA_POSTAGEM',
      'RAZOES_SOCIAIS_OBSERVADAS', 'VARIANTES_NOME', 'LOCAIS_ORIGEM_OBSERVADOS',
      'STATUS_LOTE', 'MOTIVO_CONFLITO'
    ];
    const safeOut = [safeHeader];
    const conflictOut = [conflictHeader];
    const summaryRows = [['GRUPO', 'ITEM', 'QTD', 'FATURAMENTO_TOTAL']];
    const safeByCenter = Object.create(null);
    const conflictReasons = Object.create(null);
    let safeBilling = 0;
    let conflictBilling = 0;
    let agfDualChannelConsolidated = 0;

    Object.keys(groups).forEach(function(key) {
      const item = groups[key];
      const typeKeys = Object.keys(item.types);
      const strategyKeys = Object.keys(item.strategies);
      const centerKeys = Object.keys(canonicalCenters[item.canonicalNorm] || {});
      const canonicalDisplay = Object.keys(item.canonicalVariants).sort()[0] || '';
      const problems = [];
      const typeResolution = centralAgfLoteResolveIdentityType_(typeKeys, item.center);

      if (!item.canonicalNorm || !canonicalDisplay || centralAgfIsPlaceholderName_(canonicalDisplay)) {
        problems.push('CANONICO_INVALIDO_OU_PLACEHOLDER');
      }
      if (['CTR_AGF', 'CTR_METRO'].indexOf(item.center) < 0) {
        problems.push('CENTRO_NAO_RECONHECIDO');
      }
      if (centerKeys.length > 1) {
        problems.push('MESMO_CANONICO_EM_CENTROS_DIFERENTES');
      }
      if (!typeResolution.ok) {
        problems.push(typeResolution.motive);
      }
      if (!strategyKeys.length || strategyKeys.some(function(strategy) { return !centralAgfLoteAllowedStrategy_(strategy); })) {
        problems.push('ESTRATEGIA_NAO_PERMITIDA_NO_LOTE_SEGURO');
      }

      const stableId = centralAgfLoteStableId_(item.center, canonicalDisplay);
      const billingRounded = Math.round(item.billing * 100) / 100;

      if (problems.length) {
        conflictBilling += item.billing;
        problems.forEach(function(problem) {
          conflictReasons[problem] = (conflictReasons[problem] || 0) + 1;
        });
        conflictOut.push([
          stableId,
          item.center,
          canonicalDisplay,
          centerKeys.sort().join(' | '),
          typeKeys.sort().join(' | '),
          strategyKeys.sort().join(' | '),
          item.rows,
          item.occurrences,
          billingRounded,
          item.firstDate || '',
          item.lastDate || '',
          centralAgfLoteList_(item.reasons, 8),
          centralAgfLoteList_(item.variants, 12),
          centralAgfLoteList_(item.locals, 10),
          'REVISAR_ANTES_MIGRACAO',
          problems.join(' | ')
        ]);
        return;
      }

      if (typeResolution.motive === 'AGF_CONTRATO_PREVALECE_SOB_BALCAO_MESMO_CANONICO') {
        agfDualChannelConsolidated++;
      }

      safeBilling += item.billing;
      safeByCenter[item.center] = (safeByCenter[item.center] || 0) + 1;
      safeOut.push([
        stableId,
        item.center,
        typeResolution.type,
        canonicalDisplay,
        item.rows,
        item.occurrences,
        billingRounded,
        item.firstDate || '',
        item.lastDate || '',
        strategyKeys.sort().join(' | '),
        centralAgfLoteList_(item.aliasIds, 12),
        centralAgfLoteList_(item.reasons, 8),
        centralAgfLoteList_(item.variants, 12),
        centralAgfLoteList_(item.locals, 10),
        'PRONTO_LOTE_SEGURO',
        typeResolution.motive === 'AGF_CONTRATO_PREVALECE_SOB_BALCAO_MESMO_CANONICO'
          ? 'MESMA_IDENTIDADE_AGF_EM_BALCAO_E_CONTRATO; RAZAO_SOCIAL_PREVALECE'
          : 'IDENTIDADE_UNICA_POR_CENTRO_E_CANONICO'
      ]);
    });

    const safeRows = safeOut.slice(1).sort(function(a, b) {
      return Number(b[6] || 0) - Number(a[6] || 0);
    });
    const conflictRows = conflictOut.slice(1).sort(function(a, b) {
      return Number(b[8] || 0) - Number(a[8] || 0);
    });
    safeOut.splice(1, safeOut.length - 1);
    Array.prototype.push.apply(safeOut, safeRows);
    conflictOut.splice(1, conflictOut.length - 1);
    Array.prototype.push.apply(conflictOut, conflictRows);

    summaryRows.push(['ENTRADA', 'PRONTO_PREVIA', readyInputRows, Math.round(readyInputBilling * 100) / 100]);
    summaryRows.push(['CONSOLIDACAO', 'IDENTIDADES_UNICAS_CENTRO_CANONICO', Object.keys(groups).length, Math.round(readyInputBilling * 100) / 100]);
    summaryRows.push(['CONSOLIDACAO_REGRA', 'AGF_BALCAO_E_CONTRATO_MESMO_CANONICO', agfDualChannelConsolidated, '']);
    summaryRows.push(['LOTE', 'PRONTO_LOTE_SEGURO', safeOut.length - 1, Math.round(safeBilling * 100) / 100]);
    summaryRows.push(['LOTE', 'REVISAR_ANTES_MIGRACAO', conflictOut.length - 1, Math.round(conflictBilling * 100) / 100]);
    Object.keys(safeByCenter).sort().forEach(function(center) {
      summaryRows.push(['LOTE_CENTRO', center, safeByCenter[center], '']);
    });
    Object.keys(conflictReasons).sort().forEach(function(reason) {
      summaryRows.push(['CONFLITO_MOTIVO', reason, conflictReasons[reason], '']);
    });

    const safeSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_SAFE_MIGRATION_BATCH);
    const conflictSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_SAFE_MIGRATION_CONFLICTS);
    const summarySheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_SAFE_MIGRATION_SUMMARY);

    centralAgfLoteWriteDerivedSheet_(safeSheet, safeOut, safeHeader);
    centralAgfLoteWriteDerivedSheet_(conflictSheet, conflictOut, conflictHeader);
    centralAgfLoteWriteDerivedSheet_(summarySheet, summaryRows, summaryRows[0]);

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      'LOTE_SEGURO_CLIENTES_PRONTO',
      'Entrada pronta: ' + readyInputRows +
      '; identidades consolidadas: ' + Object.keys(groups).length +
      '; lote seguro: ' + (safeOut.length - 1) +
      '; conflitos: ' + (conflictOut.length - 1) +
      '; AGF Balcao+contrato consolidados: ' + agfDualChannelConsolidated +
      '. Nenhum CLIENTE_ID foi criado.'
    );

    return {
      ok: true,
      readyInputRows: readyInputRows,
      consolidatedIdentities: Object.keys(groups).length,
      safeBatch: safeOut.length - 1,
      conflicts: conflictOut.length - 1,
      agfDualChannelConsolidated: agfDualChannelConsolidated,
      elapsedMs: elapsedMs
    };
  });
}
