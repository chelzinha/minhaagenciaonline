/***************************************
 * REVERSA - ETAPA 3
 * Núcleo base do backend da V1
 ***************************************/

/** =========================
 * CFG
 * ========================= */
const REVERSA_CORE_CFG = {
  SPREADSHEET_ID: '1S_U-nsBJXDd8D5gWEfROv-ii0JJZEfdKUgk6ndeRL_k',
  TZ: Session.getScriptTimeZone() || 'America/Fortaleza',

  SHEETS: {
    UNIDADES: 'UNIDADES',
    USUARIOS: 'USUARIOS',
    LOTES_ETIQUETAS: 'LOTES_ETIQUETAS',
    ETIQUETAS: 'ETIQUETAS',
    REVERSAS: 'REVERSAS',
    COLETAS: 'COLETAS',
    COLETA_ITENS: 'COLETA_ITENS',
    EVENTOS: 'EVENTOS',
    DIVERGENCIAS: 'DIVERGENCIAS',
    PARAMETROS: 'PARAMETROS',
    AUX_LISTAS: 'AUX_LISTAS'
  },

  ID_PREFIX: {
    UNIDADE: 'UND',
    USUARIO: 'USR',
    LOTE: 'LOT',
    ETIQUETA: 'ETQ',
    REVERSA: 'REV',
    COLETA: 'COL',
    COLETA_ITEM: 'CIT',
    DIVERGENCIA: 'DIV',
    EVENTO: 'EVT'
  },

  PAD_LENGTH: {
    UNIDADE: 4,
    USUARIO: 4,
    LOTE: 4,
    ETIQUETA: 6,
    REVERSA: 6,
    COLETA: 6,
    COLETA_ITEM: 6,
    DIVERGENCIA: 6,
    EVENTO: 6
  }
};


/** =========================
 * API INTERNA - UNIDADE
 * ========================= */
function reversaCreateUnidade(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    validateRequiredFields_(payload, ['codigo_unidade', 'slug_unidade', 'nome_unidade', 'tipo_unidade', 'cidade', 'uf']);

    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES);
    const headers = getHeaders_(sheet);
    const map = headerMap_(headers);

    const existingRows = getDataRowsAsObjects_(sheet);
    const codigoUnidade = normalizeText_(payload.codigo_unidade);
    const slugUnidade = normalizeSlug_(payload.slug_unidade);

    if (existingRows.some(r => normalizeText_(r.codigo_unidade) === codigoUnidade)) {
      throw new Error(`Já existe unidade com codigo_unidade=${payload.codigo_unidade}`);
    }
    if (existingRows.some(r => normalizeText_(r.slug_unidade) === slugUnidade)) {
      throw new Error(`Já existe unidade com slug_unidade=${payload.slug_unidade}`);
    }

    const unidadeId = nextIdForSheet_(sheet, 'unidade_id', REVERSA_CORE_CFG.ID_PREFIX.UNIDADE, REVERSA_CORE_CFG.PAD_LENGTH.UNIDADE);
    const now = now_();
    const prazoPadrao = getParametroValue_('dias_uteis_padrao_coleta') || '2';
    const capacidadeDefault = getParametroValue_('capacidade_default_pacotes') || '30';
    const alertaDefault = getParametroValue_('nivel_alerta_ocupacao_pct_default') || '80';

    const rowObj = blankRowObject_(headers);
    rowObj.unidade_id = unidadeId;
    rowObj.codigo_unidade = codigoUnidade;
    rowObj.slug_unidade = slugUnidade;
    rowObj.nome_unidade = payload.nome_unidade;
    rowObj.tipo_unidade = payload.tipo_unidade;
    rowObj.status_unidade = payload.status_unidade || 'ativa';
    rowObj.endereco = payload.endereco || '';
    rowObj.numero = payload.numero || '';
    rowObj.complemento = payload.complemento || '';
    rowObj.bairro = payload.bairro || '';
    rowObj.cidade = payload.cidade;
    rowObj.uf = payload.uf;
    rowObj.cep = asText_(payload.cep);
    rowObj.latitude = payload.latitude || '';
    rowObj.longitude = payload.longitude || '';
    rowObj.prazo_coleta_dias_uteis = payload.prazo_coleta_dias_uteis || prazoPadrao;
    rowObj.capacidade_max_pacotes = payload.capacidade_max_pacotes || capacidadeDefault;
    rowObj.capacidade_max_volume_litros = payload.capacidade_max_volume_litros || '';
    rowObj.nivel_alerta_ocupacao_pct = payload.nivel_alerta_ocupacao_pct || alertaDefault;
    rowObj.email_suporte = payload.email_suporte || getParametroValue_('email_suporte_padrao') || '';
    rowObj.telefone_suporte = payload.telefone_suporte || getParametroValue_('telefone_suporte_padrao') || '';
    rowObj.mensagem_usuario = payload.mensagem_usuario || '';
    rowObj.logo_unidade_url = payload.logo_unidade_url || '';
    rowObj.qr_url_unidade = buildQrUrlUnidade_(slugUnidade);
    rowObj.data_criacao = now;
    rowObj.data_atualizacao = now;
    rowObj.coletador_padrao_id = payload.coletador_padrao_id || '';

    appendObjectRow_(sheet, headers, rowObj);

    logEvento_({
      tipo_entidade: 'UNIDADE',
      entidade_id: unidadeId,
      unidade_id: unidadeId,
      tipo_evento: 'unidade_criada',
      origem_evento: 'painel_agf',
      descricao_evento: `Unidade criada: ${payload.nome_unidade}`,
      ator_tipo: 'agf',
      ator_id: 'SISTEMA'
    });

    return {
      ok: true,
      unidade_id: unidadeId,
      qr_url_unidade: rowObj.qr_url_unidade,
      data_criacao: now
    };
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * API INTERNA - USUÁRIO
 * ========================= */
