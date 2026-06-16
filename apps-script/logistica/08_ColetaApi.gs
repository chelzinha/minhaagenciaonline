/***************************************
 * REVERSA - ETAPA 8
 * App operacional do coletador V1.4.2
 ***************************************/

const REVERSA_COLETA_ACTIVE_STATUS = ['aberta', 'em_andamento'];
const REVERSA_COLETA_DONE_STATUS = ['concluida', 'concluida_com_divergencia'];

function migrateReversaColetaV140() { return migrateReversaColetaV142(); }

function migrateReversaColetaV141() { return migrateReversaColetaV142(); }

function ensureColetaSchema_(ss) {
  ensureSheetHeaders_(ss, 'UNIDADES', ['coletador_padrao_id']);
  ensureSheetHeaders_(ss, 'COLETAS', ['origem_coleta', 'data_limite_operacional', 'data_atualizacao', 'coletador_id_original', 'coletador_id_atual', 'data_transferencia', 'motivo_transferencia', 'transferido_por']);
  ensureSheetHeaders_(ss, 'DIVERGENCIAS', ['coletador_id', 'decisao_operacional', 'foto_url', 'data_hora_registro_campo']);
}

function ensureSheetHeaders_(ss, sheetName, headersToAppend) {
  const sheet = getSheet_(ss, sheetName);
  const existing = getHeaders_(sheet);
  const missing = (headersToAppend || []).filter(h => !existing.includes(h));
  if (!missing.length) return;
  const startCol = existing.length + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  sheet.getRange(1, startCol, 1, missing.length)
    .setBackground('#0b57d0').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
}

function ensureAutomaticColetaForUnit_(unidadeId, dataLimite) {
  const ss = getReversaSpreadsheet_();
  ensureColetaSchema_(ss);
  const active = findActiveColetaForUnit_(unidadeId);
  if (active) {
    refreshColetaExpectedCounters_(active.coleta_id, dataLimite);
    return active.coleta_id;
  }
  const created = createColetaRecord_({
    unidade_id: unidadeId,
    origem_coleta: 'automatica_unidade',
    data_coleta_programada: dataLimite || now_(),
    data_limite_operacional: dataLimite || '',
    coletador_id: getUnitDefaultCollectorId_(unidadeId),
    observacao_coleta: 'Coleta criada automaticamente após confirmação de drop-off.'
  });
  return created.coleta_id;
}

function apiOpenColetaV140_(req) {
  validateRequiredFields_(req, ['unidade_id']);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    ensureColetaSchema_(ss);
    const active = findActiveColetaForUnit_(req.unidade_id);
    if (active) {
      refreshColetaExpectedCounters_(active.coleta_id, req.data_limite_operacional || '');
      return apiOk_({ ...active, reused: true });
    }
    const created = createColetaRecord_({
      unidade_id: req.unidade_id,
      origem_coleta: req.origem_coleta || 'manual_admin',
      data_coleta_programada: req.data_coleta_programada || now_(),
      data_limite_operacional: req.data_limite_operacional || '',
      coletador_id: req.coletador_id || getUnitDefaultCollectorId_(req.unidade_id),
      observacao_coleta: req.observacao_coleta || ''
    });
    return apiOk_({ ...created, reused: false });
  } finally { lock.releaseLock(); }
}

