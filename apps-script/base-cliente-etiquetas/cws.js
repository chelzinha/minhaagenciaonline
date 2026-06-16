function resolveAmbienteCws_(client) {
  const amb = upper_(client.AMBIENTE_CWS || 'HOMOLOGACAO');
  return amb === 'PRODUCAO' ? 'PRODUCAO' : 'HOMOLOGACAO';
}

function getCwsBaseUrl_(client, service) {
  const ambiente = resolveAmbienteCws_(client);
  const bases = CFG.CWS.BASES[ambiente];
  if (!bases || !bases[service]) {
    throw new Error('Base CWS não configurada para ' + ambiente + ' / ' + service);
  }
  return bases[service];
}

function validarCamposMinimosCws_(client) {
  const faltando = [];
  if (!sanitizeText_(client.LOGIN_APP)) faltando.push('LOGIN_APP');
  if (!sanitizeText_(client.LOGIN_IDCORREIOS)) faltando.push('LOGIN_IDCORREIOS');
  if (!sanitizeText_(client.TOKEN_API)) faltando.push('TOKEN_API');
  if (!sanitizeText_(client.CARTAO_POSTAGEM)) faltando.push('CARTAO_POSTAGEM');
  if (!sanitizeText_(client.AMBIENTE_CWS)) faltando.push('AMBIENTE_CWS');

  if (faltando.length) {
    throw new Error('Campos obrigatórios ausentes: ' + faltando.join(', '));
  }
}

function atualizarStatusTesteCws_(client, status) {
  const sh = getSheet_(CFG.SHEETS.CLIENTES);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const idx = headers.indexOf('STATUS_TESTE_CWS');
  if (idx < 0) return;

  const row = findClientRowByLogin_(sanitizeText_(client.LOGIN_APP));
  if (!row) return;

  sh.getRange(row, idx + 1).setValue(status);
}

function cwsGetBearerToken_(client, forceNew) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'CWS_TOKEN_' + sanitizeText_(client.LOGIN_APP || client.ID_CRM);

  if (!forceNew) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.token) return parsed;
      } catch (e) {}
    }
  }

  const login = sanitizeText_(client.LOGIN_IDCORREIOS);
  const senha = sanitizeText_(client.TOKEN_API);
  if (!login || !senha) {
    throw new Error('Credenciais CWS incompletas. Preencha LOGIN_IDCORREIOS e TOKEN_API.');
  }

  const url = getCwsBaseUrl_(client, 'TOKEN') + '/v1/autentica';
  const basic = Utilities.base64Encode(login + ':' + senha);

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    muteHttpExceptions: true,
    headers: {
      accept: 'application/json',
      Authorization: 'Basic ' + basic
    },
    payload: '',
    followRedirects: true,
    validateHttpsCertificates: true
  });

  const code = resp.getResponseCode();
  const text = resp.getContentText();

  if (code !== 200 && code !== 201) {
    throw new Error('Token CWS (' + code + '): ' + text);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('Resposta inválida ao gerar token: ' + text);
  }

  const token = json.token || json.jwt || json.accessToken;
  if (!token) throw new Error('Resposta sem token: ' + text);

  const packed = {
    token: token,
    ambiente: json.ambiente || resolveAmbienteCws_(client),
    expiraEm: json.expiraEm || ''
  };

  cache.put(cacheKey, JSON.stringify(packed), CFG.CWS.TOKEN_TTL_SEC_FALLBACK);
  return packed;
}

