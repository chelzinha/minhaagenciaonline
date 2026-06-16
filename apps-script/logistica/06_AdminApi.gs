/***************************************
 * REVERSA - ETAPA 6
 * API administrativa e impressão de lotes
 ***************************************/

function apiListUnidades_(req) {
  const data = getAdminBootstrapDataCached_(String(req.force || '') === '1');
  return apiOk_({ total: data.unidades.length, items: data.unidades });
}

function apiCreateUnidadeAdmin_(req) {
  const result = reversaCreateUnidade(req);
  return apiOk_(result);
}

function apiUpdateUnidade_(req) {
  validateRequiredFields_(req, ['unidade_id']);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES);
    const headers = getHeaders_(sheet);
    const rowIndex = findRowIndexByValue_(sheet, 'unidade_id', req.unidade_id);
    const allowed = [
      'codigo_unidade','slug_unidade','nome_unidade','tipo_unidade','status_unidade','endereco','numero','complemento','bairro','cidade','uf','cep','latitude','longitude','prazo_coleta_dias_uteis','capacidade_max_pacotes','capacidade_max_volume_litros','nivel_alerta_ocupacao_pct','email_suporte','telefone_suporte','mensagem_usuario','logo_unidade_url','coletador_padrao_id'
    ];
    const changes = { data_atualizacao: now_() };
    allowed.forEach(k => {
      if (req[k] !== undefined) changes[k] = k === 'slug_unidade' ? normalizeSlug_(req[k]) : req[k];
    });
    if (changes.slug_unidade) changes.qr_url_unidade = buildQrUrlUnidade_(changes.slug_unidade);
    updateRowFieldsByIndex_(sheet, headers, rowIndex, changes);
    logEvento_({
      tipo_entidade: 'UNIDADE', entidade_id: req.unidade_id, unidade_id: req.unidade_id,
      tipo_evento: 'unidade_atualizada', origem_evento: 'painel_agf',
      descricao_evento: `Unidade ${req.unidade_id} atualizada.`, ator_tipo: 'agf', ator_id: req.ator_id || 'AGF'
    });
    return apiOk_({ unidade_id: req.unidade_id, updated: true });
  } finally {
    lock.releaseLock();
  }
}

function apiListLotes_(req) {
  const ss = getReversaSpreadsheet_();
  const lotes = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS));
  const unidades = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const items = lotes
    .filter(l => !req.unidade_id || String(l.unidade_id) === String(req.unidade_id))
    .map(l => ({ ...l, nome_unidade: unidades[l.unidade_id]?.nome_unidade || '' }))
    .sort((a,b) => new Date(b.data_geracao || 0) - new Date(a.data_geracao || 0));
  return apiOk_({ total: items.length, items });
}

function apiGenerateLoteEtiquetasAdmin_(req) {
  validateRequiredFields_(req, ['unidade_id', 'quantidade']);
  const result = reversaGenerateLoteEtiquetas({
    unidade_id: req.unidade_id,
    quantidade: req.quantidade,
    prefixo_etiqueta: req.prefixo_etiqueta || '',
    responsavel_geracao: req.ator_id || 'AGF',
    observacao: req.observacao || ''
  });
  return apiOk_(result);
}

function apiGetLotePrintData_(req) {
  validateRequiredFields_(req, ['lote_id']);
  const ss = getReversaSpreadsheet_();
  const lote = findRowById_(REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS, 'lote_id', req.lote_id);
  const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', lote.unidade_id);
  const etiquetas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS))
    .filter(e => String(e.lote_id || '') === String(req.lote_id))
    .filter(e => String(e.status_etiqueta || '') === 'disponivel')
    .sort((a,b) => String(a.codigo_etiqueta || '').localeCompare(String(b.codigo_etiqueta || '')));

  const labels = etiquetas.map(e => buildEtiquetaPrintLabel_(unidade, e));

  return apiOk_({
    lote: { ...lote, nome_unidade: unidade.nome_unidade, slug_unidade: unidade.slug_unidade },
    unidade: sanitizeUnidadeForApi_(unidade),
    etiqueta_mm: { largura: 50, altura: 50 },
    somente_disponiveis: true,
    total: labels.length,
    labels
  });
}