function apiGetCollectorHome_(req) {
  const ss = getReversaSpreadsheet_();
  ensureColetaSchema_(ss);
  const coletadorId = String(req.coletador_id || '').trim();
  const unidades = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES));
  const coletas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS));
  const reversas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS));
  const divergencias = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS));
  const unidadeIndex = indexBy_(unidades, 'unidade_id');
  const today = formatDateOnly_(now_());
  const pendentes = reversas.filter(r => ['dropoff_realizado','aguardando_coleta_agf'].includes(String(r.status_reversa || '')));
  const pendingByUnit = groupBy_(pendentes, 'unidade_id');
  const unitStatusMap = buildUnitStatusMapV151_(unidades, [], reversas);
  const activeByUnit = {};
  coletas.filter(c => REVERSA_COLETA_ACTIVE_STATUS.includes(String(c.status_coleta || ''))).forEach(c => { activeByUnit[c.unidade_id] = c; });
  const unidadeIds = new Set([...Object.keys(pendingByUnit), ...Object.keys(activeByUnit)]);
  const points = [...unidadeIds].map(unidadeId => {
    const u = unidadeIndex[unidadeId] || { unidade_id: unidadeId, nome_unidade: unidadeId };
    const pending = pendingByUnit[unidadeId] || [];
    const active = activeByUnit[unidadeId] || null;
    if (!canCollectorSeePoint_(coletadorId, u, active)) return null;
    const earliest = minDate_(pending.map(r => r.data_limite_operacional).filter(Boolean)) || active?.data_limite_operacional || active?.data_coleta_programada || '';
    const address = buildUnitAddress_(u);
    const assigned = getCurrentCollectorId_(active) || String(u.coletador_padrao_id || '').trim();
    return {
      unidade_id: unidadeId,
      nome_unidade: u.nome_unidade || unidadeId,
      endereco_completo: address,
      cidade: u.cidade || '', uf: u.uf || '',
      pendentes: pending.length,
      ocupacao_pct: Number(unitStatusMap[String(unidadeId)]?.ocupacao_pct || 0),
      prazo_limite: earliest,
      prioridade: getDeadlinePriority_(earliest),
      coletador_padrao_id: String(u.coletador_padrao_id || '').trim(),
      coletador_id_atual: assigned,
      coleta_ativa: active ? sanitizeColetaForCollector_(active) : null,
      maps_url: buildGoogleMapsUrl_(address),
      waze_url: buildWazeUrl_(address)
    };
  }).filter(Boolean).sort(compareCollectorPoints_);
  const todayColetas = coletas.filter(c => formatDateOnly_(c.data_criacao) === today || formatDateOnly_(c.data_inicio_coleta) === today || formatDateOnly_(c.data_fim_coleta) === today);
  return apiOk_({
    resumo: {
      coletas_pendentes: points.filter(p => !p.coleta_ativa || !REVERSA_COLETA_DONE_STATUS.includes(String(p.coleta_ativa.status_coleta || ''))).length,
      unidades_com_pacotes: points.filter(p => p.pendentes > 0).length,
      pacotes_previstos: points.reduce((acc, p) => acc + Number(p.pendentes || 0), 0),
      coletas_concluidas_hoje: todayColetas.filter(c => REVERSA_COLETA_DONE_STATUS.includes(String(c.status_coleta || '')) && (!coletadorId || getCurrentCollectorId_(c) === coletadorId)).length,
      divergencias_abertas: divergencias.filter(d => ['aberta','em_tratativa'].includes(String(d.status_divergencia || '')) && (!coletadorId || String(d.coletador_id || '') === coletadorId)).length
    },
    pontos: points,
    em_andamento: coletas.filter(c => String(c.status_coleta) === 'em_andamento' && (!coletadorId || getCurrentCollectorId_(c) === coletadorId)).map(sanitizeColetaForCollector_)
  });
}
function apiGetCollectorHistory_(req) {
  const ss = getReversaSpreadsheet_();
  ensureColetaSchema_(ss);
  const coletadorId = String(req.coletador_id || '').trim();
  const coletas = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS));
  const unidades = indexBy_(getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES)), 'unidade_id');
  const divs = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS));
  const items = coletas
    .filter(c => !coletadorId || getCurrentCollectorId_(c) === coletadorId)
    .sort((a,b) => new Date(b.data_criacao || 0) - new Date(a.data_criacao || 0))
    .map(c => ({
      ...sanitizeColetaForCollector_(c),
      nome_unidade: unidades[c.unidade_id]?.nome_unidade || c.unidade_id,
      divergencias: divs.filter(d => String(d.coleta_id || '') === String(c.coleta_id)).length
    }));
  return apiOk_({ total: items.length, items: limitItems_(items, req.limit || 100) });
}

