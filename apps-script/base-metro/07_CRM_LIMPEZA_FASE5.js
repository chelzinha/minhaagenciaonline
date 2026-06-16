/**
 * 07_CRM_LIMPEZA_FASE5.gs
 * ------------------------------------------------------------
 * Fase 5 — Remoção controlada do legado de COLETAS.
 *
 * Objetivo:
 * - impedir recriação automática de estruturas de COLETAS;
 * - gerar backup técnico externo antes da remoção física;
 * - remover registros, colunas e regras exclusivas de COLETAS;
 * - preservar Agenda Comercial, tratativas, Prospects e CRM atuais;
 * - manter o processo explícito e reversível por reimplantação + backup.
 *
 * IMPORTANTE:
 * - publique primeiro este código;
 * - execute previewRemocaoColetasFase5();
 * - execute backupAntesRemocaoColetasFase5();
 * - somente então execute removeColetasFase5('EXCLUIR_COLETAS');
 */

var CRM5_CFG = {
  VERSION: '5.0.1',
  CONFIRM_DELETE: 'EXCLUIR_COLETAS',
  PROPS: {
    BACKUP_ID: 'crm5_coletas_backup_file_id',
    BACKUP_URL: 'crm5_coletas_backup_url',
    BACKUP_AT: 'crm5_coletas_backup_at',
    REMOVED_AT: 'crm5_coletas_removed_at',
    REMOVED_VERSION: 'crm5_coletas_removed_version'
  },
  SHEETS: {
    LEGACY_COLETAS: 'COLETAS_EXECUCAO',
    AGENDA: 'AGENDA_EXECUCAO',
    BLOCKS: 'AGENDA_BLOCOS',
    PROSPECTS: 'PROSPECTS',
    CHECKLIST: 'CRM_VISITA_CHECKLIST',
    INTERACOES: 'CRM_INTERACOES',
    TRANSICOES: 'CRM_TRANSICOES',
    EVENTOS: 'CRM_EVENTOS',
    MIDIAS: 'MIDIAS_CRM',
    TIPOS_ATIVIDADE: 'CRM_TIPOS_ATIVIDADE',
    RESULTADOS_ATIVIDADE: 'CRM_RESULTADOS_ATIVIDADE',
    ETAPAS_FUNIL: 'CRM_FUNIL_ETAPAS'
  },
  PROSPECT_COLUMNS_TO_REMOVE: ['USA_COLETA_CORREIOS', 'INTERESSE_COLETA'],
  CHECKLIST_COLUMNS_TO_REMOVE: ['SOLICITA_COLETA_POR', 'APRESENTOU_PORTAL_COLETA', 'USA_COLETA_CORREIOS', 'INTERESSE_COLETA']
};

/* ========================= API PÚBLICA ========================= */

function getStatusRemocaoColetasFase5() {
  var props = PropertiesService.getScriptProperties();
  var preview = crm5_previewUnlocked_();
  return {
    ok: preview.ok,
    version: CRM5_CFG.VERSION,
    backupId: props.getProperty(CRM5_CFG.PROPS.BACKUP_ID) || '',
    backupUrl: props.getProperty(CRM5_CFG.PROPS.BACKUP_URL) || '',
    backupAt: props.getProperty(CRM5_CFG.PROPS.BACKUP_AT) || '',
    removedAt: props.getProperty(CRM5_CFG.PROPS.REMOVED_AT) || '',
    removedVersion: props.getProperty(CRM5_CFG.PROPS.REMOVED_VERSION) || '',
    preview: preview
  };
}

function previewRemocaoColetasFase5() {
  return crm5_previewUnlocked_();
}

function backupAntesRemocaoColetasFase5() {
  return op_withDocumentLock_(function(){
    return crm5_backupUnlocked_(true);
  });
}

/**
 * Wrapper seguro para execução manual pelo editor do Apps Script.
 * O botão Executar do editor não permite informar argumentos diretamente.
 * Use esta função depois de conferir o preview e o backup.
 */
function executarRemocaoColetasConfirmadaFase5() {
  return removeColetasFase5(CRM5_CFG.CONFIRM_DELETE);
}