function apiGetEtiquetaPrintData_(req) {
  validateRequiredFields_(req, ['etiqueta_id']);
  const etiqueta = findRowById_(REVERSA_CORE_CFG.SHEETS.ETIQUETAS, 'etiqueta_id', req.etiqueta_id);
  const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', etiqueta.unidade_id);
  return apiOk_({
    etiqueta_mm: { largura: 50, altura: 50 },
    label: buildEtiquetaPrintLabel_(unidade, etiqueta)
  });
}

function buildEtiquetaPrintLabel_(unidade, etiqueta) {
  const qrPayload = buildEtiquetaQrPayload_(unidade, etiqueta.codigo_etiqueta || etiqueta.codigo_manual_curto);
  return {
    etiqueta_id: etiqueta.etiqueta_id,
    codigo_etiqueta: etiqueta.codigo_etiqueta,
    codigo_manual_curto: etiqueta.codigo_manual_curto,
    unidade_id: etiqueta.unidade_id,
    nome_unidade: unidade.nome_unidade,
    qr_payload: qrPayload,
    qr_image_url: buildQrImageUrl_(qrPayload),
    status_etiqueta: etiqueta.status_etiqueta,
    reversa_id: etiqueta.reversa_id || ''
  };
}

function apiListEtiquetas_(req) {
  const ss = getReversaSpreadsheet_();
  const etiquetas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS));
  const unidades = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const lotes = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS)), 'lote_id');
  const items = etiquetas
    .filter(e => !req.unidade_id || String(e.unidade_id) === String(req.unidade_id))
    .filter(e => !req.lote_id || String(e.lote_id) === String(req.lote_id))
    .filter(e => !req.status_etiqueta || String(e.status_etiqueta) === String(req.status_etiqueta))
    .map(e => ({ ...e, nome_unidade: unidades[e.unidade_id]?.nome_unidade || '', codigo_lote: lotes[e.lote_id]?.codigo_lote || '' }))
    .sort((a,b) => new Date(b.data_geracao || 0) - new Date(a.data_geracao || 0) || String(b.codigo_etiqueta || '').localeCompare(String(a.codigo_etiqueta || '')));
  return apiOk_({ total: items.length, items: limitItems_(items, req.limit) });
}

function apiListReversas_(req) {
  const ss = getReversaSpreadsheet_();
  const reversas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS));
  const unidades = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const usuarios = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.USUARIOS)), 'usuario_id');
  const etiquetas = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS)), 'etiqueta_id');
  const items = reversas
    .filter(r => !req.unidade_id || String(r.unidade_id) === String(req.unidade_id))
    .filter(r => !req.status_reversa || String(r.status_reversa) === String(req.status_reversa))
    .map(r => ({
      ...r,
      nome_unidade: unidades[r.unidade_id]?.nome_unidade || '',
      nome_usuario: usuarios[r.usuario_id]?.nome || '',
      sala_apto_empresa: usuarios[r.usuario_id]?.sala_apto_empresa || '',
      codigo_etiqueta: etiquetas[r.etiqueta_id]?.codigo_etiqueta || ''
    }))
    .sort((a,b) => new Date(b.data_criacao || 0) - new Date(a.data_criacao || 0));
  return apiOk_({ total: items.length, items: limitItems_(items, req.limit) });
}

function apiGetReversaDetail_(req) {
  validateRequiredFields_(req, ['reversa_id']);
  const ss = getReversaSpreadsheet_();
  const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', req.reversa_id);
  const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', reversa.unidade_id);
  const usuario = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', reversa.usuario_id);
  const etiqueta = findRowById_(REVERSA_CORE_CFG.SHEETS.ETIQUETAS, 'etiqueta_id', reversa.etiqueta_id);
  const eventos = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.EVENTOS)).filter(e => String(e.reversa_id || '') === String(req.reversa_id));
  const divergencias = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS)).filter(d => String(d.reversa_id || '') === String(req.reversa_id));
  return apiOk_({ reversa, unidade, usuario: sanitizeUsuarioForApi_(usuario), etiqueta, eventos, divergencias });
}

function apiListColetas_(req) {
  const ss = getReversaSpreadsheet_();
  const coletas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS));
  const unidades = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const items = coletas
    .filter(c => !req.unidade_id || String(c.unidade_id) === String(req.unidade_id))
    .filter(c => !req.status_coleta || String(c.status_coleta) === String(req.status_coleta))
    .filter(c => !req.coletador_id || getCurrentCollectorId_(c) === String(req.coletador_id))
    .map(c => ({ ...c, coletador_id_atual: getCurrentCollectorId_(c), nome_unidade: unidades[c.unidade_id]?.nome_unidade || '' }))
    .sort((a,b) => new Date(b.data_criacao || 0) - new Date(a.data_criacao || 0));
  return apiOk_({ total: items.length, items: limitItems_(items, req.limit) });
}

