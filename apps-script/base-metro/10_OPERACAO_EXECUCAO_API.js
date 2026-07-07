/**
 * 10_OPERACAO_EXECUCAO_API.gs
 * ------------------------------------------------------------
 * Web App para o módulo Operação: Agenda Comercial, clientes e visão em funil.
 * COLETAS foi desativado na Fase 5.
 */

function op_doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var action = op_norm_(p.action || 'init_operacao');
    if (action.indexOf('portal_') === 0) {
      return op_jsonOut_(portal_doGet_(p));
    }
    if (action === 'init_operacao') {
      return op_jsonOut_(op_apiInit_(p));
    }
    if (action === 'get_crm_data') {
      p.view = 'crm';
      return op_jsonOut_(op_apiInit_(p));
    }
    if (action === 'get_agenda_data') {
      p.view = 'agenda';
      return op_jsonOut_(op_apiInit_(p));
    }
    if (action === 'get_cliente') {
      return op_jsonOut_(op_apiGetCliente_(p));
    }
    if (action === 'get_prospects') {
      return op_jsonOut_(op_apiGetProspects_());
    }
    if (action === 'get_prospect') {
      return op_jsonOut_(op_apiGetProspect_(p));
    }
    if (action === 'get_midias_catalog') {
      return op_jsonOut_(op_apiGetMidiasCatalog_(p));
    }
    if (action === 'get_crm_config_v2') {
      return op_jsonOut_(crm_apiGetConfigV2_());
    }
    // PERF V5: boot progressivo. boot_lite devolve config + indicadores em
    // segundos e aquece os caches compartilhados; o front busca jornadas e
    // agenda em paralelo na sequencia (rotas v3 existentes, agora rapidas).
    if (action === 'get_crm_boot_lite_v5') {
      return op_jsonOut_(crm5x_apiBootLite_(p));
    }
    if (action === 'warm_crm_cache_v5') {
      return op_jsonOut_(crm5x_apiWarmup_());
    }
    if (action === 'clear_crm_cache_v5') {
      return op_jsonOut_(crm5x_apiClearCache_());
    }
    if (action === 'get_crm_boot_v4') {
      return op_jsonOut_(crm3_apiGetBootV4_(p));
    }
    if (action === 'get_crm_boot_v3') {
      return op_jsonOut_(crm3_apiGetBoot_(p));
    }
    if (action === 'get_crm_config_v3') {
      return op_jsonOut_(crm3_apiGetConfig_());
    }
    if (action === 'get_crm_jornada_data') {
      return op_jsonOut_(crm3_apiGetJornada_(p));
    }
    if (action === 'get_crm_agenda_v3') {
      return op_jsonOut_(crm3_apiGetAgenda_(p));
    }
    if (action === 'get_crm_dashboard_v3') {
      return op_jsonOut_(crm3_apiGetDashboard_(p));
    }
    if (action === 'get_entity_checklists_v7') {
      return op_jsonOut_(crm7_apiGetEntityChecklists_(p));
    }
    if (action === 'get_entity_notes_v8') {
      return op_jsonOut_(crm8_apiGetEntityNotes_(p));
    }
    if (action === 'ping') {
      return op_jsonOut_({ ok:true, now: op_nowIso_() });
    }
    return op_jsonOut_({ ok:false, error:'Ação GET inválida: ' + action });
  } catch (err) {
    return op_jsonOut_({ ok:false, error: err.message || String(err) });
  }
}

function op_doPost(e) {
  return op_withDocumentLock_(function(){
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var action = op_norm_(p.action || '');
    var payload = {};
    if (e && e.postData && e.postData.contents) payload = JSON.parse(e.postData.contents || '{}');

    var result;
    if (action === 'save_agenda_item') result = op_apiSaveAgendaItem_(payload);
    else if (action === 'update_agenda_status') result = op_apiUpdateAgendaStatus_(payload);
    else if (action === 'update_cliente') result = op_apiUpdateCliente_(payload);
    else if (action === 'create_cliente') result = op_apiCreateCliente_(payload);
    else if (action === 'create_prospect') result = op_apiCreateProspect_(payload);
    else if (action === 'update_prospect') result = op_apiUpdateProspect_(payload);
    else if (action === 'save_checklist') result = op_apiSaveChecklist_(payload);
    else if (action === 'save_entity_note_v8') result = crm8_apiSaveEntityNote_(payload);
    else if (action === 'sync_prospect_conversions') result = op_syncProspectConversions_();
    else if (action === 'create_tratativa') result = crm3_apiCreateTratativa_(payload);
    else if (action === 'move_tratativa') result = crm3_apiMoveTratativa_(payload);
    else if (action === 'move_tratativas_lote') result = crm3_apiMoveTratativasLote_(payload);
    else if (action === 'save_atividade') result = crm3_apiSaveAtividade_(payload);
    else if (action === 'complete_atividade') result = crm3_apiCompleteAtividade_(payload);
    else if (action === 'cancel_atividade') result = crm3_apiCancelAtividade_(payload);
    else if (action === 'delete_agenda_item' || action === 'delete_agenda' || action === 'remove_agenda_item' || action === 'excluir_agenda_item') result = crm3_apiDeleteAtividade_(payload);
    else return op_jsonOut_({ ok:false, error:'Ação POST inválida: ' + action });

    op_invalidateOperationCaches_();
    return op_jsonOut_(result);
  } catch (err) {
    return op_jsonOut_({ ok:false, error: err.message || String(err) });
  }
  });
}

function op_invalidateInitCache_(){
  op_invalidateOperationCaches_();
}
function op_invalidateOperationCaches_(){
  try {
    var c = gc_();
    [
      'op_blocks_v1',
      'op_midias_v1',
      'op_prospects_v1',
      'op_clients_master_v2::full',
      'op_clients_master_v2::agenda',
      'op_clients_master_v2::compact',
      'op_clients_master_v2::lookup'
    ].forEach(function(k){ c.remove(k); });

    var now = new Date();
    ['all','crm','agenda'].forEach(function(view){
      c.remove('op_init_' + view + '_');
      for (var i = -4; i <= 4; i++) {
        var d = new Date(now);
        d.setDate(d.getDate() + (i * 7));
        var ws = op_getWeekStart_(op_toYmd_(d));
        c.remove('op_init_' + view + '_' + ws);
        c.remove('op_agenda_' + ws + '_' + op_addDays_(ws, 4));
      }
    });
  } catch(e) { }
  try { if (typeof crm3_bumpCacheRev_ === 'function') crm3_bumpCacheRev_(); } catch(e3) { }
}

function op_jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function op_dateValueToYmd_(v){
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return op_toYmd_(v);
}
function op_timeValueToText_(v){
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }
  var s = op_norm_(v);
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return Utilities.formatString('%02d:%02d', Number(m[1]), Number(m[2]));
  var d = new Date(s);
  if (!isNaN(d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
  return s;
}
function op_daysAgoLabel_(v){
  var ymd = op_dateValueToYmd_(v);
  if (!ymd) return 'Sem postagem';
  var diff = op_diffDays_(op_toYmd_(new Date()), ymd);
  if (diff < 0) diff = 0;
  return diff + 'd';
}

function op_buildInitMeta_(weekStart){
  var weekEnd = op_addDays_(weekStart, 4);
  return {
    weekStart: weekStart,
    weekEnd: weekEnd,
    days: op_buildWeekDays_(weekStart),
    lastUpdated: op_nowIso_()
  };
}
function op_apiInit_(params){
  params = params || {};
  var view = op_norm_(params.view || 'all').toLowerCase();
  if (['all','crm','agenda'].indexOf(view) < 0) view = 'all';

  var weekStart = op_getWeekStart_(params.weekStart);
  var cacheKey = 'op_init_' + view + '_' + weekStart;
  var cached = gcj_(cacheKey);
  if (cached) return cached;

  op_setupOperacao();
  op_ensureMasterFresh_({ allowStale:true });

  var meta = op_buildInitMeta_(weekStart);
  var weekEnd = meta.weekEnd;
  var result = { ok:true, meta: meta };

  if (view === 'crm') {
    var crmClients = op_readClientsMaster_({ projection:'full' });
    var prospects = op_readProspects_();
    result.clients = crmClients.items;
    result.filters = crmClients.filters;
    result.funil = op_buildFunil_(crmClients.items);
    result.prospects = prospects.items;
    result.prospectFilters = prospects.filters;
    result.dashboardComercial = op_buildDashboardComercial_(weekStart, weekEnd, crmClients.items, prospects.items);
    pcj_(cacheKey, result, OP_CFG.CACHE.INIT_SEC);
    return result;
  }

  var blocks = op_readBlocks_();
  var blocksById = {};
  blocks.forEach(function(x){ blocksById[x.blocoId] = x; });

  if (view === 'agenda') {
    var agendaClients = op_readClientsMaster_({ projection:'agenda' });
    var agenda = op_readAgendaItemsWithBlocks_(weekStart, weekEnd, agendaClients.byId, blocksById);
    var agendaProspects = op_readProspects_();
    result.blocks = blocks;
    result.agenda = agenda.items.filter(function(x){ return x.tipoGrupo !== 'COLETA'; });
    result.visits = result.agenda.slice();
    result.coletas = []; // compatibilidade temporária com frontends antigos
    result.clients = agendaClients.items;
    result.filters = agendaClients.filters;
    result.prospects = agendaProspects.items;
    result.prospectFilters = agendaProspects.filters;
    pcj_(cacheKey, result, OP_CFG.CACHE.INIT_SEC);
    return result;
  }

  var clients = op_readClientsMaster_({ projection:'full' });
  var agendaAll = op_readAgendaItemsWithBlocks_(weekStart, weekEnd, clients.byId, blocksById);
  var midias = op_readMidias_();
  var prospects = op_readProspects_();
  result.blocks = blocks;
  result.agenda = agendaAll.items.filter(function(x){ return x.tipoGrupo !== 'COLETA'; });
  result.visits = result.agenda.slice();
  result.coletas = []; // compatibilidade temporária com frontends antigos
  result.clients = clients.items;
  result.filters = clients.filters;
  result.funil = op_buildFunil_(clients.items);
  result.midias = midias;
  result.prospects = prospects.items;
  result.prospectFilters = prospects.filters;
  result.dashboardComercial = op_buildDashboardComercial_(weekStart, weekEnd, clients.items, prospects.items, agendaAll.items);
  pcj_(cacheKey, result, OP_CFG.CACHE.INIT_SEC);
  return result;
}

function op_apiGetCliente_(params){
  var clients = op_readClientsMaster_({ projection:'full' });
  var row = null;
  if (params.clienteId) row = clients.byId[params.clienteId] || null;
  if (!row && params.cliente) {
    var wanted = op_norm_(params.cliente).toLowerCase();
    row = clients.items.filter(function(x){ return op_norm_(x.cliente).toLowerCase() === wanted; })[0] || null;
  }
  return { ok:true, cliente: row };
}

function op_apiSaveAgendaItem_(payload){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.AGENDA);
  if (!sh) throw new Error('Aba AGENDA_EXECUCAO não encontrada.');
  var data = op_norm_(payload.data);
  var block = op_readBlocksById_()[op_norm_(payload.blocoId)];
  if (!data) throw new Error('Data obrigatória.');
  if (!block) throw new Error('Bloco inválido.');
  var agendaId = 'AGD_' + Utilities.getUuid().slice(0,8).toUpperCase();
  var now = op_nowIso_();
  var clienteId = op_norm_(payload.clienteId);
  var cliente = op_norm_(payload.cliente || payload.nomeCliente);
  if (!cliente) throw new Error('Cliente obrigatório.');
  var tipo = op_norm_(payload.tipoAtividade || block.tipoAtividade || 'VISITA');
  if (op_tipoGrupo_(tipo) === 'COLETA') throw new Error('COLETAS foi desativado. Cadastre uma atividade comercial válida.');
  var origemTipo = op_norm_(payload.origemTipo || 'CLIENTE');
  var origemId = op_norm_(payload.origemId || clienteId);
  var prospectId = origemTipo === 'PROSPECT' ? origemId : '';
  var clienteMasterId = origemTipo === 'CLIENTE' ? clienteId : '';
  var row = [
    agendaId,
    data,
    op_weekdayPt_(data),
    block.blocoId,
    op_timeValueToText_(block.horaInicio),
    op_timeValueToText_(block.horaFim),
    tipo,
    block.cor,
    clienteId,
    cliente,
    op_norm_(payload.local),
    op_norm_(payload.statusAgenda || 'PLANEJADO'),
    op_norm_(payload.prioridade || 'MÉDIA'),
    Number(payload.ordemAgenda || 999),
    op_norm_(payload.obsPlanejada),
    '',
    op_norm_(payload.midiaSugerida),
    op_norm_(payload.linkMidiaDireto),
    op_norm_(payload.responsavel || 'Júlio'),
    '',
    now,
    now,
    origemTipo,
    origemId,
    prospectId,
    clienteMasterId,
    ''
  ];
  sh.appendRow(row);
  op_invalidateOperationCaches_();
  return { ok:true, agendaId:agendaId };
}

