/************************************************************
 * 25_CRM_LATERAL.gs
 * ------------------------------------------------------------
 * Sidebar lateral com múltiplas visões:
 * - Início
 * - Diagnóstico do Cliente
 * - Oportunidades por Ação
 * - Agenda Comercial da Semana
 * - Materiais de Apoio
 ************************************************************/

/* ========================= MENU ========================= */

function onOpenCrmLateral_(e){
  crmLateralOnOpen_(e);
}

function crmLateralOnOpen_(e){
  if (typeof crm6_isLegacySidebarEnabled_ === 'function' && !crm6_isLegacySidebarEnabled_()) return;
  SpreadsheetApp.getUi()
    .createMenu('🧭 CRM Lateral')
    .addItem('Início', 'showCrmSidebarHome')
    .addItem('Diagnóstico do Cliente', 'showDiagnosticoClienteSidebar')
    .addSeparator()
    .addItem('Oportunidades por Ação', 'showSidebarOportunidades')
    .addItem('Agenda Comercial da Semana', 'showSidebarAgendaSemana')
    .addItem('Materiais de Apoio', 'showSidebarMidias')
    .addToUi();
}

function installCrmSidebarMenu(){
  if (typeof crm6_isLegacySidebarEnabled_ === 'function' && !crm6_isLegacySidebarEnabled_()) throw new Error('CRM Lateral aposentado. Use o módulo oficial em /crm/.');
  crmLateralOnOpen_();
  SpreadsheetApp.getActiveSpreadsheet().toast('Menu CRM Lateral atualizado.', '✅', 4);
}

/* ========================= ABERTURA ========================= */

function showCrmSidebarHome(){ showCrmSidebar_('home'); }
function showDiagnosticoClienteSidebar(){ showCrmSidebar_('diagnostico'); }
function showSidebarOportunidades(){ showCrmSidebar_('oportunidades'); }
function showSidebarAgendaSemana(){ showCrmSidebar_('agenda'); }
function showSidebarMidias(){ showCrmSidebar_('midias'); }

function showCrmSidebar_(initialView){
  if (typeof crm6_isLegacySidebarEnabled_ === 'function' && !crm6_isLegacySidebarEnabled_()) throw new Error('CRM Lateral aposentado. Use o módulo oficial em /crm/.');
  initialView = initialView || 'home';
  var html = HtmlService.createHtmlOutput(crmSidebarHtml_(initialView))
    .setTitle('CRM Lateral');
  SpreadsheetApp.getUi().showSidebar(html);
}

