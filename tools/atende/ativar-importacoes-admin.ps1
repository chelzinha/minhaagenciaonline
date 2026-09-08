$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$path = Join-Path $repoRoot 'apps-script\atende\DashboardV3.html'
if (-not (Test-Path $path)) { throw "DashboardV3.html nao encontrado: $path" }

$content = [System.IO.File]::ReadAllText($path)

if ($content -match 'function\s+ensureImportAdmin\(') {
  Write-Host 'Importacoes Admin ja esta ativo no DashboardV3.html.' -ForegroundColor Yellow
} else {
  $anchor = "  function ensureMetaAdmin(){"
  $count = ([regex]::Matches($content, [regex]::Escape($anchor))).Count
  if ($count -ne 1) { throw "Anchor ensureMetaAdmin nao encontrado de forma unica (encontrados: $count). Patch cancelado." }

  $block = @'
  var IMPORT_RUN_ACTIVE=false,IMPORT_RUN_ROUNDS=0,IMPORT_RUN_MAX_ROUNDS=25;

  function ensureImportAdmin(){
    var tabs=document.querySelector('.admin-tabs'),body=document.querySelector('.admin-body');
    if(!tabs||!body||document.getElementById('pane-importacoes'))return;
    var btn=document.createElement('button');btn.className='admin-tab';btn.type='button';btn.dataset.tab='importacoes';btn.textContent='Importa\u00e7\u00f5es';tabs.appendChild(btn);
    var pane=document.createElement('div');pane.className='admin-pane';pane.id='pane-importacoes';
    pane.innerHTML='<div class="admin-note"><b>Importa\u00e7\u00f5es do Drive:</b> coloque quantos CSVs quiser na pasta <b>ENTRADA</b>. O bot\u00e3o abaixo executa o mesmo fluxo oficial do gatilho: ENTRADA \u2192 D1 \u2192 PROCESSADA e atualiza o CLIENTE PORTAL ao concluir o Consolidador.</div>'+
      '<div class="admin-tools"><button class="btn" id="dbImportRefresh" type="button"><span class="material-symbols-rounded">refresh</span>Atualizar lista</button><button class="btn btn-primary" id="dbImportRunBtn" type="button"><span class="material-symbols-rounded">play_arrow</span>Processar tudo agora</button><span class="status" id="dbImportStatus"></span></div>'+
      '<div class="db-admin-meta-grid" style="margin-bottom:10px"><section class="db-admin-meta-card"><h3>ENTRADA</h3><div style="font-size:22px;font-weight:900;color:var(--nv)" id="dbImportPending">-</div><div style="font-size:8px;color:var(--muted);margin-top:3px">arquivos aguardando</div></section><section class="db-admin-meta-card"><h3>Automa\u00e7\u00e3o</h3><div style="font-size:12px;font-weight:900;color:var(--nv)" id="dbImportTrigger">-</div><div style="font-size:8px;color:var(--muted);margin-top:3px" id="dbImportTriggerSub">-</div></section><section class="db-admin-meta-card"><h3>Fluxo</h3><div style="font-size:11px;font-weight:900;color:var(--nv)">ENTRADA \u2192 PROCESSADA</div><div style="font-size:8px;color:var(--muted);margin-top:3px">RAW preservado e idempotente</div></section></div>'+
      '<div id="dbImportFiles"></div>';
    body.appendChild(pane);
    btn.addEventListener('click',function(){document.querySelectorAll('.admin-tab').forEach(function(x){x.classList.toggle('active',x===btn)});document.querySelectorAll('.admin-pane').forEach(function(x){x.classList.toggle('active',x===pane)});loadImportAdmin()});
    document.getElementById('dbImportRefresh').addEventListener('click',loadImportAdmin);
    document.getElementById('dbImportRunBtn').addEventListener('click',processImportAdmin);
  }

  function setImportStatus(text,cls){var e=document.getElementById('dbImportStatus');if(e){e.textContent=text||'';e.className='status '+(cls||'')}}
  function formatImportSize(bytes){bytes=Number(bytes||0);if(bytes>=1048576)return(bytes/1048576).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB';if(bytes>=1024)return(bytes/1024).toLocaleString('pt-BR',{maximumFractionDigits:0})+' KB';return bytes.toLocaleString('pt-BR')+' B'}
  function formatImportDate(value){var d=new Date(value);if(!Number.isFinite(d.getTime()))return'';return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}

  function renderImportAdmin(r){
    r=r||{};var files=Array.isArray(r.files)?r.files:[],trigger=r.trigger||{};
    var pending=document.getElementById('dbImportPending'),tr=document.getElementById('dbImportTrigger'),sub=document.getElementById('dbImportTriggerSub'),host=document.getElementById('dbImportFiles');
    if(pending)pending.textContent=integer(r.pending||files.length);
    if(tr)tr.textContent=trigger.installed?'Ativo':'Inativo';
    if(sub)sub.textContent=trigger.cadence||'';
    if(!host)return;
    if(!files.length){host.innerHTML='<div class="admin-note" style="background:#ecfdf3;color:#166534"><b>ENTRADA vazia.</b> N\u00e3o h\u00e1 CSV aguardando processamento.</div>';return}
    host.innerHTML='<table class="admin-table"><thead><tr><th>Arquivo</th><th>Tamanho</th><th>Atualizado</th><th>Status</th></tr></thead><tbody>'+files.map(function(f){return'<tr><td><b>'+esc(f.name||'')+'</b></td><td>'+esc(formatImportSize(f.size))+'</td><td>'+esc(formatImportDate(f.updatedAt))+'</td><td><span class="db-delta neutral">Aguardando</span></td></tr>'}).join('')+'</tbody></table>';
  }

  function loadImportAdmin(){
    if(!window.AUTH_TOKEN&&!AUTH_TOKEN){setImportStatus('Sess\u00e3o Admin ausente.','err');return}
    setImportStatus('Atualizando...','');
    google.script.run.withSuccessHandler(function(r){renderImportAdmin(r);setImportStatus(Number(r&&r.pending||0)?integer(r.pending)+' arquivo(s) na ENTRADA.':'ENTRADA vazia.','ok')}).withFailureHandler(function(e){setImportStatus(e&&e.message?e.message:String(e),'err')}).ATENDE_adminStatusImportacoes(AUTH_TOKEN);
  }

  function processImportAdmin(){
    if(IMPORT_RUN_ACTIVE)return;
    if(!AUTH_TOKEN){setImportStatus('Sess\u00e3o Admin ausente.','err');return}
    if(!confirm('Processar agora todos os CSVs que estiverem na pasta ENTRADA?'))return;
    IMPORT_RUN_ACTIVE=true;IMPORT_RUN_ROUNDS=0;setImportRunButton(true);runNextImportRound();
  }

  function setImportRunButton(on){var b=document.getElementById('dbImportRunBtn');if(!b)return;b.disabled=!!on;b.innerHTML=on?'<span class="material-symbols-rounded">hourglass_top</span>Processando...':'<span class="material-symbols-rounded">play_arrow</span>Processar tudo agora'}

  function finishImportRun(message,cls,reload){
    IMPORT_RUN_ACTIVE=false;setImportRunButton(false);setImportStatus(message,cls||'ok');
    if(reload){try{loadFilterOptions()}catch(_){ }try{if(DASH_VIEW==='dashboard')loadDashboard();else loadPage(1)}catch(_){ }}
  }

  function runNextImportRound(){
    IMPORT_RUN_ROUNDS++;
    setImportStatus('Processando ENTRADA... rodada '+IMPORT_RUN_ROUNDS,'');
    google.script.run.withSuccessHandler(function(r){
      r=r||{};renderImportAdmin(r);var run=r.run||{},pending=Number(r.pending||0),errors=Array.isArray(run.errors)?run.errors:[];
      var completed=Number(run.filesCompleted||0),partial=Number(run.filesPartial||0),sent=Number(run.sentThisRun||0);
      setImportStatus('Rodada '+IMPORT_RUN_ROUNDS+': '+completed+' conclu\u00eddo(s), '+partial+' parcial(is), '+integer(sent)+' linhas enviadas. '+pending+' pendente(s).',errors.length?'err':'');
      if(pending<=0){finishImportRun('Importa\u00e7\u00e3o conclu\u00edda. ENTRADA vazia.','ok',true);return}
      if(errors.length){var first=errors[0]||{};finishImportRun('Processamento interrompido: '+(first.fileName?first.fileName+' - ':'')+(first.error||'erro no arquivo')+'. O arquivo permaneceu na ENTRADA.','err',true);return}
      if(r.canContinueAutomatically&&IMPORT_RUN_ROUNDS<IMPORT_RUN_MAX_ROUNDS){setTimeout(runNextImportRound,900);return}
      if(IMPORT_RUN_ROUNDS>=IMPORT_RUN_MAX_ROUNDS){finishImportRun('Limite de rodadas atingido com '+pending+' arquivo(s) ainda na ENTRADA. Clique novamente para continuar.','err',true);return}
      finishImportRun(pending+' arquivo(s) continuam na ENTRADA. Clique em Processar tudo agora para continuar.','err',true);
    }).withFailureHandler(function(e){finishImportRun(e&&e.message?e.message:String(e),'err',false)}).ATENDE_adminProcessarImportacoes(AUTH_TOKEN);
  }

'@

  $content = $content.Replace($anchor, $block + $anchor)
}

$oldInit = "installStyle();renameCanalUi();ensureMetaAdmin();"
$newInit = "installStyle();renameCanalUi();ensureMetaAdmin();ensureImportAdmin();"
if ($content.Contains($oldInit)) {
  $content = $content.Replace($oldInit,$newInit)
} elseif (-not $content.Contains($newInit)) {
  throw 'Chamada init() esperada nao encontrada. Patch cancelado.'
}

[System.IO.File]::WriteAllText($path,$content,(New-Object System.Text.UTF8Encoding($false)))

$after = [System.IO.File]::ReadAllText($path)
$checks = @(
  'function ensureImportAdmin',
  'ATENDE_adminStatusImportacoes',
  'ATENDE_adminProcessarImportacoes',
  'ensureMetaAdmin();ensureImportAdmin();',
  'Processar tudo agora'
)
foreach($check in $checks){if($after.IndexOf($check,[System.StringComparison]::Ordinal) -lt 0){throw "Validacao falhou: $check"}}

Write-Host 'OK - aba Importacoes adicionada ao Admin do DashboardV3.' -ForegroundColor Green
Write-Host 'OK - processamento automatico em rodadas sucessivas configurado.' -ForegroundColor Green
Write-Host 'OK - nenhum arquivo do Index.html ou do frontend externo foi alterado.' -ForegroundColor Green
