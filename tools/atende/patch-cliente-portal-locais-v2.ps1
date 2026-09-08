$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$panelPath = Join-Path $repoRoot 'apps-script\atende\30_ATENDE_D1_PAINEL.gs'
$marker = 'ATENDE_CLIENTE_PORTAL_LOCAIS_UI_V2'

if (-not (Test-Path $indexPath)) { throw "Index.html nao encontrado: $indexPath" }
if (-not (Test-Path $panelPath)) { throw "30_ATENDE_D1_PAINEL.gs nao encontrado: $panelPath" }

function Require-Replace([string]$text,[string]$old,[string]$new,[string]$label) {
  if (-not $text.Contains($old)) { throw "Trecho nao encontrado para $label. Patch cancelado." }
  return $text.Replace($old,$new)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# ============================================================
# Apps Script proxy/panel columns
# ============================================================
$panel = [System.IO.File]::ReadAllText($panelPath)
if (-not $panel.Contains($marker)) {
  $panel = "// $marker`r`n" + $panel

  if ($panel.Contains("{ key: 'CADASTRO PORTAL'")) {
    $panel = $panel.Replace("{ key: 'CADASTRO PORTAL', label: 'CADASTRO PORTAL'", "{ key: 'CLIENTE PORTAL', label: 'CLIENTE PORTAL'")
  } elseif (-not $panel.Contains("{ key: 'CLIENTE PORTAL'")) {
    $old = "  { key: 'NOME REMETENTE', label: 'NOME REMETENTE', width: 200 },"
    $panel = Require-Replace $panel $old ($old + "`r`n  { key: 'CLIENTE PORTAL', label: 'CLIENTE PORTAL', width: 230 },") 'coluna CLIENTE PORTAL'
  }

  $panel = $panel.Replace("{ key: 'CLIENTE', label: 'CLIENTE', width: 230 }", "{ key: 'CLIENTE', label: 'RAZ\u00C3O SOCIAL', width: 230 }")

  if (-not $panel.Contains("clientePortal: ATENDE_listaFiltro_")) {
    $old = "    tipoObjeto: ATENDE_listaFiltro_(params, 'tiposObjeto', 'tipoObjeto'),"
    $panel = Require-Replace $panel $old ($old + "`r`n    clientePortal: ATENDE_listaFiltro_(params, 'clientesPortal', 'clientePortal'),") 'mapa clientePortal'
  }

  if (-not $panel.Contains("copy['CLIENTE PORTAL']")) {
    $old = "      copy.CLIENTE = '';"
    if ($panel.Contains($old)) { $panel = $panel.Replace($old,$old + "`r`n      copy['CLIENTE PORTAL'] = '';") }
  }

  if (-not $panel.Contains("hasOwnProperty.call(copy, 'CLIENTE PORTAL')")) {
    $old = "    if (!Object.prototype.hasOwnProperty.call(copy, 'CLIENTE')) copy.CLIENTE = '';"
    if ($panel.Contains($old)) { $panel = $panel.Replace($old,$old + "`r`n    if (!Object.prototype.hasOwnProperty.call(copy, 'CLIENTE PORTAL')) copy['CLIENTE PORTAL'] = '';") }
  }

  if (-not $panel.Contains("clientesPortal: response.clientesPortal")) {
    $old = "    contratoClientes: response.contratoClientes || [],"
    $panel = Require-Replace $panel $old ("    clientesPortal: response.clientesPortal || [],`r`n" + $old) 'retorno filtro CLIENTE PORTAL'
  }

  [System.IO.File]::WriteAllText($panelPath,$panel,$utf8NoBom)
}

# ============================================================
# Index.html
# ============================================================
$index = [System.IO.File]::ReadAllText($indexPath)
if (-not $index.Contains($marker)) {
  $index = $index.Replace('<body>',"<body>`r`n<!-- $marker -->")

  # Top filter.
  $topOld = '<div class="facet-field"><label>Cliente</label><div data-ms="contratoClientes"></div></div>'
  if ($index.Contains($topOld)) {
    $index = $index.Replace($topOld,'<div class="facet-field"><label>Cliente Portal</label><div data-ms="clientesPortal"></div></div>')
  }

  # Keep contract corporate name under More filters.
  $groupOld = '<div class="more-group"><div class="more-group-title">Contrato</div><div class="facet-field"><label>Intermediador</label><div data-ms="intermediadores"></div></div><div class="facet-field"><label>Tipo</label><div data-ms="contratoTipos"></div></div></div>'
  $groupNew = '<div class="more-group"><div class="more-group-title">Contrato</div><div class="facet-field"><label>Raz&atilde;o Social</label><div data-ms="contratoClientes"></div></div><div class="facet-field"><label>Intermediador</label><div data-ms="intermediadores"></div></div><div class="facet-field"><label>Tipo</label><div data-ms="contratoTipos"></div></div></div>'
  if ($index.Contains($groupOld)) { $index = $index.Replace($groupOld,$groupNew) }

  if (-not $index.Contains("'clientesPortal'")) {
    $index = $index.Replace("'servicoTabelas','contratoClientes'","'servicoTabelas','clientesPortal','contratoClientes'")
  }
  if (-not $index.Contains("'servicos','contratoClientes','intermediadores'")) {
    $index = $index.Replace("'servicos','intermediadores'","'servicos','contratoClientes','intermediadores'")
  }
  if (-not $index.Contains("clientesPortal:'Cliente Portal'")) {
    $index = $index.Replace("contratoClientes:'Cliente'","clientesPortal:'Cliente Portal',contratoClientes:'Raz\u00E3o Social'")
  }
  if (-not $index.Contains("clientesPortal:applied('clientesPortal')")) {
    $index = $index.Replace("servicoTabelas:applied('servicoTabelas'),contratoClientes:applied('contratoClientes')","servicoTabelas:applied('servicoTabelas'),clientesPortal:applied('clientesPortal'),contratoClientes:applied('contratoClientes')")
  }

  # Admin tab Locais.
  if (-not $index.Contains('data-tab="locais"')) {
    $tabAnchor = '<button class="admin-tab" data-tab="historico">'
    if (-not $index.Contains($tabAnchor)) { throw 'Botao Historico nao encontrado para inserir Locais.' }
    $index = $index.Replace($tabAnchor,'<button class="admin-tab" data-tab="locais">Locais</button>' + $tabAnchor)
  }

  if (-not $index.Contains('id="pane-locais"')) {
    $paneAnchor = '    <div class="admin-pane" id="pane-historico">'
    if (-not $index.Contains($paneAnchor)) { throw 'Pane historico nao encontrado.' }
    $pane = @'
    <div class="admin-pane" id="pane-locais">
      <div class="admin-note"><b>Biblioteca de Locais:</b> cadastre novos Locais e crie travas por <b>CLIENTE PORTAL</b>. A trava tem prioridade sobre Local manual, Atendente e Remetente.</div>
      <div class="admin-tools"><input class="admin-input" id="newLocalCode" style="width:150px" placeholder="Codigo (ex.: CENTRO)"><input class="admin-input grow" id="newLocalName" placeholder="Nome exibido do Local"><button class="btn btn-primary" onclick="saveNewLocal()"><span class="material-symbols-rounded">add</span>Adicionar Local</button></div>
      <div class="admin-tools"><input class="admin-input grow" id="searchPortalLocal" placeholder="Buscar CLIENTE PORTAL" oninput="renderAdminLocations()"><select class="admin-input" id="filterPortalLocal" style="width:190px" onchange="renderAdminLocations()"><option value="">Todos os Locais</option></select><span class="status" id="portalLocalCount"></span></div>
      <div class="bulkbar on" style="margin-bottom:8px"><strong id="portalBulkCount">0 selecionados</strong><span>Travar em:</span><select id="portalBulkLocal"></select><button class="btn btn-primary" onclick="applyPortalLocalBulk()">Aplicar ao grupo</button><button class="btn" onclick="clearPortalLocalSelection()">Limpar</button></div>
      <div id="adminPortalLocals"></div>
    </div>
'@
    $index = $index.Replace($paneAnchor,$pane + $paneAnchor)
  }

  # Portal selection state.
  if (-not $index.Contains('PORTAL_LOCAL_SELECTED')) {
    $old = "var AUTH_TOKEN='',AUTH_USER=null,IS_ADMIN=false,SELECTED=new Set(),ADMIN_DATA=null,ADMIN_SERVICE_ROWS=[];"
    $new = "var AUTH_TOKEN='',AUTH_USER=null,IS_ADMIN=false,SELECTED=new Set(),ADMIN_DATA=null,ADMIN_SERVICE_ROWS=[],PORTAL_LOCAL_SELECTED=new Set();"
    $index = Require-Replace $index $old $new 'estado selecao portal'
  }

  $index = $index.Replace('renderAdminContracts();renderAdminClients();renderAdminHistory();','renderAdminContracts();renderAdminClients();renderAdminLocations();renderAdminHistory();')

  # Visual contract terminology.
  $index = $index.Replace('<th>Contrato</th><th>Ocorr.</th><th>Cliente</th><th>Tipo</th>','<th>Contrato</th><th>Ocorr.</th><th>Raz&atilde;o Social</th><th>Tipo</th>')
  $index = $index.Replace('placeholder="Cliente"></td>','placeholder="Razao Social"></td>')

  # Local helpers and Admin Locais.
  if (-not $index.Contains('function renderAdminLocations()')) {
    $anchor = 'function renderAdminHistory()'
    if (-not $index.Contains($anchor)) { throw 'renderAdminHistory nao encontrado.' }
    $js = @'
function adminLocalList(){var rows=(ADMIN_DATA&&ADMIN_DATA.locais)||[];if(!rows.length)rows=[{codigo:'AGF',nome:'AGF'},{codigo:'METRO',nome:'METR\u00D4'}];return rows}
function localOptions(selected,emptyLabel){selected=String(selected||'');var html=emptyLabel==null?'':'<option value="">'+esc(emptyLabel)+'</option>';var found=false;adminLocalList().forEach(function(l){var c=String(l.codigo||''),n=String(l.nome||c);if(c===selected)found=true;html+='<option value="'+esc(c)+'" '+(c===selected?'selected':'')+'>'+esc(n)+'</option>'});if(selected&&!found)html+='<option value="'+esc(selected)+'" selected>'+esc(selected)+'</option>';return html}
function refreshAdminLocalSelects(){var a=document.getElementById('clienteLocal');if(a){var av=a.value;a.innerHTML=localOptions(av,'Sem padrao')}var b=document.getElementById('bulkLocal');if(b){var bv=b.value;b.innerHTML=localOptions(bv,'Usar local padrao')}var p=document.getElementById('portalBulkLocal');if(p){var pv=p.value;p.innerHTML=localOptions(pv,'Remover trava')}var f=document.getElementById('filterPortalLocal');if(f){var fv=f.value;f.innerHTML='<option value="">Todos os Locais</option>'+adminLocalList().map(function(l){return'<option value="'+esc(l.codigo)+'" '+(String(l.codigo)===fv?'selected':'')+'>'+esc(l.nome||l.codigo)+'</option>'}).join('')}}
function renderAdminLocations(){if(!ADMIN_DATA)return;refreshAdminLocalSelects();var q=getValue('searchPortalLocal').toLowerCase(),lf=getValue('filterPortalLocal'),all=ADMIN_DATA.clientesPortalAdmin||[],filtered=all.filter(function(x){var t=String(x.cliente_portal||'').toLowerCase();return(!q||t.includes(q))&&(!lf||String(x.local_codigo||'')===lf)}),rows=filtered.slice(0,500),count=document.getElementById('portalLocalCount');if(count)count.textContent=filtered.length.toLocaleString('pt-BR')+' de '+all.length.toLocaleString('pt-BR');document.getElementById('adminPortalLocals').innerHTML='<table class="admin-table"><thead><tr><th style="width:34px"><input type="checkbox" onchange="togglePortalLocalAll(this.checked)"></th><th>CLIENTE PORTAL</th><th>Ocorr.</th><th>Local travado</th><th></th></tr></thead><tbody>'+rows.map(function(x,i){var name=String(x.cliente_portal||''),checked=PORTAL_LOCAL_SELECTED.has(name);return'<tr><td><input type="checkbox" class="portalLocalCheck" '+(checked?'checked':'')+' onchange="togglePortalLocal(\''+js(name)+'\',this.checked)"></td><td>'+esc(name)+'</td><td>'+Number(x.ocorrencias||0).toLocaleString('pt-BR')+'</td><td><select id="portal-local-'+i+'">'+localOptions(x.local_codigo||'','Sem trava')+'</select></td><td><button class="btn" onclick="savePortalClientLocal(\''+js(name)+'\','+i+')">Salvar</button></td></tr>'}).join('')+'</tbody></table>';updatePortalBulkCount()}
function saveNewLocal(){var nome=getValue('newLocalName').trim(),codigo=getValue('newLocalCode').trim();if(!nome){setAdminStatus('Informe o nome do Local.','err');return}setAdminStatus('Salvando Local...','');google.script.run.withSuccessHandler(function(){document.getElementById('newLocalName').value='';document.getElementById('newLocalCode').value='';setAdminStatus('Local salvo','ok');loadAdminData();loadFilterOptions();loadPage(PAGE)}).withFailureHandler(function(e){setAdminStatus(e.message||String(e),'err')}).ATENDE_adminSalvarLocal(AUTH_TOKEN,{codigo:codigo,nome:nome})}
function savePortalClientLocal(name,i){setAdminStatus('Salvando trava...','');google.script.run.withSuccessHandler(function(){setAdminStatus('Trava salva','ok');loadAdminData();loadFilterOptions();loadPage(PAGE)}).withFailureHandler(function(e){setAdminStatus(e.message||String(e),'err')}).ATENDE_adminSalvarTravaClientePortal(AUTH_TOKEN,{clientePortal:name,localCodigo:getValue('portal-local-'+i)})}
function togglePortalLocal(name,on){if(on)PORTAL_LOCAL_SELECTED.add(name);else PORTAL_LOCAL_SELECTED.delete(name);updatePortalBulkCount()}
function togglePortalLocalAll(on){document.querySelectorAll('.portalLocalCheck').forEach(function(x){x.checked=on;x.dispatchEvent(new Event('change'))})}
function clearPortalLocalSelection(){PORTAL_LOCAL_SELECTED.clear();document.querySelectorAll('.portalLocalCheck').forEach(function(x){x.checked=false});updatePortalBulkCount()}
function updatePortalBulkCount(){var e=document.getElementById('portalBulkCount');if(e)e.textContent=PORTAL_LOCAL_SELECTED.size+' selecionado'+(PORTAL_LOCAL_SELECTED.size===1?'':'s')}
function applyPortalLocalBulk(){if(!PORTAL_LOCAL_SELECTED.size){setAdminStatus('Selecione pelo menos um CLIENTE PORTAL.','err');return}var local=getValue('portalBulkLocal'),items=Array.from(PORTAL_LOCAL_SELECTED),acao=local?('travar em '+local):'remover a trava';if(!confirm(acao+' para '+items.length+' cliente(s) do Portal?'))return;setAdminStatus('Aplicando grupo...','');google.script.run.withSuccessHandler(function(){clearPortalLocalSelection();setAdminStatus('Grupo atualizado','ok');loadAdminData();loadFilterOptions();loadPage(PAGE)}).withFailureHandler(function(e){setAdminStatus(e.message||String(e),'err')}).ATENDE_adminSalvarTravasClientePortalLote(AUTH_TOKEN,{clientesPortal:items,localCodigo:local})}
function applyPortalLocalUi(){if(!IS_ADMIN)return;ROWS.forEach(function(r){var id=Number(r._RAW_ID||0);if(!id)return;var tr=document.querySelector('tr[data-id="'+id+'"]');if(!tr)return;var locked=Number(r._LOCAL_TRAVADO||0)===1,check=tr.querySelector('.rowCheck'),sel=tr.querySelector('.local-select');if(locked&&check){check.disabled=true;check.title='Local travado pelo CLIENTE PORTAL'}if(!sel)return;if(locked){var td=sel.parentNode;td.title='Local travado pelo CLIENTE PORTAL: '+String(r['CLIENTE PORTAL']||'');td.innerHTML='<span class="obj-chip">&#128274; '+esc(r.LOCAL||r._LOCAL_TRAVA_PORTAL||'')+'</span>'}else{sel.innerHTML=localOptions(r.LOCAL||'','Padrao');sel.value=String(r.LOCAL||'')}}})}
'@
    $index = $index.Replace($anchor,$js + $anchor)
  }

  # Apply dynamic/locked Local UI after each render.
  $renderOld = 'buildHead();buildBody();renderPager()}'
  if ($index.Contains($renderOld) -and -not $index.Contains('buildBody();applyPortalLocalUi();renderPager()')) {
    $index = $index.Replace($renderOld,'buildHead();buildBody();applyPortalLocalUi();renderPager()}')
  }

  # Select-all must ignore rows locked by CLIENTE PORTAL.
  $toggleOld = "function toggleAll(on){ROWS.forEach(function(r){var id=Number(r._RAW_ID||0);if(id){if(on)SELECTED.add(id);else SELECTED.delete(id)}});"
  $toggleNew = "function toggleAll(on){ROWS.forEach(function(r){var id=Number(r._RAW_ID||0),locked=Number(r._LOCAL_TRAVADO||0)===1;if(id&&!locked){if(on)SELECTED.add(id);else SELECTED.delete(id)}});"
  if ($index.Contains($toggleOld)) { $index = $index.Replace($toggleOld,$toggleNew) }

  [System.IO.File]::WriteAllText($indexPath,$index,$utf8NoBom)
}

Write-Host 'OK - Cliente Portal, Razao Social, Locais e travas aplicados.' -ForegroundColor Green
Write-Host 'Hierarquia: CLIENTE PORTAL travado > Manual > Atendente > Remetente > vazio.' -ForegroundColor Cyan
Write-Host 'Arquivos: Index.html e 30_ATENDE_D1_PAINEL.gs' -ForegroundColor DarkGray
