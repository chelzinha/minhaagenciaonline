/***************************************
 * REVERSA - ETAPA 4
 * API Web App V1
 ***************************************/

/** =========================
 * MENU CONSOLIDADO
 * Mantenha apenas este onOpen
 * ========================= */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Reversa')

    // Estrutura base
    .addItem('Criar abas e cabeçalhos', 'setupReversaSpreadsheet')
    .addItem('Sincronizar cabeçalhos vazios', 'syncReversaHeadersIfEmpty')
    .addItem('Validar estrutura', 'validateReversaSpreadsheet')
    .addSeparator()

    // Dados auxiliares
    .addItem('Popular listas e parâmetros', 'setupReversaSupportData')
    .addItem('Aplicar validações', 'applyReversaValidations')
    .addItem('Destacar campos editáveis em amarelo', 'applyEditableCellsHighlight')
    .addItem('Aplicar migração App Coletas v1.4.2', 'migrateReversaColetaV142')
    .addItem('Aplicar migração Expedição v1.5.0', 'migrateReversaExpedicaoV150')
    .addItem('Popular dados demonstrativos App Coletas', 'seedReversaColetaDemoData')
    .addSeparator()

    // Testes do core
    .addItem('Teste criar unidade', 'testReversaCreateUnidade')
    .addItem('Teste criar usuário', 'testReversaCreateUsuario')
    .addItem('Teste gerar lote de etiquetas', 'testReversaGenerateLoteEtiquetas')
    .addItem('Teste ler etiqueta', 'testReversaReadEtiqueta')
    .addItem('Teste confirmar drop-off', 'testReversaConfirmDropoff')
    .addSeparator()

    // Testes da API
    .addItem('Teste API health', 'testApiHealth')
    .addItem('Teste API getUnitBySlug', 'testApiGetUnitBySlug')
    .addSeparator()

    // Manutenção útil
    .addItem('Atualizar contadores dos lotes', 'rebuildLoteCounters')
    .addItem('Validar dados principais', 'validateReversaData')
    .addToUi();
}

/** =========================
 * WEB APP
 * ========================= */
function doGet(e) {
  try {
    const req = parseWebRequest_(e, 'GET');
    const result = routeApiRequest_(req);
    return jsonOutput_(result);
  } catch (err) {
    return jsonOutput_(buildErrorResponse_(err));
  }
}

function doPost(e) {
  try {
    const req = parseWebRequest_(e, 'POST');
    const result = routeApiRequest_(req);
    return jsonOutput_(result);
  } catch (err) {
    return jsonOutput_(buildErrorResponse_(err));
  }
}

/** =========================
 * ROTEADOR CENTRAL
 * ========================= */
