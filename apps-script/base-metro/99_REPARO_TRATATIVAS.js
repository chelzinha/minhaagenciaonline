/* ============================================================
 * REPARO E LIMPEZA DE TRATATIVAS  (v2 - corrigido)
 *
 * CORRECAO DA v1: a versao anterior tentava criar tratativa para TODOS os
 * clientes, ignorando a regra do proprio sistema
 * (CRM3_CFG.ACTIONABLE_RECOMMENDATIONS), e gravava item a item em vez de
 * em lote. Resultado: 47 tratativas de CLIENTE criadas indevidamente e
 * estouro do tempo de execucao.
 *
 * Esta versao:
 *   - Remove a criacao em massa de clientes (para isso ja existe
 *     migrateTratativasFase3(), com a regra de negocio correta)
 *   - Trata apenas PROSPECTS, que era o bug real
 *   - Grava em lote, com crm3_appendObjects_
 *   - Traz a limpeza do que a v1 criou errado
 *
 * ORDEM DE USO:
 *   1. limpeza_previa()      -> so lista o que seria removido
 *   2. Copia de seguranca da planilha
 *   3. limpeza_aplicar()     -> remove as tratativas de CLIENTE do reparo
 *   4. reparo_prospects_diagnosticar()  -> confere se sobrou prospect orfao
 *   5. reparo_prospects_aplicar()       -> se necessario
 * ============================================================ */

var REPARO_CFG = {
  ORIGEM_REPARO: 'REPARO_TRATATIVAS',
  LOTE_MAX: 300
};

/* ============================================================
 * PARTE 1 - LIMPEZA DAS TRATATIVAS DE CLIENTE CRIADAS ERRADO
 * ============================================================ */

/* Somente leitura. Lista o que a limpeza vai remover. */
function limpeza_previa() {
  var alvo = limpeza_levantarAlvo_();
  Logger.log('===== PREVIA DA LIMPEZA =====');
  Logger.log('Tratativas de CLIENTE com ORIGEM=' + REPARO_CFG.ORIGEM_REPARO + ': ' + alvo.length);
  Logger.log('(as de PROSPECT sao mantidas - aquelas estao corretas)');
  alvo.slice(0, 30).forEach(function (a) {
    Logger.log('  linha ' + a.rowNumber + ' | ' + a.tratativaId + ' | cliente ' + a.entidadeId);
  });
  if (alvo.length > 30) Logger.log('  ... e mais ' + (alvo.length - 30));
  return { remover: alvo.length };
}

/* Remove as tratativas de CLIENTE criadas pelo reparo v1 e limpa o
 * TRATATIVA_ATIVA_ID que ficou apontando para elas. */
function limpeza_aplicar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('Outra execucao em andamento. Tente novamente.');
    return { ok: false, motivo: 'lock' };
  }
  try {
    var alvo = limpeza_levantarAlvo_();
    if (!alvo.length) {
      Logger.log('Nada a remover.');
      return { ok: true, removidas: 0 };
    }

    var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.TRATATIVAS);

    /* Apaga de baixo para cima: assim os numeros de linha nao se deslocam. */
    var ordenado = alvo.slice().sort(function (a, b) { return b.rowNumber - a.rowNumber; });
    for (var i = 0; i < ordenado.length; i++) {
      sh.deleteRow(ordenado[i].rowNumber);
    }
    Logger.log('Tratativas removidas: ' + ordenado.length);

    /* Limpa o ponteiro TRATATIVA_ATIVA_ID nos cadastros afetados. */
    var limpos = 0, naoAchados = 0;
    var idsRemovidos = {};
    alvo.forEach(function (a) { idsRemovidos[a.tratativaId] = a.entidadeId; });

    Object.keys(idsRemovidos).forEach(function (tid) {
      try {
        var rec = crm3_findRowObject_(CRM3_CFG.SHEETS.CADASTRO, 'CLIENTE_ID', idsRemovidos[tid]);
        if (!rec) { naoAchados++; return; }
        if (crm3_text_(rec.obj['TRATATIVA_ATIVA_ID']) === crm3_text_(tid)) {
          crm3_patchRowObject_(rec, { TRATATIVA_ATIVA_ID: '' });
          limpos++;
        }
      } catch (e) {
        Logger.log('  ponteiro nao limpo para ' + idsRemovidos[tid] + ': ' + e);
      }
    });

    Logger.log('Ponteiros TRATATIVA_ATIVA_ID limpos: ' + limpos);
    if (naoAchados) Logger.log('Cadastros nao localizados: ' + naoAchados);

    crm3_bumpCacheRev_();
    op_invalidateOperationCaches_();

    Logger.log('===== LIMPEZA CONCLUIDA =====');
    Logger.log('Os eventos em CRM_EVENTOS foram MANTIDOS de proposito:');
    Logger.log('sao registro historico, e apagar historico e pior que deixar.');

    return { ok: true, removidas: ordenado.length, ponteirosLimpos: limpos };
  } finally {
    lock.releaseLock();
  }
}

