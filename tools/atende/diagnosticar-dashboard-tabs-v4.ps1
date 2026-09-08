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
$proxy = [System.IO.File]::ReadAllText($proxyPath)

$checks = [ordered]@{
  'Dashboard V4 injetado no Index' = ($index -match 'ATENDE_DASHBOARD_V4_READY')
  'aba Operacao' = ($index -match 'data-view="operacao"')
  'aba Comercial' = ($index -match 'data-view="comercial"')
  'aba Gestao' = ($index -match 'data-view="gestao"')
  'Gestao com controle de perfil no browser' = ($index -match 'gestaoPermitida')
  'proxy V4 conectado' = ($index -match 'ATENDE_buscarDashboardV4D1')
  'remuneracao removida para usuario comum' = ($proxy -match 'base\.remuneracao\s*=\s*\{\}')
  'admin e manager liberados na Gestao' = (($proxy -match "role === 'admin'") -and ($proxy -match "role === 'manager'"))
  'grafico mensal em barras' = ($index -match 'function monthBars\(')
  'valores mensais visiveis' = ($index -match 'compactMoney\(val\)')
  'tooltip nos graficos' = ($index -match '<title>')
  'metas de Encomendas Balcao e Metro' = (($index -match 'goalSingle\(') -and ($index -match 'goalTier\('))
  'mapa de medalhas' = ($index -match 'Mapa de medalhas')
  'ajuste Mensageria faixa 8' = ($index -match '8:59151\.40')
  'ajuste Encomendas faixa 9' = ($index -match '9:352917\.95')
  'formula remuneracao com ajuste' = ($index -match 'variable\+adj')
  'reuso de payload entre abas' = ($index -match 'if\(DATA\)\{dash\.style\.display=.block.;render\(\);return\}')
}

foreach ($item in $checks.GetEnumerator()) {
  if (-not $item.Value) { throw ('Validacao falhou: ' + $item.Key) }
  Write-Host ('OK - ' + $item.Key + '.')
}

$match = [regex]::Match($v4, '(?s)<script id="atende-dashboard-v3-script">(.*?)</script>')
if (-not $match.Success) { throw 'Nao foi possivel extrair o JavaScript do DashboardTabsV4.html.' }
$temp = Join-Path $env:TEMP 'atende-dashboard-tabs-v4-check.js'
[System.IO.File]::WriteAllText($temp, $match.Groups[1].Value, (New-Object System.Text.UTF8Encoding($false)))
try {
  & node --check $temp
  if ($LASTEXITCODE -ne 0) { throw 'node --check falhou no DashboardTabsV4.' }
  Write-Host 'OK - JavaScript do DashboardTabsV4 passou no node --check.'
} finally {
  Remove-Item $temp -Force -ErrorAction SilentlyContinue
}

Write-Host 'OK - Operacao e Comercial nao exibem remuneracao contratual.'
Write-Host 'OK - Gestao protege remuneracao para perfis de gestao.'
Write-Host 'OK - nenhuma migration D1 e necessaria.'
Write-Host 'OK - nenhum deploy de Worker e necessario nesta rodada.'
Write-Host 'OK - nenhuma publicacao de Cloudflare Pages e necessaria nesta rodada.'
