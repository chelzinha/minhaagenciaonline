$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dashPath = Join-Path $repoRoot 'apps-script\atende\DashboardV3.html'
$gsPath = Join-Path $repoRoot 'apps-script\atende\37_ATENDE_IMPORTACOES_ADMIN.gs'
if (-not (Test-Path $dashPath)) { throw "DashboardV3.html nao encontrado: $dashPath" }
if (-not (Test-Path $gsPath)) { throw "37_ATENDE_IMPORTACOES_ADMIN.gs nao encontrado: $gsPath" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js nao encontrado no PATH.' }

function Test-NodeSyntax([string]$source,[string]$label,[bool]$isHtmlScript){
  $tmp = Join-Path $env:TEMP ("atende-import-admin-{0}-{1}.js" -f $PID,([Guid]::NewGuid().ToString('N')))
  try {
    $js=$source
    if($isHtmlScript){
      $m=[regex]::Match($source,'(?s)^\s*<script[^>]*>(.*)</script>\s*$')
      if(-not $m.Success){throw "$label precisa conter um unico <script> externo."}
      $js=$m.Groups[1].Value
    }
    [System.IO.File]::WriteAllText($tmp,$js,(New-Object System.Text.UTF8Encoding($false)))
    $psi=New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName='node';$psi.Arguments="--check `"$tmp`"";$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
    $p=New-Object System.Diagnostics.Process;$p.StartInfo=$psi;[void]$p.Start();$out=$p.StandardOutput.ReadToEnd();$err=$p.StandardError.ReadToEnd();$p.WaitForExit()
    if($p.ExitCode -ne 0){if($out){Write-Host $out -ForegroundColor Red};if($err){Write-Host $err -ForegroundColor Red};throw "Erro de sintaxe em $label"}
    Write-Host ("OK - " + $label + " passou no node --check.") -ForegroundColor Green
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

$dash=[System.IO.File]::ReadAllText($dashPath)
$gs=[System.IO.File]::ReadAllText($gsPath)
Test-NodeSyntax $dash 'DashboardV3.html' $true
Test-NodeSyntax $gs '37_ATENDE_IMPORTACOES_ADMIN.gs' $false

$checks=[ordered]@{
  'Aba Importacoes' = ($dash -match 'pane-importacoes')
  'Processar tudo agora' = ($dash -match 'Processar tudo agora')
  'Status Admin' = ($dash -match 'ATENDE_adminStatusImportacoes')
  'Processamento Admin' = ($dash -match 'ATENDE_adminProcessarImportacoes')
  'Auto loop' = ($dash -match 'runNextImportRound')
  'Validacao Admin server' = ($gs -match 'ATENDE_validarAdmin_\(platformToken\)')
  'Fluxo oficial reutilizado' = ($gs -match 'ATENDE_importarCsvDriveD1Agora\(\)')
  'Lista ENTRADA' = ($gs -match 'ATENDE_listarCsvEntradaD1_')
  'Sem token do Worker no front' = ($dash -notmatch 'ATENDE_D1_API_TOKEN')
}
foreach($item in $checks.GetEnumerator()){if(-not $item.Value){throw ("Validacao falhou: "+$item.Key)}}

Write-Host 'OK - Admin > Importacoes validado.' -ForegroundColor Green
Write-Host 'OK - usa o fluxo oficial ENTRADA -> D1 -> PROCESSADA.' -ForegroundColor Green
Write-Host 'OK - sessao Admin validada no servidor e token do Worker nao exposto.' -ForegroundColor Green
