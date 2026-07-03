/**
 * APP ETIQUETAS AGF — 12_ETIQUETAS.gs
 * Actions do roteador relacionadas a etiquetas (coração do app).
 *
 *   action_criarEtiqueta_    — fluxo end-to-end:
 *       valida → cria pré-postagem → gera rótulo → salva no histórico
 *       → salva destinatário no cache → devolve PDF base64 + URL Drive
 *
 *   action_cancelarEtiqueta_ — cancela a pré-postagem na Correios
 *       (só funciona enquanto não foi postada no balcão) e marca
 *       o registro no histórico.
 *
 *   action_reimprimirEtiqueta_ — devolve o PDF salvo no Drive sem
 *       chamar a Correios de novo (é gratuito e instantâneo).
 *
 * Padrão de resposta bem definido para o frontend consumir sem
 * surpresas — sempre os mesmos campos, sempre no mesmo lugar.
 *
 * Todas as escritas na planilha passam por withLock_ para evitar
 * corrida entre requisições concorrentes (regra 3: LockService).
 */

// ============================================================
// action: criarEtiqueta
// ============================================================
/**
 * Payload esperado (body.payload):
 * {
 *   destinatarioNome, destinatarioCpfCnpj, destinatarioCelular,
 *   destinatarioEmail, destinatarioCep, destinatarioEndereco,
 *   destinatarioNumero, destinatarioComplemento, destinatarioBairro,
 *   destinatarioCidade, destinatarioUf,
 *   servico ("PAC" | "SEDEX"),
 *   tipoObjeto ("ENVELOPE" | "CAIXA" | "PACOTE" | "ROLO"),
 *   pesoG, comprimentoCm, larguraCm, alturaCm, diametroCm,
 *   valorDeclarado, ar ("SIM"|"NAO"), maoPropria ("SIM"|"NAO"),
 *   observacao, tipoRotulo, formatoRotulo,
 *   precoCotado, prazoDias  (informativos, vindos da cotação prévia)
 * }
 */
