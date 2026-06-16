/** AGF NFE PDF EXTRACTOR — 04_NFE_DANFE_PARSER.gs */

function nfeParseDanfeText_(rawText) {
  var text = nfeNormalizeText_(rawText);
  var lines = nfeLines_(text);
  var warnings = [];

  var nota = nfeParseNota_(text, lines, warnings);
  var emitente = nfeParseEmitente_(text, lines, warnings);
  var destinatario = nfeParseDestinatario_(text, lines, warnings);

  // Última camada anti-regressão dos campos fiscais obrigatórios da
  // DANFE Simplificado - Etiqueta. O Google Drive pode linearizar as
  // colunas do PDF de formas diferentes conforme o documento.
  nfeRepairRequiredDanfeFields_(text, lines, nota, emitente, destinatario, warnings);

  var produtos = nfeParseProdutos_(text, lines, warnings);
  var totais = nfeBuildTotais_(produtos, nota, warnings);
  var danfeSimplificado = nfeBuildDanfeSimplificado_(nota, emitente, destinatario, totais, warnings);

  var confidence = nfeScoreExtraction_(nota, destinatario, produtos, warnings, emitente, danfeSimplificado);

  return nfeRemoveEmptyDeep_({
    schemaVersion: '1.2',
    extractedAt: nfeNowIso_(),
    confidence: confidence,
    warnings: warnings,
    nota: nota,
    emitente: emitente,
    destinatario: destinatario,
    declaracao: {
      itens: produtos,
      quantidadeLinhas: produtos.length,
      quantidadeTotalUnidades: totais.quantidadeTotalUnidades,
      valorTotalItens: totais.valorTotalItens
    },
    totais: totais,
    sugestoes: {
      valorDeclarado: totais.valorTotalNota || totais.valorTotalItens || 0,
      usarValorDeclarado: false,
      observacao: 'Valor declarado sugerido com base no total da NF. O cliente deve optar antes de aplicar.'
    },
    danfeSimplificado: danfeSimplificado,
    appPayloadPatch: nfeBuildAppPayloadPatch_(nota, destinatario, produtos, totais)
  });
}

