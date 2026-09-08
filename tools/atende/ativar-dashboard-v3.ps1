$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$codePath = Join-Path $repoRoot 'apps-script\atende\Code.gs'
$dashPath = Join-Path $repoRoot 'apps-script\atende\DashboardV3.html'

if (-not (Test-Path $codePath)) { throw "Code.gs nao encontrado: $codePath" }
if (-not (Test-Path $dashPath)) { throw "DashboardV3.html nao encontrado: $dashPath" }

$code = [System.IO.File]::ReadAllText($codePath)
$before = $code

if ($code -match "createHtmlOutputFromFile\('DashboardV3'\)") {
  Write-Host 'DashboardV3 ja esta ativo no Code.gs.' -ForegroundColor Yellow
} else {
  $count = ([regex]::Matches($code, "createHtmlOutputFromFile\('DashboardAddon'\)")).Count
  if ($count -lt 1) {
    throw "Referencia DashboardAddon nao encontrada no Code.gs. Patch cancelado para evitar alteracao incorreta."
  }
  $code = $code.Replace("createHtmlOutputFromFile('DashboardAddon')", "createHtmlOutputFromFile('DashboardV3')")
  [System.IO.File]::WriteAllText($codePath, $code, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("OK - DashboardV3 ativado no Code.gs em {0} referencia(s)." -f $count) -ForegroundColor Green
}

$after = [System.IO.File]::ReadAllText($codePath)
if ($after -notmatch "createHtmlOutputFromFile\('DashboardV3'\)") { throw 'DashboardV3 nao ficou ativo no Code.gs.' }

$dash = [System.IO.File]::ReadAllText($dashPath)
if ($dash -notmatch '<script id="atende-dashboard-v3-script">') { throw 'DashboardV3.html nao possui a tag script esperada.' }
if ($dash -notmatch 'ATENDE_buscarDashboardGestaoV3D1') { throw 'DashboardV3.html nao chama o endpoint V3.' }
if ($dash -notmatch 'Admin > Metas') { throw 'DashboardV3.html nao contem a integracao de metas.' }

Write-Host 'OK - DashboardV3 usa HTML real com <script>, evitando o escape do HtmlService.' -ForegroundColor Green
Write-Host 'OK - Admin de Metas e endpoint V3 encontrados.' -ForegroundColor Green
Write-Host 'Proximo passo: rode diagnosticar-dashboard-v3.ps1 antes do clasp push.' -ForegroundColor Cyan