function action_criarEtiqueta_(params) {
  const fullClient = getFullClientFromSession_(params.sessionToken);
  const input = params.payload || {};

  // 0. Idempotência: se o front reenviar a MESMA solicitação (timeout de
  //    rede com o servidor tendo concluído), não gerar segunda etiqueta.
  if (input.idRequisicao) {
    const existente = buscarRegistroPorRequisicao_(fullClient.LOGIN_APP, input.idRequisicao);
    if (existente) {
      logEvent_('WARN', 'ETIQUETA', 'DUPLICADA_BLOQUEADA', {
        idRegistro: existente.ID_REGISTRO,
        login: fullClient.LOGIN_APP
      });
      throw new Error('Este envio já foi processado ou está em processamento. Confira a aba Histórico antes de emitir novamente.');
    }
  }

  // 1. Cria o registro no histórico ANTES de qualquer chamada externa.
  //    Garante rastro mesmo se a Correios derrubar a conexão no meio.
  let reg;
  withLock_(() => {
    reg = criarRegistroHistorico_(fullClient, input);
  });
  const idRegistro = reg.idRegistro;
  const rowNum = reg.rowNum;

  logEvent_('INFO', 'ETIQUETA', 'INICIO', {
    idRegistro: idRegistro,
    idCrm: fullClient.ID_CRM,
    login: fullClient.LOGIN_APP,
    destinatario: sanitize_(input.destinatarioNome),
    servico: sanitize_(input.servico)
  });

  // 2. Validação local (antes de gastar chamada na Correios).
  //    Os validadores de 06_CWS_PREPOST.gs lançam erros amigáveis.
  try {
    validarCadastroRemetente_(fullClient);
    validarInputPrepostagem_(input);
  } catch (e) {
    withLock_(() => {
      atualizarHistorico_(rowNum, {
        STATUS: 'ERRO_VALIDACAO',
        MENSAGEM_ERRO: truncate_(e.message, 500)
      });
    });
    logEvent_('ERRO', 'ETIQUETA', 'VALIDACAO', {
      idRegistro: idRegistro,
      erro: e.message,
      validationErrors: e.validationErrors || []
    });
    throw e;
  }

  // 3. Cria a pré-postagem.
  let prepost;
  try {
    withLock_(() => {
      atualizarHistorico_(rowNum, { STATUS: 'PROCESSANDO_PREPOST' });
    });

    prepost = cwsCriarPrepostagem_(fullClient, input);

    withLock_(() => {
      atualizarHistorico_(rowNum, {
        ID_PREPOSTAGEM: prepost.idPrePostagem,
        CODIGO_OBJETO: prepost.codigoObjeto,
        PRECO_COTADO: sanitize_(input.precoCotado) || prepost.valorPostagem || '',
        PRAZO_DIAS: sanitize_(input.prazoDias) || ''
      });
    });
  } catch (e) {
    withLock_(() => {
      atualizarHistorico_(rowNum, {
        STATUS: 'ERRO_PREPOST',
        MENSAGEM_ERRO: truncate_(e.message, 500)
      });
    });
    logEvent_('ERRO', 'ETIQUETA', 'PREPOST', {
      idRegistro: idRegistro,
      erro: e.message,
      cwsCode: e.cwsCode || ''
    });
    throw e;
  }

  // 4. Gera o rótulo (async + polling + Drive).
  let rotulo;
  try {
    withLock_(() => {
      atualizarHistorico_(rowNum, { STATUS: 'PROCESSANDO_ROTULO' });
    });

    rotulo = cwsEmitirRotulo_(fullClient, prepost.idPrePostagem, {
      tipoRotulo: input.tipoRotulo,
      formatoRotulo: input.formatoRotulo
    });

    withLock_(() => {
      atualizarHistorico_(rowNum, {
        ID_RECIBO_ROTULO: rotulo.idRecibo || '',
        URL_PDF_DRIVE: rotulo.driveUrl || '',
        FILE_ID_PDF_DRIVE: rotulo.driveFileId || '',
        STATUS: 'CONCLUIDO',
        MENSAGEM_ERRO: ''
      });
    });
  } catch (e) {
    withLock_(() => {
      atualizarHistorico_(rowNum, {
        STATUS: 'ERRO_ROTULO',
        MENSAGEM_ERRO: truncate_(e.message, 500)
      });
    });
    logEvent_('ERRO', 'ETIQUETA', 'ROTULO', {
      idRegistro: idRegistro,
      idPrePostagem: prepost.idPrePostagem,
      erro: e.message
    });

    // A pré-postagem foi criada mas o rótulo falhou.
    // Devolvemos o idPrePostagem pro frontend poder tentar reimprimir depois.
    const err = new Error(
      'Pré-postagem criada (' + prepost.idPrePostagem + '), mas falhou ao gerar o rótulo: ' + e.message +
      '. Você pode tentar reimprimir a partir do histórico.'
    );
    err.idRegistro = idRegistro;
    err.idPrePostagem = prepost.idPrePostagem;
    err.codigoObjeto = prepost.codigoObjeto;
    throw err;
  }

  // 4B. Gera o documento da remessa.
  //     - DC => gera DACE (DC-e dos Correios)
  //     - NF => não gera PDF adicional
  let declaracao = null;
  const tipoDocCliente = upper_(
    input.tipoDocumento ||
    fullClient.TIPO_DOCUMENTO_PADRAO ||
    CFG.CWS.DEFAULT_TIPO_DOCUMENTO
  );

  const precisaDeclaracao = tipoDocCliente === 'DC';

  if (precisaDeclaracao) {
    try {
      const formatoDc = upper_(input.formatoRotulo || fullClient.FORMATO_ROTULO_PADRAO || CFG.CWS.DEFAULT_FORMATO_ROTULO);
      declaracao = cwsEmitirDace_(fullClient, prepost.idPrePostagem, formatoDc);

      withLock_(() => {
        atualizarHistorico_(rowNum, {
          URL_PDF_DECLARACAO_DRIVE: declaracao.driveUrl || '',
          FILE_ID_DECLARACAO_DRIVE: declaracao.driveFileId || ''
        });
      });

      logEvent_('INFO', 'ETIQUETA', 'DACE_GERADO', {
        idRegistro: idRegistro,
        idPrePostagem: prepost.idPrePostagem,
        formato: formatoDc
      });
    } catch (e) {
      // Falha no documento da remessa NÃO invalida o rótulo já gerado.
      logEvent_('ERRO', 'ETIQUETA', 'DACE_FALHOU', {
        idRegistro: idRegistro,
        idPrePostagem: prepost.idPrePostagem,
        erro: e.message
      });
      declaracao = { erro: e.message };
    }
  }

  // 5. Salva destinatário no cache para autocomplete futuro.
  //    Não é crítico — se falhar, loga e segue.
  try {
    withLock_(() => {
      upsertDestinatario_(fullClient.LOGIN_APP, input);
    });
  } catch (e) {
    logEvent_('WARN', 'ETIQUETA', 'UPSERT_DEST', {
      idRegistro: idRegistro,
      erro: e.message
    });
  }

  logEvent_('INFO', 'ETIQUETA', 'CONCLUIDO', {
    idRegistro: idRegistro,
    idPrePostagem: prepost.idPrePostagem,
    codigoObjeto: prepost.codigoObjeto
  });

  // 6. Resposta para o frontend.
  return {
    idRegistro: idRegistro,
    idPrePostagem: prepost.idPrePostagem,
    codigoObjeto: prepost.codigoObjeto,
    valorPostagem: prepost.valorPostagem,
    tipoDocumento: tipoDocCliente,
    pdfBase64: rotulo.pdfBase64,
    pdfFileName: rotulo.fileName,
    driveFileId: rotulo.driveFileId || '',
    driveUrl: rotulo.driveUrl || '',
    driveDownloadUrl: rotulo.driveDownloadUrl || '',
    driveShareUrl: rotulo.driveShareUrl || '',
    driveWarning: rotulo.driveWarning || '',
    declaracao: declaracao && !declaracao.erro ? {
      pdfBase64: declaracao.pdfBase64,
      pdfFileName: declaracao.fileName,
      driveFileId: declaracao.driveFileId || '',
      driveUrl: declaracao.driveUrl || '',
      driveDownloadUrl: declaracao.driveDownloadUrl || '',
      driveShareUrl: declaracao.driveShareUrl || '',
      driveWarning: declaracao.driveWarning || ''
    } : null,
    declaracaoErro: declaracao && declaracao.erro ? declaracao.erro : null
  };
}

