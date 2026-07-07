/**
 * 11_CRM_IMPORTACAO_LOTE_MENU.gs
 * ------------------------------------------------------------
 * Importacao assistida de cadastros manuais do CRM.
 *
 * Objetivo:
 * - permitir que Rachel preencha apenas os campos de cadastro em PROSPECTS
 *   ou CLIENTES_CADASTRO;
 * - completar IDs e campos operacionais obrigatorios;
 * - criar a tratativa correspondente em CRM_TRATATIVAS;
 * - atualizar TRATATIVA_ATIVA_ID na entidade;
 * - registrar evento tecnico em CRM_EVENTOS;
 * - invalidar caches para o front enxergar os dados atualizados.
 *
 * Atencao sensivel:
 * - esta rotina manipula CPF/CNPJ, telefone, e-mail, endereco e dados
 *   comerciais. Nao registrar payloads completos em logs/documentacao.
 */

var CRM_LOTE_CFG = {
  VERSION: '1.0.0',
  SHEETS: {
    PROSPECTS: 'PROSPECTS',
    CLIENTES_CADASTRO: 'CLIENTES_CADASTRO',
    TRATATIVAS: 'CRM_TRATATIVAS',
    EVENTOS: 'CRM_EVENTOS',
    RESPONSAVEIS: 'CRM_RESPONSAVEIS'
  },
  FUNIL_PROSPECTS: 'FUNIL_PROSPECTS',
  FUNIL_CLIENTES: 'FUNIL_CLIENTES',
  ETAPA_PROSPECT_PADRAO: 'P_NOVO',
  ETAPA_CLIENTE_PADRAO: 'C_SINALIZADO',
  STATUS_ABERTA: 'ABERTA',
  ORIGEM: 'PLANILHA_LOTE',
  OPEN_STATUSES: ['ABERTA', 'PAUSADA'],
  PROCESS_FLAG: 'SUBIR_FRONT',
  STATUS_FIELD: 'STATUS_IMPORTACAO_CRM',
  IMPORTED_AT_FIELD: 'IMPORTADO_EM',
  ERROR_FIELD: 'ERRO_IMPORTACAO_CRM'
};

var CRM_LOTE_PROSPECT_HEADERS = [
  'PROSPECT_ID', 'CLIENTE', 'LOCAL', 'SEGMENTO', 'NOME_FANTASIA', 'RAZAO_SOCIAL', 'CNPJ_CPF',
  'ATIVIDADE_ECONOMICA', 'ENDERECO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CIDADE', 'UF', 'CEP',
  'MAPS_URL', 'CONTATO', 'CARGO', 'WHATSAPP', 'TELEFONE_2', 'EMAIL', 'INSTAGRAM', 'PERFIL',
  'POTENCIAL', 'PRIORIDADE', 'STATUS_PROSPECT', 'ETAPA_FUNIL', 'RESPONSAVEL', 'ORIGEM_LEAD',
  'CANAL_ENVIO_ATUAL', 'PARCEIRO_PRINCIPAL', 'USA_INTERMEDIADOR', 'INTERMEDIADOR_QUAL',
  'ATENDE_SACOLEIRAS_EXCURSAO', 'DOR_PRINCIPAL', 'OPORTUNIDADE_PRINCIPAL', 'DATA_CADASTRO',
  'ULTIMO_CONTATO', 'ULTIMO_RESULTADO_VISITA', 'DATA_PROXIMO_FOLLOWUP', 'PROXIMA_ACAO',
  'CHECKLIST_ULTIMA_VISITA_ID', 'CANAL_PREFERENCIAL', 'ABORDAGEM_INICIAL', 'OBJECAO_PRINCIPAL',
  'TEM_INTERESSE', 'SCORE', 'OBS', 'LATITUDE', 'LONGITUDE', 'PLACE_ID', 'STATUS_GEOCOD',
  'UPDATED_AT', 'CLIENTE_ID_CONVERTIDO', 'CLIENTE_NOME_CONVERTIDO', 'TIPO_CONVERSAO',
  'DATA_CONVERSAO', 'MATCH_STATUS', 'OBS_CONVERSAO', 'FREQUENCIA_ENVIO', 'VOLUME_MEDIO',
  'JA_POSTA_CORREIOS', 'TEM_CONTRATO_CORREIOS', 'TEM_CARTAO_POSTAGEM', 'CANAL_VENDA',
  'RESPONSAVEL_ID', 'TRATATIVA_ATIVA_ID', 'ULTIMA_ATIVIDADE_ID', 'PROXIMA_ATIVIDADE_EM',
  'SUBIR_FRONT', 'STATUS_IMPORTACAO_CRM', 'IMPORTADO_EM', 'ERRO_IMPORTACAO_CRM'
];