function limpeza_levantarAlvo_() {
  crm3_assertSetupReady_();
  var sh = op_getSpreadsheet_().getSheetByName(CRM3_CFG.SHEETS.TRATATIVAS);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var hm = crm3_headerMap_(values[0]);

  var cOrigem = hm[op_headerKey_('ORIGEM')];
  var cTipo = hm[op_headerKey_('TIPO_ENTIDADE')];
  var cId = hm[op_headerKey_('TRATATIVA_ID')];
  var cEnt = hm[op_headerKey_('ENTIDADE_ID')];
  if (cOrigem === undefined || cTipo === undefined) return [];

  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (crm3_text_(values[i][cOrigem]) !== REPARO_CFG.ORIGEM_REPARO) continue;
    if (crm3_upper_(values[i][cTipo]) !== 'CLIENTE') continue; /* prospects ficam */
    out.push({
      rowNumber: i + 1,
      tratativaId: crm3_text_(values[i][cId]),
      entidadeId: crm3_text_(values[i][cEnt])
    });
  }
  return out;
}

/* ============================================================
 * PARTE 2 - REPARO DE PROSPECTS (o bug real), EM LOTE
 * ============================================================ */

/* Somente leitura. */
function reparo_prospects_diagnosticar() {
  var f = reparo_prospects_levantar_();
  Logger.log('===== PROSPECTS SEM TRATATIVA =====');
  Logger.log('  faltantes : ' + f.faltantes.length);
  Logger.log('  ja com     : ' + f.ok);
  Logger.log('  ignorados  : ' + f.ignorados + ' (excluidos)');
  f.faltantes.slice(0, 30).forEach(function (p) {
    Logger.log('  ' + p.id + ' | ' + p.nome + ' | etapa: ' + (p.etapa || '(padrao)'));
  });
  if (f.faltantes.length > 30) Logger.log('  ... e mais ' + (f.faltantes.length - 30));
  return { faltantes: f.faltantes.length };
}

