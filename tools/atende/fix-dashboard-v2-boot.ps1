$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$path = Join-Path $repoRoot 'apps-script\atende\DashboardAddon.html'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $path)) { throw "DashboardAddon.html nao encontrado: $path" }

$content = [System.IO.File]::ReadAllText($path)

$old = "if(document.readyState==='complete')setTimeout(init,30);else window.addEventListener('load',function(){setTimeout(init,30)});"

$new = @'
function bootDashboardV2(attempt){
    attempt=Number(attempt||0);
    window.ATENDE_DASHBOARD_V2_SOURCE='gestao-v2';

    var top=document.querySelector('.table-top');
    var wrap=document.getElementById('wrap');
    if(top&&wrap){
      init();
      window.ATENDE_DASHBOARD_V2_READY=!!document.getElementById('viewSwitchRow');
      return;
    }

    if(attempt<80){
      setTimeout(function(){bootDashboardV2(attempt+1)},100);
    }else{
      window.ATENDE_DASHBOARD_V2_READY=false;
      console.error('Dashboard V2: table-top ou wrap nao encontrados apos as tentativas de inicializacao.');
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){bootDashboardV2(0)},{once:true});
  }else{
    bootDashboardV2(0);
  }

  window.addEventListener('load',function(){bootDashboardV2(0)},{once:true});
'@

if ($content.Contains('function bootDashboardV2(attempt)')) {
  Write-Host 'DashboardAddon.html ja possui o boot robusto da V2.' -ForegroundColor Green
} else {
  $count = ([regex]::Matches($content, [regex]::Escape($old))).Count
  if ($count -ne 1) {
    throw "Boot antigo nao encontrado de forma unica (encontrados: $count). Patch cancelado."
  }
  $content = $content.Replace($old, $new.Trim())
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
  Write-Host 'OK - boot do Dashboard V2 trocado por inicializacao robusta com retry.' -ForegroundColor Green
}

$check = [System.IO.File]::ReadAllText($path)
if (-not $check.Contains('function bootDashboardV2(attempt)')) { throw 'Validacao falhou: bootDashboardV2 ausente.' }
if (-not $check.Contains("ATENDE_DASHBOARD_V2_SOURCE='gestao-v2'")) { throw 'Validacao falhou: marcador da V2 ausente.' }
if ($check.Contains($old)) { throw 'Validacao falhou: boot antigo ainda presente.' }

Write-Host 'OK - Dashboard V2 nao depende mais exclusivamente do window.load.' -ForegroundColor Green
Write-Host 'Arquivo alterado:' $path