function crmSidebarHtml_(initialView){
  var html = `
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        :root{
          --navy:#00416B;
          --gold:#FFD400;
          --bg:#F6F8FB;
          --card:#FFFFFF;
          --line:#E5E7EB;
          --text:#1F2937;
          --muted:#6B7280;
          --green:#166534;
          --red:#B91C1C;
          --orange:#B45309;
          --blue:#1D4ED8;
          --shadow:0 4px 14px rgba(0,0,0,.06);
        }
        *{box-sizing:border-box}
        body{
          margin:0;
          font-family:Arial,sans-serif;
          background:var(--bg);
          color:var(--text);
          font-size:14px;
        }
        .topbar{
          position:sticky; top:0; z-index:9;
          background:var(--card);
          border-bottom:1px solid var(--line);
          box-shadow:var(--shadow);
          padding:12px 12px 10px;
        }
        .brand{
          display:flex; align-items:center; gap:8px;
          font-size:18px; font-weight:700; color:var(--navy);
          margin-bottom:10px;
        }
        .nav{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
        }
        .nav button{
          padding:9px 10px;
          border-radius:10px;
          border:1px solid #D6DBE1;
          background:#fff;
          color:var(--navy);
          font-weight:700;
          cursor:pointer;
          font-size:13px;
        }
        .nav button.active{
          background:var(--navy);
          color:#fff;
          border-color:var(--navy);
        }
        .wrap{padding:12px}
        .status{
          font-size:13px;
          color:var(--muted);
          margin-bottom:10px;
        }
        .status.err{color:var(--red)}
        .status.warn{color:var(--orange)}
        .grid2{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
        }
        .card{
          background:var(--card);
          border:1px solid var(--line);
          border-radius:14px;
          padding:14px;
          box-shadow:var(--shadow);
          margin-bottom:12px;
        }
        .card h3{
          margin:0 0 10px;
          color:var(--navy);
          font-size:18px;
          line-height:1.2;
        }
        .sub{
          color:var(--muted);
          font-size:13px;
          margin:-3px 0 10px;
        }
        .kpiLabel{
          color:var(--muted);
          font-size:12px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.02em;
          margin-bottom:4px;
        }
        .kpiValue{
          font-size:24px;
          font-weight:700;
          color:var(--navy);
        }
        .row{margin-bottom:10px}
        .row label{
          display:block;
          font-size:13px;
          font-weight:700;
          color:var(--muted);
          margin-bottom:6px;
        }
        select, input[type="date"]{
          width:100%;
          padding:11px 12px;
          border-radius:10px;
          border:1px solid #CBD5E1;
          background:#fff;
          font-size:14px;
        }
        .btn{
          width:100%;
          padding:11px 12px;
          border-radius:10px;
          border:none;
          background:var(--navy);
          color:#fff;
          font-weight:700;
          cursor:pointer;
          font-size:14px;
        }
        .btn.secondary{
          background:#fff;
          color:var(--navy);
          border:1px solid #CBD5E1;
        }
        .chips{display:flex; flex-wrap:wrap; gap:6px; margin-top:8px}
        .chip{
          display:inline-block;
          padding:4px 8px;
          border-radius:999px;
          font-size:12px;
          font-weight:700;
          border:1px solid transparent;
          background:#EEF2FF;
          color:var(--navy);
        }
        .chip.pri-CRITICA{background:#FDE2E2;color:#991B1B}
        .chip.pri-ALTA{background:#FFE8CC;color:#9A3412}
        .chip.pri-MEDIA{background:#FFF7CC;color:#92400E}
        .chip.pri-BAIXA{background:#E5E7EB;color:#4B5563}
        .chip.action-CONVERTER{background:#FFF3E0;color:#C2410C}
        .chip.action-RESGATAR{background:#FCE7F3;color:#BE185D}
        .chip.action-FIDELIZAR{background:#DCFCE7;color:#166534}
        .chip.action-MANTER{background:#F3F4F6;color:#4B5563}
        .chip.action-CANCELAR{background:#EFEBE9;color:#5D4037}
        .kv{
          margin:7px 0;
          font-size:14px;
          line-height:1.45;
        }
        .kv .lbl{
          font-weight:700;
          color:#374151;
        }
        .muted{color:var(--muted)}
        .list{
          display:flex;
          flex-direction:column;
          gap:10px;
        }
        .item{
          border:1px solid var(--line);
          border-radius:12px;
          padding:12px;
          background:#fff;
        }
        .itemTitle{
          font-size:15px;
          font-weight:700;
          color:var(--navy);
          margin-bottom:4px;
        }
        .itemMeta{
          font-size:13px;
          color:var(--muted);
          margin-bottom:8px;
        }
        .itemGrid{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:6px 10px;
          font-size:13px;
        }
        .itemGrid div{line-height:1.35}
        .small{
          font-size:12px;
          color:var(--muted);
        }
        .sectionTitle{
          font-size:16px;
          font-weight:700;
          color:var(--navy);
          margin:14px 0 8px;
        }
        .empty{
          padding:18px 12px;
          text-align:center;
          color:var(--muted);
          font-size:14px;
          border:1px dashed #CBD5E1;
          border-radius:12px;
          background:#fff;
        }
        ul{
          margin:8px 0 0;
          padding-left:18px;
          font-size:14px;
          line-height:1.45;
        }
        a{color:var(--blue); text-decoration:none}
        a:hover{text-decoration:underline}
      </style>
    </head>
    <body>
      <div class="topbar">
        <div class="brand">🧭 CRM Lateral</div>
        <div class="nav">
          <button id="nav-home" onclick="loadView('home')">Início</button>
          <button id="nav-diagnostico" onclick="loadView('diagnostico')">Diagnóstico</button>
          <button id="nav-oportunidades" onclick="loadView('oportunidades')">Oportunidades</button>
          <button id="nav-agenda" onclick="loadView('agenda')">Agenda</button>
          <button id="nav-midias" onclick="loadView('midias')">Materiais</button>
        </div>
      </div>

      <div class="wrap">
        <div id="status" class="status">Carregando...</div>
        <div id="content"></div>
      </div>

      <script>
        window.CRM_INITIAL_VIEW = '__INITIAL_VIEW__';
        window._crmClientsLoaded = false;
        window._crmClientOptions = [];

        function esc(s){
          return String(s == null ? '' : s)
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;');
        }
        function moeda(v){
          var n = Number(v || 0);
          return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        }
        function pct(v){
          var n = Number(v || 0);
          return n.toLocaleString('pt-BR',{maximumFractionDigits:2}) + '%';
        }
        function setStatus(msg, cls){
          var el = document.getElementById('status');
          el.className = 'status' + (cls ? ' ' + cls : '');
          el.textContent = msg || '';
        }
        function setActive(view){
          ['home','diagnostico','oportunidades','agenda','midias'].forEach(function(v){
            var btn = document.getElementById('nav-' + v);
            if (btn) btn.classList.toggle('active', v === view);
          });
        }
        function empty(msg){
          return '<div class="empty">' + esc(msg) + '</div>';
        }
        function loadView(view){
          setActive(view);
          if (view === 'home') return loadHome();
          if (view === 'diagnostico') return loadDiagnosticoShell();
          if (view === 'oportunidades') return loadOportunidades();
          if (view === 'agenda') return loadAgenda();
          if (view === 'midias') return loadMidias();
        }

        function loadHome(){
          setStatus('Carregando visão inicial...');
          document.getElementById('content').innerHTML = '';
          google.script.run
            .withSuccessHandler(renderHome)
            .withFailureHandler(function(err){
              setStatus((err && err.message) ? err.message : String(err), 'err');
            })
            .crmSidebarGetHomeData();
        }

        function renderHome(data){
          setStatus('');
          var h = '';
          h += '<div class="grid2">';
          h += cardKpi('Total de clientes', data.totalClientes);
          h += cardKpi('Clientes com contrato', data.comContrato);
          h += cardKpi('Converter', data.counts.CONVERTER || 0);
          h += cardKpi('Resgatar', data.counts.RESGATAR || 0);
          h += cardKpi('Fidelizar', data.counts.FIDELIZAR || 0);
          h += '</div>';

          h += '<div class="card"><h3>Leitura rápida</h3>';
          h += '<div class="kv"><span class="lbl">Ações:</span> ' + esc(data.resumoAcoes) + '</div>';
          h += '<div class="kv"><span class="lbl">Última atualização:</span> ' + esc(data.now) + '</div>';
          h += '<div class="chips">';
          (data.countCards || []).forEach(function(c){
            h += '<span class="chip action-' + esc(c.acao) + '">' + esc(c.acao) + ': ' + esc(c.total) + '</span>';
          });
          h += '</div></div>';

          h += '<div class="card"><h3>Top urgências</h3>';
          if (!(data.topUrgentes || []).length){
            h += empty('Nenhum cliente urgente agora.');
          } else {
            h += renderClientList(data.topUrgentes);
          }
          h += '</div>';

          document.getElementById('content').innerHTML = h;
        }

        function cardKpi(label, value){
          return '<div class="card">' +
            '<div class="kpiLabel">' + esc(label) + '</div>' +
            '<div class="kpiValue">' + esc(value) + '</div>' +
          '</div>';
        }

        function loadDiagnosticoShell(){
          setStatus('');
          var h = '';
          h += '<div class="card">';
          h += '<h3>Diagnóstico do Cliente</h3>';
          h += '<div class="row"><label>Selecione o cliente</label><select id="diagCliente"></select></div>';
          h += '<div class="row"><button class="btn" onclick="buscarDiagnostico()">Buscar classificação</button></div>';
          h += '</div>';
          h += '<div id="diagResult"></div>';
          document.getElementById('content').innerHTML = h;
          ensureClienteOptions_();
        }

        function ensureClienteOptions_(){
          if (window._crmClientsLoaded){
            fillClienteSelect_(window._crmClientOptions);
            return;
          }
          setStatus('Carregando clientes...');
          google.script.run
            .withSuccessHandler(function(items){
              window._crmClientsLoaded = true;
              window._crmClientOptions = items || [];
              fillClienteSelect_(window._crmClientOptions);
              setStatus('');
            })
            .withFailureHandler(function(err){
              setStatus((err && err.message) ? err.message : String(err), 'err');
            })
            .crmSidebarGetDiagnosticoOptions();
        }

        function fillClienteSelect_(items){
          var sel = document.getElementById('diagCliente');
          if (!sel) return;
          sel.innerHTML = '<option value="">Selecione...</option>';
          (items || []).forEach(function(it){
            var opt = document.createElement('option');
            opt.value = it.clienteId;
            opt.textContent = it.label;
            sel.appendChild(opt);
          });
        }

        function buscarDiagnostico(){
          var sel = document.getElementById('diagCliente');
          if (!sel || !sel.value){
            setStatus('Selecione um cliente.', 'warn');
            return;
          }
          setStatus('Buscando diagnóstico...');
          document.getElementById('diagResult').innerHTML = '';
          google.script.run
            .withSuccessHandler(renderDiagnostico)
            .withFailureHandler(function(err){
              setStatus((err && err.message) ? err.message : String(err), 'err');
            })
            .crmSidebarGetDiagnostico(sel.value);
        }

        function renderDiagnostico(c){
          setStatus('');
          var h = '';
          h += '<div class="card">';
          h += '<h3>' + esc(c.cliente) + '</h3>';
          h += '<div class="sub">Cliente ID ' + esc(c.clienteId) + ' • ' + esc(c.local || 'Sem local') + '</div>';
          h += '<div class="chips">';
          h += '<span class="chip action-' + esc(c.classificacao.acaoExibida) + '">' + esc(c.classificacao.acaoExibida || '—') + '</span>';
          h += '<span class="chip pri-' + esc(c.classificacao.prioridade) + '">' + esc(c.classificacao.prioridade || '—') + '</span>';
          h += '<span class="chip">' + 'CURVA ' + esc(c.classificacao.curva || '—') + '</span>';
          h += '</div>';
          h += '</div>';

          h += '<div class="card"><h3>Classificação</h3>';
          h += kv('Ação exibida', c.classificacao.acaoExibida);
          h += kv('Ação do engine', c.classificacao.acaoEngine);
          h += kv('Ação atual', c.classificacao.acaoAtual);
          h += kv('Subação', c.classificacao.subAcao);
          h += kv('Prioridade', c.classificacao.prioridade);
          h += kv('Score', c.classificacao.score);
          h += kv('Canal', c.classificacao.canal);
          h += kv('Conteúdo', c.classificacao.conteudo);
          h += kv('Objetivo', c.classificacao.objetivo);
          h += kv('Motivo da regra', c.classificacao.motivoRegra);
          if (c.classificacao.midiaCodigo || c.classificacao.midiaTitulo){
            var mid = (c.classificacao.midiaCodigo || '—') + (c.classificacao.midiaTitulo ? ' — ' + c.classificacao.midiaTitulo : '');
            h += kv('Mídia', mid);
            if (c.classificacao.midiaDescricao) h += kv('Descrição da mídia', c.classificacao.midiaDescricao);
            if (c.classificacao.midiaLink) h += '<div class="kv"><span class="lbl">Link:</span> <a target="_blank" href="' + esc(c.classificacao.midiaLink) + '">Abrir material</a></div>';
          } else {
            h += kv('Mídia', '—');
          }
          h += '</div>';

          h += '<div class="card"><h3>Critérios de entrada</h3>';
          h += kv('Perfil comercial', c.criterios.perfilComercial);
          h += kv('Bucket de negócio', c.criterios.bucketNegocio);
          h += kv('Status atividade', c.criterios.statusAtividade);
          h += kv('Dias sem postar', c.criterios.diasSemPostar);
          h += kv('Recorrência', c.criterios.recorrenciaNivel);
          h += kv('Tendência', c.criterios.tendencia);
          h += kv('Alerta', c.criterios.nivelAlerta);
          h += kv('Movimento de curva', c.criterios.movimentoCurva);
          h += kv('Porte', c.criterios.porteOperacional);
          h += kv('Tem contrato', c.criterios.temContrato);
          h += kv('Número do contrato', c.criterios.numeroContrato || '—');
          h += kv('Cartão postagem', c.criterios.cartaoPostagem || '—');
          h += kv('Novo cliente', c.criterios.novoCliente);
          h += kv('QTD 30D', c.criterios.qtd30d);
          h += kv('FAT 30D', moeda(c.criterios.valor30d));
          h += kv('QTD total', c.criterios.qtdTotal);
          h += kv('Valor total', moeda(c.criterios.valorTotal));
          h += kv('Share local 30D', pct(c.criterios.shareLocal30d * 100));
          h += kv('FD%', c.criterios.fdPctTexto);
          h += kv('QD%', c.criterios.qdPctTexto);
          h += kv('DD%', c.criterios.ddPctTexto);
          h += '</div>';

          h += '<div class="card"><h3>Justificativa expandida</h3><ul>';
          (c.justificativa || []).forEach(function(x){
            h += '<li>' + esc(x) + '</li>';
          });
          h += '</ul></div>';

          document.getElementById('diagResult').innerHTML = h;
        }

        function kv(label, value){
          return '<div class="kv"><span class="lbl">' + esc(label) + ':</span> ' + esc(value == null || value === '' ? '—' : value) + '</div>';
        }

        function renderClientList(items){
          var h = '<div class="list">';
          (items || []).forEach(function(x){
            h += '<div class="item">';
            h += '<div class="itemTitle">' + esc(x.cliente) + '</div>';
            h += '<div class="itemMeta">' + esc(x.local || 'Sem local') + ' • ' + esc(x.curva || '—') + ' • ' + esc(x.subAcao || '—') + '</div>';
            h += '<div class="chips">';
            h += '<span class="chip action-' + esc(x.acao) + '">' + esc(x.acao || '—') + '</span>';
            h += '<span class="chip pri-' + esc(x.prioridadeFila) + '">' + esc(x.prioridadeFila || '—') + '</span>';
            h += '<span class="chip">' + 'Score ' + esc(x.scorePrioridade || 0) + '</span>';
            h += '</div>';
            h += '<div class="itemGrid" style="margin-top:8px">';
            h += '<div><span class="lbl">Canal:</span> ' + esc(x.canalSugerido || '—') + '</div>';
            h += '<div><span class="lbl">Últ. post:</span> ' + esc(x.diasSemPostar) + 'd</div>';
            h += '<div><span class="lbl">Mídia:</span> ' + esc(x.midia || '—') + '</div>';
            h += '<div><span class="lbl">Motivo:</span> ' + esc(x.motivoRegra || '—') + '</div>';
            h += '</div>';
            h += '</div>';
          });
          h += '</div>';
          return h;
        }

        function loadOportunidades(){
          setStatus('Carregando oportunidades...');
          document.getElementById('content').innerHTML = '';
          google.script.run
            .withSuccessHandler(renderOportunidades)
            .withFailureHandler(function(err){
              setStatus((err && err.message) ? err.message : String(err), 'err');
            })
            .crmSidebarGetOportunidades();
        }

        function renderOportunidades(data){
          setStatus('');
          var h = '<div class="grid2">';
          (data.cards || []).forEach(function(c){
            h += cardKpi(c.label, c.value);
          });
          h += '</div>';

          (data.grupos || []).forEach(function(g){
            h += '<div class="card">';
            h += '<h3>' + esc(g.acao) + ' (' + esc(g.total) + ')</h3>';
            if (!(g.items || []).length) h += empty('Nenhum cliente nesta ação.');
            else h += renderClientList(g.items);
            h += '</div>';
          });

          document.getElementById('content').innerHTML = h;
        }

        function loadAgenda(){
          setStatus('Carregando agenda da semana...');
          document.getElementById('content').innerHTML = '';
          google.script.run
            .withSuccessHandler(renderAgenda)
            .withFailureHandler(function(err){
              setStatus((err && err.message) ? err.message : String(err), 'err');
            })
            .crmSidebarGetAgendaSemana();
        }

        function renderAgenda(data){
          setStatus('');
          var h = '';
          h += '<div class="card">';
          h += '<h3>Agenda Comercial da Semana</h3>';
          h += '<div class="sub">' + esc(data.weekStart) + ' até ' + esc(data.weekEnd) + '</div>';
          h += '<div class="chips">';
          h += '<span class="chip">Total ' + esc(data.total || 0) + '</span>';
          h += '<span class="chip">Atividades ' + esc(data.atividades || data.total || 0) + '</span>';
          h += '</div>';
          h += '</div>';

          (data.days || []).forEach(function(day){
            h += '<div class="card">';
            h += '<h3>' + esc(day.label) + '</h3>';
            if (!(day.items || []).length){
              h += empty('Sem itens neste dia.');
            } else {
              h += '<div class="list">';
              day.items.forEach(function(x){
                h += '<div class="item">';
                h += '<div class="itemTitle">' + esc((x.horaInicio || '') + ' ' + (x.nomeBloco ? '• ' + x.nomeBloco : '')) + '</div>';
                h += '<div class="itemMeta">' + esc(x.cliente || 'Sem cliente') + ' • ' + esc(x.local || 'Sem local') + '</div>';
                h += '<div class="chips">';
                h += '<span class="chip">' + esc(x.tipoGrupo || x.tipoAtividade || '—') + '</span>';
                if (x.acaoCliente) h += '<span class="chip action-' + esc(x.acaoCliente) + '">' + esc(x.acaoCliente) + '</span>';
                if (x.prioridadeCliente) h += '<span class="chip pri-' + esc(x.prioridadeCliente) + '">' + esc(x.prioridadeCliente) + '</span>';
                if (x.curvaCliente) h += '<span class="chip">CURVA ' + esc(x.curvaCliente) + '</span>';
                h += '</div>';
                h += '<div class="itemGrid" style="margin-top:8px">';
                h += '<div><span class="lbl">Subação:</span> ' + esc(x.subAcaoCliente || '—') + '</div>';
                h += '<div><span class="lbl">Status agenda:</span> ' + esc(x.statusAgenda || '—') + '</div>';
                h += '<div><span class="lbl">Canal:</span> ' + esc(x.canalSugerido || '—') + '</div>';
                h += '<div><span class="lbl">Conteúdo:</span> ' + esc(x.conteudoSugerido || '—') + '</div>';
                h += '<div><span class="lbl">Mídia:</span> ' + esc(x.midiaSugerida || '—') + '</div>';
                h += '<div><span class="lbl">Motivo:</span> ' + esc(x.motivoRegra || '—') + '</div>';
                h += '</div>';
                h += '</div>';
              });
              h += '</div>';
            }
            h += '</div>';
          });

          document.getElementById('content').innerHTML = h;
        }

        function loadMidias(){
          setStatus('Carregando materiais...');
          document.getElementById('content').innerHTML = '';
          google.script.run
            .withSuccessHandler(renderMidias)
            .withFailureHandler(function(err){
              setStatus((err && err.message) ? err.message : String(err), 'err');
            })
            .crmSidebarGetMidias();
        }

        function renderMidias(data){
          setStatus('');
          var h = '<div class="card"><h3>Materiais de Apoio</h3><div class="sub">Catálogo de manuais, apresentações e checklists.</div></div>';
          if (!(data.items || []).length){
            h += empty('Nenhum material ativo encontrado.');
          } else {
            h += '<div class="list">';
            data.items.forEach(function(m){
              h += '<div class="item">';
              h += '<div class="itemTitle">' + esc(m.codigo) + (m.titulo ? ' — ' + esc(m.titulo) : '') + '</div>';
              h += '<div class="itemMeta">' + esc(m.acao || 'Sem ação') + (m.subcategoria ? ' • ' + esc(m.subcategoria) : '') + '</div>';
              h += '<div class="itemGrid">';
              h += '<div><span class="lbl">Tipo:</span> ' + esc(m.tipo || '—') + '</div>';
              h += '<div><span class="lbl">Status:</span> ' + esc(m.ativa ? 'Ativo' : 'Inativo') + '</div>';
              h += '<div style="grid-column:1 / span 2"><span class="lbl">Descrição:</span> ' + esc(m.descricao || m.quandoUsar || '—') + '</div>';
              if (m.link){
                h += '<div style="grid-column:1 / span 2"><span class="lbl">Link:</span> <a href="' + esc(m.link) + '" target="_blank">Abrir material</a></div>';
              }
              h += '</div>';
              h += '</div>';
            });
            h += '</div>';
          }
          document.getElementById('content').innerHTML = h;
        }

        loadView(window.CRM_INITIAL_VIEW || 'home');
      </script>
    </body>
  </html>
  `;
  return html.replace('__INITIAL_VIEW__', initialView || 'home');
}

