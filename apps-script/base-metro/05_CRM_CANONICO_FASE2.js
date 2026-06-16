/**
 * 05_CRM_CANONICO_FASE2.gs
 * ------------------------------------------------------------
 * Fase 2 — Camada canônica do CRM AGF.
 *
 * Objetivo:
 * - criar estruturas aditivas e parametrizáveis;
 * - migrar cadastro de clientes sem remover fontes legadas;
 * - preparar overlay seguro de CLIENTES_CADASTRO em CLIENTES_MASTER;
 * - manter APP Etiquetas AGF!CLIENTES_APP como projeção compatível;
 * - preservar Etiquetas, Balcão e Nuvemshop durante a transição.
 *
 * IMPORTANTE:
 * - nenhuma função destrutiva roda automaticamente;
 * - o overlay cadastral começa DESATIVADO;
 * - a sincronização para CLIENTES_APP ocorre somente quando executada manualmente.
 */

var CRM2_CFG = {
  VERSION: '2.0.0',
  ETIQUETAS_SPREADSHEET_ID: '1_QJT-6JcOG6GAB-eiNNHTbeJbW3hV4yKyGLcZL3FT1Q',
  ETIQUETAS_CLIENTES_SHEET: 'CLIENTES_APP',
  PROPS: {
    SETUP_AT: 'crm2_setup_at',
    SETUP_VERSION: 'crm2_setup_version',
    MIGRATION_AT: 'crm2_migration_at',
    OVERLAY_ENABLED: 'crm2_cadastro_overlay_enabled',
    LAST_COMPAT_SYNC_AT: 'crm2_last_compat_sync_at'
  },
  SHEETS: {
    CADASTRO: 'CLIENTES_CADASTRO',
    ACESSOS: 'CLIENTES_ACESSOS_APP',
    CREDENCIAIS: 'CLIENTES_CREDENCIAIS_CWS',
    TRATATIVAS: 'CRM_TRATATIVAS',
    FUNIS: 'CRM_FUNIS',
    ETAPAS: 'CRM_FUNIL_ETAPAS',
    TIPOS_ATIVIDADE: 'CRM_TIPOS_ATIVIDADE',
    RESULTADOS: 'CRM_RESULTADOS_ATIVIDADE',
    RESPONSAVEIS: 'CRM_RESPONSAVEIS',
    EVENTOS: 'CRM_EVENTOS',
    RELATORIO: 'CRM_MIGRACAO_RELATORIO'
  },
  APP_ID_POSTAGENS: 'POSTAGENS',
  MAX_KANBAN_COLS: 6
};

var CRM2_HEADERS = {
  CLIENTES_CADASTRO: [
    'CLIENTE_ID','NOME_REMETENTE_BASE','CLIENTE','NOME_FANTASIA','RAZAO_SOCIAL','CNPJ_CPF',
    'PESSOA_CONTATO','WHATSAPP','TELEFONE','EMAIL','ENDERECO','NUMERO','COMPLEMENTO','BAIRRO','CEP','CIDADE','UF',
    'LOCAL_PADRAO','SEGMENTO_PADRAO','NUMERO_CONTRATO_PADRAO','CARTAO_POSTAGEM_PADRAO',
    'RESPONSAVEL_ID','RESPONSAVEL_NOME','STATUS_CADASTRO','OBSERVACOES','CRIADO_EM','ATUALIZADO_EM','ATUALIZADO_POR'
  ],
  CLIENTES_ACESSOS_APP: [
    'ACESSO_ID','CLIENTE_ID','APP_ID','LOGIN_APP','SENHA_APP_LEGACY','ATIVO','OBS','CRIADO_EM','ATUALIZADO_EM'
  ],
  CLIENTES_CREDENCIAIS_CWS: [
    'CREDENCIAL_ID','CLIENTE_ID','NUMERO_CONTRATO','CARTAO_POSTAGEM','AMBIENTE_CWS','LOGIN_IDCORREIOS','TOKEN_API',
    'COD_SERVICO_PAC','COD_SERVICO_SEDEX','STATUS_TESTE_CWS','TIPO_ROTULO_PADRAO','FORMATO_ROTULO_PADRAO','TIPO_DOCUMENTO_PADRAO',
    'PADRAO','ATIVA','CRIADO_EM','ATUALIZADO_EM'
  ],
  CRM_TRATATIVAS: [
    'TRATATIVA_ID','TIPO_ENTIDADE','ENTIDADE_ID','FUNIL_ID','ETAPA_ID','STATUS_TRATATIVA','ORIGEM',
    'ACAO_ENGINE_SNAPSHOT','SUB_ACAO_SNAPSHOT','PRIORIDADE_SNAPSHOT','RESPONSAVEL_ID','ABERTA_EM','ETAPA_ATUALIZADA_EM',
    'PROXIMO_FOLLOWUP_EM','ENCERRADA_EM','MOTIVO_ENCERRAMENTO','UPDATED_BY','ATUALIZADO_EM'
  ],
  CRM_FUNIS: ['FUNIL_ID','NOME_EXIBICAO','TIPO_ENTIDADE','ATIVO','MAX_COLUNAS_VISIVEIS','ORDEM'],
  CRM_FUNIL_ETAPAS: ['ETAPA_ID','FUNIL_ID','NOME_EXIBICAO','ORDEM','COR','ICONE','TIPO_ETAPA','EXIBE_KANBAN','STATUS_FINAL','ATIVA'],
  CRM_TIPOS_ATIVIDADE: [
    'TIPO_ATIVIDADE_ID','NOME_EXIBICAO','CATEGORIA','ICONE','COR','DURACAO_PADRAO_MIN','USA_BLOCO','PERMITE_HORARIO_LIVRE',
    'EXIGE_RESULTADO','ACEITA_MIDIA','APLICA_PROSPECT','APLICA_CLIENTE','ATIVA','ORDEM'
  ],
  CRM_RESULTADOS_ATIVIDADE: ['RESULTADO_ID','TIPO_ATIVIDADE_ID','NOME_EXIBICAO','ATIVA','ORDEM'],
  CRM_RESPONSAVEIS: [
    'RESPONSAVEL_ID','USERNAME','DISPLAY_NAME','ROLE','USER_ACTIVE','CRM_LINKED','AGENDA_SCOPE','CAN_EDIT_CLIENTS',
    'CAN_EDIT_PROSPECTS','CAN_MOVE_FUNNEL','CAN_COMPLETE_ACTIVITIES','CAN_VIEW_TEAM','CAN_VIEW_INDICATORS','UPDATED_AT'
  ],
  CRM_EVENTOS: [
    'EVENTO_ID','DATA_HORA','ENTIDADE_TIPO','ENTIDADE_ID','TRATATIVA_ID','TIPO_EVENTO','VALOR_ANTERIOR','VALOR_NOVO',
    'RESPONSAVEL_ID','ORIGEM','METADADOS_JSON'
  ],
  CRM_MIGRACAO_RELATORIO: ['DATA_HORA','CATEGORIA','SEVERIDADE','CLIENTE_ID','CHAVE','VALOR_MASTER','VALOR_ETIQUETAS','DECISAO','OBS']
};

var CRM2_APPEND_HEADERS = {
  AGENDA_EXECUCAO: [
    'TRATATIVA_ID','TIPO_ATIVIDADE_ID','STATUS_ATIVIDADE','AGENDADA','DATA_PROGRAMADA','HORA_PROGRAMADA','DURACAO_MIN',
    'RESULTADO_ID','MIDIA_RECOMENDADA_CODIGO','MIDIA_USADA_CODIGO','RESPONSAVEL_ID'
  ],
  AGENDA_BLOCOS: ['ATIVO','PERMITE_AGENDAMENTO','COR_PADRAO','OBS'],
  PROSPECTS: ['RESPONSAVEL_ID','TRATATIVA_ATIVA_ID'],
  CRM_VISITA_CHECKLIST: ['TRATATIVA_ID','TIPO_ATIVIDADE_ID','RESULTADO_ID','RESPONSAVEL_ID'],
  CRM_INTERACOES: ['TRATATIVA_ID','TIPO_ATIVIDADE_ID','RESULTADO_ID','RESPONSAVEL_ID']
};

/* ========================= SETUP PÚBLICO ========================= */

function setupCrmCanonicoFase2() {
  return op_withDocumentLock_(function(){
    return crm2_setupUnlocked_();
  });
}