function routeApiRequest_(req) {
  const action = String(req.action || '').trim();

  if (!action) {
    return apiError_('ACTION_REQUIRED', 'Ação não informada.');
  }

  switch (action) {
    case 'health':
      return apiHealth_();

    case 'getUnitBySlug':
      return apiGetUnitBySlug_(req);

    case 'registerOrLoginUser':
      return apiRegisterOrLoginUser_(req);

    case 'readEtiqueta':
      return apiReadEtiqueta_(req);

    case 'confirmDropoff':
      return apiConfirmDropoff_(req);

    case 'getUserHistory':
      return apiGetUserHistory_(req);

    case 'getDashboard':
      return apiGetDashboard_(req);

    case 'getAdminBootstrap':
      return apiGetAdminBootstrap_(req);

    case 'getUnitStatus':
      return apiGetUnitStatus_(req);

    case 'openColeta':
      return apiOpenColetaV140_(req);

    case 'scanEtiquetaColeta':
      return apiScanEtiquetaColeta_(req);

    case 'closeColeta':
      return apiCloseColetaV140_(req);

    case 'markRecebidaAgencia':
      return apiMarkRecebidaAgencia_(req);

    case 'markPostada':
      return apiMarkPostada_(req);

    case 'listUnidades':
      return apiListUnidades_(req);

    case 'createUnidade':
      return apiCreateUnidadeAdmin_(req);

    case 'updateUnidade':
      return apiUpdateUnidade_(req);

    case 'listLotes':
      return apiListLotes_(req);

    case 'generateLoteEtiquetas':
      return apiGenerateLoteEtiquetasAdmin_(req);

    case 'getLotePrintData':
      return apiGetLotePrintData_(req);

    case 'getEtiquetaPrintData':
      return apiGetEtiquetaPrintData_(req);

    case 'listEtiquetas':
      return apiListEtiquetas_(req);

    case 'listReversas':
      return apiListReversas_(req);

    case 'getReversaDetail':
      return apiGetReversaDetail_(req);

    case 'listColetas':
      return apiListColetas_(req);

    case 'listDivergencias':
      return apiListDivergencias_(req);

    case 'createDivergencia':
      return apiCreateDivergenciaV140_(req);

    case 'listParametros':
      return apiListParametros_(req);

    case 'updateParametro':
      return apiUpdateParametro_(req);

    case 'getCollectorHome':
      return apiGetCollectorHome_(req);

    case 'getCollectorHistory':
      return apiGetCollectorHistory_(req);

    case 'getColetaDetail':
      return apiGetColetaDetail_(req);

    case 'startColetaExecution':
      return apiStartColetaExecution_(req);

    case 'getColetaSummary':
      return apiGetColetaSummary_(req);

    case 'registerCollectorDivergence':
      return apiRegisterCollectorDivergence_(req);

    case 'transferColeta':
      return apiTransferColeta_(req);

    case 'listExpedicao':
      return apiListExpedicao_(req);

    case 'receiveObjetoAgencia':
      return apiReceiveObjetoAgencia_(req);

    case 'postObjeto':
      return apiPostObjeto_(req);

    case 'resendPostedEmail':
      return apiResendPostedEmail_(req);

    case 'markWhatsAppSent':
      return apiMarkWhatsAppSent_(req);

    default:
      return apiError_('UNKNOWN_ACTION', `Ação não reconhecida: ${action}`);
  }
}

/** =========================
 * AÇÕES API
 * ========================= */
function apiHealth_() {
  return apiOk_({
    service: 'reversa-v1',
    status: 'ok',
    now: now_(),
    spreadsheet_id: REVERSA_CORE_CFG.SPREADSHEET_ID
  });
}

function apiGetUnitBySlug_(req) {
  validateRequiredFields_(req, ['slug_unidade']);

  const unidade = findUnitBySlug_(req.slug_unidade);
  if (!unidade) {
    return apiError_('UNIT_NOT_FOUND', 'Unidade não encontrada.');
  }

  const statusInfo = buildUnitStatusInfo_(unidade.unidade_id);
  const agenda = buildUnitAvailabilityCalendar_(unidade.unidade_id, 5);

  return apiOk_({
    unidade: {
      unidade_id: unidade.unidade_id,
      codigo_unidade: unidade.codigo_unidade,
      slug_unidade: unidade.slug_unidade,
      nome_unidade: unidade.nome_unidade,
      tipo_unidade: unidade.tipo_unidade,
      status_unidade: unidade.status_unidade,
      cidade: unidade.cidade,
      uf: unidade.uf,
      prazo_coleta_dias_uteis: unidade.prazo_coleta_dias_uteis,
      mensagem_usuario: unidade.mensagem_usuario || '',
      qr_url_unidade: unidade.qr_url_unidade || ''
    },
    status_ponto: statusInfo,
    agenda_disponibilidade: agenda
  });
}

