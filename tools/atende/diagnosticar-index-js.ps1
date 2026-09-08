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

function Invoke-NodeCheck([string]$filePath) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node.Source
  $psi.Arguments = '--check "' + $filePath + '"'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()

  return [pscustomobject]@{
    ExitCode = $p.ExitCode
    StdOut = $stdout
    StdErr = $stderr
  }
}

function Show-Context([string]$filePath, [int]$lineNumber) {
  if ($lineNumber -le 0) { return }
  $lines = [System.IO.File]::ReadAllLines($filePath)
  $start = [Math]::Max(1, $lineNumber - 4)
  $end = [Math]::Min($lines.Length, $lineNumber + 4)
  Write-Host ("Contexto em torno da linha {0}:" -f $lineNumber) -ForegroundColor Yellow
  for ($n = $start; $n -le $end; $n++) {
    $prefix = if ($n -eq $lineNumber) { '>>' } else { '  ' }
    Write-Host ("{0} {1,4}: {2}" -f $prefix, $n, $lines[$n - 1]) -ForegroundColor ($(if ($n -eq $lineNumber) { 'Red' } else { 'Gray' }))
  }
  Write-Host ''
}

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

    $result = Invoke-NodeCheck $tmp
    if ($result.ExitCode -ne 0) {
      $failed = $true
      Write-Host ("ERRO no bloco <script> #{0}" -f ($i + 1)) -ForegroundColor Red
      $msg = (($result.StdErr + "`n" + $result.StdOut).Trim())
      if ($msg) { $msg -split "`r?`n" | ForEach-Object { Write-Host $_ -ForegroundColor Red } }
      Write-Host ''

      $lineNumber = 0
      $m = [regex]::Match($msg, [regex]::Escape($tmp) + ':(\d+)')
      if (-not $m.Success) { $m = [regex]::Match($msg, ':(\d+)\s*$',[System.Text.RegularExpressions.RegexOptions]::Multiline) }
      if ($m.Success) { $lineNumber = [int]$m.Groups[1].Value }
      Show-Context $tmp $lineNumber
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
