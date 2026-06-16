/**
 * APP ETIQUETAS AGF — 06_CWS_PREPOST.gs
 * Criação e cancelamento de pré-postagens via API 36.
 *
 * ============================================================
 * FLUXO (manual Correios V2.4, capítulo 15):
 *  1. POST /prepostagem/v1/prepostagens (corpo completo)
 *     → devolve { id: "PR...", codigoObjeto: "BR123456789BR", ... }
 *  2. idPrePostagem + codigoObjeto vão para o histórico
 *  3. cwsEmitirRotulo_ pega o id e gera o PDF (ver 07_CWS_ROTULO.gs)
 *  4. DELETE /prepostagem/v1/prepostagens/{id} cancela enquanto
 *     o objeto ainda não foi postado no balcão
 * ============================================================
 *
 * Schema da pré-postagem: segue o manual exatamente. Campos
 * importantes que costumam causar erro de validação:
 *  - codigoServico: o código do serviço (03220 SEDEX, 03298 PAC, etc)
 *    tem que estar habilitado no cartão do contrato. Cada cliente
 *    pode ter códigos diferentes, por isso lemos de COD_SERVICO_PAC
 *    e COD_SERVICO_SEDEX na planilha CLIENTES_APP.
 *  - codigoFormatoObjetoInformado: 1=envelope, 2=caixa/pacote, 3=cilindro
 *  - pesoInformado: em GRAMAS, como string
 *  - dimensões: em CENTÍMETROS (altura x largura x comprimento), strings
 *  - servicoAdicional: array de objetos { codigoServicoAdicional, ... }
 *    001 = AR, 002 = Mão Própria, 019 = Valor Declarado (exige vlDeclarado)
 *
 * Helpers expostos:
 *  - resolveCodigoServico_(client, servicoUi)
 *  - resolveCodigoFormatoObjeto_(tipoObjetoUi)
 *  - buildPrepostagemPayload_(client, input)
 *  - cwsCriarPrepostagem_(client, input)
 *  - cwsCancelarPrepostagem_(client, idPrePostagem)
 */

// ============================================================
// RESOLVERS — UI → API
// ============================================================

/**
 * Converte o nome do serviço da UI ("PAC" / "SEDEX") no código
 * numérico habilitado no cartão do cliente (lido da planilha).
 */
function resolveCodigoServico_(client, servicoUi) {
  const s = upper_(servicoUi || 'PAC');
  if (s === 'PAC' || s === 'PAC_CONTRATO' || s === 'PACMINI') {
    const cod = sanitize_(client.COD_SERVICO_PAC);
    if (!cod) throw new Error('COD_SERVICO_PAC não cadastrado para este cliente. Atualize CLIENTES_APP.');
    return normalizeCodigoServico_(cod);
  }
  if (s === 'SEDEX' || s === 'SEDEX_CONTRATO' || s === 'SEDEX10' || s === 'SEDEX12') {
    const cod = sanitize_(client.COD_SERVICO_SEDEX);
    if (!cod) throw new Error('COD_SERVICO_SEDEX não cadastrado para este cliente. Atualize CLIENTES_APP.');
    return normalizeCodigoServico_(cod);
  }
  throw new Error('Serviço desconhecido: ' + servicoUi);
}

/**
 * Converte o tipo de objeto da UI no codigoFormatoObjetoInformado
 * que a API espera.
 * Manual: 1=envelope, 2=caixa/pacote, 3=cilindro/rolo.
 */

