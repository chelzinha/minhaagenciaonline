$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$path = Join-Path $repoRoot 'apps-script\atende\DashboardAddon.html'
if (-not (Test-Path $path)) { throw "DashboardAddon.html nao encontrado: $path" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js nao encontrado no PATH.' }

$tmp = Join-Path $env:TEMP ("atende-dashboard-addon-{0}.js" -f $PID)
try {
  $content = [System.IO.File]::ReadAllText($path)
  $js = $content
  $wrapped = $false

  $m = [regex]::Match($content,'(?is)^\s*<script\b[^>]*>([\s\S]*)</script>\s*$')
  if ($m.Success) {
    $js = $m.Groups[1].Value
    $wrapped = $true
  }

  if ($js -match '&lt;|&gt;|&#43;|&amp;') {
    Write-Host 'ERRO - JavaScript fonte contem entidades HTML que quebrariam a execucao.' -ForegroundColor Red
    exit 1
  }

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
    Write-Host 'ERRO de sintaxe em DashboardAddon.html' -ForegroundColor Red
    if ($stdout) { Write-Host $stdout -ForegroundColor Red }
    if ($stderr) { Write-Host $stderr -ForegroundColor Red }
    exit 1
  }

  Write-Host 'OK - DashboardAddon.html passou no node --check.' -ForegroundColor Green
  Write-Host ('Encapsulado em <script>: ' + $wrapped) -ForegroundColor DarkGray
  Write-Host ('Bytes HTML: ' + $content.Length) -ForegroundColor DarkGray
  Write-Host ('Bytes JS: ' + $js.Length) -ForegroundColor DarkGray
  Write-Host 'OK - nenhuma entidade HTML foi encontrada dentro do JavaScript fonte.' -ForegroundColor Green
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
