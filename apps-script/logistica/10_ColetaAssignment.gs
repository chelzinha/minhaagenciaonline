/***************************************
 * REVERSA - ETAPA 10
 * Atribuição de coletadores por unidade e transferência de coletas
 * V1.4.2
 ***************************************/

function migrateReversaColetaV142() {
  const ss = getReversaSpreadsheet_();
  ensureColetaSchema_(ss);
  backfillColetaAssignments_(ss);
  applyEditableCellsHighlight_(ss);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Migração App Coletas v1.4.2 aplicada com sucesso. Vínculo de coletador por unidade e transferência de coletas habilitados.');
}


function backfillColetaAssignments_(ss) {
  const units = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS);
  const headers = getHeaders_(sheet);
  getDataRowsAsObjects_(sheet).forEach((coleta) => {
    const current = getCurrentCollectorId_(coleta);
    const fallback = String(units[coleta.unidade_id]?.coletador_padrao_id || '').trim();
    if (current || !fallback) return;
    updateRowFieldsByIndex_(sheet, headers, findRowIndexByValue_(sheet, 'coleta_id', coleta.coleta_id), {
      coletador_id: fallback,
      coletador_id_atual: fallback,
      coletador_id_original: coleta.coletador_id_original || fallback,
      data_atualizacao: now_()
    });
  });
}

function getUnitDefaultCollectorId_(unidadeId) {
  if (!unidadeId) return '';
  const unidade = findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES, 'unidade_id', unidadeId);
  return String(unidade.coletador_padrao_id || '').trim();
}

function resolveAssignedCollectorId_(payload, unidade) {
  const requested = String((payload && (payload.coletador_id_atual || payload.coletador_id)) || '').trim();
  if (requested) return requested;
  return String((unidade && unidade.coletador_padrao_id) || '').trim();
}

function getCurrentCollectorId_(coleta) {
  return String((coleta && (coleta.coletador_id_atual || coleta.coletador_id)) || '').trim();
}

function canCollectorSeePoint_(coletadorId, unidade, coleta) {
  const current = getCurrentCollectorId_(coleta);
  const unitDefault = String((unidade && unidade.coletador_padrao_id) || '').trim();
  if (!coletadorId) return true;
  if (current) return current === coletadorId;
  if (unitDefault) return unitDefault === coletadorId;
  return true; // sem responsável: fica visível para assunção manual
}

function canTransferCollectionStatus_(status) {
  return ['aberta', 'em_andamento'].includes(String(status || ''));
}

function apiTransferColeta_(req) {
  validateRequiredFields_(req, ['coleta_id', 'novo_coletador_id', 'transferido_por']);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    ensureColetaSchema_(ss);
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS);
    const headers = getHeaders_(sheet);
    const coleta = findRowById_(REVERSA_CORE_CFG.SHEETS.COLETAS, 'coleta_id', req.coleta_id);
    if (!canTransferCollectionStatus_(coleta.status_coleta)) {
      return apiError_('TRANSFER_NOT_ALLOWED', 'Esta coleta já foi finalizada ou cancelada e não pode ser transferida.');
    }
    const novo = String(req.novo_coletador_id || '').trim();
    const atual = getCurrentCollectorId_(coleta);
    if (!novo) return apiError_('COLLECTOR_REQUIRED', 'Selecione o novo coletador.');
    if (novo === atual) return apiOk_({ coleta_id: req.coleta_id, coletador_id_atual: atual, unchanged: true });
    if (String(coleta.status_coleta || '') === 'em_andamento' && !String(req.motivo_transferencia || '').trim()) {
      return apiError_('TRANSFER_REASON_REQUIRED', 'Informe o motivo para transferir uma coleta em andamento.');
    }
    const now = now_();
    const changes = {
      coletador_id_original: String(coleta.coletador_id_original || atual || novo),
      coletador_id_atual: novo,
      coletador_id: novo,
      data_transferencia: now,
      motivo_transferencia: String(req.motivo_transferencia || '').trim(),
      transferido_por: String(req.transferido_por || '').trim(),
      data_atualizacao: now
    };
    updateRowFieldsByIndex_(sheet, headers, findRowIndexByValue_(sheet, 'coleta_id', req.coleta_id), changes);
    logEvento_({
      tipo_entidade: 'COLETA', entidade_id: req.coleta_id, unidade_id: coleta.unidade_id, coleta_id: req.coleta_id,
      tipo_evento: 'coleta_transferida', origem_evento: 'painel_agf',
      descricao_evento: `Coleta ${req.coleta_id} transferida de ${atual || 'não atribuída'} para ${novo}. Motivo: ${changes.motivo_transferencia || 'não informado'}.`,
      ator_tipo: 'agf', ator_id: req.transferido_por
    });
    return apiOk_({ coleta_id: req.coleta_id, coletador_id_anterior: atual, coletador_id_atual: novo, data_transferencia: now });
  } finally {
    lock.releaseLock();
  }
}