/* ========================= DADOS DO SIDEBAR ========================= */

function crmSidebarGetHomeData(){
  op_setupOperacao();
  op_ensureMasterFresh_({ allowStale:true });

  var items = op_readClientsMaster_({ projection:'full' }).items || [];
  var counts = {};
  var comContrato = 0;
  items.forEach(function(x){
    var ac = op_norm_(x.acao || 'MANTER') || 'MANTER';
    counts[ac] = (counts[ac] || 0) + 1;
    if (op_upperNoAccents_(x.temContrato) === 'SIM') comContrato++;
  });

  var topUrgentes = items.slice().sort(crmSidebarSortClients_).slice(0, 10).map(crmSidebarProjectClient_);
  var actionsOrder = ['CONVERTER','RESGATAR','FIDELIZAR','MANTER','CANCELAR'];
  var countCards = actionsOrder.map(function(a){ return { acao:a, total: counts[a] || 0 }; });

  return {
    totalClientes: items.length,
    comContrato: comContrato,
    counts: counts,
    countCards: countCards,
    resumoAcoes: actionsOrder.map(function(a){ return a + ': ' + (counts[a] || 0); }).join(' | '),
    topUrgentes: topUrgentes,
    now: op_nowIso_()
  };
}

function crmSidebarGetDiagnosticoOptions(){
  return getClienteOptionsDiagnostico();
}

