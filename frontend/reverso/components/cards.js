function normalizeStatus(status){ return String(status || 'info').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,'_').replace(/-/g,'_'); }
export function labelForStatus(status){
  const normalized = normalizeStatus(status);
  const map={normal:'Normal',atencao:'Atenção',quase_cheio:'Quase cheio',indisponivel:'Indisponível',dropoff_realizado:'Drop-off realizado',drop_off_realizado:'Drop-off realizado',aguardando_coleta_agf:'Aguardando coleta',coletada_agf:'Coletada pela AGF',recebida_agencia:'Recebida na agência',postada:'Postada',concluida:'Concluída',divergencia:'Divergência',lida:'Etiqueta lida',confirmada_dropoff:'Etiqueta confirmada',coletada:'Etiqueta coletada'};
  return map[normalized] || status || '-';
}
export function statusBadge(status){ const cls=normalizeStatus(status)||'info'; return `<span class="badge ${cls}">${labelForStatus(status)}</span>`; }
export function emptyState(icon,title,subtitle=''){ return `<div class="empty-state"><span class="material-symbols-rounded">${icon}</span><div><strong>${title}</strong></div>${subtitle?`<div>${subtitle}</div>`:''}</div>`; }