function crm2_setupUnlocked_() {
  var ss = op_getSpreadsheet_();
  var created = [];
  var updated = [];

  Object.keys(CRM2_HEADERS).forEach(function(sheetName){
    var result = crm2_ensureSheetSchema_(ss, sheetName, CRM2_HEADERS[sheetName]);
    if (result.created) created.push(sheetName);
    if (result.addedHeaders.length) updated.push({ sheet:sheetName, addedHeaders:result.addedHeaders });
  });

  Object.keys(CRM2_APPEND_HEADERS).forEach(function(sheetName){
    var result = crm2_appendMissingHeaders_(ss, sheetName, CRM2_APPEND_HEADERS[sheetName]);
    if (result.created) created.push(sheetName);
    if (result.addedHeaders.length) updated.push({ sheet:sheetName, addedHeaders:result.addedHeaders });
  });

  crm2_seedFunis_();
  crm2_seedEtapas_();
  crm2_seedTiposAtividade_();
  crm2_seedResultadosAtividade_();
  crm2_prepareAgendaBlocos_();
  crm2_protectSensitiveSheets_();

  PropertiesService.getScriptProperties().setProperties({
    crm2_setup_at: op_nowIso_(),
    crm2_setup_version: CRM2_CFG.VERSION
  }, false);
  crm2_clearCaches_();

  return {
    ok:true,
    version:CRM2_CFG.VERSION,
    overlayEnabled:crm2_isOverlayEnabled_(),
    created:created,
    updated:updated,
    message:'Estrutura canônica CRM Fase 2 criada sem remover dados legados.'
  };
}

function auditMigracaoClientesFase2() {
  return op_withDocumentLock_(function(){
    crm2_setupUnlocked_();
    var audit = crm2_buildMigrationAudit_();
    crm2_writeMigrationReport_(audit.rows, false);
    return audit.summary;
  });
}

function migrateClientesCadastroFase2() {
  return op_withDocumentLock_(function(){
    crm2_setupUnlocked_();
    var ss = op_getSpreadsheet_();
    var source = crm2_buildMigrationSource_();

    var cadastroStats = crm2_upsertRowsByKey_(
      ss.getSheetByName(CRM2_CFG.SHEETS.CADASTRO),
      CRM2_HEADERS.CLIENTES_CADASTRO,
      source.cadastroRows,
      'CLIENTE_ID'
    );
    var acessoStats = crm2_upsertRowsByKey_(
      ss.getSheetByName(CRM2_CFG.SHEETS.ACESSOS),
      CRM2_HEADERS.CLIENTES_ACESSOS_APP,
      source.acessoRows,
      'ACESSO_ID'
    );
    var credStats = crm2_upsertRowsByKey_(
      ss.getSheetByName(CRM2_CFG.SHEETS.CREDENCIAIS),
      CRM2_HEADERS.CLIENTES_CREDENCIAIS_CWS,
      source.credencialRows,
      'CREDENCIAL_ID'
    );

    crm2_writeMigrationReport_(source.auditRows, false);
    PropertiesService.getScriptProperties().setProperty(CRM2_CFG.PROPS.MIGRATION_AT, op_nowIso_());
    crm2_clearCaches_();

    return {
      ok:true,
      overlayEnabled:crm2_isOverlayEnabled_(),
      clientesCadastro:cadastroStats,
      acessosApp:acessoStats,
      credenciaisCws:credStats,
      blockers:source.auditRows.filter(function(x){ return x[2] === 'BLOQUEANTE'; }).length,
      attention:source.auditRows.filter(function(x){ return x[2] === 'ATENCAO'; }).length,
      message:'Migração concluída. O overlay continua desativado até enableCadastroCanonicoOverlayFase2().' 
    };
  });
}

function previewSyncClientesAppCompatFase2() {
  setupCrmCanonicoFase2();
  return crm2_buildCompatSyncPlan_().summary;
}

function syncClientesAppCompatFase2() {
  return op_withDocumentLock_(function(){
    crm2_setupUnlocked_();
    var plan = crm2_buildCompatSyncPlan_();
    var target = plan.targetSheet;
    if (!target) throw new Error('Aba CLIENTES_APP não encontrada na planilha APP Etiquetas AGF.');

    var headers = plan.headers;
    var rows = plan.rows;
    if (rows.length) {
      if (target.getMaxRows() < rows.length + 1) target.insertRowsAfter(target.getMaxRows(), rows.length + 1 - target.getMaxRows());
      if (target.getMaxColumns() < headers.length) target.insertColumnsAfter(target.getMaxColumns(), headers.length - target.getMaxColumns());
      target.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
      target.getRange(2,1,rows.length,headers.length).setValues(rows);
      var oldRows = Math.max(0, target.getLastRow() - 1);
      if (oldRows > rows.length) target.getRange(rows.length + 2, 1, oldRows - rows.length, headers.length).clearContent();
    }
    target.setFrozenRows(1);
    PropertiesService.getScriptProperties().setProperty(CRM2_CFG.PROPS.LAST_COMPAT_SYNC_AT, op_nowIso_());
    return plan.summary;
  });
}

function validateMigracaoClientesFase2() {
  return op_withDocumentLock_(function(){
    crm2_setupUnlocked_();
    return crm2_validateMigrationUnlocked_();
  });
}

function enableCadastroCanonicoOverlayFase2(forceReviewed) {
  return op_withDocumentLock_(function(){
    crm2_setupUnlocked_();
    var validation = crm2_validateMigrationUnlocked_();
    if (validation.blockers > 0 && forceReviewed !== true) {
      throw new Error('Overlay não habilitado: existem ' + validation.blockers + ' conflitos BLOQUEANTES. Revise CRM_MIGRACAO_RELATORIO. Após revisão consciente, execute enableCadastroCanonicoOverlayFase2(true).');
    }
    PropertiesService.getScriptProperties().setProperty(CRM2_CFG.PROPS.OVERLAY_ENABLED, 'SIM');
    crm2_clearCaches_();
    var result = op_updateClientesMasterUnlocked_(op_getBaseSheetSignature_());
    return { ok:true, overlayEnabled:true, forced:forceReviewed === true, validation:validation, master:result, message:'Overlay cadastral habilitado e CLIENTES_MASTER reconstruída.' };
  });
}

function disableCadastroCanonicoOverlayFase2() {
  return op_withDocumentLock_(function(){
    PropertiesService.getScriptProperties().setProperty(CRM2_CFG.PROPS.OVERLAY_ENABLED, 'NAO');
    crm2_clearCaches_();
    var result = op_updateClientesMasterUnlocked_(op_getBaseSheetSignature_());
    return { ok:true, overlayEnabled:false, master:result, message:'Overlay cadastral desabilitado e CLIENTES_MASTER reconstruída pelo modo legado.' };
  });
}

function getStatusCrmCanonicoFase2() {
  var p = PropertiesService.getScriptProperties();
  var ss = op_getSpreadsheet_();
  return {
    ok:true,
    version:CRM2_CFG.VERSION,
    setupAt:p.getProperty(CRM2_CFG.PROPS.SETUP_AT) || '',
    migrationAt:p.getProperty(CRM2_CFG.PROPS.MIGRATION_AT) || '',
    lastCompatSyncAt:p.getProperty(CRM2_CFG.PROPS.LAST_COMPAT_SYNC_AT) || '',
    overlayEnabled:crm2_isOverlayEnabled_(),
    sheets:Object.keys(CRM2_HEADERS).map(function(name){
      var sh = ss.getSheetByName(name);
      return { name:name, exists:!!sh, rows:sh ? Math.max(0, sh.getLastRow() - 1) : 0 };
    })
  };
}

/* ========================= OVERLAY CLIENTES_MASTER ========================= */