var CRM_LOTE_CLIENTE_HEADERS = [
  'CLIENTE_ID', 'NOME_REMETENTE_BASE', 'CLIENTE', 'NOME_FANTASIA', 'RAZAO_SOCIAL', 'CNPJ_CPF',
  'PESSOA_CONTATO', 'WHATSAPP', 'TELEFONE', 'EMAIL', 'ENDERECO', 'NUMERO', 'COMPLEMENTO',
  'BAIRRO', 'CEP', 'CIDADE', 'UF', 'LOCAL_PADRAO', 'SEGMENTO_PADRAO', 'NUMERO_CONTRATO_PADRAO',
  'CARTAO_POSTAGEM_PADRAO', 'RESPONSAVEL_ID', 'RESPONSAVEL_NOME', 'STATUS_CADASTRO',
  'OBSERVACOES', 'CRIADO_EM', 'ATUALIZADO_EM', 'ATUALIZADO_POR', 'TRATATIVA_ATIVA_ID',
  'ULTIMA_ATIVIDADE_ID', 'PROXIMA_ATIVIDADE_EM', 'SUBIR_FRONT', 'STATUS_IMPORTACAO_CRM',
  'IMPORTADO_EM', 'ERRO_IMPORTACAO_CRM'
];

var CRM_LOTE_TRATATIVA_HEADERS = [
  'TRATATIVA_ID', 'TIPO_ENTIDADE', 'ENTIDADE_ID', 'FUNIL_ID', 'ETAPA_ID', 'STATUS_TRATATIVA',
  'ORIGEM', 'ACAO_ENGINE_SNAPSHOT', 'SUB_ACAO_SNAPSHOT', 'PRIORIDADE_SNAPSHOT', 'RESPONSAVEL_ID',
  'ABERTA_EM', 'ETAPA_ATUALIZADA_EM', 'PROXIMO_FOLLOWUP_EM', 'ENCERRADA_EM', 'MOTIVO_ENCERRAMENTO',
  'UPDATED_BY', 'ATUALIZADO_EM', 'ULTIMA_ATIVIDADE_ID', 'PROXIMA_ATIVIDADE_ID', 'MOTIVO_ABERTURA',
  'CRIADO_POR', 'FECHADA_POR'
];

var CRM_LOTE_EVENTO_HEADERS = [
  'EVENTO_ID', 'DATA_HORA', 'ENTIDADE_TIPO', 'ENTIDADE_ID', 'TRATATIVA_ID', 'TIPO_EVENTO',
  'VALOR_ANTERIOR', 'VALOR_NOVO', 'RESPONSAVEL_ID', 'ORIGEM', 'METADADOS_JSON'
];

function crmLoteAdicionarMenu_(ui) {
  ui = ui || SpreadsheetApp.getUi();
  ui.createMenu('🚀 CRM')
    .addItem('Subir aba atual para o front', 'MENU_CRM_SUBIR_ABA_ATUAL')
    .addItem('Subir Prospects e Clientes', 'MENU_CRM_SUBIR_PROSPECTS_E_CLIENTES')
    .addSeparator()
    .addItem('Ver status da importacao CRM', 'MENU_CRM_STATUS_IMPORTACAO')
    .addToUi();
}

function MENU_CRM_SUBIR_ABA_ATUAL() {
  var result = crmLoteSubirCadastrosParaFront({ escopo: 'ABA_ATUAL' });
  crmLoteShowResult_(result);
  return result;
}

function MENU_CRM_SUBIR_PROSPECTS_E_CLIENTES() {
  var result = crmLoteSubirCadastrosParaFront({ escopo: 'TODOS' });
  crmLoteShowResult_(result);
  return result;
}

function MENU_CRM_STATUS_IMPORTACAO() {
  var result = crmLoteStatusImportacao_();
  crmLoteShowResult_(result);
  return result;
}