function removeColetasFase5(confirmacao) {
  return op_withDocumentLock_(function(){
    crm5_assertConfirmation_(confirmacao);
    var ss = op_getSpreadsheet_();
    var before = crm5_previewUnlocked_();
    var backup = crm5_backupUnlocked_(false);
    var result = {
      ok: true,
      version: CRM5_CFG.VERSION,
      backup: backup,
      before: before,
      deleted: {},
      normalized: {}
    };

    result.deleted.legacySheet = crm5_deleteSheetIfExists_(ss, CRM5_CFG.SHEETS.LEGACY_COLETAS);
    result.deleted.agendaRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.AGENDA), ['TIPO_ATIVIDADE', 'TIPO_ATIVIDADE_ID', 'RESULTADO_ID', 'OBS_EXECUCAO', 'OBSERVACAO']);
    result.deleted.interactionRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.INTERACOES), ['TIPO_INTERACAO', 'TIPO_ATIVIDADE_ID', 'RESULTADO', 'RESULTADO_ID', 'OBSERVACAO']);
    result.deleted.eventRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.EVENTOS), ['TIPO_EVENTO', 'VALOR_ANTERIOR', 'VALOR_NOVO', 'METADADOS_JSON']);
    result.deleted.checklistRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.CHECKLIST), ['RESULTADO_VISITA', 'STATUS_VISITA']);
    result.deleted.transitionRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.TRANSICOES), null, 5);
    result.deleted.midiaRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.MIDIAS), ['ACAO', 'SUBCATEGORIA', 'CODIGO_MIDIA', 'NOME_MIDIA']);
    result.deleted.activityTypeRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.TIPOS_ATIVIDADE), ['TIPO_ATIVIDADE_ID', 'NOME_EXIBICAO', 'CATEGORIA']);
    result.deleted.activityResultRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.RESULTADOS_ATIVIDADE), ['RESULTADO_ID', 'TIPO_ATIVIDADE_ID', 'NOME_EXIBICAO']);
    result.deleted.funnelStageRows = crm5_deleteRowsWithColeta_(ss.getSheetByName(CRM5_CFG.SHEETS.ETAPAS_FUNIL), ['ETAPA_ID', 'NOME_EXIBICAO']);

    result.deleted.prospectColumns = crm5_deleteColumnsByHeader_(ss.getSheetByName(CRM5_CFG.SHEETS.PROSPECTS), CRM5_CFG.PROSPECT_COLUMNS_TO_REMOVE);
    result.deleted.checklistColumns = crm5_deleteColumnsByHeader_(ss.getSheetByName(CRM5_CFG.SHEETS.CHECKLIST), CRM5_CFG.CHECKLIST_COLUMNS_TO_REMOVE);

    result.normalized.blocks = crm5_normalizeAgendaBlocks_(ss.getSheetByName(CRM5_CFG.SHEETS.BLOCKS));
    result.normalized.prospectStages = crm5_normalizeProspectStages_(ss.getSheetByName(CRM5_CFG.SHEETS.PROSPECTS));
    result.normalized.midias = crm5_sanitizeMidias_(ss.getSheetByName(CRM5_CFG.SHEETS.MIDIAS));

    PropertiesService.getScriptProperties().setProperties({
      crm5_coletas_removed_at: op_nowIso_(),
      crm5_coletas_removed_version: CRM5_CFG.VERSION
    }, false);
    crm5_clearCaches_();

    result.after = crm5_previewUnlocked_();
    result.ok = result.after.residualTotal === 0;
    result.message = result.ok
      ? 'COLETAS removido da planilha ativa. Backup técnico externo preservado.'
      : 'Limpeza executada, mas ainda existem vestígios. Revise o campo after.';
    return result;
  });
}

function auditRemocaoColetasFase5() {
  var preview = crm5_previewUnlocked_();
  return {
    ok: preview.residualTotal === 0,
    version: CRM5_CFG.VERSION,
    residualTotal: preview.residualTotal,
    preview: preview,
    message: preview.residualTotal === 0
      ? 'Auditoria aprovada: nenhum vestígio operacional de COLETAS encontrado.'
      : 'Auditoria encontrou vestígios operacionais de COLETAS.'
  };
}

/* ========================= PREVIEW E BACKUP ========================= */

