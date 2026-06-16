import { Api } from '../services/api.js';
import { APP_CONFIG } from './config.js';

const auth = window.AgfAuth;
const $ = (id) => document.getElementById(id);
const state = {
  tab: 'dashboard', unidades: [], lotes: [], reversas: [], coletas: [], divergencias: [], params: [], coletadores: [],
  mapsPromise: null, map: null, geocoder: null, coletaCollectorFilter: '', coletaStatusFilter: 'ativas', coletaOriginFilter: '',
  objetoStatusFilter: '', objetoUnitFilter: '', objetoSearchFilter: '', alertSeverityFilter: 'all', expedicaoTab: 'receber', expedicao: null, expeditionScanner: null,
  dashboard: null, dashboardAlerts: [], dataLoadedAt: 0, dataTtlMs: 12000
};

function showLoading(text) { $('loadingText').textContent = text || 'Carregando...'; $('loading').classList.add('show'); }
function hideLoading() { $('loading').classList.remove('show'); }
function toast(message, type = 'info') { const el = $('toast'); el.textContent = message; el.style.background = type === 'error' ? '#B91C1C' : type === 'success' ? '#15803D' : '#1F2937'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3600); }
function label(key) { return String(key || '').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function dt(v) { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString('pt-BR'); }
function todayLabel() { return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date()).replace(/^./,c=>c.toUpperCase()); }
function dateOnly(v) { if (!v) return ''; const d=new Date(v); return isNaN(d)?'':d.toLocaleDateString('pt-BR'); }
function copyText(text) { if (!text) return; navigator.clipboard?.writeText(String(text)).then(()=>toast('Copiado para a área de transferência.')).catch(()=>toast('Não foi possível copiar.','error')); }

function unitPublicUrl(u) {
  const slug = String(u?.slug_unidade || u?.codigo_unidade || u?.unidade_id || '').trim();
  return `${location.origin}/reverso/?slug=${encodeURIComponent(slug)}`;
}
function unitQrImageUrl(u, size = 1200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&margin=24&data=${encodeURIComponent(unitPublicUrl(u))}`;
}
function fileSafeName(text) {
  return String(text || 'unidade').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'unidade';
}

function unitLogoValue(unit = {}) {
  return String(
    unit.logo_unidade_url || unit.logo_url || unit.url_logo_unidade || unit.url_logo || unit.logo_marca_url || unit.logo || ''
  ).trim();
}
function isUsableLogo(value) {
  return /^(data:image\/|https?:\/\/|\.\/|\/)/i.test(String(value || '').trim());
}
function previewUnitLogoHtml(value) {
  return isUsableLogo(value)
    ? `<img src="${safe(value)}" alt="Logo da unidade" class="unit-logo-preview-img">`
    : '<span class="material-symbols-rounded">image</span><small>Nenhuma logo cadastrada</small>';
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo da logo.'));
    reader.readAsDataURL(file);
  });
}
function resizeLogoDataUrl(file, maxW = 720, maxH = 260) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!/^image\//i.test(file.type || '')) return reject(new Error('Envie uma imagem PNG, JPG, WEBP ou SVG.'));
    if ((file.type || '').includes('svg')) return readFileAsDataUrl(file).then(resolve).catch(reject);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a logo.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl;
        try { dataUrl = canvas.toDataURL('image/webp', 0.82); }
        catch (_) { dataUrl = canvas.toDataURL('image/png'); }
        if (dataUrl.length > 48000) {
          try { dataUrl = canvas.toDataURL('image/jpeg', 0.78); }
          catch (_) {}
        }
        if (dataUrl.length > 49000) return reject(new Error('A logo ficou grande demais. Use uma imagem menor ou mais simples.'));
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function etiquetaQrValue(label = {}) {
  return String(label.qr_payload || label.qr_value || label.codigo_etiqueta || label.codigo_manual_curto || label.etiqueta_id || '').trim();
}
function etiquetaQrImageUrl(label = {}, size = 900) {
  const value = etiquetaQrValue(label);
  if (!value) return String(label.qr_image_url || '').trim();
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&margin=36&ecc=M&data=${encodeURIComponent(value)}`;
}
function etiquetaCode(label = {}) {
  return label.codigo_manual_curto || label.codigo_etiqueta || label.etiqueta_id || '';
}
function safe(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m])); }
function badge(v) { const cls = String(v || 'info').replaceAll('_','-'); return `<span class="badge ${cls}">${label(v || '-')}</span>`; }
function currentUserId() { const u = auth.getCachedUser?.() || auth.getLocalSession?.()?.user || {}; return u.username || u.email || u.displayName || 'AGF'; }
function mount(html) { $('screenMount').innerHTML = html; }
function selectUnitOptions(selected='') { return state.unidades.map(u => `<option value="${safe(u.unidade_id)}" ${u.unidade_id===selected?'selected':''}>${safe(u.nome_unidade)} (${safe(u.unidade_id)})</option>`).join(''); }
function collectorLabel(id) { const key=String(id||'').trim(); if(!key) return 'Não atribuído'; const found=state.coletadores.find(c=>c.username===key); return found ? `${found.displayName || found.username} (${found.username})` : key; }
function collectorOptions(selected='', includeBlank=true) { const blank=includeBlank?'<option value="">Sem coletador definido</option>':''; return blank+state.coletadores.map(c=>`<option value="${safe(c.username)}" ${String(c.username)===String(selected||'')?'selected':''}>${safe(c.displayName || c.username)} (${safe(c.username)})</option>`).join(''); }
async function loadCollectors() { const refs=[currentUserId(),...state.unidades.map(u=>u.coletador_padrao_id),...state.coletas.map(c=>c.coletador_id_atual||c.coletador_id)].filter(Boolean).map(String); try { const response=await auth.adminListUsers(); const users=response.users||[]; const map=new Map(users.filter(u=>u.active!==false && (u.apps||[]).map(String).includes('reverso-coleta')).map(u=>[String(u.username||'').trim(),{username:String(u.username||'').trim(),displayName:u.displayName||u.username}])); refs.forEach(username=>{if(!map.has(username))map.set(username,{username,displayName:username})}); state.coletadores=[...map.values()].filter(u=>u.username); } catch (_) { const ids=new Set(refs); state.coletadores=[...ids].map(username=>({username,displayName:username})); } }
function iconButton(icon, title, attrs='') { return `<button class="mini-icon-btn" type="button" title="${safe(title)}" aria-label="${safe(title)}" ${attrs}><span class="material-symbols-rounded">${safe(icon)}</span></button>`; }
function table(headers, rows, empty='Sem dados para exibir.') {
  if (!rows || !rows.length) return `<div class="empty-state"><span class="material-symbols-rounded">inbox</span><strong>${empty}</strong></div>`;
  return `<div class="table-wrap"><table class="admin-table"><thead><tr>${headers.map(h=>`<th>${h.label}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows.map(row=>`<tr>${headers.map(h=>`<td>${h.render ? h.render(row) : safe(row[h.key])}</td>`).join('')}<td>${row.actions || ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function invalidateDataCache() { state.dataLoadedAt = 0; }
async function loadAll(force = false) {
  const fresh = state.dataLoadedAt && (Date.now() - state.dataLoadedAt < state.dataTtlMs);
  if (!force && fresh && state.unidades.length) return;
  const data = await Api.getAdminBootstrap({ force: force ? '1' : '' });
  state.dashboard = data.dashboard || { resumo: {} };
  state.unidades = data.unidades || [];
  state.lotes = data.lotes || [];
  state.reversas = data.reversas || [];
  state.coletas = data.coletas || [];
  state.divergencias = data.divergencias || [];
  state.dataLoadedAt = Date.now();
  await loadCollectors();
}

function mapsKeyConfigured() {
  const key = String(APP_CONFIG.GOOGLE_MAPS_API_KEY || '').trim();
  return key && !key.includes('COLE_AQUI');
}

function loadGoogleMaps() {
  if (!mapsKeyConfigured()) return Promise.reject(new Error('Chave do Google Maps ainda não configurada.'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (state.mapsPromise) return state.mapsPromise;
  state.mapsPromise = new Promise((resolve, reject) => {
    const cb = `__reversoMapsReady_${Date.now()}`;
    window[cb] = () => { delete window[cb]; resolve(window.google.maps); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(APP_CONFIG.GOOGLE_MAPS_API_KEY)}&callback=${cb}`;
    s.async = true; s.defer = true;
    s.onerror = () => reject(new Error('Não foi possível carregar o Google Maps. Confira a chave e as restrições de domínio.'));
    document.head.appendChild(s);
  });
  return state.mapsPromise;
}

function fullAddress(u) {
  return [u.endereco, u.numero, u.complemento, u.bairro, u.cidade, u.uf, u.cep].filter(Boolean).join(', ');
}

async function geocodeAddress(address) {
  if (!address) return null;
  const maps = await loadGoogleMaps();
  state.geocoder = state.geocoder || new maps.Geocoder();
  return new Promise(resolve => state.geocoder.geocode({ address }, (results, status) => {
    if (status !== 'OK' || !results?.[0]) return resolve(null);
    const loc = results[0].geometry.location;
    resolve({ latitude: loc.lat(), longitude: loc.lng(), formatted_address: results[0].formatted_address });
  }));
}

async function geocodeAndPersistMissingUnits() {
  if (!mapsKeyConfigured()) return;
  const missing = state.unidades.filter(u => (!u.latitude || !u.longitude) && fullAddress(u)).slice(0, 8);
  for (const u of missing) {
    try {
      const pos = await geocodeAddress(fullAddress(u));
      if (!pos) continue;
      u.latitude = pos.latitude; u.longitude = pos.longitude;
      await Api.updateUnidade({ unidade_id: u.unidade_id, latitude: pos.latitude, longitude: pos.longitude, ator_id: currentUserId() });
    } catch (_) { /* unidade continua disponível sem marcador */ }
  }
}