function crmSidebarGetDiagnostico(clienteId){
  return diagnosticoClienteById(clienteId);
}

function crmSidebarGetOportunidades(){
  op_setupOperacao();
  op_ensureMasterFresh_({ allowStale:true });
  var items = op_readClientsMaster_({ projection:'full' }).items || [];
  var order = ['CONVERTER','RESGATAR','FIDELIZAR','MANTER','CANCELAR'];
  var cards = order.map(function(a){
    return { label: a, value: items.filter(function(x){ return op_norm_(x.acao) === a; }).length };
  });

  var actionSections = ['CONVERTER','RESGATAR','FIDELIZAR'].map(function(acao){
    var group = items.filter(function(x){ return op_norm_(x.acao) === acao; })
      .sort(crmSidebarSortClients_)
      .slice(0, 15)
      .map(crmSidebarProjectClient_);
    return {
      acao: acao,
      total: items.filter(function(x){ return op_norm_(x.acao) === acao; }).length,
      items: group
    };
  });

  return { cards: cards, grupos: actionSections };
}

function crmSidebarGetAgendaSemana(weekStart){
  op_setupOperacao();
  op_ensureMasterFresh_({ allowStale:true });

  weekStart = op_getWeekStart_(weekStart || op_toYmd_(new Date()));
  var weekEnd = op_addDays_(weekStart, 4);
  var clients = op_readClientsMaster_({ projection:'agenda' });
  var blocks = op_readBlocksById_();
  var agenda = op_readAgendaItemsWithBlocks_(weekStart, weekEnd, clients.byId, blocks).items || [];

  var daysMap = {};
  op_buildWeekDays_(weekStart).forEach(function(d){
    daysMap[d.date] = { date:d.date, label:d.label, items:[] };
  });

  var atividades = 0;
  agenda.forEach(function(x){
    if (!daysMap[x.data]) daysMap[x.data] = { date:x.data, label:x.data, items:[] };
    daysMap[x.data].items.push({
      horaInicio: x.horaInicio,
      nomeBloco: x.nomeBloco,
      cliente: x.cliente,
      local: x.local,
      tipoGrupo: x.tipoGrupo,
      tipoAtividade: x.tipoAtividade,
      statusAgenda: x.statusAgenda,
      acaoCliente: x.acaoCliente,
      subAcaoCliente: x.subAcaoCliente,
      prioridadeCliente: x.prioridadeCliente,
      canalSugerido: x.canalSugerido,
      conteudoSugerido: x.conteudoSugerido,
      midiaSugerida: x.midiaSugerida,
      motivoRegra: x.motivoRegra,
      curvaCliente: x.curvaCliente
    });
    atividades++;
  });

  var days = Object.keys(daysMap).sort().map(function(k){
    daysMap[k].items.sort(function(a,b){
      return String(a.horaInicio || '').localeCompare(String(b.horaInicio || ''));
    });
    return daysMap[k];
  });

  return {
    weekStart: weekStart,
    weekEnd: weekEnd,
    total: agenda.length,
    atividades: atividades,
    days: days
  };
}