function reversaCreateUsuario(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    validateRequiredFields_(payload, ['unidade_id', 'nome', 'cpf', 'telefone', 'email']);

    ensureRecordExistsById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', payload.unidade_id);

    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.USUARIOS);
    const headers = getHeaders_(sheet);
    const rows = getDataRowsAsObjects_(sheet);

    const cpf = onlyDigits_(payload.cpf);
    if (rows.some(r => onlyDigits_(r.cpf) === cpf && String(r.unidade_id || '') === String(payload.unidade_id))) {
      throw new Error(`Já existe usuário com este CPF nesta unidade.`);
    }

    const usuarioId = nextIdForSheet_(sheet, 'usuario_id', REVERSA_CORE_CFG.ID_PREFIX.USUARIO, REVERSA_CORE_CFG.PAD_LENGTH.USUARIO);
    const now = now_();

    const rowObj = blankRowObject_(headers);
    rowObj.usuario_id = usuarioId;
    rowObj.unidade_id = payload.unidade_id;
    rowObj.nome = payload.nome;
    rowObj.cpf = cpf;
    rowObj.sala_apto_empresa = payload.sala_apto_empresa || '';
    rowObj.telefone = asText_(payload.telefone);
    rowObj.email = normalizeEmail_(payload.email);
    rowObj.status_usuario = payload.status_usuario || 'ativo';
    rowObj.aceite_termos = payload.aceite_termos || 'SIM';
    rowObj.data_aceite_termos = now;
    rowObj.origem_cadastro = payload.origem_cadastro || 'qr_unidade';
    rowObj.data_cadastro = now;
    rowObj.data_ultimo_acesso = now;
    rowObj.observacao_interna = payload.observacao_interna || '';

    appendObjectRow_(sheet, headers, rowObj);

    logEvento_({
      tipo_entidade: 'USUARIO',
      entidade_id: usuarioId,
      unidade_id: payload.unidade_id,
      usuario_id: usuarioId,
      tipo_evento: 'usuario_cadastrado',
      origem_evento: 'app_usuario',
      descricao_evento: `Usuário cadastrado: ${payload.nome}`,
      ator_tipo: 'usuario',
      ator_id: usuarioId
    });

    return {
      ok: true,
      usuario_id: usuarioId,
      data_cadastro: now
    };
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * API INTERNA - LOTE ETIQUETAS
 * ========================= */