async function initDashboardMap() {
  const host = $('unitsMap');
  const msg = $('unitsMapMessage');
  if (!host) return;
  if (!mapsKeyConfigured()) {
    host.classList.add('map-placeholder');
    host.innerHTML = '<span class="material-symbols-rounded">map</span><strong>Mapa aguardando chave do Google Maps</strong><small>Cole a nova chave em <code>/reverso-admin/js/config.js</code>.</small>';
    return;
  }
  try {
    const maps = await loadGoogleMaps();
    await geocodeAndPersistMissingUnits();
    const valid = state.unidades.filter(u => Number.isFinite(Number(u.latitude)) && Number.isFinite(Number(u.longitude)));
    if (!valid.length) {
      host.classList.add('map-placeholder');
      host.innerHTML = '<span class="material-symbols-rounded">location_off</span><strong>Nenhuma unidade posicionada</strong><small>Cadastre um endereço completo ou informe latitude e longitude.</small>';
      return;
    }
    const center = { lat: Number(valid[0].latitude), lng: Number(valid[0].longitude) };
    state.map = new maps.Map(host, { center, zoom: valid.length > 1 ? 12 : 15, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
    const bounds = new maps.LatLngBounds();
    valid.forEach(u => {
      const position = { lat: Number(u.latitude), lng: Number(u.longitude) };
      bounds.extend(position);
      const marker = new maps.Marker({ position, map: state.map, title: u.nome_unidade });
      const s = u.status_ponto || {};
      const info = new maps.InfoWindow({ content: `<div class="map-info"><strong>${safe(u.nome_unidade)}</strong><br>${safe(fullAddress(u))}<br>Pendentes: <b>${Number(s.pacotes_pendentes||0)}</b><br>Ocupação: <b>${Number(s.ocupacao_pct||0)}%</b><br>Etiquetas: <b>${Number(s.etiquetas_disponiveis||0)}</b></div>` });
      marker.addListener('click', () => info.open({ anchor: marker, map: state.map }));
    });
    if (valid.length > 1) state.map.fitBounds(bounds, 40);
    if (msg) msg.textContent = `${valid.length} unidade(s) posicionada(s).`;
  } catch (err) {
    host.classList.add('map-placeholder');
    host.innerHTML = `<span class="material-symbols-rounded">warning</span><strong>Mapa indisponível</strong><small>${safe(err.message)}</small>`;
  }
}

function startOfWeek(date = new Date()) {
  const d = new Date(date); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff); d.setHours(0,0,0,0); return d;
}
function dateKey(v) { const d = new Date(v); if (isNaN(d)) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function renderWeekCalendar() {
  const monday = startOfWeek();
  const days = Array.from({ length: 5 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate()+i); return d; });
  return `<div class="week-calendar">${days.map(d => {
    const key = dateKey(d); const items = state.coletas.filter(c => dateKey(c.data_coleta_programada || c.data_criacao) === key);
    return `<article class="calendar-day"><div class="calendar-day-head"><strong>${d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</strong><span>${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span></div><div class="calendar-items">${items.length ? items.map(c=>`<div class="calendar-item"><b>${safe(c.nome_unidade||c.unidade_id)}</b><small>${badge(c.status_coleta)}</small></div>`).join('') : '<small class="calendar-empty">Sem coleta</small>'}</div></article>`;
  }).join('')}</div>`;
}

function metricValue(stats, key) { return Number(stats?.[key] || 0); }
function occupancyTone(percent) { const n = Number(percent || 0); return n >= 90 ? 'critical' : n >= 70 ? 'high' : n >= 40 ? 'medium' : 'low'; }
function occupancyMeter(percent) {
  const value = Math.max(0, Math.min(100, Number(percent || 0)));
  const tone = occupancyTone(value);
  return `<div class="occupancy-meter ${tone}" title="Ocupação ${value}%"><div class="occupancy-track"><span style="width:${value}%"></span></div><strong>${value}%</strong></div>`;
}
function controlMetric(icon, labelText, value, tone='navy', hint='') {
  return `<article class="control-metric tone-${tone}"><span class="control-metric-icon material-symbols-rounded">${safe(icon)}</span><div class="control-metric-copy"><small>${safe(labelText)}</small><strong>${safe(value)}</strong>${hint ? `<em>${safe(hint)}</em>` : ''}</div></article>`;
}
function renderControlStrip(stats) {
  return `<section class="control-strip" aria-label="Resumo operacional">
    <article class="control-cluster cluster-flow"><header><span class="material-symbols-rounded">monitoring</span><div><strong>Fluxo do dia</strong><small>Movimentações registradas hoje</small></div></header><div class="control-cluster-grid cols-4">
      ${controlMetric('package_2','Criadas',metricValue(stats,'reversas_criadas_hoje'),'navy')}
      ${controlMetric('task_alt','Drop-offs',metricValue(stats,'dropoffs_confirmados_hoje'),'cyan')}
      ${controlMetric('local_shipping','Coletadas',metricValue(stats,'reversas_coletadas_hoje'),'yellow')}
      ${controlMetric('outbox','Postadas',metricValue(stats,'reversas_postadas_hoje'),'green')}
    </div></article>
    <article class="control-cluster cluster-queue"><header><span class="material-symbols-rounded">radar</span><div><strong>Fila operacional</strong><small>Itens que exigem acompanhamento</small></div></header><div class="control-cluster-grid cols-3">
      ${controlMetric('schedule_send','Aguardando coleta',metricValue(stats,'reversas_aguardando_coleta'),'purple')}
      ${controlMetric('qr_code_scanner','QRs sem confirmação',metricValue(stats,'etiquetas_lidas_nao_confirmadas'),'orange')}
      ${controlMetric('report','Divergências',metricValue(stats,'divergencias_abertas'),'red')}
    </div></article>
    <article class="control-cluster cluster-health"><header><span class="material-symbols-rounded">health_and_safety</span><div><strong>Saúde da rede</strong><small>Capacidade e abastecimento</small></div></header><div class="control-cluster-grid cols-2">
      ${controlMetric('warning','Unidades em alerta',metricValue(stats,'unidades_em_alerta'), metricValue(stats,'unidades_em_alerta') ? 'red' : 'green')}
      ${controlMetric('qr_code_2','Etiquetas disponíveis',metricValue(stats,'etiquetas_disponiveis'),'green')}
    </div></article>
  </section>`;
}
function alertItem(message, severity='warn', icon='warning') {
  return `<div class="ops-alert severity-${severity}"><span class="material-symbols-rounded">${safe(icon)}</span><div><strong>${severity === 'critical' ? 'Crítico' : severity === 'info' ? 'Informação' : 'Atenção'}</strong><p>${safe(message)}</p></div></div>`;
}

function buildDashboardAlerts() {
  const alertas = [];
  state.unidades.forEach(u => {
    const st = u.status_ponto || {};
    if (st.status_ocupacao === 'indisponivel') alertas.push({ severity:'critical', icon:'error', text:`Unidade ${u.nome_unidade} indisponível: ocupação ${st.ocupacao_pct}%` });
    else if (['atencao','quase_cheio'].includes(st.status_ocupacao)) alertas.push({ severity:'warn', icon:'warning', text:`Unidade ${u.nome_unidade} com ocupação ${st.ocupacao_pct}%` });
    if (Number(st.etiquetas_disponiveis || 0) === 0) alertas.push({ severity:'critical', icon:'qr_code_2', text:`Unidade ${u.nome_unidade} sem etiquetas disponíveis` });
    else if (Number(st.etiquetas_disponiveis || 0) <= 5) alertas.push({ severity:'warn', icon:'qr_code_2', text:`Unidade ${u.nome_unidade} com poucas etiquetas disponíveis` });
  });
  state.reversas.filter(r => r.status_reversa === 'dropoff_realizado').forEach(r => {
    if (r.data_limite_operacional && new Date(r.data_limite_operacional) < new Date()) alertas.push({ severity:'critical', icon:'schedule', text:`Objeto ${r.reversa_id} fora do prazo operacional` });
  });
  return alertas;
}
function updateAlertPanel() {
  const alertas = state.dashboardAlerts || [];
  const visible = alertas.filter(a => state.alertSeverityFilter === 'all' || a.severity === state.alertSeverityFilter);
  const warnCount = alertas.filter(a => a.severity === 'warn').length;
  const criticalCount = alertas.filter(a => a.severity === 'critical').length;
  const list = $('opsAlertList');
  if (list) list.innerHTML = visible.length ? visible.slice(0,12).map(a => alertItem(a.text,a.severity,a.icon)).join('') : `<div class="ops-alert severity-info"><span class="material-symbols-rounded">check_circle</span><div><strong>Operação normal</strong><p>Nenhum alerta deste tipo no momento.</p></div></div>`;
  if ($('warnAlertCount')) $('warnAlertCount').textContent = `${warnCount} atenção`;
  if ($('criticalAlertCount')) $('criticalAlertCount').textContent = `${criticalCount} crítico${criticalCount===1?'':'s'}`;
  if ($('alertSeverityFilter')) $('alertSeverityFilter').value = state.alertSeverityFilter;
}
async function renderDashboard(force = false) {
  showLoading('Atualizando painel...');
  try {
    await loadAll(force);
    const stats = state.dashboard?.resumo || {};
    const proximas = state.unidades.filter(u => Number(u?.status_ponto?.pacotes_pendentes || 0) > 0).slice(0, 8);
    state.dashboardAlerts = buildDashboardAlerts();
    mount(`
      ${renderControlStrip(stats)}
      <div class="admin-grid-2 top-gap dashboard-attention-grid">
        <section class="card operations-card"><div class="card-head"><div><h2 class="card-title">Próximas coletas necessárias</h2><p class="card-subtitle">Unidades com objetos aguardando retirada.</p></div><span class="panel-kpi">${proximas.length} ponto(s)</span></div>${table([
          {key:'nome_unidade',label:'Unidade'}, {key:'status_ponto',label:'Pendentes',render:r=>r.status_ponto?.pacotes_pendentes||0}, {key:'status_ponto',label:'Ocupação',render:r=>occupancyMeter(r.status_ponto?.ocupacao_pct||0)}, {key:'status_ponto',label:'Status',render:r=>badge(r.status_ponto?.status_ocupacao||'normal')}
        ], proximas.map(u=>({...u, actions:`<button class="btn btn-ghost btn-sm" data-open-coleta="${u.unidade_id}"><span class="material-symbols-rounded">local_shipping</span>Abrir coleta</button>`})), 'Nenhuma unidade com coleta pendente.')}</section>
        <section class="card alerts-card"><div class="card-head alerts-head"><div><h2 class="card-title">Alertas operacionais</h2><p class="card-subtitle">Pontos que exigem atenção.</p></div><div class="alert-controls"><span id="warnAlertCount" class="alert-kpi warn"></span><span id="criticalAlertCount" class="alert-kpi critical"></span><select id="alertSeverityFilter" class="input compact-select" aria-label="Filtrar alertas"><option value="all">Todos os alertas</option><option value="warn">Atenção</option><option value="critical">Crítico</option></select></div></div><div id="opsAlertList" class="ops-alert-list"></div></section>
      </div>
      <div class="admin-grid-2 top-gap dashboard-map-calendar">
        <section class="card map-control-card"><div class="card-head"><div><h2 class="card-title">Mapa das unidades</h2><p class="card-subtitle" id="unitsMapMessage">Endereços cadastrados e pontos georreferenciados.</p></div><span class="panel-icon material-symbols-rounded">map</span></div><div id="unitsMap" class="units-map"></div></section>
        <section class="card calendar-control-card"><div class="card-head"><div><h2 class="card-title">Agenda semanal de coletas</h2><p class="card-subtitle">Visão simples de segunda a sexta-feira.</p></div><span class="panel-icon material-symbols-rounded">calendar_month</span></div>${renderWeekCalendar()}</section>
      </div>
      <section class="card top-gap units-summary-card"><div class="card-head"><div><h2 class="card-title">Resumo por unidade</h2><p class="card-subtitle">Capacidade, etiquetas e pendências.</p></div><span class="panel-kpi">${state.unidades.length} unidade(s)</span></div>${renderUnidadesTable(state.unidades, false)}</section>`);
    $('alertSeverityFilter')?.addEventListener('change',e=>{state.alertSeverityFilter=e.target.value;updateAlertPanel()});
    updateAlertPanel();
    bindCommonActions(); initDashboardMap();
  } catch (err) { toast(err.message || 'Falha ao carregar painel.', 'error'); } finally { hideLoading(); }
}

function renderUnidadesTable(items, withActions=true) {
  return table([
    {key:'nome_unidade',label:'Unidade'}, {key:'tipo_unidade',label:'Tipo',render:r=>label(r.tipo_unidade)}, {key:'status_unidade',label:'Status',render:r=>badge(r.status_unidade)},
    {key:'status_ponto',label:'Pendentes',render:r=>r.status_ponto?.pacotes_pendentes||0}, {key:'status_ponto',label:'Ocupação',render:r=>occupancyMeter(r.status_ponto?.ocupacao_pct||0)},
    {key:'status_ponto',label:'Etiquetas',render:r=>r.status_ponto?.etiquetas_disponiveis||0}, {key:'coletador_padrao_id',label:'Coletador responsável',render:r=>safe(collectorLabel(r.coletador_padrao_id))}, {key:'prazo_coleta_dias_uteis',label:'Prazo'}
  ], items.map(u=>({...u, actions: withActions
      ? `<div class="table-actions">${iconButton('edit','Editar unidade',`data-edit-unit="${safe(u.unidade_id)}"`)}${iconButton('qr_code_2','QR Code da unidade',`data-qr-unit="${safe(u.unidade_id)}"`)}${iconButton('local_shipping','Abrir coleta',`data-open-coleta="${safe(u.unidade_id)}"`)}</div>`
      : `${iconButton('visibility','Gerenciar unidade',`data-manage-unit="${u.unidade_id}"`)}${iconButton('qr_code_2','QR Code da unidade',`data-qr-unit="${safe(u.unidade_id)}"`)}${iconButton('local_shipping','Abrir coleta',`data-open-coleta="${u.unidade_id}"`)}`
  })), 'Nenhuma unidade cadastrada.');
}

async function renderUnidades() {
  showLoading('Carregando unidades...');
  try { const res = await Api.listUnidades(); state.unidades = res.items || []; await loadCollectors();
    mount(`<section class="card"><div class="card-head"><div><h2 class="card-title">Unidades</h2><p class="card-subtitle">Edifícios, condomínios e pontos parceiros.</p></div><button class="btn btn-primary btn-sm" id="btnNewUnit"><span class="material-symbols-rounded">add</span>Nova unidade</button></div><div id="unitFormWrap" class="hidden"></div>${renderUnidadesTable(state.unidades)}</section>`);
    $('btnNewUnit')?.addEventListener('click',()=>showUnitForm()); bindCommonActions();
  } catch(err){ toast(err.message||'Falha ao carregar unidades.','error'); } finally{ hideLoading(); }
}

function showUnitForm(unit={}) {
  const wrap = $('unitFormWrap'); if (!wrap) return; wrap.classList.remove('hidden');
  wrap.innerHTML = `<form id="unitForm" class="admin-form card-soft"><div class="form-grid">
    <label class="field"><span class="field-label">Nome da unidade</span><input class="input" name="nome_unidade" value="${safe(unit.nome_unidade)}" required></label>
    <label class="field"><span class="field-label">Código</span><input class="input" name="codigo_unidade" value="${safe(unit.codigo_unidade)}" required></label>
    <label class="field"><span class="field-label">Slug</span><input class="input" name="slug_unidade" value="${safe(unit.slug_unidade)}" required></label>
    <label class="field"><span class="field-label">Tipo</span><select class="input" name="tipo_unidade"><option value="edificio_comercial">Edifício comercial</option><option value="condominio_residencial">Condomínio residencial</option><option value="centro_empresarial">Centro empresarial</option><option value="outro">Outro</option></select></label>
    <label class="field"><span class="field-label">Status</span><select class="input" name="status_unidade"><option value="ativa">Ativa</option><option value="manutencao">Manutenção</option><option value="bloqueada">Bloqueada</option><option value="inativa">Inativa</option></select></label>
    <label class="field"><span class="field-label">Coletador responsável</span><select class="input" name="coletador_padrao_id">${collectorOptions(unit.coletador_padrao_id || '')}</select></label>
    <div class="field unit-logo-field col-span-2">
      <span class="field-label">Logo da unidade <small>(opcional)</small></span>
      <div class="unit-logo-uploader">
        <div class="unit-logo-preview" id="unitLogoPreview">${previewUnitLogoHtml(unitLogoValue(unit))}</div>
        <div class="unit-logo-actions">
          <input type="hidden" name="logo_unidade_url" id="unitLogoData" value="${safe(unitLogoValue(unit))}">
          <label class="btn btn-ghost btn-sm" for="unitLogoFile"><span class="material-symbols-rounded">upload</span>Enviar logo</label>
          <input id="unitLogoFile" class="visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
          <button class="btn btn-ghost btn-sm" type="button" id="btnRemoveUnitLogo"><span class="material-symbols-rounded">delete</span>Remover</button>
          <small>A logo substitui o nome da unidade nas telas do usuário. Use PNG/WEBP com fundo transparente sempre que possível.</small>
        </div>
      </div>
    </div>
    <label class="field"><span class="field-label">Prazo coleta (dias úteis)</span><input class="input" name="prazo_coleta_dias_uteis" type="number" min="0" value="${safe(unit.prazo_coleta_dias_uteis||2)}"></label>
    <label class="field"><span class="field-label">Capacidade objetos</span><input class="input" name="capacidade_max_pacotes" type="number" min="0" value="${safe(unit.capacidade_max_pacotes||30)}"></label>
    <label class="field"><span class="field-label">Alerta ocupação %</span><input class="input" name="nivel_alerta_ocupacao_pct" type="number" min="0" value="${safe(unit.nivel_alerta_ocupacao_pct||80)}"></label>
    <label class="field col-span-2"><span class="field-label">Endereço</span><input class="input" name="endereco" value="${safe(unit.endereco)}"></label>
    <label class="field"><span class="field-label">Número</span><input class="input" name="numero" value="${safe(unit.numero)}"></label>
    <label class="field"><span class="field-label">Complemento</span><input class="input" name="complemento" value="${safe(unit.complemento)}"></label>
    <label class="field"><span class="field-label">Bairro</span><input class="input" name="bairro" value="${safe(unit.bairro)}"></label>
    <label class="field"><span class="field-label">Cidade</span><input class="input" name="cidade" value="${safe(unit.cidade||'Fortaleza')}" required></label>
    <label class="field"><span class="field-label">UF</span><input class="input" name="uf" value="${safe(unit.uf||'CE')}" required></label>
    <label class="field"><span class="field-label">CEP</span><input class="input" name="cep" value="${safe(unit.cep)}"></label>
    <label class="field"><span class="field-label">Telefone suporte</span><input class="input" name="telefone_suporte" value="${safe(unit.telefone_suporte)}"></label>
    <label class="field"><span class="field-label">Latitude <small>(automática)</small></span><input class="input" name="latitude" value="${safe(unit.latitude)}"></label>
    <label class="field"><span class="field-label">Longitude <small>(automática)</small></span><input class="input" name="longitude" value="${safe(unit.longitude)}"></label>
    <label class="field col-span-2"><span class="field-label">Mensagem ao usuário</span><textarea class="textarea" name="mensagem_usuario">${safe(unit.mensagem_usuario)}</textarea></label>
  </div><div class="actions top-gap"><button class="btn btn-primary" type="submit">Salvar unidade</button><button class="btn btn-ghost" type="button" id="btnCancelUnit">Cancelar</button></div></form>`;
  if (unit.tipo_unidade) wrap.querySelector('[name="tipo_unidade"]').value = unit.tipo_unidade;
  if (unit.status_unidade) wrap.querySelector('[name="status_unidade"]').value = unit.status_unidade;
  $('unitLogoFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      showLoading('Preparando logo...');
      const dataUrl = await resizeLogoDataUrl(file);
      $('unitLogoData').value = dataUrl;
      $('unitLogoPreview').innerHTML = previewUnitLogoHtml(dataUrl);
      toast('Logo carregada. Clique em Salvar unidade para confirmar.', 'success');
    } catch (err) {
      toast(err.message || 'Não foi possível carregar a logo.', 'error');
      event.target.value = '';
    } finally { hideLoading(); }
  });
  $('btnRemoveUnitLogo')?.addEventListener('click', () => {
    $('unitLogoData').value = '';
    $('unitLogoPreview').innerHTML = previewUnitLogoHtml('');
    const file = $('unitLogoFile'); if (file) file.value = '';
    toast('Logo removida do formulário. Clique em Salvar unidade para confirmar.');
  });
  $('btnCancelUnit')?.addEventListener('click',()=>wrap.classList.add('hidden'));
  $('unitForm')?.addEventListener('submit', async e=>{
    e.preventDefault(); const payload = Object.fromEntries(new FormData(e.currentTarget).entries()); if (unit.unidade_id) payload.unidade_id = unit.unidade_id; payload.ator_id = currentUserId();
    try {
      showLoading('Salvando unidade...');
      if ((!payload.latitude || !payload.longitude) && mapsKeyConfigured() && fullAddress(payload)) { const pos = await geocodeAddress(fullAddress(payload)); if (pos) { payload.latitude = pos.latitude; payload.longitude = pos.longitude; } }
      unit.unidade_id ? await Api.updateUnidade(payload) : await Api.createUnidade(payload); toast('Unidade salva.'); renderUnidades();
    } catch(err){ toast(err.message||'Erro ao salvar unidade.','error'); } finally{ hideLoading(); }
  });
}

function labelCard(l) { return `<section class="preview-label"><div class="preview-brand">REVERSO AGF</div><div class="preview-rule">1 ETIQUETA = 1 OBJETO = 1 AUTORIZAÇÃO</div><div class="preview-qr-frame"><img src="${safe(etiquetaQrImageUrl(l, 720))}" alt="QR Code"></div><div class="preview-code">${safe(etiquetaCode(l))}</div></section>`; }
function closeModal() { $('adminModal')?.remove(); }
function openModal(title, content, actions='') { closeModal(); document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="adminModal"><section class="modal-card"><header class="modal-head"><div><h2>${safe(title)}</h2></div><button class="mini-icon-btn" type="button" data-close-modal aria-label="Fechar"><span class="material-symbols-rounded">close</span></button></header><div class="modal-body">${content}</div>${actions ? `<footer class="modal-actions">${actions}</footer>` : ''}</section></div>`); document.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click', closeModal)); $('adminModal')?.addEventListener('click',e=>{if(e.target.id==='adminModal')closeModal();}); }

function openUnitQrModal(unidadeId) {
  const unit = state.unidades.find(u => String(u.unidade_id) === String(unidadeId));
  if (!unit) return toast('Unidade não encontrada.', 'error');
  const link = unitPublicUrl(unit);
  const img = unitQrImageUrl(unit, 900);
  openModal('QR Code da unidade', `
    <div class="unit-qr-modal">
      <div class="unit-qr-preview"><img src="${safe(img)}" alt="QR Code da unidade ${safe(unit.nome_unidade)}"></div>
      <div class="unit-qr-info">
        <span class="material-symbols-rounded">apartment</span>
        <div><strong>${safe(unit.nome_unidade)}</strong><small>${safe(fullAddress(unit) || unit.slug_unidade || '')}</small></div>
      </div>
      <label class="field top-gap"><span class="field-label">Link do QR Code</span><input class="input" id="unitQrLink" value="${safe(link)}" readonly></label>
      <p class="unit-qr-note">Use este QR Code nas artes, placas e materiais da unidade. Ao escanear, o usuário entra no aplicativo com a unidade preenchida automaticamente.</p>
    </div>
  `, `<button class="btn btn-primary" data-download-unit-qr="${safe(unit.unidade_id)}"><span class="material-symbols-rounded">download</span>Baixar PNG</button><button class="btn btn-ghost" data-copy-unit-link="${safe(unit.unidade_id)}"><span class="material-symbols-rounded">content_copy</span>Copiar link</button><button class="btn btn-ghost" data-print-unit-qr="${safe(unit.unidade_id)}"><span class="material-symbols-rounded">print</span>Imprimir</button>`);
  document.querySelector('[data-download-unit-qr]')?.addEventListener('click', () => downloadUnitQrPng(unit.unidade_id));
  document.querySelector('[data-copy-unit-link]')?.addEventListener('click', () => copyText(link));
  document.querySelector('[data-print-unit-qr]')?.addEventListener('click', () => printUnitQr(unit.unidade_id));
}
async function downloadUnitQrPng(unidadeId) {
  const unit = state.unidades.find(u => String(u.unidade_id) === String(unidadeId));
  if (!unit) return toast('Unidade não encontrada.', 'error');
  const url = unitQrImageUrl(unit, 1600);
  const fileName = `QR_Unidade_${fileSafeName(unit.nome_unidade || unit.slug_unidade)}.png`;
  try {
    showLoading('Gerando PNG...');
    const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao gerar QR Code.');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
    toast('PNG do QR Code baixado.', 'success');
  } catch (err) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    toast('Abrimos o QR Code em uma nova aba para salvar o PNG.', 'info');
  } finally { hideLoading(); }
}
function printUnitQr(unidadeId) {
  const unit = state.unidades.find(u => String(u.unidade_id) === String(unidadeId));
  if (!unit) return toast('Unidade não encontrada.', 'error');
  const w = window.open('', '_blank');
  if (!w) return toast('O navegador bloqueou a janela de impressão.', 'error');
  const link = unitPublicUrl(unit);
  const img = unitQrImageUrl(unit, 1200);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR ${safe(unit.nome_unidade)}</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#0f172a;text-align:center}h1{font-size:22px;margin:0 0 8px;color:#00416B}.muted{color:#64748b;font-size:12px;margin:0 0 22px}.qr{width:90mm;height:90mm;margin:0 auto 16px;object-fit:contain}.link{font-size:11px;word-break:break-all;border:1px solid #d9e4ee;border-radius:10px;padding:10px;margin:0 auto;max-width:160mm}.footer{position:fixed;bottom:12mm;left:18mm;right:18mm;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:8px}</style></head><body><h1>QR Code da unidade</h1><p class="muted">${safe(unit.nome_unidade)}</p><img class="qr" src="${safe(img)}"><div class="link">${safe(link)}</div><div class="footer">AGF JOSÉ BONIFÁCIO</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
  w.document.close();
}

async function viewLote(loteId) { try { showLoading('Carregando etiquetas disponíveis...'); const data=await Api.getLotePrintData(loteId); openModal(`Etiquetas disponíveis — ${data.lote.codigo_lote}`, data.total ? `<div class="preview-grid">${data.labels.map(labelCard).join('')}</div>` : '<div class="empty-state">Nenhuma etiqueta disponível neste lote.</div>', `<button class="btn btn-primary" data-modal-print-lote="${safe(loteId)}">Imprimir disponíveis</button>`); document.querySelector('[data-modal-print-lote]')?.addEventListener('click',()=>printLote(loteId)); } catch(err){toast(err.message,'error')} finally{hideLoading()} }
async function viewEtiqueta(etiquetaId) { try { showLoading('Carregando etiqueta...'); const data=await Api.getEtiquetaPrintData(etiquetaId); openModal(`Etiqueta ${data.label.codigo_manual_curto || data.label.codigo_etiqueta}`, `<div class="single-label-wrap">${labelCard(data.label)}</div><div class="top-gap">${badge(data.label.status_etiqueta)}</div>`, `<button class="btn btn-primary" data-modal-print-label="${safe(etiquetaId)}">Imprimir etiqueta</button>`); document.querySelector('[data-modal-print-label]')?.addEventListener('click',()=>printEtiqueta(etiquetaId)); } catch(err){toast(err.message,'error')} finally{hideLoading()} }

async function renderEtiquetas() {
  showLoading('Carregando lotes...');
  try { await loadAll(); const etiquetas = await Api.listEtiquetas({ limit: 500 });
    mount(`<section class="card"><div class="card-head"><div><h2 class="card-title">Etiquetas e lotes</h2><p class="card-subtitle">Gere QR Codes únicos e imprima etiquetas quadradas de 50 × 50 mm.</p></div></div>
      <form id="loteForm" class="admin-form compact-form"><label class="field"><span class="field-label">Unidade</span><select class="input" name="unidade_id" required>${selectUnitOptions()}</select></label><label class="field"><span class="field-label">Quantidade</span><input class="input" type="number" min="1" max="300" name="quantidade" value="20" required></label><label class="field"><span class="field-label">Prefixo opcional</span><input class="input" name="prefixo_etiqueta" placeholder="Ex.: EDM"></label><button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">qr_code_2</span>Gerar lote</button></form>
      <h3 class="subsection-title">Lotes</h3>${table([
        {key:'codigo_lote',label:'Lote'}, {key:'nome_unidade',label:'Unidade'}, {key:'qtde_gerada',label:'Geradas'}, {key:'qtde_disponivel',label:'Disponíveis'}, {key:'qtde_lida',label:'Lidas'}, {key:'qtde_confirmada_dropoff',label:'Drop-off'}, {key:'qtde_coletada',label:'Coletadas'}, {key:'status_lote',label:'Status',render:r=>badge(r.status_lote)}
      ], state.lotes.map(l=>({...l, actions:`<div class="table-actions">${iconButton('visibility','Visualizar etiquetas do lote',`data-view-labels="${safe(l.lote_id)}"`)}${iconButton('print','Imprimir etiquetas disponíveis do lote',`data-print-lote="${safe(l.lote_id)}"`)}</div>`})), 'Nenhum lote gerado.')}
      <h3 class="subsection-title">Etiquetas recentes</h3>${table([
        {key:'codigo_etiqueta',label:'Código'}, {key:'nome_unidade',label:'Unidade'}, {key:'codigo_lote',label:'Lote'}, {key:'status_etiqueta',label:'Status',render:r=>badge(r.status_etiqueta)}, {key:'reversa_id',label:'Objeto'}
      ], (etiquetas.items||[]).slice(0,100).map(e=>({...e, actions:`${iconButton('visibility','Visualizar etiqueta',`data-view-label="${safe(e.etiqueta_id)}"`)}${iconButton('print','Imprimir etiqueta',`data-print-label="${safe(e.etiqueta_id)}"`)}`})), 'Nenhuma etiqueta.')}
    </section>`);
    $('loteForm')?.addEventListener('submit', async e=>{ e.preventDefault(); const payload=Object.fromEntries(new FormData(e.currentTarget).entries()); payload.ator_id=currentUserId(); try{ showLoading('Gerando lote...'); const r=await Api.generateLoteEtiquetas(payload); toast(`Lote ${r.lote_id} gerado.`); invalidateDataCache(); await renderEtiquetas(); }catch(err){ toast(err.message||'Erro ao gerar lote.','error'); }finally{ hideLoading(); }});
    bindCommonActions();
  } catch(err){ toast(err.message||'Falha ao carregar etiquetas.','error'); } finally{ hideLoading(); }
}

function printHtml(labels, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safe(title)}</title><style>@page{size:50mm 50mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#071f35}.no-print{padding:10px;background:#fff;border-bottom:1px solid #ddd}.no-print button{padding:9px 14px;border:0;border-radius:9px;background:#00416B;color:white;font-weight:700}.roll{width:50mm}.label{width:50mm;height:50mm;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-after:always;break-after:page;overflow:hidden}.brand{font-size:7pt;font-weight:800;text-align:center;letter-spacing:.01em}.rule{font-size:4.25pt;font-weight:700;text-align:center;margin-top:.7mm;white-space:nowrap}.qr-frame{width:32mm;height:32mm;background:#fff;padding:1.8mm;margin:1.2mm 0 .8mm;display:grid;place-items:center}.qr-frame img{display:block;width:100%;height:100%;object-fit:contain;image-rendering:pixelated}.code{font-size:6.7pt;font-weight:800;text-align:center;line-height:1.02;overflow-wrap:anywhere;max-width:45mm}@media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()">Imprimir / Salvar em PDF</button> <strong>${safe(title)}</strong></div><main class="roll">${labels.map(l=>`<section class="label"><div class="brand">REVERSO AGF</div><div class="rule">1 ETIQUETA = 1 OBJETO = 1 AUTORIZAÇÃO</div><div class="qr-frame"><img src="${safe(etiquetaQrImageUrl(l, 900))}" alt="QR"></div><div class="code">${safe(etiquetaCode(l))}</div></section>`).join('')}</main></body></html>`;
}
function openPrintWindow(labels,title) { const w=window.open('','_blank'); if(!w)return toast('Permita pop-ups para abrir a impressão.','error'); w.document.open(); w.document.write(printHtml(labels,title)); w.document.close(); }
async function printLote(loteId) { try { showLoading('Preparando etiquetas disponíveis...'); const data=await Api.getLotePrintData(loteId); if(!data.labels?.length)return toast('Este lote não possui etiquetas disponíveis para impressão.','error'); openPrintWindow(data.labels,`${data.total} etiqueta(s) — ${data.lote.codigo_lote}`); } catch(err){toast(err.message||'Erro ao preparar impressão.','error')} finally{hideLoading()} }
async function printEtiqueta(etiquetaId) { try { showLoading('Preparando etiqueta...'); const data=await Api.getEtiquetaPrintData(etiquetaId); openPrintWindow([data.label],`Etiqueta ${data.label.codigo_manual_curto||data.label.codigo_etiqueta}`); } catch(err){toast(err.message||'Erro ao preparar impressão.','error')} finally{hideLoading()} }

async function viewReversaDetail(reversaId) {
  try {
    showLoading('Carregando detalhe do objeto...');
    const data = await Api.getReversaDetail(reversaId);
    const r = data.reversa || {}; const u = data.usuario || {}; const unit = data.unidade || {}; const events = data.eventos || [];
    openModal(`Objeto ${r.reversa_id || reversaId}`, `<div class="detail-grid"><div><span>Unidade</span><strong>${safe(unit.nome_unidade || r.unidade_id)}</strong></div><div><span>Usuário</span><strong>${safe(u.nome || r.usuario_id)}</strong></div><div><span>Etiqueta</span><strong>${safe(data.etiqueta?.codigo_etiqueta || r.etiqueta_id)}</strong></div><div><span>Autorização</span><strong>${safe(r.codigo_autorizacao)}</strong></div><div><span>Status</span><strong>${badge(r.status_reversa)}</strong></div><div><span>Prazo operacional</span><strong>${dt(r.data_limite_operacional)}</strong></div></div><h3 class="subsection-title">Linha do tempo</h3><div class="timeline">${events.length ? events.sort((a,b)=>new Date(a.data_hora_evento||0)-new Date(b.data_hora_evento||0)).map(e=>`<div class="timeline-item"><strong>${label(e.tipo_evento)}</strong><small>${dt(e.data_hora_evento)}</small><span>${safe(e.descricao_evento||'')}</span></div>`).join('') : '<div class="empty-state">Nenhum evento registrado.</div>'}</div>`);
  } catch(err) { toast(err.message || 'Falha ao carregar detalhe.', 'error'); } finally { hideLoading(); }
}

function objetoStatusOptions(selected='') { return ['','criada','aguardando_confirmacao_dropoff','dropoff_realizado','aguardando_coleta_agf','coletada_agf','recebida_agencia','postada','concluida','divergencia','cancelada'].map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v?label(v):'Todos os status'}</option>`).join(''); }
function collectionStatusOptions(selected='ativas') { return [['ativas','Ativas'],['','Todos os status'],['aberta','Aberta'],['em_andamento','Em andamento'],['concluida','Concluída'],['concluida_com_divergencia','Concluída com divergência'],['cancelada','Cancelada']].map(([v,t])=>`<option value="${v}" ${v===selected?'selected':''}>${t}</option>`).join(''); }
function collectionOriginOptions(selected='') { return [['','Todas as origens'],['automatica_unidade','Automática da unidade'],['manual_admin','Manual pelo Admin'],['espontanea_coletador','Espontânea pelo coletador']].map(([v,t])=>`<option value="${v}" ${v===selected?'selected':''}>${t}</option>`).join(''); }
function filterObjects(items) { const q=state.objetoSearchFilter.toLowerCase(); return (items||[]).filter(r=>(!state.objetoStatusFilter||r.status_reversa===state.objetoStatusFilter)&&(!state.objetoUnitFilter||r.unidade_id===state.objetoUnitFilter)&&(!q||[r.reversa_id,r.nome_usuario,r.codigo_etiqueta,r.codigo_autorizacao,r.codigo_sro].some(v=>String(v||'').toLowerCase().includes(q)))); }
async function renderObjetos() {
  showLoading('Carregando objetos...'); try { const res=await Api.listReversas({limit:500}); state.reversas=res.items||[]; const visible=filterObjects(state.reversas);
    mount(`<section class="card"><div class="card-head"><div><h2 class="card-title">Objetos</h2><p class="card-subtitle">Jornada completa dos objetos de logística reversa.</p></div><span class="panel-kpi">${visible.length} objeto(s)</span></div><div class="filter-bar object-filter-bar"><label class="field"><span class="field-label">Unidade</span><select class="input" id="objUnitFilter"><option value="">Todas as unidades</option>${selectUnitOptions(state.objetoUnitFilter)}</select></label><label class="field"><span class="field-label">Status</span><select class="input" id="objStatusFilter">${objetoStatusOptions(state.objetoStatusFilter)}</select></label><label class="field filter-grow"><span class="field-label">Buscar objeto</span><input class="input" id="objSearchFilter" value="${safe(state.objetoSearchFilter)}" placeholder="Objeto, usuário, etiqueta, autorização ou SRO"></label><button class="btn btn-ghost btn-sm filter-clear" id="objClearFilters" type="button"><span class="material-symbols-rounded">filter_alt_off</span>Limpar</button></div>${table([
      {key:'data_criacao',label:'Criado em',render:r=>dt(r.data_criacao)}, {key:'nome_unidade',label:'Unidade'}, {key:'nome_usuario',label:'Usuário'}, {key:'codigo_etiqueta',label:'Etiqueta'}, {key:'codigo_autorizacao',label:'Autorização'}, {key:'codigo_sro',label:'SRO',render:r=>safe(r.codigo_sro||'-')}, {key:'status_reversa',label:'Status',render:r=>badge(r.status_reversa)}
    ], visible.map(r=>({...r,actions:`<div class="table-actions">${iconButton('visibility','Ver detalhes',`data-reversa-detail="${r.reversa_id}"`)}</div>`})), 'Nenhum objeto registrado.')}</section>`);
    $('objUnitFilter')?.addEventListener('change',e=>{state.objetoUnitFilter=e.target.value;renderObjetos()}); $('objStatusFilter')?.addEventListener('change',e=>{state.objetoStatusFilter=e.target.value;renderObjetos()}); $('objSearchFilter')?.addEventListener('input',e=>{state.objetoSearchFilter=e.target.value;}); $('objSearchFilter')?.addEventListener('keydown',e=>{if(e.key==='Enter')renderObjetos()}); $('objClearFilters')?.addEventListener('click',()=>{state.objetoUnitFilter='';state.objetoStatusFilter='';state.objetoSearchFilter='';renderObjetos()}); bindCommonActions();
  } catch(err){toast(err.message||'Falha ao carregar objetos.','error')} finally{hideLoading()} }

function coletaActionButtons(c){ const status=String(c.status_coleta||''); const parts=[]; if(['aberta','em_andamento'].includes(status)) parts.push(iconButton('swap_horiz','Transferir coleta',`data-transfer-coleta="${safe(c.coleta_id)}"`)); if(status==='em_andamento') parts.push(iconButton('task_alt','Fechar coleta',`data-close-coleta="${safe(c.coleta_id)}"`)); parts.push(iconButton('visibility','Ver detalhes',`data-coleta-detail="${safe(c.coleta_id)}"`)); return `<div class="table-actions">${parts.join('')}</div>`; }
function filterCollections(items){ return (items||[]).filter(c=>(!state.coletaCollectorFilter||String(c.coletador_id_atual||c.coletador_id||'')===String(state.coletaCollectorFilter)) && (!state.coletaOriginFilter||String(c.origem_coleta||'')===state.coletaOriginFilter) && (state.coletaStatusFilter==='ativas'?['aberta','em_andamento'].includes(String(c.status_coleta||'')):(!state.coletaStatusFilter||String(c.status_coleta||'')===state.coletaStatusFilter))); }
async function renderColetas(force = false) {
  showLoading('Carregando coletas...'); try { await loadAll(force); const visible=filterCollections(state.coletas); mount(`<section class="card"><div class="card-head"><div><h2 class="card-title">Coletas</h2><p class="card-subtitle">Retiradas físicas nos pontos parceiros e responsáveis atribuídos.</p></div><span class="panel-kpi">${visible.length} coleta(s)</span></div><form id="openColetaForm" class="admin-form compact-form coleta-open-form"><label class="field"><span class="field-label">Unidade</span><select class="input" name="unidade_id" required>${selectUnitOptions()}</select></label><label class="field"><span class="field-label">Coletador</span><select class="input" name="coletador_id">${collectorOptions('',true)}</select></label><button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">add</span>Abrir coleta</button></form><div class="filter-bar coleta-filter-bar"><label class="field"><span class="field-label">Coletador</span><select class="input" id="filterCollector"><option value="">Todos os coletadores</option>${collectorOptions(state.coletaCollectorFilter,false)}</select></label><label class="field"><span class="field-label">Status</span><select class="input" id="filterColetaStatus">${collectionStatusOptions(state.coletaStatusFilter)}</select></label><label class="field"><span class="field-label">Origem</span><select class="input" id="filterColetaOrigin">${collectionOriginOptions(state.coletaOriginFilter)}</select></label></div>${table([
    {key:'coleta_id',label:'Coleta'}, {key:'nome_unidade',label:'Unidade'}, {key:'data_coleta_programada',label:'Programada',render:r=>dt(r.data_coleta_programada)}, {key:'coletador_id_atual',label:'Coletador',render:r=>safe(collectorLabel(r.coletador_id_atual||r.coletador_id))}, {key:'origem_coleta',label:'Origem',render:r=>label(r.origem_coleta||'-')}, {key:'qtde_prevista',label:'Prevista'}, {key:'qtde_coletada',label:'Coletada'}, {key:'status_coleta',label:'Status',render:r=>badge(r.status_coleta)}
  ], visible.map(c=>({...c,actions:coletaActionButtons(c)})), 'Nenhuma coleta encontrada para estes filtros.')}</section>`);
  $('filterCollector')?.addEventListener('change',e=>{state.coletaCollectorFilter=e.target.value;renderColetas()}); $('filterColetaStatus')?.addEventListener('change',e=>{state.coletaStatusFilter=e.target.value;renderColetas()}); $('filterColetaOrigin')?.addEventListener('change',e=>{state.coletaOriginFilter=e.target.value;renderColetas()});
  $('openColetaForm')?.addEventListener('submit',async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.ator_id=currentUserId();try{showLoading('Abrindo coleta...');const r=await Api.openColeta(payload);toast(`Coleta ${r.coleta_id} aberta.`);invalidateDataCache();renderColetas(true)}catch(err){toast(err.message||'Erro ao abrir coleta.','error')}finally{hideLoading()}}); bindCommonActions();
  } catch(err){toast(err.message||'Falha ao carregar coletas.','error')} finally{hideLoading()} }

function openTransferModal(coletaId) {
  const coleta=state.coletas.find(c=>String(c.coleta_id)===String(coletaId)); if(!coleta)return;
  document.getElementById('transferModal')?.remove();
  const modal=document.createElement('div'); modal.id='transferModal'; modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal-card transfer-modal"><div class="modal-head"><div><h2>Transferir coleta</h2><p class="card-subtitle">${safe(coleta.coleta_id)} · ${safe(coleta.nome_unidade||coleta.unidade_id)}</p></div><button class="mini-icon-btn" type="button" data-close-transfer><span class="material-symbols-rounded">close</span></button></div><form id="transferForm" class="modal-body admin-form"><div class="transfer-summary"><span class="material-symbols-rounded">person_pin_circle</span><div><small>Responsável atual</small><strong>${safe(collectorLabel(coleta.coletador_id_atual||coleta.coletador_id))}</strong></div></div><label class="field"><span class="field-label">Novo coletador</span><select class="input" name="novo_coletador_id" required>${collectorOptions('',false)}</select></label><label class="field"><span class="field-label">Motivo da transferência ${String(coleta.status_coleta)==='em_andamento'?'<small>(obrigatório)</small>':''}</span><textarea class="textarea" name="motivo_transferencia" ${String(coleta.status_coleta)==='em_andamento'?'required':''} placeholder="Explique de forma objetiva."></textarea></label><div class="modal-actions"><button class="btn btn-ghost" type="button" data-close-transfer>Cancelar</button><button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">swap_horiz</span>Confirmar transferência</button></div></form></div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close-transfer]').forEach(b=>b.onclick=()=>modal.remove());
  modal.querySelector('#transferForm').onsubmit=async(e)=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.coleta_id=coleta.coleta_id;payload.transferido_por=currentUserId();try{showLoading('Transferindo coleta...');await Api.transferColeta(payload);modal.remove();toast('Coleta transferida com sucesso.');invalidateDataCache();renderColetas(true)}catch(err){toast(err.message||'Erro ao transferir coleta.','error')}finally{hideLoading()}};
}


function expStageButton(key,text,icon,count){return `<button class="exp-tab ${state.expedicaoTab===key?'is-active':''}" data-exp-tab="${key}"><span class="material-symbols-rounded">${icon}</span><span>${text}</span><b>${Number(count||0)}</b></button>`;}
function expTable(items,stage){ if(stage==='receber') return table([{key:'data_coleta_agf',label:'Coletado em',render:r=>dt(r.data_coleta_agf)},{key:'nome_unidade',label:'Unidade'},{key:'coletador_id',label:'Coletador',render:r=>safe(collectorLabel(r.coletador_id))},{key:'codigo_etiqueta',label:'Etiqueta'},{key:'nome_usuario',label:'Usuário'},{key:'status_reversa',label:'Status',render:r=>badge(r.status_reversa)}],items.map(r=>({...r,actions:`<div class="table-actions">${iconButton('qr_code_scanner','Confirmar recebimento',`data-exp-receive-one="${safe(r.codigo_etiqueta)}"`)}${iconButton('visibility','Ver objeto',`data-reversa-detail="${safe(r.reversa_id)}"`)}</div>`})),'Nenhum objeto aguardando recebimento.'); if(stage==='postar') return table([{key:'data_recebimento_agencia',label:'Recebido em',render:r=>dt(r.data_recebimento_agencia)},{key:'nome_unidade',label:'Unidade'},{key:'nome_usuario',label:'Usuário'},{key:'codigo_etiqueta',label:'Etiqueta'},{key:'codigo_autorizacao',label:'Autorização'},{key:'status_reversa',label:'Status',render:r=>badge(r.status_reversa)}],items.map(r=>({...r,actions:`<div class="table-actions">${iconButton('outbox','Informar SRO e postar',`data-exp-post="${safe(r.reversa_id)}"`)}${iconButton('visibility','Ver objeto',`data-reversa-detail="${safe(r.reversa_id)}"`)}</div>`})),'Nenhum objeto na fila de postagem.'); return table([{key:'data_postagem',label:'Postado em',render:r=>dt(r.data_postagem)},{key:'nome_usuario',label:'Usuário'},{key:'nome_unidade',label:'Unidade'},{key:'codigo_etiqueta',label:'Etiqueta'},{key:'codigo_sro',label:'SRO'},{key:'comunicacao_email_enviada',label:'E-mail',render:r=>badge(r.comunicacao_email_enviada==='SIM'?'enviado':'pendente')},{key:'comunicacao_whatsapp_status',label:'WhatsApp',render:r=>badge(r.comunicacao_whatsapp_status||'pendente')}],items.map(r=>({...r,actions:`<div class="table-actions">${iconButton('content_copy','Copiar SRO',`data-copy-sro="${safe(r.codigo_sro)}"`)}${iconButton('travel_explore','Abrir rastreamento',`data-track-url="${safe(r.rastreamento_url)}"`)}${iconButton('mail','Reenviar e-mail',`data-exp-resend="${safe(r.reversa_id)}"`)}${r.whatsapp_url?iconButton('chat','Enviar WhatsApp',`data-exp-whatsapp="${safe(r.reversa_id)}" data-whatsapp-url="${safe(r.whatsapp_url)}"`):iconButton('chat','WhatsApp indisponível: usuário sem telefone cadastrado','disabled')}</div>`})),'Nenhum objeto postado.'); }
async function renderExpedicao(){showLoading('Carregando expedição...');try{state.expedicao=await Api.listExpedicao({limit:1000});const d=state.expedicao||{resumo:{},receber:[],fila_postagem:[],postados:[]};const items=state.expedicaoTab==='receber'?d.receber:state.expedicaoTab==='postar'?d.fila_postagem:d.postados;mount(`<section class="card expedition-card"><div class="card-head"><div><h2 class="card-title">Expedição</h2><p class="card-subtitle">Conferência de entrada, postagem e comunicação de rastreio.</p></div>${state.expedicaoTab==='receber'?'<button class="btn btn-success btn-sm" id="btnExpScanner"><span class="material-symbols-rounded">qr_code_scanner</span>Confirmar recebimento</button>':''}</div><div class="exp-tabs">${expStageButton('receber','Receber objetos','qr_code_scanner',d.resumo?.aguardando_recebimento)}${expStageButton('postar','Fila de postagem','outbox',d.resumo?.fila_postagem)}${expStageButton('postados','Postados','task_alt',d.resumo?.postados_hoje)}</div><div class="exp-progress-card"><span class="material-symbols-rounded">package_2</span><div><strong>${Number(d.resumo?.aguardando_recebimento||0)} objeto(s) aguardando conferência</strong><small>A baixa é automática a cada leitura do QR Code.</small></div></div>${expTable(items,state.expedicaoTab)}</section>`);document.querySelectorAll('[data-exp-tab]').forEach(b=>b.onclick=()=>{state.expedicaoTab=b.dataset.expTab;renderExpedicao()});$('btnExpScanner')?.addEventListener('click',openExpeditionScanner);bindCommonActions();}catch(err){toast(err.message||'Falha ao carregar expedição.','error')}finally{hideLoading()}}
function renderExpeditionScannerModal(){document.getElementById('expeditionScannerModal')?.remove();const modal=document.createElement('div');modal.id='expeditionScannerModal';modal.className='modal-backdrop';modal.innerHTML=`<div class="modal-card expedition-scanner-modal"><div class="modal-head"><div><h2>Confirmar recebimento</h2><p class="card-subtitle">Leia os QR Codes continuamente. Cada bipe dá baixa em um objeto.</p></div><button class="mini-icon-btn" type="button" data-exp-close><span class="material-symbols-rounded">close</span></button></div><div class="scanner-box"><video id="expScannerVideo" playsinline muted></video><div class="scanner-line"></div></div><div id="expScannerStatus" class="notice notice-info">Preparando câmera...</div><form id="expManualForm" class="manual-exp-row"><input class="input" id="expManualCode" placeholder="Digite o código manual da etiqueta"><button class="btn btn-success" type="submit"><span class="material-symbols-rounded">check</span>Confirmar</button></form><div class="exp-session"><b id="expSessionCount">0</b><span>objeto(s) conferido(s) nesta sessão</span></div></div>`;document.body.appendChild(modal);modal.querySelector('[data-exp-close]').onclick=closeExpeditionScanner;modal.querySelector('#expManualForm').onsubmit=e=>{e.preventDefault();receiveExpeditionCode($('expManualCode').value)};return modal;}
async function openExpeditionScanner(){renderExpeditionScannerModal();state.expeditionScanner={stream:null,timer:null,busy:false,count:0};const status=$('expScannerStatus');if(!navigator.mediaDevices?.getUserMedia){status.textContent='Câmera indisponível. Use a digitação manual.';return}try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});state.expeditionScanner.stream=stream;$('expScannerVideo').srcObject=stream;await $('expScannerVideo').play();if('BarcodeDetector'in window){const detector=new BarcodeDetector({formats:['qr_code']});const loop=async()=>{if(!state.expeditionScanner?.stream)return;try{if(!state.expeditionScanner.busy){const found=await detector.detect($('expScannerVideo'));if(found?.length)await receiveExpeditionCode(found[0].rawValue)}}catch(_){}state.expeditionScanner.timer=requestAnimationFrame(loop)};loop();status.textContent='Câmera ativa. A baixa acontece automaticamente após cada leitura.'}else status.textContent='Leitura automática indisponível. Use a digitação manual.'}catch(_){status.textContent='Não foi possível abrir a câmera. Autorize o acesso ou use a digitação manual.'}}
function closeExpeditionScanner(){const sc=state.expeditionScanner;if(sc?.timer)cancelAnimationFrame(sc.timer);if(sc?.stream)sc.stream.getTracks().forEach(t=>t.stop());state.expeditionScanner=null;document.getElementById('expeditionScannerModal')?.remove();renderExpedicao()}
function parseEtiquetaCode(raw){const text=String(raw||'').trim();if(!text)return'';try{const url=new URL(text);return url.searchParams.get('etiqueta')||text}catch(_){return text}}
async function receiveExpeditionCode(raw){const sc=state.expeditionScanner;if(sc?.busy)return;const code=parseEtiquetaCode(raw);if(!code)return toast('Informe o código da etiqueta.','error');const now=Date.now();if(sc?.lastCode===code&&now-(sc.lastAt||0)<1800)return;if(sc){sc.busy=true;sc.lastCode=code;sc.lastAt=now}try{const result=await Api.receiveObjetoAgencia({codigo_etiqueta:code,ator_id:currentUserId()});if(sc){if(!result.already_received)sc.count+=1;if($('expSessionCount'))$('expSessionCount').textContent=sc.count}if($('expManualCode'))$('expManualCode').value='';if($('expScannerStatus')){$('expScannerStatus').className=`notice ${result.already_received?'notice-warn':'notice-ok'}`;$('expScannerStatus').textContent=result.already_received?'Este objeto já foi conferido na agência.':`Objeto ${result.objeto_id} recebido com sucesso.`}toast(result.already_received?'Objeto já conferido.':'Recebimento confirmado.','success');await new Promise(r=>setTimeout(r,800));if(!sc)renderExpedicao()}catch(err){if($('expScannerStatus')){$('expScannerStatus').className='notice notice-warn';$('expScannerStatus').textContent=err.message}toast(err.message,'error');await new Promise(r=>setTimeout(r,900))}finally{if(sc)sc.busy=false}}
function openPostObjectModal(reversaId){const obj=(state.expedicao?.fila_postagem||[]).find(x=>String(x.reversa_id)===String(reversaId));if(!obj)return;document.getElementById('postObjectModal')?.remove();const modal=document.createElement('div');modal.id='postObjectModal';modal.className='modal-backdrop';modal.innerHTML=`<div class="modal-card"><div class="modal-head"><div><h2>Confirmar postagem</h2><p class="card-subtitle">${safe(obj.nome_usuario)} · ${safe(obj.codigo_etiqueta)}</p></div><button class="mini-icon-btn" type="button" data-post-close><span class="material-symbols-rounded">close</span></button></div><form id="postObjectForm" class="modal-body admin-form"><label class="field"><span class="field-label">Código SRO de rastreamento</span><input class="input" name="codigo_sro" required placeholder="Ex.: XX123456789BR"></label><label class="field"><span class="field-label">Observação opcional</span><textarea class="textarea" name="observacao"></textarea></label><button class="btn btn-success" type="submit"><span class="material-symbols-rounded">outbox</span>Confirmar postagem</button></form></div>`;document.body.appendChild(modal);modal.querySelector('[data-post-close]').onclick=()=>modal.remove();modal.querySelector('#postObjectForm').onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.reversa_id=reversaId;payload.ator_id=currentUserId();try{showLoading('Confirmando postagem...');const r=await Api.postObjeto(payload);modal.remove();toast(r.email_enviado?'Postagem confirmada e e-mail enviado.':'Postagem confirmada. Verifique o e-mail cadastrado.','success');renderExpedicao()}catch(err){toast(err.message,'error')}finally{hideLoading()}}}

async function renderDivergencias() { showLoading('Carregando divergências...'); try { const res=await Api.listDivergencias({limit:500});state.divergencias=res.items||[];mount(`<section class="card"><div class="card-head"><div><h2 class="card-title">Divergências</h2><p class="card-subtitle">Problemas e exceções operacionais.</p></div><button class="btn btn-primary btn-sm" id="btnNewDiv">Nova divergência</button></div><div id="divFormWrap" class="hidden"></div>${table([{key:'data_abertura',label:'Abertura',render:r=>dt(r.data_abertura)},{key:'nome_unidade',label:'Unidade'},{key:'tipo_divergencia',label:'Tipo',render:r=>label(r.tipo_divergencia)},{key:'descricao_divergencia',label:'Descrição'},{key:'status_divergencia',label:'Status',render:r=>badge(r.status_divergencia)}],state.divergencias.map(d=>({...d,actions:''})),'Nenhuma divergência aberta.')}</section>`);$('btnNewDiv')?.addEventListener('click',()=>showDivForm()); } catch(err){toast(err.message||'Falha ao carregar divergências.','error')} finally{hideLoading()} }
function showDivForm(){const wrap=$('divFormWrap');wrap.classList.remove('hidden');wrap.innerHTML=`<form id="divForm" class="admin-form compact-form"><label class="field"><span class="field-label">Unidade</span><select class="input" name="unidade_id"><option value="">-</option>${selectUnitOptions()}</select></label><label class="field"><span class="field-label">Tipo</span><select class="input" name="tipo_divergencia"><option value="pacote_sem_etiqueta">Objeto sem etiqueta</option><option value="etiqueta_invalida">Etiqueta inválida</option><option value="pacote_nao_esperado">Objeto inesperado</option><option value="pacote_danificado">Objeto danificado</option><option value="etiqueta_nao_lida">Etiqueta não lida</option><option value="outro">Outro</option></select></label><label class="field col-span-2"><span class="field-label">Descrição</span><textarea class="textarea" name="descricao_divergencia" required></textarea></label><button class="btn btn-primary" type="submit">Salvar divergência</button></form>`;$('divForm')?.addEventListener('submit',async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());payload.ator_id=currentUserId();try{showLoading('Salvando...');await Api.createDivergencia(payload);toast('Divergência registrada.');renderDivergencias()}catch(err){toast(err.message||'Erro ao salvar.','error')}finally{hideLoading()}})}

async function renderConfig() { showLoading('Carregando configurações...'); try { const res=await Api.listParametros();state.params=res.items||[];mount(`<section class="card"><div class="card-head"><div><h2 class="card-title">Configurações</h2><p class="card-subtitle">Parâmetros editáveis do módulo Reverso.</p></div><a class="btn btn-ghost btn-sm" href="/agf/usuarios/">Usuários internos</a></div>${table([{key:'parametro',label:'Parâmetro'},{key:'valor',label:'Valor',render:r=>`<input class="input param-input" data-param="${safe(r.parametro)}" value="${safe(r.valor)}">`},{key:'descricao',label:'Descrição'},{key:'status_parametro',label:'Status',render:r=>badge(r.status_parametro)}],state.params.map(p=>({...p,actions:`<button class="btn btn-ghost btn-sm" data-save-param="${safe(p.parametro)}">Salvar</button>`})),'Nenhum parâmetro.')}</section>`);bindCommonActions(); } catch(err){toast(err.message||'Falha ao carregar configurações.','error')} finally{hideLoading()} }

function bindCommonActions(){
  document.querySelectorAll('[data-open-coleta]').forEach(btn=>btn.addEventListener('click',async()=>{try{showLoading('Abrindo coleta...');const r=await Api.openColeta({unidade_id:btn.dataset.openColeta,ator_id:currentUserId()});toast(`Coleta ${r.coleta_id} aberta.`);invalidateDataCache();renderColetas(true)}catch(err){toast(err.message,'error')}finally{hideLoading()}}));
  document.querySelectorAll('[data-manage-unit]').forEach(btn=>btn.addEventListener('click',async()=>{await renderTab('unidades');const u=state.unidades.find(x=>x.unidade_id===btn.dataset.manageUnit);if(u){showUnitForm(u);window.scrollTo({top:0,behavior:'smooth'})}}));
  document.querySelectorAll('[data-edit-unit]').forEach(btn=>btn.addEventListener('click',()=>{const u=state.unidades.find(x=>x.unidade_id===btn.dataset.editUnit);showUnitForm(u);window.scrollTo({top:0,behavior:'smooth'})}));
  document.querySelectorAll('[data-qr-unit]').forEach(btn=>btn.addEventListener('click',()=>openUnitQrModal(btn.dataset.qrUnit)));
  document.querySelectorAll('[data-print-lote]').forEach(btn=>btn.addEventListener('click',()=>printLote(btn.dataset.printLote)));
  document.querySelectorAll('[data-view-labels]').forEach(btn=>btn.addEventListener('click',()=>viewLote(btn.dataset.viewLabels)));
  document.querySelectorAll('[data-view-label]').forEach(btn=>btn.addEventListener('click',()=>viewEtiqueta(btn.dataset.viewLabel)));
  document.querySelectorAll('[data-print-label]').forEach(btn=>btn.addEventListener('click',()=>printEtiqueta(btn.dataset.printLabel)));
  document.querySelectorAll('[data-reversa-detail]').forEach(btn=>btn.addEventListener('click',()=>viewReversaDetail(btn.dataset.reversaDetail)));
  document.querySelectorAll('[data-coleta-detail]').forEach(btn=>btn.addEventListener('click',async()=>{try{showLoading('Carregando coleta...');const d=await Api.getColetaDetail(btn.dataset.coletaDetail);openModal(`Coleta ${safe(d.coleta?.coleta_id||'')}`,`<div class="detail-grid"><div><span>Unidade</span><strong>${safe(d.unidade?.nome_unidade||d.coleta?.unidade_id||'-')}</strong></div><div><span>Status</span><strong>${badge(d.coleta?.status_coleta)}</strong></div><div><span>Objetos previstos</span><strong>${Number(d.expected_count||0)}</strong></div><div><span>Objetos coletados</span><strong>${Number(d.scanned_count||0)}</strong></div></div>`)}catch(err){toast(err.message,'error')}finally{hideLoading()}}));
  document.querySelectorAll('[data-exp-receive-one]').forEach(btn=>btn.addEventListener('click',()=>receiveExpeditionCode(btn.dataset.expReceiveOne)));
  document.querySelectorAll('[data-exp-post]').forEach(btn=>btn.addEventListener('click',()=>openPostObjectModal(btn.dataset.expPost)));
  document.querySelectorAll('[data-copy-sro]').forEach(btn=>btn.addEventListener('click',()=>copyText(btn.dataset.copySro)));
  document.querySelectorAll('[data-track-url]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.trackUrl)window.open(btn.dataset.trackUrl,'_blank','noopener')}));
  document.querySelectorAll('[data-exp-resend]').forEach(btn=>btn.addEventListener('click',async()=>{try{showLoading('Reenviando e-mail...');await Api.resendPostedEmail({reversa_id:btn.dataset.expResend,ator_id:currentUserId()});toast('E-mail reenviado.','success')}catch(err){toast(err.message,'error')}finally{hideLoading()}}));
  document.querySelectorAll('[data-exp-whatsapp]').forEach(btn=>btn.addEventListener('click',async()=>{window.open(btn.dataset.whatsappUrl,'_blank','noopener');try{await Api.markWhatsAppSent({reversa_id:btn.dataset.expWhatsapp,ator_id:currentUserId()})}catch(_){}}));
  document.querySelectorAll('[data-transfer-coleta]').forEach(btn=>btn.addEventListener('click',()=>openTransferModal(btn.dataset.transferColeta)));
  document.querySelectorAll('[data-close-coleta]').forEach(btn=>btn.addEventListener('click',async()=>{try{showLoading('Fechando coleta...');await Api.closeColeta({coleta_id:btn.dataset.closeColeta,coletador_id:currentUserId()});toast('Coleta encerrada.');invalidateDataCache();renderColetas(true)}catch(err){toast(err.message,'error')}finally{hideLoading()}}));
  document.querySelectorAll('[data-save-param]').forEach(btn=>btn.addEventListener('click',async()=>{const input=document.querySelector(`.param-input[data-param="${CSS.escape(btn.dataset.saveParam)}"]`);try{showLoading('Salvando parâmetro...');await Api.updateParametro({parametro:btn.dataset.saveParam,valor:input.value});toast('Parâmetro salvo.')}catch(err){toast(err.message,'error')}finally{hideLoading()}}));
}

const renderers={dashboard:renderDashboard,unidades:renderUnidades,etiquetas:renderEtiquetas,objetos:renderObjetos,coletas:renderColetas,expedicao:renderExpedicao,divergencias:renderDivergencias,config:renderConfig};
async function renderTab(tab=state.tab){state.tab=tab;document.querySelectorAll('.admin-tab').forEach(b=>b.classList.toggle('is-active',b.dataset.tab===tab));await renderers[tab]();}
function boot(){const user=auth.getCachedUser()||auth.getLocalSession()?.user||{};$('internalUserName').textContent=user.displayName||user.username||'Usuário';if($('todayReference'))$('todayReference').textContent=todayLabel();$('btnRefresh').addEventListener('click',()=>{invalidateDataCache(); if(state.tab==='dashboard')renderDashboard(true); else renderTab();});$('logoutButton').addEventListener('click',async()=>{await auth.logout();auth.redirectToLogin('login')});document.getElementById('adminTabs')?.addEventListener('click',e=>{const btn=e.target.closest('[data-tab]');if(!btn)return;renderTab(btn.dataset.tab)});renderTab('dashboard');}
if(document.documentElement.classList.contains('agf-auth-ready'))boot();else window.addEventListener('agf:auth-ready',boot,{once:true});