function crm_applyCadastroOverlayToManualMap_(manualMap) {
  manualMap = manualMap || {};
  if (!crm2_isOverlayEnabled_()) return manualMap;
  var cadastro = crm2_readSheetObjects_(op_getSpreadsheet_(), CRM2_CFG.SHEETS.CADASTRO);
  cadastro.forEach(function(c){
    var clienteId = crm2_text_(c.CLIENTE_ID);
    if (!clienteId) return;
    var out = manualMap[clienteId] || {};
    crm2_assignIfFilled_(out, 'CLIENTE', c.CLIENTE || c.NOME_REMETENTE_BASE);
    crm2_assignIfFilled_(out, 'NOME_FANTASIA', c.NOME_FANTASIA);
    crm2_assignIfFilled_(out, 'RAZAO_SOCIAL', c.RAZAO_SOCIAL);
    crm2_assignIfFilled_(out, 'CNPJ_CPF', c.CNPJ_CPF);
    crm2_assignIfFilled_(out, 'PESSOA_CONTATO', c.PESSOA_CONTATO);
    crm2_assignIfFilled_(out, 'WHATSAPP', c.WHATSAPP);
    crm2_assignIfFilled_(out, 'TELEFONE', c.TELEFONE);
    crm2_assignIfFilled_(out, 'EMAIL', c.EMAIL);
    crm2_assignIfFilled_(out, 'ENDERECO', c.ENDERECO);
    crm2_assignIfFilled_(out, 'NUMERO', c.NUMERO);
    crm2_assignIfFilled_(out, 'COMPLEMENTO', c.COMPLEMENTO);
    crm2_assignIfFilled_(out, 'BAIRRO', c.BAIRRO);
    crm2_assignIfFilled_(out, 'CEP', c.CEP);
    crm2_assignIfFilled_(out, 'CIDADE', c.CIDADE);
    crm2_assignIfFilled_(out, 'UF', c.UF);
    crm2_assignIfFilled_(out, 'NUMERO_CONTRATO', c.NUMERO_CONTRATO_PADRAO);
    crm2_assignIfFilled_(out, 'CARTAO_POSTAGEM', c.CARTAO_POSTAGEM_PADRAO);
    crm2_assignIfFilled_(out, 'RESPONSAVEL_ID', c.RESPONSAVEL_ID);
    crm2_assignIfFilled_(out, 'RESPONSAVEL_CARTEIRA', c.RESPONSAVEL_NOME);
    crm2_assignIfFilled_(out, 'STATUS_CADASTRO', c.STATUS_CADASTRO);
    crm2_assignIfFilled_(out, 'UPDATED_AT_CADASTRO', c.ATUALIZADO_EM);
    crm2_assignIfFilled_(out, 'UPDATED_BY', c.ATUALIZADO_POR);
    manualMap[clienteId] = out;
  });
  return manualMap;
}

function crm_appendCadastroOnlyMetrics_(metrics, refDate) {
  if (!crm2_isOverlayEnabled_()) return metrics;
  metrics = metrics || [];
  var seen = {};
  metrics.forEach(function(x){ if (x.CLIENTE_ID) seen[x.CLIENTE_ID] = true; });
  crm2_readSheetObjects_(op_getSpreadsheet_(), CRM2_CFG.SHEETS.CADASTRO).forEach(function(c){
    var id = crm2_text_(c.CLIENTE_ID);
    if (!id || seen[id]) return;
    metrics.push({
      CLIENTE_ID:id,
      NOME_REMETENTE_BASE:crm2_text_(c.NOME_REMETENTE_BASE || c.CLIENTE),
      RAZAO_SOCIAL_BASE:crm2_text_(c.RAZAO_SOCIAL),
      NUMERO_CONTRATO:crm2_text_(c.NUMERO_CONTRATO_PADRAO),
      CARTAO_POSTAGEM:crm2_text_(c.CARTAO_POSTAGEM_PADRAO),
      LOCAL_PREDOMINANTE:crm2_text_(c.LOCAL_PADRAO || 'SEM LOCAL'),
      SEGMENTO_PREDOMINANTE:crm2_text_(c.SEGMENTO_PADRAO || 'SEM SEGMENTO'),
      TIPO_SERVICO_PREDOMINANTE:'', INTERMEDIADOR_PREDOMINANTE:'', CATEGORIA_PREDOMINANTE:'',
      BUCKET_NEGOCIO:'INTERMEDIADOR', PERFIL_COMERCIAL:'SEM_HISTORICO', TEM_CONTRATO:crm2_text_(c.NUMERO_CONTRATO_PADRAO) ? 'SIM' : 'NAO',
      DATA_PRIMEIRA_POSTAGEM:'', DATA_PRIMEIRA_VALIDA_NAO_REVERSO:'', DATA_ULTIMA_POSTAGEM:'', DIAS_SEM_POSTAR:9999,
      STATUS_ATIVIDADE:'SEM_POSTAGEM', NOVO_CLIENTE:'NAO', INATIVO_30D:'SIM', INATIVO_60D:'SIM',
      CURVA:'C', CURVA_ANTERIOR:'C', MOVIMENTO_CURVA:'MANTEVE', PORTE_OPERACIONAL:'MICRO', SHARE_LOCAL_30D:0,
      NIVEL_ALERTA:'SEM_HISTORICO', QUEDA_REAL:'NAO', QUEDA_LEVE_SAZONAL:'NAO', IS_REVERSO_BAIXO:'NAO',
      FAT_30D:0,QTD_30D:0,DIAS_ATIVOS_30D:0,TICKET_30D:0,FAT_31_60D:0,QTD_31_60D:0,DIAS_ATIVOS_31_60D:0,TICKET_31_60D:0,
      TENDENCIA:'ESTAVEL',FD_PCT:0,QD_PCT:0,DD_PCT:0,QTD_TOTAL:0,VALOR_TOTAL:0,DIAS_ATIVOS_TOTAL:0,MESES_ATIVOS_TOTAL:0,
      RECORRENTE_30D:'NAO',RECORRENCIA_NIVEL:'SEM_BASE',SCORE_CURVA_ATUAL:0,SCORE_CURVA_ANTERIOR:0
    });
    seen[id] = true;
  });
  return metrics;
}

function crm_upsertCadastroFromMasterRow_(rowValues, hm, meta) {
  if (!rowValues || !hm) return { ok:false, skipped:true };
  var clienteId = crm2_text_(op_getCell_(rowValues, hm, 'CLIENTE_ID'));
  if (!clienteId) return { ok:false, skipped:true };
  var now = op_nowIso_();
  var obj = {
    CLIENTE_ID:clienteId,
    NOME_REMETENTE_BASE:crm2_text_(op_getCell_(rowValues, hm, 'NOME_REMETENTE_BASE')),
    CLIENTE:crm2_text_(op_getCell_(rowValues, hm, 'CLIENTE')),
    NOME_FANTASIA:crm2_text_(op_getCell_(rowValues, hm, 'NOME_FANTASIA')),
    RAZAO_SOCIAL:crm2_text_(op_getCell_(rowValues, hm, 'RAZAO_SOCIAL')),
    CNPJ_CPF:crm2_text_(op_getCell_(rowValues, hm, 'CNPJ_CPF')),
    PESSOA_CONTATO:crm2_text_(op_getCell_(rowValues, hm, 'PESSOA_CONTATO')),
    WHATSAPP:crm2_text_(op_getCell_(rowValues, hm, 'WHATSAPP')),
    TELEFONE:crm2_text_(op_getCell_(rowValues, hm, 'TELEFONE')),
    EMAIL:crm2_text_(op_getCell_(rowValues, hm, 'EMAIL')),
    ENDERECO:crm2_text_(op_getCell_(rowValues, hm, 'ENDERECO')),
    NUMERO:crm2_text_(op_getCell_(rowValues, hm, 'NUMERO')),
    COMPLEMENTO:crm2_text_(op_getCell_(rowValues, hm, 'COMPLEMENTO')),
    BAIRRO:crm2_text_(op_getCell_(rowValues, hm, 'BAIRRO')),
    CEP:crm2_text_(op_getCell_(rowValues, hm, 'CEP')),
    CIDADE:crm2_text_(op_getCell_(rowValues, hm, 'CIDADE')),
    UF:crm2_text_(op_getCell_(rowValues, hm, 'UF')),
    LOCAL_PADRAO:crm2_text_(op_getCell_(rowValues, hm, 'LOCAL_PREDOMINANTE')),
    SEGMENTO_PADRAO:crm2_text_(op_getCell_(rowValues, hm, 'SEGMENTO_PREDOMINANTE')),
    NUMERO_CONTRATO_PADRAO:crm2_text_(op_getCell_(rowValues, hm, 'NUMERO_CONTRATO')),
    CARTAO_POSTAGEM_PADRAO:crm2_text_(op_getCell_(rowValues, hm, 'CARTAO_POSTAGEM')),
    RESPONSAVEL_ID:crm2_text_(op_getCell_(rowValues, hm, 'RESPONSAVEL_ID')),
    RESPONSAVEL_NOME:crm2_text_(op_getCell_(rowValues, hm, 'RESPONSAVEL_CARTEIRA')),
    STATUS_CADASTRO:crm2_text_(op_getCell_(rowValues, hm, 'STATUS_CADASTRO') || 'ATIVO'),
    OBSERVACOES:crm2_text_(op_getCell_(rowValues, hm, 'OBSERVACOES')),
    CRIADO_EM:now,
    ATUALIZADO_EM:now,
    ATUALIZADO_POR:crm2_text_(meta && meta.origem || 'CRM_API')
  };
  var sh = crm2_ensureSheetSchema_(op_getSpreadsheet_(), CRM2_CFG.SHEETS.CADASTRO, CRM2_HEADERS.CLIENTES_CADASTRO).sheet;
  return crm2_upsertRowsByKey_(sh, CRM2_HEADERS.CLIENTES_CADASTRO, [obj], 'CLIENTE_ID');
}