function crmLoteSubirCadastrosParaFront(options) {
  options = options || {};
  return crmLoteWithLock_(function () {
    var ss = crmLoteGetSpreadsheet_();
    var activeName = '';
    try { activeName = SpreadsheetApp.getActiveSheet().getName(); } catch (e) {}
    var escopo = crmLoteText_(options.escopo || 'ABA_ATUAL').toUpperCase();
    var processProspects = escopo === 'TODOS' || activeName === CRM_LOTE_CFG.SHEETS.PROSPECTS;
    var processClientes = escopo === 'TODOS' || activeName === CRM_LOTE_CFG.SHEETS.CLIENTES_CADASTRO;

    var report = crmLoteEmptyReport_();
    report.escopo = escopo;
    report.abaAtiva = activeName;

    if (!processProspects && !processClientes) {
      report.ok = false;
      report.warnings.push('Aba atual nao suportada. Use PROSPECTS, CLIENTES_CADASTRO ou a opcao "Subir Prospects e Clientes".');
      return report;
    }

    var responsaveis = crmLoteBuildResponsavelIndex_(ss);
    var tratamentoCtx = crmLoteBuildTratativaContext_(ss);

    if (processProspects) {
      report.prospects = crmLoteProcessProspects_(ss, responsaveis, tratamentoCtx);
    }
    if (processClientes) {
      report.clientes = crmLoteProcessClientesCadastro_(ss, responsaveis, tratamentoCtx);
    }

    crmLoteAppendTratativas_(ss, tratamentoCtx.newTratativas);
    crmLoteAppendEventos_(ss, tratamentoCtx.newEventos);
    crmLoteRebuildMasterSeNecessario_(report);
    crmLoteInvalidateCaches_();

    report.totalProcessados = report.prospects.processados + report.clientes.processados;
    report.totalCriados = report.prospects.criados + report.clientes.criados;
    report.totalTratativasCriadas = tratamentoCtx.newTratativas.length;
    report.totalErros = report.prospects.erros + report.clientes.erros;
    report.ok = report.totalErros === 0;
    return report;
  });
}

function crmLoteStatusImportacao_() {
  var ss = crmLoteGetSpreadsheet_();
  var report = crmLoteEmptyReport_();
  report.statusOnly = true;
  report.prospects = crmLoteCountSheetStatus_(ss, CRM_LOTE_CFG.SHEETS.PROSPECTS, CRM_LOTE_PROSPECT_HEADERS, 'PROSPECT_ID');
  report.clientes = crmLoteCountSheetStatus_(ss, CRM_LOTE_CFG.SHEETS.CLIENTES_CADASTRO, CRM_LOTE_CLIENTE_HEADERS, 'CLIENTE_ID');
  report.ok = true;
  return report;
}

