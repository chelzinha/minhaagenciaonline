// ============================================================
// ATENDE - PARSER E MAPEAMENTO DOS CSVs ATENDE + CONSOLIDADOR
// ============================================================

function ATENDE_lerTextoCsv_(file) {
  const blob = file.getBlob();
  let text = String(blob.getDataAsString('UTF-8') || '').replace(/^\uFEFF/, '');
  let encoding = 'UTF-8';

  // O Consolidador do Portal Postal pode ser exportado em ANSI/Latin-1.
  // Quando um arquivo desses e lido como UTF-8, caracteres como Ã, Ô etc.
  // aparecem como U+FFFD (�). Nesse caso relê o mesmo blob em ISO-8859-1.
  if (text.indexOf('\uFFFD') >= 0) {
    const latin1 = String(blob.getDataAsString('ISO-8859-1') || '').replace(/^\uFEFF/, '');
    const utf8Broken = (text.match(/\uFFFD/g) || []).length;
    const latin1Broken = (latin1.match(/\uFFFD/g) || []).length;
    if (latin1Broken < utf8Broken) {
      text = latin1;
      encoding = 'ISO-8859-1';
    }
  }

  return { text: text, encoding: encoding };
}

function ATENDE_lerCsv_(file) {
  const decoded = ATENDE_lerTextoCsv_(file);
  const text = decoded.text;
  const encoding = decoded.encoding;
  if (!text.trim()) throw new Error('O arquivo CSV esta vazio: ' + file.getName());

  const matrixOriginal = Utilities.parseCsv(text, ';');
  if (!matrixOriginal || matrixOriginal.length < 2) throw new Error('O CSV nao possui linhas de dados: ' + file.getName());

  const headers = matrixOriginal[0].map(function(value) {
    return ATENDE_cleanCsvValue_(value).trim().toUpperCase();
  });

  const sourceType = ATENDE_detectarFonteCsv_(headers);
  if (!sourceType) {
    throw new Error('CSV com estrutura inesperada. Nao foi possivel identificar ATENDE ou CONSOLIDADOR pelos cabecalhos.');
  }

  if (sourceType === 'ATENDE') {
    const missing = ATENDE_CSV_DIARIO_CFG.REQUIRED_HEADERS.filter(function(header) {
      return headers.indexOf(header) < 0;
    });
    if (missing.length) throw new Error('CSV ATENDE com estrutura inesperada. Cabecalhos ausentes: ' + missing.join(', '));
  } else {
    const missingCons = ATENDE_validarHeadersConsolidador_(headers);
    if (missingCons.length) throw new Error('CSV CONSOLIDADOR com estrutura inesperada. Cabecalhos ausentes: ' + missingCons.join(', '));
  }

  const matrix = matrixOriginal.slice(1).map(function(row) {
    return sourceType === 'CONSOLIDADOR' ? ATENDE_repararLinhaConsolidador_(row, headers) : row;
  });

  const rawRows = matrix.filter(function(row) {
    if (!row.some(function(value) { return String(value == null ? '' : value) !== ''; })) return false;
    if (sourceType === 'CONSOLIDADOR' && ATENDE_linhaTotalConsolidador_(row, headers)) return false;
    return true;
  }).map(function(row) {
    const obj = {};
    headers.forEach(function(header, index) {
      obj[header] = row[index] === null || row[index] === undefined ? '' : String(row[index]);
    });
    return obj;
  });

  const rows = rawRows.map(function(raw) {
    const obj = {};
    headers.forEach(function(header) { obj[header] = ATENDE_cleanCsvValue_(raw[header]); });
    return obj;
  });

  return { text: text, encoding: encoding, headers: headers, rows: rows, rawRows: rawRows, sourceType: sourceType };
}

