/**
 * 15_LIFECYCLE_ENGINE.gs
 * ============================================================
 * Motor de Ciclo de Vida do Cliente
 * Cole este arquivo SEPARADO no Apps Script da planilha "Total CF + Metro"
 * (NÃO substitui nenhum arquivo existente — é um arquivo NOVO adicional)
 *
 * Integra com: 10_OPERACAO_EXECUCAO_API.gs
 * Requer: aba CRM_TRANSICOES na planilha (criada pelo setupTransicoes_)
 *
 * COMO INSTALAR:
 * 1. Na planilha "Total CF + Metro" → Apps Script
 * 2. Clique "+" para adicionar novo arquivo .gs
 * 3. Renomeie para "15_LIFECYCLE_ENGINE"
 * 4. Cole este código
 * 5. Rode setupTransicoes() uma vez para criar a aba
 ============================================================*/

/* ==================== CONFIG ==================== */

var LC_CFG = {
  SHEET_TRANSICOES: 'CRM_TRANSICOES',
  FOLLOW_UP_DAYS: {
    'PROPOSTA_APRESENTADA': 3,
    'CLIENTE_INTERESSADO': 2,
    'PROPOSTA_ACEITA': 2,
    'CONTRATO_FECHADO': 7,
    'NAO_ENCONTRADO': 1,
    'REAGENDADO': 0,
    'SEM_INTERESSE': 30
  },
  CACHE_SEC: 3600
};

/* ==================== SETUP DA ABA TRANSIÇÕES ==================== */

/**
 * Cria a aba CRM_TRANSICOES com a tabela de regras editável.
 * Rode UMA VEZ pelo editor ou menu.
 */
