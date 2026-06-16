/** AGF NFE PDF EXTRACTOR — 03_NFE_PDF_TEXT.gs
 *
 * Conversão robusta de DANFE PDF para texto.
 *
 * REGRA ANTI-REGRESSÃO:
 * - DANFEs normalmente já possuem camada de texto. Primeiro converte sem OCR.
 * - OCR é usado apenas como fallback para PDFs digitalizados.
 * - Não informar mimeType Google Docs no metadata da inserção com OCR.
 *   O Drive deve detectar o PDF de origem pelo blob e criar o Google Docs
 *   convertido. Informar application/vnd.google-apps.document junto com OCR
 *   pode causar: "OCR is not supported for files of type
 *   application/vnd.google-apps.document".
 */

function nfeExtractTextFromRequest_(body) {
  // Para teste/debug: permite enviar o texto já extraído pelo front/pdf.js.
  if (body.sourceText || body.text) {
    var txt = nfeNormalizeText_(body.sourceText || body.text);
    if (!txt) throw new Error('sourceText/text enviado vazio.');
    if (txt.length > NFE_CFG.PDF.MAX_TEXT_CHARS) {
      throw new Error('Texto extraído excede o limite de segurança.');
    }
    return {
      text: txt,
      method: 'sourceText',
      convertedDocId: '',
      originalFileName: nfeSanitize_(body.fileName || 'texto.txt')
    };
  }

  var base64 = nfeSanitize_(body.pdfBase64 || body.fileBase64 || '');
  if (!base64) throw new Error('Envie pdfBase64 ou sourceText.');

  // Aceita data URL: data:application/pdf;base64,AAAA...
  base64 = base64.replace(/^data:application\/pdf;base64,/i, '');
  base64 = base64.replace(/\s/g, '');

  if (base64.length > NFE_CFG.PDF.MAX_BASE64_CHARS) {
    throw new Error('PDF muito grande para importação direta. Use um DANFE menor.');
  }

  var fileName = nfeSanitize_(body.fileName || 'danfe.pdf');
  if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';

  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (e) {
    throw new Error('pdfBase64 inválido.');
  }

  var blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
  return nfeExtractTextFromPdfBlob_(blob, fileName);
}

function nfeExtractTextFromPdfBlob_(pdfBlob, fileName) {
  if (typeof Drive === 'undefined' || !Drive.Files || !Drive.Files.insert) {
    throw new Error('Ative o Serviço Avançado do Google: Drive API. Sem isso o Apps Script não converte PDF em texto.');
  }

  var titleBase = 'TMP_NFE_' + Utilities.formatDate(new Date(), NFE_CFG.TIMEZONE, 'yyyyMMdd_HHmmss') + '_' + fileName;
  var errors = [];

  // 1) Caminho principal: DANFE eletrônico com camada de texto.
  // Não força OCR. É mais rápido e evita o erro de mimeType reportado pelo Drive.
  //
  // IMPORTANTE: alguns PDFs digitais são convertidos pelo Google Docs com texto
  // suficiente, porém perdem um campo isolado em coluna (ex.: IE do emitente).
  // Nesse caso não descartamos o texto principal: executamos uma segunda leitura
  // OCR complementar e devolvemos as duas versões para o parser consolidar.
  try {
    var normal = nfeConvertPdfToGoogleDoc_(pdfBlob, titleBase + '_TEXT', false);
    var normalText = nfeReadConvertedDocText_(normal.id);
    if (nfeHasEnoughExtractedText_(normalText)) {
      var finalizedNormal = nfeFinalizeExtractedText_(normalText, normal.id, fileName, 'drive_pdf_to_google_doc_text');

      if (nfeShouldTryOcrSupplement_(normalText)) {
        try {
          var ocrSupplement = nfeConvertPdfToGoogleDoc_(pdfBlob, titleBase + '_OCR_SUPPLEMENT', true);
          var ocrSupplementText = nfeReadConvertedDocText_(ocrSupplement.id);
          if (nfeHasEnoughExtractedText_(ocrSupplementText)) {
            var finalizedSupplement = nfeFinalizeExtractedText_(ocrSupplementText, ocrSupplement.id, fileName, 'drive_pdf_to_google_doc_ocr_supplement');
            finalizedNormal.supplementalText = finalizedSupplement.text;
            finalizedNormal.supplementalMethod = finalizedSupplement.method;
          } else {
            nfeCleanupConvertedDoc_(ocrSupplement.id);
          }
        } catch (supplementErr) {
          errors.push('OCR complementar: ' + supplementErr.message);
        }
      }

      return finalizedNormal;
    }
    errors.push('Conversão sem OCR retornou texto insuficiente.');
    nfeCleanupConvertedDoc_(normal.id);
  } catch (e1) {
    errors.push('Conversão sem OCR: ' + e1.message);
  }

  // 2) Fallback: PDF escaneado / sem camada de texto.
  // O metadata não informa mimeType Google Docs. O Drive detecta o PDF pelo blob.
  try {
    var ocr = nfeConvertPdfToGoogleDoc_(pdfBlob, titleBase + '_OCR', true);
    var ocrText = nfeReadConvertedDocText_(ocr.id);
    if (nfeHasEnoughExtractedText_(ocrText)) {
      return nfeFinalizeExtractedText_(ocrText, ocr.id, fileName, 'drive_pdf_to_google_doc_ocr');
    }
    errors.push('Conversão com OCR retornou texto insuficiente.');
    nfeCleanupConvertedDoc_(ocr.id);
  } catch (e2) {
    errors.push('Conversão com OCR: ' + e2.message);
  }

  throw new Error('Falha ao converter PDF para texto via Drive API. ' + errors.join(' | '));
}


