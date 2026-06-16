import { Api } from '../services/api.js';

const auth = window.AgfAuth;
const $ = (id) => document.getElementById(id);
const mount = $('appMount');
let user = {};
let coletadorId = '';
let tab = 'home';
let homeData = null;
let historyData = null;
let current = null;
let scannerStream = null;
let scannerTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
function showLoading(text = 'Processando...') { $('loadingText').textContent = text; $('loading').classList.add('show'); }
function hideLoading() { $('loading').classList.remove('show'); }
function toast(message, type = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.style.background = type === 'error' ? '#B91C1C' : type === 'success' ? '#15803D' : '#1F2937';
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 3200);
}
function todayLabel() { return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date()).replace(/^./,c=>c.toUpperCase()); }
function fmtDate(value, withTime = false) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date);
}
function fmtShortDay(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '').slice(0, 3);
}
function fmtDayMonth(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}
function formatDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setHours(0, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function statusLabel(value) {
  return ({ aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', concluida_com_divergencia: 'Com divergência', cancelada: 'Cancelada', vencida: 'Vencida', urgente: 'Hoje', atencao: 'Atenção', programada: 'Programada' })[value] || String(value || '');
}
function chip(value) { return `<span class="collector-chip ${esc(value)}">${esc(statusLabel(value))}</span>`; }
function objectWord(count) { return Number(count) === 1 ? 'objeto' : 'objetos'; }
function confirmationWord(count) { return Number(count) > 1 ? 'confirmações' : 'confirmação'; }
function bottomActive() { document.querySelectorAll('.collector-bottom-nav button').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab)); }
function businessDaysUntil(value) {
  if (!value) return null;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(); start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
  const direction = end >= start ? 1 : -1;
  let cursor = new Date(start); let count = 0;
  while (formatDateKey(cursor) !== formatDateKey(end)) {
    cursor.setDate(cursor.getDate() + direction);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += direction;
  }
  return count;
}
function deadlineMeta(value) {
  const days = businessDaysUntil(value);
  if (days === null) return { className: 'programada', label: 'Sem prazo', detail: '-', bars: 0 };
  if (days < 0) return { className: 'vencida', label: `Atrasada ${Math.abs(days)}d`, detail: 'prazo vencido', bars: 0 };
  if (days === 0) return { className: 'urgente', label: 'Hoje', detail: 'coletar hoje', bars: 1 };
  if (days === 1) return { className: 'atencao', label: '1 dia útil', detail: 'vence amanhã útil', bars: 2 };
  return { className: 'programada', label: `${days} dias úteis`, detail: 'folga operacional', bars: Math.min(days + 1, 5) };
}
function deadlineVisual(value) {
  const meta = deadlineMeta(value);
  return `<div class="deadline-box ${meta.className}"><strong>${esc(meta.label)}</strong><div class="deadline-bars">${Array.from({ length: 5 }, (_, index) => `<i class="${index < meta.bars ? 'on' : ''}"></i>`).join('')}</div><small>${esc(meta.detail)}</small></div>`;
}
function nextBusinessDays(total = 5) {
  const out = []; const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  while (out.length < total) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
function renderCalendar(points = []) {
  const days = nextBusinessDays(5);
  const overdue = points.filter((point) => businessDaysUntil(point.prazo_limite) < 0);
  return `<section class="collector-calendar-card"><div class="section-row calendar-heading"><div><h2>Agenda útil</h2><p>Prioridades dos próximos dias.</p></div><span class="material-symbols-rounded">calendar_month</span></div><div class="collector-calendar">${days.map((day, index) => {
    const dayKey = formatDateKey(day);
    const items = points.filter((point) => formatDateKey(point.prazo_limite) === dayKey || (index === 0 && overdue.includes(point)));
    return `<article class="calendar-day ${index === 0 ? 'today' : ''}"><header><b>${esc(fmtShortDay(day))}</b><time>${esc(fmtDayMonth(day))}</time></header><div class="calendar-day-body">${items.length ? items.slice(0, 3).map((point) => { const meta = deadlineMeta(point.prazo_limite); return `<div class="calendar-event ${meta.className}"><strong>${esc(point.nome_unidade)}</strong><small>${Number(point.pendentes || 0)} ${objectWord(point.pendentes || 0)} · ${esc(meta.label)}</small></div>`; }).join('') : '<small class="calendar-empty">Sem coleta</small>'}${items.length > 3 ? `<small class="calendar-more">+${items.length - 3} ponto(s)</small>` : ''}</div></article>`;
  }).join('')}</div></section>`;
}
function renderProgressBlocks(scanned, expected) {
  const total = Math.max(Number(expected || 0), 1);
  const visibleTotal = Math.min(total, 20);
  const filled = total <= 20 ? Math.min(Number(scanned || 0), visibleTotal) : Math.round((Number(scanned || 0) / total) * visibleTotal);
  return `<div class="progress-blocks" aria-label="${scanned} de ${expected} objetos coletados">${Array.from({ length: visibleTotal }, (_, index) => `<i class="${index < filled ? 'done' : ''}"></i>`).join('')}</div>`;
}
async function loadHome() {
  showLoading('Carregando coletas...');
  try { homeData = await Api.getCollectorHome({ coletador_id: coletadorId }); renderHome(); }
  catch (error) { renderError(error); }
  finally { hideLoading(); }
}
async function loadHistory() {
  showLoading('Carregando histórico...');
  try { historyData = await Api.getCollectorHistory({ coletador_id: coletadorId }); renderHistory(); }
  catch (error) { renderError(error); }
  finally { hideLoading(); }
}
async function loadActive() {
  tab = 'active'; bottomActive();
  if (current?.coleta?.status_coleta === 'em_andamento') { renderExecution(); return; }
  showLoading('Carregando coleta ativa...');
  try {
    if (!homeData) homeData = await Api.getCollectorHome({ coletador_id: coletadorId });
    const active = (homeData.em_andamento || [])[0];
    if (!active) { renderNoActive(); return; }
    current = await Api.getColetaDetail(active.coleta_id);
    renderExecution();
  } catch (error) { renderError(error); }
  finally { hideLoading(); }
}
function renderError(error) { mount.innerHTML = `<section class="collector-page"><div class="empty-state"><span class="material-symbols-rounded">error</span><h2>Não foi possível carregar</h2><p>${esc(error.message || error)}</p><button class="btn btn-primary" data-action="reload">Tentar novamente</button></div></section>`; }
function renderHome() {
  tab = 'home'; bottomActive();
  const data = homeData || { resumo: {}, pontos: [] }; const summary = data.resumo || {}; const points = data.pontos || [];
  mount.innerHTML = `<section class="collector-page"><div class="page-title-row"><div><h1>Coletas pendentes</h1><p class="collector-date"><span class="material-symbols-rounded">calendar_today</span>${esc(todayLabel())}</p></div><button class="refresh-compact" data-action="reload" aria-label="Atualizar"><span class="material-symbols-rounded">refresh</span></button></div><div class="collector-stats"><div class="stat-blue"><span class="material-symbols-rounded">route</span><b>${summary.coletas_pendentes || 0}</b><small>Pendentes</small></div><div class="stat-cyan"><span class="material-symbols-rounded">package_2</span><b>${summary.pacotes_previstos || 0}</b><small>Objetos</small></div><div class="stat-green"><span class="material-symbols-rounded">task_alt</span><b>${summary.coletas_concluidas_hoje || 0}</b><small>Concluídas</small></div><div class="stat-red"><span class="material-symbols-rounded">warning</span><b>${summary.divergencias_abertas || 0}</b><small>Divergências</small></div></div>${renderCalendar(points)}<div class="section-row"><div><h2>Pontos para retirada</h2><p>${points.length} unidade(s) com operação disponível.</p></div></div><div class="unit-card-list">${points.length ? points.map(unitCard).join('') : '<div class="empty-state compact"><span class="material-symbols-rounded">done_all</span><h3>Nenhuma coleta pendente</h3><p>Não há objetos aguardando retirada neste momento.</p></div>'}</div></section>`;
}
function unitCard(point) {
  const active = point.coleta_ativa; const meta = deadlineMeta(point.prazo_limite);
  return `<article class="unit-card priority-${esc(point.prioridade)}"><div class="unit-card-head"><div class="unit-icon"><span class="material-symbols-rounded">apartment</span></div><div class="unit-title"><h3>${esc(point.nome_unidade)}</h3><p>${esc(point.endereco_completo || 'Endereço não informado')}</p></div>${chip(point.prioridade)}</div><div class="unit-metrics"><div><b>${point.pendentes || 0}</b><small>${objectWord(point.pendentes || 0)}</small></div><div><b>${Number(point.ocupacao_pct || 0).toFixed(0)}%</b><small>ocupação</small></div><div class="deadline-metric">${deadlineVisual(point.prazo_limite)}</div></div><div class="unit-actions"><a class="route-link" href="${esc(point.maps_url)}" target="_blank" rel="noopener"><span class="material-symbols-rounded">map</span>Maps</a><a class="route-link" href="${esc(point.waze_url)}" target="_blank" rel="noopener"><span class="material-symbols-rounded">navigation</span>Waze</a><button class="btn btn-primary unit-start" data-action="start" data-unit="${esc(point.unidade_id)}" data-coleta="${esc(active?.coleta_id || '')}"><span class="material-symbols-rounded">play_arrow</span>${active?.status_coleta === 'em_andamento' ? 'Continuar coleta' : 'Iniciar coleta'}</button></div>${active ? `<div class="unit-active">${chip(active.status_coleta)} ${active.transferida?'<span class="collector-chip transferida">Transferida para você</span>':''}<span>${esc(active.coleta_id)}</span><small>${esc(meta.label)}</small></div>` : ''}</article>`;
}
async function startCollection(button) {
  showLoading('Iniciando coleta...');
  try { current = await Api.startColetaExecution({ unidade_id: button.dataset.unit, coleta_id: button.dataset.coleta || '', coletador_id: coletadorId }); tab = 'active'; bottomActive(); renderExecution(); toast('Coleta iniciada.', 'success'); }
  catch (error) { toast(error.message, 'error'); }
  finally { hideLoading(); }
}
async function openHistoryCollection(id) {
  showLoading('Abrindo coleta...');
  try { current = await Api.getColetaDetail(id); renderHistoryDetail(); }
  catch (error) { toast(error.message, 'error'); }
  finally { hideLoading(); }
}
function renderNoActive() {
  tab = 'active'; bottomActive();
  mount.innerHTML = `<section class="collector-page"><div class="page-title-row"><div><h1>Coleta ativa</h1><p>Atendimento em andamento.</p></div></div><div class="empty-state active-empty"><span class="material-symbols-rounded">play_circle</span><h2>Nenhuma coleta ativa</h2><p>Escolha um ponto na aba Coletas para iniciar a retirada.</p><button class="btn btn-primary" data-action="back-home"><span class="material-symbols-rounded">route</span>Ver coletas pendentes</button></div></section>`;
}
function renderExecution() {
  tab = 'active'; bottomActive();
  const data = current; const collection = data.coleta; const unit = data.unidade;
  mount.innerHTML = `<section class="collector-page execution-page"><button class="back-link" data-action="back-home"><span class="material-symbols-rounded">arrow_back</span>Voltar às coletas</button><div class="execution-hero"><div><span class="collector-kicker">COLETA ATIVA</span><h1>${esc(unit.nome_unidade)}</h1><p>${esc(unit.endereco_completo || '')}</p></div>${chip(collection.status_coleta)}</div><div class="progress-card"><div class="progress-top"><div><b>${data.scanned_count}/${data.expected_count}</b><span>objetos coletados</span></div><small>${Math.round((data.scanned_count / Math.max(data.expected_count, 1)) * 100)}%</small></div>${renderProgressBlocks(data.scanned_count, data.expected_count)}</div><div class="scan-actions"><button class="scan-main" data-action="open-scanner"><span class="material-symbols-rounded">qr_code_scanner</span><b>Ler QR Code</b><small>Use a câmera do celular</small></button><div class="manual-row"><input class="input" id="manualCode" placeholder="Ou digite o código da etiqueta"><button class="btn btn-success" data-action="scan-manual"><span class="material-symbols-rounded">check_circle</span>Confirmar</button></div></div><div class="execution-tools"><button class="btn btn-danger-outline" data-action="open-divergence"><span class="material-symbols-rounded">report_problem</span>Registrar divergência</button><button class="btn btn-primary" data-action="finish"><span class="material-symbols-rounded">task_alt</span>Finalizar coleta</button></div><div class="section-row"><div><h2>Objetos já lidos</h2><p>${data.scanned_count} ${confirmationWord(data.scanned_count)} nesta coleta.</p></div></div><div class="scan-list">${data.scanned_items.length ? data.scanned_items.map((item) => `<div class="scan-item"><span class="material-symbols-rounded">check_circle</span><div><b>${esc(item.codigo_etiqueta)}</b><small>${esc(item.usuario_nome || 'Usuário')}</small></div><time>${fmtDate(item.data_hora_leitura_coletador, true)}</time></div>`).join('') : '<div class="empty-state compact"><span class="material-symbols-rounded">qr_code_scanner</span><p>Leia a primeira etiqueta para iniciar a conferência.</p></div>'}</div></section>`;
}
async function scanCode(raw) {
  const code = parseEtiquetaCode(raw);
  if (!code) { toast('Código da etiqueta não identificado.', 'error'); return; }
  showLoading('Confirmando objeto...');
  try { const result = await Api.scanEtiquetaColeta({ coleta_id: current.coleta.coleta_id, codigo_etiqueta: code, coletador_id: coletadorId }); current = await Api.getColetaDetail(current.coleta.coleta_id); renderExecution(); toast(result.already_scanned ? 'Etiqueta já havia sido confirmada.' : 'Objeto coletado com sucesso.', 'success'); closeModal('scannerModal'); }
  catch (error) { toast(error.message, 'error'); }
  finally { hideLoading(); }
}
function parseEtiquetaCode(raw) { const text = String(raw || '').trim(); if (!text) return ''; try { const url = new URL(text); return url.searchParams.get('etiqueta') || text; } catch (_) { return text; } }
async function finish() { showLoading('Preparando resumo...'); try { current = await Api.getColetaSummary(current.coleta.coleta_id); renderFinish(); } catch (error) { toast(error.message, 'error'); } finally { hideLoading(); } }
function renderFinish() {
  const data = current;
  mount.innerHTML = `<section class="collector-page"><button class="back-link" data-action="back-execution"><span class="material-symbols-rounded">arrow_back</span>Voltar à leitura</button><div class="summary-card"><span class="summary-icon material-symbols-rounded">fact_check</span><h1>Finalizar coleta</h1><p>Revise o resumo antes de encerrar a retirada.</p><div class="summary-grid"><div><b>${data.expected_count}</b><small>Previstos</small></div><div><b>${data.scanned_count}</b><small>Coletados</small></div><div class="${data.missing_count ? 'warn' : ''}"><b>${data.missing_count}</b><small>Não encontrados</small></div><div><b>${data.divergencias.length}</b><small>Divergências</small></div></div>${data.missing_count ? `<div class="notice notice-warn"><span class="material-symbols-rounded">warning</span><div>Existem ${data.missing_count} ${objectWord(data.missing_count)} ainda não lidos. O encerramento será registrado com divergência.</div></div>` : ''}<button class="btn btn-success btn-block btn-lg" data-action="confirm-finish"><span class="material-symbols-rounded">task_alt</span>Confirmar encerramento</button></div></section>`;
}
async function confirmFinish() {
  showLoading('Encerrando coleta...');
  try { const result = await Api.closeColeta({ coleta_id: current.coleta.coleta_id, coletador_id: coletadorId }); current = null; mount.innerHTML = `<section class="collector-page"><div class="success-card"><div class="success-icon"><span class="material-symbols-rounded">task_alt</span></div><h1 class="success-title">Coleta encerrada</h1><p class="success-subtitle">${result.status_coleta === 'concluida' ? 'Todos os objetos foram confirmados.' : 'A coleta foi encerrada com divergência para acompanhamento.'}</p><button class="btn btn-primary btn-block" data-action="back-home">Voltar às coletas</button></div></section>`; toast('Coleta encerrada.', 'success'); }
  catch (error) { toast(error.message, 'error'); }
  finally { hideLoading(); }
}
function renderHistory() {
  tab = 'history'; bottomActive();
  const items = (historyData?.items || []).filter((item) => ['concluida', 'concluida_com_divergencia', 'cancelada'].includes(String(item.status_coleta || '')));
  mount.innerHTML = `<section class="collector-page"><div class="page-title-row"><div><h1>Histórico de coletas</h1><p>Atendimentos finalizados.</p></div></div><div class="history-list">${items.length ? items.map((item) => `<article class="history-item" data-action="open-history" data-id="${esc(item.coleta_id)}"><div><h3>${esc(item.nome_unidade)}</h3><p>${esc(item.coleta_id)} · ${fmtDate(item.data_inicio_coleta || item.data_criacao, true)}</p></div><div>${chip(item.status_coleta)}<small>${item.qtde_coletada || 0}/${item.qtde_prevista || 0} objetos</small></div></article>`).join('') : '<div class="empty-state"><span class="material-symbols-rounded">history</span><p>Nenhuma coleta finalizada para este usuário.</p></div>'}</div></section>`;
}
function renderHistoryDetail() {
  tab = 'history'; bottomActive(); const data = current; const collection = data.coleta; const unit = data.unidade;
  mount.innerHTML = `<section class="collector-page"><button class="back-link" data-action="back-history"><span class="material-symbols-rounded">arrow_back</span>Voltar ao histórico</button><div class="summary-card read-only"><span class="summary-icon material-symbols-rounded">history</span><h1>${esc(unit.nome_unidade)}</h1><p>${esc(collection.coleta_id)} · ${fmtDate(collection.data_inicio_coleta || collection.data_coleta_programada, true)}</p><div class="summary-grid"><div><b>${data.expected_count}</b><small>Previstos</small></div><div><b>${data.scanned_count}</b><small>Coletados</small></div><div><b>${data.missing_count}</b><small>Ausentes</small></div><div><b>${data.divergencias.length}</b><small>Divergências</small></div></div>${chip(collection.status_coleta)}</div><div class="section-row"><div><h2>Objetos já lidos</h2><p>${data.scanned_count} ${confirmationWord(data.scanned_count)}.</p></div></div><div class="scan-list">${data.scanned_items.length ? data.scanned_items.map((item) => `<div class="scan-item"><span class="material-symbols-rounded">check_circle</span><div><b>${esc(item.codigo_etiqueta)}</b><small>${esc(item.usuario_nome || 'Usuário')}</small></div><time>${fmtDate(item.data_hora_leitura_coletador, true)}</time></div>`).join('') : '<div class="empty-state compact"><p>Nenhum objeto confirmado.</p></div>'}</div></section>`;
}
function openModal(id) { $(id).classList.add('show'); $(id).setAttribute('aria-hidden', 'false'); if (id === 'scannerModal') startScanner(); }
function closeModal(id) { $(id).classList.remove('show'); $(id).setAttribute('aria-hidden', 'true'); if (id === 'scannerModal') stopScanner(); }
async function startScanner() {
  const info = $('scannerSupport');
  if (!navigator.mediaDevices?.getUserMedia) { info.textContent = 'A câmera não está disponível neste navegador. Use a digitação manual.'; return; }
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    $('scannerVideo').srcObject = scannerStream; await $('scannerVideo').play();
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => { if (!scannerStream) return; try { const found = await detector.detect($('scannerVideo')); if (found?.length) { await scanCode(found[0].rawValue); return; } } catch (_) {} scannerTimer = requestAnimationFrame(loop); };
      loop(); info.textContent = 'Câmera ativa. A leitura será confirmada automaticamente.';
    } else info.textContent = 'Leitura automática indisponível neste navegador. Use a digitação manual.';
  } catch (_) { info.textContent = 'Não foi possível abrir a câmera. Autorize o acesso ou use a digitação manual.'; }
}
function stopScanner() { if (scannerTimer) cancelAnimationFrame(scannerTimer); scannerTimer = null; if (scannerStream) { scannerStream.getTracks().forEach((track) => track.stop()); scannerStream = null; } if ($('scannerVideo')) $('scannerVideo').srcObject = null; }
async function fileToDataUrl(file) { if (!file) return ''; return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
async function saveDivergence(event) {
  event.preventDefault(); const type = $('divType').value; const photo = $('divPhoto').files[0];
  if (['pacote_sem_etiqueta', 'pacote_danificado'].includes(type) && !photo) { toast('Inclua uma foto para este tipo de divergência.', 'error'); return; }
  showLoading('Registrando divergência...');
  try { await Api.registerCollectorDivergence({ coleta_id: current?.coleta?.coleta_id || '', unidade_id: current?.coleta?.unidade_id || '', tipo_divergencia: type, descricao_divergencia: $('divDescription').value.trim(), foto_base64: await fileToDataUrl(photo), decisao_operacional: 'deixar_no_local', coletador_id: coletadorId }); closeModal('divergenceModal'); $('divergenceForm').reset(); if (current) { current = await Api.getColetaDetail(current.coleta.coleta_id); renderExecution(); } toast('Divergência registrada.', 'success'); }
  catch (error) { toast(error.message, 'error'); }
  finally { hideLoading(); }
}
function bindActions() {
  document.querySelectorAll('.collector-bottom-nav button').forEach((button) => { button.onclick = () => { tab = button.dataset.tab; if (tab === 'home') loadHome(); if (tab === 'active') loadActive(); if (tab === 'history') loadHistory(); }; });
  document.querySelectorAll('[data-close-modal]').forEach((button) => { button.onclick = () => closeModal(button.dataset.closeModal); });
  $('divergenceForm').addEventListener('submit', saveDivergence);
  $('divType').addEventListener('change', () => { $('photoRequiredLabel').textContent = ['pacote_sem_etiqueta', 'pacote_danificado'].includes($('divType').value) ? 'obrigatória' : 'opcional'; });
  document.body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return; const action = button.dataset.action;
    if (action === 'reload') loadHome();
    if (action === 'start') startCollection(button);
    if (action === 'open-history') openHistoryCollection(button.dataset.id);
    if (action === 'back-home') loadHome();
    if (action === 'back-history') loadHistory();
    if (action === 'back-execution') renderExecution();
    if (action === 'open-scanner') openModal('scannerModal');
    if (action === 'scan-manual') scanCode($('manualCode').value);
    if (action === 'open-divergence') openModal('divergenceModal');
    if (action === 'finish') finish();
    if (action === 'confirm-finish') confirmFinish();
  });
  $('logoutButton').onclick = () => auth.logout().then(() => auth.redirectToLogin('login'));
}
function boot() {
  user = auth.getCachedUser() || auth.getLocalSession()?.user || {};
  coletadorId = String(user.username || user.displayName || 'COLETADOR').trim();
  $('internalUserName').textContent = user.displayName || user.username || 'Usuário';
  bindActions(); loadHome();
}
if (document.documentElement.classList.contains('agf-auth-ready')) boot(); else window.addEventListener('agf:auth-ready', boot, { once: true });
