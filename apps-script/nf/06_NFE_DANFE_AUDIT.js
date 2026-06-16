/** AGF NFE PDF EXTRACTOR — 06_NFE_DANFE_AUDIT.gs
 *  Amostragem do DANFE Simplificado - Etiqueta em modo de teste.
 *  Mantém trilha auditável sem misturar com o backend principal.
 */

var NFE_AUDIT_HEADERS = [
  'SAMPLE_ID', 'CRIADO_EM', 'ATUALIZADO_EM', 'PORTAL', 'STATUS', 'ARQUIVO_ORIGEM',
  'LOGIN_APP', 'NF_NUMERO', 'NF_SERIE', 'CHAVE_ACESSO', 'PROTOCOLO_AUTORIZACAO',
  'EMITENTE', 'CNPJ_EMITENTE', 'IE_EMITENTE', 'UF_EMITENTE',
  'DESTINATARIO', 'CPF_CNPJ_DESTINATARIO', 'IE_DESTINATARIO', 'UF_DESTINATARIO',
  'VALIDACOES_OK', 'VALIDACOES_ALERTA', 'VALIDACOES_ERRO', 'CAMPOS_PENDENTES',
  'ALERTAS', 'CORRECOES_JSON', 'EXTRAIDO_JSON', 'REVISADO_JSON'
];

function nfeAuditGetSpreadsheet_() {
  var cfgId = nfeSanitize_(NFE_CFG.AUDIT && NFE_CFG.AUDIT.SPREADSHEET_ID);
  var props = PropertiesService.getScriptProperties();
  var propName = (NFE_CFG.AUDIT && NFE_CFG.AUDIT.SPREADSHEET_PROP_NAME) || 'NFE_AUDIT_SPREADSHEET_ID';
  var id = cfgId || props.getProperty(propName) || '';
  var ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); }
    catch (e) { throw new Error('Planilha de amostragem DANFE configurada, mas não acessível: ' + e.message); }
  } else {
    ss = SpreadsheetApp.create('AGF — Amostragem DANFE Simplificado Etiqueta');
    props.setProperty(propName, ss.getId());
  }
  return ss;
}

function nfeAuditGetSheet_() {
  var ss = nfeAuditGetSpreadsheet_();
  var name = (NFE_CFG.AUDIT && NFE_CFG.AUDIT.SHEET_NAME) || 'AMOSTRAGEM_DANFE';
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, NFE_AUDIT_HEADERS.length).setValues([NFE_AUDIT_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, NFE_AUDIT_HEADERS.length).setFontWeight('bold').setBackground('#00416B').setFontColor('#FFFFFF');
    sh.autoResizeColumns(1, Math.min(NFE_AUDIT_HEADERS.length, 18));
  }
  return sh;
}

function nfeAuditRowToObject_(headers, row) {
  var out = {};
  headers.forEach(function (h, idx) { out[h] = row[idx]; });
  return out;
}