function crmLoteProcessProspects_(ss, responsaveis, tratamentoCtx) {
  var sh = ss.getSheetByName(CRM_LOTE_CFG.SHEETS.PROSPECTS);
  var stats = crmLoteStats_();
  if (!sh) {
    stats.erros++;
    stats.mensagens.push('Aba PROSPECTS nao encontrada.');
    return stats;
  }

  crmLoteEnsureHeaders_(sh, CRM_LOTE_PROSPECT_HEADERS);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return stats;
  var headers = values[0];
  var hm = crmLoteHeaderMap_(headers);
  var rows = values.slice(1);
  var changed = false;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowNumber = i + 2;
    var cliente = crmLoteText_(crmLoteGet_(row, hm, 'CLIENTE'));
    if (!cliente) continue;
    if (!crmLoteShouldProcessRow_(row, hm, 'PROSPECT_ID')) continue;

    try {
      stats.processados++;
      var now = crmLoteNow_();
      var today = now.slice(0, 10);
      var id = crmLoteText_(crmLoteGet_(row, hm, 'PROSPECT_ID')) || crmLoteNewId_('PRS');
      var respRaw = crmLoteText_(crmLoteGet_(row, hm, 'RESPONSAVEL')) || crmLoteText_(crmLoteGet_(row, hm, 'RESPONSAVEL_ID'));
      var resp = crmLoteResolveResponsavel_(respRaw, responsaveis);

      crmLoteSet_(row, hm, 'PROSPECT_ID', id);
      crmLoteSetDefault_(row, hm, 'LOCAL', 'PROSPECTS');
      crmLoteSetDefault_(row, hm, 'CIDADE', 'Fortaleza');
      crmLoteSetDefault_(row, hm, 'UF', 'CE');
      crmLoteSetDefault_(row, hm, 'POTENCIAL', 'MEDIO');
      crmLoteSetDefault_(row, hm, 'PRIORIDADE', 'P2');
      crmLoteSetDefault_(row, hm, 'STATUS_PROSPECT', 'NOVO');
      crmLoteSetDefault_(row, hm, 'ETAPA_FUNIL', 'Novo lead');
      crmLoteSetDefault_(row, hm, 'ORIGEM_LEAD', CRM_LOTE_CFG.ORIGEM);
      crmLoteSetDefault_(row, hm, 'DATA_CADASTRO', today);
      crmLoteSetDefault_(row, hm, 'ABORDAGEM_INICIAL', 'NAO_FEITA');
      crmLoteSet_(row, hm, 'UPDATED_AT', now);
      if (resp.id) crmLoteSet_(row, hm, 'RESPONSAVEL_ID', resp.id);
      if (!resp.id) stats.avisos++;

      var treatmentId = crmLoteEnsureTratativa_(tratamentoCtx, {
        tipoEntidade: 'PROSPECT',
        entidadeId: id,
        funilId: CRM_LOTE_CFG.FUNIL_PROSPECTS,
        etapaId: CRM_LOTE_CFG.ETAPA_PROSPECT_PADRAO,
        prioridade: crmLoteText_(crmLoteGet_(row, hm, 'PRIORIDADE')),
        responsavelId: resp.id,
        motivo: 'CADASTRO_LOTE_PROSPECT'
      });
      crmLoteSet_(row, hm, 'TRATATIVA_ATIVA_ID', treatmentId);
      crmLoteSet_(row, hm, CRM_LOTE_CFG.STATUS_FIELD, 'IMPORTADO');
      crmLoteSet_(row, hm, CRM_LOTE_CFG.IMPORTED_AT_FIELD, now);
      crmLoteSet_(row, hm, CRM_LOTE_CFG.ERROR_FIELD, '');
      crmLoteSet_(row, hm, CRM_LOTE_CFG.PROCESS_FLAG, 'NAO');
      stats.criados++;
      changed = true;
    } catch (err) {
      stats.erros++;
      changed = true;
      crmLoteSet_(row, hm, CRM_LOTE_CFG.STATUS_FIELD, 'ERRO');
      crmLoteSet_(row, hm, CRM_LOTE_CFG.ERROR_FIELD, crmLoteSafeError_(err));
      stats.mensagens.push('PROSPECTS linha ' + rowNumber + ': ' + crmLoteSafeError_(err));
    }
  }

  if (changed) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return stats;
}