function apiListDivergencias_(req) {
  const ss = getReversaSpreadsheet_();
  const divs = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS));
  const unidades = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const items = divs
    .filter(d => !req.status_divergencia || String(d.status_divergencia) === String(req.status_divergencia))
    .map(d => ({ ...d, nome_unidade: unidades[d.unidade_id]?.nome_unidade || '' }))
    .sort((a,b) => new Date(b.data_abertura || 0) - new Date(a.data_abertura || 0));
  return apiOk_({ total: items.length, items: limitItems_(items, req.limit) });
}

function apiCreateDivergencia_(req) {
  validateRequiredFields_(req, ['tipo_divergencia', 'descricao_divergencia']);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS);
    const headers = getHeaders_(sheet);
    const divergenciaId = nextIdForSheet_(sheet, 'divergencia_id', REVERSA_CORE_CFG.ID_PREFIX.DIVERGENCIA, REVERSA_CORE_CFG.PAD_LENGTH.DIVERGENCIA);
    const rowObj = blankRowObject_(headers);
    rowObj.divergencia_id = divergenciaId;
    rowObj.unidade_id = req.unidade_id || '';
    rowObj.coleta_id = req.coleta_id || '';
    rowObj.reversa_id = req.reversa_id || '';
    rowObj.etiqueta_id = req.etiqueta_id || '';
    rowObj.usuario_id = req.usuario_id || '';
    rowObj.tipo_divergencia = req.tipo_divergencia;
    rowObj.descricao_divergencia = req.descricao_divergencia;
    rowObj.status_divergencia = req.status_divergencia || 'aberta';
    rowObj.responsavel_tratativa = req.responsavel_tratativa || req.ator_id || 'AGF';
    rowObj.data_abertura = now_();
    rowObj.data_fechamento = '';
    appendObjectRow_(sheet, headers, rowObj);
    logEvento_({
      tipo_entidade: 'DIVERGENCIA', entidade_id: divergenciaId, unidade_id: rowObj.unidade_id,
      usuario_id: rowObj.usuario_id, reversa_id: rowObj.reversa_id, etiqueta_id: rowObj.etiqueta_id, coleta_id: rowObj.coleta_id,
      tipo_evento: 'divergencia_registrada', origem_evento: 'painel_agf',
      descricao_evento: `Divergência ${divergenciaId}: ${req.tipo_divergencia}`, ator_tipo: 'agf', ator_id: req.ator_id || 'AGF'
    });
    return apiOk_({ divergencia_id: divergenciaId });
  } finally {
    lock.releaseLock();
  }
}

function apiListParametros_(req) {
  const ss = getReversaSpreadsheet_();
  const params = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.PARAMETROS));
  return apiOk_({ total: params.length, items: params });
}

function apiUpdateParametro_(req) {
  validateRequiredFields_(req, ['parametro', 'valor']);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.PARAMETROS);
    const headers = getHeaders_(sheet);
    const rowIndex = findRowIndexByValue_(sheet, 'parametro', req.parametro);
    updateRowFieldsByIndex_(sheet, headers, rowIndex, { valor: req.valor, status_parametro: req.status_parametro || 'ativo' });
    return apiOk_({ parametro: req.parametro, updated: true });
  } finally {
    lock.releaseLock();
  }
}

function buildEtiquetaQrPayload_(unidade, codigoEtiqueta) {
  const slug = unidade && unidade.slug_unidade ? unidade.slug_unidade : '';
  const code = encodeURIComponent(String(codigoEtiqueta || '').trim());
  return `https://www.minhaagenciaonline.com.br/reverso/?slug=${encodeURIComponent(slug)}&etiqueta=${code}`;
}

function buildQrImageUrl_(payload) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=10&data=${encodeURIComponent(payload)}`;
}

function indexBy_(rows, key) {
  return (rows || []).reduce((acc, row) => {
    const v = String(row[key] || '');
    if (v) acc[v] = row;
    return acc;
  }, {});
}

function limitItems_(items, limit) {
  const n = Number(limit || 300);
  if (!Number.isFinite(n) || n <= 0) return items;
  return items.slice(0, n);
}