/**
 * Decide se vale fazer uma segunda conversão OCR para complementar o texto
 * normal. Mantém o custo baixo: só ativa quando o campo IE do emitente não
 * pôde ser lido com segurança na primeira conversão.
 */
function nfeShouldTryOcrSupplement_(text) {
  if (!(NFE_CFG.PDF && NFE_CFG.PDF.TRY_OCR_SUPPLEMENT_FOR_MISSING_IE)) return false;
  try {
    var normalized = nfeNormalizeText_(text || '');
    var lines = nfeLines_(normalized);
    var key = nfeExtractAccessKeyLoose_(normalized);
    var cnpj = nfeCnpjFromAccessKey_(key);
    return !nfeIsSafeRequiredIe_(nfeExtractEmitenteIeStrict_(normalized, lines, cnpj));
  } catch (e) {
    // Em dúvida, tenta o OCR complementar. A execução é isolada e não derruba
    // a importação caso o Drive recuse o OCR.
    return true;
  }
}

function nfeConvertPdfToGoogleDoc_(pdfBlob, title, useOcr) {
  var resource = { title: title };

  if (NFE_CFG.PDF.TEMP_FOLDER_ID) {
    resource.parents = [{ id: NFE_CFG.PDF.TEMP_FOLDER_ID }];
  }

  var options = { convert: true };
  if (useOcr) {
    options.ocr = true;
    options.ocrLanguage = NFE_CFG.PDF.OCR_LANGUAGE || 'pt';
  }

  var converted = Drive.Files.insert(resource, pdfBlob, options);
  var docId = converted && converted.id;
  if (!docId) throw new Error('Drive API não retornou o ID do documento convertido.');
  return { id: docId };
}

function nfeReadConvertedDocText_(docId) {
  try {
    return DocumentApp.openById(docId).getBody().getText();
  } catch (e) {
    nfeCleanupConvertedDoc_(docId);
    throw new Error('PDF convertido, mas não foi possível ler o texto do Google Docs: ' + e.message);
  }
}

function nfeHasEnoughExtractedText_(text) {
  var normalized = nfeNormalizeText_(text || '');
  return normalized && normalized.length >= 80;
}

function nfeFinalizeExtractedText_(text, docId, fileName, method) {
  var normalized = nfeNormalizeText_(text);
  if (!normalized || normalized.length < 80) {
    nfeCleanupConvertedDoc_(docId);
    throw new Error('Não foi possível extrair texto suficiente do PDF. O arquivo pode estar protegido, ilegível ou com layout muito fora do padrão.');
  }
  if (normalized.length > NFE_CFG.PDF.MAX_TEXT_CHARS) {
    nfeCleanupConvertedDoc_(docId);
    throw new Error('Texto extraído excede o limite de segurança.');
  }

  nfeCleanupConvertedDoc_(docId);

  return {
    text: normalized,
    method: method,
    convertedDocId: docId,
    originalFileName: fileName
  };
}

function nfeCleanupConvertedDoc_(docId) {
  if (!docId || !NFE_CFG.PDF.CLEANUP_CONVERTED_DOC) return;
  try { DriveApp.getFileById(docId).setTrashed(true); } catch (trashErr) {}
}
