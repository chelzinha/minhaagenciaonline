$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$addonPath = Join-Path $repoRoot 'apps-script\atende\TableControlsAddon.html'
$panelGsPath = Join-Path $repoRoot 'apps-script\atende\30_ATENDE_D1_PAINEL.gs'
$proxyPath = Join-Path $repoRoot 'apps-script\atende\38_ATENDE_TABELA_CONTROLES.gs'
$wrapperPath = Join-Path $repoRoot 'cloudflare\atende-api\src\table-controls-wrapper.js'
$wranglerPath = Join-Path $repoRoot 'cloudflare\atende-api\wrangler.jsonc'
$migrationPath = Join-Path $repoRoot 'cloudflare\atende-api\migrations\0011_trava_linha_excecoes.sql'

$required = @($indexPath,$addonPath,$panelGsPath,$proxyPath,$wrapperPath,$wranglerPath,$migrationPath)
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

# 1. Index.html: injeta o addon sem substituir o restante do arquivo local.
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

# 2. 30_ATENDE_D1_PAINEL.gs: envia presencasColuna como query presence=COLUNA|modo.
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

# 3. Garantias de backend. Estes arquivos chegam prontos pelo Git.
$wrangler = [System.IO.File]::ReadAllText($wranglerPath)
if($wrangler -notmatch '"main"\s*:\s*"src/table-controls-wrapper\.js"'){
  throw 'wrangler.jsonc ainda nao aponta para src/table-controls-wrapper.js. Rode git fetch/checkout dos arquivos novos.'
}
$wrapper = [System.IO.File]::ReadAllText($wrapperPath)
if($wrapper -notmatch '/admin/row-lock-exception'){ throw 'Endpoint de destrava por linha nao encontrado.' }
if($wrapper -notmatch 'presenceBlankSql'){ throw 'Filtro server-side de celulas vazias nao encontrado.' }
if($wrapper -notmatch '_LOCAL_EXCECAO'){ throw 'Metadado de excecao de trava nao encontrado.' }

Write-Host 'OK - seletor de colunas configurado por usuario no navegador.' -ForegroundColor Green
Write-Host 'OK - filtro de cabecalho Todos/Em branco/Nao em branco configurado.' -ForegroundColor Green
Write-Host 'OK - cadeado individual e botoes em lote configurados.' -ForegroundColor Green
Write-Host 'OK - nenhum arquivo de Cloudflare Pages/frontend foi alterado.' -ForegroundColor Green
Write-Host 'Proximo passo: rode diagnosticar-controles-tabela.ps1 antes do deploy.' -ForegroundColor Cyan
