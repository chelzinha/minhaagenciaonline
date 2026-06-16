function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(CFG.APP_TITLE || 'APP Etiquetas')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getAppBootstrap() {
  const cfg = getConfigMap_();
  return {
    ok: true,
    appName: cfg.APP_NOME || CFG.APP_TITLE,
    formatos: [
      { value: 'A4', label: 'A4' },
      { value: '10X15', label: '10x15' }
    ],
    tiposObjeto: [
      { value: 'CAIXA', label: 'Caixa' },
      { value: 'PACOTE', label: 'Pacote' },
      { value: 'ENVELOPE', label: 'Envelope' },
      { value: 'ROLO', label: 'Rolo' }
    ],
    servicos: [
      { value: 'PAC', label: 'PAC' },
      { value: 'SEDEX', label: 'SEDEX' }
    ]
  };
}

function loginClienteApp(login, senha) {
  const resp = loginCliente(login, senha);
  if (!resp || !resp.ok) {
    throw new Error((resp && resp.message) || 'Falha no login.');
  }
  return {
    ok: true,
    token: resp.token,
    cliente: resp.client
  };
}

function getClienteLogado() {
  const resp = getSessionClient();
  if (!resp || !resp.ok) {
    throw new Error('Sessão inválida ou expirada.');
  }
  return resp.client;
}

function logoutClienteApp() {
  return logoutCliente();
}

function buscarCep(cep) {
  const raw = String(cep || '').replace(/\D/g, '');
  if (raw.length !== 8) {
    throw new Error('CEP inválido. Informe 8 dígitos.');
  }

  const url = 'https://viacep.com.br/ws/' + raw + '/json/';
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });

  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code !== 200) {
    throw new Error('Falha ao consultar CEP (' + code + ').');
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('Resposta inválida ao consultar CEP.');
  }

  if (!json || json.erro) {
    throw new Error('CEP não encontrado.');
  }

  return {
    cep: raw,
    logradouro: json.logradouro || '',
    complemento: json.complemento || '',
    bairro: json.bairro || '',
    cidade: json.localidade || '',
    uf: json.uf || '',
    ibge: json.ibge || ''
  };
}

function salvarEtiqueta(payload) {
  const sessionClient = getSession_();
  const fullClient = findClientByLogin_(sessionClient.LOGIN_APP);

  if (!fullClient) {
    throw new Error('Cliente da sessão não encontrado na planilha.');
  }

  validarPayloadEtiquetaApp_(payload);

  const histInfo = registrarHistoricoInicial_(fullClient, payload);

  writeLog_('INFO', 'ETIQUETA', 'INICIO_GERACAO', {
    idCrm: fullClient.ID_CRM,
    login: fullClient.LOGIN_APP,
    referencia: histInfo.idRegistro,
    status: 'OK',
    mensagem: 'Iniciando geração da etiqueta'
  });

  try {
    const preResp = cwsCriarPrePostagem_(fullClient, payload);
    const preJson = safeJsonFromResponse_(preResp);

    const idPrePostagem = extractFirstValueByKeys_(preJson, [
      'idPrePostagem',
      'id',
      'prePostagemId'
    ]);

    if (!idPrePostagem) {
      throw new Error('A pré-postagem não retornou um id reconhecível.');
    }

    const codigoRastreioPre = extractFirstValueByKeys_(preJson, [
      'codigoObjeto',
      'numeroObjeto',
      'codigoRastreio',
      'codObjeto'
    ]) || '';

    atualizarHistorico_(histInfo.rowNum, {
      codigoRastreio: codigoRastreioPre,
      status: 'PREPOSTAGEM_OK'
    });

    writeLog_('INFO', 'CWS', 'PREPOSTAGEM', {
      idCrm: fullClient.ID_CRM,
      login: fullClient.LOGIN_APP,
      referencia: String(idPrePostagem),
      status: 'OK',
      mensagem: 'Pré-postagem criada com sucesso',
      detalhes: JSON.stringify(preJson || {})
    });

    const rotResp = cwsEmitirRotuloPdf_(fullClient, idPrePostagem, payload);

    let pdfBase64 = '';
    let pdfUrl = '';
    const fileName = 'rotulo_' + histInfo.idRegistro + '.pdf';

    if (rotResp && rotResp.blob) {
      pdfBase64 = Utilities.base64Encode(rotResp.blob.getBytes());
    } else {
      const rotJson = safeJsonFromResponse_(rotResp);
      pdfUrl = extractFirstValueByKeys_(rotJson, ['url', 'link', 'downloadUrl', 'pdfUrl']) || '';

      const codigoRastreioRot = extractFirstValueByKeys_(rotJson, [
        'codigoObjeto',
        'numeroObjeto',
        'codigoRastreio',
        'codObjeto'
      ]) || codigoRastreioPre;

      atualizarHistorico_(histInfo.rowNum, {
        codigoRastreio: codigoRastreioRot,
        status: pdfUrl ? 'ROTULO_LINK_OK' : 'ROTULO_SEM_PDF'
      });

      if (!pdfUrl) {
        throw new Error('O endpoint do rótulo não retornou PDF nem URL reconhecível.');
      }
    }

    atualizarHistorico_(histInfo.rowNum, {
      codigoRastreio: codigoRastreioPre,
      status: 'CONCLUIDO'
    });

    writeLog_('INFO', 'CWS', 'ROTULO', {
      idCrm: fullClient.ID_CRM,
      login: fullClient.LOGIN_APP,
      referencia: histInfo.idRegistro,
      status: 'OK',
      mensagem: 'Rótulo gerado com sucesso'
    });

    return {
      ok: true,
      idRegistro: histInfo.idRegistro,
      idPrePostagem: idPrePostagem,
      codigoRastreio: codigoRastreioPre,
      pdfBase64: pdfBase64,
      pdfUrl: pdfUrl,
      fileName: fileName,
      message: 'Etiqueta gerada com sucesso.'
    };
  } catch (err) {
    atualizarHistorico_(histInfo.rowNum, { status: 'ERRO_CWS' });

    writeLog_('ERRO', 'CWS', 'GERAR_ETIQUETA', {
      idCrm: fullClient.ID_CRM,
      login: fullClient.LOGIN_APP,
      referencia: histInfo.idRegistro,
      status: 'ERRO',
      mensagem: err.message || String(err),
      detalhes: err.stack || ''
    });

    throw err;
  }
}