function reversaGenerateLoteEtiquetas(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    validateRequiredFields_(payload, ['unidade_id', 'quantidade']);

    ensureRecordExistsById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', payload.unidade_id);

    const quantidade = Number(payload.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error('Quantidade inválida para geração do lote.');
    }

    const ss = getReversaSpreadsheet_();
    const lotesSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS);
    const etiquetasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);

    const lotesHeaders = getHeaders_(lotesSheet);
    const etiquetasHeaders = getHeaders_(etiquetasSheet);

    const loteId = nextIdForSheet_(lotesSheet, 'lote_id', REVERSA_CORE_CFG.ID_PREFIX.LOTE, REVERSA_CORE_CFG.PAD_LENGTH.LOTE);
    const now = now_();

    const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', payload.unidade_id);
    const prefixo = payload.prefixo_etiqueta || unidade.codigo_unidade || 'UND';

    const etiquetaRows = [];
    const firstEtqSeq = peekNextSequenceForSheet_(etiquetasSheet, 'etiqueta_id', REVERSA_CORE_CFG.ID_PREFIX.ETIQUETA);
    let faixaInicial = '';
    let faixaFinal = '';

    for (let i = 0; i < quantidade; i++) {
      const seq = firstEtqSeq + i;
      const etiquetaId = formatId_(REVERSA_CORE_CFG.ID_PREFIX.ETIQUETA, seq, REVERSA_CORE_CFG.PAD_LENGTH.ETIQUETA);
      const codigoManualCurto = `${prefixo}-${String(seq).padStart(6, '0')}`;
      const qrUrl = buildQrUrlEtiqueta_(codigoManualCurto);

      if (i === 0) faixaInicial = codigoManualCurto;
      if (i === quantidade - 1) faixaFinal = codigoManualCurto;

      const rowObj = blankRowObject_(etiquetasHeaders);
      rowObj.etiqueta_id = etiquetaId;
      rowObj.lote_id = loteId;
      rowObj.unidade_id = payload.unidade_id;
      rowObj.codigo_etiqueta = codigoManualCurto;
      rowObj.codigo_manual_curto = codigoManualCurto;
      rowObj.qr_url_etiqueta = qrUrl;
      rowObj.status_etiqueta = 'disponivel';
      rowObj.usuario_id = '';
      rowObj.reversa_id = '';
      rowObj.data_geracao = now;
      rowObj.data_leitura = '';
      rowObj.data_confirmacao_dropoff = '';
      rowObj.data_coleta = '';
      rowObj.data_conclusao = '';
      rowObj.origem_leitura = '';
      rowObj.observacao = '';

      etiquetaRows.push(objectToRow_(etiquetasHeaders, rowObj));
    }

    const loteObj = blankRowObject_(lotesHeaders);
    loteObj.lote_id = loteId;
    loteObj.unidade_id = payload.unidade_id;
    loteObj.codigo_lote = `${prefixo}-${Utilities.formatDate(new Date(), REVERSA_CORE_CFG.TZ, 'yyyyMMdd-HHmmss')}`;
    loteObj.prefixo_etiqueta = prefixo;
    loteObj.faixa_inicial = faixaInicial;
    loteObj.faixa_final = faixaFinal;
    loteObj.qtde_gerada = quantidade;
    loteObj.qtde_disponivel = quantidade;
    loteObj.qtde_lida = 0;
    loteObj.qtde_confirmada_dropoff = 0;
    loteObj.qtde_coletada = 0;
    loteObj.qtde_inutilizada = 0;
    loteObj.status_lote = 'aberto';
    loteObj.data_geracao = now;
    loteObj.data_abastecimento = '';
    loteObj.responsavel_geracao = payload.responsavel_geracao || 'SISTEMA';
    loteObj.observacao = payload.observacao || '';

    appendObjectRow_(lotesSheet, lotesHeaders, loteObj);
    appendRowsBatch_(etiquetasSheet, etiquetaRows);

    logEvento_({
      tipo_entidade: 'LOTE_ETIQUETAS',
      entidade_id: loteId,
      unidade_id: payload.unidade_id,
      tipo_evento: 'lote_etiquetas_gerado',
      origem_evento: 'painel_agf',
      descricao_evento: `Lote ${loteId} gerado com ${quantidade} etiquetas.`,
      ator_tipo: 'agf',
      ator_id: payload.responsavel_geracao || 'SISTEMA'
    });

    return {
      ok: true,
      lote_id: loteId,
      quantidade,
      faixa_inicial: faixaInicial,
      faixa_final: faixaFinal
    };
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * API INTERNA - LEITURA ETIQUETA
 * Não vincula reversa ainda
 * ========================= */