function op_apiUpdateAgendaStatus_(payload){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.AGENDA);
  if (!sh) throw new Error('Aba AGENDA_EXECUCAO não encontrada.');
  var all = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(all[0]);
  var agendaId = op_norm_(payload.agendaId);
  if (!agendaId) throw new Error('agendaId obrigatório.');
  var targetRow = -1;
  for (var i=1;i<all.length;i++) {
    if (op_norm_(all[i][hm['AGENDA_ID']]) === agendaId) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) throw new Error('Item da agenda não encontrado.');
  var status = op_norm_(payload.statusAgenda || 'CONCLUÍDO');
  var item = sh.getRange(targetRow, 1, 1, sh.getLastColumn()).getValues()[0];
  item[hm['STATUS_AGENDA']] = status;
  item[hm['OBS_EXECUCAO']] = op_norm_(payload.obsExecucao);
  item[hm['EXECUTADO_EM']] = op_nowIso_();
  item[hm['ATUALIZADO_EM']] = op_nowIso_();
  sh.getRange(targetRow, 1, 1, item.length).setValues([item]);

  var tipo = op_norm_(item[hm['TIPO_ATIVIDADE']]);
  var clienteId = op_norm_(item[hm['CLIENTE_ID']]);
  var cliente = op_norm_(item[hm['CLIENTE']]);
  var local = op_norm_(item[hm['LOCAL']]);
  var blocoId = op_norm_(item[hm['BLOCO_ID']]);
  var data = op_norm_(item[hm['DATA']]);
  var obs = op_norm_(payload.obsExecucao);
  if (op_tipoGrupo_(tipo) === 'COLETA') throw new Error('COLETAS foi desativado. O item legado deve ser removido pela limpeza da Fase 5.');
  op_appendInteracao_(data, clienteId, cliente, tipo, status, payload.resultado || status, obs, payload.proximaAcao, payload.responsavel || 'Júlio');
  if (payload.checklistId && hm['CHECKLIST_ID'] !== undefined) item[hm['CHECKLIST_ID']] = op_norm_(payload.checklistId);
  var resultadoNorm = op_visitNormResult_(payload.resultado || '');
  var statusNorm = op_visitNormStatus_(status);
  var origemTipo = op_norm_(item[hm['ORIGEM_TIPO']] || 'CLIENTE');
  var origemId = op_norm_(item[hm['ORIGEM_ID']]);

  if (hm['ATUALIZADO_EM'] !== undefined) item[hm['ATUALIZADO_EM']] = op_nowIso_();
  sh.getRange(targetRow, 1, 1, item.length).setValues([item]);

  op_invalidateOperationCaches_();

  var lcCtx = {
    statusVisita: statusNorm,
    checklistId: op_norm_(payload.checklistId),
    proximaAcao: op_norm_(payload.proximaAcao),
    resultadoRaw: op_norm_(payload.resultado),
    observacaoCurta: op_norm_(payload.obsExecucao)
  };
  if (origemTipo === 'PROSPECT' && origemId) {
    try { op_updateProspectLifecycle_(origemId, resultadoNorm, tipo, statusNorm, lcCtx); } catch(e) { Logger.log('LC prospect error: '+e); }
  } else {
    try { op_updateClienteLifecycle_(clienteId, resultadoNorm, tipo, lcCtx); } catch(e) { Logger.log('LC error: '+e); }
  }
  return { ok:true, resultado: resultadoNorm, status: statusNorm };
}

function op_apiUpdateCliente_(payload){
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh) throw new Error('Aba CLIENTES_MASTER não encontrada.');
  var all = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(all[0]);
  var clienteId = op_norm_(payload.clienteId);
  if (!clienteId) throw new Error('clienteId obrigatório.');
  var rowIndex = -1;
  for (var i=1;i<all.length;i++) if (op_norm_(all[i][hm['CLIENTE_ID']]) === clienteId) { rowIndex = i + 1; break; }
  if (rowIndex < 0) throw new Error('Cliente não encontrado.');

  var allowed = {
    'CLIENTE':'CLIENTE','RAZAO_SOCIAL':'RAZAO_SOCIAL','PESSOA_CONTATO':'PESSOA_CONTATO','WHATSAPP':'WHATSAPP','EMAIL':'EMAIL',
    'ENDERECO':'ENDERECO','NUMERO':'NUMERO','COMPLEMENTO':'COMPLEMENTO','BAIRRO':'BAIRRO','CEP':'CEP','MIDIA':'MIDIA',
    'LINK_MIDIA_DIRETO':'LINK_MIDIA_DIRETO','STATUS_COMERCIAL':'STATUS_COMERCIAL','OBSERVACOES':'OBSERVACOES','ULTIMA_VISITA':'ULTIMA_VISITA',
    'PROXIMA_ACAO_MANUAL':'PROXIMA_ACAO_MANUAL','RESPONSAVEL_CARTEIRA':'RESPONSAVEL_CARTEIRA','CNPJ_CPF':'CNPJ_CPF','NOME_FANTASIA':'NOME_FANTASIA',
    'NUMERO_CONTRATO':'NUMERO_CONTRATO','CARTAO_POSTAGEM':'CARTAO_POSTAGEM','SEGMENTO_PREDOMINANTE':'SEGMENTO_PREDOMINANTE','ACAO':'ACAO','ACAO_ATUAL':'ACAO_ATUAL'
  };
  var rowValues = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(allowed).forEach(function(k){
    if (payload[k] !== undefined && hm[allowed[k]] !== undefined) {
      rowValues[hm[allowed[k]]] = payload[k];
    }
  });
  var acaoPayload = payload.ACAO_ATUAL !== undefined ? payload.ACAO_ATUAL : payload.ACAO;
  if (acaoPayload !== undefined) {
    if (hm['ACAO_ATUAL'] !== undefined) rowValues[hm['ACAO_ATUAL']] = acaoPayload;
    if (hm['ACAO'] !== undefined) rowValues[hm['ACAO']] = acaoPayload; // compatibilidade temporária
  }
  sh.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  try { if (typeof crm_upsertCadastroFromMasterRow_ === 'function') crm_upsertCadastroFromMasterRow_(rowValues, hm, { origem:'CRM_API_UPDATE' }); } catch (e) { Logger.log('[CRM2] Cadastro sync update: ' + e); }
  op_invalidateOperationCaches_();
  return { ok:true, clienteId:clienteId };
}