function setupTransicoes() {
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(LC_CFG.SHEET_TRANSICOES);
  if (!sh) sh = ss.insertSheet(LC_CFG.SHEET_TRANSICOES);
  sh.clear();

  // Título
  sh.getRange('A1').setValue('⚡ MOTOR DE CICLO DE VIDA — Tabela de Transições')
    .setFontSize(13).setFontWeight('bold').setFontColor('#00416B');
  sh.getRange('A2').setValue('Quando uma atividade é concluída, o resultado define o que acontece com o cliente. Edite esta tabela para ajustar.')
    .setFontColor('#666').setFontStyle('italic');

  // Headers
  var headers = [
    'ATIVA',           // A — SIM/NÃO
    'RESULTADO',       // B — valor que vem da baixa
    'NOVO_STATUS',     // C — STATUS_COMERCIAL que será gravado
    'PROXIMA_ACAO',    // D — PROXIMA_ACAO_MANUAL
    'DIAS_FOLLOWUP',   // E — dias para follow-up (0 = sem prazo)
    'NOVA_ACAO_FUNIL', // F — se deve mudar ACAO (vazio = não mudar)
    'DESCRICAO'        // G — explicação humana
  ];
  sh.getRange(4, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#00416B').setFontColor('#FFFFFF');

  // Regras padrão
  var rules = [
    ['SIM', 'CONTRATO_FECHADO',    'CONTRATO ATIVO',      'Acompanhar em 30 dias',            30, 'FIDELIZAR', 'Cliente assinou contrato — migra para fidelização'],
    ['SIM', 'PROPOSTA_ACEITA',     'CONTRATO EM PROCESSO','Enviar contrato para assinatura',    2, 'CONVERTER', 'Proposta aceita — formalizar contrato'],
    ['SIM', 'PROPOSTA_APRESENTADA','PROPOSTA PENDENTE',   'Follow-up da proposta',              3, 'CONVERTER', 'Proposta entregue — acompanhar resposta'],
    ['SIM', 'CLIENTE_INTERESSADO', 'EM NEGOCIACAO',       'Enviar proposta comercial',          2, 'CONVERTER', 'Demonstrou interesse — aquecer negociação'],
    ['SIM', 'SEM_INTERESSE',       'SEM INTERESSE',       'Revisitar em 30 dias',             30, 'MANTER',    'Não quer agora — manter relacionamento mínimo'],
    ['SIM', 'NAO_ENCONTRADO',      'TENTATIVA S/ CONTATO','Tentar novo contato',                1, '',          'Não estava no local — tentar novamente'],
    ['SIM', 'REAGENDADO',          'REAGENDADO',          'Agendar novo contato',              0, '',          'Cliente pediu nova data'],
    ['SIM', 'CONCLUIDO',           '',                    '',                                  0, '',          'Genérico — sem mudança automática']
  ];
  sh.getRange(5, 1, rules.length, headers.length).setValues(rules);

  // Formatação
  sh.getRange(5, 1, rules.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange(5, 5, rules.length, 1).setHorizontalAlignment('center');

  // Cores por ação do funil
  var acColors = {
    'FIDELIZAR': '#E8F5E9', 'CONVERTER': '#FFF3E0',
    'RESGATAR': '#FCE4EC', 'MANTER': '#F5F5F5'
  };
  for (var i = 0; i < rules.length; i++) {
    var acao = rules[i][5];
    if (acao && acColors[acao]) {
      sh.getRange(5 + i, 6).setBackground(acColors[acao]).setFontWeight('bold');
    }
  }

  // Larguras
  sh.setColumnWidth(1, 55);
  sh.setColumnWidth(2, 190);
  sh.setColumnWidth(3, 180);
  sh.setColumnWidth(4, 220);
  sh.setColumnWidth(5, 80);
  sh.setColumnWidth(6, 120);
  sh.setColumnWidth(7, 350);
  sh.setFrozenRows(4);
  sh.setTabColor('#CD992B');

  try { op_cacheRemoveSafe_('op_transicoes_v1'); } catch(e) {}
  try { ss.toast('Aba CRM_TRANSICOES criada com ' + rules.length + ' regras.', '✅', 5); } catch(e) {}
}

/* ==================== MOTOR PRINCIPAL ==================== */

/**
 * Atualiza o ciclo de vida do cliente com base no resultado da interação.
 * Chamada automaticamente por op_apiUpdateAgendaStatus_().
 *
 * @param {string} clienteId — ID do cliente (CLI_XXXXXX)
 * @param {string} resultado — resultado da interação (PROPOSTA_APRESENTADA etc.)
 * @param {string} tipoInteracao — ligação, visita presencial, WhatsApp etc.
 */

function op_defaultClientTransition_(resultadoUpper, ctx){
  var r = op_upperNoAccents_(resultadoUpper || '').replace(/\s+/g,'_');
  var opp = op_upperNoAccents_((ctx && ctx.oportunidadePrincipal) || '').replace(/\s+/g,'_');
  if (r === 'PROPOSTA_APRESENTADA' || r === 'CLIENTE_INTERESSADO' || r === 'PROPOSTA_ACEITA') {
    return { novoStatus: r === 'PROPOSTA_APRESENTADA' ? 'PROPOSTA PENDENTE' : (r === 'PROPOSTA_ACEITA' ? 'CONTRATO EM PROCESSO' : 'EM NEGOCIAÇÃO'), proximaAcao: r === 'PROPOSTA_ACEITA' ? 'Enviar contrato para assinatura' : 'Enviar proposta comercial', diasFollowup: r === 'PROPOSTA_APRESENTADA' ? 3 : 2, novaAcaoFunil: 'CONVERTER' };
  }
  if (r === 'CONTRATO_FECHADO') {
    return { novoStatus: 'CONTRATO ATIVO', proximaAcao: 'Acompanhar em 30 dias', diasFollowup: 30, novaAcaoFunil: 'FIDELIZAR' };
  }
  if (r === 'SEM_INTERESSE') {
    var nova = opp === 'SEM_OPORTUNIDADE_AGORA' ? 'CANCELAR' : 'MANTER';
    return { novoStatus: 'SEM INTERESSE', proximaAcao: nova === 'CANCELAR' ? '' : 'Revisitar em 60 dias', diasFollowup: nova === 'CANCELAR' ? 0 : 60, novaAcaoFunil: nova };
  }
  return null;
}

function syncTransicoesPadrao(){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(LC_CFG.SHEET_TRANSICOES);
  if (!sh) { setupTransicoes(); return {ok:true, message:'Tabela criada'}; }
  var wanted = {
    'CONTRATO_FECHADO':['SIM','CONTRATO_FECHADO','CONTRATO ATIVO','Acompanhar em 30 dias',30,'FIDELIZAR','Cliente assinou contrato — migra para fidelização'],
    'PROPOSTA_APRESENTADA':['SIM','PROPOSTA_APRESENTADA','PROPOSTA PENDENTE','Follow-up da proposta',3,'CONVERTER','Proposta entregue — acompanhar resposta em 3 dias'],
    'PROPOSTA_ACEITA':['SIM','PROPOSTA_ACEITA','CONTRATO EM PROCESSO','Enviar contrato para assinatura',2,'CONVERTER','Proposta aceita — formalizar contrato'],
    'CLIENTE_INTERESSADO':['SIM','CLIENTE_INTERESSADO','EM NEGOCIAÇÃO','Enviar proposta comercial',2,'CONVERTER','Demonstrou interesse — preparar proposta'],
    'SEM_INTERESSE':['SIM','SEM_INTERESSE','SEM INTERESSE','Revisitar em 60 dias',60,'MANTER','Não quer agora — manter contato futuro'],
    'REAGENDADO':['SIM','REAGENDADO','REAGENDADO','Agendar novo contato',0,'','Cliente pediu para reagendar'],
    'NAO_ENCONTRADO':['SIM','NAO_ENCONTRADO','TENTATIVA S/ CONTATO','Ligar amanhã',1,'','Não estava no local — tentar novamente'],
    'CANCELADO':['SIM','CANCELADO','VISITA CANCELADA','',0,'','Visita cancelada — sem redistribuir']
  };
  var values = sh.getDataRange().getValues();
  var rowByResult = {};
  for (var i=4;i<values.length;i++) { var res = op_upperNoAccents_(values[i][1] || ''); if (res) rowByResult[res] = i + 1; }
  var added = 0, updated = 0;
  Object.keys(wanted).forEach(function(k){
    var row = wanted[k];
    if (rowByResult[k]) { sh.getRange(rowByResult[k],1,1,row.length).setValues([row]); updated++; }
    else { sh.appendRow(row); added++; }
  });
  op_cacheRemoveSafe_('op_transicoes_v1');
  return {ok:true, added:added, updated:updated};
}

function op_updateClienteLifecycle_(clienteId, resultado, tipoInteracao, ctx) {
  if (!clienteId) return;
  ctx = ctx || {};
  var statusVisita = op_upperNoAccents_(ctx.statusVisita || 'CONCLUIDO').replace(/\s+/g,'_');
  var resultadoUpper = op_upperNoAccents_(resultado || '').replace(/\s+/g,'_');
  var transicao = op_findTransicao_(resultadoUpper);
  var fallback = op_defaultClientTransition_(resultadoUpper, ctx) || {};
  if (!transicao) transicao = fallback;
  else {
    if (!transicao.novoStatus && fallback.novoStatus) transicao.novoStatus = fallback.novoStatus;
    if (!transicao.proximaAcao && fallback.proximaAcao) transicao.proximaAcao = fallback.proximaAcao;
    if (!transicao.diasFollowup && fallback.diasFollowup) transicao.diasFollowup = fallback.diasFollowup;
    if (!transicao.novaAcaoFunil && fallback.novaAcaoFunil) transicao.novaAcaoFunil = fallback.novaAcaoFunil;
  }

  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) return;

  var data = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(data[0]);
  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (op_norm_(data[i][hm['CLIENTE_ID']]) === clienteId) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) return;

  var rowValues = sh.getRange(targetRow, 1, 1, sh.getLastColumn()).getValues()[0];
  var today = op_toYmd_(new Date());
  if (hm['ULTIMA_VISITA'] !== undefined) rowValues[hm['ULTIMA_VISITA']] = today;
  if (hm['ULTIMO_RESULTADO_VISITA'] !== undefined) rowValues[hm['ULTIMO_RESULTADO_VISITA']] = op_norm_(ctx.resultadoRaw || resultado || '');
  if (hm['CHECKLIST_ULTIMA_VISITA_ID'] !== undefined && ctx.checklistId) rowValues[hm['CHECKLIST_ULTIMA_VISITA_ID']] = ctx.checklistId;

  if (statusVisita === 'NAO_ENCONTRADO') {
    if (hm['STATUS_COMERCIAL'] !== undefined) rowValues[hm['STATUS_COMERCIAL']] = 'TENTATIVA S/ CONTATO';
    if (hm['PROXIMA_ACAO_MANUAL'] !== undefined) rowValues[hm['PROXIMA_ACAO_MANUAL']] = 'Tentar novo contato';
  } else if (statusVisita === 'REAGENDADO') {
    if (hm['STATUS_COMERCIAL'] !== undefined) rowValues[hm['STATUS_COMERCIAL']] = 'REAGENDADO';
    if (hm['PROXIMA_ACAO_MANUAL'] !== undefined) rowValues[hm['PROXIMA_ACAO_MANUAL']] = 'Visitar na nova data';
  } else if (statusVisita === 'CANCELADO') {
    if (hm['STATUS_COMERCIAL'] !== undefined) rowValues[hm['STATUS_COMERCIAL']] = 'VISITA CANCELADA';
  } else if (statusVisita === 'CONCLUIDO' && transicao) {
    if (transicao.novoStatus && hm['STATUS_COMERCIAL'] !== undefined) rowValues[hm['STATUS_COMERCIAL']] = transicao.novoStatus;
    if (transicao.proximaAcao && hm['PROXIMA_ACAO_MANUAL'] !== undefined) rowValues[hm['PROXIMA_ACAO_MANUAL']] = transicao.proximaAcao;
    if (transicao.novaAcaoFunil) {
      if (hm['ACAO_ATUAL'] !== undefined) rowValues[hm['ACAO_ATUAL']] = transicao.novaAcaoFunil;
      if (hm['ACAO'] !== undefined) rowValues[hm['ACAO']] = transicao.novaAcaoFunil;
    }
  }

  if (hm['DATA_PROXIMO_FOLLOWUP'] !== undefined) {
    var follow = '';
    if (statusVisita === 'NAO_ENCONTRADO') follow = op_addDays_(today, 1);
    else if (statusVisita === 'CONCLUIDO' && transicao && transicao.diasFollowup > 0) follow = op_addDays_(today, transicao.diasFollowup);
    if (follow) rowValues[hm['DATA_PROXIMO_FOLLOWUP']] = follow;
  }

  sh.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  op_cacheRemoveSafe_('op_transicoes_v1');
  op_cacheRemoveSafe_('op_clients_master_v2::full');
  op_cacheRemoveSafe_('op_clients_master_v2::agenda');
  op_invalidateOperationCaches_();
}