function reversaReadEtiqueta(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    validateRequiredFields_(payload, ['codigo_etiqueta', 'usuario_id']);

    const usuario = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', payload.usuario_id);
    const etiqueta = findEtiquetaByCodigo_(payload.codigo_etiqueta);

    if (!etiqueta) {
      return {
        ok: false,
        code: 'ETIQUETA_NAO_ENCONTRADA',
        message: 'Etiqueta não encontrada.'
      };
    }

    if (String(etiqueta.unidade_id || '') !== String(usuario.unidade_id || '')) {
      return {
        ok: false,
        code: 'ETIQUETA_OUTRA_UNIDADE',
        message: 'Esta etiqueta pertence a outra unidade.'
      };
    }

    if (!['disponivel', 'lida'].includes(String(etiqueta.status_etiqueta || ''))) {
      return {
        ok: false,
        code: 'ETIQUETA_INDISPONIVEL',
        message: `Etiqueta em status inválido: ${etiqueta.status_etiqueta}`
      };
    }

    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);
    const headers = getHeaders_(sheet);
    const rowIndex = findRowIndexByValue_(sheet, 'etiqueta_id', etiqueta.etiqueta_id);

    updateRowFieldsByIndex_(sheet, headers, rowIndex, {
      status_etiqueta: 'lida',
      data_leitura: now_(),
      origem_leitura: payload.origem_leitura || 'app_usuario'
    });

    updateLoteCounters_(etiqueta.lote_id);

    logEvento_({
      tipo_entidade: 'ETIQUETA',
      entidade_id: etiqueta.etiqueta_id,
      unidade_id: etiqueta.unidade_id,
      usuario_id: payload.usuario_id,
      etiqueta_id: etiqueta.etiqueta_id,
      tipo_evento: 'etiqueta_lida',
      origem_evento: payload.origem_leitura || 'app_usuario',
      descricao_evento: `Etiqueta ${etiqueta.codigo_etiqueta} lida pelo usuário.`,
      ator_tipo: 'usuario',
      ator_id: payload.usuario_id
    });

    return {
      ok: true,
      etiqueta_id: etiqueta.etiqueta_id,
      unidade_id: etiqueta.unidade_id,
      codigo_etiqueta: etiqueta.codigo_etiqueta,
      status_etiqueta: 'lida'
    };
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * API INTERNA - CONFIRMAR DROPOFF
 * Cria reversa e vincula tudo
 * ========================= */
