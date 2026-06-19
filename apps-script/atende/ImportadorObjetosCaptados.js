// ============================================================
//  IMPORTADOR - JSON DE OBJETOS CAPTADOS
// ============================================================

function processarEBuscar(jsonString) {
  return importarObjetosCaptadosCorreiosAtende_(jsonString, { origem: 'manual-front' });
}

function importarObjetosCaptadosCorreiosAtende_(jsonString, options) {
  var lock = LockService.getScriptLock();
  var origem = (options && options.origem) || 'manual';
  try {
    lock.waitLock(30000);
    ensureAtendeStructure_(getAtendeSpreadsheet_());
    var roots = parseJsonRoots_(jsonString);
    var itens = collectPayloadItems_(roots, isObjetoCaptadoRecord_);
    var normalized = normalizarObjetosCaptadosParaPostagens_(itens);

    salvarRawJson_(ATENDE_CONFIG.SHEETS.RAW_OBJETOS_CAPTADOS, origem, jsonString, {
      itens: itens.length,
      objetos: normalized.records.length,
      eventos: normalized.eventos.length,
    });
    salvarEventosObjetos_(normalized.eventos, origem);

    var result = upsertPostagens_(normalized.records);
    registrarLogImportacao_('objetos_captados', {
      status: 'ok',
      totalObjetos: normalized.records.length,
      criados: result.created,
      atualizados: result.updated,
      ignorados: result.skipped,
      hash: hashText_(jsonString),
    });

    return buildImportResponse_(result, {
      added: result.created,
      updated: result.updated,
      skipped: result.skipped,
      total: normalized.records.length,
    });
  } catch (err) {
    registrarErro_('importarObjetosCaptadosCorreiosAtende', err, {
      origem: origem,
      hash: hashText_(jsonString),
    });
    return erroResposta_(err);
  } finally {
    releaseLockQuietly_(lock);
  }
}

function normalizarObjetosCaptadosParaPostagens_(itens) {
  var records = [];
  var eventos = [];

  itens.forEach(function(item) {
    var candidates = [];
    if (isObj_(item.acoletar)) candidates.push({ origem: 'A Coletar', objeto: item.acoletar });
    if (isObj_(item.coletado)) candidates.push({ origem: 'Coletado', objeto: item.coletado });
    if (!candidates.length) candidates.push({ origem: 'Rastreamento', objeto: item });

    candidates.forEach(function(candidate) {
      var record = extrairPostagemDeObjetoCaptado_(candidate.objeto, candidate.origem, item);
      if (!record['Objeto']) return;
      records.push(record);
      eventos = eventos.concat(extrairEventosObjeto_(candidate.objeto, item, record['Objeto']));
    });
  });

  return { records: records, eventos: eventos };
}

