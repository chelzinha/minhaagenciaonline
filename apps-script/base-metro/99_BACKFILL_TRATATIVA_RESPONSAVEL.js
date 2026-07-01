/**
 * 99_BACKFILL_TRATATIVA_RESPONSAVEL.js  (arquivo temporário de correção de dados)
 * ------------------------------------------------------------------------------
 * Preenche RESPONSAVEL_ID nas TRATATIVAS de PROSPECT que estão sem responsável,
 * herdando o responsável do próprio prospect na base (coluna RESPONSAVEL) e
 * resolvendo para o RESPONSAVEL_ID correto via aba CRM_RESPONSAVEIS
 * (aceita RESPONSAVEL_ID, USERNAME ou DISPLAY_NAME, sem acento e sem caixa).
 *
 * COMO USAR (no editor do Apps Script):
 *   1) Rode  agf_diagBackfill()      -> só relatório, NÃO grava nada. Veja o Log.
 *   2) Confira o relatório.
 *   3) Rode  agf_aplicarBackfill()   -> grava o RESPONSAVEL_ID nas tratativas vazias.
 *   4) Pode apagar este arquivo depois. Ele só preenche onde está VAZIO,
 *      nunca sobrescreve um responsável já existente.
 */

function agf_diagBackfill()    { return agf_backfillTratativaResponsavel_(false); }
function agf_aplicarBackfill() { return agf_backfillTratativaResponsavel_(true); }

// Normalizador local (minúsculo, sem acento) para não depender de outros módulos.
function agf_norm_(v) {
  v = (v === null || v === undefined) ? '' : String(v).trim();
  if (!v) return '';
  try { v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return v.toLowerCase();
}

// Mapa: token normalizado (id, username ou display) -> RESPONSAVEL_ID real.
function agf_respRealIdMap_() {
  var rows = crm3_readObjects_(CRM3_CFG.SHEETS.RESPONSAVEIS) || [];
  var map = {};
  rows.forEach(function (r) {
    var realId = crm3_text_(r.RESPONSAVEL_ID);
    if (!realId) return;
    [r.RESPONSAVEL_ID, r.USERNAME, r.DISPLAY_NAME].forEach(function (tok) {
      var k = agf_norm_(tok);
      if (k) map[k] = realId;
    });
  });
  return map;
}

function agf_backfillTratativaResponsavel_(apply) {
  return op_withDocumentLock_(function () {
    var ss = op_getSpreadsheet_();

    // 1) Base PROSPECTS: prospectId (normalizado) -> responsável (texto da base)
    var pSh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
    if (!pSh) throw new Error('Aba PROSPECTS não encontrada.');
    var pv = pSh.getDataRange().getValues();
    var phm = op_buildHeaderMap_(pv[0]);
    if (phm.PROSPECT_ID === undefined || phm.RESPONSAVEL === undefined) {
      throw new Error('Colunas PROSPECT_ID/RESPONSAVEL ausentes na aba PROSPECTS.');
    }
    var respByProspect = {};
    for (var i = 1; i < pv.length; i++) {
      var pid = agf_norm_(pv[i][phm.PROSPECT_ID]);
      if (pid) respByProspect[pid] = crm3_text_(pv[i][phm.RESPONSAVEL]);
    }

    // 2) Resolver responsável -> RESPONSAVEL_ID real
    var idMap = agf_respRealIdMap_();

    // 3) TRATATIVAS
    var tSh = ss.getSheetByName(CRM3_CFG.SHEETS.TRATATIVAS);
    if (!tSh) throw new Error('Aba de tratativas não encontrada.');
    var tv = tSh.getDataRange().getValues();
    var thm = op_buildHeaderMap_(tv[0]);
    ['TIPO_ENTIDADE', 'ENTIDADE_ID', 'RESPONSAVEL_ID'].forEach(function (h) {
      if (thm[h] === undefined) throw new Error('Coluna ' + h + ' ausente na aba de tratativas.');
    });

    var col = thm.RESPONSAVEL_ID;              // índice 0-based
    var colVals = tv.map(function (row) { return [row[col]]; }); // inclui o cabeçalho
    var changed = false;

    var s = { modo: apply ? 'APLICADO' : 'DRY-RUN (nada gravado)', totalProspect: 0, jaTinhamResponsavel: 0,
              preenchidas: 0, semProspectNaBase: 0, semResponsavelNaBase: 0, semMatchNoCadastro: 0, porResponsavel: {} };

    for (var j = 1; j < tv.length; j++) {
      if (crm3_upper_(tv[j][thm.TIPO_ENTIDADE]) !== 'PROSPECT') continue;
      s.totalProspect++;
      if (crm3_text_(tv[j][col])) { s.jaTinhamResponsavel++; continue; }

      var nome = respByProspect[agf_norm_(tv[j][thm.ENTIDADE_ID])];
      if (nome === undefined) { s.semProspectNaBase++; continue; }
      if (!crm3_text_(nome)) { s.semResponsavelNaBase++; continue; }

      var realId = idMap[agf_norm_(nome)];
      if (!realId) { s.semMatchNoCadastro++; continue; }

      s.porResponsavel[realId] = (s.porResponsavel[realId] || 0) + 1;
      s.preenchidas++;
      if (apply) { colVals[j][0] = realId; changed = true; }
    }

    if (apply && changed) {
      tSh.getRange(1, col + 1, colVals.length, 1).setValues(colVals);
      try { op_invalidateOperationCaches_(); } catch (_) {}
    }

    Logger.log(JSON.stringify(s, null, 2));
    return s;
  });
}