$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $root 'apps-script\atende\Index.html'
$addonPath = Join-Path $root 'apps-script\atende\DashboardLayoutAddon.html'

if (-not (Test-Path $indexPath)) { throw 'Index.html nao encontrado.' }
if (-not (Test-Path $addonPath)) { throw 'DashboardLayoutAddon.html nao encontrado.' }

$index = [System.IO.File]::ReadAllText($indexPath)
$addon = [System.IO.File]::ReadAllText($addonPath)

$checks = [ordered]@{
  'addon injetado no Index' = $index.Contains('id="atende-dashboard-layout-addon"')
  'Local promovido para primeira linha' = $addon.Contains('moveLocalToPrimaryRow') -and $addon.Contains('query-local')
  'totalizadores movidos para view-switch-row' = $addon.Contains('viewSummaryControls') -and $addon.Contains("document.getElementById('info')") -and $addon.Contains("document.getElementById('totalValue')")
  'texto auxiliar removido' = $addon.Contains("row.querySelector('.view-hint')") -and $addon.Contains('hint.remove()')
  'botao Colunas movido para view-switch-row' = $addon.Contains("document.getElementById('tcColumnsBtn')") -and $addon.Contains('viewColumnsSlot')
  'botao Limpar compactado' = $addon.Contains('<span>Limpar</span>') -and $addon.Contains('min-width:78px')
  'layout responsivo presente' = $addon.Contains('@media(max-width:900px)') -and $addon.Contains('@media(max-width:600px)')
}

foreach ($item in $checks.GetEnumerator()) {
  if (-not $item.Value) { throw ('Validacao falhou: ' + $item.Key) }
  Write-Host ('OK - ' + $item.Key + '.')
}

$match = [regex]::Match($addon, '<script id="atende-dashboard-layout-addon">(?s)(.*?)</script>')
if (-not $match.Success) { throw 'Nao consegui extrair o JavaScript do addon.' }
$temp = Join-Path $env:TEMP 'atende-dashboard-layout-addon.js'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($temp, $match.Groups[1].Value, $utf8)
& node --check $temp
if ($LASTEXITCODE -ne 0) { throw 'JavaScript do DashboardLayoutAddon falhou no node --check.' }
Remove-Item $temp -Force -ErrorAction SilentlyContinue
Write-Host 'OK - JavaScript do DashboardLayoutAddon passou no node --check.'
Write-Host 'OK - nenhuma publicacao de Cloudflare Pages e necessaria para esta rodada.'
