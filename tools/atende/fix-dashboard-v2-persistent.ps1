$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$path = Join-Path $repoRoot 'apps-script\atende\DashboardAddon.html'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $path)) { throw "DashboardAddon.html nao encontrado: $path" }

$content = [System.IO.File]::ReadAllText($path)

if ($content.Contains('ATENDE_DASHBOARD_V2_PERSISTENT')) {
  Write-Host 'Dashboard V2 persistente ja aplicado.' -ForegroundColor Green
  exit 0
}

$initStart = $content.IndexOf('  function init(){')
$switchStart = $content.IndexOf('  function switchView(', $initStart)
if ($initStart -lt 0 -or $switchStart -lt 0) {
  throw 'Nao foi possivel localizar o bloco init()/switchView(). Patch cancelado.'
}

$newInit = @'
  function init(){
    installStyle();
    var top=document.querySelector('.table-top'),wrap=document.getElementById('wrap');
    if(!top||!wrap)return false;

    var row=document.getElementById('viewSwitchRow');
    if(!row){
      row=document.createElement('div');row.id='viewSwitchRow';row.className='view-switch-row';
      row.innerHTML='<div class="view-switch"><button type="button" data-view="table" class="active"><span class="material-symbols-rounded">table_rows</span>Tabela</button><button type="button" data-view="dashboard"><span class="material-symbols-rounded">dashboard</span>Dashboard</button></div><span class="view-hint">Os filtros acima valem para as duas visões.</span>';
      top.appendChild(row);
      row.querySelectorAll('button[data-view]').forEach(function(b){b.addEventListener('click',function(){switchView(this.getAttribute('data-view'))})});
    }

    var dash=document.getElementById('dashboardView');
    if(!dash){
      dash=document.createElement('div');dash.id='dashboardView';dash.className='dashboard-view';dash.innerHTML='<div class="db-loading">Abra a visão Dashboard para carregar os indicadores.</div>';wrap.appendChild(dash);
    }

    if(!window.ATENDE_DASHBOARD_V2_REFRESH_PATCHED){
      var originalRefresh=window.refreshFilteredView;
      window.refreshFilteredView=function(){var a=getValue('dataInicio'),b=getValue('dataFim');if(a&&b&&a>b){alert('A data inicial não pode ser maior que a data final.');return}updateMonthLabel();renderActiveChips();updateMoreButton();if(DASH_VIEW==='dashboard')loadDashboard();else loadPage(1);loadFilterOptions()};
      window.ATENDE_dashboardOriginalRefresh=originalRefresh;
      window.ATENDE_DASHBOARD_V2_REFRESH_PATCHED=true;
    }

    window.ATENDE_DASHBOARD_V2_READY=true;
    return true;
  }

'@

$content = $content.Substring(0,$initStart) + $newInit + $content.Substring($switchStart)

$bootStart = $content.IndexOf('  function bootDashboardV2(')
$iifeEnd = $content.LastIndexOf('})();')
if ($bootStart -lt 0 -or $iifeEnd -lt 0 -or $iifeEnd -le $bootStart) {
  throw 'Nao foi possivel localizar o bloco bootDashboardV2()/IIFE. Patch cancelado.'
}

$newBoot = @'
  /* ATENDE_DASHBOARD_V2_PERSISTENT */
  function bootDashboardV2(attempt){
    attempt=Number(attempt||0);
    window.ATENDE_DASHBOARD_V2_SOURCE='gestao-v2';
    if(init())return true;
    if(attempt<80){setTimeout(function(){bootDashboardV2(attempt+1)},100)}
    else{window.ATENDE_DASHBOARD_V2_READY=false;console.error('Dashboard V2: table-top ou wrap nao encontrados apos as tentativas de inicializacao.')}
    return false;
  }

  function watchDashboardV2(){
    bootDashboardV2(0);

    if(window.MutationObserver&&!window.ATENDE_DASHBOARD_V2_OBSERVER){
      var observer=new MutationObserver(function(){
        if(!document.getElementById('viewSwitchRow')||!document.getElementById('dashboardView'))bootDashboardV2(0);
      });
      observer.observe(document.documentElement||document.body,{childList:true,subtree:true});
      window.ATENDE_DASHBOARD_V2_OBSERVER=observer;
    }

    if(!window.ATENDE_DASHBOARD_V2_WATCHDOG){
      window.ATENDE_DASHBOARD_V2_WATCHDOG=setInterval(function(){
        if(document.visibilityState==='hidden')return;
        if(!document.getElementById('viewSwitchRow')||!document.getElementById('dashboardView'))bootDashboardV2(0);
      },1500);
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',watchDashboardV2,{once:true});
  }else{
    watchDashboardV2();
  }
  window.addEventListener('load',watchDashboardV2,{once:true});
'@

$content = $content.Substring(0,$bootStart) + $newBoot + "`r`n" + $content.Substring($iifeEnd)

[System.IO.File]::WriteAllText($path,$content,$utf8NoBom)

$check = [System.IO.File]::ReadAllText($path)
if (-not $check.Contains('ATENDE_DASHBOARD_V2_PERSISTENT')) { throw 'Marker persistente nao encontrado apos escrita.' }
if (-not $check.Contains("document.getElementById('viewSwitchRow')||!document.getElementById('dashboardView')")) { throw 'Watchdog do Dashboard V2 nao encontrado apos escrita.' }

Write-Host 'OK - Dashboard V2 agora recria o seletor se o front o remover durante a carga.' -ForegroundColor Green
Write-Host 'OK - init() ficou idempotente e o watchdog monitora viewSwitchRow/dashboardView.' -ForegroundColor Green
Write-Host 'Rode diagnosticar-dashboard-addon.ps1 antes do clasp push.' -ForegroundColor Cyan