/**
 * Busca na aba CRM_TRANSICOES a regra para o resultado dado./**
 * Busca na aba CRM_TRANSICOES a regra para o resultado dado.
 * @param {string} resultado — resultado em maiúsculas sem acentos
 * @return {Object|null} — {novoStatus, proximaAcao, diasFollowup, novaAcaoFunil}
 */
function op_getTransicoes_(){
  var cacheKey = 'op_transicoes_v1';
  var cached = null;
  try { cached = op_cacheGetJson_(cacheKey); } catch (e) {}
  if (cached) return cached;

  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(LC_CFG.SHEET_TRANSICOES);
  if (!sh || sh.getLastRow() < 5) return [];

  var data = sh.getRange(5, 1, sh.getLastRow() - 4, 7).getValues();
  var out = data.map(function(r){
    return {
      ativa: op_upperNoAccents_(r[0]),
      resultado: op_upperNoAccents_(r[1]).replace(/\s+/g,'_'),
      novoStatus: op_norm_(r[2]),
      proximaAcao: op_norm_(r[3]),
      diasFollowup: Number(r[4]) || 0,
      novaAcaoFunil: op_upperNoAccents_(r[5]) === 'VISITAR' ? '' : op_norm_(r[5])
    };
  }).filter(function(x){ return x.ativa === 'SIM' && !!x.resultado; });

  try { op_cachePutJson_(cacheKey, out, LC_CFG.CACHE_SEC || 3600); } catch (e) {}
  return out;
}

