/**
 * APP ETIQUETAS AGF — 07_CWS_ROTULO.gs
 * Geração do rótulo PDF (assíncrono).
 *
 * ============================================================
 * CORREÇÃO CRÍTICA: fluxo assíncrono real
 * ============================================================
 * O endpoint /v1/prepostagens/rotulo/assincrono/pdf NÃO devolve PDF
 * direto. Ele aceita a solicitação, devolve um idRecibo, e o PDF
 * fica pronto alguns segundos depois. Você precisa fazer polling
 * em GET /v1/prepostagens/rotulo/assincrono/{idRecibo} até o status
 * mudar para "PROCESSADO" (ou similar) e então baixar o PDF do
 * link/path informado.
 *
 * Estratégia desta implementação:
 *  1. POST cria o job, captura idRecibo
 *  2. Polling com backoff (1.5s entre tentativas, máx 30 tentativas)
 *  3. Quando status final, baixa o PDF (pode vir inline ou via URL)
 *  4. Salva no Google Drive (pasta CFG.DRIVE_FOLDER_ID)
 *  5. Retorna URL do Drive + base64 para o frontend mostrar inline
 * ============================================================
 *
 * Robustez extra:
 *  - Se a Correios mudar nome do endpoint de polling, tentamos
 *    variantes conhecidas
 *  - Se PDF vier base64 dentro do JSON, decodifica
 *  - Se vier URL, baixa via UrlFetchApp
 *  - Timeouts generosos mas com limite máximo
 */

/**
 * Cria a solicitação assíncrona de rótulo. Retorna idRecibo.
 */
/**
 * Resolve o layout de impressão para padronizar a saída do rótulo.
 * ET (10x15) -> LINEAR_100_150
 * A4        -> LINEAR_A4
 */
function resolveLayoutImpressaoRotulo_(formatoRotulo) {
  const f = upper_(formatoRotulo || CFG.CWS.DEFAULT_FORMATO_ROTULO);
  return (f === 'A4') ? 'LINEAR_A4' : 'LINEAR_100_150';
}

function cwsSolicitarRotulo_(client, idPrePostagem, opts) {
  opts = opts || {};
  const tipoRotulo = upper_(opts.tipoRotulo || client.TIPO_ROTULO_PADRAO || CFG.CWS.DEFAULT_TIPO_ROTULO);
  const formatoRotulo = upper_(opts.formatoRotulo || client.FORMATO_ROTULO_PADRAO || CFG.CWS.DEFAULT_FORMATO_ROTULO);

  const body = {
    idsPrePostagem: [idPrePostagem],
    tipoRotulo: tipoRotulo,
    formatoRotulo: formatoRotulo,
    layoutImpressao: resolveLayoutImpressaoRotulo_(formatoRotulo),
    imprimeRemetente: 'S'
  };

  const resp = cwsRequest_(client, {
    service: 'PREPOSTAGEM',
    path: '/v1/prepostagens/rotulo/assincrono/pdf',
    method: 'post',
    body: body
  });

  const json = resp.json || {};

  // O idRecibo pode vir em vários formatos. Tentamos os mais comuns.
  const idRecibo = sanitize_(pickFirst_(json, [
    'idRecibo',
    'recibo',
    'idSolicitacao',
    'protocolo',
    'idAssincrono'
  ]));

  if (!idRecibo) {
    // Em alguns deploys, a Correios devolve o PDF direto (raro mas possível).
    // Se for o caso, retornamos uma flag para o caller pular o polling.
    if (resp.blob) {
      return { idRecibo: '', pdfBlob: resp.blob, raw: json };
    }
    throw new Error(
      'Endpoint de rótulo não devolveu idRecibo nem PDF. ' +
      'Resposta: ' + truncate_(resp.text, 500)
    );
  }

  return { idRecibo: idRecibo, pdfBlob: null, raw: json };
}

/**
 * Faz polling até o rótulo estar pronto.
 * Retorna { status, pdfBlob | pdfUrl, raw }
 */
