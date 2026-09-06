$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$addonPath = Join-Path $repoRoot 'apps-script\atende\DashboardAddon.html'

if (-not (Test-Path $indexPath)) { throw "Index.html nao encontrado em $indexPath" }
if (-not (Test-Path $addonPath)) { throw "DashboardAddon.html nao encontrado em $addonPath" }

$index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$addon = Get-Content -LiteralPath $addonPath -Raw -Encoding UTF8

if ([string]::IsNullOrWhiteSpace($addon)) { throw 'DashboardAddon.html esta vazio.' }
if ($addon -notmatch 'viewSwitchRow' -or $addon -notmatch 'dashboardView') {
  throw 'DashboardAddon.html nao contem os marcadores esperados do Dashboard.'
}

$startMarker = '<!-- ATENDE_DASHBOARD_INLINE_START -->'
$endMarker = '<!-- ATENDE_DASHBOARD_INLINE_END -->'

# Remove uma versao inline anterior, se existir, para o patch ser idempotente.
$inlinePattern = '(?s)\s*' + [regex]::Escape($startMarker) + '.*?' + [regex]::Escape($endMarker) + '\s*'
$index = [regex]::Replace($index, $inlinePattern, "`r`n")

# Remove o carregador assincrono antigo. O Dashboard passara a fazer parte
# diretamente do Index.html e nao dependera de google.script.run para nascer.
$asyncPattern = '(?s)\s*<script>\s*window\.addEventListener\(''load'',function\(\)\{\s*google\.script\.run\.withSuccessHandler\(function\(src\)\{.*?\.ATENDE_dashboardAddonJs\(\);\s*\}\);\s*</script>\s*'
$index = [regex]::Replace($index, $asyncPattern, "`r`n")

$inline = @"
$startMarker
<script>
$addon
</script>
$endMarker
"@

if ($index -notmatch '</body>') {
  throw 'Index.html nao possui </body>; patch cancelado.'
}

$updated = $index -replace '</body>', ($inline + "`r`n</body>")
Set-Content -LiteralPath $indexPath -Value $updated -Encoding UTF8

$check = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$markerCount = ([regex]::Matches($check, [regex]::Escape($startMarker))).Count

if ($markerCount -ne 1) { throw "Validacao falhou: esperado 1 bloco inline, encontrado $markerCount." }
if ($check -notmatch 'viewSwitchRow' -or $check -notmatch 'dashboardView') {
  throw 'Validacao falhou: o Index final nao contem o Dashboard.'
}

Write-Host 'OK - Dashboard incorporado diretamente ao Index.html.' -ForegroundColor Green
Write-Host 'Nao depende mais do carregamento assincrono do addon.' -ForegroundColor Green
Write-Host 'Arquivo alterado:' $indexPath
