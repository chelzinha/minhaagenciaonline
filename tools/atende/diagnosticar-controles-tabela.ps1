$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$addonPath = Join-Path $repoRoot 'apps-script\atende\TableControlsAddon.html'
$panelGsPath = Join-Path $repoRoot 'apps-script\atende\30_ATENDE_D1_PAINEL.gs'
$proxyPath = Join-Path $repoRoot 'apps-script\atende\38_ATENDE_TABELA_CONTROLES.gs'
$wrapperPath = Join-Path $repoRoot 'cloudflare\atende-api\src\table-controls-wrapper.js'
$wranglerPath = Join-Path $repoRoot 'cloudflare\atende-api\wrangler.jsonc'
$migrationPath = Join-Path $repoRoot 'cloudflare\atende-api\migrations\0011_trava_linha_excecoes.sql'

$required=@($indexPath,$addonPath,$panelGsPath,$proxyPath,$wrapperPath,$wranglerPath,$migrationPath)
foreach($p in $required){ if(-not(Test-Path $p)){ throw "Arquivo ausente: $p" } }

$index=[System.IO.File]::ReadAllText($indexPath)
$addon=[System.IO.File]::ReadAllText($addonPath)
$panel=[System.IO.File]::ReadAllText($panelGsPath)
$proxy=[System.IO.File]::ReadAllText($proxyPath)
$wrapper=[System.IO.File]::ReadAllText($wrapperPath)
$wrangler=[System.IO.File]::ReadAllText($wranglerPath)
$migration=[System.IO.File]::ReadAllText($migrationPath)

if($index -notmatch 'id="atende-table-controls-addon"'){ throw 'Index.html ainda nao recebeu o addon.' }
if($panel -notmatch 'presencasColuna'){ throw '30_ATENDE_D1_PAINEL.gs ainda nao envia os filtros de presenca.' }
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
  'RAW imutavel' = ($migration -notmatch 'ALTER TABLE atende_postagens_raw' -and $wrapper -notmatch 'UPDATE atende_postagens_raw')
}
foreach($item in $checks.GetEnumerator()){
  if(-not $item.Value){ throw ('Validacao falhou: '+$item.Key) }
}

$node=(Get-Command node -ErrorAction SilentlyContinue)
if(-not $node){ throw 'Node.js nao encontrado; necessario para validar JavaScript antes do deploy.' }

& node --check $wrapperPath
if($LASTEXITCODE -ne 0){ throw 'table-controls-wrapper.js falhou no node --check.' }
Write-Host 'OK - table-controls-wrapper.js passou no node --check.' -ForegroundColor Green

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
Write-Host 'OK - migration 0011 preserva o RAW.' -ForegroundColor Green
Write-Host 'OK - nenhuma publicacao de Cloudflare Pages e necessaria para esta rodada.' -ForegroundColor Green
