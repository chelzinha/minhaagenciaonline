$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'

if (-not (Test-Path $indexPath)) {
  throw "Index.html nao encontrado: $indexPath"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js nao encontrado no PATH.'
}

$html = [System.IO.File]::ReadAllText($indexPath)
$matches = [regex]::Matches($html, '<script(?:\s[^>]*)?>([\s\S]*?)</script>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

Write-Host ('Index: ' + $indexPath) -ForegroundColor Cyan
Write-Host ('Scripts inline encontrados: ' + $matches.Count) -ForegroundColor Cyan
Write-Host ('Marker UI V2: ' + $html.Contains('ATENDE_CLIENTE_PORTAL_LOCAIS_UI_V2'))
Write-Host ('CLIENTE PORTAL hosts: ' + ([regex]::Matches($html, 'data-ms="clientesPortal"').Count))
Write-Host ('RAZAO SOCIAL hosts: ' + ([regex]::Matches($html, 'data-ms="contratoClientes"').Count))
Write-Host ('renderAdminLocations: ' + ([regex]::Matches($html, 'function\s+renderAdminLocations\s*\(').Count))
Write-Host ('applyPortalLocalUi: ' + ([regex]::Matches($html, 'function\s+applyPortalLocalUi\s*\(').Count))
Write-Host ''

$failed = $false
$tempFiles = @()
try {
  for ($i = 0; $i -lt $matches.Count; $i++) {
    $js = $matches[$i].Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($js)) { continue }

    # Scriptlets do Apps Script nao sao JavaScript de navegador puro.
    # Se existirem, substituimos por literais neutros apenas para validar sintaxe.
    $jsCheck = [regex]::Replace($js, '<\?[\s\S]*?\?>', 'null')

    $tmp = Join-Path $env:TEMP ("atende-index-script-{0}-{1}.js" -f $PID, $i)
    [System.IO.File]::WriteAllText($tmp, $jsCheck, (New-Object System.Text.UTF8Encoding($false)))
    $tempFiles += $tmp

    $output = & node --check $tmp 2>&1
    if ($LASTEXITCODE -ne 0) {
      $failed = $true
      Write-Host ("ERRO no bloco <script> #{0}" -f ($i + 1)) -ForegroundColor Red
      $output | ForEach-Object { Write-Host $_ -ForegroundColor Red }
      Write-Host ''
    } else {
      Write-Host ("OK bloco <script> #{0}" -f ($i + 1)) -ForegroundColor Green
    }
  }
} finally {
  $tempFiles | ForEach-Object { Remove-Item $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
if ($failed) {
  Write-Host 'RESULTADO: existe erro de sintaxe no JavaScript do Index.html.' -ForegroundColor Red
  exit 1
}

Write-Host 'RESULTADO: todos os blocos JavaScript passaram no node --check.' -ForegroundColor Green
Write-Host 'Se o front ainda nao iniciar, o proximo passo e diagnosticar erro de runtime no navegador.' -ForegroundColor Yellow
