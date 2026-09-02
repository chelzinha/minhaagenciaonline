/**
 * APP ETIQUETAS AGF - 15_RECUPERACAO_ETIQUETA.gs
 *
 * Recuperação definitiva de etiquetas que ficaram com status PROCESSANDO,
 * mas já possuem idPrePostagem/código de objeto. A action reaproveita o
 * fluxo seguro de reimpressão, não cria nova pré-postagem e, quando encontra
 * o PDF do rótulo, corrige o histórico para CONCLUIDO.
 */

function action_recuperarEtiqueta_(params) {
  ensureHistoricoHeaders_();

  const fullClient = getFullClientFromSession_(params.sessionToken);
  const idRegistro = sanitize_(params.idRegistro);
  if (!idRegistro) throw new Error('idRegistro obrigatório.');

  const result = action_reimprimirEtiqueta_(params);
  const temRotulo = !!(result && (result.pdfBase64 || result.driveFileId || result.driveUrl || result.driveDownloadUrl));
  if (!temRotulo) {
    throw new Error('Não foi possível recuperar o PDF principal da etiqueta. Tente novamente em alguns segundos.');
  }

  const all = readSheetAsObjects_(CFG.SHEETS.HIST);
  const reg = all.find(r =>
    sanitize_(r.ID_REGISTRO) === idRegistro &&
    sanitize_(r.LOGIN_APP) === fullClient.LOGIN_APP
  );

  if (reg && reg._row) {
    const patch = {
      STATUS: 'CONCLUIDO',
      MENSAGEM_ERRO: ''
    };

    if (result.idPrePostagem) patch.ID_PREPOSTAGEM = result.idPrePostagem;
    if (result.codigoObjeto) patch.CODIGO_OBJETO = result.codigoObjeto;
    if (result.driveUrl) patch.URL_PDF_DRIVE = result.driveUrl;
    if (result.driveFileId) patch.FILE_ID_PDF_DRIVE = result.driveFileId;
    if (result.declaracao && result.declaracao.driveUrl) patch.URL_PDF_DECLARACAO_DRIVE = result.declaracao.driveUrl;
    if (result.declaracao && result.declaracao.driveFileId) patch.FILE_ID_DECLARACAO_DRIVE = result.declaracao.driveFileId;

    withLock_(() => {
      atualizarHistorico_(reg._row, patch);
    });
  }

  logEvent_('INFO', 'ETIQUETA', 'RECUPERADA_FINALIZADA', {
    idRegistro: idRegistro,
    idPrePostagem: result.idPrePostagem || '',
    codigoObjeto: result.codigoObjeto || ''
  });

  return Object.assign({}, result, {
    recuperado: true,
    statusCorrigido: 'CONCLUIDO'
  });
}