/* ========================= CONFIG API V2 ========================= */

function crm_apiGetConfigV2_() {
  crm2_ensureSetupReady_();
  var ss = op_getSpreadsheet_();
  return {
    ok:true,
    version:CRM2_CFG.VERSION,
    overlayEnabled:crm2_isOverlayEnabled_(),
    funis:crm2_readSheetObjects_(ss, CRM2_CFG.SHEETS.FUNIS),
    etapas:crm2_readSheetObjects_(ss, CRM2_CFG.SHEETS.ETAPAS),
    tiposAtividade:crm2_readSheetObjects_(ss, CRM2_CFG.SHEETS.TIPOS_ATIVIDADE),
    resultados:crm2_readSheetObjects_(ss, CRM2_CFG.SHEETS.RESULTADOS),
    blocos:op_readBlocks_()
  };
}

/* ========================= VISITAR LEGADO ========================= */

function auditVisitarLegadoFase2() {
  var ss = op_getSpreadsheet_();
  var out = { ok:true, masterAcaoAtual:0, masterAcao:0, midias:0 };
  var master = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (master && master.getLastRow() > 1) {
    var data = master.getDataRange().getValues();
    var hm = op_buildHeaderMap_(data[0]);
    data.slice(1).forEach(function(r){
      if (hm.ACAO_ATUAL !== undefined && op_upperNoAccents_(r[hm.ACAO_ATUAL]) === 'VISITAR') out.masterAcaoAtual++;
      if (hm.ACAO !== undefined && op_upperNoAccents_(r[hm.ACAO]) === 'VISITAR') out.masterAcao++;
    });
  }
  var midias = ss.getSheetByName(OP_CFG.SHEETS.MIDIAS);
  if (midias && midias.getLastRow() > 1) {
    var md = midias.getDataRange().getValues();
    var mh = op_buildHeaderMap_(md[0]);
    md.slice(1).forEach(function(r){ if (mh.ACAO !== undefined && op_upperNoAccents_(r[mh.ACAO]) === 'VISITAR') out.midias++; });
  }
  return out;
}

function normalizeVisitarLegadoFase2() {
  return op_withDocumentLock_(function(){
    var ss = op_getSpreadsheet_();
    var stats = { ok:true, clearedAcaoAtual:0, reclassifiedMidias:0 };
    var master = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
    if (master && master.getLastRow() > 1) {
      var data = master.getDataRange().getValues();
      var hm = op_buildHeaderMap_(data[0]);
      var changed = false;
      for (var i=1;i<data.length;i++) {
        if (hm.ACAO_ATUAL !== undefined && op_upperNoAccents_(data[i][hm.ACAO_ATUAL]) === 'VISITAR') {
          data[i][hm.ACAO_ATUAL] = '';
          stats.clearedAcaoAtual++;
          changed = true;
        }
      }
      if (changed) master.getRange(2,1,data.length-1,data[0].length).setValues(data.slice(1));
    }
    var midias = ss.getSheetByName(OP_CFG.SHEETS.MIDIAS);
    if (midias && midias.getLastRow() > 1) {
      var md = midias.getDataRange().getValues();
      var mh = op_buildHeaderMap_(md[0]);
      var mChanged = false;
      for (var x=1;x<md.length;x++) {
        if (mh.ACAO !== undefined && op_upperNoAccents_(md[x][mh.ACAO]) === 'VISITAR') {
          md[x][mh.ACAO] = 'FIDELIZAR';
          if (mh.SUBCATEGORIA !== undefined) {
            var sub = op_upperNoAccents_(md[x][mh.SUBCATEGORIA]);
            if (sub === 'V1_CONTRATO_ESTRATEGICO_EM_QUEDA') md[x][mh.SUBCATEGORIA] = 'F0_CONTRATO_ESTRATEGICO_CRITICO';
            if (sub === 'V2_RELACIONAMENTO_ESTRATEGICO') md[x][mh.SUBCATEGORIA] = 'F0_RELACIONAMENTO_ESTRATEGICO_CRITICO';
          }
          stats.reclassifiedMidias++;
          mChanged = true;
        }
      }
      if (mChanged) midias.getRange(2,1,md.length-1,md[0].length).setValues(md.slice(1));
    }
    crm2_clearCaches_();
    op_updateClientesMasterUnlocked_(op_getBaseSheetSignature_());
    return stats;
  });
}

/* ========================= MIGRAÇÃO ========================= */

function crm2_buildMigrationAudit_() {
  var source = crm2_buildMigrationSource_();
  var rows = source.auditRows;
  return {
    rows:rows,
    summary:{
      ok:true,
      clientesCadastro:source.cadastroRows.length,
      acessosApp:source.acessoRows.length,
      credenciaisCws:source.credencialRows.length,
      relatorioRows:rows.length,
      blockers:rows.filter(function(x){ return x[2] === 'BLOQUEANTE'; }).length,
      attention:rows.filter(function(x){ return x[2] === 'ATENCAO'; }).length,
      info:rows.filter(function(x){ return x[2] === 'INFO'; }).length,
      message:'Auditoria concluída. Consulte CRM_MIGRACAO_RELATORIO antes de habilitar o overlay.'
    }
  };
}

function crm2_validateMigrationUnlocked_() {
  var audit = crm2_buildMigrationAudit_();
  crm2_writeMigrationReport_(audit.rows, false);
  return {
    ok:audit.summary.blockers === 0,
    blockers:audit.summary.blockers,
    attention:audit.summary.attention,
    info:audit.summary.info,
    canEnableOverlay:audit.summary.blockers === 0,
    message:audit.summary.blockers === 0 ? 'Sem conflitos bloqueantes. Overlay pode ser homologado.' : 'Existem conflitos bloqueantes. Revise CRM_MIGRACAO_RELATORIO.'
  };
}

function crm2_buildMigrationSource_() {
  var now = op_nowIso_();
  var ss = op_getSpreadsheet_();
  var masterRows = crm2_readSheetObjects_(ss, OP_CFG.SHEETS.MASTER);
  var etiquetasSs = SpreadsheetApp.openById(CRM2_CFG.ETIQUETAS_SPREADSHEET_ID);
  var appRows = crm2_readSheetObjects_(etiquetasSs, CRM2_CFG.ETIQUETAS_CLIENTES_SHEET);
  var byId = {};
  var auditRows = [];
  var seenMasterIds = {};
  var seenAppLogins = {};

  masterRows.forEach(function(m){
    var id = crm2_text_(m.CLIENTE_ID);
    if (!id) return;
    if (seenMasterIds[id]) {
      auditRows.push(crm2_auditRow_('CLIENTE_ID_DUPLICADO_MASTER','BLOQUEANTE',id,'CLIENTE_ID',id,id,'REVISAR','CLIENTES_MASTER possui mais de uma linha com o mesmo CLIENTE_ID.'));
    }
    seenMasterIds[id] = true;
    byId[id] = crm2_cadastroFromMaster_(m, now);
  });

  appRows.forEach(function(a){
    var id = crm2_text_(a.ID_CRM);
    var login = crm2_text_(a.LOGIN_APP);
    var loginKey = crm2_compareText_(login);
    if (loginKey) {
      if (seenAppLogins[loginKey] && seenAppLogins[loginKey] !== id) {
        auditRows.push(crm2_auditRow_('LOGIN_APP_DUPLICADO','BLOQUEANTE',id,'LOGIN_APP',seenAppLogins[loginKey],login,'REVISAR','O mesmo LOGIN_APP está vinculado a clientes diferentes.'));
      } else if (!seenAppLogins[loginKey]) {
        seenAppLogins[loginKey] = id;
      }
    }
    if (!id) {
      auditRows.push(crm2_auditRow_('SEM_CLIENTE_ID','ATENCAO','',crm2_text_(a.LOGIN_APP),'',crm2_text_(a.LOGIN_APP),'IGNORADO','Linha de CLIENTES_APP sem ID_CRM.'));
      return;
    }
    if (!byId[id]) {
      byId[id] = crm2_cadastroFromApp_(a, now);
      auditRows.push(crm2_auditRow_('SOMENTE_ETIQUETAS','INFO',id,'ID_CRM','',id,'IMPORTADO','Cliente inexistente em CLIENTES_MASTER.'));
    } else {
      crm2_mergeAppIntoCadastro_(byId[id], a, auditRows);
    }
  });

  masterRows.forEach(function(m){
    var id = crm2_text_(m.CLIENTE_ID);
    if (!id) return;
    var found = appRows.some(function(a){ return crm2_text_(a.ID_CRM) === id; });
    if (!found) auditRows.push(crm2_auditRow_('SOMENTE_MASTER','INFO',id,'CLIENTE_ID',id,'','PRESERVADO','Cliente sem acesso no app Etiquetas.'));
  });

  var cnpjOwners = {};
  Object.keys(byId).forEach(function(id){
    var cnpj = crm2_digits_(byId[id].CNPJ_CPF);
    if (!cnpj) return;
    if (cnpjOwners[cnpj] && cnpjOwners[cnpj] !== id) {
      auditRows.push(crm2_auditRow_('CNPJ_CPF_DUPLICADO','BLOQUEANTE',id,'CNPJ_CPF',cnpjOwners[cnpj],cnpj,'REVISAR','O mesmo CNPJ/CPF aparece vinculado a CLIENTE_IDs diferentes.'));
    } else if (!cnpjOwners[cnpj]) {
      cnpjOwners[cnpj] = id;
    }
  });

  var cadastroRows = Object.keys(byId).sort().map(function(id){ return byId[id]; });
  var acessoRows = [];
  var credencialRows = [];
  appRows.forEach(function(a){
    var id = crm2_text_(a.ID_CRM);
    if (!id) return;
    var login = crm2_text_(a.LOGIN_APP);
    if (login) acessoRows.push(crm2_accessFromApp_(a, id, now));
    if (crm2_hasAnyCredential_(a)) credencialRows.push(crm2_credentialFromApp_(a, id, now));
  });

  acessoRows = crm2_dedupeObjects_(acessoRows, 'ACESSO_ID');
  credencialRows = crm2_dedupeObjects_(credencialRows, 'CREDENCIAL_ID');
  return { cadastroRows:cadastroRows, acessoRows:acessoRows, credencialRows:credencialRows, auditRows:auditRows };
}

