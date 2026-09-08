$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$addonPath = Join-Path $repoRoot 'apps-script\atende\DashboardAddon.html'
$codePath = Join-Path $repoRoot 'apps-script\atende\Code.gs'
$proxyPath = Join-Path $repoRoot 'apps-script\atende\32_ATENDE_DASHBOARD.gs'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($p in @($addonPath,$codePath,$proxyPath)) {
  if (-not (Test-Path $p)) { throw "Arquivo nao encontrado: $p" }
}

# ------------------------------------------------------------------
# 1) DashboardAddon.html precisa ser HTML real, nao JS solto.
#    Dentro de <script>, o HtmlService preserva o JavaScript como raw text.
# ------------------------------------------------------------------
$addon = [System.IO.File]::ReadAllText($addonPath)
if ($addon -notmatch '(?is)^\s*<script\b') {
  $addon = "<script id=`"atende-dashboard-v2-script`">`r`n" + $addon.TrimEnd() + "`r`n</script>`r`n"
  [System.IO.File]::WriteAllText($addonPath,$addon,$utf8NoBom)
  Write-Host 'OK - DashboardAddon.html agora contem uma tag <script> real.' -ForegroundColor Green
} else {
  Write-Host 'DashboardAddon.html ja esta encapsulado em <script>.' -ForegroundColor DarkGray
}

# ------------------------------------------------------------------
# 2) doGet: inserir o HTML do addon diretamente.
#    Nao envolver novamente em outro <script>.
# ------------------------------------------------------------------
$code = [System.IO.File]::ReadAllText($codePath)

if ($code.Contains("var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();")) {
  $code = $code.Replace(
    "var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();",
    "var dashboardHtml = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();"
  )
}

# Mantem diagnosticos existentes coerentes com o novo nome.
$code = $code.Replace('dashboardJs.length','dashboardHtml.length')
$code = $code.Replace("dashboardJs.indexOf('viewSwitchRow')","dashboardHtml.indexOf('viewSwitchRow')")
$code = $code.Replace("dashboardJs.indexOf('dashboardView')","dashboardHtml.indexOf('dashboardView')")
$code = $code.Replace("dashboardJs.indexOf('VisÃ£o executiva')","dashboardHtml.indexOf('VisÃ£o executiva')")
$code = $code.Replace("dashboardJs.indexOf('Visão executiva')","dashboardHtml.indexOf('Visão executiva')")
$code = $code.Replace("dashboardJs.indexOf('ATENDE_buscarDashboardGestaoD1')","dashboardHtml.indexOf('ATENDE_buscarDashboardGestaoD1')")

$lines = $code -split "`r?`n"
$changedScriptLine = $false
for ($i=0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^\s*var\s+dashboardScript\s*=.*dashboard(Js|Html).*$') {
    $indent = ([regex]::Match($lines[$i],'^\s*')).Value
    $lines[$i] = $indent + 'var dashboardScript = dashboardHtml;'
    $changedScriptLine = $true
  }
}
$code = $lines -join "`r`n"

if (-not $code.Contains("var dashboardHtml = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();")) {
  throw 'Nao encontrei a leitura do DashboardAddon no Code.gs. Patch cancelado.'
}
if (-not $code.Contains('var dashboardScript = dashboardHtml;')) {
  throw 'Nao foi possivel trocar o wrapper duplicado de <script> no Code.gs.'
}

[System.IO.File]::WriteAllText($codePath,$code,$utf8NoBom)
Write-Host 'OK - doGet agora insere DashboardAddon.html diretamente, sem <script> duplicado.' -ForegroundColor Green

# ------------------------------------------------------------------
# 3) Funcao de diagnostico/fallback: devolver somente JS cru.
# ------------------------------------------------------------------
$proxy = [System.IO.File]::ReadAllText($proxyPath)
$pattern = '(?s)function\s+ATENDE_dashboardAddonJs\s*\(\s*\)\s*\{.*?\}'
$replacement = @'
function ATENDE_dashboardAddonJs() {
  var html = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  return String(html || '')
    .replace(/^\s*<script\b[^>]*>\s*/i, '')
    .replace(/\s*<\/script>\s*$/i, '');
}
'@
$count = [regex]::Matches($proxy,$pattern).Count
if ($count -ne 1) { throw "ATENDE_dashboardAddonJs nao encontrado de forma unica (encontrados: $count)." }
$proxy = [regex]::Replace($proxy,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement },1)
[System.IO.File]::WriteAllText($proxyPath,$proxy,$utf8NoBom)
Write-Host 'OK - ATENDE_dashboardAddonJs devolve JS cru para diagnostico/fallback.' -ForegroundColor Green

# ------------------------------------------------------------------
# 4) Validacoes locais simples.
# ------------------------------------------------------------------
$finalAddon = [System.IO.File]::ReadAllText($addonPath)
if ($finalAddon -notmatch '(?is)^\s*<script\b[^>]*>[\s\S]*</script>\s*$') {
  throw 'DashboardAddon.html nao terminou como um unico bloco <script> valido.'
}

$innerJs = [regex]::Match($finalAddon,'(?is)^\s*<script\b[^>]*>([\s\S]*)</script>\s*$').Groups[1].Value
if ($innerJs -match '&lt;|&gt;|&#43;|&amp;') {
  throw 'Foram encontradas entidades HTML dentro do JavaScript fonte. Corrija antes do deploy.'
}

Write-Host 'OK - fonte JS nao contem entidades HTML (&lt;, &gt;, &#43;, &amp;).' -ForegroundColor Green
Write-Host 'Concluido. Rode diagnosticar-dashboard-addon.ps1 antes do clasp push.' -ForegroundColor Cyan