function apiGetColetaDetail_(req) {
  validateRequiredFields_(req, ['coleta_id']);
  return apiOk_(buildColetaDetail_(req.coleta_id));
}

function apiStartColetaExecution_(req) {
  validateRequiredFields_(req, ['unidade_id', 'coletador_id']);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_(); ensureColetaSchema_(ss);
    let coleta = req.coleta_id ? findRowById_(REVERSA_CORE_CFG.SHEETS.COLETAS, 'coleta_id', req.coleta_id) : findActiveColetaForUnit_(req.unidade_id);
    if (!coleta) {
      coleta = createColetaRecord_({ unidade_id:req.unidade_id, origem_coleta:'espontanea_coletador', data_coleta_programada:now_(), coletador_id:req.coletador_id, observacao_coleta:'Coleta iniciada espontaneamente pelo coletador.' });
      coleta = findRowById_(REVERSA_CORE_CFG.SHEETS.COLETAS, 'coleta_id', coleta.coleta_id);
    }
    const assigned = getCurrentCollectorId_(coleta);
    if (assigned && assigned !== String(req.coletador_id || '').trim()) {
      return apiError_('COLLECTION_ASSIGNED_TO_ANOTHER_COLLECTOR', `Esta coleta está atribuída a ${assigned}. Solicite a transferência pelo Admin Reverso.`);
    }
    const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS); const headers = getHeaders_(sheet);
    const now = now_();
    updateRowFieldsByIndex_(sheet, headers, findRowIndexByValue_(sheet,'coleta_id',coleta.coleta_id), {
      status_coleta:'em_andamento', data_inicio_coleta:coleta.data_inicio_coleta || now,
      coletador_id:req.coletador_id, coletador_id_atual:req.coletador_id,
      coletador_id_original:coleta.coletador_id_original || assigned || req.coletador_id,
      data_atualizacao:now
    });
    logEvento_({ tipo_entidade:'COLETA', entidade_id:coleta.coleta_id, unidade_id:coleta.unidade_id, coleta_id:coleta.coleta_id, tipo_evento:'coleta_iniciada_campo', origem_evento:'app_coletador', descricao_evento:`Coleta ${coleta.coleta_id} iniciada pelo coletador ${req.coletador_id}.`, ator_tipo:'coletador', ator_id:req.coletador_id });
    return apiOk_(buildColetaDetail_(coleta.coleta_id));
  } finally { lock.releaseLock(); }
}
function apiGetColetaSummary_(req) { validateRequiredFields_(req,['coleta_id']); return apiOk_(buildColetaDetail_(req.coleta_id)); }

function apiRegisterCollectorDivergence_(req) {
  req.origem_evento = 'app_coletador';
  return apiCreateDivergenciaV140_(req);
}

function apiCreateDivergenciaV140_(req) {
  validateRequiredFields_(req, ['tipo_divergencia','descricao_divergencia']);
  const photoRequired = ['pacote_sem_etiqueta','pacote_danificado'].includes(String(req.tipo_divergencia || '')) && String(req.origem_evento || '') === 'app_coletador';
  if (photoRequired && !String(req.foto_base64 || '').trim()) return apiError_('PHOTO_REQUIRED','Inclua uma foto para registrar esta divergência.');
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss=getReversaSpreadsheet_(); ensureColetaSchema_(ss);
    const fotoUrl=req.foto_base64 ? saveDivergencePhoto_(req.foto_base64, req.coleta_id || 'SEM-COLETA') : '';
    const row=appendDivergenceRecord_({ ...req, foto_url:fotoUrl, decisao_operacional:req.decisao_operacional || 'deixar_no_local', coletador_id:req.coletador_id || req.ator_id || '' });
    return apiOk_({ divergencia_id:row.divergencia_id, foto_url:fotoUrl, decisao_operacional:row.decisao_operacional });
  } finally { lock.releaseLock(); }
}