function ATENDE_detectarFonteCsv_(headers) {
  const has = function(name) { return headers.indexOf(name) >= 0; };
  if (has('ATENDIMENTO') && has('CODIGO_OBJETO') && has('DATA_POSTAGEM')) return 'ATENDE';

  const venda = ATENDE_headerExiste_(headers, ['VENDA/PP.', 'VENDA/PP', 'VENDA_PP', 'VENDA PP']);
  const cxat = ATENDE_headerExiste_(headers, ['CX./AT.', 'CX./AT', 'CX/AT', 'CX_AT']);
  if (has('OBJETO') && venda && cxat) return 'CONSOLIDADOR';
  return '';
}

function ATENDE_validarHeadersConsolidador_(headers) {
  const specs = [
    { label: 'OBJETO', aliases: ['OBJETO'] },
    { label: 'VENDA/PP.', aliases: ['VENDA/PP.', 'VENDA/PP', 'VENDA_PP', 'VENDA PP'] },
    { label: 'CX./AT.', aliases: ['CX./AT.', 'CX./AT', 'CX/AT', 'CX_AT'] },
    { label: 'CLIENTE', aliases: ['CLIENTE', 'RAZAO_SOCIAL', 'RAZÃO_SOCIAL'] },
    { label: 'ECT', aliases: ['ECT'] },
    { label: 'DATA', aliases: ['DATA'] },
    { label: 'VALOR', aliases: ['VALOR'] }
  ];
  return specs.filter(function(spec) {
    return !ATENDE_headerExiste_(headers, spec.aliases);
  }).map(function(spec) { return spec.label; });
}

function ATENDE_headerExiste_(headers, aliases) {
  return aliases.some(function(alias) { return headers.indexOf(alias) >= 0; });
}

function ATENDE_indiceHeader_(headers, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const idx = headers.indexOf(aliases[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

// Alguns CSVs do Consolidador trazem ponto e virgula solto dentro de DESTINATARIO.
// Nesses casos Utilities.parseCsv cria colunas extras. Reunimos somente o miolo
// de DESTINATARIO e preservamos todas as demais colunas nas posicoes originais.
function ATENDE_repararLinhaConsolidador_(row, headers) {
  const source = Array.isArray(row) ? row.slice() : [];
  if (source.length <= headers.length) {
    while (source.length < headers.length) source.push('');
    return source;
  }

  const destIdx = ATENDE_indiceHeader_(headers, ['DESTINATARIO', 'DESTINATÁRIO']);
  if (destIdx < 0) return source.slice(0, headers.length);

  const extra = source.length - headers.length;
  const merged = source.slice(destIdx, destIdx + extra + 1).join(';');
  const fixed = source.slice(0, destIdx).concat([merged], source.slice(destIdx + extra + 1));
  while (fixed.length < headers.length) fixed.push('');
  return fixed.slice(0, headers.length);
}

function ATENDE_linhaTotalConsolidador_(row, headers) {
  const objetoIdx = ATENDE_indiceHeader_(headers, ['OBJETO']);
  const objeto = objetoIdx >= 0 ? String(row[objetoIdx] == null ? '' : row[objetoIdx]).trim() : '';
  if (objeto) return false;
  return row.some(function(value) {
    return String(value == null ? '' : value).trim().toUpperCase() === 'TOTAL';
  });
}

function ATENDE_mapearLinhaCsv_(raw) {
  const serviceName = ATENDE_cleanCsvValue_(raw.NOME_SERVICO);
  const paymentForm = ATENDE_cleanCsvValue_(raw.FORMA_PAGAMENTO);
  const paymentMode = ATENDE_cleanCsvValue_(raw.MODALIDADE_PAGAMENTO);
  const estorno = ATENDE_cleanCsvValue_(raw.ESTORNO).toUpperCase();
  const objectCode = normalizeObjectCode_(ATENDE_cleanCsvValue_(raw.CODIGO_OBJETO));

  return {
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
    tipoAtendimento: '',
    formaPagamentoAtendimento: paymentForm
  };
}