/* Cria as tratativas faltantes de PROSPECT em uma unica gravacao em lote. */
function reparo_prospects_aplicar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('Outra execucao em andamento.');
    return { ok: false, motivo: 'lock' };
  }
  try {
    var f = reparo_prospects_levantar_();
    var lista = f.faltantes;
    if (!lista.length) {
      Logger.log('Nenhum prospect orfao. Nada a fazer.');
      return { ok: true, criadas: 0 };
    }
    if (lista.length > REPARO_CFG.LOTE_MAX) {
      Logger.log('Muitos itens (' + lista.length + '). Rode de novo apos este lote.');
      lista = lista.slice(0, REPARO_CFG.LOTE_MAX);
    }

    var funilId = CRM3_CFG.FUNIL_PROSPECTS;
    var etapaPadrao = crm3_defaultStageForFunnel_(funilId);
    var now = op_nowIso_();
    var rows = [], eventos = [], snapshots = [];

    lista.forEach(function (p) {
      var etapa = p.etapa || etapaPadrao;
      try { crm3_validateStageForFunnel_(etapa, funilId); }
      catch (e) { etapa = etapaPadrao; }

      var id = 'TRT_' + Utilities.getUuid().slice(0, 8).toUpperCase();
      rows.push(crm3_newTreatmentObject_({
        id: id, tipoEntidade: 'PROSPECT', entidadeId: p.id, funilId: funilId,
        etapaId: etapa, origem: REPARO_CFG.ORIGEM_REPARO,
        responsavelId: p.responsavelId || '', now: now
      }));
      eventos.push(crm3_eventObject_({
        entidadeTipo: 'PROSPECT', entidadeId: p.id, tratativaId: id,
        tipoEvento: 'TRATATIVA_CRIADA', valorNovo: etapa,
        origem: REPARO_CFG.ORIGEM_REPARO
      }));
      snapshots.push({ id: p.id, tratativaId: id });
    });

    /* Uma unica gravacao por aba, em vez de uma por item. */
    crm3_appendObjects_(CRM3_CFG.SHEETS.TRATATIVAS, rows);
    crm3_appendEventsBatch_(eventos);

    var ponteiros = 0;
    snapshots.forEach(function (s) {
      try {
        if (crm3_updateEntityTreatmentSnapshot_('PROSPECT', s.id, { TRATATIVA_ATIVA_ID: s.tratativaId })) ponteiros++;
      } catch (e) { }
    });

    crm3_bumpCacheRev_();
    op_invalidateOperationCaches_();

    Logger.log('===== REPARO DE PROSPECTS CONCLUIDO =====');
    Logger.log('  tratativas criadas : ' + rows.length);
    Logger.log('  ponteiros gravados : ' + ponteiros);
    Logger.log('  restantes          : ' + Math.max(0, f.faltantes.length - rows.length));

    return { ok: true, criadas: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function reparo_prospects_levantar_() {
  crm3_assertSetupReady_();

  var tratativas = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS);
  var jaTem = {};
  tratativas.forEach(function (t) {
    if (crm3_upper_(t.TIPO_ENTIDADE) !== 'PROSPECT') return;
    var eid = crm3_text_(t.ENTIDADE_ID);
    if (eid) jaTem[eid] = true;
  });

  var prospects = crm3_readObjects_(CRM3_CFG.SHEETS.PROSPECTS);
  var faltantes = [], ok = 0, ignorados = 0;

  prospects.forEach(function (p) {
    var id = crm3_text_(p.PROSPECT_ID);
    if (!id) return;
    if (crm3_upper_(p.STATUS_PROSPECT || '').indexOf('EXCLU') === 0) { ignorados++; return; }
    if (jaTem[id]) { ok++; return; }
    faltantes.push({
      id: id,
      nome: crm3_text_(p.CLIENTE || p.NOME_FANTASIA) || '(sem nome)',
      etapa: crm3_text_(p.ETAPA_FUNIL || ''),
      responsavelId: crm3_text_(p.RESPONSAVEL_ID || '')
    });
  });

  return { faltantes: faltantes, ok: ok, ignorados: ignorados };
}

/* ============================================================
 * AUDITORIA - somente leitura, use quando quiser conferir
 * ============================================================ */
function auditar_tratativas() {
  var t = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS);
  var porOrigem = {}, porTipo = { CLIENTE: 0, PROSPECT: 0 };
  t.forEach(function (x) {
    var o = crm3_text_(x.ORIGEM) || '(vazio)';
    porOrigem[o] = (porOrigem[o] || 0) + 1;
    var tp = crm3_upper_(x.TIPO_ENTIDADE);
    if (porTipo[tp] !== undefined) porTipo[tp]++;
  });
  Logger.log('Total: ' + t.length);
  Logger.log('Por tipo: CLIENTE=' + porTipo.CLIENTE + ' PROSPECT=' + porTipo.PROSPECT);
  Object.keys(porOrigem).sort().forEach(function (k) {
    Logger.log('  ORIGEM=' + k + ': ' + porOrigem[k]);
  });
  return { total: t.length, porOrigem: porOrigem, porTipo: porTipo };
}
