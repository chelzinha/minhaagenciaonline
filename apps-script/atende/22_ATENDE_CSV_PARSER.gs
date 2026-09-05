// ============================================================
// ATENDE - PARSER E MAPEAMENTO DO CSV DIARIO
// ============================================================

function ATENDE_lerCsv_(file) {
  let text = file.getBlob().getDataAsString('UTF-8');
  text = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('O arquivo CSV esta vazio: ' + file.getName());

  const matrix = Utilities.parseCsv(text, ';');
  if (!matrix || matrix.length < 2) throw new Error('O CSV nao possui linhas de dados: ' + file.getName());

  const headers = matrix[0].map(function(value) {
    return ATENDE_cleanCsvValue_(value).trim().toUpperCase();
  });
  const missing = ATENDE_CSV_DIARIO_CFG.REQUIRED_HEADERS.filter(function(header) {
    return headers.indexOf(header) < 0;
  });
  if (missing.length) throw new Error('CSV com estrutura inesperada. Cabecalhos ausentes: ' + missing.join(', '));

  const rows = matrix.slice(1).filter(function(row) {
    return row.some(function(value) { return ATENDE_cleanCsvValue_(value) !== ''; });
  }).map(function(row) {
    const obj = {};
    headers.forEach(function(header, index) { obj[header] = ATENDE_cleanCsvValue_(row[index]); });
    return obj;
  });

  return { text: text, headers: headers, rows: rows };
}

function ATENDE_mapearLinhaCsv_(raw) {
  const serviceName = ATENDE_cleanCsvValue_(raw.NOME_SERVICO);
  const paymentForm = ATENDE_cleanCsvValue_(raw.FORMA_PAGAMENTO);
  const paymentMode = ATENDE_cleanCsvValue_(raw.MODALIDADE_PAGAMENTO);
  const estorno = ATENDE_cleanCsvValue_(raw.ESTORNO).toUpperCase();
  const objectCode = normalizeObjectCode_(ATENDE_cleanCsvValue_(raw.CODIGO_OBJETO));

  return {
    // Metadados tecnicos exclusivos da importacao CSV. Eles nao entram nas
    // 41 colunas canonicas do painel e ficam disponiveis para idempotencia,
    // diagnostico e futura evolucao do schema sem distorcer campos legados.
    csvAtendimentoId: ATENDE_cleanCsvValue_(raw.ATENDIMENTO),
    csvModalidadePagamento: paymentMode,
    csvMcu: ATENDE_cleanCsvValue_(raw.MCU),
    csvNumeroPlp: ATENDE_cleanCsvValue_(raw.NUMERO_PLP),
    csvPesoTarifadoGramas: ATENDE_toNumber_(raw.PESO_TARIFADO),

    dtAtendimento: ATENDE_parseCsvDate_(raw.DATA_POSTAGEM),
    idAtendente: ATENDE_cleanCsvValue_(raw.CPF_MATRICULA_ATENDENTE),
    codObjeto: objectCode,
    codigoAtendimento: ATENDE_cleanCsvValue_(raw.CODIGO_SERVICO),
    descricaoAtendimento: serviceName,
    categoria: ATENDE_categoriaServico_(serviceName),
    contrato: ATENDE_cleanCsvValue_(raw.NUMERO_CONTRATO),
    cartaoPostagem: ATENDE_cleanCsvValue_(raw.CARTAO_POSTAGEM),
    rem_nome: ATENDE_cleanCsvValue_(raw.NOME_REMETENTE),
    rem_documento: '',
    valorPostagem: ATENDE_toNumber_(raw.VALOR_ATENDIMENTO),
    formaPagamento: paymentForm,
    peso: ATENDE_gramasParaKg_(raw.PESO),
    largura: ATENDE_toNumber_(raw.LARGURA),
    comprimento: ATENDE_toNumber_(raw.COMPRIMENTO),
    altura: ATENDE_toNumber_(raw.ALTURA),
    diametro: ATENDE_toNumber_(raw.DIAMETRO),
    valorDeclarado: ATENDE_toNumber_(raw.VALOR_DECLARADO),
    formato: '',
    rem_cep: ATENDE_digits_(raw.CEP_REMETENTE),
    rem_logradouro: '', rem_numero: '', rem_complemento: '', rem_bairro: '', rem_cidade: '', rem_uf: '', rem_telefone: '',
    dest_nome: ATENDE_cleanCsvValue_(raw.NOME_DESTINATARIO),
    dest_documento: '',
    dest_cep: ATENDE_digits_(raw.CEP_DESTINATARIO),
    dest_logradouro: '', dest_numero: '', dest_complemento: '', dest_bairro: '', dest_cidade: '', dest_uf: '',
    origem: ATENDE_cleanCsvValue_(raw.SISTEMA_POSTAGEM) || 'CSV ATENDE',
    statusDesc: estorno === 'S' ? 'Estornado' : (objectCode ? 'Postado' : 'Atendimento'),
    dtPrevista: '',

    // Nao mapear MODALIDADE_PAGAMENTO para "tipo". O campo legado "tipo"
    // vem do JSON de atendimento (ex.: AFATURAR_AUTOMATIZADO) e possui
    // semantica/granularidade diferente de "A FATURAR" / "A VISTA" do CSV.
    tipoAtendimento: '',
    formaPagamentoAtendimento: paymentForm
  };
}