function apiCloseColetaV140_(req) {
  validateRequiredFields_(req,['coleta_id']);
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const ss=getReversaSpreadsheet_(); ensureColetaSchema_(ss);
    const detail=buildColetaDetail_(req.coleta_id);
    if (detail.missing_count > 0 && !detail.divergencias.some(d => d.tipo_divergencia === 'pacote_ausente' && ['aberta','em_tratativa'].includes(String(d.status_divergencia || '')))) {
      appendDivergenceRecord_({ unidade_id:detail.coleta.unidade_id, coleta_id:req.coleta_id, tipo_divergencia:'pacote_ausente', descricao_divergencia:`${detail.missing_count} objeto(s) previsto(s) não foram encontrados durante a retirada.`, origem_evento:'app_coletador', coletador_id:req.coletador_id || detail.coleta.coletador_id || '', decisao_operacional:'registrar_e_revisar' });
    }
    const divs=getDataRowsAsObjects_(getSheet_(ss,REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS)).filter(d=>String(d.coleta_id||'')===String(req.coleta_id)&&['aberta','em_tratativa'].includes(String(d.status_divergencia||'')));
    const sheet=getSheet_(ss,REVERSA_CORE_CFG.SHEETS.COLETAS); const headers=getHeaders_(sheet); const status=divs.length?'concluida_com_divergencia':'concluida';
    updateRowFieldsByIndex_(sheet,headers,findRowIndexByValue_(sheet,'coleta_id',req.coleta_id),{status_coleta:status,data_fim_coleta:now_(),data_atualizacao:now_()});
    logEvento_({tipo_entidade:'COLETA',entidade_id:req.coleta_id,unidade_id:detail.coleta.unidade_id,coleta_id:req.coleta_id,tipo_evento:'coleta_fechada',origem_evento:'app_coletador',descricao_evento:`Coleta ${req.coleta_id} encerrada com status ${status}.`,ator_tipo:'coletador',ator_id:req.coletador_id||detail.coleta.coletador_id||'COLETADOR'});
    return apiOk_({ coleta_id:req.coleta_id, status_coleta:status, missing_count:detail.missing_count, divergencias_abertas:divs.length });
  } finally { lock.releaseLock(); }
}

function createColetaRecord_(payload) {
  const ss=getReversaSpreadsheet_(); ensureColetaSchema_(ss);
  const unidade=findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES,'unidade_id',payload.unidade_id);
  const sheet=getSheet_(ss,REVERSA_CORE_CFG.SHEETS.COLETAS); const headers=getHeaders_(sheet); const now=now_();
  const coletaId=nextIdForSheet_(sheet,'coleta_id',REVERSA_CORE_CFG.ID_PREFIX.COLETA,REVERSA_CORE_CFG.PAD_LENGTH.COLETA);
  const pendentes=getPendingReversasForUnit_(payload.unidade_id);
  const earliest=minDate_(pendentes.map(r=>r.data_limite_operacional).filter(Boolean)) || payload.data_limite_operacional || payload.data_coleta_programada || now;
  const row=blankRowObject_(headers);
  const assignedCollector=resolveAssignedCollectorId_(payload,unidade);
  Object.assign(row,{coleta_id:coletaId,unidade_id:payload.unidade_id,data_coleta_programada:payload.data_coleta_programada||earliest,data_inicio_coleta:'',data_fim_coleta:'',coletador_id:assignedCollector,coletador_id_original:assignedCollector,coletador_id_atual:assignedCollector,data_transferencia:'',motivo_transferencia:'',transferido_por:'',qtde_prevista:pendentes.length,qtde_coletada:0,status_coleta:'aberta',observacao_coleta:payload.observacao_coleta||'',data_criacao:now,origem_coleta:payload.origem_coleta||'manual_admin',data_limite_operacional:payload.data_limite_operacional||earliest,data_atualizacao:now});
  appendObjectRow_(sheet,headers,row);
  logEvento_({tipo_entidade:'COLETA',entidade_id:coletaId,unidade_id:payload.unidade_id,coleta_id:coletaId,tipo_evento:'coleta_aberta',origem_evento:payload.origem_coleta==='automatica_unidade'?'sistema':'painel_agf',descricao_evento:`Coleta ${coletaId} criada para ${unidade.nome_unidade}.`,ator_tipo:payload.origem_coleta==='automatica_unidade'?'sistema':'agf',ator_id:assignedCollector||'SISTEMA'});
  if(assignedCollector) logEvento_({tipo_entidade:'COLETA',entidade_id:coletaId,unidade_id:payload.unidade_id,coleta_id:coletaId,tipo_evento:'coleta_atribuida_automaticamente',origem_evento:payload.origem_coleta==='automatica_unidade'?'sistema':'painel_agf',descricao_evento:`Coleta ${coletaId} atribuída a ${assignedCollector}.`,ator_tipo:payload.origem_coleta==='automatica_unidade'?'sistema':'agf',ator_id:assignedCollector});
  return {coleta_id:coletaId,unidade_id:payload.unidade_id,qtde_prevista:pendentes.length,status_coleta:'aberta',origem_coleta:row.origem_coleta,coletador_id:assignedCollector,coletador_id_atual:assignedCollector};
}