function isServicoPac_(client, servicoUiOuCodigo, codigoServicoResolvido) {
  const raw = sanitize_(servicoUiOuCodigo);
  const asUpper = upper_(raw);

  // Sinal principal: a própria UI informou PAC.
  // Deve ser avaliado antes de qualquer normalização numérica, pois a UI
  // envia labels como "PAC" e "SEDEX", e não apenas códigos de produto.
  if (asUpper === 'PAC' || asUpper === 'PAC_CONTRATO' || asUpper === 'PACMINI') return true;

  // Só normaliza como código quando há algum dígito. Isso evita tentar
  // interpretar labels textuais (ex.: "SEDEX") como coProduto numérico.
  const cod = /\d/.test(raw) ? normalizeCodigoServico_(raw) : '';
  const codResolvido = codigoServicoResolvido ? normalizeCodigoServico_(codigoServicoResolvido) : '';
  const codPacClienteRaw = sanitize_(client.COD_SERVICO_PAC || '');
  const codPacCliente = codPacClienteRaw ? normalizeCodigoServico_(codPacClienteRaw) : '';

  // Sinal operacional: o código cotado é exatamente o PAC cadastrado no cartão do cliente.
  if (codPacCliente && (cod === codPacCliente || codResolvido === codPacCliente)) return true;

  // Fallback defensivo para códigos PAC comuns já encontrados no projeto/contratos.
  // Não inclui SEDEX 03050.
  const pacCodesConhecidos = {
    '03085': true,
    '03298': true,
    '04510': true
  };
  return !!(pacCodesConhecidos[cod] || pacCodesConhecidos[codResolvido]);
}

function resolveCodigoValorDeclaradoAdicional_(client, servicoUiOuCodigo, codigoServicoResolvido) {
  if (isServicoPac_(client, servicoUiOuCodigo, codigoServicoResolvido)) {
    return CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO_PAC;
  }
  return CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO;
}

function buildDimensoesByTipoObjeto_(tipoObjetoUi, dims) {
  const tipo = upper_(tipoObjetoUi || 'CAIXA');
  const comprimento = String(Math.max(0, Math.round(toNumber_(dims.comprimentoCm))));
  const largura = String(Math.max(0, Math.round(toNumber_(dims.larguraCm))));
  const altura = String(Math.max(0, Math.round(toNumber_(dims.alturaCm))));
  const diametro = String(Math.max(0, Math.round(toNumber_(dims.diametroCm))));

  if (tipo === 'ROLO' || tipo === 'CILINDRO') {
    return {
      comprimentoInformado: comprimento,
      diametroInformado: diametro
    };
  }

  if (tipo === 'ENVELOPE') {
    return {
      comprimentoInformado: comprimento,
      larguraInformada: largura
    };
  }

  return {
    alturaInformada: altura,
    larguraInformada: largura,
    comprimentoInformado: comprimento
  };
}

function resolveCodigoFormatoObjeto_(tipoObjetoUi) {
  const t = upper_(tipoObjetoUi || 'CAIXA');
  const cod = CFG.TIPO_OBJETO_MAP[t];
  if (!cod) throw new Error('Tipo de objeto inválido: ' + tipoObjetoUi);
  return cod;
}

// ============================================================
// VALIDAÇÃO LOCAL — ANTES DE GASTAR CHAMADA NA CORREIOS
// ============================================================

/**
 * Valida o cadastro do remetente (cliente) contra os campos mínimos
 * obrigatórios. Fail-fast com mensagem clara para o balcão.
 */
function validarCadastroRemetente_(client) {
  const obrig = [
    { k: 'NOME_REMETENTE', l: 'Nome do remetente' },
    { k: 'CNPJ_CPF', l: 'CNPJ/CPF do remetente' },
    { k: 'ENDERECO', l: 'Endereço' },
    { k: 'NUMERO', l: 'Número' },
    { k: 'BAIRRO', l: 'Bairro' },
    { k: 'CEP', l: 'CEP' },
    { k: 'CIDADE_REMETENTE', l: 'Cidade' },
    { k: 'UF_REMETENTE', l: 'UF' },
    { k: 'NUM_CONTRATO', l: 'Número do contrato' },
    { k: 'CARTAO_POSTAGEM', l: 'Cartão de postagem' }
  ];
  const faltando = obrig.filter(o => !nonEmpty_(client[o.k])).map(o => o.l);
  if (faltando.length) {
    throw new Error(
      'Cadastro do remetente incompleto. Faltam: ' + faltando.join(', ') +
      '. Procure a AGF José Bonifácio para atualizar.'
    );
  }
  if (!isValidCep_(client.CEP)) {
    throw new Error('CEP do remetente inválido: ' + client.CEP);
  }
  if (!isValidCpfCnpj_(client.CNPJ_CPF)) {
    throw new Error('CNPJ/CPF do remetente inválido: ' + client.CNPJ_CPF);
  }
}