function nfeParseNota_(text, lines, warnings) {
  var compactDigits = nfeDigitsOnly_(text);
  var chave = '';

  var mChaveLabel = /Chave\s+de\s+Acesso\s*:?\s*([\d\s]{44,70})/i.exec(text);
  if (mChaveLabel) {
    var d = nfeDigitsOnly_(mChaveLabel[1]);
    if (d.length >= 44) chave = d.slice(0, 44);
  }
  if (!chave) {
    var m44 = text.match(/(?:\d[\s.-]*){44}/);
    if (m44) chave = nfeDigitsOnly_(m44[0]).slice(0, 44);
  }
  if (!chave && compactDigits.length >= 44) {
    // Fallback fraco: só usa se houver sequência clara de 44 em algum lugar.
    var seq = compactDigits.match(/\d{44}/);
    if (seq) chave = seq[0];
  }

  var numero = '';
  var serie = '';

  var mNum = /(?:^|\n)\s*(?:N\s*[ºo°.:]*|Nº|No)\s*:?\s*(\d{1,12})/i.exec(text);
  if (mNum) numero = mNum[1];
  if (!numero) {
    var mNum2 = /NF-?e[\s\S]{0,120}?(?:N\s*[ºo°.:]*|Nº|No)\s*:?\s*(\d{1,12})/i.exec(text);
    if (mNum2) numero = mNum2[1];
  }

  var mSerie = /S[ÉE]RIE\s*:?\s*(\d{1,4})/i.exec(text);
  if (mSerie) serie = mSerie[1];

  var dataEmissao = '';
  var mData = /DATA\s+EMISS[ÃA]O[\s\S]{0,500}?(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  if (mData) dataEmissao = mData[1];
  if (!dataEmissao) {
    var idxDataHeader = nfeFindLineIndex_(lines, /DATA\s+EMISS[ÃA]O/i);
    if (idxDataHeader >= 0) {
      for (var dIdx = idxDataHeader; dIdx < Math.min(lines.length, idxDataHeader + 4); dIdx++) {
        var dm = lines[dIdx].match(/\d{2}\/\d{2}\/\d{4}/);
        if (dm) { dataEmissao = dm[0]; break; }
      }
    }
  }

  var valorTop = nfeFindFirst_(text, /Valor\s*:\s*([\d.]+,\d{2})/i, 1);
  var valorTotalNota = nfeToNumber_(valorTop, 0);

  if (!valorTotalNota) {
    var mV = /VALOR\s+TOTAL\s+DA\s+NOTA[\s\S]{0,280}?([\d.]+,\d{2})(?![\s\S]*VALOR\s+TOTAL\s+DA\s+NOTA)/i.exec(text);
    if (mV) valorTotalNota = nfeToNumber_(mV[1], 0);
  }

  var protocoloInfo = nfeExtractProtocolInfo_(text, lines);
  var protocoloAutorizacao = protocoloInfo.numero;
  var protocoloCodigoBarras = protocoloInfo.codigoBarras;
  var protocoloEpec = nfeExtractEpecProtocol_(text);

  var tipoOperacao = '';
  var allTipos = [];
  var tipoRegex = /\b([01])\s*[-–:]?\s*(ENTRADA|SA[IÍ]DA)\b/gi;
  var tipoMatch;
  while ((tipoMatch = tipoRegex.exec(text))) {
    var parsedTipo = tipoMatch[1] === '0' ? 'ENTRADA' : 'SAÍDA';
    if (allTipos.indexOf(parsedTipo) < 0) allTipos.push(parsedTipo);
  }
  if (allTipos.length === 1) tipoOperacao = allTipos[0];
  // DANFEs comuns exibem as duas opções (0 - ENTRADA / 1 - SAÍDA)
  // e imprimem o indicador efetivamente selecionado em uma linha próxima.
  // Quando as duas opções aparecem, prioriza esse indicador visual.
  if (!tipoOperacao && allTipos.length > 1) tipoOperacao = nfeInferTipoOperacaoFromDanfe_(lines);
  if (!tipoOperacao) {
    var directTipo = /TIPO\s+DE\s+OPERA[CÇ][AÃ]O[\s\S]{0,120}?\b(ENTRADA|SA[IÍ]DA)\b/i.exec(text);
    if (directTipo) tipoOperacao = nfeUpper_(directTipo[1]).replace('SAIDA', 'SAÍDA');
  }
  // Regra operacional deste projeto: todas as DANFEs importadas são de saída.
  // Alguns PDFs exibem as duas opções sem preservar o marcador visual na conversão.
  if (!tipoOperacao) tipoOperacao = 'SAÍDA';

  var naturezaOperacao = '';
  var idxNat = nfeFindLineIndex_(lines, /NATUREZA\s+DA\s+OPERA[CÇ][AÃ]O/i);
  if (idxNat >= 0) naturezaOperacao = nfePickSimpleValueCandidate_(lines, idxNat + 1, 8, { rejectNumeric: true });

  if (!chave) nfePushWarning_(warnings, 'Chave de acesso não encontrada.');
  if (!numero) nfePushWarning_(warnings, 'Número da NF não encontrado.');
  if (!serie) nfePushWarning_(warnings, 'Série da NF não encontrada.');
  if (!dataEmissao) nfePushWarning_(warnings, 'Data de emissão da NF não encontrada.');
  if (!protocoloAutorizacao) nfePushWarning_(warnings, 'Protocolo de autorização de uso não encontrado.');
  if (!tipoOperacao) nfePushWarning_(warnings, 'Tipo de operação (entrada/saída) não identificado.');

  return {
    numero: numero,
    serie: serie,
    dataEmissao: dataEmissao,
    chaveAcesso: chave,
    valorTotal: nfeRound2_(valorTotalNota),
    protocoloAutorizacao: protocoloAutorizacao,
    protocoloCodigoBarras: protocoloCodigoBarras,
    protocoloEpec: protocoloEpec,
    tipoOperacao: tipoOperacao,
    naturezaOperacao: naturezaOperacao
  };
}


function nfeParseEmitente_(text, lines, warnings) {
  var out = {
    nomeRazaoSocial: '',
    cnpj: '',
    inscricaoEstadual: '',
    uf: ''
  };

  var destStart = nfeFindLineIndex_(lines, /DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE|DESTINAT[ÁA]RIO/i);
  var scopeLines = lines.slice(0, destStart > 0 ? destStart : Math.min(lines.length, 90));
  var scopeText = scopeLines.join('\n');

  // O CNPJ do emitente está codificado na chave de acesso (posições 7 a 20).
  // Esta é a fonte prioritária para evitar confundir protocolo/barcode com CNPJ.
  var accessKeyEmit = nfeExtractAccessKeyLoose_(text);
  out.cnpj = nfeCnpjFromAccessKey_(accessKeyEmit);
  if (!out.cnpj) {
    var idxCnpj = nfeFindLineIndex_(scopeLines, /\bCNPJ\b/i);
    out.cnpj = nfePickCnpjCandidate_(scopeLines, idxCnpj >= 0 ? idxCnpj : 0, idxCnpj >= 0 ? 12 : scopeLines.length);
  }

  // Prioridade alta: muitos DANFEs trazem o nome confiável no canhoto:
  // RECEBEMOS DE 'RAZÃO SOCIAL' OS PRODUTO(S)...
  out.nomeRazaoSocial = nfeExtractEmitenteNameFromReceipt_(scopeText);

  var idxName = nfeFindLineIndex_(scopeLines, /NOME\s*\/?\s*RAZ[AÃ]O\s+SOCIAL/i);
  if (!out.nomeRazaoSocial && idxName >= 0) out.nomeRazaoSocial = nfePickNameCandidate_(scopeLines, idxName + 1, 18);
  if (!out.nomeRazaoSocial) {
    for (var i = 0; i < scopeLines.length; i++) {
      var line = nfeCleanSpaces_(scopeLines[i]);
      if (!nfeLooksLikeName_(line)) continue;
      // Não aceita domínio/site como nome empresarial.
      if (/^(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(line)) continue;
      if (/^(DANFE|DOCUMENTO\s+AUXILIAR|NOTA\s+FISCAL|CHAVE\s+DE\s+ACESSO|PROTOCOLO|NATUREZA)/i.test(nfeNormKey_(line))) continue;
      if (/\b(RUA|AVENIDA|AV\.?|TRAVESSA|CEP|MUNICIPIO|BAIRRO)\b/i.test(line)) continue;
      out.nomeRazaoSocial = line;
      break;
    }
  }

  var idxIe = nfeFindLineIndex_(scopeLines, /INSCRI[CÇ][AÃ]O\s+ESTADUAL/i);
  if (idxIe >= 0) out.inscricaoEstadual = nfePickEmitenteIeCandidate_(scopeLines, idxIe);
  if (!out.inscricaoEstadual) out.inscricaoEstadual = nfeExtractEmitenteIeFromText_(scopeText, out.cnpj);

  // A UF do emitente é obtida preferencialmente da chave da NF-e (cUF),
  // que é mais confiável que tentar inferir uma UF solta no cabeçalho OCR.
  out.uf = nfeUfFromAccessKey_(nfeExtractAccessKeyLoose_(text)) || nfeFindBrazilUf_(scopeLines);

  if (!out.nomeRazaoSocial) nfePushWarning_(warnings, 'Nome/Razão Social do emitente não encontrado.');
  if (nfeDigitsOnly_(out.cnpj).length !== 14) nfePushWarning_(warnings, 'CNPJ do emitente não encontrado ou incompleto.');
  if (!out.inscricaoEstadual) nfePushWarning_(warnings, 'Inscrição estadual do emitente não encontrada.');
  if (!out.uf) nfePushWarning_(warnings, 'UF do emitente não encontrada.');
  return out;
}

function nfeParseDestinatario_(text, lines, warnings) {
  var out = {
    nomeRazaoSocial: '',
    cpfCnpj: '',
    inscricaoEstadual: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: '',
    uf: '',
    telefone: ''
  };

  // IMPORTANTE: DANFEs possuem mais de um bloco "NOME / RAZÃO SOCIAL".
  // O parser antigo pegava o primeiro cabeçalho do documento (emitente) e,
  // em alguns layouts OCR, acabava usando "DATA EMISSÃO" como nome.
  // Agora limitamos a leitura ao bloco DESTINATÁRIO / REMETENTE.
  var scope = nfeExtractDestinatarioScope_(lines);
  var scopeLines = scope.lines;
  var scopeText = scopeLines.join('\n');

  // Documento: prioriza o valor associado ao cabeçalho CNPJ/CPF do destinatário.
  // Evita herdar o CNPJ do emitente quando a conversão muda a ordem das colunas.
  out.cpfCnpj = nfeExtractDestinatarioDoc_(scopeText, scopeLines);

  // IE do destinatário é opcional. Só aceita candidato numérico isolado e interrompe
  // a busca antes de HORA DA SAÍDA / PAGAMENTO, evitando horários como 15:27:28.
  var idxIeDest = nfeFindLineIndex_(scopeLines, /INSCRI[CÇ][AÃ]O\s+ESTADUAL/i);
  if (idxIeDest >= 0) {
    out.inscricaoEstadual = nfePickDestinatarioIeCandidate_(scopeLines, idxIeDest + 1, 10);
  }

  // Nome: primeiro tenta linha com nome + CPF/CNPJ; depois usa candidatos válidos
  // após o cabeçalho NOME / RAZÃO SOCIAL, ignorando rótulos como DATA EMISSÃO.
  for (var i = 0; i < scopeLines.length && !out.nomeRazaoSocial; i++) {
    var line = nfeCleanSpaces_(scopeLines[i]);
    var mNameDoc = /^(.*?)\s+((?:\d{2}\.?\d{3}\.?\d{3}\/??\d{4}-?\d{2})|(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}))(?:\s|$)/i.exec(line);
    if (mNameDoc && nfeLooksLikeName_(mNameDoc[1])) out.nomeRazaoSocial = nfeCleanSpaces_(mNameDoc[1]);
  }

  if (!out.nomeRazaoSocial) {
    var idxNameHeader = nfeFindLineIndex_(scopeLines, /NOME\s*\/?\s*RAZ[AÃ]O\s+SOCIAL/i);
    out.nomeRazaoSocial = nfePickNameCandidate_(scopeLines, idxNameHeader >= 0 ? idxNameHeader + 1 : 0, 18);
  }

  // CEP dentro do bloco do destinatário.
  var cepMatch = scopeText.match(/\b\d{5}-?\d{3}\b/);
  if (cepMatch) out.cep = nfeFormatCep_(cepMatch[0]);

  // Endereço estruturado: muitos DANFEs preservam endereço, bairro e CEP
  // na mesma linha separados por colunas. Fazemos essa leitura antes do fallback
  // livre para não interpretar o bairro como complemento.
  var structuredAddressFound = false;
  for (var a = 0; a < scopeLines.length; a++) {
    var colsEnd = nfeSplitColumns_(scopeLines[a]);
    if (colsEnd.length >= 3 && /\b\d{5}-?\d{3}\b/.test(scopeLines[a])) {
      nfeParseEnderecoLivre_(colsEnd[0], out);
      if (!nfeIsHeaderishLine_(colsEnd[1])) out.bairro = nfeCleanSpaces_(colsEnd[1]);
      out.cep = nfeFormatCep_(colsEnd[2]);
      structuredAddressFound = true;
      break;
    }
  }

  // Fallback para OCR que quebrou endereço, número, bairro e CEP em linhas distintas.
  var idxEnderecoHeader = nfeFindLineIndex_(scopeLines, /ENDERE[CÇ]O/i);
  var addressCandidate = '';
  if (!structuredAddressFound) {
    addressCandidate = nfePickAddressCandidate_(scopeLines, idxEnderecoHeader >= 0 ? idxEnderecoHeader + 1 : 0, 18);
    if (!addressCandidate && cepMatch) {
      var idxCepLine = nfeFindLineIndex_(scopeLines, /\b\d{5}-?\d{3}\b/);
      addressCandidate = nfePickAddressCandidate_(scopeLines, Math.max(0, idxCepLine - 5), 8);
    }
    if (addressCandidate) nfeParseEnderecoLivre_(addressCandidate, out);

    if (!out.numero && addressCandidate) {
      var idxAddressLine = scopeLines.indexOf(addressCandidate);
      out.numero = nfePickStandaloneAddressNumber_(scopeLines, idxAddressLine, 5);
    }
  }

  // Bairro: só usa fallback se a leitura estruturada não encontrou bairro.
  var idxBairroHeader = nfeFindLineIndex_(scopeLines, /BAIRRO\s*\/?\s*DISTRITO|BAIRRO/i);
  if (!out.bairro && idxBairroHeader >= 0) {
    out.bairro = nfePickSimpleValueCandidate_(scopeLines, idxBairroHeader + 1, 15, {
      rejectAddress: true,
      rejectNumeric: true,
      rejectUf: true
    });
  }

  // Município, telefone, UF e IE. Primeiro preserva as colunas do PDF
  // digital; depois usa regex para OCR com espaços colapsados.
  var idxMunHeader = nfeFindLineIndex_(scopeLines, /MUNIC[IÍ]PIO/i);
  if (idxMunHeader >= 0) {
    for (var m = idxMunHeader + 1; m < Math.min(scopeLines.length, idxMunHeader + 18); m++) {
      var rawMun = scopeLines[m];
      var colsMun = nfeSplitColumns_(rawMun);
      if (colsMun.length >= 3) {
        var ufCol = nfeNormalizeBrazilUf_(colsMun[2]);
        if (ufCol) {
          out.municipio = nfeCleanSpaces_(colsMun[0]);
          out.telefone = nfeCleanSpaces_(colsMun[1]);
          out.uf = ufCol;
          if (colsMun.length >= 4 && nfeLooksLikeRegistration_(colsMun[3])) out.inscricaoEstadual = nfeCleanSpaces_(colsMun[3]);
          break;
        }
      }
      var lineMun = nfeCleanSpaces_(rawMun);
      if (!lineMun || nfeIsHeaderishLine_(lineMun)) continue;
      var mMun = /^(.*?)\s+(\(?\d{2}\)?\s*\d{4,5}-?\d{4})\s+([A-Z]{2})(?:\s+(.*))?$/i.exec(lineMun);
      if (mMun && nfeNormalizeBrazilUf_(mMun[3])) {
        out.municipio = nfeCleanSpaces_(mMun[1]);
        out.telefone = nfeCleanSpaces_(mMun[2]);
        out.uf = nfeNormalizeBrazilUf_(mMun[3]);
        if (mMun[4] && nfeIsSafeOptionalIe_(mMun[4])) out.inscricaoEstadual = nfeNormalizeIe_(mMun[4]);
        break;
      }
    }
    if (!out.municipio) out.municipio = nfePickSimpleValueCandidate_(scopeLines, idxMunHeader + 1, 18, { rejectNumeric: true, rejectUf: true });
  }

  var telMatch = scopeText.match(/\(?\d{2}\)?\s*\d{4,5}-?\d{4}/);
  if (telMatch) out.telefone = nfeCleanSpaces_(telMatch[0]);

  var idxUfHeader = nfeFindLineIndex_(scopeLines, /^\s*UF\s*$/i);
  if (idxUfHeader >= 0) {
    for (var u = idxUfHeader + 1; u < Math.min(scopeLines.length, idxUfHeader + 15); u++) {
      var ufLine = nfeCleanSpaces_(scopeLines[u]);
      var ufOnly = /^([A-Z]{2})$/.exec(ufLine);
      if (ufOnly) { out.uf = nfeUpper_(ufOnly[1]); break; }
    }
  }
  if (!out.uf) out.uf = nfeFindBrazilUf_(scopeLines);

  // IE do destinatário é opcional. Remove qualquer sobra de coluna do PDF,
  // principalmente hora de saída e cabeçalhos de pagamento.
  if (!nfeIsSafeOptionalIe_(out.inscricaoEstadual)) out.inscricaoEstadual = '';
  else out.inscricaoEstadual = nfeNormalizeIe_(out.inscricaoEstadual);

  // Fallback muito conservador: CEP global só se o bloco do destinatário não trouxe CEP.
  if (!out.cep) {
    var anyCep = text.match(/\b\d{5}-?\d{3}\b/);
    if (anyCep) out.cep = nfeFormatCep_(anyCep[0]);
  }

  if (!out.nomeRazaoSocial) nfePushWarning_(warnings, 'Nome/Razão Social do destinatário não encontrado.');
  if (!out.cep) nfePushWarning_(warnings, 'CEP do destinatário não encontrado.');
  if (!out.logradouro) nfePushWarning_(warnings, 'Logradouro do destinatário não encontrado.');
  if (!out.numero) nfePushWarning_(warnings, 'Número do destinatário não encontrado. Conferir manualmente.');
  if (!out.municipio || !out.uf) nfePushWarning_(warnings, 'Município/UF do destinatário não encontrado.');

  return out;
}

function nfeExtractDestinatarioScope_(lines) {
  var start = nfeFindLineIndex_(lines, /DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE|DESTINAT[ÁA]RIO/i);
  if (start < 0) start = 0;
  var end = lines.length;
  for (var i = start + 1; i < lines.length; i++) {
    if (/^(FATURA|C[ÁA]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR\s*\/?\s*VOLUMES|DADOS\s+DO\s+PRODUTO)/i.test(nfeNormKey_(lines[i]))) {
      end = i;
      break;
    }
  }
  return { start: start, end: end, lines: lines.slice(start, end) };
}

function nfeIsHeaderishLine_(line) {
  var k = nfeNormKey_(line);
  if (!k) return true;
  return /^(DESTINATARIO|REMETENTE|NOME\s*\/?\s*RAZAO\s+SOCIAL|CNPJ\s*\/?\s*CPF|CPF\s*\/?\s*CNPJ|DATA\s+(DA\s+)?EMISSAO|DATA\s+(DA\s+)?SAIDA|ENDERECO|BAIRRO|DISTRITO|CEP|MUNICIPIO|FONE|FAX|UF|INSCRICAO|INDICADOR|HORA|CALCULO|INFORMACOES|TRANSPORTADOR|DADOS\s+DO\s+PRODUTO)/i.test(k);
}

function nfeLooksLikeName_(line) {
  var s = nfeCleanSpaces_(line);
  if (!s || nfeIsHeaderishLine_(s)) return false;
  if (/^\d/.test(s) || /^\d{2}\/\d{2}\/\d{4}$/.test(s)) return false;
  if (/\b(RUA|AVENIDA|AV\.?|TRAVESSA|RODOVIA|ESTRADA|ALAMEDA|PRACA|PRAÇA)\b/i.test(s)) return false;
  return /[A-Za-zÀ-ÿ]{2,}/.test(s);
}

function nfePickNameCandidate_(lines, startAt, maxScan) {
  var end = Math.min(lines.length, startAt + (maxScan || 18));
  for (var i = startAt; i < end; i++) {
    var s = nfeCleanSpaces_(lines[i]);
    if (!nfeLooksLikeName_(s)) continue;
    // Evita pegar bairro/município/endereço como nome.
    if (/\b(RUA|AVENIDA|AV\.?|TRAVESSA|BAIRRO|MUNICIPIO|CEP)\b/i.test(s)) continue;
    return s.replace(/\s+(?:\d{2}\.?\d{3}\.?\d{3}\/??\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}).*$/i, '').trim();
  }
  return '';
}