// ============================================================
// action: cancelarEtiqueta
// ============================================================
/**
 * Cancela a pré-postagem na Correios e marca o histórico como
 * CANCELADO. Só funciona enquanto a etiqueta não foi postada
 * no balcão (regra de negócio da Correios).
 */
function action_cancelarEtiqueta_(params) {
  const fullClient = getFullClientFromSession_(params.sessionToken);
  const idRegistro = sanitize_(params.idRegistro);
  if (!idRegistro) throw new Error('idRegistro obrigatório.');

  // Carrega o registro do histórico.
  const all = readSheetAsObjects_(CFG.SHEETS.HIST);
  const reg = all.find(r =>
    sanitize_(r.ID_REGISTRO) === idRegistro &&
    sanitize_(r.LOGIN_APP) === fullClient.LOGIN_APP
  );
  if (!reg) throw new Error('Etiqueta não encontrada ou sem permissão.');

  const idPrePostagem = sanitize_(reg.ID_PREPOSTAGEM);
  if (!idPrePostagem) {
    // Nunca chegou a criar a pré-postagem — apenas marca como cancelado.
    withLock_(() => {
      atualizarHistorico_(reg._row, { STATUS: 'CANCELADO' });
    });
    return { ok: true, idRegistro: idRegistro, cancelouNaCorreios: false };
  }

  // Cancela na Correios.
  try {
    cwsCancelarPrepostagem_(fullClient, idPrePostagem);
  } catch (e) {
    // Se falhar (ex: já postada), propaga mensagem amigável.
    logEvent_('ERRO', 'ETIQUETA', 'CANCELAR', {
      idRegistro: idRegistro,
      idPrePostagem: idPrePostagem,
      erro: e.message
    });
    throw new Error(
      'Não foi possível cancelar na Correios: ' + e.message +
      '. Se a etiqueta já foi postada no balcão, ela não pode ser cancelada.'
    );
  }

  // Atualiza o histórico.
  withLock_(() => {
    atualizarHistorico_(reg._row, {
      STATUS: 'CANCELADO',
      MENSAGEM_ERRO: ''
    });
  });

  logEvent_('INFO', 'ETIQUETA', 'CANCELADA', {
    idRegistro: idRegistro,
    idPrePostagem: idPrePostagem
  });

  return {
    ok: true,
    idRegistro: idRegistro,
    idPrePostagem: idPrePostagem,
    cancelouNaCorreios: true
  };
}