/**
 * Valida o input do destinatário e do objeto. Mensagens amigáveis
 * para o frontend exibir ao usuário.
 */
function validarInputPrepostagem_(input) {
  const err = [];

  // Destinatário
  if (!nonEmpty_(input.destinatarioNome)) err.push('Nome do destinatário');
  if (!isValidCep_(input.destinatarioCep)) err.push('CEP do destinatário inválido');
  if (!nonEmpty_(input.destinatarioEndereco)) err.push('Logradouro do destinatário');
  if (!nonEmpty_(input.destinatarioNumero)) err.push('Número do destinatário');
  if (!nonEmpty_(input.destinatarioBairro)) err.push('Bairro do destinatário');
  if (!nonEmpty_(input.destinatarioCidade)) err.push('Cidade do destinatário');
  if (!isValidUF_(input.destinatarioUf)) err.push('UF do destinatário inválida');
  if (nonEmpty_(input.destinatarioEmail) && !isValidEmail_(input.destinatarioEmail)) {
    err.push('E-mail do destinatário inválido');
  }
  if (nonEmpty_(input.destinatarioCpfCnpj) && !isValidCpfCnpj_(input.destinatarioCpfCnpj)) {
    err.push('CPF/CNPJ do destinatário inválido');
  }

  // Objeto
  const peso = toNumber_(input.pesoG);
  if (peso < CFG.VALIDACAO.PESO_MIN_G || peso > CFG.VALIDACAO.PESO_MAX_G) {
    err.push('Peso fora do permitido (' + CFG.VALIDACAO.PESO_MIN_G + '–' + CFG.VALIDACAO.PESO_MAX_G + ' g)');
  }

  // Dimensões obrigatórias para caixa/pacote
  const tipo = upper_(input.tipoObjeto);
  if (tipo === 'CAIXA' || tipo === 'PACOTE') {
    const c = toNumber_(input.comprimentoCm);
    const l = toNumber_(input.larguraCm);
    const a = toNumber_(input.alturaCm);
    if (c <= 0 || l <= 0 || a <= 0) {
      err.push('Informe comprimento, largura e altura para caixa/pacote');
    }
    if (c > CFG.VALIDACAO.DIM_MAX_CM || l > CFG.VALIDACAO.DIM_MAX_CM || a > CFG.VALIDACAO.DIM_MAX_CM) {
      err.push('Dimensão excede o máximo permitido (' + CFG.VALIDACAO.DIM_MAX_CM + ' cm)');
    }
  }
  if (tipo === 'ROLO' || tipo === 'CILINDRO') {
    const d = toNumber_(input.diametroCm);
    const c = toNumber_(input.comprimentoCm);
    if (d <= 0 || c <= 0) {
      err.push('Informe diâmetro e comprimento para rolo/cilindro');
    }
  }

  if (err.length) {
    const e = new Error('Dados inválidos: ' + err.join('; '));
    e.validationErrors = err;
    throw e;
  }
}

// ============================================================
// MONTAGEM DO PAYLOAD
// ============================================================

/**
 * Monta o objeto JSON exatamente como a API espera.
 * Baseado no manual V2.4, capítulo 15 (Pré-Postagem).
 */