function reversaConfirmDropoff(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    validateRequiredFields_(payload, [
      'usuario_id',
      'codigo_etiqueta',
      'codigo_autorizacao',
      'janela_coleta'
    ]);

    const usuario = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', payload.usuario_id);
    const etiqueta = findEtiquetaByCodigo_(payload.codigo_etiqueta);

    if (!etiqueta) throw new Error('Etiqueta não encontrada.');
    if (String(etiqueta.unidade_id || '') !== String(usuario.unidade_id || '')) {
      throw new Error('Etiqueta não pertence à mesma unidade do usuário.');
    }
    if (String(etiqueta.status_etiqueta || '') !== 'lida') {
      throw new Error(`Etiqueta deve estar em status "lida" para confirmar drop-off. Status atual: ${etiqueta.status_etiqueta}`);
    }
    if (String(etiqueta.reversa_id || '').trim() !== '') {
      throw new Error('Esta etiqueta já está vinculada a uma reversa.');
    }

    const ss = getReversaSpreadsheet_();
    const reversasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
    const etiquetasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);

    const reversasHeaders = getHeaders_(reversasSheet);
    const etiquetasHeaders = getHeaders_(etiquetasSheet);

    const reversaId = nextIdForSheet_(reversasSheet, 'reversa_id', REVERSA_CORE_CFG.ID_PREFIX.REVERSA, REVERSA_CORE_CFG.PAD_LENGTH.REVERSA);
    const now = now_();
    const codigoNorm = normalizeAuthorizationCode_(payload.codigo_autorizacao);
    const validacao = validateAuthorizationCodePattern_(codigoNorm);
    const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', usuario.unidade_id);
    const diasUteis = Number(unidade.prazo_coleta_dias_uteis || getParametroValue_('dias_uteis_padrao_coleta') || 2);

    const comprimento = parseNonNegativeNumber_(payload.comprimento_cm);
    const largura = parseNonNegativeNumber_(payload.largura_cm);
    const altura = parseNonNegativeNumber_(payload.altura_cm);
    const volume = calculateVolumeLiters_(comprimento, largura, altura);

    const reversaObj = blankRowObject_(reversasHeaders);
    reversaObj.reversa_id = reversaId;
    reversaObj.unidade_id = usuario.unidade_id;
    reversaObj.usuario_id = usuario.usuario_id;
    reversaObj.etiqueta_id = etiqueta.etiqueta_id;
    reversaObj.codigo_autorizacao = asText_(payload.codigo_autorizacao);
    reversaObj.codigo_autorizacao_normalizado = codigoNorm;
    reversaObj.tipo_validacao_codigo = validacao.match ? 'padrao_reconhecido' : 'padrao_nao_reconhecido';
    reversaObj.alerta_codigo = validacao.match ? '' : getParametroValue_('mensagem_alerta_codigo_nao_reconhecido');
    reversaObj.janela_coleta = payload.janela_coleta;
    reversaObj.data_limite_operacional = addBusinessDays_(new Date(), diasUteis);
    reversaObj.comprimento_cm = comprimento;
    reversaObj.largura_cm = largura;
    reversaObj.altura_cm = altura;
    reversaObj.volume_litros_estimado = volume;
    reversaObj.status_reversa = 'dropoff_realizado';
    reversaObj.observacao_usuario = payload.observacao_usuario || '';
    reversaObj.data_criacao = now;
    reversaObj.data_confirmacao_dropoff = now;
    reversaObj.data_coleta_agf = '';
    reversaObj.data_recebimento_agencia = '';
    reversaObj.data_postagem = '';
    reversaObj.data_conclusao = '';

    appendObjectRow_(reversasSheet, reversasHeaders, reversaObj);

    const etiquetaRowIndex = findRowIndexByValue_(etiquetasSheet, 'etiqueta_id', etiqueta.etiqueta_id);
    updateRowFieldsByIndex_(etiquetasSheet, etiquetasHeaders, etiquetaRowIndex, {
      status_etiqueta: 'confirmada_dropoff',
      usuario_id: usuario.usuario_id,
      reversa_id: reversaId,
      data_confirmacao_dropoff: now
    });

    updateLoteCounters_(etiqueta.lote_id);

    logEvento_({
      tipo_entidade: 'REVERSA',
      entidade_id: reversaId,
      unidade_id: usuario.unidade_id,
      usuario_id: usuario.usuario_id,
      reversa_id: reversaId,
      etiqueta_id: etiqueta.etiqueta_id,
      tipo_evento: 'dropoff_confirmado',
      origem_evento: 'app_usuario',
      descricao_evento: `Drop-off confirmado para a reversa ${reversaId}.`,
      ator_tipo: 'usuario',
      ator_id: usuario.usuario_id
    });

    // V1.4.0: cria ou atualiza automaticamente a coleta operacional da unidade.
    // Isso não muda o marco de responsabilidade: a custódia AGF começa somente na leitura pelo coletador.
    ensureAutomaticColetaForUnit_(usuario.unidade_id, reversaObj.data_limite_operacional);

    return {
      ok: true,
      reversa_id: reversaId,
      etiqueta_id: etiqueta.etiqueta_id,
      unidade_id: usuario.unidade_id,
      status_reversa: 'dropoff_realizado',
      data_limite_operacional: reversaObj.data_limite_operacional,
      alerta_codigo: reversaObj.alerta_codigo || ''
    };
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * HELPERS - REGRAS / PARAMS
 * ========================= */