function op_apiCreateCliente_(payload){
  var cliente = op_norm_(payload.cliente);
  if (!cliente) throw new Error('Nome do cliente obrigatório.');
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh) throw new Error('Aba CLIENTES_MASTER não encontrada.');
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var id = 'CLI_' + op_padNumber_(sh.getLastRow(), 6) + '_M';
  var row = headers.map(function(h){
    var hk = op_headerKey_(h);
    var map = {
      'CLIENTE_ID': id,
      'NOME_REMETENTE_BASE': cliente,
      'CLIENTE': cliente,
      'LOCAL_PREDOMINANTE': op_norm_(payload.local || 'METRO'),
      'STATUS_COMERCIAL': 'NOVO',
      'RAZAO_SOCIAL': op_norm_(payload.razaoSocial),
      'CNPJ_CPF': op_norm_(payload.cnpjCpf),
      'NOME_FANTASIA': op_norm_(payload.nomeFantasia),
      'NUMERO_CONTRATO': op_norm_(payload.numeroContrato),
      'CARTAO_POSTAGEM': op_norm_(payload.cartaoPostagem),
      'SEGMENTO_PREDOMINANTE': op_norm_(payload.segmento),
      'PESSOA_CONTATO': op_norm_(payload.pessoaContato),
      'WHATSAPP': op_norm_(payload.whatsapp),
      'EMAIL': op_norm_(payload.email),
      'OBSERVACOES': op_norm_(payload.observacoes),
      'ACAO_ENGINE': op_norm_(payload.acaoEngine || 'MANTER'),
      'ACAO_ATUAL': op_norm_(payload.acaoAtual || payload.acao || 'MANTER'),
      'ACAO': op_norm_(payload.acaoAtual || payload.acao || 'MANTER')
    };
    return map[hk] != null ? map[hk] : '';
  });
  sh.appendRow(row);
  try { if (typeof crm_upsertCadastroFromMasterRow_ === 'function') crm_upsertCadastroFromMasterRow_(row, op_buildHeaderMap_(headers), { origem:'CRM_API_CREATE' }); } catch (e) { Logger.log('[CRM2] Cadastro sync create: ' + e); }
  op_invalidateOperationCaches_();
  return { ok:true, clienteId:id };
}

/* ========================= READERS ========================= */
function op_readBlocks_(){
  var cacheKey = 'op_blocks_v1';
  var cached = op_cacheGetJson_(cacheKey);
  if (cached) return cached;
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.BLOCKS);
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var out = values.slice(1).map(function(r){
    return {
      blocoId: op_norm_(op_getCell_(r, hm, 'BLOCO_ID')),
      ordem: Number(op_getCell_(r, hm, 'ORDEM')) || 0,
      horaInicio: op_timeValueToText_(op_getCell_(r, hm, 'HORA_INICIO')),
      horaFim: op_timeValueToText_(op_getCell_(r, hm, 'HORA_FIM')),
      nomeBloco: op_norm_(op_getCell_(r, hm, 'NOME_BLOCO')),
      tipoAtividade: op_norm_(op_getCell_(r, hm, 'TIPO_ATIVIDADE')),
      cor: op_norm_(op_getCell_(r, hm, ['COR_PADRAO','COR'])),
      ativo: op_norm_(op_getCell_(r, hm, 'ATIVO') || 'SIM'),
      permiteAgendamento: op_norm_(op_getCell_(r, hm, 'PERMITE_AGENDAMENTO') || 'SIM'),
      obs: op_norm_(op_getCell_(r, hm, 'OBS'))
    };
  }).sort(function(a,b){ return a.ordem - b.ordem; });
  op_cachePutJson_(cacheKey, out, OP_CFG.CACHE.BLOCKS_SEC);
  return out;
}
function op_readBlocksById_(){
  var out = {}; op_readBlocks_().forEach(function(x){ out[x.blocoId] = x; }); return out;
}
function op_projectClient_(row, hm, projection, rowNumber){
  var base = {
    rowNumber: rowNumber,
    clienteId: op_norm_(op_getCell_(row, hm, 'CLIENTE_ID')),
    cliente: op_norm_(op_getCell_(row, hm, 'CLIENTE')) || op_norm_(op_getCell_(row, hm, 'NOME_REMETENTE_BASE')),
    local: op_norm_(op_getCell_(row, hm, 'LOCAL_PREDOMINANTE')),
    curva: op_norm_(op_getCell_(row, hm, 'CURVA')),
    acao: op_norm_(op_getCell_(row, hm, 'ACAO_ATUAL')) || op_norm_(op_getCell_(row, hm, 'ACAO')),
    acaoEngine: op_norm_(op_getCell_(row, hm, 'ACAO_ENGINE')) || op_norm_(op_getCell_(row, hm, 'ACAO')),
    acaoAtual: op_norm_(op_getCell_(row, hm, 'ACAO_ATUAL')) || op_norm_(op_getCell_(row, hm, 'ACAO')),
    subAcao: op_norm_(op_getCell_(row, hm, 'SUB_ACAO')),
    prioridadeFila: op_norm_(op_getCell_(row, hm, 'PRIORIDADE_FILA')),
    canalSugerido: op_norm_(op_getCell_(row, hm, 'CANAL_SUGERIDO')),
    conteudoSugerido: op_norm_(op_getCell_(row, hm, 'CONTEUDO_SUGERIDO')),
    motivoRegra: op_norm_(op_getCell_(row, hm, 'MOTIVO_REGRA')),
    midia: op_norm_(op_getCell_(row, hm, 'MIDIA')),
    linkMidiaDireto: op_norm_(op_getCell_(row, hm, 'LINK_MIDIA_DIRETO')),
    whatsapp: op_norm_(op_getCell_(row, hm, 'WHATSAPP')),
    ultimaPostagemLabel: op_daysAgoLabel_(op_getCell_(row, hm, 'DATA_ULTIMA_POSTAGEM')),
    diasSemPostar: Number(op_getCell_(row, hm, 'DIAS_SEM_POSTAR')) || 0
  };
  if (projection === 'agenda' || projection === 'compact') return base;

  base.razaoSocial = op_norm_(op_getCell_(row, hm, 'RAZAO_SOCIAL'));
  base.cnpjCpf = op_norm_(op_getCell_(row, hm, 'CNPJ_CPF'));
  base.nomeFantasia = op_norm_(op_getCell_(row, hm, 'NOME_FANTASIA'));
  base.pessoaContato = op_norm_(op_getCell_(row, hm, 'PESSOA_CONTATO'));
  base.email = op_norm_(op_getCell_(row, hm, 'EMAIL'));
  base.endereco = op_norm_(op_getCell_(row, hm, 'ENDERECO'));
  base.numero = op_norm_(op_getCell_(row, hm, 'NUMERO'));
  base.complemento = op_norm_(op_getCell_(row, hm, 'COMPLEMENTO'));
  base.bairro = op_norm_(op_getCell_(row, hm, 'BAIRRO'));
  base.cep = op_norm_(op_getCell_(row, hm, 'CEP'));
  base.scorePrioridade = Number(op_getCell_(row, hm, 'SCORE_PRIORIDADE')) || 0;
  base.perfilComercial = op_norm_(op_getCell_(row, hm, 'PERFIL_COMERCIAL'));
  base.porteOperacional = op_norm_(op_getCell_(row, hm, 'PORTE_OPERACIONAL'));
  base.shareLocal30d = Number(op_getCell_(row, hm, 'SHARE_LOCAL_30D')) || 0;
  base.nivelAlerta = op_norm_(op_getCell_(row, hm, 'NIVEL_ALERTA'));
  base.quedaReal = op_norm_(op_getCell_(row, hm, 'QUEDA_REAL'));
  base.quedaLeveSazonal = op_norm_(op_getCell_(row, hm, 'QUEDA_LEVE_SAZONAL'));
  base.novoCliente = op_norm_(op_getCell_(row, hm, 'NOVO_CLIENTE'));
  base.segmento = op_norm_(op_getCell_(row, hm, 'SEGMENTO_PREDOMINANTE'));
  base.tipo = op_norm_(op_getCell_(row, hm, 'TIPO_SERVICO_PREDOMINANTE'));
  base.intermediador = op_norm_(op_getCell_(row, hm, 'INTERMEDIADOR_PREDOMINANTE'));
  base.statusComercial = op_norm_(op_getCell_(row, hm, 'STATUS_COMERCIAL'));
  base.observacoes = op_norm_(op_getCell_(row, hm, 'OBSERVACOES'));
  base.ultimaVisita = op_norm_(op_getCell_(row, hm, 'ULTIMA_VISITA'));
  base.proximaAcaoManual = op_norm_(op_getCell_(row, hm, 'PROXIMA_ACAO_MANUAL'));
  base.dataPrimeiraPostagem = op_dateValueToYmd_(op_getCell_(row, hm, 'DATA_PRIMEIRA_POSTAGEM'));
  base.dataUltimaPostagem = op_dateValueToYmd_(op_getCell_(row, hm, 'DATA_ULTIMA_POSTAGEM'));
  base.inativo60d = op_norm_(op_getCell_(row, hm, 'INATIVO_60D'));
  base.temContrato = op_norm_(op_getCell_(row, hm, 'TEM_CONTRATO'));
  base.numeroContrato = op_norm_(op_getCell_(row, hm, 'NUMERO_CONTRATO'));
  base.cartao = op_norm_(op_getCell_(row, hm, 'CARTAO_POSTAGEM'));
  base.tendencia = op_norm_(op_getCell_(row, hm, 'TENDENCIA'));
  base.bucket = op_norm_(op_getCell_(row, hm, 'BUCKET_NEGOCIO'));
  base.movimentoCurva = op_norm_(op_getCell_(row, hm, 'MOVIMENTO_CURVA'));
  base.recorrenciaNivel = op_norm_(op_getCell_(row, hm, 'RECORRENCIA_NIVEL'));
  base.qtd30d = Number(op_getCell_(row, hm, 'QTD_30D')) || 0;
  base.valor30d = Number(op_getCell_(row, hm, 'FAT_30D')) || 0;
  base.qtdTotal = Number(op_getCell_(row, hm, 'QTD_TOTAL')) || 0;
  base.valorTotal = Number(op_getCell_(row, hm, 'VALOR_TOTAL')) || 0;
  return base;
}
function op_readClientsMaster_(options){
  options = options || {};
  var projection = op_norm_(options.projection || 'full').toLowerCase();
  if (['full','agenda','compact','lookup'].indexOf(projection) < 0) projection = 'full';

  var cacheKey = 'op_clients_master_v2::' + projection;
  var cached = op_cacheGetJson_(cacheKey);
  if (cached) return cached;

  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) op_ensureMasterFresh_({ allowStale:true });
  sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) return { items: [], filters: { locals:[], curvas:[], acoes:[], midias:[] }, byId: {} };

  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var items = values.slice(1).map(function(r, idx){
    return op_projectClient_(r, hm, projection, idx + 2);
  }).filter(function(x){ return !!x.clienteId; });

  var filters = {
    locals: op_uniqueSorted_(items.map(function(x){ return x.local; })),
    tipos: op_uniqueSorted_(items.map(function(x){ return x.tipo; })),
    inters: op_uniqueSorted_(items.map(function(x){ return x.intermediador; })),
    segs: op_uniqueSorted_(items.map(function(x){ return x.segmento; })),
    curvas: op_uniqueSorted_(items.map(function(x){ return x.curva; })),
    acoes: op_uniqueSorted_(items.map(function(x){ return x.acao; })),
    midias: op_uniqueSorted_(items.map(function(x){ return x.midia; }))
  };
  var byId = {};
  items.forEach(function(x){ byId[x.clienteId] = x; });

  var result = { items: items, filters: filters, byId: byId };
  op_cachePutJson_(cacheKey, result, OP_CFG.CACHE.CLIENTS_SEC);
  return result;
}