function buildPrepostagemPayload_(client, input) {
  const codigoServico = resolveCodigoServico_(client, input.servico);
  const codFormato = resolveCodigoFormatoObjeto_(input.tipoObjeto);

  const pesoStr = String(Math.max(1, Math.round(toNumber_(input.pesoG))));
  const dimensoes = buildDimensoesByTipoObjeto_(input.tipoObjeto, input);

  // Telefones do remetente e destinatário em formato DDD + número
  const telRem = splitPhoneBr_(client.WHATSAPP || client.CONTATO || '');
  const telDest = splitPhoneBr_(input.destinatarioCelular || '');

  // Serviços adicionais
  const servicosAdicionais = [];
  const vlDeclarado = toNumber_(input.valorDeclarado);
  if (vlDeclarado > 0) {
    servicosAdicionais.push({
      codigoServicoAdicional: resolveCodigoValorDeclaradoAdicional_(client, input.servico || codigoServico, codigoServico),
      valorDeclarado: vlDeclarado.toFixed(2)
    });
  }
  if (upper_(input.ar) === 'SIM') {
    servicosAdicionais.push({
      codigoServicoAdicional: CFG.CWS.SERVICOS_ADICIONAIS.AVISO_RECEBIMENTO
    });
  }
  if (upper_(input.maoPropria) === 'SIM') {
    servicosAdicionais.push({
      codigoServicoAdicional: CFG.CWS.SERVICOS_ADICIONAIS.MAO_PROPRIA
    });
  }

  const payload = {
    idCorreios: sanitize_(client.LOGIN_IDCORREIOS),
    numeroCartaoPostagem: normalizeCartaoPostagem_(client.CARTAO_POSTAGEM),
    codigoServico: codigoServico,

    remetente: {
      nome: sanitize_(client.NOME_REMETENTE),
      dddCelular: telRem.ddd,
      celular: telRem.numero,
      email: sanitize_(client.EMAIL),
      cpfCnpj: digitsOnly_(client.CNPJ_CPF),
      endereco: {
        cep: digitsOnly_(client.CEP),
        logradouro: sanitize_(client.ENDERECO),
        numero: sanitize_(client.NUMERO),
        complemento: sanitize_(client.COMPLEMENTO),
        bairro: sanitize_(client.BAIRRO),
        cidade: sanitize_(client.CIDADE_REMETENTE || 'FORTALEZA'),
        uf: upper_(client.UF_REMETENTE || 'CE')
      }
    },

    destinatario: {
      nome: sanitize_(input.destinatarioNome),
      dddCelular: telDest.ddd,
      celular: telDest.numero,
      email: sanitize_(input.destinatarioEmail),
      cpfCnpj: digitsOnly_(input.destinatarioCpfCnpj),
      endereco: {
        cep: digitsOnly_(input.destinatarioCep),
        logradouro: sanitize_(input.destinatarioEndereco),
        numero: sanitize_(input.destinatarioNumero),
        complemento: sanitize_(input.destinatarioComplemento),
        bairro: sanitize_(input.destinatarioBairro),
        cidade: sanitize_(input.destinatarioCidade),
        uf: upper_(input.destinatarioUf)
      }
    },

    codigoFormatoObjetoInformado: codFormato,
    pesoInformado: pesoStr,
    ...dimensoes,

    observacao: sanitize_(input.observacao),

    listaServicoAdicional: servicosAdicionais
  };

  // ============================================================
  // DOCUMENTO FISCAL / DECLARAÇÃO DE CONTEÚDO
  // ============================================================
  // Resolve o tipo por prioridade: input explícito > padrão do cliente > default CFG
  // O default CFG agora é 'DC' (mais seguro pra AGF atendendo público).
  const tipoDoc = upper_(
    input.tipoDocumento ||
    client.TIPO_DOCUMENTO_PADRAO ||
    CFG.CWS.DEFAULT_TIPO_DOCUMENTO
  );

  // Regra atualizada:
  // - continuamos aceitando NF ou DC como tipo principal da remessa
  // - porém os itens da declaração seguem sendo enviados sempre,
  //   porque a integração atual dos Correios passou a validar
  //   itensDeclaracaoConteudo mesmo quando há NF-e.
  payload.itensDeclaracaoConteudo = buildItensDeclaracao_(input.itensDeclaracao || []);

  payload.cienteObjetoNaoProibido = resolveCienteObjetoNaoProibido_(input);
  payload.emiteDCe = (tipoDoc === 'NF') ? 'N' : 'S';

  if (tipoDoc === 'NF') {
    payload.numeroNotaFiscal = sanitize_(input.numeroNotaFiscal);
    payload.chaveNFe = sanitize_(input.chaveNFe || input.chaveNotaFiscal || '');
  }

  return removeEmptyValuesDeep_(payload);
}