function refreshColetaExpectedCounters_(coletaId, dataLimite) {
  const ss=getReversaSpreadsheet_(); ensureColetaSchema_(ss);
  const coleta=findRowById_(REVERSA_CORE_CFG.SHEETS.COLETAS,'coleta_id',coletaId); const pending=getPendingReversasForUnit_(coleta.unidade_id); const sheet=getSheet_(ss,REVERSA_CORE_CFG.SHEETS.COLETAS); const headers=getHeaders_(sheet);
  const earliest=minDate_(pending.map(r=>r.data_limite_operacional).filter(Boolean)) || dataLimite || coleta.data_limite_operacional || coleta.data_coleta_programada || '';
  const assigned=getCurrentCollectorId_(coleta)||getUnitDefaultCollectorId_(coleta.unidade_id);
  updateRowFieldsByIndex_(sheet,headers,findRowIndexByValue_(sheet,'coleta_id',coletaId),{qtde_prevista:pending.length,data_limite_operacional:earliest,coletador_id:assigned,coletador_id_atual:assigned,coletador_id_original:coleta.coletador_id_original||assigned,data_atualizacao:now_()});
}

function findActiveColetaForUnit_(unidadeId) {
  const ss=getReversaSpreadsheet_(); ensureColetaSchema_(ss);
  const rows=getDataRowsAsObjects_(getSheet_(ss,REVERSA_CORE_CFG.SHEETS.COLETAS));
  return rows.filter(c=>String(c.unidade_id||'')===String(unidadeId)&&REVERSA_COLETA_ACTIVE_STATUS.includes(String(c.status_coleta||''))).sort((a,b)=>new Date(b.data_criacao||0)-new Date(a.data_criacao||0))[0]||null;
}

