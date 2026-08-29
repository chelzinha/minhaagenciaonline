/**
 * 17_CRM_AGENDA_AVULSA_FASE1.gs
 * ------------------------------------------------------------
 * Fase 1 — fundacao tecnica da Agenda AVULSA.
 *
 * Objetivo deste arquivo:
 * - aplicar somente a evolucao aditiva de schema necessaria para AVULSA;
 * - nao criar Cliente, Prospect ou Tratativa artificial;
 * - nao executar seeds, migracoes amplas ou alteracoes destrutivas;
 * - permitir execucao idempotente e auditavel em producao.
 */

var CRM_AGENDA_AVULSA_F1 = {
  VERSION: '1.0.0',
  AGENDA_HEADERS: ['TITULO'],
  ACTIVITY_TYPE_HEADERS: ['APLICA_AVULSA']
};

/**
 * Adiciona os cabecalhos da Fase 1 sem alterar linhas existentes.
 * Pode ser executada mais de uma vez com seguranca.
 */
function setupCrmAgendaAvulsaFase1() {
  return op_withDocumentLock_(function () {
    var ss = op_getSpreadsheet_();
    var updated = [];

    var agendaResult = crm2_appendMissingHeaders_(
      ss,
      CRM3_CFG.SHEETS.AGENDA,
      CRM_AGENDA_AVULSA_F1.AGENDA_HEADERS
    );
    if (agendaResult.addedHeaders.length) {
      updated.push({
        sheet: CRM3_CFG.SHEETS.AGENDA,
        addedHeaders: agendaResult.addedHeaders
      });
    }

    var typeResult = crm2_appendMissingHeaders_(
      ss,
      CRM3_CFG.SHEETS.TIPOS_ATIVIDADE,
      CRM_AGENDA_AVULSA_F1.ACTIVITY_TYPE_HEADERS
    );
    if (typeResult.addedHeaders.length) {
      updated.push({
        sheet: CRM3_CFG.SHEETS.TIPOS_ATIVIDADE,
        addedHeaders: typeResult.addedHeaders
      });
    }

    // A Agenda usa revisao de dados; os tipos de atividade usam revisao
    // propria de configuracao no PERF V5. Invalidar somente o necessario.
    if (typeof crm3_bumpCacheRev_ === 'function') crm3_bumpCacheRev_();
    if (typeof crm5x_bumpConfigRev_ === 'function') crm5x_bumpConfigRev_();

    return {
      ok: true,
      version: CRM_AGENDA_AVULSA_F1.VERSION,
      updated: updated,
      schema: auditCrmAgendaAvulsaFase1Schema_(),
      message: updated.length
        ? 'Schema da Agenda AVULSA atualizado de forma aditiva.'
        : 'Schema da Agenda AVULSA ja estava atualizado.'
    };
  });
}

/**
 * Auditoria somente de cabecalhos. Nao grava dados.
 */
function auditCrmAgendaAvulsaFase1Schema() {
  return auditCrmAgendaAvulsaFase1Schema_();
}

function auditCrmAgendaAvulsaFase1Schema_() {
  var ss = op_getSpreadsheet_();
  var agenda = ss.getSheetByName(CRM3_CFG.SHEETS.AGENDA);
  var tipos = ss.getSheetByName(CRM3_CFG.SHEETS.TIPOS_ATIVIDADE);

  var agendaHeaders = agenda && agenda.getLastColumn()
    ? agenda.getRange(1, 1, 1, agenda.getLastColumn()).getValues()[0].map(function (x) { return String(x || '').trim(); })
    : [];
  var typeHeaders = tipos && tipos.getLastColumn()
    ? tipos.getRange(1, 1, 1, tipos.getLastColumn()).getValues()[0].map(function (x) { return String(x || '').trim(); })
    : [];

  var hasTitle = agendaHeaders.indexOf('TITULO') >= 0;
  var hasAplicaAvulsa = typeHeaders.indexOf('APLICA_AVULSA') >= 0;

  return {
    ok: hasTitle && hasAplicaAvulsa,
    agenda: {
      sheet: CRM3_CFG.SHEETS.AGENDA,
      hasTitulo: hasTitle
    },
    tiposAtividade: {
      sheet: CRM3_CFG.SHEETS.TIPOS_ATIVIDADE,
      hasAplicaAvulsa: hasAplicaAvulsa
    }
  };
}
