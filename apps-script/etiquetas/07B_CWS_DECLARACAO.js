/**
 * APP ETIQUETAS AGF — 07B_CWS_DECLARACAO.gs
 * Geração do PDF da Declaração de Conteúdo (assíncrono).
 *
 * ============================================================
 * FLUXO (manual V2.4, capítulo 15):
 *  1. POST /prepostagem/v1/prepostagens/declaracoes/pdf
 *     body: { idsPrePostagem: ["PR..."], formatoDeclaracao: "ET"|"A4" }
 *     → devolve { idRecibo: "..." }
 *  2. Polling GET /prepostagem/v1/prepostagens/declaracoes/{idRecibo}
 *     até status = PROCESSADO
 *  3. PDF vem em base64 dentro do JSON ou via URL pra download
 *  4. Salva no Google Drive (mesma pasta do rótulo)
 *  5. Devolve base64 + URL Drive
 *
 * É o MESMO padrão do 07_CWS_ROTULO.gs, intencionalmente espelhado
 * pra facilitar manutenção. Se a Correios mudar o endpoint de
 * polling (ou nomes de campos), aplico a mudança nos dois lugares.
 *
 * Importante: o formato da declaração segue o do rótulo. Se o usuário
 * escolheu imprimir rótulo em ET (10x15), a DC também vem em ET. Isso
 * é passado explicitamente pelo caller.
 * ============================================================
 */

/**
 * Cria a solicitação assíncrona do PDF de declaração. Retorna idRecibo.
 */
function cwsSolicitarDeclaracao_(client, idPrePostagem, formato) {
  const formatoDeclaracao = upper_(formato || CFG.CWS.DEFAULT_FORMATO_ROTULO);

  const body = {
    idsPrePostagem: [idPrePostagem],
    formatoDeclaracao: formatoDeclaracao
  };

  const resp = cwsRequest_(client, {
    service: 'PREPOSTAGEM',
    path: '/v1/prepostagens/declaracoes/pdf',
    method: 'post',
    body: body
  });

  const json = resp.json || {};

  const idRecibo = sanitize_(pickFirst_(json, [
    'idRecibo',
    'recibo',
    'idSolicitacao',
    'protocolo',
    'idAssincrono'
  ]));

  if (!idRecibo) {
    if (resp.blob) {
      return { idRecibo: '', pdfBlob: resp.blob, raw: json };
    }
    throw new Error(
      'Endpoint de declaração não devolveu idRecibo nem PDF. ' +
      'Resposta: ' + truncate_(resp.text, 500)
    );
  }

  return { idRecibo: idRecibo, pdfBlob: null, raw: json };
}

/**
 * Faz polling até a declaração estar pronta. Estrutura idêntica ao
 * cwsPollRotulo_ — mesmos status finais, mesmo backoff, mesmo timeout.
 */
