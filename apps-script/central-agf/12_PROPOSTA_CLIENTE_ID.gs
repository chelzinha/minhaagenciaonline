function centralAgfClienteIdDeterministico_(lotItemId) {
  const seed = 'CENTRAL_AGF_CLIENTE_V1|' + centralAgfNormalizeText_(lotItemId);
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    seed,
    Utilities.Charset.UTF_8
  );
  const hex = digest.map(function(byte) {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('').toUpperCase();
  return 'CLI_' + hex.slice(0, 20);
}

function centralAgfOrigemIdentidadeMigracao_(lotItemId) {
  return 'CENTRAL_AGF_V1|' + centralAgfNormalizeText_(lotItemId);
}

function centralAgfRazaoSocialOficialProposta_(type, canonical) {
  return centralAgfNormalizeText_(type) === 'AGF_RAZAO_SOCIAL'
    ? String(canonical || '').trim()
    : '';
}

function centralAgfLerResumoLoteSeguro_(ss) {
  const sheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_SAFE_MIGRATION_SUMMARY);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('20_RESUMO_LOTE_SEGURO vazio. Execute centralAgfGerarLoteSeguroMigracaoClientes() primeiro.');
  }
  const values = sheet.getDataRange().getValues();
  const map = centralAgfHeaderMap_(values[0]);
  ['GRUPO', 'ITEM', 'QTD'].forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatoria ausente em 20_RESUMO_LOTE_SEGURO: ' + name);
  });
  const result = Object.create(null);
  values.slice(1).forEach(function(row) {
    const group = centralAgfNormalizeText_(row[map.GRUPO]);
    const item = centralAgfNormalizeText_(row[map.ITEM]);
    if (!group || !item) return;
    result[group + '|' + item] = centralAgfNumero_(row[map.QTD]);
  });
  return result;
}

function centralAgfBuildMasterIndexes_(masterSheet) {
  const result = {
    byId: Object.create(null),
    byOrigin: Object.create(null),
    byCenterName: Object.create(null),
    rows: 0
  };
  if (!masterSheet || masterSheet.getLastRow() < 2) return result;

  const values = masterSheet.getDataRange().getValues();
  const map = centralAgfHeaderMap_(values[0]);
  ['CLIENTE_ID', 'NOME_EXIBICAO', 'CENTRO_ID_PRINCIPAL', 'ORIGEM_IDENTIDADE'].forEach(function(name) {
    if (map[name] == null) throw new Error('Coluna obrigatoria ausente em 01_CLIENTES_MASTER: ' + name);
  });

  values.slice(1).forEach(function(row) {
    const id = centralAgfNormalizeText_(row[map.CLIENTE_ID]);
    const origin = centralAgfNormalizeText_(row[map.ORIGEM_IDENTIDADE]);
    const center = centralAgfNormalizeText_(row[map.CENTRO_ID_PRINCIPAL]);
    const name = centralAgfNomeBasicoNormalizado_(row[map.NOME_EXIBICAO]);
    if (!id && !origin && !name) return;
    result.rows++;
    if (id) result.byId[id] = row;
    if (origin) result.byOrigin[origin] = row;
    if (center && name) result.byCenterName[center + '|' + name] = row;
  });

  result.headerMap = map;
  return result;
}