// ============================================================
// action: reimprimirEtiqueta
// ============================================================
/**
 * Reimprime o(s) PDF(s) de uma etiqueta já criada. Estratégia:
 *
 *   1. Se a etiqueta foi gerada como DC, devolve 2 PDFs: rótulo E declaração.
 *      Se foi gerada como NF, devolve só o rótulo.
 *      Se foi gerada como DC, tenta o DACE salvo; se não houver, regera.
 *
 *   2. Para cada PDF, tenta primeiro buscar no Drive (rápido e gratuito).
 *      Se o arquivo sumiu do Drive, regera via Correios usando o mesmo
 *      idPrePostagem (não cria pré-postagem nova).
 *
 *   3. Se um dos dois PDFs falhar mas o outro der OK, devolve o que
 *      funcionou com um aviso no campo `erros`.
 */
function action_reimprimirEtiqueta_(params) {
  ensureHistoricoHeaders_();
  const fullClient = getFullClientFromSession_(params.sessionToken);
  const idRegistro = sanitize_(params.idRegistro);
  if (!idRegistro) throw new Error('idRegistro obrigatório.');

  const all = readSheetAsObjects_(CFG.SHEETS.HIST);
  const reg = all.find(r =>
    sanitize_(r.ID_REGISTRO) === idRegistro &&
    sanitize_(r.LOGIN_APP) === fullClient.LOGIN_APP
  );
  if (!reg) throw new Error('Etiqueta não encontrada ou sem permissão.');

  const status = upper_(reg.STATUS);
  if (status === 'CANCELADO') {
    throw new Error('Etiqueta cancelada — não pode ser reimpressa.');
  }

  const idPrePostagem = sanitize_(reg.ID_PREPOSTAGEM);
  if (!idPrePostagem) {
    throw new Error('Etiqueta sem idPrePostagem — não é possível reimprimir. Gere uma nova.');
  }

  // Não assume DC para linhas legadas sem TIPO_DOCUMENTO. Antes da migração
  // esse campo não existia na planilha; assumir DC fazia uma etiqueta com NF-e
  // tentar gerar DACE desnecessariamente durante a reimpressão.
  const tipoDoc = upper_(
    reg.TIPO_DOCUMENTO ||
    ((sanitize_(reg.URL_PDF_DECLARACAO_DRIVE) ||
      sanitize_(reg.FILE_ID_DECLARACAO_DRIVE) ||
      sanitize_(reg.ITENS_DC_JSON)) ? 'DC' : '')
  );
  const formatoRotulo = upper_(fullClient.FORMATO_ROTULO_PADRAO || CFG.CWS.DEFAULT_FORMATO_ROTULO);
  const erros = [];

  // ======== RÓTULO ========
  let rotuloResult = null;
  try {
    rotuloResult = _reobterPdf_(fullClient, {
      driveUrl: sanitize_(reg.URL_PDF_DRIVE),
      driveFileId: sanitize_(reg.FILE_ID_PDF_DRIVE),
      idPrePostagem: idPrePostagem,
      tipoArquivo: 'rotulo',
      regerarFn: function () {
        return cwsEmitirRotulo_(fullClient, idPrePostagem, {
          formatoRotulo: formatoRotulo
        });
      }
    });
    // Se foi recuperado por busca ou regerado, grava referências persistentes.
    if (rotuloResult.origem !== 'drive-id') {
      withLock_(() => {
        atualizarHistorico_(reg._row, {
          ID_RECIBO_ROTULO: rotuloResult.idRecibo || sanitize_(reg.ID_RECIBO_ROTULO),
          URL_PDF_DRIVE: rotuloResult.driveUrl || sanitize_(reg.URL_PDF_DRIVE),
          FILE_ID_PDF_DRIVE: rotuloResult.driveFileId || sanitize_(reg.FILE_ID_PDF_DRIVE)
        });
      });
    }
  } catch (e) {
    erros.push('Rótulo: ' + e.message);
    logEvent_('ERRO', 'ETIQUETA', 'REIMPRESSAO_ROTULO', {
      idRegistro: idRegistro,
      erro: e.message
    });
  }

  // ======== DOCUMENTO DA REMESSA (só se for DC) ========
  let declaracaoResult = null;
  if (tipoDoc === 'DC' || sanitize_(reg.URL_PDF_DECLARACAO_DRIVE) || sanitize_(reg.FILE_ID_DECLARACAO_DRIVE)) {
    try {
      declaracaoResult = _reobterPdf_(fullClient, {
        driveUrl: sanitize_(reg.URL_PDF_DECLARACAO_DRIVE),
        driveFileId: sanitize_(reg.FILE_ID_DECLARACAO_DRIVE),
        idPrePostagem: idPrePostagem,
        tipoArquivo: 'declaracao',
        regerarFn: function () {
          return cwsEmitirDace_(fullClient, idPrePostagem, formatoRotulo);
        }
      });
      if (declaracaoResult.origem !== 'drive-id') {
        withLock_(() => {
          atualizarHistorico_(reg._row, {
            URL_PDF_DECLARACAO_DRIVE: declaracaoResult.driveUrl || sanitize_(reg.URL_PDF_DECLARACAO_DRIVE),
            FILE_ID_DECLARACAO_DRIVE: declaracaoResult.driveFileId || sanitize_(reg.FILE_ID_DECLARACAO_DRIVE)
          });
        });
      }
    } catch (e) {
      erros.push('Documento da remessa: ' + e.message);
      logEvent_('ERRO', 'ETIQUETA', 'REIMPRESSAO_DACE', {
        idRegistro: idRegistro,
        erro: e.message
      });
    }
  }

  // Se nenhum dos dois funcionou, é erro fatal.
  if (!rotuloResult && !declaracaoResult) {
    throw new Error('Falha ao reimprimir: ' + erros.join(' | '));
  }

  logEvent_('INFO', 'ETIQUETA', 'REIMPRESSA', {
    idRegistro: idRegistro,
    tipoDoc: tipoDoc,
    temRotulo: !!rotuloResult,
    temDc: !!declaracaoResult
  });

  return {
    idRegistro: idRegistro,
    idPrePostagem: idPrePostagem,
    codigoObjeto: sanitize_(reg.CODIGO_OBJETO),
    tipoDocumento: tipoDoc,
    pdfBase64: rotuloResult ? rotuloResult.pdfBase64 : null,
    pdfFileName: rotuloResult ? rotuloResult.pdfFileName : null,
    driveFileId: rotuloResult ? rotuloResult.driveFileId : null,
    driveUrl: rotuloResult ? rotuloResult.driveUrl : null,
    driveDownloadUrl: rotuloResult ? rotuloResult.driveDownloadUrl : null,
    origemRotulo: rotuloResult ? rotuloResult.origem : null,
    declaracao: declaracaoResult ? {
      pdfBase64: declaracaoResult.pdfBase64,
      pdfFileName: declaracaoResult.pdfFileName,
      driveFileId: declaracaoResult.driveFileId,
      driveUrl: declaracaoResult.driveUrl,
      driveDownloadUrl: declaracaoResult.driveDownloadUrl,
      origem: declaracaoResult.origem
    } : null,
    erros: erros.length ? erros : null
  };
}

