$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$path = Join-Path $repoRoot 'apps-script\atende\DashboardV3.html'
$workerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\dashboard-v3-wrapper.js'
$migrationPath = Join-Path $repoRoot 'cloudflare\atende-api\migrations\0010_dashboard_metas.sql'
if (-not (Test-Path $path)) { throw "DashboardV3.html nao encontrado: $path" }
if (-not (Test-Path $workerPath)) { throw "dashboard-v3-wrapper.js nao encontrado: $workerPath" }
if (-not (Test-Path $migrationPath)) { throw "Migration 0010 nao encontrada: $migrationPath" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js nao encontrado no PATH.' }

$content = [System.IO.File]::ReadAllText($path)
$match = [regex]::Match($content, '(?s)^\s*<script[^>]*>(.*)</script>\s*$')
if (-not $match.Success) { throw 'DashboardV3.html precisa conter exatamente um bloco <script> externo.' }
$js = $match.Groups[1].Value

# A funcao esc() usa deliberadamente &amp;, &lt; e &gt; para escapar dados
# antes de inseri-los no HTML. Essas entidades sao corretas e nao podem ser
# tratadas como corrupcao do JavaScript. Removemos apenas essa funcao da
# varredura e procuramos entidades suspeitas no restante do codigo.
$entityScan = [regex]::Replace($js, '(?s)function\s+esc\(v\)\{.*?\}', '')
$entityMatch = [regex]::Match($entityScan, '&(?:lt|gt|amp|#43);')
if ($entityMatch.Success) {
  $prefix = $entityScan.Substring(0, $entityMatch.Index)
  $lineNumber = ([regex]::Matches($prefix, "`n")).Count + 1
  $start = [Math]::Max(0, $entityMatch.Index - 90)
  $length = [Math]::Min(180, $entityScan.Length - $start)
  $snippet = $entityScan.Substring($start, $length).Replace("`r", ' ').Replace("`n", ' ')
  throw ("Entidade HTML suspeita '{0}' fora de esc() na linha aproximada {1}. Trecho: {2}" -f $entityMatch.Value, $lineNumber, $snippet)
}

function Test-NodeSyntax([string]$sourcePath, [string]$label) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'node'
  $psi.Arguments = "--check `"$sourcePath`""
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
    Write-Host ("ERRO de sintaxe em " + $label) -ForegroundColor Red
    if ($stdout) { Write-Host $stdout -ForegroundColor Red }
    if ($stderr) { Write-Host $stderr -ForegroundColor Red }
    exit 1
  }
  Write-Host ("OK - " + $label + " passou no node --check.") -ForegroundColor Green
}

$tmp = Join-Path $env:TEMP ("atende-dashboard-v3-{0}.js" -f $PID)
try {
  [System.IO.File]::WriteAllText($tmp,$js,(New-Object System.Text.UTF8Encoding($false)))
  Test-NodeSyntax $tmp 'DashboardV3.html'
  Test-NodeSyntax $workerPath 'dashboard-v3-wrapper.js'

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

  $migration = [System.IO.File]::ReadAllText($migrationPath)
  if ($migration -notmatch 'atende_dashboard_metas_mensais') { throw 'Migration 0010 nao cria a tabela de metas esperada.' }

  Write-Host 'OK - JavaScript sem entidades HTML suspeitas fora da funcao esc().' -ForegroundColor Green
  Write-Host 'OK - Evolucao 6 meses, Canal, Metas e Embalagem encontrados.' -ForegroundColor Green
  Write-Host 'OK - Migration 0010 encontrada.' -ForegroundColor Green
  Write-Host ('Bytes JS: ' + $js.Length) -ForegroundColor DarkGray
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