function crm5_previewUnlocked_() {
  var ss = op_getSpreadsheet_();
  var legacy = ss.getSheetByName(CRM5_CFG.SHEETS.LEGACY_COLETAS);
  var agenda = ss.getSheetByName(CRM5_CFG.SHEETS.AGENDA);
  var interacoes = ss.getSheetByName(CRM5_CFG.SHEETS.INTERACOES);
  var eventos = ss.getSheetByName(CRM5_CFG.SHEETS.EVENTOS);
  var checklist = ss.getSheetByName(CRM5_CFG.SHEETS.CHECKLIST);
  var transicoes = ss.getSheetByName(CRM5_CFG.SHEETS.TRANSICOES);
  var prospects = ss.getSheetByName(CRM5_CFG.SHEETS.PROSPECTS);
  var blocks = ss.getSheetByName(CRM5_CFG.SHEETS.BLOCKS);
  var midias = ss.getSheetByName(CRM5_CFG.SHEETS.MIDIAS);
  var tiposAtividade = ss.getSheetByName(CRM5_CFG.SHEETS.TIPOS_ATIVIDADE);
  var resultadosAtividade = ss.getSheetByName(CRM5_CFG.SHEETS.RESULTADOS_ATIVIDADE);
  var etapasFunil = ss.getSheetByName(CRM5_CFG.SHEETS.ETAPAS_FUNIL);

  var summary = {
    ok: true,
    version: CRM5_CFG.VERSION,
    legacySheetExists: !!legacy,
    legacySheetRows: legacy ? Math.max(0, legacy.getLastRow() - 1) : 0,
    agendaRows: crm5_countRowsWithColeta_(agenda, ['TIPO_ATIVIDADE', 'TIPO_ATIVIDADE_ID', 'RESULTADO_ID', 'OBS_EXECUCAO', 'OBSERVACAO']),
    interactionRows: crm5_countRowsWithColeta_(interacoes, ['TIPO_INTERACAO', 'TIPO_ATIVIDADE_ID', 'RESULTADO', 'RESULTADO_ID', 'OBSERVACAO']),
    eventRows: crm5_countRowsWithColeta_(eventos, ['TIPO_EVENTO', 'VALOR_ANTERIOR', 'VALOR_NOVO', 'METADADOS_JSON']),
    checklistRows: crm5_countRowsWithColeta_(checklist, ['RESULTADO_VISITA', 'STATUS_VISITA']),
    transitionRows: crm5_countRowsWithColeta_(transicoes, null, 5),
    prospectColumns: crm5_existingHeaders_(prospects, CRM5_CFG.PROSPECT_COLUMNS_TO_REMOVE),
    checklistColumns: crm5_existingHeaders_(checklist, CRM5_CFG.CHECKLIST_COLUMNS_TO_REMOVE),
    agendaBlocks: crm5_countRowsWithColeta_(blocks, ['TIPO_ATIVIDADE', 'NOME_BLOCO']),
    prospectStages: crm5_countRowsWithColeta_(prospects, ['ETAPA_FUNIL']),
    midias: crm5_countRowsWithColeta_(midias, ['ACAO', 'SUBCATEGORIA', 'CODIGO_MIDIA', 'NOME_MIDIA', 'QUANDO_USAR']),
    activityTypes: crm5_countRowsWithColeta_(tiposAtividade, ['TIPO_ATIVIDADE_ID', 'NOME_EXIBICAO', 'CATEGORIA']),
    activityResults: crm5_countRowsWithColeta_(resultadosAtividade, ['RESULTADO_ID', 'TIPO_ATIVIDADE_ID', 'NOME_EXIBICAO']),
    funnelStages: crm5_countRowsWithColeta_(etapasFunil, ['ETAPA_ID', 'NOME_EXIBICAO'])
  };
  summary.residualTotal =
    (summary.legacySheetExists ? 1 : 0) +
    summary.agendaRows + summary.interactionRows + summary.eventRows + summary.checklistRows + summary.transitionRows +
    summary.prospectColumns.length + summary.checklistColumns.length + summary.agendaBlocks + summary.prospectStages + summary.midias +
    summary.activityTypes + summary.activityResults + summary.funnelStages;
  return summary;
}