function apiRegisterOrLoginUser_(req) {
  validateRequiredFields_(req, ['slug_unidade', 'cpf']);

  const unidade = findUnitBySlug_(req.slug_unidade);
  if (!unidade) {
    return apiError_('UNIT_NOT_FOUND', 'Unidade não encontrada.');
  }

  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.USUARIOS);
  const rows = getDataRowsAsObjects_(sheet);
  const cpf = onlyDigits_(req.cpf);

  let user = rows.find(r =>
    String(r.unidade_id || '') === String(unidade.unidade_id) &&
    onlyDigits_(r.cpf) === cpf
  );

  if (user) {
    const headers = getHeaders_(sheet);
    const rowIndex = findRowIndexByValue_(sheet, 'usuario_id', user.usuario_id);
    updateRowFieldsByIndex_(sheet, headers, rowIndex, {
      data_ultimo_acesso: now_()
    });

    logEvento_({
      tipo_entidade: 'USUARIO',
      entidade_id: user.usuario_id,
      unidade_id: unidade.unidade_id,
      usuario_id: user.usuario_id,
      tipo_evento: 'usuario_login',
      origem_evento: 'app_usuario',
      descricao_evento: `Login do usuário ${user.nome}`,
      ator_tipo: 'usuario',
      ator_id: user.usuario_id
    });

    return apiOk_({
      modo: 'login',
      usuario: sanitizeUsuarioForApi_(user),
      unidade: sanitizeUnidadeForApi_(unidade)
    });
  }

  validateRequiredFields_(req, ['nome', 'telefone', 'email']);

  const created = reversaCreateUsuario({
    unidade_id: unidade.unidade_id,
    nome: req.nome,
    cpf: req.cpf,
    sala_apto_empresa: req.sala_apto_empresa || '',
    telefone: req.telefone,
    email: req.email,
    aceite_termos: req.aceite_termos || 'SIM',
    origem_cadastro: 'qr_unidade'
  });

  user = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', created.usuario_id);

  return apiOk_({
    modo: 'cadastro',
    usuario: sanitizeUsuarioForApi_(user),
    unidade: sanitizeUnidadeForApi_(unidade)
  });
}

function apiReadEtiqueta_(req) {
  validateRequiredFields_(req, ['usuario_id', 'codigo_etiqueta']);

  const result = reversaReadEtiqueta({
    usuario_id: req.usuario_id,
    codigo_etiqueta: req.codigo_etiqueta,
    origem_leitura: req.origem_leitura || 'app_usuario'
  });

  if (!result.ok) return result;

  const etiqueta = findRowById_(REVERSA_CORE_CFG.SHEETS.ETIQUETAS, 'etiqueta_id', result.etiqueta_id);

  return apiOk_({
    etiqueta: {
      etiqueta_id: etiqueta.etiqueta_id,
      codigo_etiqueta: etiqueta.codigo_etiqueta,
      codigo_manual_curto: etiqueta.codigo_manual_curto,
      status_etiqueta: etiqueta.status_etiqueta,
      unidade_id: etiqueta.unidade_id
    }
  });
}

function apiConfirmDropoff_(req) {
  validateRequiredFields_(req, [
    'usuario_id',
    'codigo_etiqueta',
    'codigo_autorizacao',
    'janela_coleta'
  ]);

  const result = reversaConfirmDropoff({
    usuario_id: req.usuario_id,
    codigo_etiqueta: req.codigo_etiqueta,
    codigo_autorizacao: req.codigo_autorizacao,
    janela_coleta: req.janela_coleta,
    comprimento_cm: req.comprimento_cm || '',
    largura_cm: req.largura_cm || '',
    altura_cm: req.altura_cm || '',
    observacao_usuario: req.observacao_usuario || ''
  });

  if (!result.ok) return result;

  return apiOk_(result);
}

function apiGetUserHistory_(req) {
  validateRequiredFields_(req, ['usuario_id']);

  const usuario = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', req.usuario_id);
  const reversas = getAllReversasByUsuario_(usuario.usuario_id);

  const items = reversas
    .sort((a, b) => new Date(b.data_criacao || 0) - new Date(a.data_criacao || 0))
    .map(r => ({
      reversa_id: r.reversa_id,
      unidade_id: r.unidade_id,
      etiqueta_id: r.etiqueta_id,
      codigo_autorizacao: r.codigo_autorizacao,
      janela_coleta: r.janela_coleta,
      status_reversa: r.status_reversa,
      data_criacao: r.data_criacao,
      data_confirmacao_dropoff: r.data_confirmacao_dropoff,
      data_coleta_agf: r.data_coleta_agf,
      data_recebimento_agencia: r.data_recebimento_agencia,
      data_postagem: r.data_postagem,
      codigo_sro: r.codigo_sro || '',
      alerta_codigo: r.alerta_codigo || ''
    }));

  return apiOk_({
    usuario: sanitizeUsuarioForApi_(usuario),
    total: items.length,
    items
  });
}

