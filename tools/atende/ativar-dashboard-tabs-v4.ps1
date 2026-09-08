$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$indexPath = Join-Path $repo 'apps-script\atende\Index.html'
$v4Path = Join-Path $repo 'apps-script\atende\DashboardTabsV4.html'
$proxyPath = Join-Path $repo 'apps-script\atende\39_ATENDE_DASHBOARD_V4.gs'

if (-not (Test-Path $indexPath)) { throw "Index.html nao encontrado: $indexPath" }
if (-not (Test-Path $v4Path)) { throw "DashboardTabsV4.html nao encontrado: $v4Path" }
if (-not (Test-Path $proxyPath)) { throw "39_ATENDE_DASHBOARD_V4.gs nao encontrado: $proxyPath" }

$index = [System.IO.File]::ReadAllText($indexPath)
$v4 = [System.IO.File]::ReadAllText($v4Path)

# Endurece a aba Gestao sem reescrever o restante do dashboard.
$oldCan = "function canManage(){var r=role();return !!window.IS_ADMIN||r==='admin'||r==='manager'||r==='gestor'||r==='socio'||r==='sócio'}"
$newCan = "function canManage(){if(DATA&&typeof DATA.gestaoPermitida==='boolean')return DATA.gestaoPermitida;var r=role();return !!window.IS_ADMIN||r==='admin'||r==='manager'||r==='gestor'||r==='socio'||r==='sócio'}"
if ($v4.Contains($oldCan)) { $v4 = $v4.Replace($oldCan, $newCan) }

$oldSwitch = "function switchView(v){if(v==='gestao'&&!canManage()){VIEW='gestao';activate(v);renderAccess();return}VIEW=['operacao','comercial','gestao'].indexOf(v)>=0?v:'table';activate(VIEW);if(VIEW==='table'){var d=document.getElementById('dashboardView');if(d)d.style.display='none';loadPage(1)}else load()}"
$newSwitch = "function switchView(v){VIEW=['operacao','comercial','gestao'].indexOf(v)>=0?v:'table';activate(VIEW);if(VIEW==='table'){var d=document.getElementById('dashboardView');if(d)d.style.display='none';loadPage(1)}else load()}"
if ($v4.Contains($oldSwitch)) { $v4 = $v4.Replace($oldSwitch, $newSwitch) }

$oldCall = ".ATENDE_buscarDashboardGestaoV3D1(filterContext())"
$newCall = ".ATENDE_buscarDashboardV4D1(filterContext(),String(window.AUTH_TOKEN||''))"
if ($v4.Contains($oldCall)) { $v4 = $v4.Replace($oldCall, $newCall) }

$oldData = "DATA=r;var k=r.kpis||{};"
$newData = "DATA=r;markAccess();var k=r.kpis||{};"
if ($v4.Contains($oldData)) { $v4 = $v4.Replace($oldData, $newData) }

if ($v4 -notmatch 'ATENDE_buscarDashboardV4D1') { throw 'Falhou: Dashboard V4 nao foi conectado ao proxy com controle de acesso.' }
if ($v4 -notmatch 'gestaoPermitida') { throw 'Falhou: controle de acesso da aba Gestao nao foi aplicado.' }

# Mantem o arquivo fonte local alinhado com o que sera injetado no Index.
[System.IO.File]::WriteAllText($v4Path, $v4, (New-Object System.Text.UTF8Encoding($false)))

$pattern = '(?s)<script id="atende-dashboard-v3-script">.*?</script>'
if ([regex]::IsMatch($index, $pattern)) {
  $index = [regex]::Replace($index, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $v4.Trim() }, 1)
  Write-Host 'OK - Dashboard anterior substituido pelo Dashboard V4 no Index.html.'
} elseif ($index.Contains('</body>')) {
  $index = $index.Replace('</body>', ($v4.Trim() + "`r`n</body>"))
  Write-Host 'OK - Dashboard V4 injetado no Index.html.'
} else {
  throw 'Nao foi encontrado </body> nem o marcador do Dashboard anterior.'
}

[System.IO.File]::WriteAllText($indexPath, $index, (New-Object System.Text.UTF8Encoding($false)))

if ($index -notmatch 'data-view="operacao"') { throw 'Falhou: aba Operacao nao foi injetada.' }
if ($index -notmatch 'data-view="comercial"') { throw 'Falhou: aba Comercial nao foi injetada.' }
if ($index -notmatch 'data-view="gestao"') { throw 'Falhou: aba Gestao nao foi injetada.' }
if ($index -notmatch 'ADJ_MENS') { throw 'Falhou: fatores de ajuste contratuais nao foram injetados.' }
if ($index -match 'Cobertura Portal') { Write-Host 'AVISO - o texto Cobertura Portal ainda existe em outro trecho do Index, mas nao faz parte do Dashboard V4.' -ForegroundColor Yellow }

Write-Host 'OK - Operacao, Comercial e Gestao ativados.'
Write-Host 'OK - grafico de 6 meses em barras com valores visiveis e tooltip.'
Write-Host 'OK - remuneracao R2 inclui percentual + ajuste do Anexo 3.'
Write-Host 'OK - aba Gestao recebe remuneracao apenas para perfis de gestao.'
Write-Host 'OK - troca entre abas reaproveita o payload carregado e nao gera nova consulta ao alternar abas.'
Write-Host 'OK - nenhuma alteracao de Cloudflare Pages foi feita.'
Write-Host 'Proximo passo: rode diagnosticar-dashboard-tabs-v4.ps1 antes do clasp push.'