function crm2_cadastroFromMaster_(m, now) {
  return {
    CLIENTE_ID:crm2_text_(m.CLIENTE_ID),
    NOME_REMETENTE_BASE:crm2_text_(m.NOME_REMETENTE_BASE),
    CLIENTE:crm2_text_(m.CLIENTE || m.NOME_REMETENTE_BASE),
    NOME_FANTASIA:crm2_text_(m.NOME_FANTASIA),
    RAZAO_SOCIAL:crm2_text_(m.RAZAO_SOCIAL),
    CNPJ_CPF:crm2_text_(m.CNPJ_CPF),
    PESSOA_CONTATO:crm2_text_(m.PESSOA_CONTATO),
    WHATSAPP:crm2_text_(m.WHATSAPP),
    TELEFONE:crm2_text_(m.TELEFONE),
    EMAIL:crm2_text_(m.EMAIL),
    ENDERECO:crm2_text_(m.ENDERECO), NUMERO:crm2_text_(m.NUMERO), COMPLEMENTO:crm2_text_(m.COMPLEMENTO), BAIRRO:crm2_text_(m.BAIRRO), CEP:crm2_text_(m.CEP),
    CIDADE:crm2_text_(m.CIDADE), UF:crm2_text_(m.UF),
    LOCAL_PADRAO:crm2_text_(m.LOCAL_PREDOMINANTE), SEGMENTO_PADRAO:crm2_text_(m.SEGMENTO_PREDOMINANTE),
    NUMERO_CONTRATO_PADRAO:crm2_text_(m.NUMERO_CONTRATO), CARTAO_POSTAGEM_PADRAO:crm2_text_(m.CARTAO_POSTAGEM),
    RESPONSAVEL_ID:crm2_text_(m.RESPONSAVEL_ID), RESPONSAVEL_NOME:crm2_text_(m.RESPONSAVEL_CARTEIRA),
    STATUS_CADASTRO:crm2_text_(m.STATUS_CADASTRO || 'ATIVO'), OBSERVACOES:crm2_text_(m.OBSERVACOES),
    CRIADO_EM:now, ATUALIZADO_EM:now, ATUALIZADO_POR:'MIGRACAO_MASTER'
  };
}

function crm2_cadastroFromApp_(a, now) {
  return {
    CLIENTE_ID:crm2_text_(a.ID_CRM), NOME_REMETENTE_BASE:crm2_text_(a.NOME_REMETENTE), CLIENTE:crm2_text_(a.NOME_REMETENTE || a.NOME_FANTASIA),
    NOME_FANTASIA:crm2_text_(a.NOME_FANTASIA), RAZAO_SOCIAL:'', CNPJ_CPF:crm2_text_(a.CNPJ_CPF), PESSOA_CONTATO:crm2_text_(a.CONTATO),
    WHATSAPP:crm2_text_(a.WHATSAPP), TELEFONE:'', EMAIL:crm2_text_(a.EMAIL), ENDERECO:crm2_text_(a.ENDERECO), NUMERO:crm2_text_(a.NUMERO),
    COMPLEMENTO:crm2_text_(a.COMPLEMENTO), BAIRRO:crm2_text_(a.BAIRRO), CEP:crm2_text_(a.CEP), CIDADE:crm2_text_(a.CIDADE_REMETENTE), UF:crm2_text_(a.UF_REMETENTE),
    LOCAL_PADRAO:'', SEGMENTO_PADRAO:crm2_text_(a.SEGMENTO), NUMERO_CONTRATO_PADRAO:crm2_text_(a.NUM_CONTRATO), CARTAO_POSTAGEM_PADRAO:crm2_text_(a.CARTAO_POSTAGEM),
    RESPONSAVEL_ID:'', RESPONSAVEL_NOME:'', STATUS_CADASTRO:'ATIVO', OBSERVACOES:'', CRIADO_EM:now, ATUALIZADO_EM:now, ATUALIZADO_POR:'MIGRACAO_ETIQUETAS'
  };
}

function crm2_mergeAppIntoCadastro_(cad, a, auditRows) {
  var mapping = {
    NOME_REMETENTE_BASE:'NOME_REMETENTE', CLIENTE:'NOME_REMETENTE', NOME_FANTASIA:'NOME_FANTASIA', CNPJ_CPF:'CNPJ_CPF',
    PESSOA_CONTATO:'CONTATO', EMAIL:'EMAIL', WHATSAPP:'WHATSAPP', ENDERECO:'ENDERECO', NUMERO:'NUMERO', COMPLEMENTO:'COMPLEMENTO', BAIRRO:'BAIRRO', CEP:'CEP',
    CIDADE:'CIDADE_REMETENTE', UF:'UF_REMETENTE', SEGMENTO_PADRAO:'SEGMENTO', NUMERO_CONTRATO_PADRAO:'NUM_CONTRATO', CARTAO_POSTAGEM_PADRAO:'CARTAO_POSTAGEM'
  };
  Object.keys(mapping).forEach(function(dest){
    var appVal = crm2_text_(a[mapping[dest]]);
    var masterVal = crm2_text_(cad[dest]);
    if (!appVal) return;
    if (!masterVal) cad[dest] = appVal;
    else if (crm2_compareText_(masterVal) !== crm2_compareText_(appVal)) {
      auditRows.push(crm2_auditRow_('DIVERGENCIA','ATENCAO',cad.CLIENTE_ID,dest,masterVal,appVal,'MANTIDO_MASTER','Revisar manualmente antes do overlay.'));
    }
  });
}

function crm2_accessFromApp_(a, clienteId, now) {
  var login = crm2_text_(a.LOGIN_APP);
  return {
    ACESSO_ID:'ACS_' + crm2_hashShort_(clienteId + '|' + CRM2_CFG.APP_ID_POSTAGENS + '|' + login),
    CLIENTE_ID:clienteId, APP_ID:CRM2_CFG.APP_ID_POSTAGENS, LOGIN_APP:login,
    SENHA_APP_LEGACY:crm2_text_(a.SENHA_APP), ATIVO:'SIM', OBS:'Compatibilidade CLIENTES_APP', CRIADO_EM:now, ATUALIZADO_EM:now
  };
}

