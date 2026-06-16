function salvarEtiqueta(token, payload) {
  const sessionClient = getSession_(token);
  validarPayloadEtiqueta_(payload);

  const idRegistro = uid_('ETQ');
  const row = [
    nowIso_(),
    idRegistro,
    sessionClient.idCrm,
    sessionClient.login,
    sessionClient.nomeRemetente,
    sessionClient.nomeFantasia,
    sessionClient.cnpjCpf,
    sessionClient.numContrato,
    sessionClient.cartaoPostagem,
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
    'PENDENTE_CWS'
  ];

  getSheet_(CFG.SHEETS.HIST).appendRow(row);

  try {
    const client = findClientByLogin_(sessionClient.login);
    if (!client) throw new Error('Cadastro do cliente não localizado na base.');

    const pre = cwsCriarPrePostagem_(client, payload);
    const idPrePostagem = pre?.json?.id || pre?.json?.prePostagem?.id || '';
    if (!idPrePostagem) {
      throw new Error('Pré-postagem criada sem retorno claro do id. Verifique o LOG_APP.');
    }

    const pdfResp = cwsEmitirRotuloPdf_(client, idPrePostagem, payload);
    const pdfBlob = resolvePdfBlobFromRotuloResponse_(client, pdfResp);
    const base64 = Utilities.base64Encode(pdfBlob.getBytes());

    const codigoRastreio = extractCodigoRastreio_(pre?.json);
    updateHistoricoStatus_(idRegistro, {
      codigoRastreio,
      status: 'GERADO_CWS'
    });

    writeLog_('INFO', 'CWS', 'GERAR_ROTULO', {
      idCrm: client.ID_CRM,
      login: client.LOGIN_APP,
      referencia: idRegistro,
      status: 'OK',
      mensagem: 'Rótulo oficial gerado',
      detalhes: JSON.stringify({ idPrePostagem, codigoRastreio })
    });

    return {
      ok: true,
      idRegistro,
      pdfBase64: base64,
      fileName: `etiqueta_${idRegistro}.pdf`,
      status: 'GERADO_CWS',
      aviso: 'Rótulo oficial dos Correios gerado via CWS.',
      idPrePostagem,
      codigoRastreio
    };
  } catch (err) {
    updateHistoricoStatus_(idRegistro, { status: 'ERRO_CWS' });
    writeLog_('ERRO', 'CWS', 'GERAR_ROTULO', {
      idCrm: sessionClient.idCrm,
      login: sessionClient.login,
      referencia: idRegistro,
      status: 'ERRO',
      mensagem: err.message,
      detalhes: JSON.stringify(payload)
    });
    return { ok: false, message: err.message };
  }
}

function resolvePdfBlobFromRotuloResponse_(client, resp) {
  if (resp.blob && String(resp.contentType || '').toLowerCase().indexOf('application/pdf') >= 0) {
    return resp.blob.setName('rotulo.pdf');
  }

  if (resp.text && String(resp.text).startsWith('%PDF')) {
    return Utilities.newBlob(resp.text, 'application/pdf', 'rotulo.pdf');
  }

  if (resp.json && resp.json.url) {
    const downloaded = cwsRequest_(client, {
      service: 'PREPOSTAGEM',
      path: resp.json.url.replace(/^https?:\/\/[^/]+/i, ''),
      method: 'get',
      accept: 'application/pdf',
      binary: true
    });
    if (downloaded.blob) return downloaded.blob.setName('rotulo.pdf');
  }

  throw new Error('O endpoint de rótulo respondeu, mas não devolveu um PDF utilizável. Precisamos validar o retorno real no seu CWS.');
}

function extractCodigoRastreio_(preJson) {
  if (!preJson) return '';
  return sanitizeText_(preJson.codigoObjeto || preJson.codigo || preJson.objeto?.codigo || preJson.prePostagem?.codigoObjeto || '');
}

function listarHistoricoCliente(token) {
  const client = getSession_(token);
  const rows = getDataObjects_(CFG.SHEETS.HIST)
    .filter(r => sanitizeText_(r.LOGIN_APP).toLowerCase() === sanitizeText_(client.login).toLowerCase())
    .sort((a, b) => String(b.DATA_HORA).localeCompare(String(a.DATA_HORA)));
  return { ok: true, items: rows.slice(0, 100) };
}

function validarPayloadEtiqueta_(p) {
  const required = [
    ['destinatarioNome', 'Nome do destinatário'],
    ['destinatarioCep', 'CEP do destinatário'],
    ['destinatarioEndereco', 'Endereço do destinatário'],
    ['destinatarioNumero', 'Número do destinatário'],
    ['destinatarioBairro', 'Bairro do destinatário'],
    ['destinatarioCidade', 'Cidade do destinatário'],
    ['destinatarioUf', 'UF do destinatário'],
    ['servico', 'Tipo de serviço'],
    ['formatoEtiqueta', 'Formato da etiqueta'],
    ['tipoObjeto', 'Tipo do objeto'],
    ['pesoG', 'Peso'],
    ['comprimentoCm', 'Comprimento'],
    ['larguraCm', 'Largura'],
    ['alturaCm', 'Altura']
  ];
  const missing = required.filter(([key]) => !sanitizeText_(p[key])).map(([, label]) => label);
  if (missing.length) throw new Error('Preencha: ' + missing.join(', '));
}
