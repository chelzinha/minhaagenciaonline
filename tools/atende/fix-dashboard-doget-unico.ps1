$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$codePath = Join-Path $repoRoot 'apps-script\atende\Code.gs'
$legacyEntryPath = Join-Path $repoRoot 'apps-script\atende\zzzz_ATENDE_DASHBOARD_ENTRY.gs'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $codePath)) { throw "Code.gs nao encontrado: $codePath" }

function Find-JsFunctionBlock {
  param(
    [Parameter(Mandatory=$true)][string]$Text,
    [Parameter(Mandatory=$true)][string]$Name
  )

  $pattern = '(?m)^\s*function\s+' + [regex]::Escape($Name) + '\s*\([^)]*\)\s*\{'
  $matches = [regex]::Matches($Text, $pattern)
  if ($matches.Count -eq 0) { return $null }
  if ($matches.Count -gt 1) { throw "Funcao $Name encontrada mais de uma vez em Code.gs." }

  $start = $matches[0].Index
  $openBrace = $Text.IndexOf('{', $matches[0].Index)
  if ($openBrace -lt 0) { throw "Nao foi possivel localizar a chave inicial de $Name." }

  $depth = 0
  $inSingle = $false
  $inDouble = $false
  $inTemplate = $false
  $inLineComment = $false
  $inBlockComment = $false
  $escaped = $false
  $end = -1

  for ($i = $openBrace; $i -lt $Text.Length; $i++) {
    $ch = $Text[$i]
    $next = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }

    if ($inLineComment) {
      if ($ch -eq "`n") { $inLineComment = $false }
      continue
    }

    if ($inBlockComment) {
      if ($ch -eq '*' -and $next -eq '/') {
        $inBlockComment = $false
        $i++
      }
      continue
    }

    if ($inSingle) {
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if ($ch -eq "'") { $inSingle = $false }
      continue
    }

    if ($inDouble) {
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if ($ch -eq '"') { $inDouble = $false }
      continue
    }

    if ($inTemplate) {
      if ($escaped) { $escaped = $false; continue }
      if ($ch -eq '\') { $escaped = $true; continue }
      if ($ch -eq '`') { $inTemplate = $false }
      continue
    }

    if ($ch -eq '/' -and $next -eq '/') {
      $inLineComment = $true
      $i++
      continue
    }
    if ($ch -eq '/' -and $next -eq '*') {
      $inBlockComment = $true
      $i++
      continue
    }
    if ($ch -eq "'") { $inSingle = $true; continue }
    if ($ch -eq '"') { $inDouble = $true; continue }
    if ($ch -eq '`') { $inTemplate = $true; continue }

    if ($ch -eq '{') {
      $depth++
      continue
    }
    if ($ch -eq '}') {
      $depth--
      if ($depth -eq 0) {
        $end = $i
        break
      }
    }
  }

  if ($end -lt 0) { throw "Nao foi possivel localizar o fechamento da funcao $Name." }

  return [pscustomobject]@{
    Start = $start
    End = $end
    Length = ($end - $start + 1)
    Text = $Text.Substring($start, $end - $start + 1)
  }
}

function Remove-JsFunctionIfPresent {
  param(
    [Parameter(Mandatory=$true)][string]$Text,
    [Parameter(Mandatory=$true)][string]$Name
  )
  $block = Find-JsFunctionBlock -Text $Text -Name $Name
  if ($null -eq $block) { return $Text }
  return $Text.Remove($block.Start, $block.Length)
}

$content = [System.IO.File]::ReadAllText($codePath)

$newBlock = @'
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
  # Remove auxiliares caso uma tentativa anterior os tenha deixado no Code.gs.
  $content = Remove-JsFunctionIfPresent -Text $content -Name 'ATENDE_limparDashboardLegadoDoHtml_'
  $content = Remove-JsFunctionIfPresent -Text $content -Name 'ATENDE_testarHtmlDashboard'

  $doGetBlock = Find-JsFunctionBlock -Text $content -Name 'doGet'
  if ($null -eq $doGetBlock) {
    throw 'Nenhuma funcao doGet() foi encontrada em Code.gs. Patch cancelado para evitar insercao em local incorreto.'
  }

  Write-Host 'doGet encontrado no Code.gs:' -ForegroundColor Cyan
  Write-Host $doGetBlock.Text -ForegroundColor DarkGray

  $content = $content.Substring(0, $doGetBlock.Start) + $newBlock.Trim() + $content.Substring($doGetBlock.End + 1)
  [System.IO.File]::WriteAllText($codePath, $content, $utf8NoBom)
  Write-Host 'OK - doGet existente substituido estruturalmente pela versao V2.' -ForegroundColor Green
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

$final = [System.IO.File]::ReadAllText($codePath)
if (-not $final.Contains("doGetFonte: 'Code.gs'")) { throw 'Validacao falhou: marcador da V2 nao encontrado no Code.gs.' }
if (-not $final.Contains("createHtmlOutputFromFile('DashboardAddon')")) { throw 'Validacao falhou: DashboardAddon nao esta sendo incorporado pelo doGet.' }

Write-Host 'OK - Code.gs agora e a fonte unica do Dashboard V2.' -ForegroundColor Green
Write-Host 'OK - validacao concluida: somente Code.gs possui doGet().' -ForegroundColor Green