function cwsRequest_(client, opts) {
  const tokenInfo = cwsGetBearerToken_(client, false);
  const base = getCwsBaseUrl_(client, opts.service);
  const url = base + opts.path;

  const params = {
    method: String(opts.method || 'get').toLowerCase(),
    muteHttpExceptions: opts.muteHttpExceptions !== false,
    headers: Object.assign({
      Authorization: 'Bearer ' + tokenInfo.token,
      Accept: opts.accept || 'application/json'
    }, opts.headers || {}),
    followRedirects: true,
    validateHttpsCertificates: true
  };

  if (opts.contentType) params.contentType = opts.contentType;
  if (typeof opts.payload !== 'undefined') params.payload = opts.payload;

  const resp = UrlFetchApp.fetch(url, params);
  const code = resp.getResponseCode();
  const headers = resp.getAllHeaders();
  const text = resp.getContentText();
  const contentType = String(headers['Content-Type'] || headers['content-type'] || '');

  if (code < 200 || code >= 300) {
    throw new Error('CWS ' + (opts.service || '') + ' falhou (' + code + '): ' + truncate_(text, 1000));
  }

  if (opts.binary || /application\/pdf/i.test(contentType)) {
    return {
      code: code,
      headers: headers,
      contentType: contentType,
      blob: resp.getBlob(),
      text: text
    };
  }

  let json = null;
  try { json = JSON.parse(text); } catch (e) {}

  return {
    code: code,
    headers: headers,
    contentType: contentType,
    text: text,
    json: json
  };
}

function resolveCodigoServico_(client, servicoTela) {
  const key = upper_(servicoTela);
  const pac = digitsOnly_(client.COD_SERVICO_PAC);
  const sedex = digitsOnly_(client.COD_SERVICO_SEDEX);

  if (key === 'PAC') {
    if (!pac) throw new Error('Preencha COD_SERVICO_PAC do cliente.');
    return pac;
  }
  if (key === 'SEDEX') {
    if (!sedex) throw new Error('Preencha COD_SERVICO_SEDEX do cliente.');
    return sedex;
  }

  const raw = digitsOnly_(servicoTela);
  if (!raw) throw new Error('Serviço inválido.');
  return raw;
}

function resolveFormatoRotulo_(client, formatoTela) {
  const saved = upper_(client.FORMATO_ROTULO_PADRAO || '');
  if (saved) return saved;
  return upper_(formatoTela) === '10X15' ? 'ET' : 'A4';
}

function buildPrePostagemBody_(client, payload, codigoServico) {
  if (upper_(payload.ar) === 'SIM') {
    throw new Error('AR ainda não foi ligado no payload CWS. Deixe como NÃO nesta etapa.');
  }

  if (toMoneyNumber_(payload.valorDeclarado) > 0) {
    throw new Error('Valor declarado ainda não foi ligado no payload CWS. Deixe zerado nesta etapa.');
  }

  const remetentePhone = splitPhoneBr_(client.WHATSAPP || client.CONTATO || '');
  const destPhone = splitPhoneBr_(payload.destinatarioCelular || '');

  return {
    codigoServico: codigoServico,
    codigoFormatoObjetoInformado: '1',
    alturaInformada: sanitizeText_(payload.alturaCm || '0'),
    larguraInformada: sanitizeText_(payload.larguraCm || '0'),
    comprimentoInformado: sanitizeText_(payload.comprimentoCm || '0'),
    diametroInformado: sanitizeText_(payload.diametroCm || '0'),
    pesoCubico: sanitizeText_(payload.pesoCubico || payload.pesoG || '0'),
    pesoInformado: sanitizeText_(payload.pesoG || '0'),
    tipoDocumento: upper_(client.TIPO_DOCUMENTO_PADRAO || CFG.CWS.DEFAULT_TIPO_DOCUMENTO),
    precoPostagem: 0,
    remetente: {
      nome: sanitizeText_(client.NOME_REMETENTE),
      dddCelular: remetentePhone.ddd,
      celular: remetentePhone.numero,
      email: sanitizeText_(client.EMAIL),
      cpfCnpj: digitsOnly_(client.CNPJ_CPF),
      endereco: {
        cep: digitsOnly_(client.CEP),
        logradouro: sanitizeText_(client.ENDERECO),
        numero: sanitizeText_(client.NUMERO),
        complemento: '',
        bairro: sanitizeText_(client.BAIRRO),
        cidade: sanitizeText_(client.CIDADE_REMETENTE || 'FORTALEZA'),
        uf: upper_(client.UF_REMETENTE || 'CE')
      }
    },
    destinatario: {
      nome: sanitizeText_(payload.destinatarioNome),
      dddCelular: destPhone.ddd,
      celular: destPhone.numero,
      email: sanitizeText_(payload.destinatarioEmail || ''),
      cpfCnpj: digitsOnly_(payload.destinatarioCpfCnpj),
      endereco: {
        cep: digitsOnly_(payload.destinatarioCep),
        logradouro: sanitizeText_(payload.destinatarioEndereco),
        numero: sanitizeText_(payload.destinatarioNumero),
        complemento: sanitizeText_(payload.destinatarioComplemento),
        bairro: sanitizeText_(payload.destinatarioBairro),
        cidade: sanitizeText_(payload.destinatarioCidade),
        uf: upper_(payload.destinatarioUf)
      }
    }
  };
}