function op_readAgendaItems_(startDate, endDate, clientsById){
  return op_readAgendaItemsWithBlocks_(startDate, endDate, clientsById, op_readBlocksById_());
}
function op_readAgendaItemsWithBlocks_(startDate, endDate, clientsById, blocks){
  var cacheKey = 'op_agenda_' + startDate + '_' + endDate;
  var cached = op_cacheGetJson_(cacheKey);
  if (cached) return cached;

  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.AGENDA);
  if (!sh || sh.getLastRow() < 2) return { items: [] };
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var items = values.slice(1).map(function(r){
    var clienteId = op_norm_(op_getCell_(r, hm, 'CLIENTE_ID'));
    var cli = clientsById[clienteId] || {};
    var tipoAtividade = op_norm_(op_getCell_(r, hm, 'TIPO_ATIVIDADE'));
    var blocoId = op_norm_(op_getCell_(r, hm, 'BLOCO_ID'));
    var block = blocks[blocoId] || {};
    return {
      agendaId: op_norm_(op_getCell_(r, hm, 'AGENDA_ID')),
      data: op_dateValueToYmd_(op_getCell_(r, hm, 'DATA')),
      diaSemana: op_norm_(op_getCell_(r, hm, 'DIA_SEMANA')),
      blocoId: blocoId,
      horaInicio: op_timeValueToText_(op_getCell_(r, hm, 'HORA_INICIO')),
      horaFim: op_timeValueToText_(op_getCell_(r, hm, 'HORA_FIM')),
      nomeBloco: block.nomeBloco || '',
      tipoAtividade: tipoAtividade,
      tipoGrupo: op_tipoGrupo_(tipoAtividade),
      cor: op_norm_(op_getCell_(r, hm, 'TIPO_COR')) || block.cor,
      clienteId: clienteId,
      cliente: op_norm_(op_getCell_(r, hm, 'CLIENTE')),
      local: op_norm_(op_getCell_(r, hm, 'LOCAL')) || cli.local || '',
      statusAgenda: op_norm_(op_getCell_(r, hm, 'STATUS_AGENDA')),
      prioridade: op_norm_(op_getCell_(r, hm, 'PRIORIDADE')),
      ordemAgenda: Number(op_getCell_(r, hm, 'ORDEM_AGENDA')) || 999,
      obsPlanejada: op_norm_(op_getCell_(r, hm, 'OBS_PLANEJADA')),
      obsExecucao: op_norm_(op_getCell_(r, hm, 'OBS_EXECUCAO')),
      midiaSugerida: op_norm_(op_getCell_(r, hm, 'MIDIA_SUGERIDA')) || cli.midia || '',
      linkMidiaDireto: op_norm_(op_getCell_(r, hm, 'LINK_MIDIA_DIRETO')) || cli.linkMidiaDireto || '',
      acaoCliente: cli.acao || '',
      subAcaoCliente: cli.subAcao || '',
      prioridadeCliente: cli.prioridadeFila || '',
      canalSugerido: cli.canalSugerido || '',
      conteudoSugerido: cli.conteudoSugerido || '',
      motivoRegra: cli.motivoRegra || '',
      curvaCliente: cli.curva || '',
      origemTipo: op_norm_(op_getCell_(r, hm, 'ORIGEM_TIPO')) || 'CLIENTE',
      origemId: op_norm_(op_getCell_(r, hm, 'ORIGEM_ID')),
      prospectId: op_norm_(op_getCell_(r, hm, 'PROSPECT_ID')),
      clienteMasterId: op_norm_(op_getCell_(r, hm, 'CLIENTE_MASTER_ID')),
      checklistId: op_norm_(op_getCell_(r, hm, 'CHECKLIST_ID'))
    };
  }).filter(function(x){ return x.tipoGrupo !== 'COLETA' && x.data >= startDate && x.data <= endDate; })
    .sort(function(a,b){ return a.data.localeCompare(b.data) || (a.ordemAgenda - b.ordemAgenda); });
  var result = { items: items };
  op_cachePutJson_(cacheKey, result, OP_CFG.CACHE.AGENDA_SEC);
  return result;
}
function op_readMidias_(){
  var cacheKey = 'op_midias_v1';
  var cached = op_cacheGetJson_(cacheKey);
  if (cached) return cached;
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MIDIAS);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var ativaIdx = hm['ATIVA'];
  var out = values.slice(1).map(function(r){
    var ativaRaw = ativaIdx !== undefined ? r[ativaIdx] : 'SIM';
    var ativaTxt = op_upperNoAccents_(ativaRaw);
    var ativa = ativaTxt !== 'NAO' && ativaTxt !== 'NÃO' && ativaTxt !== 'FALSE' && ativaTxt !== '0';
    return {
      codigo: op_norm_(op_getCell_(r, hm, ['CODIGO_MIDIA','ID','CODIGO'])),
      nome: op_norm_(op_getCell_(r, hm, ['NOME_MIDIA','TITULO','NOME'])),
      titulo: op_norm_(op_getCell_(r, hm, ['TITULO','NOME_MIDIA','NOME'])),
      tipo: op_norm_(op_getCell_(r, hm, ['TIPO'])),
      link: op_norm_(op_getCell_(r, hm, ['LINK','URL','LINK_MIDIA_DIRETO'])),
      quandoUsar: op_norm_(op_getCell_(r, hm, ['QUANDO_USAR','DESCRICAO'])),
      descricao: op_norm_(op_getCell_(r, hm, ['DESCRICAO','QUANDO_USAR'])),
      acao: op_norm_(op_getCell_(r, hm, ['ACAO'])),
      subcategoria: op_norm_(op_getCell_(r, hm, ['SUBCATEGORIA','SUB_ACAO'])),
      ativa: ativa
    };
  }).filter(function(x){ return x.ativa && x.codigo; });

  out.sort(function(a,b){
    var ka = [a.acao || 'ZZZ', a.subcategoria || 'ZZZ', a.titulo || a.nome || a.codigo].join('|');
    var kb = [b.acao || 'ZZZ', b.subcategoria || 'ZZZ', b.titulo || b.nome || b.codigo].join('|');
    return ka.localeCompare(kb, 'pt-BR');
  });

  op_cachePutJson_(cacheKey, out, OP_CFG.CACHE.MIDIAS_SEC);
  return out;
}


function op_apiGetMidiasCatalog_(){
  return { ok:true, items: op_readMidias_() };
}

/* ========================= HELPERS API ========================= */
function op_tipoGrupo_(tipo){
  var t = op_upperNoAccents_(tipo);
  if (t === 'ALMOCO' || t === 'ALMOÇO') return 'ALMOCO';
  if (t === 'INTERNO' || t === 'BASE') return 'INTERNO';
  if (t.indexOf('COLETA') >= 0) return 'COLETA';
  return 'VISITA';
}
function op_appendInteracao_(data, clienteId, cliente, tipo, status, resultado, obs, proximaAcao, responsavel){
  var sh = op_getSpreadsheet_().getSheetByName(OP_CFG.SHEETS.CRM_INTERACTIONS);
  sh.appendRow(['INT_' + Utilities.getUuid().slice(0,8).toUpperCase(), data, clienteId, cliente, tipo, status, resultado, obs, proximaAcao, responsavel, op_nowIso_()]);
}
function op_appendColetaExec_(){
  throw new Error('COLETAS foi desativado na Fase 5.');
}
function op_uniqueSorted_(arr){
  var seen = {}, out = []; arr.forEach(function(v){ var k = op_norm_(v); if (k && !seen[k]) { seen[k]=1; out.push(k); } });
  return out.sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
}
function op_buildFunil_(clients){
  var order = ['CONVERTER','RESGATAR','FIDELIZAR','MANTER','CANCELAR'];
  var cols = {};
  clients.forEach(function(c){
    var k = c.acao || 'MANTER';
    if (k === 'VISITAR') k = 'FIDELIZAR';
    if (!cols[k]) cols[k] = [];
    cols[k].push(c);
  });
  return order.map(function(k){
    var list = cols[k] || [];
    return { acao:k, total:list.length, clientes:list.sort(function(a,b){ return String(a.cliente).localeCompare(String(b.cliente), 'pt-BR'); }) };
  });
}
function op_getWeekStart_(input){
  var d = input ? op_ymdToDate_(input) : new Date();
  if (!d) d = new Date();
  var day = d.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return op_toYmd_(d);
}
function op_buildWeekDays_(weekStart){
  var days = [];
  for (var i=0;i<5;i++) {
    var ymd = op_addDays_(weekStart, i);
    days.push({ date: ymd, label: op_weekdayShortPt_(ymd) + ' ' + ymd.slice(8,10) + '/' + ymd.slice(5,7) });
  }
  return days;
}
function op_weekdayPt_(ymd){
  return ['DOM','SEG','TER','QUA','QUI','SEX','SAB'][op_ymdToDate_(ymd).getDay()];
}
function op_weekdayShortPt_(ymd){ return op_weekdayPt_(ymd); }

