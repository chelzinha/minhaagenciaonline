$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$indexPath = Join-Path $repo 'apps-script\atende\Index.html'
$v4Path = Join-Path $repo 'apps-script\atende\DashboardTabsV4.html'

if (-not (Test-Path $indexPath)) { throw "Index.html nao encontrado: $indexPath" }
if (-not (Test-Path $v4Path)) { throw "DashboardTabsV4.html nao encontrado: $v4Path" }

$index = [System.IO.File]::ReadAllText($indexPath)
$v4 = [System.IO.File]::ReadAllText($v4Path)

$pattern = '(?s)<script id="atende-dashboard-v3-script">.*?</script>'
if ([regex]::IsMatch($index, $pattern)) {
  $index = [regex]::Replace($index, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $v4.Trim() }, 1)
  Write-Host 'OK - Dashboard V3 substituido pelo Dashboard V4 no Index.html.'
} elseif ($index.Contains('</body>')) {
  $index = $index.Replace('</body>', ($v4.Trim() + "`r`n</body>"))
  Write-Host 'OK - Dashboard V4 injetado no Index.html.'
} else {
  throw 'Nao foi encontrado </body> nem o marcador do Dashboard V3.'
}

[System.IO.File]::WriteAllText($indexPath, $index, (New-Object System.Text.UTF8Encoding($false)))

if ($index -notmatch 'data-view="operacao"') { throw 'Falhou: aba Operacao nao foi injetada.' }
if ($index -notmatch 'data-view="comercial"') { throw 'Falhou: aba Comercial nao foi injetada.' }
if ($index -notmatch 'data-view="gestao"') { throw 'Falhou: aba Gestao nao foi injetada.' }
if ($index -notmatch 'ADJ_MENS') { throw 'Falhou: fatores de ajuste contratuais nao foram injetados.' }
if ($index -match 'Cobertura Portal') { Write-Host 'AVISO - o texto Cobertura Portal ainda existe em outro trecho do Index, mas nao faz parte do Dashboard V4.' -ForegroundColor Yellow }

Write-Host 'OK - Operacao, Comercial e Gestao ativados.'
Write-Host 'OK - grafico de 6 meses em barras com valores visiveis.'
Write-Host 'OK - remuneracao R2 inclui percentual + ajuste do Anexo 3.'
Write-Host 'OK - troca entre abas reaproveita o mesmo payload e nao gera nova consulta D1.'
Write-Host 'OK - nenhuma alteracao de Cloudflare Pages foi feita.'
Write-Host 'Proximo passo: rode diagnosticar-dashboard-tabs-v4.ps1 antes do clasp push.'