function crm5_backupUnlocked_(forceNew) {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty(CRM5_CFG.PROPS.BACKUP_ID) || '';
  var existingUrl = props.getProperty(CRM5_CFG.PROPS.BACKUP_URL) || '';
  var existingAt = props.getProperty(CRM5_CFG.PROPS.BACKUP_AT) || '';
  if (!forceNew && existingId) {
    return { ok:true, created:false, backupId:existingId, backupUrl:existingUrl, backupAt:existingAt };
  }

  var ts = Utilities.formatDate(new Date(), OP_CFG.TZ || 'America/Fortaleza', 'yyyyMMdd_HHmmss');
  var source = DriveApp.getFileById(OP_CFG.SPREADSHEET_ID);
  var copy = source.makeCopy('BACKUP_PRE_FASE5_COLETAS_' + ts + '_' + source.getName());
  var url = 'https://docs.google.com/spreadsheets/d/' + copy.getId() + '/edit';
  var now = op_nowIso_();
  props.setProperties({
    crm5_coletas_backup_file_id: copy.getId(),
    crm5_coletas_backup_url: url,
    crm5_coletas_backup_at: now
  }, false);
  return { ok:true, created:true, backupId:copy.getId(), backupUrl:url, backupAt:now };
}

/* ========================= LIMPEZA ========================= */

function crm5_deleteSheetIfExists_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { existed:false, deleted:false, rows:0 };
  var rows = Math.max(0, sh.getLastRow() - 1);
  ss.deleteSheet(sh);
  return { existed:true, deleted:true, rows:rows };
}

function crm5_deleteRowsWithColeta_(sh, headers, firstDataRow) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var values = sh.getDataRange().getValues();
  if (!values.length) return 0;
  var hm = op_buildHeaderMap_(values[0]);
  var start = Math.max(2, Number(firstDataRow || 2));
  var rowIndexes = [];
  for (var sheetRow = start; sheetRow <= values.length; sheetRow++) {
    var row = values[sheetRow - 1];
    if (crm5_rowHasColeta_(row, hm, headers)) rowIndexes.push(sheetRow);
  }
  crm5_deleteRowsGrouped_(sh, rowIndexes);
  return rowIndexes.length;
}

function crm5_deleteColumnsByHeader_(sh, headers) {
  if (!sh || sh.getLastColumn() < 1) return [];
  var row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var positions = [];
  var removed = [];
  headers.forEach(function(header){
    var wanted = op_headerKey_(header);
    for (var i = 0; i < row.length; i++) {
      if (op_headerKey_(row[i]) === wanted) {
        positions.push(i + 1);
        removed.push(header);
        break;
      }
    }
  });
  positions.sort(function(a,b){ return b-a; }).forEach(function(col){ sh.deleteColumn(col); });
  return removed;
}

function crm5_normalizeAgendaBlocks_(sh) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  if (hm.TIPO_ATIVIDADE === undefined && hm.NOME_BLOCO === undefined) return 0;
  var changed = 0;
  for (var i = 1; i < values.length; i++) {
    var rowChanged = false;
    if (hm.TIPO_ATIVIDADE !== undefined && crm5_isLegacyColetaText_(values[i][hm.TIPO_ATIVIDADE])) {
      values[i][hm.TIPO_ATIVIDADE] = 'AGENDA';
      rowChanged = true;
    }
    if (hm.NOME_BLOCO !== undefined && crm5_isLegacyColetaText_(values[i][hm.NOME_BLOCO])) {
      values[i][hm.NOME_BLOCO] = String(values[i][hm.NOME_BLOCO] == null ? '' : values[i][hm.NOME_BLOCO])
        .replace(/coletas?/gi, 'Agenda')
        .replace(/\s{2,}/g, ' ')
        .trim();
      rowChanged = true;
    }
    if (rowChanged) changed++;
  }
  if (changed) sh.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  return changed;
}

function crm5_normalizeProspectStages_(sh) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  if (hm.ETAPA_FUNIL === undefined) return 0;
  var changed = 0;
  for (var i = 1; i < values.length; i++) {
    if (crm5_isLegacyColetaText_(values[i][hm.ETAPA_FUNIL])) {
      values[i][hm.ETAPA_FUNIL] = 'OPORTUNIDADE';
      changed++;
    }
  }
  if (changed) sh.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  return changed;
}