function crmSidebarGetMidias(){
  op_setupOperacao();
  var items = (op_readMidias_() || []).map(function(m){
    return {
      codigo: m.codigo,
      titulo: m.titulo || m.nome || '',
      nome: m.nome || m.titulo || '',
      tipo: m.tipo || '',
      link: m.link || '',
      quandoUsar: m.quandoUsar || '',
      descricao: m.descricao || m.quandoUsar || '',
      acao: m.acao || '',
      subcategoria: m.subcategoria || '',
      ativa: m.ativa !== false
    };
  });
  return { items: items };
}

/* ========================= PROJEÇÃO E ORDENAÇÃO ========================= */

function crmSidebarPriorityWeight_(p){
  return ({'CRITICA':4,'ALTA':3,'MEDIA':2,'BAIXA':1}[op_upperNoAccents_(p)] || 0);
}

function crmSidebarSortClients_(a,b){
  var pa = crmSidebarPriorityWeight_(a.prioridadeFila), pb = crmSidebarPriorityWeight_(b.prioridadeFila);
  if (pb !== pa) return pb - pa;
  var sa = Number(a.scorePrioridade || 0), sb = Number(b.scorePrioridade || 0);
  if (sb !== sa) return sb - sa;
  var sha = Number(a.shareLocal30d || 0), shb = Number(b.shareLocal30d || 0);
  if (shb !== sha) return shb - sha;
  return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR');
}

