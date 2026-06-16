/***************************************
 * REVERSA - ETAPA 11
 * Expedição: recebimento por QR e postagem com SRO
 * V1.5.0
 ***************************************/

function migrateReversaExpedicaoV150() {
  const ss = getReversaSpreadsheet_();
  ensureExpedicaoSchema_(ss);
  applyEditableCellsHighlight_(ss);
  formatReversaSheets_(ss);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Migração Expedição v1.5.0 aplicada com sucesso. Conferência por QR e postagem com SRO habilitadas.');
}

function ensureExpedicaoSchema_(ss) {
  ensureSheetHeaders_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS, [
    'recebido_por',
    'codigo_sro',
    'postado_por',
    'comunicacao_email_enviada',
    'data_email_enviado',
    'comunicacao_whatsapp_status',
    'data_whatsapp'
  ]);
}

function apiListExpedicao_(req) {
  const ss = getReversaSpreadsheet_();
  ensureExpedicaoSchema_(ss);
  const reversas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS));
  const unidades = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const usuarios = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.USUARIOS)), 'usuario_id');
  const etiquetas = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS)), 'etiqueta_id');
  const coletaItens = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETA_ITENS));
  const coletas = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS)), 'coleta_id');
  const coletaByReversa = {};
  coletaItens.forEach(item => { if (item.reversa_id) coletaByReversa[item.reversa_id] = item.coleta_id || ''; });

  const enriched = reversas.map(r => {
    const usuario = usuarios[r.usuario_id] || {};
    const etiqueta = etiquetas[r.etiqueta_id] || {};
    const coletaId = coletaByReversa[r.reversa_id] || '';
    const coleta = coletas[coletaId] || {};
    const telefone = String(usuario.telefone || '');
    const sro = String(r.codigo_sro || '');
    return {
      ...r,
      objeto_id: r.reversa_id,
      nome_unidade: unidades[r.unidade_id]?.nome_unidade || '',
      nome_usuario: usuario.nome || '',
      telefone_usuario: telefone,
      email_usuario: usuario.email || '',
      codigo_etiqueta: etiqueta.codigo_etiqueta || etiqueta.codigo_manual_curto || '',
      coleta_id: coletaId,
      coletador_id: getCurrentCollectorId_(coleta),
      whatsapp_url: sro ? buildWhatsAppTrackingUrl_(telefone, usuario.nome || '', sro) : '',
      rastreamento_url: buildTrackingUrl_(sro)
    };
  });

  const receber = enriched
    .filter(r => String(r.status_reversa || '') === 'coletada_agf')
    .sort((a,b) => new Date(a.data_coleta_agf || 0) - new Date(b.data_coleta_agf || 0));
  const filaPostagem = enriched
    .filter(r => String(r.status_reversa || '') === 'recebida_agencia')
    .sort((a,b) => new Date(a.data_recebimento_agencia || 0) - new Date(b.data_recebimento_agencia || 0));
  const postados = enriched
    .filter(r => ['postada','concluida'].includes(String(r.status_reversa || '')))
    .sort((a,b) => new Date(b.data_postagem || 0) - new Date(a.data_postagem || 0));

  return apiOk_({
    resumo: {
      aguardando_recebimento: receber.length,
      fila_postagem: filaPostagem.length,
      postados_hoje: postados.filter(r => formatDateOnly_(r.data_postagem) === formatDateOnly_(now_())).length
    },
    receber: limitItems_(receber, req.limit || 1000),
    fila_postagem: limitItems_(filaPostagem, req.limit || 1000),
    postados: limitItems_(postados, req.limit || 1000)
  });
}