/**
 * Helper interno: tenta buscar um PDF no Drive; se falhar, regera via
 * Correios. Unifica a lógica pra rótulo e declaração.
 *
 * opts = { driveUrl, idPrePostagem, tipoArquivo, regerarFn }
 * regerarFn deve retornar { pdfBase64, fileName, driveUrl, idRecibo }
 */
function _reobterPdf_(client, opts) {
  // Estratégia 1: referência persistida (fileId novo ou ID extraído da URL antiga).
  const persistedFileId = sanitize_(opts.driveFileId) || extractDriveFileId_(opts.driveUrl);
  if (persistedFileId) {
    const byId = _tryReadPdfDriveFileById_(persistedFileId, 'drive-id');
    if (byId) return byId;
  }

  // Estratégia 2: recuperação automática para registros antigos.
  // A versão anterior criava o arquivo, mas perdia a URL quando setSharing()
  // era bloqueado. Localizamos o PDF mais recente pelo idPrePostagem.
  const recovered = _findLatestPdfInConfiguredFolder_(opts.idPrePostagem, opts.tipoArquivo);
  if (recovered) {
    logEvent_('INFO', 'ETIQUETA', 'DRIVE_RECUPERADO_POR_NOME', {
      idPrePostagem: opts.idPrePostagem,
      tipoArquivo: opts.tipoArquivo,
      fileId: recovered.driveFileId,
      fileName: recovered.pdfFileName
    });
    return recovered;
  }

  // Estratégia 3: regera via Correios sem criar nova pré-postagem.
  const gerado = opts.regerarFn();
  return {
    origem: 'correios',
    pdfBase64: gerado.pdfBase64,
    pdfFileName: gerado.fileName,
    driveFileId: gerado.driveFileId || '',
    driveUrl: gerado.driveUrl || '',
    driveDownloadUrl: gerado.driveDownloadUrl || '',
    idRecibo: gerado.idRecibo || ''
  };
}

