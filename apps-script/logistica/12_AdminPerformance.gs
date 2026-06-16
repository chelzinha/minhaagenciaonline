/***************************************
 * REVERSA - v1.5.1
 * Leitura agregada para o painel Admin
 * Reduz chamadas HTTP e leituras repetidas da planilha.
 ***************************************/
const REVERSA_ADMIN_BOOTSTRAP_CACHE_KEY = 'REVERSA_ADMIN_BOOTSTRAP_V151';
const REVERSA_ADMIN_BOOTSTRAP_TTL_SECONDS = 12;

function clearReversaReadCache_() {
  try { CacheService.getScriptCache().remove(REVERSA_ADMIN_BOOTSTRAP_CACHE_KEY); } catch (_) {}
}

function getAdminBootstrapDataCached_(force) {
  const cache = CacheService.getScriptCache();
  if (!force) {
    const cached = cache.get(REVERSA_ADMIN_BOOTSTRAP_CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch (_) {}
    }
  }
  const data = buildAdminBootstrap_();
  try { cache.put(REVERSA_ADMIN_BOOTSTRAP_CACHE_KEY, JSON.stringify(data), REVERSA_ADMIN_BOOTSTRAP_TTL_SECONDS); } catch (_) {}
  return data;
}
function apiGetAdminBootstrap_(req) {
  return apiOk_(getAdminBootstrapDataCached_(String(req.force || '') === '1'));
}

function buildAdminBootstrap_() {
  const ss = getReversaSpreadsheet_();
  const unidadesRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES));
  const usuariosRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.USUARIOS));
  const lotesRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.LOTES_ETIQUETAS));
  const etiquetasRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS));
  const reversasRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS));
  const coletasRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS));
  const divergenciasRows = getDataRowsAsObjects_(getSheet_(ss, REVERSA_CORE_CFG.SHEETS.DIVERGENCIAS));

  const unidadesById = indexBy_(unidadesRows, 'unidade_id');
  const usuariosById = indexBy_(usuariosRows, 'usuario_id');
  const lotesById = indexBy_(lotesRows, 'lote_id');
  const etiquetasById = indexBy_(etiquetasRows, 'etiqueta_id');
  const unitStatus = buildUnitStatusMapV151_(unidadesRows, etiquetasRows, reversasRows);

  const unidades = unidadesRows.map(u => ({
    ...u,
    status_ponto: unitStatus[String(u.unidade_id)] || buildEmptyUnitStatusV151_(u),
    agenda_disponibilidade: buildUnitAvailabilityCalendarFromInfoV151_(u, unitStatus[String(u.unidade_id)] || buildEmptyUnitStatusV151_(u), 5)
  }));
  const lotes = lotesRows.map(l => ({ ...l, nome_unidade: unidadesById[l.unidade_id]?.nome_unidade || '' }))
    .sort((a,b) => new Date(b.data_geracao || 0) - new Date(a.data_geracao || 0));
  const reversas = reversasRows.map(r => ({
    ...r,
    nome_unidade: unidadesById[r.unidade_id]?.nome_unidade || '',
    nome_usuario: usuariosById[r.usuario_id]?.nome || '',
    sala_apto_empresa: usuariosById[r.usuario_id]?.sala_apto_empresa || '',
    codigo_etiqueta: etiquetasById[r.etiqueta_id]?.codigo_etiqueta || ''
  })).sort((a,b) => new Date(b.data_criacao || 0) - new Date(a.data_criacao || 0));
  const coletas = coletasRows.map(c => ({ ...c, coletador_id_atual: getCurrentCollectorId_(c), nome_unidade: unidadesById[c.unidade_id]?.nome_unidade || '' }))
    .sort((a,b) => new Date(b.data_criacao || 0) - new Date(a.data_criacao || 0));
  const divergencias = divergenciasRows.map(d => ({ ...d, nome_unidade: unidadesById[d.unidade_id]?.nome_unidade || '' }))
    .sort((a,b) => new Date(b.data_abertura || 0) - new Date(a.data_abertura || 0));

  return {
    dashboard: { resumo: buildDashboardSummaryV151_(unidades, etiquetasRows, reversasRows, divergenciasRows) },
    unidades,
    lotes: limitItems_(lotes, 500),
    reversas: limitItems_(reversas, 500),
    coletas: limitItems_(coletas, 500),
    divergencias: limitItems_(divergencias, 500),
    generated_at: now_()
  };
}

