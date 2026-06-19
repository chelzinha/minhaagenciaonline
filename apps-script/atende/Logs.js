// ============================================================
//  LOGS DE IMPORTACAO E ERROS
//  Nao registra payload completo nem dados pessoais completos.
// ============================================================

function salvarRawJson_(sheetName, origem, jsonString, resumo) {
  var text = safe_(jsonString);
  var hash = hashText_(text);
  var resumoSeguro = Object.assign({}, resumo || {}, {
    payloadChars: text.length,
    rawArmazenado: false,
    motivo: 'Payload completo nao armazenado para evitar erro de tamanho e exposicao de dados sensiveis.',
  });

  appendRows_(sheetName, [[
    new Date(),
    origem,
    hash,
    JSON.stringify(resumoSeguro),
    '[RAW_JSON_NAO_ARMAZENADO] hash=' + hash + ' chars=' + text.length,
  ]]);
}

function registrarLogImportacao_(tipo, info) {
  try {
    var data = info || {};
    appendRows_(ATENDE_CONFIG.SHEETS.LOG_IMPORTACOES, [[
      new Date(),
      tipo,
      data.status || '',
      sanitizeLogText_(data.mensagem || ''),
      data.totalAtendimentos || '',
      data.totalObjetos || '',
      data.criados || '',
      data.atualizados || '',
      data.ignorados || '',
      data.hash || '',
    ]]);
  } catch (err) {
    console.log('Falha ao registrar log seguro: ' + (err.message || err));
  }
}

function registrarErro_(contexto, err, detalhe) {
  try {
    var safeDetail = sanitizeLogText_(JSON.stringify(detalhe || {}));
    appendRows_(ATENDE_CONFIG.SHEETS.ERROS, [[
      new Date(),
      contexto,
      sanitizeLogText_(err && err.message ? err.message : String(err)),
      safeDetail,
    ]]);
  } catch (logErr) {
    console.log('Falha ao registrar erro seguro: ' + (logErr.message || logErr));
  }
}

function erroResposta_(err) {
  return {
    ok: false,
    error: sanitizeLogText_(err && err.message ? err.message : String(err)),
  };
}

function hashText_(text) {
  var raw = safe_(text);
  if (!raw) return '';
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return digest.map(function(byte) {
    var value = (byte < 0 ? byte + 256 : byte).toString(16);
    return value.length === 1 ? '0' + value : value;
  }).join('');
}

