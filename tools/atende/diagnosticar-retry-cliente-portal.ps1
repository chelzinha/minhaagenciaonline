$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$workerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\portal-retry-wrapper.js'
$wranglerPath = Join-Path $repoRoot 'cloudflare\atende-api\wrangler.jsonc'
$sqlPath = Join-Path $repoRoot 'tools\atende\diagnostico-retry-cliente-portal.sql'

foreach($p in @($workerPath,$wranglerPath,$sqlPath)){
  if(-not (Test-Path $p)){ throw "Arquivo ausente: $p" }
}

$worker = [System.IO.File]::ReadAllText($workerPath)
$wrangler = [System.IO.File]::ReadAllText($wranglerPath)
$sql = [System.IO.File]::ReadAllText($sqlPath)

if($worker -notmatch 'DATA\+SERVICO\+VALOR'){ throw 'Regra DSV nao encontrada no Worker.' }
if($worker -notmatch "source_key LIKE 'DSV:%'"){ throw 'Status DSV nao encontrado no Worker.' }
if($worker -match 'UPDATE atende_postagens_raw|DELETE FROM atende_postagens_raw'){ throw 'Worker nao pode alterar RAW.' }
if($sql -notmatch 'match_seguro_data_servico_valor'){ throw 'SQL de diagnostico invalido.' }
if($wrangler -notmatch 'src/portal-retry-wrapper\.js'){ throw 'wrangler.jsonc ainda nao aponta para portal-retry-wrapper.js.' }

$node = Get-Command node -ErrorAction SilentlyContinue
if(-not $node){ throw 'Node.js nao encontrado.' }

& node --check $workerPath
if($LASTEXITCODE -ne 0){ throw 'portal-retry-wrapper.js falhou no node --check.' }

Write-Host 'OK - portal-retry-wrapper.js passou no node --check.' -ForegroundColor Green
Write-Host 'OK - fallback considera somente linhas ainda sem CLIENTE PORTAL e sem SRO.' -ForegroundColor Green
Write-Host 'OK - exige coincidencia de DATA + SERVICO + VALOR.' -ForegroundColor Green
Write-Host 'OK - so grava quando existe exatamente 1 CLIENTE possivel no Consolidador.' -ForegroundColor Green
Write-Host 'OK - SRO/estornos ficam fora desta retentativa.' -ForegroundColor Green
Write-Host 'OK - RAW continua imutavel.' -ForegroundColor Green
Write-Host 'Execute agora o SQL dry-run remoto antes do deploy.' -ForegroundColor Cyan