function buildColetaDetail_(coletaId) {
  const ss=getReversaSpreadsheet_(); ensureColetaSchema_(ss);
  const coleta=findRowById_(REVERSA_CORE_CFG.SHEETS.COLETAS,'coleta_id',coletaId); const unidade=findRowById_(REVERSA_CORE_CFG.SHEETS.UNIDADES,'unidade_id',coleta.unidade_id);
  const itens=getDataRowsAsObjects_(getSheet_(ss,REVERSA_CORE_CFG.SHEETS.COLETA_ITENS)).filter(i=>String(i.coleta_id||'')===String(coletaId));
  const reversas=getDataRowsAsObjects_(getSheet_(ss,REVERSA_CORE_CFG.SHEETS.REVERSAS)).filter(r=>String(r.unidade_id||'')===String(coleta.unidade_id));
  const pendentes=reversas.filter(r=>['dropoff_realizado','aguardando_coleta_agf'].includes(String(r.status_reversa||'')));
  const divs=getDataRowsAsObjects_(getSheet_(ss,REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS)).filter(d=>String(d.coleta_id||'')===String(coletaId));
  const users=indexBy_(getDataRowsAsObjects_(getSheet_(ss,REVERSA_CORE_CFG.SHEETS.USUARIOS)),'usuario_id'); const etqs=indexBy_(getDataRowsAsObjects_(getSheet_(ss,REVERSA_CORE_CFG.SHEETS.ETIQUETAS)),'etiqueta_id');
  const scanned=itens.map(i=>({ ...i, codigo_etiqueta:etqs[i.etiqueta_id]?.codigo_etiqueta||'', usuario_nome:users[i.usuario_id]?.nome||'' }));
  const expected=pendentes.map(r=>({reversa_id:r.reversa_id,etiqueta_id:r.etiqueta_id,codigo_etiqueta:etqs[r.etiqueta_id]?.codigo_etiqueta||'',usuario_id:r.usuario_id,usuario_nome:users[r.usuario_id]?.nome||'',prazo_limite:r.data_limite_operacional||''}));
  return { coleta:sanitizeColetaForCollector_(coleta), unidade:{...unidade,endereco_completo:buildUnitAddress_(unidade),maps_url:buildGoogleMapsUrl_(buildUnitAddress_(unidade)),waze_url:buildWazeUrl_(buildUnitAddress_(unidade))}, expected_items:expected, scanned_items:scanned, divergencias:divs, expected_count:Number(coleta.qtde_prevista||expected.length||0), scanned_count:scanned.length, missing_count:Math.max(0,Number(coleta.qtde_prevista||expected.length||0)-scanned.length) };
}

function appendDivergenceRecord_(req) {
  const ss=getReversaSpreadsheet_(); ensureColetaSchema_(ss); const sheet=getSheet_(ss,REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS); const headers=getHeaders_(sheet);
  const id=nextIdForSheet_(sheet,'divergencia_id',REVERSA_CORE_CFG.ID_PREFIX.DIVERGENCIA,REVERSA_CORE_CFG.PAD_LENGTH.DIVERGENCIA); const row=blankRowObject_(headers); const now=now_();
  Object.assign(row,{divergencia_id:id,unidade_id:req.unidade_id||'',coleta_id:req.coleta_id||'',reversa_id:req.reversa_id||'',etiqueta_id:req.etiqueta_id||'',usuario_id:req.usuario_id||'',tipo_divergencia:req.tipo_divergencia,descricao_divergencia:req.descricao_divergencia,status_divergencia:req.status_divergencia||'aberta',responsavel_tratativa:req.responsavel_tratativa||req.coletador_id||req.ator_id||'AGF',data_abertura:now,data_fechamento:'',coletador_id:req.coletador_id||'',decisao_operacional:req.decisao_operacional||'deixar_no_local',foto_url:req.foto_url||'',data_hora_registro_campo:req.origem_evento==='app_coletador'?now:''});
  appendObjectRow_(sheet,headers,row);
  logEvento_({tipo_entidade:'DIVERGENCIA',entidade_id:id,unidade_id:row.unidade_id,usuario_id:row.usuario_id,reversa_id:row.reversa_id,etiqueta_id:row.etiqueta_id,coleta_id:row.coleta_id,tipo_evento:'divergencia_registrada',origem_evento:req.origem_evento||'painel_agf',descricao_evento:`Divergência ${id}: ${req.tipo_divergencia}`,ator_tipo:req.origem_evento==='app_coletador'?'coletador':'agf',ator_id:req.coletador_id||req.ator_id||'AGF'});
  return row;
}

function saveDivergencePhoto_(dataUrl, ref) {
  const raw=String(dataUrl||''); const m=raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/); if(!m) throw new Error('Formato de foto inválido.');
  const bytes=Utilities.base64Decode(m[2]); if(bytes.length>4*1024*1024) throw new Error('A foto excede o limite de 4 MB.');
  const ext=m[1].includes('png')?'png':'jpg'; const blob=Utilities.newBlob(bytes,m[1],`divergencia-${ref}-${Date.now()}.${ext}`); const folder=getDivergencePhotoFolder_(); const file=folder.createFile(blob); return file.getUrl();
}

