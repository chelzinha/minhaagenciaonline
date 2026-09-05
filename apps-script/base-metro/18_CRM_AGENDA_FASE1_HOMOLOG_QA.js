/**
 * 18_CRM_AGENDA_FASE1_HOMOLOG_QA.gs
 * ------------------------------------------------------------
 * Helper temporario de QA integrado da Agenda Fase 1.
 *
 * SEGURANCA:
 * - recusa execucao quando o Apps Script estiver apontando para producao;
 * - usa somente dados sinteticos da base HOMOLOG;
 * - cria e remove uma atividade AVULSA de teste;
 * - valida que AVULSA nao cria Tratativa, Interacao ou Evento;
 * - valida DURACAO_PADRAO_MIN via ATV_LIGACAO;
 * - valida que um tipo com APLICA_AVULSA=NAO continua bloqueado.
 */

function qaAgendaFase1HomologAvulsa() {
  var ambiente = op_ambienteAtual();
  if (!ambiente || ambiente.ambiente !== 'HOMOLOGACAO') {
    throw new Error('QA BLOQUEADO: esta funcao so pode rodar em HOMOLOGACAO.');
  }

  var schema = auditCrmAgendaAvulsaFase1Schema();
  if (!schema || !schema.ok) {
    throw new Error('QA BLOQUEADO: schema AVULSA incompleto.');
  }

  var ss = op_getSpreadsheet_();
  function countRows_(sheetName) {
    var sh = ss.getSheetByName(sheetName);
    return sh ? Math.max(0, sh.getLastRow() - 1) : 0;
  }

  var before = {
    tratativas: countRows_(CRM3_CFG.SHEETS.TRATATIVAS),
    interacoes: countRows_(CRM3_CFG.SHEETS.INTERACOES),
    eventos: countRows_(CRM3_CFG.SHEETS.EVENTOS),
    agenda: countRows_(CRM3_CFG.SHEETS.AGENDA)
  };

  var requestId = 'QA_AVULSA_' + Utilities.getUuid().slice(0, 10).toUpperCase();
  var today = op_toYmd_(new Date());
  var title = 'QA AVULSA FASE 1';
  var created = crm3_apiSaveAtividade_({
    tipoEntidade: 'AVULSA',
    titulo: title,
    tipoAtividadeId: 'ATV_LIGACAO',
    dataProgramada: today,
    horaProgramada: '10:00',
    local: 'Sala QA',
    responsavelId: 'RSP_QA_VEND',
    responsavel: 'Vendedor QA',
    requestId: requestId,
    createdBy: 'QA_HOMOLOG',
    updatedBy: 'QA_HOMOLOG'
  });

  if (!created || !created.ok || !created.agendaId) {
    throw new Error('QA FALHOU: criacao AVULSA nao retornou agendaId.');
  }

  var record = crm3_findRowObject_(CRM3_CFG.SHEETS.AGENDA, 'AGENDA_ID', created.agendaId);
  if (!record) throw new Error('QA FALHOU: atividade AVULSA criada nao foi encontrada na Agenda.');

  var obj = record.obj || {};
  if (crm3_upper_(obj.ENTIDADE_TIPO) !== 'AVULSA') throw new Error('QA FALHOU: ENTIDADE_TIPO diferente de AVULSA.');
  if (crm3_text_(obj.ENTIDADE_ID)) throw new Error('QA FALHOU: AVULSA gravou ENTIDADE_ID.');
  if (crm3_text_(obj.TRATATIVA_ID)) throw new Error('QA FALHOU: AVULSA gravou TRATATIVA_ID.');
  if (crm3_text_(obj.CLIENTE_ID) || crm3_text_(obj.PROSPECT_ID)) throw new Error('QA FALHOU: AVULSA gravou vinculo de Cliente/Prospect.');
  if (crm3_text_(obj.TITULO) !== title) throw new Error('QA FALHOU: TITULO nao foi persistido corretamente.');
  if (Number(obj.DURACAO_MIN || 0) !== 15) throw new Error('QA FALHOU: duracao padrao da Ligacao deveria ser 15 min.');

  var during = {
    tratativas: countRows_(CRM3_CFG.SHEETS.TRATATIVAS),
    interacoes: countRows_(CRM3_CFG.SHEETS.INTERACOES),
    eventos: countRows_(CRM3_CFG.SHEETS.EVENTOS),
    agenda: countRows_(CRM3_CFG.SHEETS.AGENDA)
  };

  if (during.tratativas !== before.tratativas) throw new Error('QA FALHOU: AVULSA criou Tratativa.');
  if (during.interacoes !== before.interacoes) throw new Error('QA FALHOU: AVULSA criou CRM_INTERACOES.');
  if (during.eventos !== before.eventos) throw new Error('QA FALHOU: AVULSA criou CRM_EVENTOS.');
  if (during.agenda !== before.agenda + 1) throw new Error('QA FALHOU: AGENDA_EXECUCAO nao recebeu exatamente uma linha.');

  var blockedType = false;
  try {
    crm3_apiSaveAtividade_({
      tipoEntidade: 'AVULSA',
      titulo: 'QA TIPO BLOQUEADO',
      tipoAtividadeId: 'ATV_TREINAMENTO',
      dataProgramada: today,
      horaProgramada: '11:00',
      local: 'Sala QA',
      responsavelId: 'RSP_QA_VEND',
      responsavel: 'Vendedor QA',
      requestId: 'QA_BLOCK_' + Utilities.getUuid().slice(0, 10).toUpperCase()
    });
  } catch (eBlocked) {
    blockedType = true;
  }
  if (!blockedType) throw new Error('QA FALHOU: tipo com APLICA_AVULSA=NAO foi aceito.');

  var deleted = crm3_apiDeleteAtividade_({
    agendaId: created.agendaId,
    responsavelId: 'RSP_QA_VEND',
    motivo: 'Limpeza automatica do QA HOMOLOG'
  });
  if (!deleted || !deleted.ok || !deleted.deleted) throw new Error('QA FALHOU: atividade AVULSA de teste nao foi removida.');

  var after = {
    tratativas: countRows_(CRM3_CFG.SHEETS.TRATATIVAS),
    interacoes: countRows_(CRM3_CFG.SHEETS.INTERACOES),
    eventos: countRows_(CRM3_CFG.SHEETS.EVENTOS),
    agenda: countRows_(CRM3_CFG.SHEETS.AGENDA)
  };

  if (after.tratativas !== before.tratativas) throw new Error('QA FALHOU: contagem final de Tratativas divergiu.');
  if (after.interacoes !== before.interacoes) throw new Error('QA FALHOU: contagem final de Interacoes divergiu.');
  if (after.eventos !== before.eventos) throw new Error('QA FALHOU: contagem final de Eventos divergiu.');
  if (after.agenda !== before.agenda) throw new Error('QA FALHOU: limpeza da Agenda nao restaurou a contagem inicial.');

  var result = {
    ok: true,
    ambiente: ambiente.ambiente,
    schema: schema,
    checks: {
      criouAvulsaSemEntidade: true,
      naoCriouTratativa: true,
      naoCriouInteracao: true,
      naoCriouEvento: true,
      duracaoPadraoLigacao15: true,
      treinamentoBloqueadoPorConfig: true,
      limpezaConcluida: true
    },
    before: before,
    during: during,
    after: after,
    message: 'QA integrado AVULSA aprovado em HOMOLOGACAO.'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