function crmSidebarProjectClient_(x){
  return {
    clienteId: x.clienteId,
    cliente: x.cliente,
    local: x.local,
    curva: x.curva,
    acao: x.acao,
    acaoEngine: x.acaoEngine,
    acaoAtual: x.acaoAtual,
    subAcao: x.subAcao,
    prioridadeFila: x.prioridadeFila,
    scorePrioridade: x.scorePrioridade || 0,
    canalSugerido: x.canalSugerido,
    conteudoSugerido: x.conteudoSugerido,
    motivoRegra: x.motivoRegra,
    midia: x.midia,
    diasSemPostar: x.diasSemPostar
  };
}

/* ========================= DIAGNÓSTICO ========================= */

function getClienteOptionsDiagnostico() {
  if (typeof op_ensureMasterFresh_ === 'function') {
    op_ensureMasterFresh_({ allowStale: true });
  }

  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);

  var out = values.slice(1).map(function(r) {
    var clienteId = op_norm_(op_getCell_(r, hm, 'CLIENTE_ID'));
    var cliente = op_norm_(op_getCell_(r, hm, 'CLIENTE')) || op_norm_(op_getCell_(r, hm, 'NOME_REMETENTE_BASE'));
    var local = op_norm_(op_getCell_(r, hm, 'LOCAL_PREDOMINANTE'));
    if (!clienteId || !cliente) return null;
    return {
      clienteId: clienteId,
      label: cliente + (local ? ' — ' + local : '')
    };
  }).filter(Boolean);

  out.sort(function(a,b){
    return a.label.localeCompare(b.label, 'pt-BR');
  });

  return out;
}

function diagnosticoClienteByNome(nomeCliente) {
  var item = getClienteOptionsDiagnostico().filter(function(x){
    return dc_normSearch_(x.label).indexOf(dc_normSearch_(nomeCliente)) >= 0;
  })[0];

  if (!item) throw new Error('Cliente não encontrado: ' + nomeCliente);
  return diagnosticoClienteById(item.clienteId);
}

