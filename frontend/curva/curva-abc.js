(function(global){
'use strict';

const WIDTHS_KEY='curvaAbcColumnWidthsV2';
const state={data:null,loading:false,error:'',promise:null,page:1,pageSize:25,sort:'priority',columnSort:{key:'',dir:'asc'},columnWidths:readColumnWidths(),filters:{search:'',curve:'',status:'',signal:'',priority:'',intermediary:'',cadastro:''}};
let apiGet=null,notify=()=>{};
const root=()=>document.getElementById('curvaAbcRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const num=v=>Number(v||0)||0;
const money=v=>num(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const integer=v=>Math.round(num(v)).toLocaleString('pt-BR');
const pct=v=>v==null?'—':`${num(v)*100>=0?'+':''}${(num(v)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const monthLabel=key=>{const m=text(key).match(/^(\d{4})-(\d{2})$/);return m?`${m[2]}/${m[1]}`:key;};
const priorityRank=v=>({'CRÍTICA':5,'CRITICA':5,'ALTA':4,'MÉDIA':3,'MEDIA':3,'OPORTUNIDADE':2,'BAIXA':1})[text(v).toUpperCase()]||0;
const curveRank=v=>({A:1,B:2,C:3})[text(v).toUpperCase()]||9;

function readColumnWidths(){
  try{return JSON.parse(global.localStorage&&global.localStorage.getItem(WIDTHS_KEY)||'{}')||{};}catch(_err){return {};}
}
function saveColumnWidths(){
  try{if(global.localStorage)global.localStorage.setItem(WIDTHS_KEY,JSON.stringify(state.columnWidths));}catch(_err){}
}
function columnSortValue(c,key){
  const monthMatch=text(key).match(/^month:(\d{4}-\d{2}):(qtd|value)$/);
  if(monthMatch)return num(c.months&&c.months[monthMatch[1]]&&c.months[monthMatch[1]][monthMatch[2]]);
  if(key==='client')return norm(c.client);
  if(key==='curve')return curveRank(c.curve);
  if(key==='status')return norm(c.status);
  if(key==='signal')return norm(c.signal);
  if(key==='priority')return priorityRank(c.priority);
  if(key==='totalQtd')return num(c.totals&&c.totals.qtd);
  if(key==='totalValue')return num(c.totals&&c.totals.value);
  if(key==='ticket')return num(c.totals&&c.totals.ticket);
  if(key==='intermediary')return norm(c.intermediary);
  if(key==='contract')return norm([c.contract,c.card].join(' '));
  if(key==='cadastro')return norm([c.cadastroStatus,c.loginPpn,c.cwsMessage].join(' '));
  if(key==='action')return norm(c.recommendedAction);
  return '';
}
function compareColumnValues(a,b,key,dir='asc'){
  const av=columnSortValue(a,key),bv=columnSortValue(b,key),factor=dir==='desc'?-1:1;
  if(typeof av==='number'&&typeof bv==='number')return(av-bv)*factor;
  return String(av).localeCompare(String(bv),'pt-BR',{numeric:true,sensitivity:'base'})*factor;
}

function init(options={}){
  apiGet=options.apiGet||apiGet;
  notify=options.toast||notify;
  render();
}

async function ensureLoaded(force=false){
  if(!apiGet)return;
  if(state.promise)return state.promise;
  if(state.data&&!force)return state.data;
  state.loading=true;state.error='';render();
  state.promise=(async()=>{
    try{
      const data=await apiGet('get_curva_abc_v1',{}, {timeoutMs:150000});
      state.data=data;state.page=1;state.error='';return data;
    }catch(err){
      state.error=err.message||String(err);notify(state.error,true);throw err;
    }finally{state.loading=false;state.promise=null;render();}
  })();
  return state.promise;
}

function refresh(){return ensureLoaded(true);}

function filteredClients(){
  const data=state.data||{},f=state.filters;
  const rows=(data.clients||[]).filter(c=>{
    if(f.search&&!norm([c.client,c.fantasy,c.contract,c.intermediary].join(' ')).includes(norm(f.search)))return false;
    if(f.curve&&text(c.curve)!==f.curve)return false;
    if(f.status&&text(c.status)!==f.status)return false;
    if(f.signal&&text(c.signal)!==f.signal)return false;
    if(f.priority&&text(c.priority)!==f.priority)return false;
    if(f.intermediary&&text(c.intermediary)!==f.intermediary)return false;
    if(f.cadastro&&text(c.cadastroStatus)!==f.cadastro)return false;
    return true;
  });
  return rows.sort((a,b)=>{
    if(state.sort==='column')return compareColumnValues(a,b,state.columnSort.key,state.columnSort.dir)||text(a.client).localeCompare(text(b.client),'pt-BR');
    if(state.sort==='client')return text(a.client).localeCompare(text(b.client),'pt-BR');
    if(state.sort==='value')return num(b.totals&&b.totals.value)-num(a.totals&&a.totals.value);
    if(state.sort==='curve')return text(a.curve).localeCompare(text(b.curve))||num(b.totals&&b.totals.value)-num(a.totals&&a.totals.value);
    return priorityRank(b.priority)-priorityRank(a.priority)||num(b.score)-num(a.score)||num(b.totals&&b.totals.value)-num(a.totals&&a.totals.value);
  });
}

function render(){
  const host=root();if(!host)return;
  if(state.loading&&!state.data){host.innerHTML=loadingHtml();return;}
  if(state.error&&!state.data){host.innerHTML=errorHtml();bind();return;}
  if(!state.data){host.innerHTML=loadingHtml('Preparando a Curva ABC…');return;}
  const data=state.data,rows=filteredClients(),pages=Math.max(1,Math.ceil(rows.length/state.pageSize));
  if(state.page>pages)state.page=pages;
  const start=(state.page-1)*state.pageSize,pageRows=rows.slice(start,start+state.pageSize);
  host.innerHTML=`
    ${headingHtml(data)}
    ${kpisHtml(data,rows)}
    <div class="abc-dashboard-grid">
      ${evolutionChartHtml(data.evolution||[])}
      ${newClientsChartHtml(data.evolution||[])}
      ${curveChartHtml(data.summary&&data.summary.curves||{})}
      ${rulesHtml(data)}
    </div>
    ${filtersHtml(data,rows.length)}
    ${tableHtml(data,pageRows,rows.length,start,pages)}
  `;
  bind();
}

function loadingHtml(label='Carregando indicadores e clientes…'){
  return `<div class="abc-loading"><span class="spinner"></span><strong>${esc(label)}</strong><small>A leitura é feita sem alterar a planilha.</small></div>`;
}
function errorHtml(){return `<div class="abc-error"><span class="material-symbols-rounded">error</span><div><strong>Não foi possível carregar a Curva ABC</strong><p>${esc(state.error)}</p><button class="secondary-btn" type="button" data-abc-retry>Tentar novamente</button></div></div>`;}

function headingHtml(data){
  const period=data.period||{},months=period.months||[],first=months[0],last=months[months.length-1];
  return `<div class="page-heading abc-heading"><div><p class="eyebrow">Gestão da carteira</p><h1>Curva ABC</h1><p>Faturamento, quantidade, sinais comerciais e situação cadastral dos últimos 12 meses.</p></div><div class="abc-heading-actions"><span class="abc-period"><span class="material-symbols-rounded">date_range</span>${esc(first&&first.label||'—')} a ${esc(last&&last.label||'—')}</span>${period.partial?'<span class="abc-partial"><span class="material-symbols-rounded">schedule</span>Mês atual parcial</span>':''}<button class="secondary-btn" type="button" data-abc-export><span class="material-symbols-rounded">download</span>Exportar CSV</button></div></div>`;
}

function kpisHtml(data,rows){
  const s=data.summary||{},last=(data.evolution||[]).slice(-1)[0]||{},filtered=rows.length!==(data.clients||[]).length;
  return `<div class="abc-kpis">
    ${kpi('Clientes',filtered?rows.length:s.clients,filtered?'no filtro atual':'na carteira','groups','blue')}
    ${kpi('Faturamento do mês',money(last.value),last.partial?'parcial até hoje':pct(last.valueChangePct)+' vs. mês anterior','payments','green')}
    ${kpi('Objetos no mês',integer(last.qtd),`${integer(last.activeClients)} clientes ativos`,'inventory_2','purple')}
    ${kpi('Novos no mês',integer(last.newClients),`regra: início a partir de ${monthLabel(data.rules&&data.rules.newFrom)}`,'person_add','orange')}
    ${kpi('Curvas A / B / C',`${num(s.curves&&s.curves.A)} / ${num(s.curves&&s.curves.B)} / ${num(s.curves&&s.curves.C)}`,'classificação dos 12 meses','leaderboard','navy')}
  </div>`;
}
function kpi(label,value,sub,icon,tone){return `<article class="abc-kpi abc-tone-${tone}"><span class="material-symbols-rounded">${esc(icon)}</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(sub)}</em></div></article>`;}

function evolutionChartHtml(items){
  const max=Math.max(1,...items.map(x=>num(x.value)));
  return `<article class="surface-card abc-chart abc-chart-wide"><div class="card-heading"><div><h2><span class="material-symbols-rounded">monitoring</span>Evolução do faturamento</h2><p>Comparação mensal da carteira inteira.</p></div></div><div class="abc-bars" role="img" aria-label="Faturamento mensal">${items.map(x=>`<div class="abc-bar-item${x.partial?' is-partial':''}" title="${esc(x.label)}: ${esc(money(x.value))}"><div class="abc-bar-value">${esc(compactMoney(x.value))}</div><div class="abc-bar-track"><i style="height:${Math.max(3,Math.round(num(x.value)/max*100))}%"></i></div><strong>${esc(shortMonth(x.label))}</strong><small class="${num(x.valueChangePct)<0?'down':'up'}">${esc(pct(x.valueChangePct))}</small></div>`).join('')}</div></article>`;
}
function newClientsChartHtml(items){
  const max=Math.max(1,...items.map(x=>num(x.newClients)));
  return `<article class="surface-card abc-chart"><div class="card-heading"><div><h2><span class="material-symbols-rounded">group_add</span>Novos clientes</h2><p>Primeira postagem observada a partir de 03/2026.</p></div></div><div class="abc-spark-bars">${items.map(x=>`<div title="${esc(x.label)}: ${num(x.newClients)} novo(s)"><i style="height:${Math.max(2,Math.round(num(x.newClients)/max*100))}%"></i><small>${esc(shortMonth(x.label))}</small><strong>${num(x.newClients)}</strong></div>`).join('')}</div></article>`;
}
function curveChartHtml(curves){
  const total=Math.max(1,num(curves.A)+num(curves.B)+num(curves.C));
  return `<article class="surface-card abc-chart"><div class="card-heading"><div><h2><span class="material-symbols-rounded">donut_large</span>Distribuição da carteira</h2><p>Quantidade de clientes por curva.</p></div></div><div class="abc-curve-stack">${['A','B','C'].map(c=>`<div><span class="abc-curve abc-curve-${c.toLowerCase()}">${c}</span><i><b style="width:${num(curves[c])/total*100}%"></b></i><strong>${num(curves[c])}</strong></div>`).join('')}</div></article>`;
}
function rulesHtml(data){const r=data.rules||{};return `<article class="surface-card abc-rules"><div class="card-heading"><div><h2><span class="material-symbols-rounded">rule</span>Regras aplicadas</h2><p>A classificação é recalculada sobre os 12 meses exibidos.</p></div></div><ul><li><b>A</b> até ${Math.round(num(r.curveAUntil)*100)}% do faturamento acumulado.</li><li><b>B</b> até ${Math.round(num(r.curveBUntil)*100)}% ou total mínimo de ${money(r.curveBRevenueFloor)}.</li><li><b>C</b> demais clientes.</li><li><b>Novo</b> primeira postagem a partir de ${monthLabel(r.newFrom)}.</li></ul></article>`;}

function filtersHtml(data,count){
  const f=state.filters,filters=data.filters||{};
  return `<section class="abc-filter-card surface-card"><div class="abc-filter-head"><div><strong>Clientes</strong><small>${count.toLocaleString('pt-BR')} resultado(s)</small></div><button class="text-btn" type="button" data-abc-clear>Limpar filtros</button></div><div class="abc-filters"><label class="abc-search"><span class="material-symbols-rounded">search</span><input data-abc-filter="search" value="${esc(f.search)}" placeholder="Buscar cliente, fantasia ou contrato"></label>${selectFilter('curve','Curva',f.curve,filters.curves)}${selectFilter('status','Status',f.status,filters.statuses)}${selectFilter('signal','Sinal comercial',f.signal,filters.signals)}${selectFilter('priority','Prioridade',f.priority,filters.priorities)}${selectFilter('intermediary','Intermediador',f.intermediary,filters.intermediaries)}${selectFilter('cadastro','Cadastro',f.cadastro,filters.cadastroStatuses)}<label><span>Ordenar</span><select data-abc-sort>${state.sort==='column'?'<option value="column" selected>Coluna selecionada</option>':''}<option value="priority" ${state.sort==='priority'?'selected':''}>Prioridade</option><option value="value" ${state.sort==='value'?'selected':''}>Maior faturamento</option><option value="curve" ${state.sort==='curve'?'selected':''}>Curva</option><option value="client" ${state.sort==='client'?'selected':''}>Cliente A-Z</option></select></label></div></section>`;
}
function selectFilter(key,label,value,items=[]){return `<label><span>${esc(label)}</span><select data-abc-filter="${esc(key)}"><option value="">Todos</option>${(items||[]).map(x=>`<option value="${esc(x)}" ${text(value)===text(x)?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`;}

let widthMeasureContext=null;
function measureTextWidth(value,font='700 9px Arial'){
  if(typeof document!=='undefined'&&document.createElement){
    if(!widthMeasureContext)widthMeasureContext=document.createElement('canvas').getContext('2d');
    if(widthMeasureContext){widthMeasureContext.font=font;return Math.ceil(widthMeasureContext.measureText(text(value)).width);}
  }
  return Math.ceil(text(value).length*5.2);
}
function fittedColumnWidth(label,values,{min=42,max=180,bodyIcon=false,bodyPadding=14}={}){
  const headerWidth=measureTextWidth(text(label).toUpperCase(),'850 8px Arial')+13+2+14;
  const bodyWidth=Math.max(0,...(values||[]).map(value=>measureTextWidth(value,'850 8.5px Arial')))+(bodyIcon?16:0)+bodyPadding;
  return Math.max(min,Math.min(max,Math.ceil(Math.max(headerWidth,bodyWidth))));
}
function tableColumns(months,clients=[]){
  const monthColumns=months.flatMap(m=>{
    const values=clients.map(c=>c.months&&c.months[m.key]||{});
    return [
      {id:`${m.key}-qtd`,width:fittedColumnWidth('QTD',values.map(v=>integer(v.qtd)),{min:44,max:82,bodyIcon:true,bodyPadding:8})},
      {id:`${m.key}-value`,width:fittedColumnWidth('Valor',values.map(v=>money(v.value)),{min:58,max:118,bodyIcon:true,bodyPadding:8})}
    ];
  });
  return [
    {id:'client',width:210},{id:'curve',width:58},{id:'status',width:88},{id:'signal',width:118},{id:'priority',width:94},
    ...monthColumns,
    {id:'totalQtd',width:fittedColumnWidth('Total QTD',clients.map(c=>integer(c.totals&&c.totals.qtd)),{min:72,max:100})},
    {id:'totalValue',width:fittedColumnWidth('Total faturado',clients.map(c=>money(c.totals&&c.totals.value)),{min:96,max:132})},
    {id:'ticket',width:fittedColumnWidth('Ticket',clients.map(c=>money(c.totals&&c.totals.ticket)),{min:72,max:110})},
    {id:'intermediary',width:116},{id:'contract',width:165},{id:'cadastro',width:195},{id:'action',width:230}
  ];
}
function columnWidth(id,fallback){return Math.max(42,Math.min(520,num(state.columnWidths[id])||fallback));}
function sortIndicator(key){
  if(state.sort==='column'&&state.columnSort.key===key)return state.columnSort.dir==='asc'?'arrow_upward':'arrow_downward';
  return 'unfold_more';
}
function sortableHeader(label,key,id,extra=''){
  return `<th ${extra} class="abc-sortable-header${id==='client'?' abc-sticky-client':id==='curve'?' abc-sticky-curve':''}" data-abc-sort-key="${esc(key)}" aria-sort="${state.sort==='column'&&state.columnSort.key===key?(state.columnSort.dir==='asc'?'ascending':'descending'):'none'}"><span class="abc-header-label">${esc(label)}<span class="material-symbols-rounded" aria-hidden="true">${sortIndicator(key)}</span></span><span class="abc-col-resizer" data-abc-resize="${esc(id)}" role="separator" tabindex="0" aria-label="Redimensionar coluna ${esc(label)}" title="Arraste para redimensionar. Duplo clique restaura."></span></th>`;
}
function tableHtml(data,rows,total,start,pages){
  const months=(data.period&&data.period.months)||[];
  const columns=tableColumns(months,data.clients||[]),clientWidth=columnWidth('client',210);
  return `<article class="surface-card abc-table-card"><div class="abc-table-top"><div><strong>Detalhamento mensal</strong><small>Largura inicial ajustada ao conteúdo. Clique no cabeçalho para ordenar e arraste a divisória para redimensionar. Verde: cresceu · vermelho claro: diminuiu · azul: estável ou parcial · vermelho escuro: sem postagem.</small></div><label>Linhas <select data-abc-page-size><option ${state.pageSize===25?'selected':''}>25</option><option ${state.pageSize===50?'selected':''}>50</option><option ${state.pageSize===100?'selected':''}>100</option></select></label></div><div class="abc-table-wrap"><table style="--abc-client-width:${clientWidth}px"><colgroup>${columns.map(c=>`<col data-abc-col="${esc(c.id)}" style="width:${columnWidth(c.id,c.width)}px">`).join('')}</colgroup><thead><tr>${sortableHeader('Cliente','client','client','rowspan="2"')}${sortableHeader('Curva','curve','curve','rowspan="2"')}${sortableHeader('Status','status','status','rowspan="2"')}${sortableHeader('Sinal comercial','signal','signal','rowspan="2"')}${sortableHeader('Prioridade','priority','priority','rowspan="2"')}${months.map(m=>`<th colspan="2" class="abc-month-head${m.partial?' is-partial':''}">${esc(m.label)}${m.partial?'<small>parcial</small>':''}</th>`).join('')}${sortableHeader('Total QTD','totalQtd','totalQtd','rowspan="2"')}${sortableHeader('Total faturado','totalValue','totalValue','rowspan="2"')}${sortableHeader('Ticket','ticket','ticket','rowspan="2"')}${sortableHeader('Intermediador','intermediary','intermediary','rowspan="2"')}${sortableHeader('Contrato / cartão','contract','contract','rowspan="2"')}${sortableHeader('Cadastro / PPN / CWS','cadastro','cadastro','rowspan="2"')}${sortableHeader('Ação recomendada','action','action','rowspan="2"')}</tr><tr>${months.map(m=>`${sortableHeader('QTD',`month:${m.key}:qtd`,`${m.key}-qtd`)}${sortableHeader('Valor',`month:${m.key}:value`,`${m.key}-value`)}`).join('')}</tr></thead><tbody>${rows.length?rows.map(c=>clientRow(c,months)).join(''):`<tr><td colspan="${5+months.length*2+7}" class="abc-empty">Nenhum cliente corresponde aos filtros.</td></tr>`}</tbody></table></div><div class="abc-pagination"><span>${total?`${start+1}-${Math.min(start+state.pageSize,total)} de ${total}`:'0 resultados'}</span><div><button type="button" data-abc-page="prev" ${state.page<=1?'disabled':''}><span class="material-symbols-rounded">chevron_left</span></button><strong>Página ${state.page} de ${pages}</strong><button type="button" data-abc-page="next" ${state.page>=pages?'disabled':''}><span class="material-symbols-rounded">chevron_right</span></button></div></div></article>`;
}
function clientRow(c,months){
  const cadastro=[c.cadastroStatus,c.loginPpn?`PPN: ${c.loginPpn}`:'',c.cwsMessage?`CWS: ${c.cwsMessage}`:''].filter(Boolean).join(' · ');
  const contract=[c.contract,c.card].filter(Boolean).join(' · ');
  const isNew=text(c.status).toUpperCase()==='NOVO';
  return `<tr><td class="abc-sticky-client"><div class="abc-client-name-line"><strong>${esc(c.client)}</strong>${isNew?'<span class="abc-new-chip">NOVO</span>':''}</div>${c.fantasy?`<small>${esc(c.fantasy)}</small>`:''}</td><td class="abc-sticky-curve"><span class="abc-curve abc-curve-${text(c.curve).toLowerCase()}">${esc(c.curve)}</span></td><td><span class="abc-status">${esc(c.status||'—')}</span></td><td><span class="abc-signal">${esc(c.signal||'—')}</span></td><td><span class="abc-priority abc-priority-${norm(c.priority).replace(/\s+/g,'-')}">${esc(c.priority||'—')}</span></td>${months.map((m,index)=>{const v=c.months&&c.months[m.key]||{};const previous=index>0&&c.months&&c.months[months[index-1].key]||{};const empty=num(v.qtd)<=0&&num(v.value)<=0;return `${monthCell(v.qtd,previous.qtd,{empty,partial:m.partial,first:index===0,format:integer,label:'objetos'})}${monthCell(v.value,previous.value,{empty,partial:m.partial,first:index===0,format:money,label:'faturamento'})}`;}).join('')}<td class="abc-num"><strong>${integer(c.totals&&c.totals.qtd)}</strong></td><td class="abc-num"><strong>${money(c.totals&&c.totals.value)}</strong></td><td class="abc-num">${money(c.totals&&c.totals.ticket)}</td><td>${esc(c.intermediary||'—')}</td><td>${esc(contract||'—')}</td><td class="abc-long">${esc(cadastro||'—')}</td><td class="abc-action">${esc(c.recommendedAction||'—')}</td></tr>`;
}

function monthlyMetricState(value,previous,{empty=false,partial=false,first=false}={}){
  if(empty)return 'no-post';
  if(partial||first||num(value)===num(previous))return 'stable';
  return num(value)>num(previous)?'up':'down';
}
function monthCell(value,previous,options={}){
  const metricState=monthlyMetricState(value,previous,options),formatted=options.format?options.format(value):String(value??'');
  if(metricState==='no-post')return `<td class="abc-num abc-month-cell abc-no-post" aria-label="Sem postagem"><span class="material-symbols-rounded abc-month-x" aria-hidden="true">close</span></td>`;
  const icon=metricState==='up'?'arrow_drop_up':metricState==='down'?'arrow_drop_down':'';
  const comparison=metricState==='stable'?(options.partial?'mês parcial':'estável'):metricState==='up'?'cresceu':'diminuiu';
  return `<td class="abc-num abc-month-cell abc-month-${metricState}" title="${esc(options.label||'Valor')} ${esc(comparison)}"><span class="abc-month-value">${icon?`<span class="material-symbols-rounded" aria-hidden="true">${icon}</span>`:''}<b>${esc(formatted)}</b></span></td>`;
}

function bind(){
  const host=root();if(!host)return;
  const retry=host.querySelector('[data-abc-retry]');if(retry)retry.onclick=()=>refresh();
  const exportBtn=host.querySelector('[data-abc-export]');if(exportBtn)exportBtn.onclick=exportCsv;
  const clear=host.querySelector('[data-abc-clear]');if(clear)clear.onclick=()=>{state.filters={search:'',curve:'',status:'',signal:'',priority:'',intermediary:'',cadastro:''};state.page=1;render();};
  host.querySelectorAll('[data-abc-filter]').forEach(el=>{const event=el.tagName==='INPUT'?'input':'change';el.addEventListener(event,()=>{state.filters[el.dataset.abcFilter]=el.value;state.page=1;render();});});
  const sort=host.querySelector('[data-abc-sort]');if(sort)sort.onchange=()=>{if(sort.value!=='column')state.sort=sort.value;state.page=1;render();};
  host.querySelectorAll('[data-abc-sort-key]').forEach(th=>th.onclick=()=>{
    const key=th.dataset.abcSortKey,same=state.sort==='column'&&state.columnSort.key===key;
    const numeric=/^(month:|total|ticket|priority|curve)/.test(key);
    state.columnSort={key,dir:same?(state.columnSort.dir==='asc'?'desc':'asc'):(numeric?'desc':'asc')};
    state.sort='column';state.page=1;render();
  });
  bindColumnResize(host);
  const size=host.querySelector('[data-abc-page-size]');if(size)size.onchange=()=>{state.pageSize=Number(size.value)||25;state.page=1;render();};
  host.querySelectorAll('[data-abc-page]').forEach(btn=>btn.onclick=()=>{state.page+=btn.dataset.abcPage==='next'?1:-1;render();root().scrollIntoView({behavior:'smooth',block:'start'});});
}

function bindColumnResize(host){
  host.querySelectorAll('[data-abc-resize]').forEach(handle=>{
    const adjust=delta=>{
      const id=handle.dataset.abcResize,col=host.querySelector(`[data-abc-col="${id}"]`);if(!col)return;
      const next=Math.max(42,Math.min(520,col.getBoundingClientRect().width+delta));
      col.style.width=`${next}px`;state.columnWidths[id]=Math.round(next);
      if(id==='client'){const table=col.closest('table');if(table)table.style.setProperty('--abc-client-width',`${next}px`);}
      saveColumnWidths();
    };
    handle.onclick=event=>event.stopPropagation();
    handle.ondblclick=event=>{event.preventDefault();event.stopPropagation();delete state.columnWidths[handle.dataset.abcResize];saveColumnWidths();render();};
    handle.onkeydown=event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();adjust(event.key==='ArrowLeft'?-8:8);}};
    handle.onpointerdown=event=>{
      event.preventDefault();event.stopPropagation();
      const id=handle.dataset.abcResize,col=host.querySelector(`[data-abc-col="${id}"]`);if(!col)return;
      const startX=event.clientX,startWidth=col.getBoundingClientRect().width,table=col.closest('table');
      handle.classList.add('is-resizing');handle.setPointerCapture&&handle.setPointerCapture(event.pointerId);
      const move=moveEvent=>{const next=Math.max(42,Math.min(520,startWidth+moveEvent.clientX-startX));col.style.width=`${next}px`;state.columnWidths[id]=Math.round(next);if(id==='client'&&table)table.style.setProperty('--abc-client-width',`${next}px`);};
      const finish=()=>{handle.classList.remove('is-resizing');saveColumnWidths();handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',finish);};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
    };
  });
}

function exportCsv(){
  const data=state.data||{},months=(data.period&&data.period.months)||[],headers=['CLIENTE','FANTASIA','CURVA','STATUS','SINAL','PRIORIDADE'];
  months.forEach(m=>{headers.push(`${m.label} QTD`,`${m.label} VALOR`);});
  headers.push('TOTAL QTD','TOTAL VALOR','TICKET','INTERMEDIADOR','CONTRATO','CARTAO','STATUS CADASTRO','LOGIN PPN','MSG CWS','ACAO RECOMENDADA');
  const lines=[headers,...filteredClients().map(c=>{const row=[c.client,c.fantasy,c.curve,c.status,c.signal,c.priority];months.forEach(m=>{const v=c.months&&c.months[m.key]||{};row.push(num(v.qtd),num(v.value));});row.push(num(c.totals&&c.totals.qtd),num(c.totals&&c.totals.value),num(c.totals&&c.totals.ticket),c.intermediary,c.contract,c.card,c.cadastroStatus,c.loginPpn,c.cwsMessage,c.recommendedAction);return row;})];
  const csv='\ufeff'+lines.map(row=>row.map(csvCell).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`curva-abc-${data.period&&data.period.referenceMonth||'12-meses'}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function csvCell(value){let s=String(value??'');if(/^[=+\-@]/.test(s))s="'"+s;s=s.replace(/"/g,'""');return `"${s}"`;}
function compactMoney(v){const n=num(v);if(Math.abs(n)>=1000000)return `R$ ${(n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`;if(Math.abs(n)>=1000)return `R$ ${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})} mil`;return money(n);}
function shortMonth(label){return text(label).slice(0,2);}
function count(){return(state.data&&state.data.clients||[]).length;}

global.CurvaABC={init,ensureLoaded,refresh,render,count,exportCsv,_state:state,_test:{monthlyMetricState,columnSortValue,compareColumnValues,fittedColumnWidth}};
})(window);
