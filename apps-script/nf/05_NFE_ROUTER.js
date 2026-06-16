/** AGF NFE PDF EXTRACTOR — 05_NFE_ROUTER.gs */

const NFE_ROUTES = {
  ping: nfeActionPing_,
  parseNfePdf: nfeActionParseNfePdf_,
  parseNfeText: nfeActionParseNfePdf_,
  saveDanfePreviewSample: nfeActionSaveDanfePreviewSample_,
  listDanfePreviewSamples: nfeActionListDanfePreviewSamples_,
  getDanfeAuditInfo: nfeActionGetDanfeAuditInfo_
};

function doGet(e) {
  var action = e && e.parameter && e.parameter.action ? e.parameter.action : 'ping';
  if (action !== 'ping') {
    return nfeJsonResponse_({ ok: false, error: 'Use POST com Content-Type text/plain para action=' + action });
  }
  return nfeJsonResponse_({ ok: true, data: nfeActionPing_({}) });
}

function doPost(e) {
  var action = '';
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = nfeSafeJsonParse_(e.postData.contents);
    }
    if (e && e.parameter) {
      Object.keys(e.parameter).forEach(function (k) {
        if (body[k] === null || typeof body[k] === 'undefined') body[k] = e.parameter[k];
      });
    }

    action = nfeSanitize_(body.action || '');
    if (!action) throw new Error('Parâmetro action obrigatório.');

    var handler = NFE_ROUTES[action];
    if (!handler) throw new Error('Action desconhecida: ' + action);

    var data = handler(body);
    return nfeJsonResponse_({ ok: true, action: action, data: data });
  } catch (err) {
    nfeLog_('ERROR', action || 'ROUTER', { error: err.message, stack: nfeTruncate_(err.stack || '', 1200) });
    return nfeJsonResponse_({
      ok: false,
      action: action,
      error: err.message || String(err)
    });
  }
}


function nfeMergeSupplementalDanfeFields_(primary, supplemental) {
  primary = primary || {};
  supplemental = supplemental || {};

  var pEmit = primary.emitente || (primary.emitente = {});
  var sEmit = supplemental.emitente || {};
  if (!nfeIsSafeRequiredIe_(pEmit.inscricaoEstadual) && nfeIsSafeRequiredIe_(sEmit.inscricaoEstadual)) {
    pEmit.inscricaoEstadual = nfeNormalizeIe_(sEmit.inscricaoEstadual);
  }

  var pNota = primary.nota || (primary.nota = {});
  var sNota = supplemental.nota || {};
  if (!pNota.protocoloAutorizacao && sNota.protocoloAutorizacao) pNota.protocoloAutorizacao = sNota.protocoloAutorizacao;
  if (!pNota.protocoloCodigoBarras && sNota.protocoloCodigoBarras) pNota.protocoloCodigoBarras = sNota.protocoloCodigoBarras;

  // Reconstroi o bloco DANFE depois do merge para que validações e preview
  // recebam exatamente os campos consolidados.
  var produtos = primary.declaracao && primary.declaracao.itens ? primary.declaracao.itens : [];
  var totais = primary.totais || nfeBuildTotais_(produtos, pNota, primary.warnings || []);
  primary.danfeSimplificado = nfeBuildDanfeSimplificado_(pNota, pEmit, primary.destinatario || {}, totais, primary.warnings || []);
  primary.confidence = nfeScoreExtraction_(pNota, primary.destinatario || {}, produtos, primary.warnings || [], pEmit, primary.danfeSimplificado);
  return primary;
}

function nfeActionPing_(body) {
  return {
    pong: true,
    service: NFE_CFG.SERVICE_NAME,
    version: NFE_CFG.VERSION,
    timestamp: nfeNowIso_()
  };
}

function nfeActionParseNfePdf_(body) {
  var caller = nfeValidateCaller_(body || {});
  var extracted = nfeExtractTextFromRequest_(body || {});
  var parsed = nfeParseDanfeText_(extracted.text);

  // Quando a conversão principal perde um campo isolado de coluna, como a IE
  // do emitente, o extrator pode devolver um segundo texto obtido por OCR.
  // O merge é conservador: preenche apenas lacunas e nunca sobrescreve dados
  // fiscais confiáveis já encontrados na leitura principal.
  if (extracted.supplementalText) {
    var supplementalParsed = nfeParseDanfeText_(extracted.supplementalText);
    nfeMergeSupplementalDanfeFields_(parsed, supplementalParsed);
  }

  var warnings = parsed.warnings || [];
  if (caller.warning) nfePushWarning_(warnings, caller.warning);
  if (parsed.confidence < NFE_CFG.PARSER.MIN_CONFIDENCE_ACCEPT) {
    nfePushWarning_(warnings, 'Confiança baixa. Conferir todos os campos antes de gerar etiqueta.');
  }

  parsed.warnings = warnings;
  parsed.source = {
    method: extracted.method,
    fileName: extracted.originalFileName,
    convertedDocId: NFE_CFG.PDF.CLEANUP_CONVERTED_DOC ? '' : extracted.convertedDocId,
    textChars: extracted.text.length,
    supplementalMethod: extracted.supplementalMethod || '',
    supplementalTextChars: extracted.supplementalText ? extracted.supplementalText.length : 0
  };
  parsed.auth = {
    method: caller.method,
    loginApp: caller.client && caller.client.LOGIN_APP ? caller.client.LOGIN_APP : ''
  };

  nfeLog_('INFO', 'PARSE_OK', {
    fileName: extracted.originalFileName,
    method: extracted.method,
    confidence: parsed.confidence,
    itens: parsed.declaracao && parsed.declaracao.quantidadeLinhas,
    nf: parsed.nota && parsed.nota.numero
  });

  return parsed;
}
