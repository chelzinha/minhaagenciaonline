$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$codePath = Join-Path $repoRoot 'apps-script\atende\Code.gs'
$legacyEntryPath = Join-Path $repoRoot 'apps-script\atende\zzzz_ATENDE_DASHBOARD_ENTRY.gs'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $codePath)) { throw "Code.gs nao encontrado: $codePath" }

$content = [System.IO.File]::ReadAllText($codePath)

$old = @'
// ============================================================
//  ENTRY POINT
// ============================================================
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Postagens — AGF José Bonifácio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
'@

$new = @'
// ============================================================
//  ENTRY POINT - FONTE UNICA DO DASHBOARD GERENCIAL V2
// ============================================================
function ATENDE_limparDashboardLegadoDoHtml_(html) {
  html = String(html || '');

  html = html.replace(
    /<!--[\s]*ATENDE_DASHBOARD_INLINE_START[\s]*-->[\s\S]*?<!--[\s]*ATENDE_DASHBOARD_INLINE_END[\s]*-->/g,
    ''
  );

  html = html.replace(
    /<script>[\s\S]*?ATENDE_dashboardAddonJs\(\);[\s\S]*?<\/script>/g,
    ''
  );

  return html;
}

function doGet() {
  var indexOriginal = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var indexHtml = ATENDE_limparDashboardLegadoDoHtml_(indexOriginal);
  var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  var dashboardScript = '<script>\n' + dashboardJs + '\n<\/script>\n';

  var versionMarker = '<meta name="atende-dashboard-version" content="gestao-v2">\n';
  if (indexHtml.indexOf('</head>') >= 0) {
    indexHtml = indexHtml.replace('</head>', versionMarker + '</head>');
  }

  var html = indexHtml.indexOf('</body>') >= 0
    ? indexHtml.replace('</body>', dashboardScript + '</body>')
    : indexHtml + dashboardScript;

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Postagens — AGF José Bonifácio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function ATENDE_testarHtmlDashboard() {
  var indexOriginal = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var indexLimpo = ATENDE_limparDashboardLegadoDoHtml_(indexOriginal);
  var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  var result = {
    ok: true,
    indexBytesOriginal: indexOriginal.length,
    indexBytesLimpo: indexLimpo.length,
    dashboardBytes: dashboardJs.length,
    tinhaDashboardInlineLegado: indexOriginal.indexOf('ATENDE_DASHBOARD_INLINE_END') >= 0,
    loaderAssincronoLegado: indexOriginal.indexOf('ATENDE_dashboardAddonJs') >= 0,
    addonPossuiSwitch: dashboardJs.indexOf('viewSwitchRow') >= 0,
    addonPossuiDashboard: dashboardJs.indexOf('dashboardView') >= 0,
    addonGestaoV2: dashboardJs.indexOf('Visão executiva') >= 0 && dashboardJs.indexOf('ATENDE_buscarDashboardGestaoD1') >= 0,
    doGetFonte: 'Code.gs'
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
'@

if ($content.Contains("doGetFonte: 'Code.gs'")) {
  Write-Host 'Code.gs ja esta com o doGet unico da V2.' -ForegroundColor Green
} else {
  $count = ([regex]::Matches($content, [regex]::Escape($old.Trim()))).Count
  if ($count -ne 1) {
    throw "Bloco doGet antigo nao encontrado de forma unica (encontrados: $count). Patch cancelado."
  }
  $content = $content.Replace($old.Trim(), $new.Trim())
  [System.IO.File]::WriteAllText($codePath, $content, $utf8NoBom)
  Write-Host 'OK - Code.gs agora e a fonte unica do Dashboard V2.' -ForegroundColor Green
}

if (Test-Path $legacyEntryPath) {
  Remove-Item -LiteralPath $legacyEntryPath -Force
  Write-Host 'OK - zzzz_ATENDE_DASHBOARD_ENTRY.gs removido localmente.' -ForegroundColor Green
}

$allGs = Get-ChildItem (Join-Path $repoRoot 'apps-script\atende') -Filter '*.gs' -File
$doGets = @()
foreach ($file in $allGs) {
  $text = [System.IO.File]::ReadAllText($file.FullName)
  if ($text -match 'function\s+doGet\s*\(') { $doGets += $file.Name }
}

Write-Host ('Arquivos com doGet(): ' + ($doGets -join ', ')) -ForegroundColor Cyan
if ($doGets.Count -ne 1 -or $doGets[0] -ne 'Code.gs') {
  throw 'Validacao falhou: deve existir exatamente um doGet(), em Code.gs.'
}

Write-Host 'OK - validacao concluida: somente Code.gs possui doGet().' -ForegroundColor Green