function getParametroValue_(parametro) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.PARAMETROS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return '';

  const headers = data[0];
  const map = headerMap_(headers);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[map.parametro] || '').trim() === parametro) {
      return String(row[map.valor] || '').trim();
    }
  }
  return '';
}

function validateAuthorizationCodePattern_(code) {
  const patterns = [];
  const p1 = getParametroValue_('regex_codigo_correios_1');
  if (p1) patterns.push(p1);

  const match = patterns.some(p => {
    try {
      return new RegExp(p).test(code);
    } catch (e) {
      return false;
    }
  });

  return { match };
}

function buildQrUrlUnidade_(slugUnidade) {
  const base = 'https://www.minhaagenciaonline.com.br/reverso/';
  return `${base}${slugUnidade}`;
}

function buildQrUrlEtiqueta_(codigoEtiqueta) {
  const base = 'https://www.minhaagenciaonline.com.br/reverso/?etiqueta=';
  return `${base}${encodeURIComponent(codigoEtiqueta)}`;
}

function calculateVolumeLiters_(c, l, a) {
  if (![c, l, a].every(v => Number.isFinite(v) && v >= 0)) return '';
  return Number(((c * l * a) / 1000).toFixed(2));
}

/** =========================
 * HELPERS - IDs
 * ========================= */
function nextIdForSheet_(sheet, headerName, prefix, padLength) {
  const nextSeq = peekNextSequenceForSheet_(sheet, headerName, prefix);
  return formatId_(prefix, nextSeq, padLength);
}

function peekNextSequenceForSheet_(sheet, headerName, prefix) {
  const headers = getHeaders_(sheet);
  const map = headerMap_(headers);
  const idx = map[headerName];
  if (idx === undefined) throw new Error(`Cabeçalho ${headerName} não encontrado em ${sheet.getName()}.`);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;

  const values = sheet.getRange(2, idx + 1, lastRow - 1, 1).getValues().flat();
  let maxSeq = 0;

  values.forEach(v => {
    const str = String(v || '').trim();
    const m = str.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) {
      const seq = Number(m[1]);
      if (seq > maxSeq) maxSeq = seq;
    }
  });

  return maxSeq + 1;
}

function formatId_(prefix, seq, padLength) {
  return `${prefix}-${String(seq).padStart(padLength, '0')}`;
}

/** =========================
 * HELPERS - EVENTOS
 * ========================= */
function logEvento_(payload) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.EVENTOS);
  const headers = getHeaders_(sheet);

  const eventoId = nextIdForSheet_(sheet, 'evento_id', REVERSA_CORE_CFG.ID_PREFIX.EVENTO, REVERSA_CORE_CFG.PAD_LENGTH.EVENTO);
  const now = now_();

  const rowObj = blankRowObject_(headers);
  rowObj.evento_id = eventoId;
  rowObj.tipo_entidade = payload.tipo_entidade || '';
  rowObj.entidade_id = payload.entidade_id || '';
  rowObj.unidade_id = payload.unidade_id || '';
  rowObj.usuario_id = payload.usuario_id || '';
  rowObj.reversa_id = payload.reversa_id || '';
  rowObj.etiqueta_id = payload.etiqueta_id || '';
  rowObj.coleta_id = payload.coleta_id || '';
  rowObj.tipo_evento = payload.tipo_evento || '';
  rowObj.origem_evento = payload.origem_evento || 'sistema';
  rowObj.descricao_evento = payload.descricao_evento || '';
  rowObj.ator_tipo = payload.ator_tipo || 'sistema';
  rowObj.ator_id = payload.ator_id || 'SISTEMA';
  rowObj.data_hora_evento = now;

  appendObjectRow_(sheet, headers, rowObj);
}

/** =========================
 * HELPERS - LOTES
 * ========================= */