function crmLoteProcessClientesCadastro_(ss, responsaveis, tratamentoCtx) {
  var sh = ss.getSheetByName(CRM_LOTE_CFG.SHEETS.CLIENTES_CADASTRO);
  var stats = crmLoteStats_();
  if (!sh) {
    stats.erros++;
    stats.mensagens.push('Aba CLIENTES_CADASTRO nao encontrada.');
    return stats;
  }

  crmLoteEnsureHeaders_(sh, CRM_LOTE_CLIENTE_HEADERS);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return stats;
  var headers = values[0];
  var hm = crmLoteHeaderMap_(headers);
  var rows = values.slice(1);
  var changed = false;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowNumber = i + 2;
    var cliente = crmLoteText_(crmLoteGet_(row, hm, ['CLIENTE', 'NOME_FANTASIA', 'RAZAO_SOCIAL', 'NOME_REMETENTE_BASE']));
    if (!cliente) continue;
    if (!crmLoteShouldProcessRow_(row, hm, 'CLIENTE_ID')) continue;

    try {
      stats.processados++;
      var now = crmLoteNow_();
      var id = crmLoteText_(crmLoteGet_(row, hm, 'CLIENTE_ID')) || crmLoteNewId_('CLI_MAN');
      var respRaw = crmLoteText_(crmLoteGet_(row, hm, ['RESPONSAVEL_NOME', 'RESPONSAVEL_ID', 'RESPONSAVEL']));
      var resp = crmLoteResolveResponsavel_(respRaw, responsaveis);
      var nomeBase = crmLoteText_(crmLoteGet_(row, hm, ['NOME_REMETENTE_BASE', 'CLIENTE', 'NOME_FANTASIA', 'RAZAO_SOCIAL']));

      crmLoteSet_(row, hm, 'CLIENTE_ID', id);
      crmLoteSetDefault_(row, hm, 'NOME_REMETENTE_BASE', nomeBase || cliente);
      crmLoteSetDefault_(row, hm, 'CLIENTE', cliente);
      crmLoteSetDefault_(row, hm, 'STATUS_CADASTRO', 'ATIVO');
      crmLoteSetDefault_(row, hm, 'LOCAL_PADRAO', 'METRO');
      crmLoteSetDefault_(row, hm, 'SEGMENTO_PADRAO', 'SEM SEGMENTO');
      crmLoteSetDefault_(row, hm, 'CRIADO_EM', now);
      crmLoteSet_(row, hm, 'ATUALIZADO_EM', now);
      crmLoteSet_(row, hm, 'ATUALIZADO_POR', CRM_LOTE_CFG.ORIGEM);
      if (resp.id) crmLoteSet_(row, hm, 'RESPONSAVEL_ID', resp.id);
      if (resp.nome) crmLoteSet_(row, hm, 'RESPONSAVEL_NOME', resp.nome);
      if (!resp.id) stats.avisos++;

      var treatmentId = crmLoteEnsureTratativa_(tratamentoCtx, {
        tipoEntidade: 'CLIENTE',
        entidadeId: id,
        funilId: CRM_LOTE_CFG.FUNIL_CLIENTES,
        etapaId: CRM_LOTE_CFG.ETAPA_CLIENTE_PADRAO,
        prioridade: '',
        responsavelId: resp.id,
        motivo: 'CADASTRO_LOTE_CLIENTE'
      });
      crmLoteSet_(row, hm, 'TRATATIVA_ATIVA_ID', treatmentId);
      crmLoteSet_(row, hm, CRM_LOTE_CFG.STATUS_FIELD, 'IMPORTADO');
      crmLoteSet_(row, hm, CRM_LOTE_CFG.IMPORTED_AT_FIELD, now);
      crmLoteSet_(row, hm, CRM_LOTE_CFG.ERROR_FIELD, '');
      crmLoteSet_(row, hm, CRM_LOTE_CFG.PROCESS_FLAG, 'NAO');
      stats.criados++;
      changed = true;
    } catch (err) {
      stats.erros++;
      changed = true;
      crmLoteSet_(row, hm, CRM_LOTE_CFG.STATUS_FIELD, 'ERRO');
      crmLoteSet_(row, hm, CRM_LOTE_CFG.ERROR_FIELD, crmLoteSafeError_(err));
      stats.mensagens.push('CLIENTES_CADASTRO linha ' + rowNumber + ': ' + crmLoteSafeError_(err));
    }
  }

  if (changed) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return stats;
}

function crmLoteEnsureTratativa_(ctx, input) {
  var key = [input.tipoEntidade, input.entidadeId, input.funilId].join('|');
  if (ctx.openByEntity[key]) return ctx.openByEntity[key];

  var now = crmLoteNow_();
  var treatmentId = crmLoteNewId_('TRT');
  var obj = {
    TRATATIVA_ID: treatmentId,
    TIPO_ENTIDADE: input.tipoEntidade,
    ENTIDADE_ID: input.entidadeId,
    FUNIL_ID: input.funilId,
    ETAPA_ID: input.etapaId,
    STATUS_TRATATIVA: CRM_LOTE_CFG.STATUS_ABERTA,
    ORIGEM: CRM_LOTE_CFG.ORIGEM,
    ACAO_ENGINE_SNAPSHOT: '',
    SUB_ACAO_SNAPSHOT: '',
    PRIORIDADE_SNAPSHOT: input.prioridade || '',
    RESPONSAVEL_ID: input.responsavelId || '',
    ABERTA_EM: now,
    ETAPA_ATUALIZADA_EM: now,
    PROXIMO_FOLLOWUP_EM: '',
    ENCERRADA_EM: '',
    MOTIVO_ENCERRAMENTO: '',
    UPDATED_BY: CRM_LOTE_CFG.ORIGEM,
    ATUALIZADO_EM: now,
    ULTIMA_ATIVIDADE_ID: '',
    PROXIMA_ATIVIDADE_ID: '',
    MOTIVO_ABERTURA: input.motivo || 'CADASTRO_LOTE',
    CRIADO_POR: CRM_LOTE_CFG.ORIGEM,
    FECHADA_POR: ''
  };
  ctx.newTratativas.push(obj);
  ctx.openByEntity[key] = treatmentId;
  ctx.newEventos.push({
    EVENTO_ID: crmLoteNewId_('EVT'),
    DATA_HORA: now,
    ENTIDADE_TIPO: input.tipoEntidade,
    ENTIDADE_ID: input.entidadeId,
    TRATATIVA_ID: treatmentId,
    TIPO_EVENTO: 'TRATATIVA_CRIADA',
    VALOR_ANTERIOR: '',
    VALOR_NOVO: input.etapaId,
    RESPONSAVEL_ID: input.responsavelId || '',
    ORIGEM: CRM_LOTE_CFG.ORIGEM,
    METADADOS_JSON: JSON.stringify({ versao: CRM_LOTE_CFG.VERSION, motivo: input.motivo || 'CADASTRO_LOTE' })
  });
  return treatmentId;
}