function getDivergencePhotoFolder_() {
  const ss=getReversaSpreadsheet_(); const sheet=getSheet_(ss,REVERSA_CORE_CFG.SHEETS.PARAMETROS); const headers=getHeaders_(sheet); const rows=getDataRowsAsObjects_(sheet); let folderId=getParametroValue_('divergencias_fotos_drive_folder_id');
  if(folderId){try{return DriveApp.getFolderById(folderId);}catch(_){}}
  const folder=DriveApp.createFolder('Reverso - Fotos de divergências'); folderId=folder.getId(); const existing=rows.find(r=>String(r.parametro||'')==='divergencias_fotos_drive_folder_id');
  if(existing) updateRowFieldsByIndex_(sheet,headers,findRowIndexByValue_(sheet,'parametro','divergencias_fotos_drive_folder_id'),{valor:folderId}); else appendObjectRow_(sheet,headers,{parametro:'divergencias_fotos_drive_folder_id',valor:folderId,descricao:'Pasta Drive criada automaticamente para fotos de divergências.',escopo:'GLOBAL',status_parametro:'ativo'});
  return folder;
}

function sanitizeColetaForCollector_(c){return {coleta_id:c.coleta_id,unidade_id:c.unidade_id,data_coleta_programada:c.data_coleta_programada||'',data_inicio_coleta:c.data_inicio_coleta||'',data_fim_coleta:c.data_fim_coleta||'',coletador_id:getCurrentCollectorId_(c),coletador_id_original:c.coletador_id_original||'',coletador_id_atual:getCurrentCollectorId_(c),data_transferencia:c.data_transferencia||'',motivo_transferencia:c.motivo_transferencia||'',transferido_por:c.transferido_por||'',transferida:Boolean(c.data_transferencia),qtde_prevista:Number(c.qtde_prevista||0),qtde_coletada:Number(c.qtde_coletada||0),status_coleta:c.status_coleta||'',origem_coleta:c.origem_coleta||'',data_limite_operacional:c.data_limite_operacional||''};}
function groupBy_(rows,key){return (rows||[]).reduce((a,r)=>{const k=String(r[key]||'');if(k)(a[k]||(a[k]=[])).push(r);return a;},{});}
function minDate_(vals){const ds=(vals||[]).map(v=>new Date(v)).filter(d=>!isNaN(d.getTime())).sort((a,b)=>a-b);return ds[0]||'';}
function buildUnitAddress_(u){return [u.endereco,u.numero,u.complemento,u.bairro,u.cidade,u.uf,u.cep].filter(Boolean).join(', ');}
function buildGoogleMapsUrl_(address){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address||'')}`;}
function buildWazeUrl_(address){return `https://waze.com/ul?q=${encodeURIComponent(address||'')}&navigate=yes`;}
function getDeadlinePriority_(value){if(!value)return 'programada';const due=new Date(value);if(isNaN(due.getTime()))return 'programada';const diff=businessDaysDiff_(new Date(),due);return diff<0?'vencida':diff===0?'urgente':diff<=1?'atencao':'programada';}
function businessDaysDiff_(startValue,endValue){const start=new Date(startValue),end=new Date(endValue);if(isNaN(start.getTime())||isNaN(end.getTime()))return 0;start.setHours(0,0,0,0);end.setHours(0,0,0,0);const direction=end>=start?1:-1;let cursor=new Date(start),count=0;while(cursor.getTime()!==end.getTime()){cursor.setDate(cursor.getDate()+direction);const day=cursor.getDay();if(day!==0&&day!==6)count+=direction;}return count;}
function compareCollectorPoints_(a,b){const order={vencida:0,urgente:1,atencao:2,programada:3};return (order[a.prioridade]??9)-(order[b.prioridade]??9)||new Date(a.prazo_limite||'2999-01-01')-new Date(b.prazo_limite||'2999-01-01');}