function cwsPollRotulo_(client, idRecibo) {
  const maxTentativas = CFG.CWS.ROTULO_POLL_MAX_TENTATIVAS;
  const intervalMs = CFG.CWS.ROTULO_POLL_INTERVAL_MS;
  const t0 = nowMs_();

  for (let i = 0; i < maxTentativas; i++) {
    Utilities.sleep(intervalMs);

    if (nowMs_() - t0 > CFG.CWS.ROTULO_POLL_TIMEOUT_MS) {
      throw new Error('Timeout aguardando o rótulo (>' +
        Math.round(CFG.CWS.ROTULO_POLL_TIMEOUT_MS / 1000) + 's). ' +
        'O idRecibo é ' + idRecibo + ' — você pode tentar consultar mais tarde.');
    }

    let resp;
    try {
      resp = cwsRequest_(client, {
        service: 'PREPOSTAGEM',
        path: '/v1/prepostagens/rotulo/download/assincrono/' + encodeURIComponent(idRecibo),
        method: 'get',
        accept: 'application/pdf, application/json',
        binary: false
      });
    } catch (err) {
      // Enquanto o job não fica pronto, a API pode devolver 404/425/202.
      if (err.cwsCode === 404 || err.cwsCode === 425 || err.cwsCode === 202) continue;
      throw err;
    }

    if (resp.blob) {
      return { status: 'PROCESSADO', pdfBlob: resp.blob, raw: null };
    }

    const json = resp.json || {};

    // Alguns ambientes devolvem base64 pronto no próprio download/assincrono.
    const pdfBase64 = sanitize_(pickFirst_(json, ['dados', 'pdfBase64', 'rotuloBase64', 'arquivoBase64', 'pdf']));
    if (pdfBase64) {
      const bytes = Utilities.base64Decode(pdfBase64);
      const blob = Utilities.newBlob(bytes, 'application/pdf', 'rotulo.pdf');
      return { status: 'PROCESSADO', pdfBlob: blob, raw: json };
    }

    const status = upper_(pickFirst_(json, ['status', 'situacao', 'estado', 'descStatusAtual']));
    if (status === 'ERRO' || status === 'FALHA' || status === 'CANCELADO') {
      const motivo = sanitize_(pickFirst_(json, ['mensagem', 'erro', 'motivo', 'descricao', 'erroAssincrono']));
      throw new Error('Geração de rótulo falhou na Correios: ' + (motivo || status));
    }

    // Fallback defensivo para ambientes legados.
    try {
      const alt = cwsRequest_(client, {
        service: 'PREPOSTAGEM',
        path: '/v1/prepostagens/rotulo/assincrono/' + encodeURIComponent(idRecibo),
        method: 'get',
        accept: 'application/pdf, application/json'
      });

      if (alt.blob) {
        return { status: 'PROCESSADO', pdfBlob: alt.blob, raw: null };
      }

      const altJson = alt.json || {};
      const altBase64 = sanitize_(pickFirst_(altJson, ['dados', 'pdfBase64', 'rotuloBase64', 'arquivoBase64', 'pdf']));
      if (altBase64) {
        const bytes = Utilities.base64Decode(altBase64);
        const blob = Utilities.newBlob(bytes, 'application/pdf', 'rotulo.pdf');
        return { status: 'PROCESSADO', pdfBlob: blob, raw: altJson };
      }

      const altStatus = upper_(pickFirst_(altJson, ['status', 'situacao', 'estado']));
      if (altStatus === 'ERRO' || altStatus === 'FALHA' || altStatus === 'CANCELADO') {
        const motivo = sanitize_(pickFirst_(altJson, ['mensagem', 'erro', 'motivo', 'descricao', 'erroAssincrono']));
        throw new Error('Geração de rótulo falhou na Correios: ' + (motivo || altStatus));
      }
    } catch (altErr) {
      if (!(altErr.cwsCode === 404 || altErr.cwsCode === 425 || altErr.cwsCode === 202)) {
        throw altErr;
      }
    }
  }

  throw new Error('Rótulo não ficou pronto após ' + maxTentativas + ' tentativas. idRecibo: ' + idRecibo);
}