function diagnosticoClienteById(clienteId) {
  if (!clienteId) throw new Error('clienteId obrigatório.');

  if (typeof op_ensureMasterFresh_ === 'function') {
    op_ensureMasterFresh_({ allowStale: true });
  }

  var ss = op_getSpreadsheet_();
  var sh = ss.getSheetByName(OP_CFG.SHEETS.MASTER);
  if (!sh || sh.getLastRow() < 2) throw new Error('Aba CLIENTES_MASTER não encontrada ou vazia.');

  var values = sh.getDataRange().getValues();
  var hm = op_buildHeaderMap_(values[0]);
  var row = null;

  for (var i = 1; i < values.length; i++) {
    if (op_norm_(op_getCell_(values[i], hm, 'CLIENTE_ID')) === clienteId) {
      row = values[i];
      break;
    }
  }

  if (!row) throw new Error('Cliente não encontrado no CLIENTES_MASTER: ' + clienteId);

  var r = dc_extractMasterRow_(row, hm);
  var midiaMeta = crmGetMidiaMetaByCode_(r.midia);

  return {
    ok: true,
    clienteId: r.clienteId,
    cliente: r.cliente,
    local: r.local,
    classificacao: {
      acaoExibida: r.acaoAtual || r.acao,
      acaoEngine: r.acaoEngine,
      acaoAtual: r.acaoAtual,
      subAcao: r.subAcao,
      prioridade: r.prioridade,
      score: r.score,
      canal: r.canal,
      conteudo: r.conteudo,
      objetivo: dc_inferirObjetivo_(r.acaoEngine || r.acao, r.subAcao),
      curva: r.curva,
      motivoRegra: r.motivo,
      midiaCodigo: r.midia,
      midiaTitulo: midiaMeta.titulo || midiaMeta.nome || '',
      midiaDescricao: midiaMeta.descricao || midiaMeta.quandoUsar || '',
      midiaAcao: midiaMeta.acao || '',
      midiaSubcategoria: midiaMeta.subcategoria || '',
      midiaLink: r.linkMidiaDireto || midiaMeta.link || ''
    },
    criterios: {
      perfilComercial: r.perfilComercial,
      bucketNegocio: r.bucket,
      statusAtividade: r.statusAtividade,
      diasSemPostar: r.diasSemPostar,
      recorrenciaNivel: r.recorrenciaNivel,
      tendencia: r.tendencia,
      nivelAlerta: r.nivelAlerta,
      movimentoCurva: r.movimentoCurva,
      porteOperacional: r.porteOperacional,
      temContrato: r.temContrato,
      numeroContrato: r.numeroContrato,
      cartaoPostagem: r.cartaoPostagem,
      novoCliente: r.novoCliente,
      qtd30d: r.qtd30d,
      valor30d: r.valor30d,
      qtdTotal: r.qtdTotal,
      valorTotal: r.valorTotal,
      shareLocal30d: r.shareLocal30d,
      fdPctTexto: dc_pctText_(r.fdPct),
      qdPctTexto: dc_pctText_(r.qdPct),
      ddPctTexto: dc_pctText_(r.ddPct)
    },
    justificativa: dc_buildJustificativa_(r)
  };
}

function crmGetMidiaMetaByCode_(codigo){
  if (!codigo) return {};
  var items = op_readMidias_() || [];
  for (var i = 0; i < items.length; i++) {
    if (op_norm_(items[i].codigo) === op_norm_(codigo)) return items[i];
  }
  return {};
}

function dc_extractMasterRow_(row, hm) {
  return {
    clienteId: op_norm_(op_getCell_(row, hm, 'CLIENTE_ID')),
    cliente: op_norm_(op_getCell_(row, hm, 'CLIENTE')) || op_norm_(op_getCell_(row, hm, 'NOME_REMETENTE_BASE')),
    local: op_norm_(op_getCell_(row, hm, 'LOCAL_PREDOMINANTE')),
    curva: op_norm_(op_getCell_(row, hm, 'CURVA')),
    acao: op_norm_(op_getCell_(row, hm, 'ACAO')),
    acaoEngine: op_norm_(op_getCell_(row, hm, 'ACAO_ENGINE')),
    acaoAtual: op_norm_(op_getCell_(row, hm, 'ACAO_ATUAL')),
    subAcao: op_norm_(op_getCell_(row, hm, 'SUB_ACAO')),
    prioridade: op_norm_(op_getCell_(row, hm, 'PRIORIDADE_FILA')),
    score: Number(op_getCell_(row, hm, 'SCORE_PRIORIDADE')) || 0,
    canal: op_norm_(op_getCell_(row, hm, 'CANAL_SUGERIDO')),
    conteudo: op_norm_(op_getCell_(row, hm, 'CONTEUDO_SUGERIDO')),
    motivo: op_norm_(op_getCell_(row, hm, 'MOTIVO_REGRA')),
    midia: op_norm_(op_getCell_(row, hm, 'MIDIA')),
    linkMidiaDireto: op_norm_(op_getCell_(row, hm, 'LINK_MIDIA_DIRETO')),
    perfilComercial: op_norm_(op_getCell_(row, hm, 'PERFIL_COMERCIAL')),
    bucket: op_norm_(op_getCell_(row, hm, 'BUCKET_NEGOCIO')),
    statusAtividade: op_norm_(op_getCell_(row, hm, 'STATUS_ATIVIDADE')),
    diasSemPostar: Number(op_getCell_(row, hm, 'DIAS_SEM_POSTAR')) || 0,
    recorrenciaNivel: op_norm_(op_getCell_(row, hm, 'RECORRENCIA_NIVEL')),
    tendencia: op_norm_(op_getCell_(row, hm, 'TENDENCIA')),
    nivelAlerta: op_norm_(op_getCell_(row, hm, 'NIVEL_ALERTA')),
    movimentoCurva: op_norm_(op_getCell_(row, hm, 'MOVIMENTO_CURVA')),
    porteOperacional: op_norm_(op_getCell_(row, hm, 'PORTE_OPERACIONAL')),
    temContrato: op_norm_(op_getCell_(row, hm, 'TEM_CONTRATO')),
    numeroContrato: op_norm_(op_getCell_(row, hm, 'NUMERO_CONTRATO')),
    cartaoPostagem: op_norm_(op_getCell_(row, hm, 'CARTAO_POSTAGEM')),
    novoCliente: op_norm_(op_getCell_(row, hm, 'NOVO_CLIENTE')),
    qtd30d: Number(op_getCell_(row, hm, 'QTD_30D')) || 0,
    valor30d: Number(op_getCell_(row, hm, 'FAT_30D')) || 0,
    qtdTotal: Number(op_getCell_(row, hm, 'QTD_TOTAL')) || 0,
    valorTotal: Number(op_getCell_(row, hm, 'VALOR_TOTAL')) || 0,
    shareLocal30d: Number(op_getCell_(row, hm, 'SHARE_LOCAL_30D')) || 0,
    fdPct: op_getCell_(row, hm, 'FD_PCT'),
    qdPct: op_getCell_(row, hm, 'QD_PCT'),
    ddPct: op_getCell_(row, hm, 'DD_PCT'),
    proximaAcaoManual: op_norm_(op_getCell_(row, hm, 'PROXIMA_ACAO_MANUAL')),
    statusComercial: op_norm_(op_getCell_(row, hm, 'STATUS_COMERCIAL')),
    ultimaVisita: op_norm_(op_getCell_(row, hm, 'ULTIMA_VISITA'))
  };
}