function registrarHistoricoInicial_(client, payload) {
  const sh = getSheet_(CFG.SHEETS.HIST);
  const idRegistro = uid_('ETQ');

  sh.appendRow([
    nowIso_(),
    idRegistro,
    sanitizeText_(client.ID_CRM),
    sanitizeText_(client.LOGIN_APP),
    sanitizeText_(client.NOME_REMETENTE),
    sanitizeText_(client.NOME_FANTASIA),
    sanitizeText_(client.CNPJ_CPF),
    sanitizeText_(client.NUM_CONTRATO),
    sanitizeText_(client.CARTAO_POSTAGEM),
    sanitizeText_(payload.destinatarioNome),
    sanitizeText_(payload.destinatarioCpfCnpj),
    sanitizeText_(payload.destinatarioCep),
    sanitizeText_(payload.destinatarioUf),
    sanitizeText_(payload.destinatarioCidade),
    sanitizeText_(payload.servico),
    sanitizeText_(payload.formatoEtiqueta),
    sanitizeText_(payload.tipoObjeto),
    sanitizeText_(payload.pesoG),
    sanitizeText_(payload.comprimentoCm),
    sanitizeText_(payload.larguraCm),
    sanitizeText_(payload.alturaCm),
    sanitizeText_(payload.valorDeclarado),
    '',
    'PROCESSANDO_CWS'
  ]);

  return { rowNum: sh.getLastRow(), idRegistro: idRegistro };
}

function atualizarHistorico_(rowNum, data) {
  const sh = getSheet_(CFG.SHEETS.HIST);
  if (typeof data.codigoRastreio !== 'undefined') sh.getRange(rowNum, 23).setValue(sanitizeText_(data.codigoRastreio));
  if (typeof data.status !== 'undefined') sh.getRange(rowNum, 24).setValue(sanitizeText_(data.status));
}

function validarPayloadEtiquetaApp_(p) {
  const required = [
    ['destinatarioNome', 'Nome do destinatário'],
    ['destinatarioCep', 'CEP do destinatário'],
    ['destinatarioEndereco', 'Logradouro'],
    ['destinatarioNumero', 'Número'],
    ['destinatarioBairro', 'Bairro'],
    ['destinatarioCidade', 'Cidade'],
    ['destinatarioUf', 'UF'],
    ['servico', 'Serviço'],
    ['formatoEtiqueta', 'Formato da etiqueta'],
    ['tipoObjeto', 'Tipo do objeto'],
    ['pesoG', 'Peso'],
    ['comprimentoCm', 'Comprimento'],
    ['larguraCm', 'Largura'],
    ['alturaCm', 'Altura']
  ];

  const missing = required
    .filter(pair => !sanitizeText_(p[pair[0]]))
    .map(pair => pair[1]);

  if (missing.length) {
    throw new Error('Preencha: ' + missing.join(', '));
  }

  if (digitsOnly_(p.destinatarioCep).length !== 8) {
    throw new Error('CEP do destinatário inválido.');
  }
}