function crm2_credentialFromApp_(a, clienteId, now) {
  var key = [clienteId,crm2_text_(a.NUM_CONTRATO),crm2_text_(a.CARTAO_POSTAGEM),crm2_text_(a.AMBIENTE_CWS),crm2_text_(a.LOGIN_IDCORREIOS)].join('|');
  return {
    CREDENCIAL_ID:'CWS_' + crm2_hashShort_(key), CLIENTE_ID:clienteId,
    NUMERO_CONTRATO:crm2_text_(a.NUM_CONTRATO), CARTAO_POSTAGEM:crm2_text_(a.CARTAO_POSTAGEM), AMBIENTE_CWS:crm2_text_(a.AMBIENTE_CWS),
    LOGIN_IDCORREIOS:crm2_text_(a.LOGIN_IDCORREIOS), TOKEN_API:crm2_text_(a.TOKEN_API), COD_SERVICO_PAC:crm2_text_(a.COD_SERVICO_PAC),
    COD_SERVICO_SEDEX:crm2_text_(a.COD_SERVICO_SEDEX), STATUS_TESTE_CWS:crm2_text_(a.STATUS_TESTE_CWS),
    TIPO_ROTULO_PADRAO:crm2_text_(a.TIPO_ROTULO_PADRAO), FORMATO_ROTULO_PADRAO:crm2_text_(a.FORMATO_ROTULO_PADRAO), TIPO_DOCUMENTO_PADRAO:crm2_text_(a.TIPO_DOCUMENTO_PADRAO),
    PADRAO:'SIM', ATIVA:'SIM', CRIADO_EM:now, ATUALIZADO_EM:now
  };
}

/* ========================= PROJEÇÃO COMPATÍVEL CLIENTES_APP ========================= */

function crm2_buildCompatSyncPlan_() {
  var ss = op_getSpreadsheet_();
  var cadastro = crm2_indexBy_(crm2_readSheetObjects_(ss, CRM2_CFG.SHEETS.CADASTRO), 'CLIENTE_ID');
  var acessos = crm2_readSheetObjects_(ss, CRM2_CFG.SHEETS.ACESSOS).filter(function(x){
    return crm2_text_(x.APP_ID) === CRM2_CFG.APP_ID_POSTAGENS && crm2_isYes_(x.ATIVO);
  });
  var credenciais = crm2_readSheetObjects_(ss, CRM2_CFG.SHEETS.CREDENCIAIS).filter(function(x){ return crm2_isYes_(x.ATIVA); });
  var credsByClient = {};
  credenciais.forEach(function(c){
    var id = crm2_text_(c.CLIENTE_ID);
    if (!id) return;
    if (!credsByClient[id] || crm2_isYes_(c.PADRAO)) credsByClient[id] = c;
  });

  var targetSs = SpreadsheetApp.openById(CRM2_CFG.ETIQUETAS_SPREADSHEET_ID);
  var target = targetSs.getSheetByName(CRM2_CFG.ETIQUETAS_CLIENTES_SHEET);
  if (!target) throw new Error('Aba CLIENTES_APP não encontrada em APP Etiquetas AGF.');
  var targetValues = target.getDataRange().getValues();
  var headers = targetValues.length ? targetValues[0].map(crm2_text_) : [];
  var hm = crm2_headerMap_(headers);
  ['ID_CRM','LOGIN_APP','SENHA_APP'].forEach(function(h){ if (hm[h] === undefined) throw new Error('Cabeçalho obrigatório ausente em CLIENTES_APP: ' + h); });

  var rows = targetValues.slice(1).map(function(r){ return r.slice(); });
  var byLogin = {};
  rows.forEach(function(r, idx){
    var login = crm2_text_(r[hm.LOGIN_APP]);
    if (!login) return;
    var loginKey = crm2_compareText_(login);
    if (byLogin[loginKey] !== undefined) throw new Error('CLIENTES_APP possui LOGIN_APP duplicado: ' + login);
    byLogin[loginKey] = idx;
  });
  var canonicalLoginOwners = {};
  acessos.forEach(function(a){
    var login = crm2_text_(a.LOGIN_APP);
    var loginKey = crm2_compareText_(login);
    var clienteId = crm2_text_(a.CLIENTE_ID);
    if (!loginKey) return;
    if (canonicalLoginOwners[loginKey] && canonicalLoginOwners[loginKey] !== clienteId) throw new Error('CLIENTES_ACESSOS_APP possui LOGIN_APP duplicado entre clientes: ' + login);
    canonicalLoginOwners[loginKey] = clienteId;
  });
  var appended = 0, updated = 0, unchanged = 0, skipped = 0;

  acessos.forEach(function(a){
    var id = crm2_text_(a.CLIENTE_ID);
    var login = crm2_text_(a.LOGIN_APP);
    var cad = cadastro[id];
    if (!id || !login || !cad) { skipped++; return; }
    var cred = credsByClient[id] || {};
    var proj = crm2_clientesAppProjection_(cad, a, cred);
    var loginKey = crm2_compareText_(login);
    var idx = byLogin[loginKey];
    if (idx === undefined) {
      var newRow = headers.map(function(h){ return proj[h] !== undefined ? proj[h] : ''; });
      rows.push(newRow);
      byLogin[loginKey] = rows.length - 1;
      appended++;
      return;
    }
    var oldRow = rows[idx];
    var changed = false;
    headers.forEach(function(h, c){
      if (proj[h] === undefined) return;
      var newVal = proj[h];
      if (String(oldRow[c] == null ? '' : oldRow[c]) !== String(newVal == null ? '' : newVal)) {
        oldRow[c] = newVal;
        changed = true;
      }
    });
    if (changed) updated++; else unchanged++;
  });

  return {
    targetSheet:target, headers:headers, rows:rows,
    summary:{ ok:true, targetSpreadsheetId:CRM2_CFG.ETIQUETAS_SPREADSHEET_ID, targetSheet:CRM2_CFG.ETIQUETAS_CLIENTES_SHEET, appended:appended, updated:updated, unchanged:unchanged, skipped:skipped, preservedLegacyRows:rows.length - appended }
  };
}

function crm2_clientesAppProjection_(cad, acesso, cred) {
  return {
    ID_CRM:crm2_text_(cad.CLIENTE_ID), LOGIN_APP:crm2_text_(acesso.LOGIN_APP), SENHA_APP:crm2_text_(acesso.SENHA_APP_LEGACY),
    NOME_REMETENTE:crm2_text_(cad.CLIENTE || cad.NOME_REMETENTE_BASE), NOME_FANTASIA:crm2_text_(cad.NOME_FANTASIA), CNPJ_CPF:crm2_text_(cad.CNPJ_CPF),
    CONTATO:crm2_text_(cad.PESSOA_CONTATO), EMAIL:crm2_text_(cad.EMAIL), WHATSAPP:crm2_text_(cad.WHATSAPP), ENDERECO:crm2_text_(cad.ENDERECO), NUMERO:crm2_text_(cad.NUMERO),
    COMPLEMENTO:crm2_text_(cad.COMPLEMENTO), BAIRRO:crm2_text_(cad.BAIRRO), CEP:crm2_text_(cad.CEP), CIDADE_REMETENTE:crm2_text_(cad.CIDADE), UF_REMETENTE:crm2_text_(cad.UF),
    NUM_CONTRATO:crm2_text_(cred.NUMERO_CONTRATO || cad.NUMERO_CONTRATO_PADRAO), CARTAO_POSTAGEM:crm2_text_(cred.CARTAO_POSTAGEM || cad.CARTAO_POSTAGEM_PADRAO),
    SEGMENTO:crm2_text_(cad.SEGMENTO_PADRAO), AMBIENTE_CWS:crm2_text_(cred.AMBIENTE_CWS), LOGIN_IDCORREIOS:crm2_text_(cred.LOGIN_IDCORREIOS), TOKEN_API:crm2_text_(cred.TOKEN_API),
    STATUS_TESTE_CWS:crm2_text_(cred.STATUS_TESTE_CWS), COD_SERVICO_PAC:crm2_text_(cred.COD_SERVICO_PAC), COD_SERVICO_SEDEX:crm2_text_(cred.COD_SERVICO_SEDEX),
    TIPO_ROTULO_PADRAO:crm2_text_(cred.TIPO_ROTULO_PADRAO), FORMATO_ROTULO_PADRAO:crm2_text_(cred.FORMATO_ROTULO_PADRAO), TIPO_DOCUMENTO_PADRAO:crm2_text_(cred.TIPO_DOCUMENTO_PADRAO)
  };
}

/* ========================= SEEDS ========================= */