function apiGetDashboard_(req) {
  return apiOk_(getAdminBootstrapDataCached_(String(req.force || '') === '1').dashboard);
}

function apiGetUnitStatus_(req) {
  if (!req.unidade_id && !req.slug_unidade) {
    return apiError_('UNIT_REQUIRED', 'Informe unidade_id ou slug_unidade.');
  }

  let unidade;
  if (req.unidade_id) {
    unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', req.unidade_id);
  } else {
    unidade = findUnitBySlug_(req.slug_unidade);
  }

  if (!unidade) {
    return apiError_('UNIT_NOT_FOUND', 'Unidade não encontrada.');
  }

  return apiOk_({
    unidade: sanitizeUnidadeForApi_(unidade),
    status_ponto: buildUnitStatusInfo_(unidade.unidade_id),
    agenda_disponibilidade: buildUnitAvailabilityCalendar_(unidade.unidade_id, 5)
  });
}

function apiOpenColeta_(req) {
  validateRequiredFields_(req, ['unidade_id']);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', req.unidade_id);
    const reversasPendentes = getPendingReversasForUnit_(unidade.unidade_id);

    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS);
    const headers = getHeaders_(sheet);

    const coletaId = nextIdForSheet_(sheet, 'coleta_id', REVERSA_CORE_CFG.ID_PREFIX.COLETA, REVERSA_CORE_CFG.PAD_LENGTH.COLETA);
    const now = now_();

    const rowObj = blankRowObject_(headers);
    rowObj.coleta_id = coletaId;
    rowObj.unidade_id = unidade.unidade_id;
    rowObj.data_coleta_programada = req.data_coleta_programada || now;
    rowObj.data_inicio_coleta = '';
    rowObj.data_fim_coleta = '';
    rowObj.coletador_id = req.coletador_id || '';
    rowObj.qtde_prevista = reversasPendentes.length;
    rowObj.qtde_coletada = 0;
    rowObj.status_coleta = 'aberta';
    rowObj.observacao_coleta = req.observacao_coleta || '';
    rowObj.data_criacao = now;

    appendObjectRow_(sheet, headers, rowObj);

    logEvento_({
      tipo_entidade: 'COLETA',
      entidade_id: coletaId,
      unidade_id: unidade.unidade_id,
      coleta_id: coletaId,
      tipo_evento: 'coleta_aberta',
      origem_evento: 'painel_agf',
      descricao_evento: `Coleta ${coletaId} aberta para unidade ${unidade.nome_unidade}.`,
      ator_tipo: 'agf',
      ator_id: req.coletador_id || 'SISTEMA'
    });

    return apiOk_({
      coleta_id: coletaId,
      unidade_id: unidade.unidade_id,
      qtde_prevista: reversasPendentes.length
    });
  } finally {
    lock.releaseLock();
  }
}

