$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$addonPath = Join-Path $repoRoot 'apps-script\atende\TableControlsAddon.html'
$panelGsPath = Join-Path $repoRoot 'apps-script\atende\30_ATENDE_D1_PAINEL.gs'
$proxyPath = Join-Path $repoRoot 'apps-script\atende\38_ATENDE_TABELA_CONTROLES.gs'
$tableWrapperPath = Join-Path $repoRoot 'cloudflare\atende-api\src\table-controls-wrapper.js'
$dashboardWorkerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\dashboard-v3-wrapper.js'
$panelWorkerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\panel-v3-portal.js'
$wranglerPath = Join-Path $repoRoot 'cloudflare\atende-api\wrangler.jsonc'
$migrationPath = Join-Path $repoRoot 'cloudflare\atende-api\migrations\0011_trava_linha_excecoes.sql'

$required = @(
  $indexPath,$addonPath,$panelGsPath,$proxyPath,$tableWrapperPath,
  $dashboardWorkerPath,$panelWorkerPath,$wranglerPath,$migrationPath
)
foreach($p in $required){
  if(-not (Test-Path $p)){ throw "Arquivo necessario nao encontrado: $p" }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Save-Text([string]$path,[string]$text){
  [System.IO.File]::WriteAllText($path,$text,$utf8NoBom)
}
function NewLine-For([string]$text){
  if($text.Contains("`r`n")){ return "`r`n" }
  return "`n"
}
function Normalize-NewLines([string]$text,[string]$nl){
  return $text.Replace("`r`n","`n").Replace("`n",$nl)
}
function Replace-Exact([string]$text,[string]$old,[string]$new,[string]$label){
  $pos=$text.IndexOf($old)
  if($pos -lt 0){ throw "Trecho esperado nao encontrado: $label. Patch cancelado para evitar alteracao incorreta." }
  return $text.Substring(0,$pos)+$new+$text.Substring($pos+$old.Length)
}

# ------------------------------------------------------------
# 1. Index.html: injeta addon sem substituir o restante do arquivo local.
# ------------------------------------------------------------
$index = [System.IO.File]::ReadAllText($indexPath)
if($index -notmatch 'id="atende-table-controls-addon"'){
  $addon = [System.IO.File]::ReadAllText($addonPath)
  $pos = $index.LastIndexOf('</body>')
  if($pos -lt 0){ throw 'Index.html nao possui </body>. Patch cancelado.' }
  $nl = NewLine-For $index
  $index = $index.Substring(0,$pos) + $addon + $nl + $index.Substring($pos)
  Save-Text $indexPath $index
  Write-Host 'OK - addon de Colunas, filtros e cadeado injetado no Index.html.' -ForegroundColor Green
}else{
  Write-Host 'Addon de controles da tabela ja esta ativo no Index.html.' -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 2. Proxy Apps Script: envia presencasColuna ao Worker.
# ------------------------------------------------------------
$gs = [System.IO.File]::ReadAllText($panelGsPath)
if($gs -notmatch 'presencasColuna'){
  $nl = NewLine-For $gs
  $fn = 'function ATENDE_adicionarContextoFiltroQuery_(query, params) {'
  $start = $gs.IndexOf($fn)
  if($start -lt 0){ throw 'ATENDE_adicionarContextoFiltroQuery_ nao encontrada.' }
  $next = $gs.IndexOf($nl + 'function ', $start + $fn.Length)
  if($next -lt 0){ $next = $gs.Length }
  $block = $gs.Substring($start,$next-$start)
  $anchor = '  return query;'
  $ri = $block.IndexOf($anchor)
  if($ri -lt 0){ throw 'return query nao encontrado em ATENDE_adicionarContextoFiltroQuery_.' }

  $presence = @'
  const presencasColuna = params.presencasColuna && typeof params.presencasColuna === 'object'
    ? params.presencasColuna
    : {};
  Object.keys(presencasColuna).forEach(function(key) {
    const mode = String(presencasColuna[key] || '').toLowerCase();
    if (mode === 'blank' || mode === 'filled') {
      query.push('presence=' + encodeURIComponent(String(key) + '|' + mode));
    }
  });
'@
  $presence = Normalize-NewLines $presence $nl
  $block = $block.Substring(0,$ri) + $presence + $anchor + $block.Substring($ri+$anchor.Length)
  $gs = $gs.Substring(0,$start) + $block + $gs.Substring($next)
  Save-Text $panelGsPath $gs
  Write-Host 'OK - filtros Em branco/Nao em branco conectados ao D1.' -ForegroundColor Green
}else{
  Write-Host 'Filtros de presenca ja estao conectados ao D1.' -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 3. Wrapper da tabela: preserva Local dinamico do atendente (inclui BALCAO etc.).
# ------------------------------------------------------------
$table = [System.IO.File]::ReadAllText($tableWrapperPath)
$nl = NewLine-For $table
if($table -notmatch 'atl\.local_codigo'){
  $oldLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $newLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $table = Replace-Exact $table $oldLocal $newLocal 'LOCAL_EXIBIDO_SQL do table-controls-wrapper.js'

  $attJoin = '  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1'
  $table = Replace-Exact $table $attJoin ($attJoin+$nl+'  LEFT JOIN atende_atendente_local atl ON atl.codigo = r.atendente_norm') 'join atende_atendente_local do table-controls-wrapper.js'
  Save-Text $tableWrapperPath $table
  Write-Host 'OK - tabela preserva Local dinamico do atendente.' -ForegroundColor Green
}else{
  Write-Host 'Tabela ja usa Local dinamico do atendente.' -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 4. Dashboard V3: a mesma excecao individual vale nos KPIs/Metas/Local.
# ------------------------------------------------------------
$dash = [System.IO.File]::ReadAllText($dashboardWorkerPath)
$nl = NewLine-For $dash
if($dash -notmatch 'pte\.raw_id IS NULL THEN pcl\.local_codigo'){
  $oldLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(pcl.local_codigo, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $newLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $dash = Replace-Exact $dash $oldLocal $newLocal 'LOCAL_EXIBIDO_SQL do dashboard-v3-wrapper.js'
}
if($dash -notmatch 'LEFT JOIN atende_postagem_trava_excecoes pte'){
  $overrideJoin = '  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id'
  $dash = Replace-Exact $dash $overrideJoin ($overrideJoin+$nl+'  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id') 'join da excecao no dashboard-v3-wrapper.js'
}
Save-Text $dashboardWorkerPath $dash
Write-Host 'OK - Dashboard V3 alinhado com as excecoes individuais de Local.' -ForegroundColor Green

# ------------------------------------------------------------
# 5. Painel base: Local/filtros tambem respeitam excecao e Local dinamico.
# ------------------------------------------------------------
$panel = [System.IO.File]::ReadAllText($panelWorkerPath)
$nl = NewLine-For $panel
if($panel -notmatch 'pte\.raw_id IS NULL THEN pcl\.local_codigo'){
  $oldLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(pcl.local_codigo, po.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $newLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $panel = Replace-Exact $panel $oldLocal $newLocal 'LOCAL_EXIBIDO_SQL do panel-v3-portal.js'
}
if($panel -notmatch 'LEFT JOIN atende_atendente_local atl'){
  $attJoin = '  LEFT JOIN atende_atendentes a ON a.codigo = r.atendente_norm AND a.ativo = 1'
  $panel = Replace-Exact $panel $attJoin ($attJoin+$nl+'  LEFT JOIN atende_atendente_local atl ON atl.codigo = r.atendente_norm') 'join atende_atendente_local do panel-v3-portal.js'
}
if($panel -notmatch 'LEFT JOIN atende_postagem_trava_excecoes pte'){
  $overrideJoin = '  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id'
  $panel = Replace-Exact $panel $overrideJoin ($overrideJoin+$nl+'  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id') 'join da excecao no panel-v3-portal.js'
}
Save-Text $panelWorkerPath $panel
Write-Host 'OK - painel base alinhado com trava individual e Locais dinamicos.' -ForegroundColor Green

# ------------------------------------------------------------
# 6. Entry point do Worker. Altera apenas a chave main conhecida.
# ------------------------------------------------------------
$wrangler = [System.IO.File]::ReadAllText($wranglerPath)
if($wrangler -notmatch '"main"\s*:\s*"src/table-controls-wrapper\.js"'){
  if($wrangler -notmatch '"main"\s*:\s*"src/dashboard-v3-wrapper\.js"'){
    throw 'Entry point atual do wrangler.jsonc nao e o esperado. Patch cancelado para evitar sobrescrita incorreta.'
  }
  $wrangler = [regex]::Replace($wrangler,'"main"\s*:\s*"src/dashboard-v3-wrapper\.js"','"main": "src/table-controls-wrapper.js"',1)
  Save-Text $wranglerPath $wrangler
  Write-Host 'OK - Worker passa pelo table-controls-wrapper.js.' -ForegroundColor Green
}else{
  Write-Host 'Worker ja passa pelo table-controls-wrapper.js.' -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 7. Garantias finais. Nenhum arquivo de Pages e alterado nesta rodada.
# ------------------------------------------------------------
$table = [System.IO.File]::ReadAllText($tableWrapperPath)
if($table -notmatch '/admin/row-lock-exception'){ throw 'Endpoint de destrava por linha nao encontrado.' }
if($table -notmatch 'presenceBlankSql'){ throw 'Filtro server-side de celulas vazias nao encontrado.' }
if($table -notmatch '_LOCAL_EXCECAO'){ throw 'Metadado de excecao de trava nao encontrado.' }

Write-Host 'OK - seletor de colunas configurado por usuario no navegador.' -ForegroundColor Green
Write-Host 'OK - filtro de cabecalho Todos/Em branco/Nao em branco configurado.' -ForegroundColor Green
Write-Host 'OK - cadeado individual e botoes em lote configurados.' -ForegroundColor Green
Write-Host 'OK - nenhum arquivo de Cloudflare Pages/frontend foi alterado.' -ForegroundColor Green
Write-Host 'Proximo passo: rode diagnosticar-controles-tabela.ps1 antes do deploy.' -ForegroundColor Cyan
