$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$codePath = Join-Path $repoRoot 'apps-script\atende\Code.gs'
$addonPath = Join-Path $repoRoot 'apps-script\atende\DashboardAddon.html'

if (-not (Test-Path $codePath)) { throw "Code.gs nao encontrado em $codePath" }
if (-not (Test-Path $addonPath)) { throw "DashboardAddon.html nao encontrado em $addonPath" }

$content = Get-Content -LiteralPath $codePath -Raw -Encoding UTF8

$old = @"
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Postagens — AGF José Bonifácio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
"@

$new = @"
function doGet() {
  var indexHtml = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  var dashboardScript = '<script>' + dashboardJs + '</script>';
  var html = indexHtml.indexOf('</body>') >= 0
    ? indexHtml.replace('</body>', dashboardScript + '</body>')
    : indexHtml + dashboardScript;

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Postagens — AGF José Bonifácio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
"@

if ($content.Contains($new.Trim())) {
  Write-Host 'Code.gs ja esta com o doGet correto do Dashboard.' -ForegroundColor Green
  exit 0
}

if (-not $content.Contains($old.Trim())) {
  throw 'Bloco doGet original nao encontrado. O arquivo mudou; patch cancelado para evitar alteracao incorreta.'
}

$updated = $content.Replace($old.Trim(), $new.Trim())
Set-Content -LiteralPath $codePath -Value $updated -Encoding UTF8

$check = Get-Content -LiteralPath $codePath -Raw -Encoding UTF8
if (-not $check.Contains("createHtmlOutputFromFile('DashboardAddon')")) {
  throw 'Validacao falhou: DashboardAddon nao foi incorporado ao doGet.'
}
if (-not $check.Contains("var dashboardScript = '<script>' + dashboardJs + '</script>';")) {
  throw 'Validacao falhou: wrapper do script do Dashboard ficou diferente do esperado.'
}

Write-Host 'OK - doGet original do Code.gs agora incorpora DashboardAddon no HTML inicial.' -ForegroundColor Green
Write-Host 'Arquivo alterado:' $codePath