function crmLoteBuildTratativaContext_(ss) {
  var sh = ss.getSheetByName(CRM_LOTE_CFG.SHEETS.TRATATIVAS);
  if (!sh) sh = ss.insertSheet(CRM_LOTE_CFG.SHEETS.TRATATIVAS);
  crmLoteEnsureHeaders_(sh, CRM_LOTE_TRATATIVA_HEADERS);

  var values = sh.getDataRange().getValues();
  var hm = values.length ? crmLoteHeaderMap_(values[0]) : {};
  var openByEntity = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var status = crmLoteText_(crmLoteGet_(row, hm, 'STATUS_TRATATIVA')).toUpperCase();
    if (CRM_LOTE_CFG.OPEN_STATUSES.indexOf(status) < 0) continue;
    var key = [
      crmLoteText_(crmLoteGet_(row, hm, 'TIPO_ENTIDADE')).toUpperCase(),
      crmLoteText_(crmLoteGet_(row, hm, 'ENTIDADE_ID')),
      crmLoteText_(crmLoteGet_(row, hm, 'FUNIL_ID'))
    ].join('|');
    if (!openByEntity[key]) openByEntity[key] = crmLoteText_(crmLoteGet_(row, hm, 'TRATATIVA_ID'));
  }
  return { openByEntity: openByEntity, newTratativas: [], newEventos: [] };
}