function extrairPostagemDeObjetoCaptado_(objeto, origem, itemPai) {
  var pai = isObj_(itemPai) ? itemPai : {};
  var eventos = firstArray_(objeto.eventos, pai.eventos);
  var eventoPostagem = eventos.filter(isObj_).filter(function(evento) {
    return safe_(evento.codigo).toUpperCase() === 'PO';
  })[0] || eventos.filter(isObj_)[0] || {};

  var remetente = firstObject_(eventoPostagem.remetente, objeto.remetente, pai.remetente);
  var destinatario = firstObject_(eventoPostagem.destinatario, objeto.destinatario, pai.destinatario);
  var enderecoRemetente = firstObject_(remetente.endereco, objeto.enderecoRemetente, pai.enderecoRemetente);
  var enderecoDestinatario = firstObject_(destinatario.endereco, objeto.enderecoDestinatario, pai.enderecoDestinatario);
  var servico = firstObject_(objeto.servico, pai.servico);
  var tipoPostal = firstObject_(objeto.tipoPostal, pai.tipoPostal);
  var telefone = extrairTelefone_(remetente, objeto, pai);

  return {
    'Objeto': normalizeObjectCode_(firstText_(objeto.codObjeto, objeto.codigoObjeto, pai.codObjeto, pai.codigoObjeto)),
    'Categoria': firstText_(tipoPostal.categoria, objeto.categoria, pai.categoria).trim(),
    'Contrato': firstText_(objeto.contrato, pai.contrato).trim(),
    'Cartão Postagem': firstText_(objeto.cartaoPostagem, pai.cartaoPostagem).trim(),
    'Remetente': firstText_(remetente.nome, remetente.nomeRazaoSocial, remetente.razaoSocial).trim(),
    'Rem. Documento': firstText_(remetente.documento, remetente.cpfCnpj, remetente.cpf, remetente.cnpj).trim(),
    'Peso (kg)': firstNumber_(objeto.peso, pai.peso),
    'Larg. (cm)': firstNumber_(objeto.largura, pai.largura),
    'Comp. (cm)': firstNumber_(objeto.comprimento, pai.comprimento),
    'Alt. (cm)': firstNumber_(objeto.altura, pai.altura),
    'Diâm. (cm)': firstNumber_(objeto.diametro, pai.diametro),
    'VD': firstNumber_(servico.vd, objeto.valorDeclarado, objeto.valorRecebido, pai.valorRecebido),
    'Formato': firstText_(objeto.formato, pai.formato).trim(),
    'Rem. CEP': firstText_(enderecoRemetente.cep).trim(),
    'Rem. Logradouro': firstText_(enderecoRemetente.logradouro, enderecoRemetente.endereco).trim(),
    'Rem. Número': firstText_(enderecoRemetente.numero).trim(),
    'Rem. Comp': firstText_(enderecoRemetente.complemento).trim(),
    'Rem. Bairro': firstText_(enderecoRemetente.bairro).trim(),
    'Rem. Cidade': firstText_(enderecoRemetente.cidade, enderecoRemetente.municipio).trim(),
    'Rem. UF': firstText_(enderecoRemetente.uf).trim(),
    'Rem. Telefone': formatPhone_(telefone),
    'Dest. Nome': firstText_(destinatario.nome, destinatario.nomeRazaoSocial, destinatario.razaoSocial).trim(),
    'Dest. Documento': firstText_(destinatario.documento, destinatario.cpfCnpj, destinatario.cpf, destinatario.cnpj).trim(),
    'Dest. CEP': firstText_(enderecoDestinatario.cep).trim(),
    'Dest. Logradouro': firstText_(enderecoDestinatario.logradouro, enderecoDestinatario.endereco).trim(),
    'Dest. Número': firstText_(enderecoDestinatario.numero).trim(),
    'Dest. Complemento': firstText_(enderecoDestinatario.complemento).trim(),
    'Dest. Bairro': firstText_(enderecoDestinatario.bairro).trim(),
    'Dest. Cidade': firstText_(enderecoDestinatario.cidade, enderecoDestinatario.municipio).trim(),
    'Dest. UF': firstText_(enderecoDestinatario.uf).trim(),
    'Tipo Postagem': origem,
    'Status': firstText_(eventoPostagem.descricao, objeto.statusDesc, objeto.status, objeto.descricao, pai.statusDesc, pai.status).trim(),
    'Prev. Entrega': firstText_(objeto.dtPrevista, objeto.dataPrevista, pai.dtPrevista).trim(),
  };
}

function extrairEventosObjeto_(objeto, itemPai, codObjeto) {
  var eventos = firstArray_(objeto.eventos, itemPai.eventos);
  return eventos.filter(isObj_).map(function(evento) {
    var unidade = firstObject_(evento.unidade, evento.local);
    return {
      objeto: codObjeto,
      codigo: firstText_(evento.codigo).trim(),
      descricao: firstText_(evento.descricao, evento.status).trim(),
      data: firstText_(evento.dataHora, evento.data, evento.dtHrCriado).trim(),
      unidade: firstText_(unidade.nome, unidade.unidade).trim(),
      cidade: firstText_(unidade.cidade, evento.cidade).trim(),
      uf: firstText_(unidade.uf, evento.uf).trim(),
    };
  });
}

function salvarEventosObjetos_(eventos, origem) {
  if (!eventos.length) return;
  var now = new Date();
  var rows = eventos.map(function(evento) {
    return [
      now,
      evento.objeto,
      evento.codigo,
      evento.descricao,
      evento.data,
      evento.unidade,
      evento.cidade,
      evento.uf,
      origem,
    ];
  });
  appendRows_(ATENDE_CONFIG.SHEETS.EVENTOS_OBJETOS, rows);
}

function isObjetoCaptadoRecord_(value) {
  if (!isObj_(value)) return false;
  if (isObj_(value.acoletar) || isObj_(value.coletado)) return true;
  if (!normalizeObjectCode_(firstText_(value.codObjeto, value.codigoObjeto))) return false;
  return !isAtendimentoItem_(value);
}

function isAtendimentoItem_(value) {
  return isObj_(value) && (
    value.idItemAtendimento != null ||
    value.tipoItemAtendimento != null ||
    value.recurso != null
  );
}

function extrairTelefone_(remetente, objeto, pai) {
  var telefoneObj = firstObject_(
    firstArray_(remetente.telefones)[0],
    remetente.telefone,
    objeto.telefoneRemetente,
    pai.telefoneRemetente
  );
  if (isObj_(telefoneObj)) {
    return firstText_(
      telefoneObj.numeroCompleto,
      String(firstText_(telefoneObj.ddd)) + String(firstText_(telefoneObj.numero))
    );
  }
  return firstText_(remetente.telefone, objeto.telefoneRemetente, pai.telefoneRemetente);
}