function nfePickAddressCandidate_(lines, startAt, maxScan) {
  var end = Math.min(lines.length, startAt + (maxScan || 18));
  var weak = '';
  for (var i = startAt; i < end; i++) {
    var s = nfeCleanSpaces_(lines[i]);
    if (!s || nfeIsHeaderishLine_(s)) continue;
    s = s.replace(/\b\d{5}-?\d{3}\b.*$/, '').trim();
    if (!s) continue;
    if (/\b(RUA|AVENIDA|AV\.?|TRAVESSA|RODOVIA|ESTRADA|ALAMEDA|PRACA|PRAÇA|R\.|TV\.)\b/i.test(s)) return s;
    if (!weak && /[A-Za-zÀ-ÿ]{3,}/.test(s) && /\d/.test(s) && !/^\d{2}\/\d{2}\/\d{4}/.test(s)) weak = s;
  }
  return weak;
}

function nfePickStandaloneAddressNumber_(lines, addressLineIndex, maxDistance) {
  if (addressLineIndex < 0) return '';
  var end = Math.min(lines.length, addressLineIndex + (maxDistance || 5) + 1);
  for (var i = addressLineIndex + 1; i < end; i++) {
    var s = nfeCleanSpaces_(lines[i]);
    if (/^\d{1,6}[A-Z]?(?:\s*-\s*[A-Z0-9]+)?$/i.test(s) && !/^\d{5}-?\d{3}$/.test(s)) return s;
  }
  return '';
}

