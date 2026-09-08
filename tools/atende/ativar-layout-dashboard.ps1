$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $root 'apps-script\atende\Index.html'
$addonPath = Join-Path $root 'apps-script\atende\DashboardLayoutAddon.html'

if (-not (Test-Path $indexPath)) { throw "Index.html nao encontrado: $indexPath" }
if (-not (Test-Path $addonPath)) { throw "DashboardLayoutAddon.html nao encontrado: $addonPath" }

$index = [System.IO.File]::ReadAllText($indexPath)
$addon = [System.IO.File]::ReadAllText($addonPath)
$marker = 'id="atende-dashboard-layout-addon"'

if ($index.Contains($marker)) {
  Write-Host 'OK - layout do dashboard ja estava injetado no Index.html.'
} else {
  $pos = $index.LastIndexOf('</body>')
  if ($pos -lt 0) { throw 'Nao encontrei </body> no Index.html.' }
  $index = $index.Insert($pos, $addon + [Environment]::NewLine)
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($indexPath, $index, $utf8)
  Write-Host 'OK - DashboardLayoutAddon injetado no Index.html.'
}

Write-Host 'OK - nenhuma alteracao em Cloudflare Pages/frontend.'
Write-Host 'Proximo passo: rode diagnosticar-layout-dashboard.ps1 antes do clasp push.'