function apiScanEtiquetaColeta_(req) {
  validateRequiredFields_(req, ['coleta_id', 'codigo_etiqueta']);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const coleta = findRowById_(REVERSA_CORE_CFG.SHEETS.COLETAS, 'coleta_id', req.coleta_id);
    const assignedCollector = getCurrentCollectorId_(coleta);
    if (assignedCollector && req.coletador_id && assignedCollector !== String(req.coletador_id || '').trim()) {
      return apiError_('COLLECTION_ASSIGNED_TO_ANOTHER_COLLECTOR', `Esta coleta está atribuída a ${assignedCollector}. Solicite a transferência pelo Admin Reverso.`);
    }
    const etiqueta = findEtiquetaByCodigo_(req.codigo_etiqueta);

    if (!etiqueta) {
      return apiError_('ETIQUETA_NOT_FOUND', 'Etiqueta não encontrada.');
    }

    if (String(etiqueta.unidade_id || '') !== String(coleta.unidade_id || '')) {
      return apiError_('ETIQUETA_WRONG_UNIT', 'Etiqueta não pertence à unidade desta coleta.');
    }

    if (!String(etiqueta.reversa_id || '').trim()) {
      return apiError_('ETIQUETA_WITHOUT_REVERSA', 'Etiqueta sem reversa vinculada.');
    }

    const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', etiqueta.reversa_id);
    if (!['dropoff_realizado', 'aguardando_coleta_agf'].includes(String(reversa.status_reversa || ''))) {
      return apiError_('REVERSA_INVALID_STATUS', `Reversa em status inválido para coleta: ${reversa.status_reversa}`);
    }

    const ss = getReversaSpreadsheet_();
    const coletaItensSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETA_ITENS);
    const coletaItensHeaders = getHeaders_(coletaItensSheet);
    const coletaSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS);
    const coletaHeaders = getHeaders_(coletaSheet);
    const reversasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
    const reversasHeaders = getHeaders_(reversasSheet);
    const etiquetasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);
    const etiquetasHeaders = getHeaders_(etiquetasSheet);

    const itensExistentes = getDataRowsAsObjects_(coletaItensSheet).find(item =>
      String(item.coleta_id || '') === String(coleta.coleta_id) &&
      String(item.etiqueta_id || '') === String(etiqueta.etiqueta_id)
    );

    if (itensExistentes) {
      return apiOk_({
        already_scanned: true,
        coleta_id: coleta.coleta_id,
        etiqueta_id: etiqueta.etiqueta_id,
        reversa_id: reversa.reversa_id
      });
    }

    const coletaItemId = nextIdForSheet_(coletaItensSheet, 'coleta_item_id', REVERSA_CORE_CFG.ID_PREFIX.COLETA_ITEM, REVERSA_CORE_CFG.PAD_LENGTH.COLETA_ITEM);
    const now = now_();

    const itemObj = blankRowObject_(coletaItensHeaders);
    itemObj.coleta_item_id = coletaItemId;
    itemObj.coleta_id = coleta.coleta_id;
    itemObj.reversa_id = reversa.reversa_id;
    itemObj.etiqueta_id = etiqueta.etiqueta_id;
    itemObj.unidade_id = coleta.unidade_id;
    itemObj.usuario_id = reversa.usuario_id;
    itemObj.data_hora_leitura_coletador = now;
    itemObj.status_item_coleta = 'confirmado';
    itemObj.divergencia_id = '';
    itemObj.observacao_item = req.observacao_item || '';

    appendObjectRow_(coletaItensSheet, coletaItensHeaders, itemObj);

    const reversaRowIndex = findRowIndexByValue_(reversasSheet, 'reversa_id', reversa.reversa_id);
    updateRowFieldsByIndex_(reversasSheet, reversasHeaders, reversaRowIndex, {
      status_reversa: 'coletada_agf',
      data_coleta_agf: now
    });

    const etiquetaRowIndex = findRowIndexByValue_(etiquetasSheet, 'etiqueta_id', etiqueta.etiqueta_id);
    updateRowFieldsByIndex_(etiquetasSheet, etiquetasHeaders, etiquetaRowIndex, {
      status_etiqueta: 'coletada',
      data_coleta: now
    });

    const coletaRowIndex = findRowIndexByValue_(coletaSheet, 'coleta_id', coleta.coleta_id);
    const itemsDaColeta = getDataRowsAsObjects_(coletaItensSheet).filter(i => String(i.coleta_id || '') === String(coleta.coleta_id));
    updateRowFieldsByIndex_(coletaSheet, coletaHeaders, coletaRowIndex, {
      status_coleta: 'em_andamento',
      data_inicio_coleta: coleta.data_inicio_coleta || now,
      coletador_id: req.coletador_id || assignedCollector || coleta.coletador_id || '',
      coletador_id_atual: req.coletador_id || assignedCollector || coleta.coletador_id || '',
      coletador_id_original: coleta.coletador_id_original || req.coletador_id || assignedCollector || coleta.coletador_id || '',
      qtde_coletada: itemsDaColeta.length,
      data_atualizacao: now
    });

    updateLoteCounters_(etiqueta.lote_id);

    logEvento_({
      tipo_entidade: 'REVERSA',
      entidade_id: reversa.reversa_id,
      unidade_id: coleta.unidade_id,
      usuario_id: reversa.usuario_id,
      reversa_id: reversa.reversa_id,
      etiqueta_id: etiqueta.etiqueta_id,
      coleta_id: coleta.coleta_id,
      tipo_evento: 'reversa_coletada_agf',
      origem_evento: 'app_coletador',
      descricao_evento: `Reversa ${reversa.reversa_id} coletada pela AGF.`,
      ator_tipo: 'coletador',
      ator_id: req.coletador_id || assignedCollector || coleta.coletador_id || 'COLETADOR'
    });

    sendEmailIfPossible_({
      usuario_id: reversa.usuario_id,
      subject: 'Seu objeto de logística reversa foi coletado',
      body: buildCollectedEmailBody_(reversa, etiqueta, coleta)
    });

    return apiOk_({
      coleta_id: coleta.coleta_id,
      etiqueta_id: etiqueta.etiqueta_id,
      reversa_id: reversa.reversa_id,
      status_reversa: 'coletada_agf'
    });
  } finally {
    lock.releaseLock();
  }
}

