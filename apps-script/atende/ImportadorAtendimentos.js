// ============================================================
//  IMPORTADOR - JSON DE ATENDIMENTOS/RESUMO
// ============================================================

function processarAtendimentos(jsonString) {
  return importarAtendimentosCorreiosAtende_(jsonString, { origem: 'manual-front' });
}

function importarAtendimentosCorreiosAtende_(jsonString, options) {
  var lock = LockService.getScriptLock();
  var origem = (options && options.origem) || 'manual';
  try {
    lock.waitLock(30000);
    ensureAtendeStructure_(getAtendeSpreadsheet_());
    var roots = parseJsonRoots_(jsonString);
    var atendimentos = collectPayloadItems_(roots, isAtendimentoRecord_);
    var records = normalizarAtendimentosParaPostagens_(atendimentos);
    salvarRawJson_(ATENDE_CONFIG.SHEETS.RAW_ATENDIMENTOS, origem, jsonString, {
      atendimentos: atendimentos.length,
      objetos: records.length,
    });

    var result = upsertPostagens_(records);
    registrarLogImportacao_('atendimentos', {
      status: 'ok',
      totalAtendimentos: atendimentos.length,
      totalObjetos: records.length,
      criados: result.created,
      atualizados: result.updated,
      ignorados: result.skipped,
      hash: hashText_(jsonString),
    });

    return buildImportResponse_(result, {
      updated: result.created + result.updated,
      total: records.length,
    });
  } catch (err) {
    registrarErro_('importarAtendimentosCorreiosAtende', err, {
      origem: origem,
      hash: hashText_(jsonString),
    });
    return erroResposta_(err);
  } finally {
    releaseLockQuietly_(lock);
  }
}

function normalizarAtendimentosParaPostagens_(atendimentos) {
  var records = [];
  atendimentos.forEach(function(atendimento) {
    var pagamento = firstObject_(firstArray_(atendimento.pagamentos)[0]);
    var formaPagamento = firstText_(pagamento.formaPagamento, pagamento.tipo, atendimento.formaPagamento).trim();
    var dataAtendimento = parseDateTimeValue_(firstText_(
      atendimento.dataHoraAtual,
      atendimento.dataHora,
      atendimento.data,
      atendimento.dtAtendimento
    ));

    firstArray_(atendimento.itens).forEach(function(item) {
      var objeto = normalizeObjectCode_(firstText_(item.codigoObjeto, item.codObjeto));
      if (!objeto) return;

      records.push({
        'Data': dataAtendimento || '',
        'Atendente': firstText_(
          atendimento.idCorreiosAtendente,
          atendimento.idAtendente,
          atendimento.atendente
        ).trim(),
        'Objeto': objeto,
        'codigo': firstText_(item.codigo, item.codigoAtendimento).trim(),
        'descricao': firstText_(item.descricao, item.descricaoAtendimento).trim(),
        'Valor': firstNumber_(item.valor, atendimento.valorTotal),
        'Forma Pagamento': formaPagamento,
        'tipo': firstText_(atendimento.tipo).trim(),
        'formaPagamento': formaPagamento,
      });
    });
  });
  return records;
}

function isAtendimentoRecord_(value) {
  if (!isObj_(value)) return false;
  var itens = firstArray_(value.itens);
  if (!itens.length) return false;
  var hasMetadata = (
    value.dataHoraAtual != null ||
    value.idCorreiosAtendente != null ||
    value.tipo != null ||
    Array.isArray(value.pagamentos)
  );
  var hasObjectItem = itens.some(function(item) {
    return isObj_(item) && normalizeObjectCode_(firstText_(item.codigoObjeto, item.codObjeto));
  });
  return hasMetadata && hasObjectItem;
}