function crm5_sanitizeMidias_(sh) {
  if (!sh || sh.getLastRow() < 2) return { sanitized:0 };
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var changed = false;
  var sanitized = 0;
  var textHeaders = ['NOME_MIDIA', 'QUANDO_USAR'];
  for (var i = 1; i < values.length; i++) {
    textHeaders.forEach(function(h){
      if (hm[h] === undefined) return;
      var old = String(values[i][hm[h]] == null ? '' : values[i][hm[h]]);
      var next = crm5_sanitizeColetaText_(old);
      if (next !== old) {
        values[i][hm[h]] = next;
        changed = true;
        sanitized++;
      }
    });
  }
  if (changed) sh.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  return { sanitized:sanitized };
}

/* ========================= HELPERS ========================= */

function crm5_assertConfirmation_(confirmacao) {
  var value = typeof confirmacao === 'object' && confirmacao ? confirmacao.confirmacao : confirmacao;
  if (String(value || '').trim() !== CRM5_CFG.CONFIRM_DELETE) {
    throw new Error("Confirmação obrigatória. Execute removeColetasFase5('EXCLUIR_COLETAS').");
  }
}

function crm5_isLegacyColetaText_(value) {
  return op_upperNoAccents_(String(value == null ? '' : value)).indexOf('COLETA') >= 0;
}

function crm5_rowHasColeta_(row, hm, headers) {
  // Quando headers não é informado, varremos a linha inteira. Isso é necessário
  // para tabelas legadas com cabeçalho técnico fora da primeira linha, como CRM_TRANSICOES.
  if (!headers || !headers.length) {
    for (var c = 0; c < row.length; c++) {
      if (crm5_isLegacyColetaText_(row[c])) return true;
    }
    return false;
  }
  for (var i = 0; i < headers.length; i++) {
    var idx = hm[op_headerKey_(headers[i])];
    if (idx !== undefined && crm5_isLegacyColetaText_(row[idx])) return true;
  }
  return false;
}

function crm5_countRowsWithColeta_(sh, headers, firstDataRow) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var values = sh.getDataRange().getValues();
  if (!values.length) return 0;
  var hm = op_buildHeaderMap_(values[0]);
  var start = Math.max(2, Number(firstDataRow || 2));
  var count = 0;
  for (var sheetRow = start; sheetRow <= values.length; sheetRow++) {
    if (crm5_rowHasColeta_(values[sheetRow - 1], hm, headers)) count++;
  }
  return count;
}

function crm5_existingHeaders_(sh, headers) {
  if (!sh || sh.getLastColumn() < 1) return [];
  var current = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(op_headerKey_);
  return headers.filter(function(h){ return current.indexOf(op_headerKey_(h)) >= 0; });
}

function crm5_deleteRowsGrouped_(sh, rowIndexes) {
  if (!sh || !rowIndexes || !rowIndexes.length) return;
  var rows = rowIndexes.slice().sort(function(a,b){ return b-a; });
  var high = rows[0];
  var low = rows[0];
  for (var i = 1; i <= rows.length; i++) {
    var current = rows[i];
    if (current === low - 1) {
      low = current;
      continue;
    }
    sh.deleteRows(low, high - low + 1);
    high = current;
    low = current;
  }
}

function crm5_sanitizeColetaText_(value) {
  var s = String(value == null ? '' : value);
  if (!crm5_isLegacyColetaText_(s)) return s;
  s = s.replace(/rotina\s+de\s+coleta/gi, 'rotina de postagem');
  s = s.replace(/coleta\s+programada/gi, 'atendimento programado');
  s = s.replace(/solicita[cç][aã]o\s+de\s+coleta/gi, 'solicitação de apoio operacional');
  s = s.replace(/,?\s*coletas?\s*,?/gi, ' ');
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim();
  return s;
}

function crm5_clearCaches_() {
  try { _op_setup_done_ = false; } catch(e) {}
  try {
    var c = CacheService.getScriptCache();
    c.remove('op_setup_ready_v2');
    c.remove('op_setup_ready_v3');
  } catch(e2) {}
  try { op_invalidateOperationCaches_(); } catch(e3) {}
  try { if (typeof crm3_bumpCacheRev_ === 'function') crm3_bumpCacheRev_(); } catch(e4) {}
}