function apiCloseColeta_(req) {
  validateRequiredFields_(req, ['coleta_id']);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const coleta = findRowById_(REVERSA_CORE_CFG.SHEETS.COLETAS, 'coleta_id', req.coleta_id);
    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS);
    const headers = getHeaders_(sheet);

    const divergencias = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS))
      .filter(d => String(d.coleta_id || '') === String(coleta.coleta_id) && ['aberta', 'em_tratativa'].includes(String(d.status_divergencia || '')));

    const rowIndex = findRowIndexByValue_(sheet, 'coleta_id', coleta.coleta_id);
    updateRowFieldsByIndex_(sheet, headers, rowIndex, {
      status_coleta: divergencias.length ? 'concluida_com_divergencia' : 'concluida',
      data_fim_coleta: now_()
    });

    logEvento_({
      tipo_entidade: 'COLETA',
      entidade_id: coleta.coleta_id,
      unidade_id: coleta.unidade_id,
      coleta_id: coleta.coleta_id,
      tipo_evento: 'coleta_fechada',
      origem_evento: 'app_coletador',
      descricao_evento: `Coleta ${coleta.coleta_id} encerrada.`,
      ator_tipo: 'coletador',
      ator_id: req.coletador_id || assignedCollector || coleta.coletador_id || 'COLETADOR'
    });

    return apiOk_({
      coleta_id: coleta.coleta_id,
      status_coleta: divergencias.length ? 'concluida_com_divergencia' : 'concluida'
    });
  } finally {
    lock.releaseLock();
  }
}

function apiMarkRecebidaAgencia_(req) {
  validateRequiredFields_(req, ['reversa_id']);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', req.reversa_id);
    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
    const headers = getHeaders_(sheet);
    const rowIndex = findRowIndexByValue_(sheet, 'reversa_id', reversa.reversa_id);

    updateRowFieldsByIndex_(sheet, headers, rowIndex, {
      status_reversa: 'recebida_agencia',
      data_recebimento_agencia: now_()
    });

    logEvento_({
      tipo_entidade: 'REVERSA',
      entidade_id: reversa.reversa_id,
      unidade_id: reversa.unidade_id,
      usuario_id: reversa.usuario_id,
      reversa_id: reversa.reversa_id,
      etiqueta_id: reversa.etiqueta_id,
      tipo_evento: 'reversa_recebida_agencia',
      origem_evento: 'painel_agf',
      descricao_evento: `Reversa ${reversa.reversa_id} recebida na agência.`,
      ator_tipo: 'agf',
      ator_id: req.ator_id || 'AGF'
    });

    return apiOk_({
      reversa_id: reversa.reversa_id,
      status_reversa: 'recebida_agencia'
    });
  } finally {
    lock.releaseLock();
  }
}