function crmLoteAppendTratativas_(ss, objects) {
  if (!objects || !objects.length) return;
  var sh = ss.getSheetByName(CRM_LOTE_CFG.SHEETS.TRATATIVAS) || ss.insertSheet(CRM_LOTE_CFG.SHEETS.TRATATIVAS);
  crmLoteEnsureHeaders_(sh, CRM_LOTE_TRATATIVA_HEADERS);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var hm = crmLoteHeaderMap_(headers);
  var rows = objects.map(function (obj) { return crmLoteObjectToRow_(obj, headers, hm); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function crmLoteAppendEventos_(ss, objects) {
  if (!objects || !objects.length) return;
  var sh = ss.getSheetByName(CRM_LOTE_CFG.SHEETS.EVENTOS) || ss.insertSheet(CRM_LOTE_CFG.SHEETS.EVENTOS);
  crmLoteEnsureHeaders_(sh, CRM_LOTE_EVENTO_HEADERS);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var hm = crmLoteHeaderMap_(headers);
  var rows = objects.map(function (obj) { return crmLoteObjectToRow_(obj, headers, hm); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function crmLoteRebuildMasterSeNecessario_(report) {
  if (!report || !report.clientes || !report.clientes.processados) return;
  try {
    if (typeof crm2_isOverlayEnabled_ === 'function' && !crm2_isOverlayEnabled_()) {
      report.warnings.push('Overlay CLIENTES_CADASTRO -> CLIENTES_MASTER esta desativado. Clientes novos podem aparecer na tratativa, mas sem todos os dados no card ate habilitar/reconstruir o master.');
      return;
    }
    if (typeof op_updateClientesMasterUnlocked_ === 'function' && typeof op_getBaseSheetSignature_ === 'function') {
      op_updateClientesMasterUnlocked_(op_getBaseSheetSignature_());
      report.masterRebuild = true;
    }
  } catch (err) {
    report.warnings.push('Nao foi possivel reconstruir CLIENTES_MASTER automaticamente: ' + crmLoteSafeError_(err));
  }
}

function crmLoteInvalidateCaches_() {
  try {
    if (typeof op_invalidateOperationCaches_ === 'function') {
      op_invalidateOperationCaches_();
      return;
    }
  } catch (e) {}
  try {
    var cache = CacheService.getScriptCache();
    ['op_prospects_v1', 'op_clients_master_v2::full', 'op_clients_master_v2::agenda', 'op_clients_master_v2::compact', 'op_clients_master_v2::lookup'].forEach(function (key) {
      cache.remove(key);
    });
  } catch (e2) {}
  try { if (typeof crm3_bumpCacheRev_ === 'function') crm3_bumpCacheRev_(); } catch (e3) {}
}

function crmLoteBuildResponsavelIndex_(ss) {
  var index = { byToken: {}, nameById: {} };
  var sh = ss.getSheetByName(CRM_LOTE_CFG.SHEETS.RESPONSAVEIS);
  if (!sh || sh.getLastRow() < 2) return index;
  var values = sh.getDataRange().getValues();
  var hm = crmLoteHeaderMap_(values[0]);
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = crmLoteText_(crmLoteGet_(row, hm, 'RESPONSAVEL_ID'));
    if (!id) continue;
    var active = crmLoteText_(crmLoteGet_(row, hm, 'USER_ACTIVE'));
    if (active && !crmLoteIsYes_(active)) continue;
    var linked = crmLoteText_(crmLoteGet_(row, hm, 'CRM_LINKED'));
    if (linked && !crmLoteIsYes_(linked)) continue;
    var username = crmLoteText_(crmLoteGet_(row, hm, 'USERNAME'));
    var display = crmLoteText_(crmLoteGet_(row, hm, 'DISPLAY_NAME'));
    index.nameById[id] = display || username || id;
    [id, username, display].forEach(function (token) {
      var k = crmLoteKey_(token);
      if (k) index.byToken[k] = id;
    });
  }
  return index;
}

function crmLoteResolveResponsavel_(value, index) {
  var raw = crmLoteText_(value);
  if (!raw) return { id: '', nome: '' };
  var id = index.byToken[crmLoteKey_(raw)] || raw;
  return { id: id, nome: index.nameById[id] || raw };
}

function crmLoteShouldProcessRow_(row, hm, idHeader) {
  var flag = crmLoteText_(crmLoteGet_(row, hm, CRM_LOTE_CFG.PROCESS_FLAG)).toUpperCase();
  var currentStatus = crmLoteText_(crmLoteGet_(row, hm, CRM_LOTE_CFG.STATUS_FIELD)).toUpperCase();
  var id = crmLoteText_(crmLoteGet_(row, hm, idHeader));
  if (flag === 'SIM' || flag === 'S' || flag === 'TRUE' || flag === '1') return true;
  if (currentStatus === 'IMPORTADO' || currentStatus === 'OK') return false;
  return !id;
}

function crmLoteCountSheetStatus_(ss, sheetName, requiredHeaders, idHeader) {
  var sh = ss.getSheetByName(sheetName);
  var stats = crmLoteStats_();
  if (!sh) {
    stats.mensagens.push('Aba nao encontrada: ' + sheetName);
    return stats;
  }
  crmLoteEnsureHeaders_(sh, requiredHeaders);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return stats;
  var hm = crmLoteHeaderMap_(values[0]);
  values.slice(1).forEach(function (row) {
    var cliente = crmLoteText_(crmLoteGet_(row, hm, ['CLIENTE', 'NOME_FANTASIA', 'RAZAO_SOCIAL', 'NOME_REMETENTE_BASE']));
    if (!cliente) return;
    stats.totalLinhas++;
    if (crmLoteShouldProcessRow_(row, hm, idHeader)) stats.pendentes++;
    if (crmLoteText_(crmLoteGet_(row, hm, CRM_LOTE_CFG.STATUS_FIELD)).toUpperCase() === 'ERRO') stats.erros++;
  });
  return stats;
}

function crmLoteEnsureHeaders_(sh, headers) {
  if (!sh) throw new Error('Aba invalida.');
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return;
  }
  var lastCol = Math.max(1, sh.getLastColumn());
  var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var hm = crmLoteHeaderMap_(existing);
  var missing = headers.filter(function (h) { return hm[crmLoteHeaderKey_(h)] === undefined; });
  if (!missing.length) return;
  if (sh.getMaxColumns() < lastCol + missing.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), lastCol + missing.length - sh.getMaxColumns());
  }
  sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function crmLoteObjectToRow_(obj, headers, hm) {
  var row = new Array(headers.length).fill('');
  Object.keys(obj).forEach(function (key) {
    var idx = hm[crmLoteHeaderKey_(key)];
    if (idx !== undefined) row[idx] = obj[key];
  });
  return row;
}

function crmLoteSetDefault_(row, hm, header, value) {
  if (!crmLoteText_(crmLoteGet_(row, hm, header))) crmLoteSet_(row, hm, header, value);
}

function crmLoteSet_(row, hm, header, value) {
  var idx = hm[crmLoteHeaderKey_(header)];
  if (idx !== undefined) row[idx] = value;
}

function crmLoteGet_(row, hm, names) {
  var arr = Array.isArray(names) ? names : [names];
  for (var i = 0; i < arr.length; i++) {
    var idx = hm[crmLoteHeaderKey_(arr[i])];
    if (idx !== undefined) return row[idx];
  }
  return '';
}

function crmLoteHeaderMap_(headers) {
  if (typeof op_buildHeaderMap_ === 'function') return op_buildHeaderMap_(headers);
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = crmLoteHeaderKey_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }
  return map;
}

function crmLoteHeaderKey_(v) {
  var s = crmLoteText_(v);
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return s.toUpperCase().replace(/[%]/g, ' PERCENT ').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
}

function crmLoteKey_(v) {
  var s = crmLoteText_(v);
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return s.toLowerCase().trim();
}

function crmLoteText_(v) {
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    try { return Utilities.formatDate(v, Session.getScriptTimeZone() || 'America/Fortaleza', 'yyyy-MM-dd'); } catch (e) { return String(v); }
  }
  return String(v).trim();
}

function crmLoteNow_() {
  if (typeof op_nowIso_ === 'function') return op_nowIso_();
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Fortaleza', "yyyy-MM-dd'T'HH:mm:ss");
}

function crmLoteNewId_(prefix) {
  return prefix + '_' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function crmLoteIsYes_(v) {
  var s = crmLoteText_(v).toUpperCase();
  return s === 'SIM' || s === 'S' || s === 'TRUE' || s === '1' || s === 'YES';
}

function crmLoteSafeError_(err) {
  var msg = (err && err.message) ? err.message : String(err || 'Erro desconhecido');
  return msg.replace(/[\r\n]+/g, ' ').slice(0, 280);
}

function crmLoteGetSpreadsheet_() {
  if (typeof op_getSpreadsheet_ === 'function') return op_getSpreadsheet_();
  return SpreadsheetApp.getActiveSpreadsheet();
}

function crmLoteWithLock_(fn) {
  if (typeof op_withDocumentLock_ === 'function') return op_withDocumentLock_(fn);
  var lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock) throw new Error('Nao foi possivel obter lock para importar cadastros.');
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function crmLoteStats_() {
  return {
    processados: 0,
    criados: 0,
    erros: 0,
    avisos: 0,
    pendentes: 0,
    totalLinhas: 0,
    mensagens: []
  };
}

function crmLoteEmptyReport_() {
  return {
    ok: true,
    version: CRM_LOTE_CFG.VERSION,
    prospects: crmLoteStats_(),
    clientes: crmLoteStats_(),
    warnings: [],
    totalProcessados: 0,
    totalCriados: 0,
    totalTratativasCriadas: 0,
    totalErros: 0,
    masterRebuild: false
  };
}

function crmLoteShowResult_(report) {
  var msg = crmLoteFormatReport_(report);
  try {
    SpreadsheetApp.getUi().alert('CRM - Subir para o front', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    try { SpreadsheetApp.getActive().toast(msg.slice(0, 240), 'CRM', 8); } catch (e2) {}
  }
}

function crmLoteFormatReport_(r) {
  var lines = [];
  lines.push(r.ok ? 'Concluido.' : 'Concluido com pendencias.');
  if (r.statusOnly) {
    lines.push('');
    lines.push('PROSPECTS: ' + r.prospects.pendentes + ' pendente(s), ' + r.prospects.erros + ' erro(s).');
    lines.push('CLIENTES_CADASTRO: ' + r.clientes.pendentes + ' pendente(s), ' + r.clientes.erros + ' erro(s).');
    return lines.join('\n');
  }
  lines.push('');
  lines.push('Prospects processados: ' + r.prospects.processados + ' | erros: ' + r.prospects.erros);
  lines.push('Clientes processados: ' + r.clientes.processados + ' | erros: ' + r.clientes.erros);
  lines.push('Tratativas criadas: ' + r.totalTratativasCriadas);
  if (r.masterRebuild) lines.push('CLIENTES_MASTER reconstruida.');
  if (r.warnings && r.warnings.length) {
    lines.push('');
    lines.push('Avisos:');
    r.warnings.slice(0, 5).forEach(function (w) { lines.push('- ' + w); });
  }
  var mensagens = [].concat(r.prospects.mensagens || [], r.clientes.mensagens || []);
  if (mensagens.length) {
    lines.push('');
    lines.push('Erros:');
    mensagens.slice(0, 8).forEach(function (m) { lines.push('- ' + m); });
  }
  return lines.join('\n');
}