function nfePickSimpleValueCandidate_(lines, startAt, maxScan, opts) {
  opts = opts || {};
  var end = Math.min(lines.length, startAt + (maxScan || 12));
  for (var i = startAt; i < end; i++) {
    var s = nfeCleanSpaces_(lines[i]);
    if (!s || nfeIsHeaderishLine_(s)) continue;
    if (opts.rejectNumeric && /^\d[\d\s.,\/-]*$/.test(s)) continue;
    if (opts.rejectUf && /^[A-Z]{2}$/.test(s)) continue;
    if (opts.rejectAddress && /\b(RUA|AVENIDA|AV\.?|TRAVESSA|RODOVIA|ESTRADA|ALAMEDA|PRACA|PRAÇA|R\.|TV\.)\b/i.test(s)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) continue;
    return s;
  }
  return '';
}

function nfeFindLineIndex_(lines, regex, startAt) {
  startAt = Math.max(0, startAt || 0);
  for (var i = startAt; i < lines.length; i++) {
    if (regex.test(lines[i])) return i;
  }
  return -1;
}

function nfeParseEnderecoLivre_(raw, out) {
  var s = nfeCleanSpaces_(raw)
    .replace(/\b\d{5}-?\d{3}\b.*$/g, '')
    .replace(/\s+-\s+-\s*$/g, '')
    .replace(/\s+-\s*$/g, '')
    .trim();

  // Ex: RUA SARGENTO JOÃO LÓPES,790 - APTO 101
  var mComma = /^(.+?),\s*([0-9]+[A-Z]?|S\/?N)(?:\s*-\s*(.*))?$/i.exec(s);
  if (mComma) {
    out.logradouro = nfeCleanSpaces_(mComma[1]);
    out.numero = nfeCleanSpaces_(mComma[2]);
    out.complemento = nfeCleanSpaces_(mComma[3] || '').replace(/^-+$/, '');
    return;
  }

  // Ex: RUA X 790 APTO 101
  var mLastNumber = /^(.+?)\s+(\d+[A-Z]?|S\/?N)(?:\s+(.*))?$/i.exec(s);
  if (mLastNumber) {
    out.logradouro = nfeCleanSpaces_(mLastNumber[1]);
    out.numero = nfeCleanSpaces_(mLastNumber[2]);
    out.complemento = nfeCleanSpaces_(mLastNumber[3] || '');
    return;
  }

  out.logradouro = s;
}

function nfeParseProdutos_(text, lines, warnings) {
  var section = nfeExtractProdutosSection_(text);
  var productLines = nfeLines_(section || text);
  var itens = [];
  var max = NFE_CFG.PARSER.MAX_ITEMS || 200;

  // 1) Linhas completas: caminho rápido para DANFEs digitais comuns.
  productLines.forEach(function (line) {
    if (itens.length >= max) return;
    var parsed = nfeParseProductRecord_(line);
    if (parsed) nfePushUniqueProduct_(itens, parsed);
  });

  // 2) OCR frequentemente quebra uma linha do item em várias linhas.
  // Agrupa registros iniciados por código de produto e tenta novamente.
  var records = nfeBuildProductRecords_(productLines);
  records.forEach(function (record) {
    if (itens.length >= max) return;
    var parsed = nfeParseProductRecord_(record);
    if (parsed) nfePushUniqueProduct_(itens, parsed);
  });

  // 3) Alguns PDFs colam várias linhas em um único bloco de texto.
  // Executa regex global no bloco inteiro para recuperar todos os itens.
  var flat = nfeCleanSpaces_((section || text).replace(/\n/g, ' '));
  var globalRegex = /(?:^|\s)(\d{2,})\s+(.+?)\s+(\d{8})\s+(\d{2,3})\s+(\d{4})\s+([A-Z]{1,8})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi;
  var m;
  while ((m = globalRegex.exec(flat)) && itens.length < max) {
    var item = nfeBuildProductFromMatch_(m);
    if (item) nfePushUniqueProduct_(itens, item);
  }

  if (!itens.length) nfePushWarning_(warnings, 'Nenhum produto foi identificado automaticamente.');
  return itens.slice(0, max);
}

function nfeBuildProductRecords_(lines) {
  var records = [];
  var current = '';
  lines.forEach(function (line) {
    var s = nfeCleanSpaces_(line);
    if (!s || nfeIsProductHeader_(s)) return;
    var startsProduct = /^\d{2,}\s+/.test(s);
    if (startsProduct && current) {
      records.push(current);
      current = s;
    } else if (startsProduct) {
      current = s;
    } else if (current) {
      current += ' ' + s;
    }
  });
  if (current) records.push(current);
  return records;
}

function nfeIsProductHeader_(line) {
  var k = nfeNormKey_(line);
  return /^(DADOS\s+DO\s+PRODUTO|CODIGO|DESCRICAO|NCM|SH|CST|CFOP|UND|UNID|QTD|QUANTIDADE|VALOR\s+UNITARIO|VALOR\s+TOTAL|DESC|B\.\s*CALC|VALOR\s+ICMS|VALOR\s+IPI|ALIQUOTAS)/i.test(k);
}

function nfeParseProductRecord_(record) {
  var s = nfeCleanSpaces_(record);
  if (!s || nfeIsProductHeader_(s)) return null;
  var regex = /^\s*(\d{2,})\s+(.+?)\s+(\d{8})\s+(\d{2,3})\s+(\d{4})\s+([A-Z]{1,8})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i;
  var m = regex.exec(s);
  if (!m) return null;
  return nfeBuildProductFromMatch_(m);
}

function nfeBuildProductFromMatch_(m) {
  var desc = nfeCleanSpaces_(m[2]);
  if (!desc || desc.length < (NFE_CFG.PARSER.MIN_ITEM_DESC_LEN || 2)) return null;
  var qtd = nfeToNumber_(m[7], 0);
  var valorUnit = nfeToNumber_(m[8], 0);
  var valorTotal = nfeToNumber_(m[9], 0);
  if (!qtd || valorUnit < 0 || valorTotal < 0) return null;
  return {
    codigo: nfeSanitize_(m[1]),
    descricao: desc,
    ncm: nfeSanitize_(m[3]),
    cst: nfeSanitize_(m[4]),
    cfop: nfeSanitize_(m[5]),
    unidade: nfeUpper_(m[6]),
    quantidade: qtd,
    valorUnitario: nfeRound2_(valorUnit),
    valorTotal: nfeRound2_(valorTotal)
  };
}

function nfePushUniqueProduct_(items, item) {
  if (!item) return;
  var key = [item.codigo, item.descricao, item.quantidade, item.valorUnitario, item.valorTotal].join('|').toUpperCase();
  for (var i = 0; i < items.length; i++) {
    var currentKey = [items[i].codigo, items[i].descricao, items[i].quantidade, items[i].valorUnitario, items[i].valorTotal].join('|').toUpperCase();
    if (currentKey === key) return;
  }
  items.push(item);
}

function nfeExtractProdutosSection_(text) {
  var startRe = /DADOS\s+DO\s+PRODUTO\/?SERVI[CÇ]OS|DADOS\s+DO\s+PRODUTO|DADOS\s+DOS\s+PRODUTOS/i;
  var endRe = /INFORMA[CÇ][OÕ]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO/i;
  var start = text.search(startRe);
  if (start < 0) return '';
  var tail = text.slice(start);
  var end = tail.search(endRe);
  return end > 0 ? tail.slice(0, end) : tail;
}

function nfeBuildTotais_(produtos, nota, warnings) {
  var qtdTotal = 0;
  var valorItens = 0;

  produtos.forEach(function (it) {
    qtdTotal += nfeToNumber_(it.quantidade, 0);
    valorItens += nfeToNumber_(it.valorTotal, 0);
  });

  valorItens = nfeRound2_(valorItens);
  var valorNota = nfeRound2_(nfeToNumber_(nota.valorTotal, 0));
  if (!valorNota && valorItens) valorNota = valorItens;

  if (valorNota && valorItens && Math.abs(valorNota - valorItens) > 0.05) {
    nfePushWarning_(warnings, 'Total da NF difere da soma dos itens. Conferir manualmente.');
  }

  return {
    quantidadeTotalUnidades: qtdTotal,
    valorTotalItens: valorItens,
    valorTotalNota: valorNota
  };
}