function apiMarkPostada_(req) {
  validateRequiredFields_(req, ['reversa_id']);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', req.reversa_id);
    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
    const headers = getHeaders_(sheet);
    const rowIndex = findRowIndexByValue_(sheet, 'reversa_id', reversa.reversa_id);

    const now = now_();

    updateRowFieldsByIndex_(sheet, headers, rowIndex, {
      status_reversa: 'postada',
      data_postagem: now
    });

    logEvento_({
      tipo_entidade: 'REVERSA',
      entidade_id: reversa.reversa_id,
      unidade_id: reversa.unidade_id,
      usuario_id: reversa.usuario_id,
      reversa_id: reversa.reversa_id,
      etiqueta_id: reversa.etiqueta_id,
      tipo_evento: 'reversa_postada',
      origem_evento: 'painel_agf',
      descricao_evento: `Reversa ${reversa.reversa_id} postada.`,
      ator_tipo: 'agf',
      ator_id: req.ator_id || 'AGF'
    });

    sendEmailIfPossible_({
      usuario_id: reversa.usuario_id,
      subject: 'Seu objeto de logística reversa foi postado',
      body: buildPostedEmailBody_(reversa)
    });

    return apiOk_({
      reversa_id: reversa.reversa_id,
      status_reversa: 'postada',
      data_postagem: now
    });
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * HELPERS API
 * ========================= */
function parseWebRequest_(e, method) {
  const params = (e && e.parameter) ? e.parameter : {};
  let body = {};

  if (method === 'POST' && e && e.postData && e.postData.contents) {
    const contents = String(e.postData.contents || '').trim();
    if (contents) {
      try {
        body = JSON.parse(contents);
      } catch (err) {
        throw new Error('JSON inválido no corpo da requisição.');
      }
    }
  }

  const merged = { ...params, ...body };
  return merged;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiOk_(data) {
  return {
    ok: true,
    data: data || {},
    error: null,
    ts: now_()
  };
}

function apiError_(code, message, details) {
  return {
    ok: false,
    data: null,
    error: {
      code: code || 'UNKNOWN_ERROR',
      message: message || 'Erro desconhecido.',
      details: details || null
    },
    ts: now_()
  };
}

function buildErrorResponse_(err) {
  const message = err && err.message ? err.message : String(err);
  return apiError_('UNHANDLED_ERROR', message);
}

/** =========================
 * HELPERS DE NEGÓCIO API
 * ========================= */
function findUnitBySlug_(slug) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES);
  const rows = getDataRowsAsObjects_(sheet);
  const target = normalizeSlug_(slug);
  return rows.find(r => normalizeSlug_(r.slug_unidade) === target) || null;
}

function sanitizeUnidadeForApi_(u) {
  return {
    unidade_id: u.unidade_id,
    codigo_unidade: u.codigo_unidade,
    slug_unidade: u.slug_unidade,
    nome_unidade: u.nome_unidade,
    tipo_unidade: u.tipo_unidade,
    status_unidade: u.status_unidade,
    cidade: u.cidade,
    uf: u.uf,
    prazo_coleta_dias_uteis: u.prazo_coleta_dias_uteis,
    logo_unidade_url: u.logo_unidade_url || '',
    qr_url_unidade: u.qr_url_unidade || ''
  };
}

function sanitizeUsuarioForApi_(u) {
  return {
    usuario_id: u.usuario_id,
    unidade_id: u.unidade_id,
    nome: u.nome,
    cpf: u.cpf,
    sala_apto_empresa: u.sala_apto_empresa,
    telefone: u.telefone,
    email: u.email,
    status_usuario: u.status_usuario
  };
}

function getAllReversasByUsuario_(usuarioId) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
  const rows = getDataRowsAsObjects_(sheet);
  return rows.filter(r => String(r.usuario_id || '') === String(usuarioId));
}

function getPendingReversasForUnit_(unidadeId) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
  const rows = getDataRowsAsObjects_(sheet);

  return rows.filter(r =>
    String(r.unidade_id || '') === String(unidadeId) &&
    ['dropoff_realizado', 'aguardando_coleta_agf'].includes(String(r.status_reversa || ''))
  );
}