/* ========================= PROSPECTS CRUD ========================= */

function op_readProspects_() {
  var cacheKey = 'op_prospects_v1';
  var cached = op_cacheGetJson_(cacheKey);
  if (cached) return cached;
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
  if (!sh || sh.getLastRow() < 2) return { items: [], filters: { locals:[], segmentos:[], etapas:[], origens:[] }, byId: {} };
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var items = values.slice(1).map(function(r, idx) {
    return {
      rowNumber: idx + 2,
      prospectId: op_norm_(op_getCell_(r, hm, 'PROSPECT_ID')),
      cliente: op_norm_(op_getCell_(r, hm, 'CLIENTE')),
      local: op_norm_(op_getCell_(r, hm, 'LOCAL')),
      segmento: op_norm_(op_getCell_(r, hm, 'SEGMENTO')),
      nomeFantasia: op_norm_(op_getCell_(r, hm, 'NOME_FANTASIA')),
      razaoSocial: op_norm_(op_getCell_(r, hm, 'RAZAO_SOCIAL')),
      cnpjCpf: op_norm_(op_getCell_(r, hm, 'CNPJ_CPF')),
      atividadeEconomica: op_norm_(op_getCell_(r, hm, 'ATIVIDADE_ECONOMICA')),
      endereco: op_norm_(op_getCell_(r, hm, 'ENDERECO')),
      numero: op_norm_(op_getCell_(r, hm, 'NUMERO')),
      complemento: op_norm_(op_getCell_(r, hm, 'COMPLEMENTO')),
      bairro: op_norm_(op_getCell_(r, hm, 'BAIRRO')),
      cidade: op_norm_(op_getCell_(r, hm, 'CIDADE')),
      uf: op_norm_(op_getCell_(r, hm, 'UF')),
      cep: op_norm_(op_getCell_(r, hm, 'CEP')),
      mapsUrl: op_norm_(op_getCell_(r, hm, 'MAPS_URL')),
      contato: op_norm_(op_getCell_(r, hm, 'CONTATO')),
      cargo: op_norm_(op_getCell_(r, hm, 'CARGO')),
      whatsapp: op_norm_(op_getCell_(r, hm, 'WHATSAPP')),
      telefone2: op_norm_(op_getCell_(r, hm, 'TELEFONE_2')),
      email: op_norm_(op_getCell_(r, hm, 'EMAIL')),
      instagram: op_norm_(op_getCell_(r, hm, 'INSTAGRAM')),
      perfil: op_norm_(op_getCell_(r, hm, 'PERFIL')),
      potencial: op_norm_(op_getCell_(r, hm, 'POTENCIAL')),
      prioridade: op_norm_(op_getCell_(r, hm, 'PRIORIDADE')),
      statusProspect: op_norm_(op_getCell_(r, hm, 'STATUS_PROSPECT')),
      etapaFunil: op_norm_(op_getCell_(r, hm, 'ETAPA_FUNIL')),
      responsavel: op_norm_(op_getCell_(r, hm, 'RESPONSAVEL')),
      origemLead: op_norm_(op_getCell_(r, hm, 'ORIGEM_LEAD')),
      canalEnvioAtual: op_norm_(op_getCell_(r, hm, 'CANAL_ENVIO_ATUAL')),
      frequenciaEnvio: op_norm_(op_getCell_(r, hm, 'FREQUENCIA_ENVIO')),
      volumeMedio: op_norm_(op_getCell_(r, hm, 'VOLUME_MEDIO')),
      jaPostaCorreios: op_norm_(op_getCell_(r, hm, 'JA_POSTA_CORREIOS')),
      temContratoCorreios: op_norm_(op_getCell_(r, hm, 'TEM_CONTRATO_CORREIOS')),
      temCartaoPostagem: op_norm_(op_getCell_(r, hm, 'TEM_CARTAO_POSTAGEM')),
      parceiroPrincipal: op_norm_(op_getCell_(r, hm, 'PARCEIRO_PRINCIPAL')),
      usaIntermediador: op_norm_(op_getCell_(r, hm, 'USA_INTERMEDIADOR')),
      intermediadorQual: op_norm_(op_getCell_(r, hm, 'INTERMEDIADOR_QUAL')),
      canalVenda: op_norm_(op_getCell_(r, hm, 'CANAL_VENDA')),
      atendeSacoleirasExcursao: op_norm_(op_getCell_(r, hm, 'ATENDE_SACOLEIRAS_EXCURSAO')),
      dorPrincipal: op_norm_(op_getCell_(r, hm, 'DOR_PRINCIPAL')),
      oportunidadePrincipal: op_norm_(op_getCell_(r, hm, 'OPORTUNIDADE_PRINCIPAL')),
      dataCadastro: op_dateValueToYmd_(op_getCell_(r, hm, 'DATA_CADASTRO')),
      ultimoContato: op_dateValueToYmd_(op_getCell_(r, hm, 'ULTIMO_CONTATO')),
      ultimoResultadoVisita: op_norm_(op_getCell_(r, hm, 'ULTIMO_RESULTADO_VISITA')),
      dataProximoFollowup: op_dateValueToYmd_(op_getCell_(r, hm, 'DATA_PROXIMO_FOLLOWUP')),
      proximaAcao: op_norm_(op_getCell_(r, hm, 'PROXIMA_ACAO')),
      checklistUltimaVisitaId: op_norm_(op_getCell_(r, hm, 'CHECKLIST_ULTIMA_VISITA_ID')),
      canalPreferencial: op_norm_(op_getCell_(r, hm, 'CANAL_PREFERENCIAL')),
      abordagemInicial: op_norm_(op_getCell_(r, hm, 'ABORDAGEM_INICIAL')),
      objecaoPrincipal: op_norm_(op_getCell_(r, hm, 'OBJECAO_PRINCIPAL')),
      temInteresse: op_norm_(op_getCell_(r, hm, 'TEM_INTERESSE')),
      score: Number(op_getCell_(r, hm, 'SCORE')) || 0,
      obs: op_norm_(op_getCell_(r, hm, 'OBS')),
      clienteIdConvertido: op_norm_(op_getCell_(r, hm, 'CLIENTE_ID_CONVERTIDO')),
      clienteNomeConvertido: op_norm_(op_getCell_(r, hm, 'CLIENTE_NOME_CONVERTIDO')),
      tipoConversao: op_norm_(op_getCell_(r, hm, 'TIPO_CONVERSAO')),
      dataConversao: op_dateValueToYmd_(op_getCell_(r, hm, 'DATA_CONVERSAO')),
      matchStatus: op_norm_(op_getCell_(r, hm, 'MATCH_STATUS'))
    };
  }).filter(function(x) { return !!x.prospectId; });

  var filters = {
    locals: op_uniqueSorted_(items.map(function(x) { return x.local; })),
    segmentos: op_uniqueSorted_(items.map(function(x) { return x.segmento; })),
    etapas: op_uniqueSorted_(items.map(function(x) { return x.etapaFunil; })),
    origens: op_uniqueSorted_(items.map(function(x) { return x.origemLead; }))
  };
  var byId = {};
  items.forEach(function(x) { byId[x.prospectId] = x; });
  var result = { items: items, filters: filters, byId: byId };
  op_cachePutJson_(cacheKey, result, OP_CFG.CACHE.CLIENTS_SEC);
  return result;
}

function op_apiGetProspects_() {
  return { ok: true, prospects: op_readProspects_() };
}

function op_apiGetProspect_(params) {
  var prospects = op_readProspects_();
  var row = null;
  if (params.prospectId) row = prospects.byId[params.prospectId] || null;
  return { ok: true, prospect: row };
}

function op_apiCreateProspect_(payload) {
  var cliente = op_norm_(payload.cliente);
  if (!cliente) throw new Error('Nome do prospect obrigatório.');
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
  if (!sh) throw new Error('Aba PROSPECTS não encontrada.');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var id = 'PRS_' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var now = op_nowIso_();
  var row = headers.map(function(h) {
    var hk = op_headerKey_(h);
    var map = {
      'PROSPECT_ID': id,
      'CLIENTE': cliente,
      'LOCAL': op_norm_(payload.local || 'PROSPECTS'),
      'SEGMENTO': op_norm_(payload.segmento),
      'NOME_FANTASIA': op_norm_(payload.nomeFantasia),
      'RAZAO_SOCIAL': op_norm_(payload.razaoSocial),
      'CNPJ_CPF': op_norm_(payload.cnpjCpf),
      'ATIVIDADE_ECONOMICA': op_norm_(payload.atividadeEconomica),
      'ENDERECO': op_norm_(payload.endereco),
      'NUMERO': op_norm_(payload.numero),
      'COMPLEMENTO': op_norm_(payload.complemento),
      'BAIRRO': op_norm_(payload.bairro),
      'CIDADE': op_norm_(payload.cidade || 'Fortaleza'),
      'UF': op_norm_(payload.uf || 'CE'),
      'CEP': op_norm_(payload.cep),
      'CONTATO': op_norm_(payload.contato),
      'CARGO': op_norm_(payload.cargo),
      'WHATSAPP': op_norm_(payload.whatsapp),
      'TELEFONE_2': op_norm_(payload.telefone2),
      'EMAIL': op_norm_(payload.email),
      'INSTAGRAM': op_norm_(payload.instagram),
      'PERFIL': op_norm_(payload.perfil),
      'POTENCIAL': op_norm_(payload.potencial || 'MEDIO'),
      'PRIORIDADE': op_norm_(payload.prioridade || 'P2'),
      'STATUS_PROSPECT': op_norm_(payload.statusProspect || 'NOVO'),
      'ETAPA_FUNIL': op_norm_(payload.etapaFunil || 'CONTATO'),
      'RESPONSAVEL': op_norm_(payload.responsavel || 'Júlio'),
      'ORIGEM_LEAD': op_norm_(payload.origemLead || 'VISITA_EM_CAMPO'),
      'CANAL_ENVIO_ATUAL': op_norm_(payload.canalEnvioAtual),
      'PARCEIRO_PRINCIPAL': op_norm_(payload.parceiroPrincipal),
      'USA_INTERMEDIADOR': op_norm_(payload.usaIntermediador),
      'INTERMEDIADOR_QUAL': op_norm_(payload.intermediadorQual),
      'ATENDE_SACOLEIRAS_EXCURSAO': op_norm_(payload.atendeSacoleirasExcursao),
      'DOR_PRINCIPAL': op_norm_(payload.dorPrincipal),
      'OPORTUNIDADE_PRINCIPAL': op_norm_(payload.oportunidadePrincipal),
      'DATA_CADASTRO': now.slice(0, 10),
      'CANAL_PREFERENCIAL': op_norm_(payload.canalPreferencial),
      'ABORDAGEM_INICIAL': op_norm_(payload.abordagemInicial || 'NAO_FEITA'),
      'TEM_INTERESSE': op_norm_(payload.temInteresse),
      'OBS': op_norm_(payload.obs),
      'UPDATED_AT': now
    };
    return map[hk] != null ? map[hk] : '';
  });
  sh.appendRow(row);
  op_cacheRemoveSafe_('op_prospects_v1');
  op_invalidateOperationCaches_();
  return { ok: true, prospectId: id };
}