function centralAgfGerarPropostaClienteId() {
  return centralAgfWithScriptLock_(function() {
    centralAgfAssertHistoricoHomologado_();
    const startedAt = Date.now();
    const masterId = centralAgfGetRequiredProperty_(CENTRAL_AGF_CFG.PROPS.MASTER_SPREADSHEET_ID);
    const ss = SpreadsheetApp.openById(masterId);

    const summary = centralAgfLerResumoLoteSeguro_(ss);
    const safeExpected = Number(summary['LOTE|PRONTO_LOTE_SEGURO'] || 0);
    const conflictsExpected = Number(summary['LOTE|REVISAR_ANTES_MIGRACAO'] || 0);
    if (conflictsExpected !== 0) {
      throw new Error(
        'O lote seguro ainda possui ' + conflictsExpected +
        ' conflito(s). Zere 19_CONFLITOS_LOTE_SEGURO antes de propor CLIENTE_ID.'
      );
    }

    const safeSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_SAFE_MIGRATION_BATCH);
    if (!safeSheet || safeSheet.getLastRow() < 2) {
      throw new Error('18_LOTE_SEGURO_CLIENTES vazia. Execute centralAgfGerarLoteSeguroMigracaoClientes() primeiro.');
    }

    const safeValues = safeSheet.getDataRange().getValues();
    const safeMap = centralAgfHeaderMap_(safeValues[0]);
    [
      'LOTE_ITEM_ID', 'CENTRO_SUGERIDO', 'TIPO_IDENTIDADE', 'NOME_CANONICO',
      'OCORRENCIAS_TOTAL', 'FATURAMENTO_TOTAL', 'ESTRATEGIAS_ORIGEM',
      'LOCAIS_ORIGEM_OBSERVADOS', 'STATUS_LOTE'
    ].forEach(function(name) {
      if (safeMap[name] == null) throw new Error('Coluna obrigatoria ausente em 18_LOTE_SEGURO_CLIENTES: ' + name);
    });

    const safeRows = safeValues.slice(1).filter(function(row) {
      return centralAgfNormalizeText_(row[safeMap.STATUS_LOTE]) === 'PRONTO_LOTE_SEGURO';
    });
    if (safeRows.length !== safeExpected) {
      throw new Error(
        'Inconsistencia entre 18_LOTE_SEGURO_CLIENTES e 20_RESUMO_LOTE_SEGURO. ' +
        'Esperado=' + safeExpected + ', encontrado=' + safeRows.length + '.'
      );
    }

    const masterSheet = ss.getSheetByName(CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENTS);
    if (!masterSheet) throw new Error('Aba nao encontrada: ' + CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENTS);
    const masterIndexes = centralAgfBuildMasterIndexes_(masterSheet);

    centralAgfSetPanelStatus_(
      'GERANDO_PROPOSTA_CLIENTE_ID',
      safeRows.length + ' identidades do lote seguro; nenhuma escrita em 01_CLIENTES_MASTER.'
    );

    const proposalHeader = [
      'CLIENTE_ID_PROPOSTO', 'LOTE_ITEM_ID', 'NOME_EXIBICAO', 'RAZAO_SOCIAL_OFICIAL',
      'NOME_FANTASIA', 'CNPJ_CPF', 'TIPO_CLIENTE', 'CENTRO_ID_PRINCIPAL',
      'LOCAL_ID_PRINCIPAL', 'STATUS_CADASTRO', 'ORIGEM_IDENTIDADE', 'CONFIRMADO_MANUAL',
      'OBSERVACOES', 'TIPO_IDENTIDADE_ORIGEM', 'ESTRATEGIAS_ORIGEM',
      'LOCAIS_ORIGEM_OBSERVADOS', 'OCORRENCIAS_REFERENCIA', 'FATURAMENTO_REFERENCIA',
      'STATUS_PROPOSTA', 'MOTIVO'
    ];
    const conflictHeader = [
      'CLIENTE_ID_PROPOSTO', 'LOTE_ITEM_ID', 'CENTRO_ID_PRINCIPAL', 'NOME_EXIBICAO',
      'TIPO_IDENTIDADE_ORIGEM', 'STATUS_CONFLITO', 'MOTIVO_CONFLITO'
    ];
    const proposalOut = [proposalHeader];
    const conflictOut = [conflictHeader];
    const summaryOut = [['GRUPO', 'ITEM', 'QTD']];

    const seenLot = Object.create(null);
    const seenId = Object.create(null);
    const seenCenterName = Object.create(null);
    let proposedNew = 0;
    let alreadyInMaster = 0;
    let conflicts = 0;

    safeRows.forEach(function(row) {
      const lotItemId = centralAgfNormalizeText_(row[safeMap.LOTE_ITEM_ID]);
      const center = centralAgfNormalizeText_(row[safeMap.CENTRO_SUGERIDO]);
      const type = centralAgfNormalizeText_(row[safeMap.TIPO_IDENTIDADE]);
      const canonical = String(row[safeMap.NOME_CANONICO] || '').trim();
      const canonicalNorm = centralAgfNomeBasicoNormalizado_(canonical);
      const clientId = centralAgfClienteIdDeterministico_(lotItemId);
      const origin = centralAgfOrigemIdentidadeMigracao_(lotItemId);
      const centerNameKey = center + '|' + canonicalNorm;
      const problems = [];
      let status = 'PRONTO_PROPOSTA_ID';
      let motive = 'ID_DETERMINISTICO_A_PARTIR_DO_LOTE_ITEM_ID';

      if (!lotItemId) problems.push('LOTE_ITEM_ID_VAZIO');
      if (!canonicalNorm || centralAgfIsPlaceholderName_(canonical)) problems.push('NOME_CANONICO_INVALIDO');
      if (['CTR_AGF', 'CTR_METRO'].indexOf(center) < 0) problems.push('CENTRO_INVALIDO');
      if (!centralAgfLoteIdentityCenterCompatible_(type, center)) problems.push('TIPO_INCOMPATIVEL_COM_CENTRO');
      if (seenLot[lotItemId]) problems.push('LOTE_ITEM_ID_DUPLICADO_NA_ENTRADA');
      if (seenId[clientId] && seenId[clientId] !== lotItemId) problems.push('COLISAO_CLIENTE_ID_NA_PROPOSTA');
      if (seenCenterName[centerNameKey] && seenCenterName[centerNameKey] !== lotItemId) {
        problems.push('CENTRO_E_NOME_DUPLICADOS_NA_PROPOSTA');
      }

      const existingByOrigin = masterIndexes.byOrigin[origin];
      const existingById = masterIndexes.byId[clientId];
      const existingByCenterName = masterIndexes.byCenterName[centerNameKey];
      const masterMap = masterIndexes.headerMap || {};

      if (existingByOrigin) {
        const existingId = centralAgfNormalizeText_(existingByOrigin[masterMap.CLIENTE_ID]);
        if (existingId && existingId !== clientId) {
          problems.push('ORIGEM_JA_EXISTE_MASTER_COM_OUTRO_CLIENTE_ID');
        } else {
          status = 'JA_EXISTE_MASTER';
          motive = 'MESMA_ORIGEM_IDENTIDADE_JA_PERSISTIDA';
        }
      }

      if (existingById && !existingByOrigin) {
        const existingOrigin = centralAgfNormalizeText_(existingById[masterMap.ORIGEM_IDENTIDADE]);
        if (existingOrigin !== origin) problems.push('CLIENTE_ID_JA_USADO_POR_OUTRA_ORIGEM');
      }

      if (existingByCenterName && !existingByOrigin) {
        const existingIdForName = centralAgfNormalizeText_(existingByCenterName[masterMap.CLIENTE_ID]);
        if (existingIdForName && existingIdForName !== clientId) {
          problems.push('MESMO_CENTRO_E_NOME_JA_EXISTE_MASTER_COM_OUTRO_ID');
        }
      }

      seenLot[lotItemId] = true;
      seenId[clientId] = lotItemId;
      seenCenterName[centerNameKey] = lotItemId;

      if (problems.length) {
        conflicts++;
        conflictOut.push([
          clientId, lotItemId, center, canonical, type,
          'REVISAR_PROPOSTA_ID', problems.join(' | ')
        ]);
        return;
      }

      if (status === 'JA_EXISTE_MASTER') alreadyInMaster++;
      else proposedNew++;

      proposalOut.push([
        clientId,
        lotItemId,
        canonical,
        centralAgfRazaoSocialOficialProposta_(type, canonical),
        '',
        '',
        'CLIENTE',
        center,
        '',
        'PENDENTE_HOMOLOGACAO',
        origin,
        'NAO',
        'Proposta derivada do lote seguro. LOCAL_ID_PRINCIPAL permanece vazio ate homologacao do vinculo Centro/Local.',
        type,
        row[safeMap.ESTRATEGIAS_ORIGEM],
        row[safeMap.LOCAIS_ORIGEM_OBSERVADOS],
        centralAgfNumero_(row[safeMap.OCORRENCIAS_TOTAL]),
        Math.round(centralAgfNumero_(row[safeMap.FATURAMENTO_TOTAL]) * 100) / 100,
        status,
        motive
      ]);
    });

    proposalOut.splice(1, proposalOut.length - 1);
    const proposalRows = safeRows.length - conflicts;
    const sortedProposalRows = [];
    // Reconstrucao deterministica: percorre novamente os dados produzidos acima via buffer temporario.
    // Como proposalOut foi resetado, regeneramos a partir dos resultados sem conflito abaixo.
    // Para evitar estado paralelo complexo, usamos as linhas ja calculadas em uma segunda passagem leve.
    // Esta passagem nao relê planilhas nem altera o Master.
    const buffered = [];
    const conflictLotIds = Object.create(null);
    conflictOut.slice(1).forEach(function(row) { conflictLotIds[centralAgfNormalizeText_(row[1])] = true; });

    safeRows.forEach(function(row) {
      const lotItemId = centralAgfNormalizeText_(row[safeMap.LOTE_ITEM_ID]);
      if (conflictLotIds[lotItemId]) return;
      const center = centralAgfNormalizeText_(row[safeMap.CENTRO_SUGERIDO]);
      const type = centralAgfNormalizeText_(row[safeMap.TIPO_IDENTIDADE]);
      const canonical = String(row[safeMap.NOME_CANONICO] || '').trim();
      const clientId = centralAgfClienteIdDeterministico_(lotItemId);
      const origin = centralAgfOrigemIdentidadeMigracao_(lotItemId);
      const existingByOrigin = masterIndexes.byOrigin[origin];
      const status = existingByOrigin ? 'JA_EXISTE_MASTER' : 'PRONTO_PROPOSTA_ID';
      const motive = existingByOrigin
        ? 'MESMA_ORIGEM_IDENTIDADE_JA_PERSISTIDA'
        : 'ID_DETERMINISTICO_A_PARTIR_DO_LOTE_ITEM_ID';
      buffered.push([
        clientId,
        lotItemId,
        canonical,
        centralAgfRazaoSocialOficialProposta_(type, canonical),
        '',
        '',
        'CLIENTE',
        center,
        '',
        'PENDENTE_HOMOLOGACAO',
        origin,
        'NAO',
        'Proposta derivada do lote seguro. LOCAL_ID_PRINCIPAL permanece vazio ate homologacao do vinculo Centro/Local.',
        type,
        row[safeMap.ESTRATEGIAS_ORIGEM],
        row[safeMap.LOCAIS_ORIGEM_OBSERVADOS],
        centralAgfNumero_(row[safeMap.OCORRENCIAS_TOTAL]),
        Math.round(centralAgfNumero_(row[safeMap.FATURAMENTO_TOTAL]) * 100) / 100,
        status,
        motive
      ]);
    });

    buffered.sort(function(a, b) {
      const centerCmp = String(a[7]).localeCompare(String(b[7]));
      if (centerCmp) return centerCmp;
      return String(a[2]).localeCompare(String(b[2]));
    });
    Array.prototype.push.apply(proposalOut, buffered);

    summaryOut.push(['ENTRADA', 'LOTE_SEGURO', safeRows.length]);
    summaryOut.push(['PROPOSTA', 'PRONTO_PROPOSTA_ID', proposedNew]);
    summaryOut.push(['PROPOSTA', 'JA_EXISTE_MASTER', alreadyInMaster]);
    summaryOut.push(['PROPOSTA', 'TOTAL_SEM_CONFLITO', proposalRows]);
    summaryOut.push(['PROPOSTA', 'CONFLITOS', conflicts]);
    summaryOut.push(['REGRA', 'LOCAL_ID_PRINCIPAL_PREENCHIDO_AUTOMATICAMENTE', 0]);
    summaryOut.push(['REGRA', 'ESCRITAS_EM_01_CLIENTES_MASTER', 0]);

    const proposalSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENT_ID_PROPOSAL);
    const conflictSheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENT_ID_PROPOSAL_CONFLICTS);
    const summarySheet = centralAgfGetOrCreateSheet_(ss, CENTRAL_AGF_CFG.SHEETS.MASTER_CLIENT_ID_PROPOSAL_SUMMARY);

    centralAgfLoteWriteDerivedSheet_(proposalSheet, proposalOut, proposalHeader);
    centralAgfLoteWriteDerivedSheet_(conflictSheet, conflictOut, conflictHeader);
    centralAgfLoteWriteDerivedSheet_(summarySheet, summaryOut, summaryOut[0]);

    const elapsedMs = Date.now() - startedAt;
    centralAgfSetPanelStatus_(
      'PROPOSTA_CLIENTE_ID_PRONTA',
      'Lote=' + safeRows.length +
      '; novos=' + proposedNew +
      '; ja existentes=' + alreadyInMaster +
      '; conflitos=' + conflicts +
      '. Nenhuma escrita em 01_CLIENTES_MASTER.'
    );

    return {
      ok: true,
      safeInput: safeRows.length,
      proposedNew: proposedNew,
      alreadyInMaster: alreadyInMaster,
      conflicts: conflicts,
      elapsedMs: elapsedMs
    };
  });
}