function cwsCriarPrePostagem_(client, payload) {
  const serviceCode = resolveCodigoServico_(client, payload.servico);
  const body = buildPrePostagemBody_(client, payload, serviceCode);

  return cwsRequest_(client, {
    service: 'PREPOSTAGEM',
    path: '/v1/prepostagens',
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body)
  });
}

function cwsEmitirRotuloPdf_(client, idPrePostagem, payload) {
  const tipoRotulo = upper_(client.TIPO_ROTULO_PADRAO || CFG.CWS.DEFAULT_TIPO_ROTULO);
  const formatoRotulo = resolveFormatoRotulo_(client, payload.formatoEtiqueta);

  return cwsRequest_(client, {
    service: 'PREPOSTAGEM',
    path: '/v1/prepostagens/rotulo/assincrono/pdf',
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      idsPrePostagem: [idPrePostagem],
      tipoRotulo: tipoRotulo,
      formatoRotulo: formatoRotulo
    }),
    binary: true,
    muteHttpExceptions: true
  });
}

function testarCwsPorLoginApp(loginApp, detalhar) {
  const client = findClientByLogin_(loginApp);
  if (!client) throw new Error('Cliente não encontrado para o login informado.');
  validarCamposMinimosCws_(client);

  try {
    const tokenInfo = cwsGetBearerToken_(client, true);
    atualizarStatusTesteCws_(client, 'OK');

    writeLog_('INFO', 'CWS', 'TESTE_TOKEN', {
      idCrm: client.ID_CRM,
      login: client.LOGIN_APP,
      referencia: client.CARTAO_POSTAGEM,
      status: 'OK',
      mensagem: 'Token CWS obtido com sucesso',
      detalhes: detalhar ? JSON.stringify({
        ambiente: tokenInfo.ambiente,
        expiraEm: tokenInfo.expiraEm || ''
      }) : ''
    });

    return {
      ok: true,
      ambiente: tokenInfo.ambiente,
      expiraEm: tokenInfo.expiraEm || '',
      cartaoPostagem: client.CARTAO_POSTAGEM,
      loginIdCorreios: client.LOGIN_IDCORREIOS
    };
  } catch (err) {
    atualizarStatusTesteCws_(client, 'BLOQUEADO');

    writeLog_('ERRO', 'CWS', 'TESTE_TOKEN', {
      idCrm: client.ID_CRM,
      login: client.LOGIN_APP,
      referencia: client.CARTAO_POSTAGEM,
      status: 'ERRO',
      mensagem: err.message || String(err),
      detalhes: detalhar ? (err.stack || '') : ''
    });

    throw err;
  }
}

function testarCwsLinhaAtiva() {
  const sh = getSheet_(CFG.SHEETS.CLIENTES);
  const row = sh.getActiveRange().getRow();
  if (row < 2) throw new Error('Selecione uma linha válida do cliente na aba CLIENTES_APP.');

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const values = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const obj = {};
  headers.forEach((h, i) => obj[String(h || '').trim()] = values[i]);

  if (!sanitizeText_(obj.LOGIN_APP)) {
    throw new Error('A linha selecionada não possui LOGIN_APP preenchido.');
  }

  return testarCwsPorLoginApp(obj.LOGIN_APP, true);
}