function op_apiUpdateProspect_(payload) {
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
  if (!sh) throw new Error('Aba PROSPECTS não encontrada.');
  var all = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(all[0]);
  var prospectId = op_norm_(payload.prospectId);
  if (!prospectId) throw new Error('prospectId obrigatório.');
  var rowIndex = -1;
  for (var i = 1; i < all.length; i++) {
    if (op_norm_(all[i][hm['PROSPECT_ID']]) === prospectId) { rowIndex = i + 1; break; }
  }
  if (rowIndex < 0) throw new Error('Prospect não encontrado.');

  var editable = [
    'CLIENTE','LOCAL','NOME_FANTASIA','RAZAO_SOCIAL','CNPJ_CPF','ATIVIDADE_ECONOMICA',
    'ENDERECO','NUMERO','COMPLEMENTO','BAIRRO','CIDADE','UF','CEP','MAPS_URL',
    'CONTATO','CARGO','WHATSAPP','TELEFONE_2','EMAIL','INSTAGRAM',
    'PERFIL','POTENCIAL','PRIORIDADE','STATUS_PROSPECT','ETAPA_FUNIL','RESPONSAVEL','ORIGEM_LEAD',
    'CANAL_ENVIO_ATUAL','PARCEIRO_PRINCIPAL','USA_INTERMEDIADOR','INTERMEDIADOR_QUAL','ATENDE_SACOLEIRAS_EXCURSAO','DOR_PRINCIPAL','OPORTUNIDADE_PRINCIPAL',
    'ULTIMO_CONTATO','ULTIMO_RESULTADO_VISITA','DATA_PROXIMO_FOLLOWUP','PROXIMA_ACAO','CHECKLIST_ULTIMA_VISITA_ID','CANAL_PREFERENCIAL','ABORDAGEM_INICIAL',
    'OBJECAO_PRINCIPAL','TEM_INTERESSE','SCORE','OBS','SEGMENTO',
    'CLIENTE_ID_CONVERTIDO','CLIENTE_NOME_CONVERTIDO','TIPO_CONVERSAO','DATA_CONVERSAO','MATCH_STATUS','OBS_CONVERSAO'
  ];
  var rowValues = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];
  editable.forEach(function(k) {
    if (payload[k] !== undefined && hm[k] !== undefined) {
      rowValues[hm[k]] = payload[k];
    }
  });
  if (hm['UPDATED_AT'] !== undefined) rowValues[hm['UPDATED_AT']] = op_nowIso_();
  sh.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  op_cacheRemoveSafe_('op_prospects_v1');
  op_invalidateOperationCaches_();
  return { ok: true, prospectId: prospectId };
}


function op_visitNormResult_(v){
  var s = op_upperNoAccents_(op_norm_(v)).replace(/\s+/g,'_');
  s = s.replace(/NAO_LOCALIZADO/g,'NAO_ENCONTRADO');
  s = s.replace(/REAGENDADA/g,'REAGENDADO');
  return s;
}
function op_visitNormStatus_(v){
  var s = op_upperNoAccents_(op_norm_(v)).replace(/\s+/g,'_');
  if (s === 'CONCLUÍDO') s = 'CONCLUIDO';
  return s;
}
function op_joinSelected_(v){
  if (Array.isArray(v)) return v.map(op_norm_).filter(Boolean).join(' | ');
  return op_norm_(v);
}
function op_calcClientChecklistDerived_(payload){
  var chegada = op_norm_(payload.postagemComoChega);
  var nivel = '';
  if (chegada === '10x15 pronta' || chegada === 'A4 pronta') nivel = 'RÁPIDA';
  else if (chegada === 'Etiqueta 10x15 WhatsApp' || chegada === 'A4 WhatsApp' || chegada === 'Dados digitados WhatsApp') nivel = 'ASSISTIDA';
  else if (chegada === 'Manual') nivel = 'MANUAL';

  var entrada = '';
  var origem = op_norm_(payload.origemPostagem);
  if (origem === 'Intermediador' && nivel === 'RÁPIDA') entrada = 'INTERMEDIADOR PRONTO';
  else if (origem === 'Portal Postal') entrada = 'PORTAL POSTAL';
  else if (nivel === 'MANUAL') entrada = 'ATENDIMENTO MANUAL';
  else entrada = 'ATENDIMENTO ASSISTIDO';

  var potencial = '';
  if (origem === 'Intermediador' || origem === 'Portal Postal' || nivel === 'RÁPIDA') potencial = 'ALTO';
  else if (nivel === 'ASSISTIDA') potencial = 'MÉDIO';
  else potencial = 'BAIXO';
  return { nivelEsteira:nivel, entradaSugerida:entrada, potencialAutomacao:potencial };
}


function op_computeFollowupDate_(statusNorm, resultadoNorm){
  var days = 0;
  if (statusNorm === 'NAO_ENCONTRADO') days = 1;
  else if (statusNorm === 'REAGENDADO') days = 0;
  else if (statusNorm === 'CANCELADO') days = 0;
  else {
    var map = {
      'PROPOSTA_APRESENTADA': 3,
      'CLIENTE_INTERESSADO': 2,
      'PROPOSTA_ACEITA': 2,
      'CONTRATO_FECHADO': 7,
      'SEM_INTERESSE': 30
    };
    days = map[resultadoNorm] || 0;
  }
  return days > 0 ? op_addDays_(op_toYmd_(new Date()), days) : '';
}

function op_updateMasterVisitSnapshot_(clienteId, payload, checklistId){
  if (!clienteId) return;
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) return;
  var all = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(all[0]);
  var targetRow = -1;
  for (var i = 1; i < all.length; i++) {
    if (op_norm_(all[i][hm['CLIENTE_ID']]) === clienteId) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) return;
  var row = sh.getRange(targetRow,1,1,sh.getLastColumn()).getValues()[0];
  if (hm['ULTIMA_VISITA'] !== undefined) row[hm['ULTIMA_VISITA']] = op_toYmd_(new Date());
  if (hm['ULTIMO_RESULTADO_VISITA'] !== undefined) row[hm['ULTIMO_RESULTADO_VISITA']] = op_norm_(payload.resultadoVisita);
  if (hm['CHECKLIST_ULTIMA_VISITA_ID'] !== undefined) row[hm['CHECKLIST_ULTIMA_VISITA_ID']] = checklistId || '';
  var statusNorm = op_visitNormStatus_(payload.statusVisita || '');
  var resultNorm = op_visitNormResult_(payload.resultadoVisita || '');
  var follow = op_computeFollowupDate_(statusNorm, resultNorm);
  if (hm['DATA_PROXIMO_FOLLOWUP'] !== undefined && follow) row[hm['DATA_PROXIMO_FOLLOWUP']] = follow;
  sh.getRange(targetRow,1,1,row.length).setValues([row]);
}

function op_updateProspectFromChecklist_(prospectId, payload, checklistId){
  if (!prospectId) return;
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
  if (!sh || sh.getLastRow() < 2) return;
  var all = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(all[0]);
  var targetRow = -1;
  for (var i = 1; i < all.length; i++) {
    if (op_norm_(all[i][hm['PROSPECT_ID']]) === prospectId) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) return;
  var row = sh.getRange(targetRow,1,1,sh.getLastColumn()).getValues()[0];
  var map = {
    'CANAL_ENVIO_ATUAL': op_norm_(payload.canalEnvioAtual),
    'FREQUENCIA_ENVIO': op_norm_(payload.frequenciaEnvio),
    'VOLUME_MEDIO': op_norm_(payload.volumeMedio),
    'JA_POSTA_CORREIOS': op_norm_(payload.jaPostaCorreios),
    'TEM_CONTRATO_CORREIOS': op_norm_(payload.temContratoCorreios),
    'TEM_CARTAO_POSTAGEM': op_norm_(payload.temCartaoPostagem),
    'PARCEIRO_PRINCIPAL': op_norm_(payload.parceiroPrincipal),
    'USA_INTERMEDIADOR': op_norm_(payload.usaIntermediador),
    'INTERMEDIADOR_QUAL': op_norm_(payload.intermediadorQual),
    'CANAL_VENDA': op_joinSelected_(payload.canalVenda),
    'ATENDE_SACOLEIRAS_EXCURSAO': op_norm_(payload.atendeSacoleirasExcursao),
    'DOR_PRINCIPAL': op_norm_(payload.dorPrincipal),
    'OPORTUNIDADE_PRINCIPAL': op_norm_(payload.oportunidadePrincipal),
    'ULTIMO_CONTATO': op_toYmd_(new Date()),
    'ULTIMO_RESULTADO_VISITA': op_norm_(payload.resultadoVisita),
    'CHECKLIST_ULTIMA_VISITA_ID': checklistId || ''
  };
  var statusNorm = op_visitNormStatus_(payload.statusVisita || '');
  var resultNorm = op_visitNormResult_(payload.resultadoVisita || '');
  var follow = op_computeFollowupDate_(statusNorm, resultNorm);
  if (follow) map['DATA_PROXIMO_FOLLOWUP'] = follow;
  Object.keys(map).forEach(function(k){ if (hm[k] !== undefined && map[k] !== '') row[hm[k]] = map[k]; });
  if (hm['UPDATED_AT'] !== undefined) row[hm['UPDATED_AT']] = op_nowIso_();
  sh.getRange(targetRow,1,1,row.length).setValues([row]);
}