/**
 * Salva o PDF no Google Drive e retorna uma referência interna persistente.
 *
 * IMPORTANTE:
 * Algumas contas permitem criar o arquivo, mas bloqueiam o compartilhamento
 * público por link. A versão anterior executava createFile() e setSharing()
 * dentro do mesmo try; quando setSharing() falhava, descartava também o
 * fileId do arquivo que já tinha sido criado. Isso impedia a reimpressão.
 *
 * Agora criação e compartilhamento são etapas independentes:
 *   - fileId/url internos são preservados sempre que o arquivo foi criado;
 *   - falha no compartilhamento público vira warning, não perda de referência;
 *   - a reimpressão interna continua funcionando via DriveApp.getFileById().
 */
function salvarPdfNoDrive_(blob, fileName) {
  if (!CFG.DRIVE_FOLDER_ID || CFG.DRIVE_FOLDER_ID.indexOf('__COLE') >= 0) {
    // Drive não configurado — devolve só o base64 sem persistir.
    return {
      fileId: '',
      url: '',
      downloadUrl: '',
      shareUrl: '',
      sharingOk: false,
      warning: 'DRIVE_FOLDER_ID não configurado em CFG'
    };
  }

  let file;
  try {
    const folder = DriveApp.getFolderById(CFG.DRIVE_FOLDER_ID);
    file = folder.createFile(blob.setName(fileName));
  } catch (e) {
    logEvent_('ERRO', 'DRIVE', 'CRIAR_PDF', { erro: e.message, fileName: fileName });
    return {
      fileId: '',
      url: '',
      downloadUrl: '',
      shareUrl: '',
      sharingOk: false,
      error: e.message
    };
  }

  const fileId = file.getId();
  const internalUrl = file.getUrl();
  let sharingOk = false;
  let sharingWarning = '';

  try {
    // Opcional: necessário apenas para compartilhamento externo por link.
    // Não é requisito para reimpressão interna pelo Apps Script.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sharingOk = true;
  } catch (e) {
    sharingWarning = e.message || String(e);
    logEvent_('WARN', 'DRIVE', 'COMPARTILHAR_PDF_NEGADO', {
      erro: sharingWarning,
      fileName: fileName,
      fileId: fileId
    });
  }

  return {
    fileId: fileId,
    url: internalUrl,
    // Só expõe URL pública de download quando o compartilhamento foi aceito.
    downloadUrl: sharingOk ? ('https://drive.google.com/uc?export=download&id=' + fileId) : '',
    shareUrl: sharingOk ? internalUrl : '',
    sharingOk: sharingOk,
    warning: sharingWarning
  };
}

/**
 * Função pública: emite o rótulo end-to-end.
 * Recebe idPrePostagem e devolve PDF + URL Drive.
 */
function cwsEmitirRotulo_(client, idPrePostagem, opts) {
  // 1. Solicita
  const sol = cwsSolicitarRotulo_(client, idPrePostagem, opts);

  // 2. Polling (ou pula se PDF já veio)
  let pdfBlob = sol.pdfBlob;
  if (!pdfBlob) {
    const polled = cwsPollRotulo_(client, sol.idRecibo);
    pdfBlob = polled.pdfBlob;
  }

  if (!pdfBlob) {
    throw new Error('Não foi possível obter o PDF do rótulo.');
  }

  // 3. Salva no Drive
  const fileName = 'etiqueta_' + idPrePostagem + '_' +
                   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') +
                   '.pdf';
  const driveInfo = salvarPdfNoDrive_(pdfBlob, fileName);

  // 4. Devolve base64 para inline + URL Drive
  const pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());

  return {
    idRecibo: sol.idRecibo,
    pdfBase64: pdfBase64,
    fileName: fileName,
    driveFileId: driveInfo.fileId,
    driveUrl: driveInfo.url,
    driveDownloadUrl: driveInfo.downloadUrl,
    driveShareUrl: driveInfo.shareUrl || '',
    driveSharingOk: !!driveInfo.sharingOk,
    driveWarning: driveInfo.warning || ''
  };
}