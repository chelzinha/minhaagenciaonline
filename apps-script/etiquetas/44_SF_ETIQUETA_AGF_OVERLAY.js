/**
 * AGF SUPERFRETE — 44_SF_ETIQUETA_AGF_OVERLAY.gs
 * Etapa 7B: etiqueta AGF por overlay sobre o PDF oficial SuperFrete.
 *
 * Estratégia:
 * - Mantém o PDF oficial como matriz visual e técnica.
 * - O frontend renderiza apenas a página 1 do PDF.
 * - Uma camada branca cobre somente a marca SuperFrete.
 * - A logo/nome do cliente é aplicado sobre essa área.
 *
 * Não altera QR/2D oficial, SRO, contrato, barcodes, dados técnicos ou DACE.
 */

function action_sfAdminGetAgfLabelOverlayData_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const orderIdAgf = sanitize_(params.orderIdAgf || params.ORDER_ID_AGF);
  if (!orderIdAgf) throw new Error('ORDER_ID_AGF obrigatório para gerar etiqueta AGF por overlay.');

  const etiquetas = sfReadObjects_(SF.SHEETS.ETIQUETAS);
  const row = etiquetas.find(function (e) { return sanitize_(e.ORDER_ID_AGF) === orderIdAgf; });
  if (!row) throw new Error('Etiqueta não encontrada: ' + orderIdAgf);

  const pdfUrl = sanitize_(row.PDF_OFICIAL_URL);
  if (!pdfUrl) {
    throw new Error('PDF oficial ainda não disponível. Clique em Atualizar SF e tente novamente.');
  }

  const tracking = sanitize_(row.TRACKING);
  if (!tracking) {
    throw new Error('SRO/tracking ainda não disponível. Clique em Atualizar SF antes de gerar a etiqueta AGF.');
  }

  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', row.CLIENTE_ID) || {};
  const remetente = sfFindBy_(SF.SHEETS.REMETENTES, 'REMETENTE_ID', row.REMETENTE_ID) || {};

  const pdf = sfFetchOfficialPdfAsBase64_(pdfUrl, orderIdAgf);

  return {
    geradoEm: nowIso_(),
    operadorId: user.USUARIO_ID,
    modo: 'PDF_OFICIAL_OVERLAY_LOGO',
    aviso: 'Etiqueta AGF gerada por overlay sobre o PDF oficial. O PDF oficial original permanece como fallback.',
    etiqueta: {
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: sanitize_(row.ORDER_ID_SUPERFRETE),
      STATUS_LOGISTICO: sanitize_(row.STATUS_LOGISTICO),
      STATUS_FINANCEIRO: sanitize_(row.STATUS_FINANCEIRO),
      SERVICO: sanitize_(row.SERVICO),
      TRANSPORTADORA: sanitize_(row.TRANSPORTADORA || 'Correios'),
      TRACKING: tracking,
      PDF_OFICIAL_URL: pdfUrl,
      DACE_URL: sanitize_(row.DACE_URL),
      EMITIDO_EM: sanitize_(row.EMITIDO_EM)
    },
    cliente: {
      CLIENTE_ID: sanitize_(cliente.CLIENTE_ID),
      NOME_EXIBICAO: sanitize_(cliente.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(cliente.RAZAO_SOCIAL),
      DOCUMENTO: sanitize_(cliente.DOCUMENTO),
      LOGO_URL: sanitize_(cliente.LOGO_URL),
      LOGO_DRIVE_ID: sanitize_(cliente.LOGO_DRIVE_ID),
      LOGO_DATA_URL: sfBuildLogoDataUrl_(cliente.LOGO_DRIVE_ID)
    },
    remetente: {
      REMETENTE_ID: sanitize_(remetente.REMETENTE_ID),
      NOME_REMETENTE: sanitize_(remetente.NOME_REMETENTE || cliente.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(remetente.RAZAO_SOCIAL),
      CNPJ_CPF: sanitize_(remetente.CNPJ_CPF || cliente.DOCUMENTO)
    },
    pdf: pdf,
    overlay: {
      // Coordenadas CSS em milímetros, calibradas para PDF oficial 105mm x 148mm.
      // Cobre apenas a área visual da logo SuperFrete, preservando NF/Pedido.
      leftMm: 5.5,
      topMm: 6.0,
      widthMm: 29.0,
      heightMm: 23.5,
      logoPaddingMm: 2.0
    }
  };
}

function sfFetchOfficialPdfAsBase64_(url, orderIdAgf) {
  let resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      headers: {
        'Accept': 'application/pdf,*/*'
      }
    });
  } catch (e) {
    sfLog_('ERROR', 'SF_ETIQUETA_AGF_OVERLAY', 'PDF_FETCH_EXCEPTION', {
      ORDER_ID_AGF: orderIdAgf,
      ERRO: e.message || String(e)
    });
    throw new Error('Não foi possível baixar o PDF oficial da SuperFrete: ' + (e.message || e));
  }

  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    sfLog_('ERROR', 'SF_ETIQUETA_AGF_OVERLAY', 'PDF_FETCH_HTTP_ERROR', {
      ORDER_ID_AGF: orderIdAgf,
      HTTP_STATUS: code,
      BODY: truncate_(resp.getContentText() || '', 500)
    });
    throw new Error('Não foi possível baixar o PDF oficial da SuperFrete. HTTP ' + code + '.');
  }

  const blob = resp.getBlob();
  const bytes = blob.getBytes();
  if (!bytes || !bytes.length) throw new Error('PDF oficial retornou vazio.');

  return {
    fileName: 'Etiqueta-AGF-' + orderIdAgf + '.pdf',
    mimeType: blob.getContentType() || 'application/pdf',
    sizeBytes: bytes.length,
    base64: Utilities.base64Encode(bytes)
  };
}