/**
 * Normaliza a lista de itens da DC pro formato que a Correios espera.
 * Cada item: { conteudo, quantidade, valor }.
 * A API calcula o total sozinha.
 */
function buildItensDeclaracao_(itens) {
  if (!Array.isArray(itens)) return [];
  return itens
    .map(it => ({
      conteudo: sanitize_(it.descricao || it.conteudo || ''),
      quantidade: String(Math.max(1, Math.round(toNumber_(it.quantidade, 1)))),
      valor: toNumber_(it.valor, 0).toFixed(2)
    }))
    .filter(it => nonEmpty_(it.conteudo) && toNumber_(it.valor) > 0);
}

/**
 * Valida a confirmação de que o envio não contém objeto proibido.
 * A UI trabalha com a pergunta "Objetos proibidos?" e espera a
 * resposta "NÃO" para prosseguir.
 *
 * IMPORTANTE:
 * - Na API REST atual da pré-postagem, o campo correto é
 *   `cienteObjetoNaoProibido` na raiz do payload.
 * - O schema aceita "0" ou "1"; usamos "1" quando o usuário confirma
 *   que o envio NÃO contém item proibido.
 */
function validarObjetosProibidos_(input) {
  const confirmado = upper_(sanitize_(
    input.objetoNaoProibidoConfirmado ||
    input.confirmacaoObjetoNaoProibido ||
    ''
  ));

  if (confirmado === 'S' || confirmado === 'SIM' || confirmado === '1' || confirmado === 'TRUE') {
    return;
  }

  const v = upper_(sanitize_(
    input.objetosProibidos ||
    input.declaracaoObjetoProibido ||
    input.objetoProibido ||
    ''
  ));
  if (v !== 'NAO' && v !== 'NÃO') {
    throw new Error('Confirme em "Objetos proibidos" que o envio não contém item proibido.');
  }
}

function resolveCienteObjetoNaoProibido_(input) {
  validarObjetosProibidos_(input);
  return '1';
}

function removeEmptyValuesDeep_(value) {
  if (Array.isArray(value)) {
    return value
      .map(removeEmptyValuesDeep_)
      .filter(function (item) {
        return !(item === '' || item === null || typeof item === 'undefined');
      });
  }

  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(function (k) {
      const v = removeEmptyValuesDeep_(value[k]);
      const isEmptyObject = v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
      const isEmptyArray = Array.isArray(v) && v.length === 0;
      if (!(v === '' || v === null || typeof v === 'undefined' || isEmptyObject || isEmptyArray)) {
        out[k] = v;
      }
    });
    return out;
  }

  return value;
}

/**
 * Valida a lista de itens da DC. Lança erro com mensagem por item
 * pra o frontend poder apontar direto qual item está errado.
 */
function validarItensDeclaracao_(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error('Declaração de Conteúdo: informe ao menos 1 item.');
  }
  const erros = [];
  itens.forEach((it, idx) => {
    const n = idx + 1;
    const desc = sanitize_(it.descricao || it.conteudo || '');
    const qtd = toNumber_(it.quantidade, 0);
    const val = toNumber_(it.valor, 0);
    if (!nonEmpty_(desc)) erros.push('Item ' + n + ': descrição obrigatória');
    if (desc && desc.length < 5) erros.push('Item ' + n + ': descrição deve ter ao menos 5 caracteres');
    if (qtd < 1) erros.push('Item ' + n + ': quantidade deve ser ≥ 1');
    if (val <= 0) erros.push('Item ' + n + ': valor deve ser > 0');
  });
  if (erros.length) {
    const e = new Error('Declaração de Conteúdo: ' + erros.join('; '));
    e.validationErrors = erros;
    throw e;
  }
}

