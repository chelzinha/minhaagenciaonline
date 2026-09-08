$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$addonPath = Join-Path $repoRoot 'apps-script\atende\TableControlsAddon.html'
$panelGsPath = Join-Path $repoRoot 'apps-script\atende\30_ATENDE_D1_PAINEL.gs'
$proxyPath = Join-Path $repoRoot 'apps-script\atende\38_ATENDE_TABELA_CONTROLES.gs'
$wrapperPath = Join-Path $repoRoot 'cloudflare\atende-api\src\table-controls-wrapper.js'
$dashboardPath = Join-Path $repoRoot 'cloudflare\atende-api\src\dashboard-v3-wrapper.js'
$panelWorkerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\panel-v3-portal.js'
$wranglerPath = Join-Path $repoRoot 'cloudflare\atende-api\wrangler.jsonc'
$migrationPath = Join-Path $repoRoot 'cloudflare\atende-api\migrations\0011_trava_linha_excecoes.sql'

$required=@($indexPath,$addonPath,$panelGsPath,$proxyPath,$wrapperPath,$dashboardPath,$panelWorkerPath,$wranglerPath,$migrationPath)
foreach($p in $required){ if(-not(Test-Path $p)){ throw "Arquivo ausente: $p" } }

$index=[System.IO.File]::ReadAllText($indexPath)
$addon=[System.IO.File]::ReadAllText($addonPath)
$panelGs=[System.IO.File]::ReadAllText($panelGsPath)
$proxy=[System.IO.File]::ReadAllText($proxyPath)
$wrapper=[System.IO.File]::ReadAllText($wrapperPath)
$dashboard=[System.IO.File]::ReadAllText($dashboardPath)
$panelWorker=[System.IO.File]::ReadAllText($panelWorkerPath)
$wrangler=[System.IO.File]::ReadAllText($wranglerPath)
$migration=[System.IO.File]::ReadAllText($migrationPath)

if($index -notmatch 'id="atende-table-controls-addon"'){ throw 'Index.html ainda nao recebeu o addon.' }
if($panelGs -notmatch 'presencasColuna'){ throw '30_ATENDE_D1_PAINEL.gs ainda nao envia os filtros de presenca.' }
if($proxy -notmatch 'ATENDE_adminAlterarTravaLinhas'){ throw 'Proxy Apps Script da trava por linha ausente.' }
if($wrangler -notmatch 'src/table-controls-wrapper\.js'){ throw 'wrangler.jsonc nao aponta para table-controls-wrapper.js.' }
if($migration -notmatch 'atende_postagem_trava_excecoes'){ throw 'Migration 0011 invalida.' }

$checks=@{
  'seletor de colunas' = ($addon -match 'tcColumnsBtn' -and $addon -match 'hiddenColumns')
  'preferencia por usuario' = ($addon -match 'AUTH_USER' -and $addon -match 'userKey')
  'filtro Em branco' = ($addon -match 'Em branco' -and $wrapper -match 'presenceBlankSql')
  'filtro Nao em branco' = ($addon -match 'filled' -and $wrapper -match "mode==='filled'")
  'cadeado individual' = ($addon -match 'toggleLineLock' -and $wrapper -match '/admin/row-lock-exception')
  'cadeado em lote' = ($addon -match 'applyBulkLock' -and $wrapper -match 'max_1000_rows')
  'Local dinamico na tabela' = ($wrapper -match 'atende_atendente_local atl' -and $wrapper -match 'atl\.local_codigo')
  'excecao no Dashboard V3' = ($dashboard -match 'atende_postagem_trava_excecoes pte' -and $dashboard -match 'pte\.raw_id IS NULL THEN pcl\.local_codigo')
  'excecao no painel base' = ($panelWorker -match 'atende_postagem_trava_excecoes pte' -and $panelWorker -match 'pte\.raw_id IS NULL THEN pcl\.local_codigo')
  'Local dinamico no painel base' = ($panelWorker -match 'atende_atendente_local atl' -and $panelWorker -match 'atl\.local_codigo')
  'RAW imutavel' = ($migration -notmatch 'ALTER TABLE atende_postagens_raw' -and $wrapper -notmatch 'UPDATE atende_postagens_raw')
}
foreach($item in $checks.GetEnumerator()){
  if(-not $item.Value){ throw ('Validacao falhou: '+$item.Key) }
}

$node=(Get-Command node -ErrorAction SilentlyContinue)
if(-not $node){ throw 'Node.js nao encontrado; necessario para validar JavaScript antes do deploy.' }

foreach($jsPath in @($wrapperPath,$dashboardPath,$panelWorkerPath)){
  & node --check $jsPath
  if($LASTEXITCODE -ne 0){ throw ((Split-Path $jsPath -Leaf)+' falhou no node --check.') }
  Write-Host ('OK - '+(Split-Path $jsPath -Leaf)+' passou no node --check.') -ForegroundColor Green
}

$scriptMatch=[regex]::Match($addon,'<script id="atende-table-controls-addon">([\s\S]*?)</script>')
if(-not $scriptMatch.Success){ throw 'Script do TableControlsAddon nao encontrado.' }
$tmp=Join-Path $env:TEMP ('atende-table-controls-'+[guid]::NewGuid().ToString('N')+'.js')
try{
  [System.IO.File]::WriteAllText($tmp,$scriptMatch.Groups[1].Value,(New-Object System.Text.UTF8Encoding($false)))
  & node --check $tmp
  if($LASTEXITCODE -ne 0){ throw 'JavaScript do TableControlsAddon falhou no node --check.' }
}finally{
  if(Test-Path $tmp){ Remove-Item $tmp -Force }
}

Write-Host 'OK - JavaScript do TableControlsAddon passou no node --check.' -ForegroundColor Green
Write-Host 'OK - colunas visiveis/ocultas por usuario encontradas.' -ForegroundColor Green
Write-Host 'OK - filtros Todos / Em branco / Nao em branco encontrados.' -ForegroundColor Green
Write-Host 'OK - trava individual e operacao em lote encontradas.' -ForegroundColor Green
Write-Host 'OK - Local dinamico e excecoes alinhados entre tabela e Dashboard.' -ForegroundColor Green
Write-Host 'OK - migration 0011 preserva o RAW.' -ForegroundColor Green
Write-Host 'OK - nenhuma publicacao de Cloudflare Pages e necessaria para esta rodada.' -ForegroundColor Green