function buildEmptyUnitStatusV151_(unidade) {
  return { pacotes_pendentes:0, capacidade_max_pacotes:Number(unidade.capacidade_max_pacotes||0)||0, ocupacao_pct:0, status_ocupacao:'normal', etiquetas_disponiveis:0, etiquetas_lidas_nao_confirmadas:0 };
}
function buildUnitStatusMapV151_(unidades, etiquetas, reversas) {
  const map = {};
  unidades.forEach(u => { map[String(u.unidade_id)] = buildEmptyUnitStatusV151_(u); });
  reversas.forEach(r => { if (['dropoff_realizado','aguardando_coleta_agf'].includes(String(r.status_reversa||''))) { const s=map[String(r.unidade_id)]; if(s) s.pacotes_pendentes += 1; } });
  etiquetas.forEach(e => { const s=map[String(e.unidade_id)]; if(!s) return; if(String(e.status_etiqueta)==='disponivel') s.etiquetas_disponiveis += 1; if(String(e.status_etiqueta)==='lida') s.etiquetas_lidas_nao_confirmadas += 1; });
  unidades.forEach(u => { const s=map[String(u.unidade_id)]; const cap=Number(s.capacidade_max_pacotes||0); s.ocupacao_pct=cap>0?Number(((s.pacotes_pendentes/cap)*100).toFixed(2)):0; const alerta=Number(u.nivel_alerta_ocupacao_pct||80)||80; s.status_ocupacao=cap>0&&s.pacotes_pendentes>=cap?'indisponivel':s.ocupacao_pct>=95?'quase_cheio':s.ocupacao_pct>=alerta?'atencao':'normal'; });
  return map;
}
function buildUnitAvailabilityCalendarFromInfoV151_(unidade, statusInfo, daysAhead) {
  const out=[]; let cursor=new Date(); let added=0;
  while(added<(daysAhead||5)){ const day=cursor.getDay(); if(day!==0&&day!==6){ out.push({data_iso:Utilities.formatDate(cursor,REVERSA_CORE_CFG.TZ,'yyyy-MM-dd'),data_label:Utilities.formatDate(cursor,REVERSA_CORE_CFG.TZ,'dd/MM/yyyy'),disponivel:unidade.status_unidade==='ativa'?(statusInfo.status_ocupacao!=='indisponivel'||added>0):false}); added++; } cursor.setDate(cursor.getDate()+1); }
  return out;
}
function buildDashboardSummaryV151_(unidades, etiquetas, reversas, divergencias) {
  const today=Utilities.formatDate(new Date(),REVERSA_CORE_CFG.TZ,'yyyy-MM-dd');
  return {
    reversas_criadas_hoje:reversas.filter(r=>formatDateOnly_(r.data_criacao)===today).length,
    dropoffs_confirmados_hoje:reversas.filter(r=>formatDateOnly_(r.data_confirmacao_dropoff)===today).length,
    reversas_aguardando_coleta:reversas.filter(r=>['dropoff_realizado','aguardando_coleta_agf'].includes(String(r.status_reversa||''))).length,
    reversas_coletadas_hoje:reversas.filter(r=>formatDateOnly_(r.data_coleta_agf)===today).length,
    reversas_postadas_hoje:reversas.filter(r=>formatDateOnly_(r.data_postagem)===today).length,
    unidades_em_alerta:unidades.filter(u=>['atencao','quase_cheio','indisponivel'].includes(String(u.status_ponto?.status_ocupacao||''))).length,
    etiquetas_disponiveis:etiquetas.filter(e=>String(e.status_etiqueta)==='disponivel').length,
    etiquetas_lidas_nao_confirmadas:etiquetas.filter(e=>String(e.status_etiqueta)==='lida').length,
    divergencias_abertas:divergencias.filter(d=>['aberta','em_tratativa'].includes(String(d.status_divergencia||''))).length
  };
}