/**
 * Tenta ler um PDF já persistido no Drive pelo ID.
 */
function _tryReadPdfDriveFileById_(fileId, origem) {
  if (!fileId) return null;
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return {
      origem: origem || 'drive-id',
      pdfBase64: Utilities.base64Encode(blob.getBytes()),
      pdfFileName: file.getName(),
      driveFileId: file.getId(),
      driveUrl: file.getUrl(),
      // Não presume compartilhamento público: a reimpressão usa o base64.
      driveDownloadUrl: ''
    };
  } catch (e) {
    logEvent_('WARN', 'ETIQUETA', 'DRIVE_MISS_ID', {
      fileId: fileId,
      erro: e.message
    });
    return null;
  }
}

/**
 * Recupera o PDF mais recente na pasta configurada pelo padrão do nome.
 * Corrige automaticamente históricos legados que ficaram com URL vazia.
 */
function _findLatestPdfInConfiguredFolder_(idPrePostagem, tipoArquivo) {
  const id = sanitize_(idPrePostagem);
  if (!id || !CFG.DRIVE_FOLDER_ID || CFG.DRIVE_FOLDER_ID.indexOf('__COLE') >= 0) return null;

  const prefixes = tipoArquivo === 'declaracao'
    ? ['dace_' + id + '_', 'declaracao_' + id + '_']
    : ['etiqueta_' + id + '_'];

  try {
    const folder = DriveApp.getFolderById(CFG.DRIVE_FOLDER_ID);
    const files = folder.getFiles();
    let latestFile = null;
    let latestMs = -1;

    while (files.hasNext()) {
      const file = files.next();
      const name = String(file.getName() || '');
      const matches = prefixes.some(prefix => name.indexOf(prefix) === 0);
      if (!matches || !/\.pdf$/i.test(name)) continue;

      const updated = file.getLastUpdated();
      const ms = updated && updated.getTime ? updated.getTime() : 0;
      if (!latestFile || ms > latestMs) {
        latestFile = file;
        latestMs = ms;
      }
    }

    if (!latestFile) return null;
    const blob = latestFile.getBlob();
    return {
      origem: 'drive-folder-recovery',
      pdfBase64: Utilities.base64Encode(blob.getBytes()),
      pdfFileName: latestFile.getName(),
      driveFileId: latestFile.getId(),
      driveUrl: latestFile.getUrl(),
      driveDownloadUrl: ''
    };
  } catch (e) {
    logEvent_('WARN', 'ETIQUETA', 'DRIVE_RECUPERACAO_POR_NOME_FALHOU', {
      idPrePostagem: id,
      tipoArquivo: tipoArquivo,
      erro: e.message
    });
    return null;
  }
}