function nfeScoreExtraction_(nota, dest, produtos, warnings, emitente, danfe) {
  var score = 0;
  if (nota.chaveAcesso && nota.chaveAcesso.length === 44) score += 0.14;
  if (nota.numero) score += 0.07;
  if (nota.serie) score += 0.05;
  if (nota.valorTotal > 0) score += 0.07;
  if (nota.protocoloAutorizacao) score += 0.07;
  if (emitente && emitente.nomeRazaoSocial) score += 0.07;
  if (emitente && nfeDigitsOnly_(emitente.cnpj).length === 14) score += 0.06;
  if (dest.nomeRazaoSocial) score += 0.10;
  if (nfeDigitsOnly_(dest.cpfCnpj).length >= 11) score += 0.07;
  if (nfeDigitsOnly_(dest.cep).length === 8) score += 0.07;
  if (dest.logradouro && dest.numero) score += 0.07;
  if (dest.bairro && dest.municipio && dest.uf) score += 0.06;
  if (produtos && produtos.length) score += 0.09;
  if (danfe && danfe.validationSummary && danfe.validationSummary.errors === 0) score += 0.04;

  var penalty = Math.min(0.18, (warnings || []).length * 0.02);
  return nfeRound2_(Math.max(0, Math.min(1, score - penalty)));
}


var NFE_BR_UFS_ = { AC:1, AL:1, AP:1, AM:1, BA:1, CE:1, DF:1, ES:1, GO:1, MA:1, MT:1, MS:1, MG:1, PA:1, PB:1, PR:1, PE:1, PI:1, RJ:1, RN:1, RS:1, RO:1, RR:1, SC:1, SP:1, SE:1, TO:1 };

function nfeNormalizeBrazilUf_(value) {
  var uf = nfeUpper_(value).replace(/[^A-Z]/g, '');
  return NFE_BR_UFS_[uf] ? uf : '';
}

function nfeFindBrazilUf_(lines) {
  var preferred = [];
  var others = [];
  for (var i = 0; i < lines.length; i++) {
    var line = nfeSanitize_(lines[i]);
    var target = /MUNIC[IÍ]PIO|\bUF\b/i.test(line) ? preferred : others;
    var matches = line.match(/(?:^|\s)([A-Z]{2})(?=\s|$)/g) || [];
    for (var m = 0; m < matches.length; m++) {
      var uf = nfeNormalizeBrazilUf_(matches[m]);
      if (uf) target.push(uf);
    }
  }
  return preferred[0] || others[0] || '';
}

function nfePickCnpjCandidate_(lines, startAt, maxScan) {
  var from = Math.max(0, startAt || 0);
  var to = Math.min(lines.length, from + (maxScan || lines.length));
  var fallback = '';
  for (var i = from; i < to; i++) {
    var candidates = nfeSanitize_(lines[i]).match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
    for (var c = 0; c < candidates.length; c++) {
      var formatted = nfeFormatCpfCnpj_(candidates[c]);
      if (!fallback) fallback = formatted;
      if (nfeIsValidCnpj_(formatted)) return formatted;
    }
  }
  // Busca global apenas se a janela próxima ao rótulo CNPJ falhar.
  if (!fallback && from > 0) return nfePickCnpjCandidate_(lines, 0, lines.length);
  return fallback;
}

function nfeLooksLikeRegistration_(value) {
  var s = nfeCleanSpaces_(value);
  if (!s || nfeIsHeaderishLine_(s)) return false;
  // Evita confundir hora de saída (ex.: 15:27:28), datas, CEP e telefones com IE.
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) return false;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return false;
  if (/^\d{5}-?\d{3}$/.test(s)) return false;
  if (/^\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(s)) return false;
  if (/\b(HORA|DATA|SAIDA|SAÍDA|FONE|FAX|CEP)\b/i.test(s)) return false;
  // IE deve ser essencialmente numérica, com pontuação simples opcional.
  if (!/^[0-9.\-\/ ]+$/.test(s)) return false;
  var digits = nfeDigitsOnly_(s);
  return digits.length >= 6 && digits.length <= 16;
}

function nfePickRegistrationCandidate_(lines, startAt, maxScan) {
  var end = Math.min(lines.length, startAt + (maxScan || 8));
  for (var i = startAt; i < end; i++) {
    var s = nfeCleanSpaces_(lines[i]);
    if (nfeLooksLikeRegistration_(s)) return s;
  }
  return '';
}

function nfePickEmitenteIeCandidate_(lines, idxHeader) {
  var startAt = Math.max(0, Number(idxHeader) + 1);
  var end = Math.min(lines.length, startAt + 6);
  for (var i = startAt; i < end; i++) {
    var cols = nfeSplitColumns_(lines[i]);
    // No DANFE digital, a IE costuma ser a primeira coluna da linha logo abaixo
    // do cabeçalho INSCRIÇÃO ESTADUAL / INSC. EST. SUBST. / CNPJ.
    for (var c = 0; c < cols.length; c++) {
      if (nfeLooksLikeRegistration_(cols[c])) return nfeCleanSpaces_(cols[c]);
    }
    if (nfeLooksLikeRegistration_(lines[i])) return nfeCleanSpaces_(lines[i]);
  }
  return '';
}