function nfeAuditBuildRow_(sample, caller, existingId) {
  var reviewed = sample.reviewed || {};
  var extracted = sample.extracted || {};
  var data = reviewed.danfeSimplificado || reviewed || extracted.danfeSimplificado || {};
  var nota = data.nota || {};
  var emitente = data.emitente || {};
  var dest = data.destinatario || {};
  var sum = data.validationSummary || sample.validationSummary || {};
  var now = nfeNowIso_();
  return {
    SAMPLE_ID: existingId || nfeMakeAuditId_(),
    CRIADO_EM: nfeSanitize_(sample.createdAt || now),
    ATUALIZADO_EM: now,
    PORTAL: nfeSanitize_(sample.portal || ''),
    STATUS: nfeSanitize_(sample.status || 'PENDENTE_REVISAO'),
    ARQUIVO_ORIGEM: nfeSanitize_(sample.fileName || (extracted.source && extracted.source.fileName) || ''),
    LOGIN_APP: nfeSanitize_((caller.client && (caller.client.LOGIN_APP || caller.client.LOGIN || caller.client.NOME)) || sample.loginApp || ''),
    NF_NUMERO: nfeSanitize_(nota.numero || ''),
    NF_SERIE: nfeSanitize_(nota.serie || ''),
    CHAVE_ACESSO: nfeDigitsOnly_(nota.chaveAcesso || ''),
    PROTOCOLO_AUTORIZACAO: nfeDigitsOnly_(nota.protocoloAutorizacao || ''),
    EMITENTE: nfeSanitize_(emitente.nomeRazaoSocial || ''),
    CNPJ_EMITENTE: nfeDigitsOnly_(emitente.cnpj || ''),
    IE_EMITENTE: nfeSanitize_(emitente.inscricaoEstadual || ''),
    UF_EMITENTE: nfeSanitize_(emitente.uf || ''),
    DESTINATARIO: nfeSanitize_(dest.nomeRazaoSocial || ''),
    CPF_CNPJ_DESTINATARIO: nfeDigitsOnly_(dest.cpfCnpj || ''),
    IE_DESTINATARIO: nfeSanitize_(dest.inscricaoEstadual || ''),
    UF_DESTINATARIO: nfeSanitize_(dest.uf || ''),
    VALIDACOES_OK: Number(sum.ok || 0),
    VALIDACOES_ALERTA: Number(sum.warnings || 0),
    VALIDACOES_ERRO: Number(sum.errors || 0),
    CAMPOS_PENDENTES: (data.requiredMissing || []).join(' | '),
    ALERTAS: (sample.warnings || extracted.warnings || []).join(' | '),
    CORRECOES_JSON: JSON.stringify(sample.corrections || {}),
    EXTRAIDO_JSON: JSON.stringify(extracted || {}),
    REVISADO_JSON: JSON.stringify(reviewed || {})
  };
}

function nfeMakeAuditId_() {
  return 'DANFE_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
}

function nfeActionSaveDanfePreviewSample_(body) {
  var caller = nfeValidateCaller_(body || {});
  var sample = body.sample || body;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = nfeAuditGetSheet_();
    var sampleId = nfeSanitize_(sample.sampleId || '');
    var lastRow = sh.getLastRow();
    var rowIndex = 0;
    if (sampleId && lastRow > 1) {
      var ids = sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) {
        if (nfeSanitize_(ids[i][0]) === sampleId) { rowIndex = i + 2; break; }
      }
    }
    var rowObj = nfeAuditBuildRow_(sample, caller, sampleId || '');
    var row = NFE_AUDIT_HEADERS.map(function (h) { return rowObj[h] === undefined ? '' : rowObj[h]; });
    if (rowIndex) sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return {
      sampleId: rowObj.SAMPLE_ID,
      status: rowObj.STATUS,
      auditSpreadsheetUrl: sh.getParent().getUrl()
    };
  } finally {
    lock.releaseLock();
  }
}

function nfeActionListDanfePreviewSamples_(body) {
  var caller = nfeValidateCaller_(body || {});
  if (nfeSanitize_(body.sessionAction) !== 'sfAdminMe') {
    throw new Error('A listagem da amostragem é restrita ao administrador.');
  }
  var sh = nfeAuditGetSheet_();
  var lastRow = sh.getLastRow();
  var maxRows = Math.max(1, Number((NFE_CFG.AUDIT && NFE_CFG.AUDIT.MAX_LIST_ROWS) || 500));
  var start = Math.max(2, lastRow - maxRows + 1);
  var rows = lastRow >= 2 ? sh.getRange(start, 1, lastRow - start + 1, NFE_AUDIT_HEADERS.length).getDisplayValues() : [];
  var items = rows.map(function (row) { return nfeAuditRowToObject_(NFE_AUDIT_HEADERS, row); }).reverse();
  return {
    items: items,
    total: Math.max(0, lastRow - 1),
    auditSpreadsheetUrl: sh.getParent().getUrl(),
    authMethod: caller.method
  };
}

function nfeActionGetDanfeAuditInfo_(body) {
  nfeValidateCaller_(body || {});
  if (nfeSanitize_(body.sessionAction) !== 'sfAdminMe') {
    throw new Error('A consulta da planilha de amostragem é restrita ao administrador.');
  }
  var ss = nfeAuditGetSpreadsheet_();
  return { spreadsheetId: ss.getId(), auditSpreadsheetUrl: ss.getUrl() };
}