function apiReceiveObjetoAgencia_(req) {
  validateRequiredFields_(req, ['codigo_etiqueta', 'ator_id']);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    ensureExpedicaoSchema_(ss);
    const etiqueta = findEtiquetaByCodigo_(req.codigo_etiqueta);
    if (!etiqueta) return apiError_('ETIQUETA_NOT_FOUND', 'Etiqueta não reconhecida.');
    if (!String(etiqueta.reversa_id || '').trim()) return apiError_('ETIQUETA_WITHOUT_OBJECT', 'Esta etiqueta ainda não está vinculada a um objeto.');
    const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', etiqueta.reversa_id);
    const status = String(reversa.status_reversa || '');
    if (['recebida_agencia','postada','concluida'].includes(status)) {
      return apiOk_({ objeto_id: reversa.reversa_id, reversa_id: reversa.reversa_id, codigo_etiqueta: etiqueta.codigo_etiqueta, status_reversa: status, already_received: true, message: 'Este objeto já foi conferido na agência.' });
    }
    if (status !== 'coletada_agf') return apiError_('OBJECT_NOT_COLLECTED', 'Este objeto ainda não consta como coletado.');
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
    const headers = getHeaders_(sheet);
    const now = now_();
    updateRowFieldsByIndex_(sheet, headers, findRowIndexByValue_(sheet, 'reversa_id', reversa.reversa_id), {
      status_reversa: 'recebida_agencia',
      data_recebimento_agencia: now,
      recebido_por: String(req.ator_id || 'AGF')
    });
    logEvento_({
      tipo_entidade: 'OBJETO', entidade_id: reversa.reversa_id, unidade_id: reversa.unidade_id,
      usuario_id: reversa.usuario_id, reversa_id: reversa.reversa_id, etiqueta_id: reversa.etiqueta_id,
      tipo_evento: 'objeto_recebido_agencia', origem_evento: 'expedicao_agf',
      descricao_evento: `Objeto ${reversa.reversa_id} recebido e conferido na agência por ${req.ator_id}.`,
      ator_tipo: 'agf', ator_id: req.ator_id
    });
    return apiOk_({ objeto_id: reversa.reversa_id, reversa_id: reversa.reversa_id, codigo_etiqueta: etiqueta.codigo_etiqueta, status_reversa: 'recebida_agencia', data_recebimento_agencia: now, recebido_por: req.ator_id });
  } finally {
    lock.releaseLock();
  }
}

function apiPostObjeto_(req) {
  validateRequiredFields_(req, ['reversa_id', 'codigo_sro', 'ator_id']);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    ensureExpedicaoSchema_(ss);
    const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', req.reversa_id);
    const status = String(reversa.status_reversa || '');
    if (!['recebida_agencia','postada'].includes(status)) return apiError_('OBJECT_NOT_READY_TO_POST', 'O objeto precisa ser recebido na agência antes da postagem.');
    const codigoSro = normalizeSro_(req.codigo_sro);
    if (!codigoSro) return apiError_('SRO_REQUIRED', 'Informe o código SRO.');
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
    const headers = getHeaders_(sheet);
    if (codigoSro.length < 8 || codigoSro.length > 30) return apiError_('INVALID_SRO', 'Confira o código SRO informado.');
    const now = now_();
    const rowIndex = findRowIndexByValue_(sheet, 'reversa_id', reversa.reversa_id);
    updateRowFieldsByIndex_(sheet, headers, rowIndex, {
      status_reversa: 'postada',
      codigo_sro: codigoSro,
      data_postagem: now,
      postado_por: String(req.ator_id || 'AGF'),
      comunicacao_email_enviada: 'NAO',
      data_email_enviado: ''
    });
    const emailSent = sendPostedTrackingEmail_(reversa, codigoSro);
    if (emailSent) updateRowFieldsByIndex_(sheet, headers, rowIndex, { comunicacao_email_enviada: 'SIM', data_email_enviado: now });
    logEvento_({
      tipo_entidade: 'OBJETO', entidade_id: reversa.reversa_id, unidade_id: reversa.unidade_id,
      usuario_id: reversa.usuario_id, reversa_id: reversa.reversa_id, etiqueta_id: reversa.etiqueta_id,
      tipo_evento: 'objeto_postado_sro', origem_evento: 'expedicao_agf',
      descricao_evento: `Objeto ${reversa.reversa_id} postado com SRO ${codigoSro}.`,
      ator_tipo: 'agf', ator_id: req.ator_id
    });
    const usuario = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', reversa.usuario_id);
    return apiOk_({
      objeto_id: reversa.reversa_id,
      reversa_id: reversa.reversa_id,
      codigo_sro: codigoSro,
      status_reversa: 'postada',
      email_enviado: emailSent,
      whatsapp_url: buildWhatsAppTrackingUrl_(usuario.telefone || '', usuario.nome || '', codigoSro),
      rastreamento_url: buildTrackingUrl_(codigoSro)
    });
  } finally {
    lock.releaseLock();
  }
}