function op_findTransicao_(resultado) {
  var regras = op_getTransicoes_();
  for (var i = 0; i < regras.length; i++) {
    var r = regras[i];
    if (r.resultado === resultado || resultado.indexOf(r.resultado) >= 0) {
      return {
        novoStatus: r.novoStatus,
        proximaAcao: r.proximaAcao,
        diasFollowup: r.diasFollowup,
        novaAcaoFunil: r.novaAcaoFunil
      };
    }
  }
  return null;
}

/* ==================== PATCH: op_apiUpdateAgendaStatus_ ==================== *//* ==================== PATCH: op_apiUpdateAgendaStatus_ ==================== */

/**
 * INSTRUÇÕES DE INSTALAÇÃO:
 *
 * No arquivo 10_OPERACAO_EXECUCAO_API.gs, na função op_apiUpdateAgendaStatus_,
 * encontre esta linha (perto do final da função, antes do return):
 *
 *   op_invalidateOperationCaches_();
 *   return { ok:true };
 *
 * E ADICIONE estas 3 linhas ANTES do return:
 *
 *   // Motor de ciclo de vida
 *   var lcResultado = op_norm_(payload.resultado || status);
 *   try { op_updateClienteLifecycle_(clienteId, lcResultado, tipo); } catch(e) { Logger.log('LC error: '+e); }
 *
 * Resultado final deve ficar:
 *
 *   op_invalidateOperationCaches_();
 *   // Motor de ciclo de vida
 *   var lcResultado = op_norm_(payload.resultado || status);
 *   try { op_updateClienteLifecycle_(clienteId, lcResultado, tipo); } catch(e) { Logger.log('LC error: '+e); }
 *   return { ok:true };
 */