function dc_inferirObjetivo_(acao, subAcao) {
  var a = op_upperNoAccents_(acao || '');
  var s = op_upperNoAccents_(subAcao || '');

  if (a === 'CONVERTER') {
    if (s.indexOf('VR_ESTRATEGICO') >= 0) return 'Migrar VR relevante para contrato.';
    if (s.indexOf('BALCAO_MADURO') >= 0) return 'Converter balcão maduro via abordagem mais forte.';
    if (s.indexOf('COMPARATIVO') >= 0) return 'Apresentar comparativo e puxar para contrato.';
    return 'Converter cliente sem contrato em relacionamento mais estruturado.';
  }

  // Compatibilidade defensiva: VISITAR não é recomendação estratégica desde a Fase 5.
  if (a === 'VISITAR') a = 'FIDELIZAR';

  if (a === 'RESGATAR') {
    return 'Reativar cliente com histórico relevante.';
  }

  if (a === 'FIDELIZAR') {
    if (s.indexOf('NOVO') >= 0) return 'Acelerar onboarding e criar hábito.';
    if (s.indexOf('MARKETPLACE') >= 0) return 'Proteger volume e orientar uso.';
    if (s.indexOf('CRESCENDO') >= 0) return 'Manter proximidade e sustentar crescimento.';
    return 'Preservar recorrência e relacionamento.';
  }

  if (a === 'MANTER') {
    return 'Acompanhar sem gastar esforço comercial desnecessário.';
  }

  if (a === 'CANCELAR') {
    return 'Tirar do foco comercial ativo por baixo retorno.';
  }

  return 'Sem objetivo definido.';
}

function dc_buildJustificativa_(r) {
  var itens = [];

  if (r.acaoAtual && r.acaoAtual !== r.acaoEngine && r.acaoEngine) {
    itens.push('A ação atual está diferente da ação do engine. Engine = ' + r.acaoEngine + ' | Atual = ' + r.acaoAtual + '.');
  }

  itens.push('Motivo direto da regra: ' + (r.motivo || 'Sem motivo preenchido.'));
  itens.push('Perfil comercial identificado: ' + (r.perfilComercial || '—') + '.');
  itens.push('Bucket de negócio: ' + (r.bucket || '—') + '.');
  itens.push('Curva atual: ' + (r.curva || '—') + '.');
  itens.push('Status de atividade: ' + (r.statusAtividade || '—') + ' (' + r.diasSemPostar + ' dias sem postar).');
  itens.push('Recorrência: ' + (r.recorrenciaNivel || '—') + '.');
  itens.push('Tendência: ' + (r.tendencia || '—') + ' | FD=' + dc_pctText_(r.fdPct) + ' | QD=' + dc_pctText_(r.qdPct) + ' | DD=' + dc_pctText_(r.ddPct) + '.');
  itens.push('Nível de alerta: ' + (r.nivelAlerta || '—') + '.');
  itens.push('Porte operacional: ' + (r.porteOperacional || '—') + '.');
  itens.push('Contrato: ' + (r.temContrato || '—') + (r.numeroContrato ? ' | Nº ' + r.numeroContrato : '') + '.');
  itens.push('Volume 30D: ' + r.qtd30d + ' objetos | ' + dc_money_(r.valor30d) + '.');
  itens.push('Histórico total: ' + r.qtdTotal + ' objetos | ' + dc_money_(r.valorTotal) + '.');
  itens.push('Share local 30D: ' + dc_pctText_(r.shareLocal30d * 100, true) + '.');
  if (r.novoCliente === 'SIM') itens.push('Marcado como novo cliente no mês atual.');

  return itens;
}

function dc_pctText_(n, alreadyPercent) {
  if (n === '' || n == null || isNaN(Number(n))) return '—';
  var val = Number(n);
  if (!alreadyPercent) return val.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  return val.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
}

function dc_money_(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dc_normSearch_(s) {
  s = op_norm_(s);
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return s.toUpperCase();
}

/* ========================= TESTE RÁPIDO ========================= */

function debugDiagnosticoCliente() {
  var lista = getClienteOptionsDiagnostico();
  if (!lista.length) throw new Error('Nenhum cliente encontrado.');
  Logger.log(JSON.stringify(diagnosticoClienteById(lista[0].clienteId), null, 2));
}