/**
 * Valida os campos de Nota Fiscal.
 */
function validarNotaFiscal_(input) {
  const erros = [];
  if (!nonEmpty_(input.numeroNotaFiscal)) erros.push('Número da NF obrigatório');
  if (!nonEmpty_(input.serieNotaFiscal)) erros.push('Série da NF obrigatória');
  if (toNumber_(input.valorNotaFiscal) <= 0) erros.push('Valor da NF deve ser > 0');
  const chave = digitsOnly_(input.chaveNFe || input.chaveNotaFiscal || '');
  if (chave && chave.length !== 44) erros.push('Chave NF-e deve ter 44 dígitos');
  if (erros.length) {
    const e = new Error('Nota Fiscal: ' + erros.join('; '));
    e.validationErrors = erros;
    throw e;
  }
}

// ============================================================
// CRIAR PRÉ-POSTAGEM
// ============================================================

/**
 * Cria a pré-postagem na Correios. Retorna:
 *   { idPrePostagem, codigoObjeto, valorPostagem, raw }
 */
function cwsCriarPrepostagem_(client, input) {
  validarCadastroRemetente_(client);
  validarInputPrepostagem_(input);

  validarObjetosProibidos_(input);

  // Regra atual:
  // - sempre validamos os itens da declaração
  // - se a remessa estiver com NF, validamos NF também
  const tipoDoc = upper_(
    input.tipoDocumento ||
    client.TIPO_DOCUMENTO_PADRAO ||
    CFG.CWS.DEFAULT_TIPO_DOCUMENTO
  );
  validarItensDeclaracao_(input.itensDeclaracao || []);
  if (tipoDoc === 'NF') {
    validarNotaFiscal_(input);
  }

  const body = buildPrepostagemPayload_(client, input);

  const resp = cwsRequest_(client, {
    service: 'PREPOSTAGEM',
    path: '/v1/prepostagens',
    method: 'post',
    body: body
  });

  const json = resp.json || {};

  // A API pode devolver o id com nomes diferentes em versões diferentes.
  // Tentamos todas as variantes conhecidas.
  const idPrePostagem = sanitize_(pickFirst_(json, [
    'id', 'idPrePostagem', 'idPrepostagem', 'numeroPrepostagem'
  ]));
  const codigoObjeto = sanitize_(pickFirst_(json, [
    'codigoObjeto', 'codObjeto', 'numeroEtiqueta', 'codigoRastreio'
  ]));
  const valorPostagem = sanitize_(pickFirst_(json, [
    'valorPostagem', 'precoPostagem', 'valor', 'vlPostagem'
  ]));

  if (!idPrePostagem) {
    throw new Error('Pré-postagem criada mas sem id reconhecível. Body: ' + truncate_(resp.text, 500));
  }

  return {
    idPrePostagem: idPrePostagem,
    codigoObjeto: codigoObjeto,
    valorPostagem: valorPostagem,
    raw: json
  };
}

// ============================================================
// CANCELAR PRÉ-POSTAGEM
// ============================================================

/**
 * DELETE /v1/prepostagens/{id}. Só funciona enquanto a pré-postagem
 * ainda não foi postada no balcão.
 */
function cwsCancelarPrepostagem_(client, idPrePostagem) {
  const id = sanitize_(idPrePostagem);
  if (!id) throw new Error('idPrePostagem obrigatório para cancelar.');

  const resp = cwsRequest_(client, {
    service: 'PREPOSTAGEM',
    path: '/v1/prepostagens/' + encodeURIComponent(id),
    method: 'delete'
  });

  return {
    ok: true,
    idPrePostagem: id,
    raw: resp.json || {}
  };
}
