$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$path = Join-Path $repoRoot 'apps-script\atende\DashboardV3.html'
if (-not (Test-Path $path)) { throw "DashboardV3.html nao encontrado: $path" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js nao encontrado no PATH.' }

$content = [System.IO.File]::ReadAllText($path)
$match = [regex]::Match($content, '(?s)^\s*<script[^>]*>(.*)</script>\s*$')
if (-not $match.Success) { throw 'DashboardV3.html precisa conter exatamente um bloco <script> externo.' }
$js = $match.Groups[1].Value

if ($js -match '&lt;|&gt;|&#43;|&amp;') { throw 'Entidade HTML encontrada dentro do JavaScript do DashboardV3.' }

$tmp = Join-Path $env:TEMP ("atende-dashboard-v3-{0}.js" -f $PID)
try {
  [System.IO.File]::WriteAllText($tmp,$js,(New-Object System.Text.UTF8Encoding($false)))
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'node'
  $psi.Arguments = "--check `"$tmp`""
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    Write-Host 'ERRO de sintaxe em DashboardV3.html' -ForegroundColor Red
    if ($stdout) { Write-Host $stdout -ForegroundColor Red }
    if ($stderr) { Write-Host $stderr -ForegroundColor Red }
    exit 1
  }

  $checks = [ordered]@{
    'Endpoint V3' = ($js -match 'ATENDE_buscarDashboardGestaoV3D1')
    'Visao executiva' = ($js -match 'Visão executiva')
    'Canal' = ($js -match "intermediadores='Canal'")
    'Metas Admin' = ($js -match 'ATENDE_adminSalvarMetasDashboard')
    'Ultimos 6 meses' = ($js -match 'últimos 6 meses')
    'Oportunidade embalagem' = ($js -match 'Oportunidade de embalagem')
    'Sem Top Atendentes' = ($js -notmatch "barCard\('Atendentes'")
  }
  foreach ($item in $checks.GetEnumerator()) {
    if (-not $item.Value) { throw ("Validacao falhou: " + $item.Key) }
  }

  Write-Host 'OK - DashboardV3.html passou no node --check.' -ForegroundColor Green
  Write-Host 'OK - JavaScript sem entidades HTML corrompidas.' -ForegroundColor Green
  Write-Host 'OK - Evolucao 6 meses, Canal, Metas e Embalagem encontrados.' -ForegroundColor Green
  Write-Host ('Bytes JS: ' + $js.Length) -ForegroundColor DarkGray
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