function crm2_seedFunis_() {
  crm2_seedIfEmpty_(CRM2_CFG.SHEETS.FUNIS, CRM2_HEADERS.CRM_FUNIS, [
    {FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Jornada de Prospects',TIPO_ENTIDADE:'PROSPECT',ATIVO:'SIM',MAX_COLUNAS_VISIVEIS:6,ORDEM:1},
    {FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Jornada de Clientes',TIPO_ENTIDADE:'CLIENTE',ATIVO:'SIM',MAX_COLUNAS_VISIVEIS:6,ORDEM:2}
  ]);
}
function crm2_seedEtapas_() {
  crm2_seedIfEmpty_(CRM2_CFG.SHEETS.ETAPAS, CRM2_HEADERS.CRM_FUNIL_ETAPAS, [
    {ETAPA_ID:'P_NOVO',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Novo lead',ORDEM:1,COR:'#E2E8F0',ICONE:'person_add',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'P_QUALIFICADO',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Qualificado',ORDEM:2,COR:'#DBEAFE',ICONE:'verified',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'P_CONTATO',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Contato estabelecido',ORDEM:3,COR:'#EDE9FE',ICONE:'forum',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'P_OPORTUNIDADE',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Oportunidade identificada',ORDEM:4,COR:'#FEF3C7',ICONE:'lightbulb',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'P_NEGOCIACAO',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Em negociação',ORDEM:5,COR:'#FFEDD5',ICONE:'handshake',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'P_CONVERTIDO',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Convertido',ORDEM:6,COR:'#DCFCE7',ICONE:'check_circle',TIPO_ETAPA:'GANHA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'SIM',ATIVA:'SIM'},
    {ETAPA_ID:'P_NUTRICAO',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Nutrição',ORDEM:90,COR:'#F1F5F9',ICONE:'schedule',TIPO_ETAPA:'PAUSADA',EXIBE_KANBAN:'NAO',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'P_PERDIDO',FUNIL_ID:'FUNIL_PROSPECTS',NOME_EXIBICAO:'Perdido',ORDEM:91,COR:'#FEE2E2',ICONE:'cancel',TIPO_ETAPA:'PERDIDA',EXIBE_KANBAN:'NAO',STATUS_FINAL:'SIM',ATIVA:'SIM'},
    {ETAPA_ID:'C_SINALIZADO',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Sinalizado',ORDEM:1,COR:'#E2E8F0',ICONE:'flag',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'C_TRATATIVA',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Em tratativa',ORDEM:2,COR:'#DBEAFE',ICONE:'forum',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'C_NECESSIDADE',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Necessidade mapeada',ORDEM:3,COR:'#EDE9FE',ICONE:'search',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'C_SOLUCAO',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Solução em andamento',ORDEM:4,COR:'#FEF3C7',ICONE:'construction',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'C_ACOMPANHAMENTO',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Em acompanhamento',ORDEM:5,COR:'#FFEDD5',ICONE:'schedule',TIPO_ETAPA:'ABERTA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'C_CONCLUIDO',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Concluído',ORDEM:6,COR:'#DCFCE7',ICONE:'check_circle',TIPO_ETAPA:'GANHA',EXIBE_KANBAN:'SIM',STATUS_FINAL:'SIM',ATIVA:'SIM'},
    {ETAPA_ID:'C_PAUSADO',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Pausado',ORDEM:90,COR:'#F1F5F9',ICONE:'pause_circle',TIPO_ETAPA:'PAUSADA',EXIBE_KANBAN:'NAO',STATUS_FINAL:'NAO',ATIVA:'SIM'},
    {ETAPA_ID:'C_SEM_AVANCO',FUNIL_ID:'FUNIL_CLIENTES',NOME_EXIBICAO:'Encerrado sem avanço',ORDEM:91,COR:'#FEE2E2',ICONE:'cancel',TIPO_ETAPA:'PERDIDA',EXIBE_KANBAN:'NAO',STATUS_FINAL:'SIM',ATIVA:'SIM'}
  ]);
}
function crm2_seedTiposAtividade_() {
  crm2_seedIfEmpty_(CRM2_CFG.SHEETS.TIPOS_ATIVIDADE, CRM2_HEADERS.CRM_TIPOS_ATIVIDADE, [
    {TIPO_ATIVIDADE_ID:'ATV_VISITA',NOME_EXIBICAO:'Visita presencial',CATEGORIA:'PRESENCIAL',ICONE:'location_on',COR:'#F59E0B',DURACAO_PADRAO_MIN:120,USA_BLOCO:'SIM',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'SIM',APLICA_PROSPECT:'SIM',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:1},
    {TIPO_ATIVIDADE_ID:'ATV_LIGACAO',NOME_EXIBICAO:'Ligação',CATEGORIA:'REMOTO',ICONE:'call',COR:'#2563EB',DURACAO_PADRAO_MIN:30,USA_BLOCO:'NAO',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'NAO',APLICA_PROSPECT:'SIM',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:2},
    {TIPO_ATIVIDADE_ID:'ATV_WHATSAPP',NOME_EXIBICAO:'Enviar WhatsApp',CATEGORIA:'REMOTO',ICONE:'chat',COR:'#16A34A',DURACAO_PADRAO_MIN:15,USA_BLOCO:'NAO',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'SIM',APLICA_PROSPECT:'SIM',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:3},
    {TIPO_ATIVIDADE_ID:'ATV_EMAIL',NOME_EXIBICAO:'Enviar e-mail',CATEGORIA:'REMOTO',ICONE:'mail',COR:'#7C3AED',DURACAO_PADRAO_MIN:15,USA_BLOCO:'NAO',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'SIM',APLICA_PROSPECT:'SIM',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:4},
    {TIPO_ATIVIDADE_ID:'ATV_REUNIAO_ONLINE',NOME_EXIBICAO:'Reunião on-line',CATEGORIA:'REMOTO',ICONE:'videocam',COR:'#0F766E',DURACAO_PADRAO_MIN:60,USA_BLOCO:'NAO',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'SIM',APLICA_PROSPECT:'SIM',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:5},
    {TIPO_ATIVIDADE_ID:'ATV_PROPOSTA',NOME_EXIBICAO:'Enviar proposta',CATEGORIA:'DOCUMENTO',ICONE:'description',COR:'#EA580C',DURACAO_PADRAO_MIN:30,USA_BLOCO:'NAO',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'SIM',APLICA_PROSPECT:'SIM',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:6},
    {TIPO_ATIVIDADE_ID:'ATV_RETORNO',NOME_EXIBICAO:'Retorno',CATEGORIA:'REMOTO',ICONE:'reply',COR:'#0284C7',DURACAO_PADRAO_MIN:30,USA_BLOCO:'NAO',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'SIM',APLICA_PROSPECT:'SIM',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:7},
    {TIPO_ATIVIDADE_ID:'ATV_TREINAMENTO',NOME_EXIBICAO:'Treinamento',CATEGORIA:'PRESENCIAL',ICONE:'school',COR:'#9333EA',DURACAO_PADRAO_MIN:90,USA_BLOCO:'SIM',PERMITE_HORARIO_LIVRE:'SIM',EXIGE_RESULTADO:'SIM',ACEITA_MIDIA:'SIM',APLICA_PROSPECT:'NAO',APLICA_CLIENTE:'SIM',ATIVA:'SIM',ORDEM:8}
  ]);
}
function crm2_seedResultadosAtividade_() {
  crm2_seedIfEmpty_(CRM2_CFG.SHEETS.RESULTADOS, CRM2_HEADERS.CRM_RESULTADOS_ATIVIDADE, [
    {RESULTADO_ID:'RES_SEM_RESPOSTA',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Sem resposta',ATIVA:'SIM',ORDEM:1},
    {RESULTADO_ID:'RES_REAGENDADO',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Reagendado',ATIVA:'SIM',ORDEM:2},
    {RESULTADO_ID:'RES_INTERESSE',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Demonstrou interesse',ATIVA:'SIM',ORDEM:3},
    {RESULTADO_ID:'RES_PROPOSTA_ENVIADA',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Proposta enviada',ATIVA:'SIM',ORDEM:4},
    {RESULTADO_ID:'RES_SEM_INTERESSE',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Sem interesse no momento',ATIVA:'SIM',ORDEM:5},
    {RESULTADO_ID:'RES_CONTRATO_FECHADO',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Contrato fechado',ATIVA:'SIM',ORDEM:6},
    {RESULTADO_ID:'RES_CLIENTE_RECUPERADO',TIPO_ATIVIDADE_ID:'TODOS',NOME_EXIBICAO:'Cliente voltou a postar',ATIVA:'SIM',ORDEM:7},
    {RESULTADO_ID:'RES_NAO_ENCONTRADO',TIPO_ATIVIDADE_ID:'ATV_VISITA',NOME_EXIBICAO:'Cliente não encontrado',ATIVA:'SIM',ORDEM:8}
  ]);
}
function crm2_prepareAgendaBlocos_() {
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.BLOCKS);
  if (!sh || sh.getLastRow() < 2) return;
  var data = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(data[0]);
  var changed = false;
  for (var i=1;i<data.length;i++) {
    if (hm.ATIVO !== undefined && !crm2_text_(data[i][hm.ATIVO])) { data[i][hm.ATIVO] = 'SIM'; changed = true; }
    if (hm.PERMITE_AGENDAMENTO !== undefined && !crm2_text_(data[i][hm.PERMITE_AGENDAMENTO])) { data[i][hm.PERMITE_AGENDAMENTO] = 'SIM'; changed = true; }
    if (hm.COR_PADRAO !== undefined && !crm2_text_(data[i][hm.COR_PADRAO])) { data[i][hm.COR_PADRAO] = crm2_text_(data[i][hm.COR]); changed = true; }
  }
  if (changed) sh.getRange(2,1,data.length-1,data[0].length).setValues(data.slice(1));
}

/* ========================= HELPERS ========================= */

function crm2_ensureSetupReady_() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty(CRM2_CFG.PROPS.SETUP_VERSION) !== CRM2_CFG.VERSION) setupCrmCanonicoFase2();
}
function crm2_isOverlayEnabled_() {
  return op_upperNoAccents_(PropertiesService.getScriptProperties().getProperty(CRM2_CFG.PROPS.OVERLAY_ENABLED) || '') === 'SIM';
}
function crm2_text_(v) { return v == null ? '' : String(v).trim(); }
function crm2_compareText_(v) { return op_upperNoAccents_(crm2_text_(v)).replace(/[^A-Z0-9]+/g,''); }
function crm2_digits_(v) { return crm2_text_(v).replace(/\D+/g, ''); }
function crm2_isYes_(v) { var s = op_upperNoAccents_(v); return s === 'SIM' || s === 'TRUE' || s === '1' || s === 'YES' || s === 'ATIVO'; }
function crm2_assignIfFilled_(obj, key, value) { var v = crm2_text_(value); if (v) obj[key] = v; }
function crm2_hashShort_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text || ''));
  var out = '';
  for (var i=0;i<bytes.length;i++) { var v = bytes[i] < 0 ? bytes[i] + 256 : bytes[i]; out += ('0' + v.toString(16)).slice(-2); }
  return out.slice(0, 12).toUpperCase();
}
function crm2_headerMap_(headers) { var out = {}; headers.forEach(function(h,i){ var k = op_headerKey_(h); if (k && out[k] === undefined) out[k] = i; }); return out; }
function crm2_readSheetObjects_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(function(x){ return op_headerKey_(x); });
  return values.slice(1).map(function(row){
    var out = {};
    headers.forEach(function(h,i){ if (h) out[h] = row[i]; });
    return out;
  }).filter(function(x){ return Object.keys(x).some(function(k){ return crm2_text_(x[k]); }); });
}
function crm2_indexBy_(rows, key) { var out = {}; (rows || []).forEach(function(x){ var id = crm2_text_(x[key]); if (id) out[id] = x; }); return out; }
function crm2_dedupeObjects_(rows, key) { var out = {}, order = []; (rows || []).forEach(function(x){ var id = crm2_text_(x[key]); if (!id) return; if (!out[id]) order.push(id); out[id] = x; }); return order.map(function(id){ return out[id]; }); }
function crm2_hasAnyCredential_(a) { return ['NUM_CONTRATO','CARTAO_POSTAGEM','AMBIENTE_CWS','LOGIN_IDCORREIOS','TOKEN_API','COD_SERVICO_PAC','COD_SERVICO_SEDEX'].some(function(k){ return crm2_text_(a[k]); }); }
function crm2_auditRow_(categoria, severidade, clienteId, chave, masterVal, etiquetasVal, decisao, obs) { return [op_nowIso_(),categoria,severidade,clienteId,chave,masterVal,etiquetasVal,decisao,obs]; }

function crm2_ensureSheetSchema_(ss, sheetName, headers) {
  var sh = ss.getSheetByName(sheetName);
  var created = false;
  if (!sh) { sh = ss.insertSheet(sheetName); created = true; }
  var addedHeaders = crm2_appendHeadersToSheet_(sh, headers);
  sh.setFrozenRows(1);
  if (headers.length) sh.getRange(1,1,1,Math.max(headers.length,sh.getLastColumn())).setFontWeight('bold');
  return { sheet:sh, created:created, addedHeaders:addedHeaders };
}
function crm2_appendMissingHeaders_(ss, sheetName, headers) {
  var sh = ss.getSheetByName(sheetName);
  var created = false;
  if (!sh) { sh = ss.insertSheet(sheetName); created = true; }
  var addedHeaders = crm2_appendHeadersToSheet_(sh, headers);
  sh.setFrozenRows(1);
  return { sheet:sh, created:created, addedHeaders:addedHeaders };
}
function crm2_appendHeadersToSheet_(sh, headers) {
  headers = headers || [];
  var lastCol = Math.max(0, sh.getLastColumn());
  var current = lastCol > 0 ? sh.getRange(1,1,1,lastCol).getValues()[0] : [];
  var hm = crm2_headerMap_(current);
  var missing = headers.filter(function(h){ return hm[op_headerKey_(h)] === undefined; });
  if (!missing.length) return [];
  var needCols = current.length + missing.length;
  if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
  sh.getRange(1,current.length + 1,1,missing.length).setValues([missing]).setFontWeight('bold');
  return missing;
}
function crm2_seedIfEmpty_(sheetName, headers, rows) {
  var ss = op_getSpreadsheet_();
  var sh = crm2_ensureSheetSchema_(ss, sheetName, headers).sheet;
  if (sh.getLastRow() > 1 || !rows.length) return;
  var values = rows.map(function(obj){ return headers.map(function(h){ return obj[h] != null ? obj[h] : ''; }); });
  sh.getRange(2,1,values.length,headers.length).setValues(values);
}
function crm2_upsertRowsByKey_(sh, headers, objects, keyHeader) {
  if (!sh) throw new Error('Planilha de destino ausente para upsert.');
  crm2_appendHeadersToSheet_(sh, headers);
  var values = sh.getDataRange().getValues();
  var currentHeaders = values[0].map(crm2_text_);
  var hm = crm2_headerMap_(currentHeaders);
  var key = op_headerKey_(keyHeader);
  if (hm[key] === undefined) throw new Error('Cabeçalho chave ausente: ' + keyHeader);
  var rows = values.slice(1);
  var index = {};
  rows.forEach(function(r,i){ var id = crm2_text_(r[hm[key]]); if (id && index[id] === undefined) index[id] = i; });
  var inserted = 0, updated = 0, skipped = 0;
  (objects || []).forEach(function(obj){
    var id = crm2_text_(obj[key]);
    if (!id) { skipped++; return; }
    var targetIndex = index[id];
    if (targetIndex === undefined) {
      var newRow = currentHeaders.map(function(h){ var k = op_headerKey_(h); return obj[k] != null ? obj[k] : (obj[h] != null ? obj[h] : ''); });
      rows.push(newRow); index[id] = rows.length - 1; inserted++; return;
    }
    var row = rows[targetIndex];
    var changed = false;
    currentHeaders.forEach(function(h,c){
      var k = op_headerKey_(h);
      var newVal = obj[k] != null ? obj[k] : obj[h];
      if (newVal === undefined || newVal === '') return;
      if (k === 'CRIADO_EM' && crm2_text_(row[c])) return;
      if (String(row[c] == null ? '' : row[c]) !== String(newVal)) { row[c] = newVal; changed = true; }
    });
    if (changed) updated++;
  });
  if (rows.length) {
    if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
    sh.getRange(2,1,rows.length,currentHeaders.length).setValues(rows);
  }
  return { inserted:inserted, updated:updated, skipped:skipped, total:rows.length };
}
function crm2_writeMigrationReport_(rows, append) {
  var ss = op_getSpreadsheet_();
  var sh = crm2_ensureSheetSchema_(ss, CRM2_CFG.SHEETS.RELATORIO, CRM2_HEADERS.CRM_MIGRACAO_RELATORIO).sheet;
  if (!append && sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent();
  if (rows && rows.length) sh.getRange(sh.getLastRow()+1,1,rows.length,CRM2_HEADERS.CRM_MIGRACAO_RELATORIO.length).setValues(rows);
}
function crm2_protectSensitiveSheets_() {
  [CRM2_CFG.SHEETS.ACESSOS, CRM2_CFG.SHEETS.CREDENCIAIS].forEach(function(name){
    var sh = op_getSpreadsheet_().getSheetByName(name);
    if (!sh) return;
    var protections = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    if (!protections.length) sh.protect().setDescription('CRM Fase 2 — dados sensíveis; edição controlada').setWarningOnly(true);
  });
}
function crm2_clearCaches_() {
  try {
    var c = gc_();
    ['crm2_config_v2','op_midias_v1','op_blocks_v1','op_clients_master_v2::full','op_clients_master_v2::agenda','op_clients_master_v2::compact','op_clients_master_v2::lookup'].forEach(function(k){ c.remove(k); });
  } catch(e) {}
  try { op_invalidateOperationCaches_(); } catch(e2) {}
}

