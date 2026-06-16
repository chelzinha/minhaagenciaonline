/************************************************************
 * 08_CRM_APOSENTADORIA_LEGADO_FASE6.gs
 * ------------------------------------------------------------
 * Fase 6 — aposentadoria controlada de componentes CRM legados
 * da planilha principal APP Total CF + Metro.
 *
 * Objetivo:
 * - manter o novo /crm/ como experiência oficial;
 * - desativar o menu/sidebar CRM Lateral antigo da planilha;
 * - remover triggers instaláveis do sidebar legado, se existirem;
 * - preservar código e dados para reversão segura.
 ************************************************************/

var CRM6_CFG = {
  VERSION: '6.0.0',
  PROP_SIDEBAR_ENABLED: 'CRM_LATERAL_SIDEBAR_ENABLED',
  PROP_RETIRED_AT: 'CRM_LATERAL_RETIRED_AT',
  LEGACY_TRIGGER_HANDLERS: [
    'onOpenCrmLateral_',
    'installCrmSidebarMenu',
    'showCrmSidebarHome',
    'showDiagnosticoClienteSidebar',
    'showSidebarOportunidades',
    'showSidebarAgendaSemana',
    'showSidebarMidias'
  ],
  REQUIRED_SHEETS: [
    'CLIENTES_CADASTRO',
    'CLIENTES_MASTER',
    'PROSPECTS',
    'CRM_TRATATIVAS',
    'CRM_FUNIS',
    'CRM_FUNIL_ETAPAS',
    'CRM_TIPOS_ATIVIDADE',
    'CRM_RESULTADOS_ATIVIDADE',
    'CRM_RESPONSAVEIS',
    'AGENDA_EXECUCAO',
    'MIDIAS_CRM'
  ]
};

function crm6_isLegacySidebarEnabled_(){
  return PropertiesService.getScriptProperties().getProperty(CRM6_CFG.PROP_SIDEBAR_ENABLED) !== 'NAO';
}

function previewAposentadoriaLegadoCrmFase6(){
  var ss = getSsMov_();
  var missing = CRM6_CFG.REQUIRED_SHEETS.filter(function(name){ return !ss.getSheetByName(name); });
  var blockers = [];
  var warnings = [];
  if (missing.length) blockers.push('Abas canônicas ausentes: ' + missing.join(', '));

  var coletaAudit = null;
  try {
    if (typeof auditRemocaoColetasFase5 === 'function') coletaAudit = auditRemocaoColetasFase5();
  } catch (e) {
    warnings.push('Não foi possível executar a auditoria da Fase 5: ' + (e.message || e));
  }
  if (coletaAudit && Number(coletaAudit.residualTotal || 0) > 0) {
    blockers.push('A limpeza de COLETAS ainda possui ' + coletaAudit.residualTotal + ' vestígio(s). Finalize a Fase 5 antes de aposentar o legado.');
  }
  if (ss.getSheetByName('COLETAS_EXECUCAO')) {
    blockers.push('A aba COLETAS_EXECUCAO ainda existe. Execute a remoção física da Fase 5 antes de continuar.');
  }

  var triggerRows = crm6_listProjectTriggers_();
  var legacyTriggers = triggerRows.filter(function(t){ return CRM6_CFG.LEGACY_TRIGGER_HANDLERS.indexOf(t.handler) >= 0; });

  return {
    ok: blockers.length === 0,
    version: CRM6_CFG.VERSION,
    sidebarEnabled: crm6_isLegacySidebarEnabled_(),
    requiredSheetsMissing: missing,
    coletasAudit: coletaAudit,
    legacyTriggers: legacyTriggers,
    allProjectTriggers: triggerRows,
    blockers: blockers,
    warnings: warnings,
    message: blockers.length ? 'Aposentadoria bloqueada até corrigir os itens listados.' : 'Pré-requisitos atendidos. O sidebar legado pode ser aposentado com segurança.'
  };
}

function aposentarCrmLateralFase6(){
  return op_withDocumentLock_(function(){
    var preview = previewAposentadoriaLegadoCrmFase6();
    if (!preview.ok) throw new Error(preview.blockers.join(' | '));

    var removed = crm6_deleteLegacyTriggers_();
    var props = PropertiesService.getScriptProperties();
    props.setProperty(CRM6_CFG.PROP_SIDEBAR_ENABLED, 'NAO');
    props.setProperty(CRM6_CFG.PROP_RETIRED_AT, crm6_now_());

    try { CacheService.getScriptCache().removeAll(['crm_sidebar_home','crm_sidebar_midias']); } catch (e) {}

    return {
      ok: true,
      version: CRM6_CFG.VERSION,
      sidebarEnabled: crm6_isLegacySidebarEnabled_(),
      removedTriggers: removed,
      retiredAt: props.getProperty(CRM6_CFG.PROP_RETIRED_AT),
      message: 'CRM Lateral aposentado. O novo módulo oficial permanece em /crm/.'
    };
  });
}

function restaurarCrmLateralFase6(){
  return op_withDocumentLock_(function(){
    PropertiesService.getScriptProperties().setProperty(CRM6_CFG.PROP_SIDEBAR_ENABLED, 'SIM');
    return {
      ok: true,
      sidebarEnabled: crm6_isLegacySidebarEnabled_(),
      message: 'CRM Lateral liberado novamente. Triggers antigos não foram reinstalados automaticamente.'
    };
  });
}

function auditAposentadoriaLegadoCrmFase6(){
  var preview = previewAposentadoriaLegadoCrmFase6();
  var legacyTriggers = crm6_listProjectTriggers_().filter(function(t){ return CRM6_CFG.LEGACY_TRIGGER_HANDLERS.indexOf(t.handler) >= 0; });
  var residual = [];
  if (crm6_isLegacySidebarEnabled_()) residual.push('Sidebar CRM Lateral ainda habilitado.');
  if (legacyTriggers.length) residual.push('Triggers legados ainda instalados: ' + legacyTriggers.map(function(t){ return t.handler; }).join(', '));
  return {
    ok: residual.length === 0 && preview.blockers.length === 0,
    version: CRM6_CFG.VERSION,
    sidebarEnabled: crm6_isLegacySidebarEnabled_(),
    legacyTriggers: legacyTriggers,
    blockers: preview.blockers,
    residual: residual,
    message: residual.length ? 'Ainda existem componentes legados ativos.' : 'Auditoria aprovada: sidebar legado desativado e sem triggers instaláveis residuais.'
  };
}

function getStatusAposentadoriaLegadoCrmFase6(){
  var props = PropertiesService.getScriptProperties();
  return {
    version: CRM6_CFG.VERSION,
    sidebarEnabled: crm6_isLegacySidebarEnabled_(),
    retiredAt: props.getProperty(CRM6_CFG.PROP_RETIRED_AT) || '',
    audit: auditAposentadoriaLegadoCrmFase6()
  };
}

function crm6_listProjectTriggers_(){
  return ScriptApp.getProjectTriggers().map(function(t){
    var type = '';
    try { type = String(t.getEventType()); } catch (e) {}
    return { handler: t.getHandlerFunction(), eventType: type };
  });
}

function crm6_deleteLegacyTriggers_(){
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t){
    var handler = t.getHandlerFunction();
    if (CRM6_CFG.LEGACY_TRIGGER_HANDLERS.indexOf(handler) >= 0) {
      ScriptApp.deleteTrigger(t);
      removed.push(handler);
    }
  });
  return removed;
}

function crm6_now_(){
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Fortaleza', "yyyy-MM-dd'T'HH:mm:ss");
}