function buildUnitStatusInfo_(unidadeId) {
  const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', unidadeId);
  const pendentes = getPendingReversasForUnit_(unidadeId);
  const etiquetas = getDataRowsAsObjects_(getSheet_(getReversaSpreadsheet_(), REVERSA_CORE_CFG.SHEETS.ETIQUETAS))
    .filter(e => String(e.unidade_id || '') === String(unidadeId));

  const capPacotes = Number(unidade.capacidade_max_pacotes || 0) || 0;
  const pendentesCount = pendentes.length;
  const ocupacaoPct = capPacotes > 0 ? Number(((pendentesCount / capPacotes) * 100).toFixed(2)) : 0;
  const alertaPct = Number(unidade.nivel_alerta_ocupacao_pct || 80) || 80;

  let statusOcupacao = 'normal';
  if (capPacotes > 0 && pendentesCount >= capPacotes) {
    statusOcupacao = 'indisponivel';
  } else if (ocupacaoPct >= 95) {
    statusOcupacao = 'quase_cheio';
  } else if (ocupacaoPct >= alertaPct) {
    statusOcupacao = 'atencao';
  }

  const etiquetasDisponiveis = etiquetas.filter(e => e.status_etiqueta === 'disponivel').length;
  const etiquetasLidasNaoConfirmadas = etiquetas.filter(e => e.status_etiqueta === 'lida').length;

  return {
    pacotes_pendentes: pendentesCount,
    capacidade_max_pacotes: capPacotes,
    ocupacao_pct: ocupacaoPct,
    status_ocupacao: statusOcupacao,
    etiquetas_disponiveis: etiquetasDisponiveis,
    etiquetas_lidas_nao_confirmadas: etiquetasLidasNaoConfirmadas
  };
}

function buildUnitAvailabilityCalendar_(unidadeId, daysAhead) {
  const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', unidadeId);
  const statusInfo = buildUnitStatusInfo_(unidadeId);
  const out = [];

  let cursor = new Date();
  let added = 0;
  while (added < (daysAhead || 5)) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const iso = Utilities.formatDate(cursor, REVERSA_CORE_CFG.TZ, 'yyyy-MM-dd');
      const label = Utilities.formatDate(cursor, REVERSA_CORE_CFG.TZ, 'dd/MM/yyyy');
      const disponivelHoje = unidade.status_unidade === 'ativa'
        ? (statusInfo.status_ocupacao !== 'indisponivel' || added > 0)
        : false;

      out.push({
        data_iso: iso,
        data_label: label,
        disponivel: disponivelHoje
      });
      added++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function formatDateOnly_(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, REVERSA_CORE_CFG.TZ, 'yyyy-MM-dd');
}

/** =========================
 * E-MAILS
 * ========================= */
function sendEmailIfPossible_(payload) {
  try {
    if (!payload || !payload.usuario_id) return;

    const usuario = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', payload.usuario_id);
    const email = normalizeEmail_(usuario.email);
    if (!email) return;

    MailApp.sendEmail({
      to: email,
      subject: payload.subject || 'Atualização da sua logística reversa',
      htmlBody: payload.body || ''
    });
  } catch (err) {
    Logger.log(`[REVERSA][EMAIL][ERRO] ${err && err.stack ? err.stack : err}`);
  }
}

function buildCollectedEmailBody_(reversa, etiqueta, coleta) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Olá,</p>
      <p>Seu objeto de logística reversa foi <strong>coletado pela AGF</strong>.</p>
      <p><strong>Reversa:</strong> ${reversa.reversa_id}<br>
      <strong>Etiqueta:</strong> ${etiqueta.codigo_etiqueta}<br>
      <strong>Coleta:</strong> ${coleta.coleta_id}</p>
      <p>Você receberá uma nova atualização quando o objeto for postado.</p>
    </div>
  `;
}

function buildPostedEmailBody_(reversa) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Olá,</p>
      <p>Seu objeto de logística reversa foi <strong>postado</strong>.</p>
      <p><strong>Reversa:</strong> ${reversa.reversa_id}</p>
      <p>Em breve você poderá acompanhar a evolução conforme o fluxo da devolução.</p>
    </div>
  `;
}

/** =========================
 * TESTES API
 * ========================= */
function testApiHealth() {
  const result = apiHealth_();
  Logger.log(JSON.stringify(result, null, 2));
}

function testApiGetUnitBySlug() {
  const ss = getReversaSpreadsheet_();
  const unidades = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES));
  if (!unidades.length) throw new Error('Nenhuma unidade cadastrada.');
  const result = apiGetUnitBySlug_({ slug_unidade: unidades[0].slug_unidade });
  Logger.log(JSON.stringify(result, null, 2));
}