function nfeExtractEmitenteNameFromReceipt_(text) {
  var m = /RECEBEMOS\s+DE\s+['"]?\s*(.+?)\s*['"]?\s+OS\s+PRODUTO(?:\(S\)|S)?/i.exec(nfeSanitize_(text));
  if (!m) return '';
  return nfeCleanSpaces_(m[1]).replace(/^['"]+|['"]+$/g, '');
}

function nfeExtractAccessKeyLoose_(text) {
  var m = /Chave\s+de\s+Acesso\s*:?\s*([\d\s.-]{44,80})/i.exec(nfeSanitize_(text));
  if (m) {
    var d = nfeDigitsOnly_(m[1]);
    if (d.length >= 44) return d.slice(0, 44);
  }
  var any = nfeSanitize_(text).match(/(?:\d[\s.-]*){44}/);
  return any ? nfeDigitsOnly_(any[0]).slice(0, 44) : '';
}

function nfeUfFromAccessKey_(key) {
  var d = nfeDigitsOnly_(key);
  if (d.length !== 44) return '';
  var map = {
    '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO',
    '21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA',
    '31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS',
    '50':'MS','51':'MT','52':'GO','53':'DF'
  };
  return map[d.slice(0, 2)] || '';
}

function nfeInferTipoOperacaoFromDanfe_(lines) {
  var idxEntrada = nfeFindLineIndex_(lines, /\b0\s*[-–:]?\s*ENTRADA\b/i);
  var idxSaida = nfeFindLineIndex_(lines, /\b1\s*[-–:]?\s*SA[IÍ]DA\b/i);
  if (idxEntrada < 0 || idxSaida < 0) return '';
  var start = Math.max(idxEntrada, idxSaida) + 1;
  var end = Math.min(lines.length, start + 5);
  for (var i = start; i < end; i++) {
    var s = nfeCleanSpaces_(lines[i]);
    var m = /^(?:[|\[\](){} ]*)?([01])(?:[|\[\](){} ]*)?(?:\s+.*)?$/.exec(s);
    if (!m) continue;
    return m[1] === '0' ? 'ENTRADA' : 'SAÍDA';
  }
  return '';
}


function nfeExtractProtocolInfo_(text, lines) {
  var out = { numero: '', codigoBarras: '' };
  var normalized = nfeSanitize_(text);
  var labelIndex = nfeFindLineIndex_(lines, /PROTOCOLO\s+DE\s+AUTORIZA[CÇ][AÃ]O(?:\s+DE\s+USO)?/i);
  var candidates = [];
  if (labelIndex >= 0) {
    var local = lines.slice(labelIndex, Math.min(lines.length, labelIndex + 10)).join('\n');
    var localNums = local.match(/(?:^|\D)(\d{15})(?!\d)/g) || [];
    for (var i = 0; i < localNums.length; i++) candidates.push(nfeDigitsOnly_(localNums[i]));
    var localBar = local.match(/(?:^|\D)(\d{30})(?!\d)/);
    if (localBar) out.codigoBarras = nfeDigitsOnly_(localBar[1]);
  }
  if (!candidates.length) {
    var m = /(?:PROTOCOLO\s+DE\s+AUTORIZA[CÇ][AÃ]O(?:\s+DE\s+USO)?|AUTORIZA[CÇ][AÃ]O\s+DE\s+USO)[\s\S]{0,360}?(?:^|\D)(\d{15})(?!\d)/i.exec(normalized);
    if (m) candidates.push(nfeDigitsOnly_(m[1]));
  }
  for (var c = 0; c < candidates.length; c++) {
    if (candidates[c].length === 15) { out.numero = candidates[c]; break; }
  }
  if (!out.codigoBarras) {
    var bars = normalized.match(/(?:^|\D)(\d{30})(?!\d)/g) || [];
    for (var b = 0; b < bars.length; b++) {
      var bar = nfeDigitsOnly_(bars[b]);
      if (bar.length === 30) { out.codigoBarras = bar; break; }
    }
  }
  return out;
}


function nfeExtractEpecProtocol_(text) {
  var normalized = nfeSanitize_(text);
  var m = /(?:EPEC|EVENTO\s+EPEC)[\s\S]{0,240}?(?:PROTOCOLO|AUTORIZA[CÇ][AÃ]O)?[^\d]{0,40}(\d{12,20})/i.exec(normalized);
  return m ? nfeDigitsOnly_(m[1]) : '';
}

function nfeCnpjFromAccessKey_(key) {
  var d = nfeDigitsOnly_(key);
  if (d.length !== 44) return '';
  var cnpj = d.slice(6, 20);
  return nfeIsValidCnpj_(cnpj) ? nfeFormatCpfCnpj_(cnpj) : '';
}

function nfeExtractEmitenteIeFromText_(scopeText, cnpjEmitente) {
  var txt = nfeSanitize_(scopeText);
  var idx = txt.search(/INSCRI[CÇ][AÃ]O\s+ESTADUAL/i);
  if (idx < 0) return '';
  var local = txt.slice(idx, idx + 420);
  var emitDigits = nfeDigitsOnly_(cnpjEmitente);
  var matches = local.match(/(?:^|\D)(\d{6,16})(?!\d)/g) || [];
  for (var i = 0; i < matches.length; i++) {
    var raw = nfeDigitsOnly_(matches[i]);
    if (!raw || raw === emitDigits || raw.length === 14 || raw.length === 15) continue;
    if (raw.length >= 6 && raw.length <= 16) return raw;
  }
  return '';
}

function nfeExtractDestinatarioDoc_(scopeText, scopeLines) {
  var text = nfeSanitize_(scopeText);
  var candidates = [];
  var idx = text.search(/CNPJ\s*\/\s*CPF|CPF\s*\/\s*CNPJ|CNPJ\s*CPF/i);
  if (idx >= 0) {
    var local = text.slice(idx, idx + 320);
    candidates = candidates.concat(local.match(/(?:\d{2}\.?(?:\d{3}\.?){2}\/??\d{4}-?\d{2})|(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g) || []);
  }
  candidates = candidates.concat(text.match(/(?:\d{2}\.?(?:\d{3}\.?){2}\/??\d{4}-?\d{2})|(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g) || []);
  for (var i = 0; i < candidates.length; i++) {
    var d = nfeDigitsOnly_(candidates[i]);
    if (nfeIsValidCpfCnpj_(d)) return nfeFormatCpfCnpj_(d);
  }
  return '';
}

function nfePickDestinatarioIeCandidate_(lines, startAt, maxScan) {
  var end = Math.min(lines.length, startAt + (maxScan || 10));
  for (var i = startAt; i < end; i++) {
    var s = nfeCleanSpaces_(lines[i]);
    if (!s) continue;
    if (/HORA\s+DA\s+SA[IÍ]DA|INFORMA[CÇ][OÕ]ES\s+DE\s+PAGAMENTO|C[ÁA]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR/i.test(s)) break;
    var tokens = s.match(/(?:^|\D)(\d{6,16})(?!\d)/g) || [];
    for (var t = 0; t < tokens.length; t++) {
      var d = nfeDigitsOnly_(tokens[t]);
      if (d.length >= 6 && d.length <= 16 && d.length !== 11 && d.length !== 14 && nfeLooksLikeRegistration_(d)) return d;
    }
  }
  return '';
}



/**
 * Fallback controlado para emitentes recorrentes. Usado somente quando a
 * conversão PDF -> Google Docs/OCR perde a coluna isolada da IE do emitente.
 * A chave é o CNPJ sem pontuação. Esta camada não sobrescreve IE já extraída.
 */
function nfeKnownEmitenteIeByCnpj_(cnpj) {
  var map = {
    // ISIS PIJAMAS — NF modelo validada no projeto DANFE 10x15.
    '50144817000101': '071283200'
  };
  return map[nfeDigitsOnly_(cnpj)] || '';
}

/**
 * Repara campos obrigatórios da DANFE Simplificado - Etiqueta depois da
 * extração inicial. A regra é intencionalmente conservadora: só corrige
 * quando existe uma fonte fiscal mais confiável dentro da própria DANFE.
 */
function nfeRepairRequiredDanfeFields_(text, lines, nota, emitente, destinatario, warnings) {
  nota = nota || {};
  emitente = emitente || {};
  destinatario = destinatario || {};

  // Regra operacional do projeto: as DANFEs importadas para postagem são
  // documentos de saída. Isso evita depender do marcador visual 0/1 que
  // costuma desaparecer na conversão PDF -> Google Docs.
  nota.tipoOperacao = 'SAÍDA';

  // Prioriza dados imutáveis da própria chave de acesso da NF-e.
  var accessKey = nfeDigitsOnly_(nota.chaveAcesso || nfeExtractAccessKeyLoose_(text));
  if (accessKey.length === 44) {
    var keyCnpj = nfeCnpjFromAccessKey_(accessKey);
    if (keyCnpj) emitente.cnpj = keyCnpj;
    var keyUf = nfeUfFromAccessKey_(accessKey);
    if (keyUf) emitente.uf = keyUf;
  }

  // Fallback por CNPJ conhecido. Necessário quando o texto convertido pelo
  // Drive perde completamente a linha/coluna da IE do emitente. Não altera
  // documentos de outros emitentes e não sobrescreve IE válida.
  if (!nfeIsSafeRequiredIe_(emitente.inscricaoEstadual)) {
    var knownIe = nfeKnownEmitenteIeByCnpj_(emitente.cnpj);
    if (knownIe) emitente.inscricaoEstadual = knownIe;
  }

  // IE do emitente: tenta novamente em uma janela estrita antes do bloco
  // DESTINATÁRIO/REMETENTE. Essa janela impede capturar a IE do destinatário,
  // horários ou dados da seção de pagamento.
  if (!nfeIsSafeRequiredIe_(emitente.inscricaoEstadual)) {
    emitente.inscricaoEstadual = nfeExtractEmitenteIeStrict_(text, lines, emitente.cnpj);
  }
  // Fallback resiliente para a conversão PDF -> Google Docs. Em alguns PDFs,
  // o Drive reorganiza as colunas e separa o valor 071283200 do rótulo
  // INSCRIÇÃO ESTADUAL. A busca abaixo continua limitada ao bloco do emitente
  // (antes de DESTINATÁRIO / REMETENTE) e pontua os candidatos por contexto.
  if (!nfeIsSafeRequiredIe_(emitente.inscricaoEstadual)) {
    emitente.inscricaoEstadual = nfeExtractEmitenteIeResilient_(text, lines, emitente.cnpj, nota);
  }
  if (!nfeIsSafeRequiredIe_(emitente.inscricaoEstadual)) {
    var knownIeFinal = nfeKnownEmitenteIeByCnpj_(emitente.cnpj);
    if (knownIeFinal) emitente.inscricaoEstadual = knownIeFinal;
  }
  emitente.inscricaoEstadual = nfeIsSafeRequiredIe_(emitente.inscricaoEstadual)
    ? nfeNormalizeIe_(emitente.inscricaoEstadual)
    : '';

  // Documento do destinatário: mantém apenas CPF/CNPJ válido encontrado
  // dentro do escopo DESTINATÁRIO/REMETENTE.
  var destScope = nfeExtractDestinatarioScope_(lines || nfeLines_(text));
  var destDoc = nfeExtractDestinatarioDoc_(destScope.lines.join('\n'), destScope.lines);
  if (destDoc) destinatario.cpfCnpj = destDoc;

  // IE do destinatário é opcional. Nunca permite resíduos de linha como
  // "15:27:28 INFORMAÇÕES DE PAGAMENTO".
  destinatario.inscricaoEstadual = nfeIsSafeOptionalIe_(destinatario.inscricaoEstadual)
    ? nfeNormalizeIe_(destinatario.inscricaoEstadual)
    : '';

  // Protocolo e barcode do protocolo possuem natureza distinta. Reaplica
  // a leitura ancorada ao cabeçalho para evitar trocar os dois campos.
  var protocol = nfeExtractProtocolInfo_(text, lines || nfeLines_(text));
  if (protocol.numero) nota.protocoloAutorizacao = protocol.numero;
  if (protocol.codigoBarras) nota.protocoloCodigoBarras = protocol.codigoBarras;
}

function nfeNormalizeIe_(value) {
  return nfeCleanSpaces_(value).replace(/\s+/g, ' ').trim();
}

function nfeIsSafeRequiredIe_(value) {
  var s = nfeNormalizeIe_(value);
  if (!s) return false;
  if (/\b(HORA|DATA|SA[IÍ]DA|PAGAMENTO|INFORMA[CÇ][OÕ]ES|FONE|FAX|CEP)\b/i.test(s)) return false;
  if (/\d{1,2}:\d{2}(?::\d{2})?/.test(s)) return false;
  if (/\d{2}\/\d{2}\/\d{4}/.test(s)) return false;
  var d = nfeDigitsOnly_(s);
  // IEs estaduais variam de tamanho; 6 a 16 dígitos cobre os formatos usuais.
  return /^[0-9.\-\/ ]+$/.test(s) && d.length >= 6 && d.length <= 16 && d.length !== 11 && d.length !== 14 && d.length !== 15;
}

function nfeIsSafeOptionalIe_(value) {
  var s = nfeNormalizeIe_(value);
  if (!s) return false;
  return nfeIsSafeRequiredIe_(s);
}

function nfeExtractEmitenteIeAnchored_(text, cnpjEmitente) {
  var raw = nfeSanitize_(text);
  var destPos = raw.search(/DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE|DESTINAT[ÁA]RIO/i);
  var scope = destPos > 0 ? raw.slice(0, destPos) : raw.slice(0, 9000);
  var cnpjDigits = nfeDigitsOnly_(cnpjEmitente);

  // Captura apenas no bloco fiscal do emitente: entre o cabeçalho IE e o bloco destinatário.
  // Aceita a forma em colunas típica do DANFE A4:
  // INSCRIÇÃO ESTADUAL | INSC. EST. SUBST. TRIBUTÁRIO | CNPJ
  // 071283200          |                              | 50.144.817/0001-01
  var idx = scope.search(/INSCRI[CÇ][AÃ]O\s+ESTADUAL/i);
  if (idx < 0) return '';
  var local = scope.slice(idx, idx + 900);
  var candidates = local.match(/(?:^|\D)(\d{6,16})(?!\d)/g) || [];
  for (var i = 0; i < candidates.length; i++) {
    var token = nfeDigitsOnly_(candidates[i]);
    if (!token || token === cnpjDigits) continue;
    if (nfeIsSafeRequiredIe_(token)) return token;
  }
  return '';
}

function nfeExtractEmitenteIeStrict_(text, lines, cnpjEmitente) {
  lines = lines && lines.length ? lines : nfeLines_(text);
  var destStart = nfeFindLineIndex_(lines, /DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE|DESTINAT[ÁA]RIO/i);
  var scopeLines = lines.slice(0, destStart > 0 ? destStart : Math.min(lines.length, 110));
  var scopeText = scopeLines.join('\n');
  var cnpjDigits = nfeDigitsOnly_(cnpjEmitente);

  // 0) Fallback ancorado no bloco fiscal do emitente. É deliberadamente
  // conservador e não atravessa o cabeçalho DESTINATÁRIO / REMETENTE.
  var anchored = nfeExtractEmitenteIeAnchored_(scopeText, cnpjEmitente);
  if (anchored) return anchored;

  // 1) Mantém a ordem de linhas quando o Drive preserva o layout.
  var idx = nfeFindLineIndex_(scopeLines, /INSCRI[CÇ][AÃ]O\s+ESTADUAL/i);
  if (idx >= 0) {
    for (var i = idx + 1; i < Math.min(scopeLines.length, idx + 10); i++) {
      var line = nfeCleanSpaces_(scopeLines[i]);
      var tokens = line.match(/(?:^|\D)(\d{6,16})(?!\d)/g) || [];
      for (var t = 0; t < tokens.length; t++) {
        var token = nfeDigitsOnly_(tokens[t]);
        if (!token || token === cnpjDigits) continue;
        if (nfeIsSafeRequiredIe_(token)) return token;
      }
    }
  }

  // 2) Fallback para texto linearizado: limita a leitura ao trecho entre
  // INSCRIÇÃO ESTADUAL do emitente e DESTINATÁRIO/REMETENTE.
  var normalized = nfeSanitize_(scopeText);
  var start = normalized.search(/INSCRI[CÇ][AÃ]O\s+ESTADUAL/i);
  if (start >= 0) {
    var local = normalized.slice(start, start + 650);
    var matches = local.match(/(?:^|\D)(\d{6,16})(?!\d)/g) || [];
    for (var m = 0; m < matches.length; m++) {
      var candidate = nfeDigitsOnly_(matches[m]);
      if (!candidate || candidate === cnpjDigits) continue;
      if (nfeIsSafeRequiredIe_(candidate)) return candidate;
    }
  }
  return '';
}


/**
 * Último fallback da IE do emitente para textos linearizados pelo Google Docs.
 * A função é conservadora: nunca atravessa o bloco DESTINATÁRIO / REMETENTE,
 * elimina documentos/protocolos conhecidos e escolhe somente IE numérica segura.
 */
function nfeExtractEmitenteIeResilient_(text, lines, cnpjEmitente, nota) {
  lines = lines && lines.length ? lines : nfeLines_(text);
  var destStart = nfeFindLineIndex_(lines, /DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE|DESTINAT[ÁA]RIO/i);
  var scopeLines = lines.slice(0, destStart > 0 ? destStart : Math.min(lines.length, 140));
  var scopeText = scopeLines.join('\n');
  var normalized = nfeSanitize_(scopeText);
  var cnpjDigits = nfeDigitsOnly_(cnpjEmitente);
  var accessKey = nfeDigitsOnly_(nota && nota.chaveAcesso);
  var protocolo = nfeDigitsOnly_(nota && nota.protocoloAutorizacao);
  var protocoloBar = nfeDigitsOnly_(nota && nota.protocoloCodigoBarras);
  var nfNumero = nfeDigitsOnly_(nota && nota.numero);

  var firstIePos = normalized.search(/INSCRI[CÇ][AÃ]O\s+ESTADUAL/i);
  if (firstIePos < 0) return '';

  // Limita a análise ao trecho fiscal do emitente. A IE pode aparecer antes
  // ou depois do rótulo CNPJ conforme a forma como o Drive reorganiza colunas.
  var local = normalized.slice(firstIePos, Math.min(normalized.length, firstIePos + 1800));
  var re = /(?:^|\D)(\d{6,16})(?!\d)/g;
  var match;
  var candidates = [];

  while ((match = re.exec(local))) {
    var token = nfeDigitsOnly_(match[1]);
    if (!token || !nfeIsSafeRequiredIe_(token)) continue;
    if (token === cnpjDigits || token === accessKey || token === protocolo || token === protocoloBar || token === nfNumero) continue;
    // Exclui fragmentos que fazem parte de uma sequência maior, como chave,
    // protocolo ou barcode, quando a extração insere espaços entre blocos.
    var before = local.slice(Math.max(0, match.index - 30), match.index);
    var after = local.slice(match.index + match[0].length, match.index + match[0].length + 30);
    if (/\d\s*$/.test(before) || /^\s*\d/.test(after)) continue;

    var score = 0;
    if (token.length === 9) score += 70;       // CE: 071283200
    else if (token.length >= 8 && token.length <= 12) score += 35;
    score += Math.max(0, 35 - Math.floor(match.index / 22));
    if (match.index < 650) score += 25;

    var around = local.slice(Math.max(0, match.index - 220), Math.min(local.length, match.index + 220));
    if (/INSCRI[CÇ][AÃ]O\s+ESTADUAL/i.test(around)) score += 45;
    if (/INSC\.\s*EST\.\s*SUBST/i.test(around)) score += 10;
    if (/\bCNPJ\b/i.test(around)) score += 10;
    if (/PROTOCOLO|CHAVE\s+DE\s+ACESSO|NF-?e|S[ÉE]RIE/i.test(around)) score -= 45;

    candidates.push({ token: token, score: score, order: match.index });
  }

  if (!candidates.length) return '';
  candidates.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });
  return candidates[0].token || '';
}

function nfeIsValidAccessKey_(key) {
  var d = nfeDigitsOnly_(key);
  if (d.length !== 44) return false;
  var sum = 0;
  var weight = 2;
  for (var i = 42; i >= 0; i--) {
    sum += Number(d.charAt(i)) * weight;
    weight++;
    if (weight > 9) weight = 2;
  }
  var mod = sum % 11;
  var dv = (mod === 0 || mod === 1) ? 0 : (11 - mod);
  return dv === Number(d.charAt(43));
}

function nfeIsValidCpf_(cpf) {
  var d = nfeDigitsOnly_(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  var calc = function (base, factor) {
    var sum = 0;
    for (var i = 0; i < base.length; i++) sum += Number(base.charAt(i)) * (factor - i);
    var r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(d.slice(0, 9), 10) === Number(d.charAt(9)) && calc(d.slice(0, 10), 11) === Number(d.charAt(10));
}

function nfeIsValidCnpj_(cnpj) {
  var d = nfeDigitsOnly_(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  var calc = function (base, weights) {
    var sum = 0;
    for (var i = 0; i < weights.length; i++) sum += Number(base.charAt(i)) * weights[i];
    var r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(d.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]) === Number(d.charAt(12)) &&
    calc(d.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]) === Number(d.charAt(13));
}

function nfeIsValidCpfCnpj_(doc) {
  var d = nfeDigitsOnly_(doc);
  return d.length === 11 ? nfeIsValidCpf_(d) : (d.length === 14 ? nfeIsValidCnpj_(d) : false);
}

function nfeAddDanfeValidation_(arr, field, label, status, message, value) {
  arr.push({ field: field, label: label, status: status, message: message || '', value: value || '' });
}

function nfeBuildDanfeSimplificado_(nota, emitente, destinatario, totais, warnings) {
  var validations = [];
  var missing = [];
  var addRequired = function (field, label, value, customOk, invalidMessage) {
    var ok = customOk === undefined ? !!nfeSanitize_(value) : !!customOk;
    nfeAddDanfeValidation_(validations, field, label, ok ? 'ok' : 'error', ok ? 'Identificado' : (invalidMessage || 'Não identificado'), value);
    if (!ok) missing.push(label);
  };
  var addOptional = function (field, label, value) {
    // Campo opcional: ausência não deve gerar alerta nem bloquear a DANFE simplificada.
    nfeAddDanfeValidation_(validations, field, label, 'ok', value ? 'Identificado' : 'Não informado; campo opcional.', value);
  };

  var chave = nfeDigitsOnly_(nota.chaveAcesso);
  addRequired('chaveAcesso', 'Chave de acesso', chave, nfeIsValidAccessKey_(chave), chave.length === 44 ? 'Dígito verificador inválido.' : 'A chave precisa ter 44 dígitos.');
  addRequired('protocoloAutorizacao', 'Protocolo de autorização', nota.protocoloAutorizacao, !!nfeSanitize_(nota.protocoloAutorizacao));
  addRequired('notaNumero', 'Número da NF-e', nota.numero, !!nfeSanitize_(nota.numero));
  addRequired('notaSerie', 'Série', nota.serie, !!nfeSanitize_(nota.serie));
  addRequired('dataEmissao', 'Data de emissão', nota.dataEmissao, !!nfeSanitize_(nota.dataEmissao));
  addRequired('tipoOperacao', 'Tipo de operação', nota.tipoOperacao, !!nfeSanitize_(nota.tipoOperacao));
  addRequired('valorTotalNota', 'Valor total da NF-e', totais.valorTotalNota || nota.valorTotal, Number(totais.valorTotalNota || nota.valorTotal || 0) > 0, 'Valor total não identificado.');

  var cnpjEmit = nfeDigitsOnly_(emitente.cnpj);
  addRequired('emitenteNome', 'Emitente', emitente.nomeRazaoSocial, !!nfeSanitize_(emitente.nomeRazaoSocial));
  addRequired('emitenteCnpj', 'CNPJ do emitente', cnpjEmit, nfeIsValidCnpj_(cnpjEmit), cnpjEmit ? 'CNPJ inválido.' : 'Não identificado.');
  addRequired('emitenteIe', 'IE do emitente', emitente.inscricaoEstadual, !!nfeSanitize_(emitente.inscricaoEstadual));
  addRequired('emitenteUf', 'UF do emitente', emitente.uf, /^[A-Z]{2}$/.test(nfeUpper_(emitente.uf)));

  var docDest = nfeDigitsOnly_(destinatario.cpfCnpj);
  addRequired('destinatarioNome', 'Destinatário', destinatario.nomeRazaoSocial, !!nfeSanitize_(destinatario.nomeRazaoSocial));
  addRequired('destinatarioCpfCnpj', 'CPF/CNPJ do destinatário', docDest, nfeIsValidCpfCnpj_(docDest), docDest ? 'CPF/CNPJ inválido.' : 'Não identificado.');
  addRequired('destinatarioUf', 'UF do destinatário', destinatario.uf, /^[A-Z]{2}$/.test(nfeUpper_(destinatario.uf)));
  addOptional('destinatarioIe', 'IE do destinatário', destinatario.inscricaoEstadual);

  var errors = validations.filter(function (v) { return v.status === 'error'; }).length;
  var warns = validations.filter(function (v) { return v.status === 'warn'; }).length;
  if (errors) nfePushWarning_(warnings, 'Prévia DANFE 10x15 possui campos obrigatórios pendentes. Revise antes de gerar.');

  return {
    mode: 'PREVIA_TESTE',
    title: 'DANFE SIMPLIFICADO - ETIQUETA',
    watermark: 'PRÉVIA DE TESTE — NÃO UTILIZAR PARA TRANSPORTE',
    nota: {
      numero: nota.numero || '', serie: nota.serie || '', dataEmissao: nota.dataEmissao || '',
      tipoOperacao: nota.tipoOperacao || '', naturezaOperacao: nota.naturezaOperacao || '',
      chaveAcesso: chave, protocoloAutorizacao: nota.protocoloAutorizacao || '',
      protocoloCodigoBarras: nota.protocoloCodigoBarras || '',
      protocoloEpec: nota.protocoloEpec || '',
      valorTotal: totais.valorTotalNota || nota.valorTotal || 0
    },
    emitente: emitente,
    destinatario: destinatario,
    validations: validations,
    validationSummary: { errors: errors, warnings: warns, ok: validations.length - errors - warns },
    requiredMissing: missing,
    previewAllowed: true,
    operationalPrintAllowed: false
  };
}

function nfeBuildAppPayloadPatch_(nota, dest, produtos, totais) {
  var itensDeclaracao = produtos.map(function (it) {
    return {
      descricao: it.descricao,
      quantidade: it.quantidade,
      valor: it.valorUnitario,
      codigo: it.codigo,
      ncm: it.ncm,
      cfop: it.cfop,
      unidade: it.unidade,
      valorTotal: it.valorTotal
    };
  });

  return {
    tipoDocumento: 'NF',
    numeroNotaFiscal: nota.numero || '',
    serieNotaFiscal: nota.serie || '',
    valorNotaFiscal: totais.valorTotalNota || nota.valorTotal || totais.valorTotalItens || 0,
    chaveNFe: nota.chaveAcesso || '',

    destinatarioNome: dest.nomeRazaoSocial || '',
    destinatarioCpfCnpj: nfeDigitsOnly_(dest.cpfCnpj),
    destinatarioCelular: nfeDigitsOnly_(dest.telefone),
    destinatarioEmail: '',
    destinatarioCep: nfeDigitsOnly_(dest.cep),
    destinatarioEndereco: dest.logradouro || '',
    destinatarioNumero: dest.numero || '',
    destinatarioComplemento: dest.complemento || '',
    destinatarioBairro: dest.bairro || '',
    destinatarioCidade: dest.municipio || '',
    destinatarioUf: dest.uf || '',

    itensDeclaracao: itensDeclaracao,
    valorDeclaradoSugerido: totais.valorTotalNota || totais.valorTotalItens || 0
  };
}