// Helper interno: extrai o fileId de uma URL do Drive.
function extractDriveFileId_(url) {
  if (!url) return '';
  const m1 = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return '';
}



// ============================================================
// action: criarEtiquetaDireta
// ============================================================
/**
 * Fluxo simplificado da nova aba ETIQUETA.
 * O usuário escolhe apenas o tipo de envio e informa os dados da etiqueta.
 * Peso, dimensões e tipo do objeto entram com defaults operacionais do backend.
 */
function action_criarEtiquetaDireta_(params) {
  const fullClient = getFullClientFromSession_(params.sessionToken);
  const input = buildPayloadEtiquetaDireta_(fullClient, params.payload || {});
  return action_criarEtiqueta_({
    sessionToken: params.sessionToken,
    payload: input
  });
}

function buildPayloadEtiquetaDireta_(client, input) {
  const servico = upper_(input.servico);
  if (!servico) {
    throw new Error('Selecione o tipo de envio.');
  }
  if (servico === 'PAC' && !nonEmpty_(client.COD_SERVICO_PAC)) {
    throw new Error('PAC não está disponível para este cliente.');
  }
  if (servico === 'SEDEX' && !nonEmpty_(client.COD_SERVICO_SEDEX)) {
    throw new Error('SEDEX não está disponível para este cliente.');
  }

  return Object.assign({}, input, {
    servico: servico,
    tipoObjeto: sanitize_(input.tipoObjeto) || CFG.ETIQUETA_DIRETA.TIPO_OBJETO,
    pesoG: nonEmpty_(input.pesoG) ? input.pesoG : CFG.ETIQUETA_DIRETA.PESO_G,
    comprimentoCm: nonEmpty_(input.comprimentoCm) ? input.comprimentoCm : CFG.ETIQUETA_DIRETA.COMPRIMENTO_CM,
    larguraCm: nonEmpty_(input.larguraCm) ? input.larguraCm : CFG.ETIQUETA_DIRETA.LARGURA_CM,
    alturaCm: nonEmpty_(input.alturaCm) ? input.alturaCm : CFG.ETIQUETA_DIRETA.ALTURA_CM,
    diametroCm: nonEmpty_(input.diametroCm) ? input.diametroCm : CFG.ETIQUETA_DIRETA.DIAMETRO_CM,
    precoCotado: '',
    prazoDias: ''
  });
}