/* ==================== LIFECYCLE: PROSPECTS ==================== */
var PROSPECT_TRANSITIONS = {
  'PROPOSTA_APRESENTADA': { etapa: 'PROPOSTA', status: 'PROPOSTA PENDENTE' },
  'CLIENTE_INTERESSADO':  { etapa: 'VISITA',   status: 'INTERESSADO' },
  'PROPOSTA_ACEITA':      { etapa: 'PROPOSTA', status: 'PROPOSTA ACEITA' },
  'CONTRATO_FECHADO':     { etapa: 'CONTRATO', status: 'CONVERTIDO' },
  'SEM_INTERESSE':        { etapa: 'PERDIDO',  status: 'SEM INTERESSE' }
};

function op_updateProspectLifecycle_(prospectId, resultado, tipoInteracao, statusVisita, ctx) {
  if (!prospectId) return;
  ctx = ctx || {};
  var statusUpper = op_upperNoAccents_(statusVisita || 'CONCLUIDO');
  var resultadoUpper = op_upperNoAccents_(resultado || '');
  var trans = PROSPECT_TRANSITIONS[resultadoUpper] || null;

  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
  if (!sh || sh.getLastRow() < 2) return;

  var data = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(data[0]);
  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (op_norm_(data[i][hm['PROSPECT_ID']]) === prospectId) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) return;

  var rowValues = sh.getRange(targetRow, 1, 1, sh.getLastColumn()).getValues()[0];
  var today = op_toYmd_(new Date());
  if (hm['ULTIMO_CONTATO'] !== undefined) rowValues[hm['ULTIMO_CONTATO']] = today;
  if (hm['ULTIMO_RESULTADO_VISITA'] !== undefined) rowValues[hm['ULTIMO_RESULTADO_VISITA']] = op_norm_(ctx.resultadoRaw || resultado || '');
  if (hm['CHECKLIST_ULTIMA_VISITA_ID'] !== undefined && ctx.checklistId) rowValues[hm['CHECKLIST_ULTIMA_VISITA_ID']] = ctx.checklistId;

  if (statusUpper === 'NAO_ENCONTRADO') {
    if (hm['STATUS_PROSPECT'] !== undefined) rowValues[hm['STATUS_PROSPECT']] = 'TENTATIVA S/ CONTATO';
    if (hm['PROXIMA_ACAO'] !== undefined) rowValues[hm['PROXIMA_ACAO']] = 'Tentar novo contato';
    if (hm['DATA_PROXIMO_FOLLOWUP'] !== undefined) rowValues[hm['DATA_PROXIMO_FOLLOWUP']] = op_addDays_(today,1);
  } else if (statusUpper === 'REAGENDADO') {
    if (hm['STATUS_PROSPECT'] !== undefined) rowValues[hm['STATUS_PROSPECT']] = 'REAGENDADO';
    if (hm['PROXIMA_ACAO'] !== undefined) rowValues[hm['PROXIMA_ACAO']] = 'Visitar na nova data';
  } else if (statusUpper === 'CANCELADO') {
    if (hm['STATUS_PROSPECT'] !== undefined) rowValues[hm['STATUS_PROSPECT']] = 'VISITA CANCELADA';
  } else if (statusUpper === 'CONCLUIDO' && trans) {
    if (trans.etapa && hm['ETAPA_FUNIL'] !== undefined) rowValues[hm['ETAPA_FUNIL']] = trans.etapa;
    if (trans.status && hm['STATUS_PROSPECT'] !== undefined) rowValues[hm['STATUS_PROSPECT']] = trans.status;
    if (hm['PROXIMA_ACAO'] !== undefined) {
      var prox = '';
      if (resultadoUpper === 'PROPOSTA_APRESENTADA') prox = 'Follow-up proposta';
      else if (resultadoUpper === 'CLIENTE_INTERESSADO') prox = 'Revisitar / aprofundar visita';
      else if (resultadoUpper === 'CONTRATO_FECHADO') prox = 'Acompanhar primeira postagem';
      else if (resultadoUpper === 'SEM_INTERESSE') prox = 'Encerrar lead';
      rowValues[hm['PROXIMA_ACAO']] = prox;
    }
    if (hm['DATA_PROXIMO_FOLLOWUP'] !== undefined) {
      var days = {'PROPOSTA_APRESENTADA':3,'CLIENTE_INTERESSADO':2,'PROPOSTA_ACEITA':2,'CONTRATO_FECHADO':7,'SEM_INTERESSE':30}[resultadoUpper] || 0;
      if (days > 0) rowValues[hm['DATA_PROXIMO_FOLLOWUP']] = op_addDays_(today, days);
    }
  }
  if (hm['UPDATED_AT'] !== undefined) rowValues[hm['UPDATED_AT']] = op_nowIso_();
  sh.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  try { op_cacheRemoveSafe_('op_prospects_v1'); } catch(e) {}
  op_invalidateOperationCaches_();
}