function updateLoteCounters_(loteId) {
  const ss = getReversaSpreadsheet_();
  const etiquetasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);
  const lotesSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS);

  const etqRows = getDataRowsAsObjects_(etiquetasSheet).filter(r => String(r.lote_id || '') === String(loteId));
  const lotesHeaders = getHeaders_(lotesSheet);
  const rowIndex = findRowIndexByValue_(lotesSheet, 'lote_id', loteId);

  const counters = {
    qtde_disponivel: etqRows.filter(r => r.status_etiqueta === 'disponivel').length,
    qtde_lida: etqRows.filter(r => r.status_etiqueta === 'lida').length,
    qtde_confirmada_dropoff: etqRows.filter(r => r.status_etiqueta === 'confirmada_dropoff').length,
    qtde_coletada: etqRows.filter(r => r.status_etiqueta === 'coletada').length,
    qtde_inutilizada: etqRows.filter(r => r.status_etiqueta === 'inutilizada').length
  };

  let statusLote = 'aberto';
  if (counters.qtde_disponivel === 0 && etqRows.length > 0) {
    statusLote = 'consumido';
  } else if (counters.qtde_disponivel < etqRows.length) {
    statusLote = 'parcial';
  }

  updateRowFieldsByIndex_(lotesSheet, lotesHeaders, rowIndex, {
    ...counters,
    status_lote: statusLote
  });
}

/** =========================
 * HELPERS - FINDERS
 * ========================= */
function findEtiquetaByCodigo_(codigoEtiqueta) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);
  const rows = getDataRowsAsObjects_(sheet);
  const code = normalizeText_(codigoEtiqueta);

  return rows.find(r =>
    normalizeText_(r.codigo_etiqueta) === code ||
    normalizeText_(r.codigo_manual_curto) === code
  ) || null;
}

function findRowById_(sheetName, idHeader, idValue) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, sheetName);
  const rows = getDataRowsAsObjects_(sheet);
  const record = rows.find(r => String(r[idHeader] || '') === String(idValue || ''));

  if (!record) {
    throw new Error(`Registro não encontrado em ${sheetName}: ${idHeader}=${idValue}`);
  }
  return record;
}

function ensureRecordExistsById_(sheetName, idHeader, idValue) {
  findRowById_(sheetName, idHeader, idValue);
}

function findRowIndexByValue_(sheet, headerName, value) {
  const headers = getHeaders_(sheet);
  const map = headerMap_(headers);
  const idx = map[headerName];
  if (idx === undefined) throw new Error(`Cabeçalho ${headerName} não encontrado em ${sheet.getName()}.`);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error(`Nenhum dado encontrado em ${sheet.getName()}.`);

  const values = sheet.getRange(2, idx + 1, lastRow - 1, 1).getValues().flat();
  const pos = values.findIndex(v => String(v || '') === String(value || ''));

  if (pos === -1) throw new Error(`Valor não encontrado em ${sheet.getName()}: ${headerName}=${value}`);

  return pos + 2;
}

/** =========================
 * HELPERS - SHEETS
 * ========================= */
function getReversaSpreadsheet_() {
  return SpreadsheetApp.openById(REVERSA_CORE_CFG.SPREADSHEET_ID);
}

function getSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Aba não encontrada: ${sheetName}`);
  return sheet;
}

function getHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (!lastCol) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
}

function headerMap_(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    if (h) map[h] = idx;
  });
  return map;
}

function blankRowObject_(headers) {
  const obj = {};
  headers.forEach(h => { obj[h] = ''; });
  return obj;
}

function objectToRow_(headers, obj) {
  return headers.map(h => obj[h] !== undefined ? obj[h] : '');
}

function appendObjectRow_(sheet, headers, obj) {
  const row = objectToRow_(headers, obj);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function appendRowsBatch_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function getDataRowsAsObjects_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = data[i][idx];
    });
    rows.push(row);
  }

  return rows;
}

function updateRowFieldsByIndex_(sheet, headers, rowIndex, changes) {
  const map = headerMap_(headers);
  const currentRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const nextRow = [...currentRow];

  Object.keys(changes).forEach(key => {
    if (map[key] !== undefined) {
      nextRow[map[key]] = changes[key];
    }
  });

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([nextRow]);
}

/** =========================
 * HELPERS - UTILS
 * ========================= */
function validateRequiredFields_(payload, fields) {
  const missing = fields.filter(f => {
    const value = payload[f];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length) {
    throw new Error(`Campos obrigatórios ausentes: ${missing.join(', ')}`);
  }
}

function normalizeText_(value) {
  return String(value || '').trim();
}

function normalizeSlug_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAuthorizationCode_(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function onlyDigits_(value) {
  return String(value || '').replace(/\D+/g, '');
}

function asText_(value) {
  return value === undefined || value === null ? '' : String(value);
}

function parseNonNegativeNumber_(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Valor numérico inválido: ${value}`);
  }
  return n;
}