function cwsPollDeclaracao_(client, idRecibo) {
  const maxTentativas = CFG.CWS.DECLARACAO_POLL_MAX_TENTATIVAS;
  const intervalMs = CFG.CWS.DECLARACAO_POLL_INTERVAL_MS;
  const t0 = nowMs_();

  for (let i = 0; i < maxTentativas; i++) {
    Utilities.sleep(intervalMs);

    if (nowMs_() - t0 > CFG.CWS.DECLARACAO_POLL_TIMEOUT_MS) {
      throw new Error('Timeout aguardando a declaração de conteúdo (>' +
        Math.round(CFG.CWS.DECLARACAO_POLL_TIMEOUT_MS / 1000) + 's). ' +
        'O idRecibo é ' + idRecibo + ' — você pode tentar consultar mais tarde.');
    }

    let resp;
    try {
      resp = cwsRequest_(client, {
        service: 'PREPOSTAGEM',
        path: '/v1/prepostagens/declaracoes/' + encodeURIComponent(idRecibo),
        method: 'get',
        accept: 'application/pdf, application/json'
      });
    } catch (err) {
      if (err.cwsCode === 404 || err.cwsCode === 425 || err.cwsCode === 202) continue;
      throw err;
    }

    // Caso 1: PDF binário direto
    if (resp.blob) {
      return { status: 'PROCESSADO', pdfBlob: resp.blob, raw: null };
    }

    // Caso 2: JSON com status
    const json = resp.json || {};
    const status = upper_(pickFirst_(json, ['status', 'situacao', 'estado']));

    if (status === 'PROCESSADO' || status === 'CONCLUIDO' || status === 'FINALIZADO' || status === 'PRONTO') {
      const pdfBase64 = sanitize_(pickFirst_(json, ['pdfBase64', 'declaracaoBase64', 'arquivoBase64', 'pdf']));
      const pdfUrl = sanitize_(pickFirst_(json, ['url', 'urlPdf', 'urlDeclaracao', 'link', 'downloadUrl']));

      if (pdfBase64) {
        const bytes = Utilities.base64Decode(pdfBase64);
        const blob = Utilities.newBlob(bytes, 'application/pdf', 'declaracao.pdf');
        return { status: status, pdfBlob: blob, raw: json };
      }
      if (pdfUrl) {
        const dl = UrlFetchApp.fetch(pdfUrl, {
          muteHttpExceptions: true,
          headers: { 'Authorization': 'Bearer ' + cwsGetToken_(client).token }
        });
        if (dl.getResponseCode() >= 200 && dl.getResponseCode() < 300) {
          return { status: status, pdfBlob: dl.getBlob(), raw: json };
        }
        throw new Error('Falha ao baixar PDF da declaração (' + dl.getResponseCode() + ')');
      }

      throw new Error('Status PROCESSADO mas sem pdfBase64 nem URL no JSON: ' +
                      truncate_(resp.text, 500));
    }

    if (status === 'ERRO' || status === 'FALHA' || status === 'CANCELADO') {
      const motivo = sanitize_(pickFirst_(json, ['mensagem', 'erro', 'motivo', 'descricao']));
      throw new Error('Geração da declaração falhou na Correios: ' + (motivo || status));
    }

    // Continua polling
  }

  throw new Error('Declaração não ficou pronta após ' + maxTentativas + ' tentativas. idRecibo: ' + idRecibo);
}

/**
 * Função pública: emite a declaração end-to-end.
 * Recebe idPrePostagem + formato e devolve PDF + URL Drive.
 */
function cwsEmitirDeclaracao_(client, idPrePostagem, formato) {
  // 1. Solicita
  const sol = cwsSolicitarDeclaracao_(client, idPrePostagem, formato);

  // 2. Polling (ou pula se PDF já veio)
  let pdfBlob = sol.pdfBlob;
  if (!pdfBlob) {
    const polled = cwsPollDeclaracao_(client, sol.idRecibo);
    pdfBlob = polled.pdfBlob;
  }

  if (!pdfBlob) {
    throw new Error('Não foi possível obter o PDF da declaração de conteúdo.');
  }

  // 3. Salva no Drive (mesma pasta do rótulo)
  const fileName = 'declaracao_' + idPrePostagem + '_' +
                   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') +
                   '.pdf';
  const driveInfo = salvarPdfNoDrive_(pdfBlob, fileName);

  // 4. Devolve base64 + URL Drive
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


function resolveTipoDace_(formato) {
  const f = upper_(formato || CFG.CWS.DEFAULT_FORMATO_ROTULO);
  return (f === 'ET') ? 'R' : 'C';
}

function cwsEmitirDace_(client, idPrePostagem, formato) {
  const body = {
    idsPrePostagens: [idPrePostagem],
    tipoDace: resolveTipoDace_(formato)
  };

  const resp = cwsRequest_(client, {
    service: 'PREPOSTAGEM',
    path: '/v1/prepostagens/dce/dace/impressao',
    method: 'post',
    body: body
  });

  const json = resp.json || {};
  const dados = sanitize_(pickFirst_(json, ['dados', 'pdfBase64', 'arquivoBase64', 'base64']));
  if (!dados) {
    throw new Error('DACE sem dados de impressão retornados pela Correios.');
  }

  const bytes = Utilities.base64Decode(dados);
  const pdfBlob = Utilities.newBlob(bytes, 'application/pdf', 'dace.pdf');
  const fileName = 'dace_' + idPrePostagem + '_' +
                   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') +
                   '.pdf';
  const driveInfo = salvarPdfNoDrive_(pdfBlob, fileName);

  return {
    idRecibo: '',
    pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()),
    fileName: fileName,
    driveFileId: driveInfo.fileId,
    driveUrl: driveInfo.url,
    driveDownloadUrl: driveInfo.downloadUrl,
    driveShareUrl: driveInfo.shareUrl || '',
    driveSharingOk: !!driveInfo.sharingOk,
    driveWarning: driveInfo.warning || ''
  };
}