function apiResendPostedEmail_(req) {
  validateRequiredFields_(req, ['reversa_id', 'ator_id']);
  const ss = getReversaSpreadsheet_();
  ensureExpedicaoSchema_(ss);
  const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', req.reversa_id);
  const codigoSro = normalizeSro_(reversa.codigo_sro || '');
  if (!codigoSro) return apiError_('SRO_REQUIRED', 'Este objeto ainda não possui código SRO.');
  const sent = sendPostedTrackingEmail_(reversa, codigoSro);
  if (sent) {
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
    updateRowFieldsByIndex_(sheet, getHeaders_(sheet), findRowIndexByValue_(sheet, 'reversa_id', reversa.reversa_id), { comunicacao_email_enviada: 'SIM', data_email_enviado: now_() });
  }
  return apiOk_({ reversa_id: reversa.reversa_id, email_enviado: sent });
}

function apiMarkWhatsAppSent_(req) {
  validateRequiredFields_(req, ['reversa_id', 'ator_id']);
  const ss = getReversaSpreadsheet_();
  ensureExpedicaoSchema_(ss);
  const reversa = findRowById_(REVERSA_CORE_CFG.SHEETS.REVERSAS, 'reversa_id', req.reversa_id);
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
  const now = now_();
  updateRowFieldsByIndex_(sheet, getHeaders_(sheet), findRowIndexByValue_(sheet, 'reversa_id', reversa.reversa_id), { comunicacao_whatsapp_status: 'LINK_ABERTO', data_whatsapp: now });
  return apiOk_({ reversa_id: reversa.reversa_id, comunicacao_whatsapp_status: 'LINK_ABERTO', data_whatsapp: now });
}

function normalizeSro_(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '').trim();
}

function buildTrackingUrl_(codigoSro) {
  return codigoSro ? 'https://rastreamento.correios.com.br/app/index.php' : '';
}

function normalizeBrazilPhone_(value) {
  let digits = String(value || '').replace(/\D+/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) digits = `55${digits}`;
  return digits;
}

function buildWhatsAppTrackingUrl_(phone, name, codigoSro) {
  const digits = normalizeBrazilPhone_(phone);
  if (!digits || !codigoSro) return '';
  const firstName = String(name || '').trim().split(/\s+/)[0] || '';
  const hello = firstName ? `Olá, ${firstName}.` : 'Olá.';
  const text = `${hello} Seu objeto de logística reversa foi postado nos Correios.\n\nCódigo de rastreamento: ${codigoSro}\n\nVocê pode acompanhar o envio pelo site dos Correios.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function sendPostedTrackingEmail_(reversa, codigoSro) {
  try {
    const usuario = findRowById_(REVERSA_CORE_CFG.SHEETS.USUARIOS, 'usuario_id', reversa.usuario_id);
    const email = normalizeEmail_(usuario.email || '');
    if (!email) return false;
    const nome = String(usuario.nome || '').trim();
    MailApp.sendEmail({
      to: email,
      subject: 'Seu objeto de logística reversa foi postado',
      htmlBody: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f2940"><p>Olá${nome ? `, ${nome}` : ''}.</p><p>Seu objeto de logística reversa foi <strong>postado nos Correios</strong>.</p><p><strong>Código de rastreamento:</strong> ${codigoSro}</p><p>Você pode acompanhar o envio pelo site oficial de rastreamento dos Correios.</p><p style="font-size:12px;color:#64748b">AGF José Bonifácio</p></div>`
    });
    return true;
  } catch (err) {
    Logger.log(`[REVERSA][EXPEDICAO][EMAIL] ${err && err.stack ? err.stack : err}`);
    return false;
  }
}