function now_() {
  return new Date();
}

function addBusinessDays_(startDate, businessDays) {
  const date = new Date(startDate);
  let added = 0;

  while (added < businessDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }

  return date;
}

/** =========================
 * TESTES
 * ========================= */
function testReversaCreateUnidade() {
  const result = reversaCreateUnidade({
    codigo_unidade: `ED_TESTE_${Date.now()}`,
    slug_unidade: `ed_teste_${Date.now()}`,
    nome_unidade: 'Edifício Teste Reversa',
    tipo_unidade: 'edificio_comercial',
    endereco: 'Rua Exemplo',
    numero: '100',
    bairro: 'Centro',
    cidade: 'Fortaleza',
    uf: 'CE',
    cep: '60000000'
  });
  Logger.log(JSON.stringify(result, null, 2));
}

function testReversaCreateUsuario() {
  const unidade = getLastRecordIdFromSheet_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id');
  const result = reversaCreateUsuario({
    unidade_id: unidade,
    nome: 'Usuário Teste',
    cpf: `${Date.now()}`.slice(-11),
    sala_apto_empresa: 'Sala 101',
    telefone: '85999999999',
    email: `teste${Date.now()}@email.com`,
    aceite_termos: 'SIM'
  });
  Logger.log(JSON.stringify(result, null, 2));
}

function testReversaGenerateLoteEtiquetas() {
  const unidade = getLastRecordIdFromSheet_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id');
  const result = reversaGenerateLoteEtiquetas({
    unidade_id: unidade,
    quantidade: 5,
    responsavel_geracao: 'TESTE'
  });
  Logger.log(JSON.stringify(result, null, 2));
}

function testReversaReadEtiqueta() {
  const usuario = getLastRecordIdFromSheet_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id');
  const etiqueta = getFirstEtiquetaDisponivel_();

  const result = reversaReadEtiqueta({
    codigo_etiqueta: etiqueta.codigo_etiqueta,
    usuario_id: usuario,
    origem_leitura: 'app_usuario'
  });
  Logger.log(JSON.stringify(result, null, 2));
}

function testReversaConfirmDropoff() {
  const usuario = getLastRecordIdFromSheet_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id');
  const etiqueta = getLastEtiquetaLidaSemReversa_();

  const result = reversaConfirmDropoff({
    usuario_id: usuario,
    codigo_etiqueta: etiqueta.codigo_etiqueta,
    codigo_autorizacao: `AUT-${Date.now()}`,
    janela_coleta: 'ate_2_dias_uteis',
    comprimento_cm: 20,
    largura_cm: 15,
    altura_cm: 10,
    observacao_usuario: 'Teste de drop-off'
  });
  Logger.log(JSON.stringify(result, null, 2));
}

function getLastRecordIdFromSheet_(sheetName, idHeader) {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, sheetName);
  const rows = getDataRowsAsObjects_(sheet);
  if (!rows.length) throw new Error(`Sem dados em ${sheetName}`);
  return rows[rows.length - 1][idHeader];
}

function getFirstEtiquetaDisponivel_() {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);
  const rows = getDataRowsAsObjects_(sheet);
  const rec = rows.find(r => String(r.status_etiqueta || '') === 'disponivel');
  if (!rec) throw new Error('Nenhuma etiqueta disponível encontrada.');
  return rec;
}

function getLastEtiquetaLidaSemReversa_() {
  const ss = getReversaSpreadsheet_();
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);
  const rows = getDataRowsAsObjects_(sheet);
  const filtered = rows.filter(r =>
    String(r.status_etiqueta || '') === 'lida' &&
    String(r.reversa_id || '').trim() === ''
  );
  if (!filtered.length) throw new Error('Nenhuma etiqueta lida sem reversa encontrada.');
  return filtered[filtered.length - 1];
}