function op_readChecklistRows_(){
  var sh = op_getSpreadsheet_().getSheetByName(OP_CFG.SHEETS.CHECKLIST);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  return values.slice(1).map(function(r){
    return {
      data: op_dateValueToYmd_(op_getCell_(r, hm, 'DATA')),
      origemTipo: op_norm_(op_getCell_(r, hm, 'ORIGEM_TIPO')),
      resultadoVisita: op_norm_(op_getCell_(r, hm, 'RESULTADO_VISITA')),
      statusVisita: op_norm_(op_getCell_(r, hm, 'STATUS_VISITA')),
      nivelEsteira: op_norm_(op_getCell_(r, hm, 'NIVEL_ESTEIRA')),
      entradaSugerida: op_norm_(op_getCell_(r, hm, 'ENTRADA_SUGERIDA')),
      oportunidadePrincipal: op_norm_(op_getCell_(r, hm, 'OPORTUNIDADE_PRINCIPAL'))
    };
  }).filter(function(x){ return !!x.data; });
}

function op_countByNorm_(rows, field){
  var out = {};
  (rows || []).forEach(function(r){
    var k = op_upperNoAccents_(r[field] || '');
    if (!k) return;
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function op_buildDashboardComercial_(weekStart, weekEnd, clientItems, prospectItems, agendaItems){
  weekStart = weekStart || op_getWeekStart_(op_toYmd_(new Date()));
  weekEnd = weekEnd || op_addDays_(weekStart, 4);
  clientItems = clientItems || op_readClientsMaster_({ projection:'full' }).items;
  prospectItems = prospectItems || op_readProspects_().items;
  agendaItems = agendaItems || op_readAgendaItemsWithBlocks_(weekStart, weekEnd, op_readClientsMaster_({ projection:'agenda' }).byId, op_readBlocksById_()).items;
  var checkRows = op_readChecklistRows_().filter(function(x){ return x.data >= weekStart && x.data <= weekEnd; });
  var visitAgenda = (agendaItems || []).filter(function(x){ return String(x.tipoGrupo || '').toUpperCase() === 'VISITA'; });
  var statusCounts = op_countByNorm_(visitAgenda.map(function(x){ return { status: x.statusAgenda || '' }; }), 'status');
  var resultRows = checkRows.filter(function(x){ return op_visitNormStatus_(x.statusVisita) === 'CONCLUIDO'; });
  var resultCounts = op_countByNorm_(resultRows, 'resultadoVisita');
  var clientsVisitedWeek = (clientItems || []).filter(function(c){
    var d = op_dateValueToYmd_(c.ultimaVisita || c.ultimaVisitaData || '');
    return d && d >= weekStart && d <= weekEnd;
  });
  var prospectsSnapshot = op_countByNorm_((prospectItems || []).map(function(p){ return { etapa: p.etapaFunil || '' }; }), 'etapa');
  var esteiraCounts = op_countByNorm_(resultRows.filter(function(x){ return op_upperNoAccents_(x.origemTipo) === 'CLIENTE'; }), 'nivelEsteira');
  var entradaCounts = op_countByNorm_(resultRows.filter(function(x){ return op_upperNoAccents_(x.origemTipo) === 'CLIENTE'; }), 'entradaSugerida');
  var oppCounts = op_countByNorm_(resultRows, 'oportunidadePrincipal');
  var redist = { CONVERTER:0, FIDELIZAR:0, MANTER:0, CANCELAR:0, RESGATAR:0 };
  clientsVisitedWeek.forEach(function(c){ var a = op_upperNoAccents_(c.acaoAtual || c.acao || ''); if (redist[a] != null) redist[a]++; });
  var conclu = statusCounts[op_upperNoAccents_('CONCLUÍDO')] || statusCounts['CONCLUIDO'] || 0;
  var totalVis = visitAgenda.length;
  return {
    period: { weekStart: weekStart, weekEnd: weekEnd },
    execucao: {
      agendadas: totalVis,
      concluidas: conclu,
      reagendadas: statusCounts['REAGENDADO'] || 0,
      naoEncontradas: statusCounts['NAO_ENCONTRADO'] || 0,
      canceladas: statusCounts['CANCELADO'] || 0,
      taxaConclusao: totalVis ? Math.round((conclu / totalVis) * 100) : 0
    },
    resultados: {
      propostaApresentada: resultCounts['PROPOSTA_APRESENTADA'] || 0,
      clienteInteressado: resultCounts['CLIENTE_INTERESSADO'] || 0,
      propostaAceita: resultCounts['PROPOSTA_ACEITA'] || 0,
      contratoFechado: resultCounts['CONTRATO_FECHADO'] || 0,
      semInteresse: resultCounts['SEM_INTERESSE'] || 0
    },
    redistribuicao: {
      converter: redist.CONVERTER || 0,
      fidelizar: redist.FIDELIZAR || 0,
      manter: redist.MANTER || 0,
      cancelar: redist.CANCELAR || 0,
      resgatar: redist.RESGATAR || 0
    },
    prospects: {
      contato: prospectsSnapshot['CONTATO'] || 0,
      visita: prospectsSnapshot['VISITA'] || 0,
      proposta: prospectsSnapshot['PROPOSTA'] || 0,
      contrato: prospectsSnapshot['CONTRATO'] || 0,
      perdido: prospectsSnapshot['PERDIDO'] || 0
    },
    esteira: {
      rapida: esteiraCounts[op_upperNoAccents_('RÁPIDA')] || esteiraCounts['RAPIDA'] || 0,
      assistida: esteiraCounts['ASSISTIDA'] || 0,
      manual: esteiraCounts['MANUAL'] || 0
    },
    entradas: {
      portalPostal: entradaCounts['PORTAL_POSTAL'] || 0,
      intermediadorPronto: entradaCounts['INTERMEDIADOR_PRONTO'] || 0,
      atendimentoAssistido: entradaCounts['ATENDIMENTO_ASSISTIDO'] || 0,
      atendimentoManual: entradaCounts['ATENDIMENTO_MANUAL'] || 0
    },
    oportunidades: {
      portalPostal: oppCounts['PORTAL_POSTAL'] || 0,
      etiqueta10x15: oppCounts['ETIQUETA_10X15'] || 0,
      contrato: oppCounts['CONTRATO'] || 0,
      treinamentoOperacional: oppCounts['TREINAMENTO_OPERACIONAL'] || 0,
      migracaoIntermediador: oppCounts['MIGRACAO_DE_INTERMEDIADOR'] || 0
    }
  };
}

/* ========================= CHECKLIST API ========================= */

function op_apiSaveChecklist_(payload) {
  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.CHECKLIST);
  if (!sh) throw new Error('Aba CRM_VISITA_CHECKLIST não encontrada.');
  var existingRequest = (typeof crm7_findChecklistByRequest_ === 'function') ? crm7_findChecklistByRequest_(payload.requestId) : null;
  if (existingRequest) return { ok:true, created:false, idempotent:true, checklistId:existingRequest.checklistId, nivelEsteira:existingRequest.nivelEsteira, entradaSugerida:existingRequest.entradaSugerida, potencialAutomacao:existingRequest.potencialAutomacao };
  var checklistId = 'CHK_' + Utilities.getUuid().slice(0, 8).toUpperCase();
  var now = op_nowIso_();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var derived = op_calcClientChecklistDerived_(payload);
  var row = headers.map(function(h) {
    var hk = op_headerKey_(h);
    var map = {
      'CHECKLIST_ID': checklistId,
      'AGENDA_ID': op_norm_(payload.agendaId),
      'DATA': (payload.data || now).slice(0, 10),
      'ORIGEM_TIPO': op_norm_(payload.origemTipo || 'CLIENTE'),
      'ORIGEM_ID': op_norm_(payload.origemId),
      'PROSPECT_ID': op_norm_(payload.prospectId),
      'CLIENTE_MASTER_ID': op_norm_(payload.clienteMasterId || payload.clienteId),
      'CLIENTE': op_norm_(payload.cliente),
      'RESULTADO_VISITA': op_norm_(payload.resultadoVisita),
      'STATUS_VISITA': op_norm_(payload.statusVisita),
      'POSTAGEM_COMO_CHEGA': op_norm_(payload.postagemComoChega),
      'ORIGEM_POSTAGEM': op_norm_(payload.origemPostagem),
      'DIAG_SOLICITACAO_RETIRADA': op_norm_(payload.solicitaColetaPor),
      'DIAG_PORTAL_RETIRADA': op_norm_(payload.apresentouPortalColeta),
      'CANAIS_VENDA': op_joinSelected_(payload.canaisVenda),
      'POSTA_COM_QUEM': op_joinSelected_(payload.postaComQuem),
      'DOR_PRINCIPAL': op_norm_(payload.dorPrincipal),
      'OPORTUNIDADE_PRINCIPAL': op_norm_(payload.oportunidadePrincipal),
      'NIVEL_ESTEIRA': derived.nivelEsteira,
      'ENTRADA_SUGERIDA': derived.entradaSugerida,
      'POTENCIAL_AUTOMACAO': derived.potencialAutomacao,
      'CANAL_ENVIO_ATUAL': op_norm_(payload.canalEnvioAtual),
      'FREQUENCIA_ENVIO': op_norm_(payload.frequenciaEnvio),
      'VOLUME_MEDIO': op_norm_(payload.volumeMedio),
      'JA_POSTA_CORREIOS': op_norm_(payload.jaPostaCorreios),
      'TEM_CONTRATO_CORREIOS': op_norm_(payload.temContratoCorreios),
      'TEM_CARTAO_POSTAGEM': op_norm_(payload.temCartaoPostagem),
      'DIAG_USA_RETIRADA_CORREIOS': op_norm_(payload.usaColetaCorreios),
      'DIAG_INTERESSE_RETIRADA': op_norm_(payload.interesseColeta),
      'USA_INTERMEDIADOR': op_norm_(payload.usaIntermediador),
      'INTERMEDIADOR_QUAL': op_norm_(payload.intermediadorQual),
      'PARCEIRO_PRINCIPAL': op_norm_(payload.parceiroPrincipal),
      'CANAL_VENDA': op_joinSelected_(payload.canalVenda),
      'ATENDE_SACOLEIRAS_EXCURSAO': op_norm_(payload.atendeSacoleirasExcursao),
      'OBSERVACAO_CURTA': op_norm_(payload.observacaoCurta || payload.observacao),
      'RESPONSAVEL': op_norm_(payload.responsavel || 'Júlio'),
      'CRIADO_EM': now,
      'TRATATIVA_ID': op_norm_(payload.tratativaId),
      'TIPO_ATIVIDADE_ID': op_norm_(payload.tipoAtividadeId || 'ATV_VISITA'),
      'RESULTADO_ID': op_norm_(payload.resultadoId),
      'RESPONSAVEL_ID': op_norm_(payload.responsavelId),
      'REQUEST_ID': op_norm_(payload.requestId),
      'ATUALIZADO_EM': now
    };
    return map[hk] != null ? map[hk] : '';
  });
  sh.appendRow(row);

  if (payload.agendaId) {
    try {
      var agSh = ss.getSheetByName(OP_CFG.SHEETS.AGENDA);
      if (agSh && agSh.getLastRow() > 1) {
        var agAll = agSh.getDataRange().getValues();
        var agHm = op_buildHeaderMap_(agAll[0]);
        var checkCol = agHm['CHECKLIST_ID'];
        if (checkCol !== undefined) {
          for (var i = 1; i < agAll.length; i++) {
            if (op_norm_(agAll[i][agHm['AGENDA_ID']]) === op_norm_(payload.agendaId)) {
              agSh.getRange(i + 1, checkCol + 1).setValue(checklistId);
              break;
            }
          }
        }
      }
    } catch (e) { Logger.log('Checklist link to agenda: ' + e); }
  }

  try {
    var origemTipo = op_upperNoAccents_(payload.origemTipo || 'CLIENTE');
    if (origemTipo === 'PROSPECT') op_updateProspectFromChecklist_(op_norm_(payload.prospectId || payload.origemId), payload, checklistId);
    else op_updateMasterVisitSnapshot_(op_norm_(payload.clienteMasterId || payload.clienteId || payload.origemId), payload, checklistId);
  } catch (e) { Logger.log('Checklist snapshot error: ' + e); }

  try { if (typeof crm7_appendChecklistEventSafe_ === 'function') crm7_appendChecklistEventSafe_(payload, checklistId, derived); } catch (e) { Logger.log('[CRM7] Checklist event: ' + e); }
  op_invalidateOperationCaches_();
  return { ok: true, created:true, checklistId: checklistId, nivelEsteira: derived.nivelEsteira, entradaSugerida: derived.entradaSugerida, potencialAutomacao: derived.potencialAutomacao };
}

/* ========================= PROSPECT CONVERSIONS ========================= */

function op_syncProspectConversions_() {
  var ss = op_getSpreadsheet_();
  var prospSh = ss.getSheetByName(OP_CFG.SHEETS.PROSPECTS);
  if (!prospSh || prospSh.getLastRow() < 2) return { ok: true, converted: 0, message: 'Sem prospects' };
  var masterSh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!masterSh || masterSh.getLastRow() < 2) return { ok: true, converted: 0, message: 'Sem master' };

  // Ler master para indexar por CNPJ, razao+bairro, fantasia+bairro
  var mData = masterSh.getDataRange().getValues();
  var mHm = op_buildHeaderMap_(mData[0]);
  var byCnpj = {}, byRazaoBairro = {}, byFantasiaBairro = {};
  for (var m = 1; m < mData.length; m++) {
    var mRow = mData[m];
    var mCid = op_norm_(mRow[mHm['CLIENTE_ID']]);
    var mNome = op_norm_(mRow[mHm['CLIENTE']]);
    var mCnpj = op_upperNoAccents_(op_norm_(mRow[mHm['CNPJ_CPF']])).replace(/[^\dA-Z]/g, '');
    var mRazao = op_upperNoAccents_(op_norm_(mRow[mHm['RAZAO_SOCIAL']] || mRow[mHm['NOME_REMETENTE_BASE']]));
    var mFantasia = op_upperNoAccents_(op_norm_(mRow[mHm['NOME_FANTASIA']] || ''));
    var mBairro = op_upperNoAccents_(op_norm_(mRow[mHm['BAIRRO']] || mRow[mHm['LOCAL_PREDOMINANTE']]));
    if (mCnpj && mCnpj.length >= 8) byCnpj[mCnpj] = { id: mCid, nome: mNome };
    if (mRazao && mBairro) byRazaoBairro[mRazao + '|' + mBairro] = { id: mCid, nome: mNome };
    if (mFantasia && mBairro) byFantasiaBairro[mFantasia + '|' + mBairro] = { id: mCid, nome: mNome };
  }

  // Ler prospects
  var pData = prospSh.getDataRange().getValues();
  var pHm = op_buildHeaderMap_(pData[0]);
  var converted = 0;

  for (var p = 1; p < pData.length; p++) {
    var pRow = pData[p];
    // Pular se já convertido manualmente
    var existingConv = op_norm_(pRow[pHm['TIPO_CONVERSAO']]);
    if (existingConv === 'MANUAL') continue;
    // Pular se já convertido automaticamente
    if (existingConv === 'AUTO' && op_norm_(pRow[pHm['CLIENTE_ID_CONVERTIDO']])) continue;
    // Pular se etapa = CONVERTIDO ou PERDIDO
    var etapa = op_upperNoAccents_(op_norm_(pRow[pHm['ETAPA_FUNIL']]));
    if (etapa === 'PERDIDO') continue;

    var pCnpj = op_upperNoAccents_(op_norm_(pRow[pHm['CNPJ_CPF']])).replace(/[^\dA-Z]/g, '');
    var pRazao = op_upperNoAccents_(op_norm_(pRow[pHm['RAZAO_SOCIAL']]));
    var pFantasia = op_upperNoAccents_(op_norm_(pRow[pHm['NOME_FANTASIA']] || pRow[pHm['CLIENTE']]));
    var pBairro = op_upperNoAccents_(op_norm_(pRow[pHm['BAIRRO']]));

    var match = null;
    var matchType = '';
    // Prioridade 1: CNPJ
    if (pCnpj && pCnpj.length >= 8 && byCnpj[pCnpj]) {
      match = byCnpj[pCnpj]; matchType = 'CNPJ';
    }
    // Prioridade 2: Razão Social + Bairro
    if (!match && pRazao && pBairro && byRazaoBairro[pRazao + '|' + pBairro]) {
      match = byRazaoBairro[pRazao + '|' + pBairro]; matchType = 'RAZAO_BAIRRO';
    }
    // Prioridade 3: Nome Fantasia + Bairro
    if (!match && pFantasia && pBairro && byFantasiaBairro[pFantasia + '|' + pBairro]) {
      match = byFantasiaBairro[pFantasia + '|' + pBairro]; matchType = 'FANTASIA_BAIRRO';
    }

    if (match) {
      var rowNum = p + 1;
      if (pHm['CLIENTE_ID_CONVERTIDO'] !== undefined) prospSh.getRange(rowNum, pHm['CLIENTE_ID_CONVERTIDO'] + 1).setValue(match.id);
      if (pHm['CLIENTE_NOME_CONVERTIDO'] !== undefined) prospSh.getRange(rowNum, pHm['CLIENTE_NOME_CONVERTIDO'] + 1).setValue(match.nome);
      if (pHm['TIPO_CONVERSAO'] !== undefined) prospSh.getRange(rowNum, pHm['TIPO_CONVERSAO'] + 1).setValue('AUTO');
      if (pHm['DATA_CONVERSAO'] !== undefined) prospSh.getRange(rowNum, pHm['DATA_CONVERSAO'] + 1).setValue(op_toYmd_(new Date()));
      if (pHm['MATCH_STATUS'] !== undefined) prospSh.getRange(rowNum, pHm['MATCH_STATUS'] + 1).setValue('MATCH AUTOMATICO ' + matchType);
      if (pHm['ETAPA_FUNIL'] !== undefined) prospSh.getRange(rowNum, pHm['ETAPA_FUNIL'] + 1).setValue('CONTRATO');
      if (pHm['STATUS_PROSPECT'] !== undefined) prospSh.getRange(rowNum, pHm['STATUS_PROSPECT'] + 1).setValue('CONVERTIDO');
      converted++;
    }
  }

  op_cacheRemoveSafe_('op_prospects_v1');
  op_invalidateOperationCaches_();
  return { ok: true, converted: converted };
}

/* ========================= TRIGGER ========================= */
/* triggerRefreshMaster está definido em 00_CLIENTES_MASTER_FINAL.gs — NÃO duplicar aqui */

function triggerWarmOperationCaches(){
  op_setupOperacao();
  op_ensureMasterFresh_({ allowStale:false });
  var weekStart = op_getWeekStart_(op_toYmd_(new Date()));
  op_apiInit_({ weekStart: weekStart, view:'crm' });
  op_apiInit_({ weekStart: weekStart, view:'agenda' });
  return { ok:true, warmedAt: op_nowIso_(), weekStart: weekStart };
}
