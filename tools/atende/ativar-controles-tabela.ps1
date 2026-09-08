$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$addonPath = Join-Path $repoRoot 'apps-script\atende\TableControlsAddon.html'
$panelGsPath = Join-Path $repoRoot 'apps-script\atende\30_ATENDE_D1_PAINEL.gs'
$proxyPath = Join-Path $repoRoot 'apps-script\atende\38_ATENDE_TABELA_CONTROLES.gs'
$panelWorkerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\panel-v3-portal.js'
$dashboardWorkerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\dashboard-v3-wrapper.js'
$localsWorkerPath = Join-Path $repoRoot 'cloudflare\atende-api\src\portal-locais-wrapper.js'
$wrapperPath = Join-Path $repoRoot 'cloudflare\atende-api\src\table-controls-wrapper.js'
$wranglerPath = Join-Path $repoRoot 'cloudflare\atende-api\wrangler.jsonc'
$migrationPath = Join-Path $repoRoot 'cloudflare\atende-api\migrations\0011_trava_linha_excecoes.sql'

$required = @($indexPath,$addonPath,$panelGsPath,$proxyPath,$panelWorkerPath,$dashboardWorkerPath,$localsWorkerPath,$wrapperPath,$wranglerPath,$migrationPath)
foreach($p in $required){ if(-not (Test-Path $p)){ throw "Arquivo necessario nao encontrado: $p" } }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Save-Text([string]$path,[string]$text){ [System.IO.File]::WriteAllText($path,$text,$utf8NoBom) }
function NewLine-For([string]$text){ if($text.Contains("`r`n")){ return "`r`n" }; return "`n" }
function With-NewLine([string]$text,[string]$nl){ return $text.Replace("`r`n","`n").Replace("`n",$nl) }
function Replace-Once([string]$text,[string]$old,[string]$new,[string]$label){
  $i=$text.IndexOf($old)
  if($i -lt 0){ throw "Trecho nao encontrado para patch: $label" }
  return $text.Substring(0,$i)+$new+$text.Substring($i+$old.Length)
}

# ------------------------------------------------------------
# 1) Index.html: injeta o addon sem sobrescrever outras alteracoes locais.
# ------------------------------------------------------------
$index = [System.IO.File]::ReadAllText($indexPath)
if($index -notmatch 'id="atende-table-controls-addon"'){
  $addon = [System.IO.File]::ReadAllText($addonPath)
  if($index -notmatch '</body>'){ throw 'Index.html nao possui </body>. Patch cancelado.' }
  $index = Replace-Once $index '</body>' ($addon + (NewLine-For $index) + '</body>') 'fechamento do Index.html'
  Save-Text $indexPath $index
  Write-Host 'OK - TableControlsAddon injetado no Index.html.' -ForegroundColor Green
}else{
  Write-Host 'TableControlsAddon ja esta ativo no Index.html.' -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 2) Apps Script: serializa filtros de presenca para o Worker.
# ------------------------------------------------------------
$gs = [System.IO.File]::ReadAllText($panelGsPath)
if($gs -notmatch 'presencasColuna'){
  $nl=NewLine-For $gs
  $fn='function ATENDE_adicionarContextoFiltroQuery_(query, params) {'
  $start=$gs.IndexOf($fn)
  if($start -lt 0){ throw 'ATENDE_adicionarContextoFiltroQuery_ nao encontrada em 30_ATENDE_D1_PAINEL.gs.' }
  $next=$gs.IndexOf($nl+'function ', $start+$fn.Length)
  if($next -lt 0){ $next=$gs.Length }
  $block=$gs.Substring($start,$next-$start)
  $returnAnchor='  return query;'
  $ri=$block.IndexOf($returnAnchor)
  if($ri -lt 0){ throw 'return query nao encontrado no helper de filtros.' }
  $presenceCode=With-NewLine @'
  const presencasColuna = params.presencasColuna && typeof params.presencasColuna === 'object'
    ? params.presencasColuna
    : {};
  Object.keys(presencasColuna).forEach(function(key) {
    const mode = String(presencasColuna[key] || '').toLowerCase();
    if (mode === 'blank' || mode === 'filled') {
      query.push('presence=' + encodeURIComponent(String(key) + '|' + mode));
    }
  });
'@ $nl
  $block=$block.Substring(0,$ri)+$presenceCode+$returnAnchor+$block.Substring($ri+$returnAnchor.Length)
  $gs=$gs.Substring(0,$start)+$block+$gs.Substring($next)
  Save-Text $panelGsPath $gs
  Write-Host 'OK - filtros Em branco/Nao em branco ligados ao proxy Apps Script.' -ForegroundColor Green
}else{
  Write-Host 'Filtros de presenca ja estao ativos no proxy Apps Script.' -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 3) Worker da tabela: filtros de presenca + excecao da trava por raw_id.
# ------------------------------------------------------------
$panel=[System.IO.File]::ReadAllText($panelWorkerPath)
$nl=NewLine-For $panel

if($panel -notmatch 'pte\.raw_id IS NULL THEN pcl\.local_codigo'){
  $oldLocal="const LOCAL_EXIBIDO_SQL = ``COALESCE(pcl.local_codigo, po.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $newLocal="const LOCAL_EXIBIDO_SQL = ``COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $panel=Replace-Once $panel $oldLocal $newLocal 'LOCAL_EXIBIDO_SQL do painel'
}

if($panel -notmatch 'LEFT JOIN atende_postagem_trava_excecoes pte'){
  $anchor='  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id'
  $panel=Replace-Once $panel $anchor ($anchor+$nl+'  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id') 'join da excecao de trava no painel'
}

if($panel -notmatch 'const PRESENCE_FIELDS = Object\.freeze'){
  $presenceFields=With-NewLine @'
const PRESENCE_FIELDS = Object.freeze({
  'DATA':'r.data_postagem_iso',
  'CEP DESTINATARIO':'r.cep_destinatario',
  'CEP REMETENTE':'r.cep_remetente',
  'OBJETO':`CASE WHEN ${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto,'') ELSE r.codigo_objeto END`,
  'COD SERVICO':'r.codigo_servico',
  'SERVICO':'r.nome_servico',
  'NOME REMETENTE':`COALESCE(c.nome_atual,r.nome_remetente)`,
  'CLIENTE PORTAL':CLIENTE_PORTAL_SQL,
  'CADASTRO PORTAL':CLIENTE_PORTAL_SQL,
  'ORIGEM PORTAL':`COALESCE(cp.origem_cliente,'')`,
  'CARTAO POSTAGEM':'r.cartao_postagem',
  'CONTRATO':'r.numero_contrato',
  'OCORR':'COALESCE(cc.ocorrencias,0)',
  'CLIENTE':`COALESCE(co.cliente,'')`,
  'TIPO':CONTRATO_TIPO_SQL,
  'INTERMEDIADOR':CONTRATO_INTERMEDIADOR_SQL,
  'SISTEMA':'r.sistema_postagem',
  'VALOR':'r.valor_atendimento_num',
  'ESTORNO':'r.estorno',
  'ATENDENTE':ATENDENTE_EXIBIDO_SQL,
  'MODALIDADE PAGAMENTO':'r.modalidade_pagamento',
  'FORMA PAGAMENTO':'r.forma_pagamento',
  'LOCAL':LOCAL_EXIBIDO_SQL
});

function parsePresence(url) {
  const byKey = new Map();
  for (const raw of url.searchParams.getAll('presence')) {
    const value = clean(raw);
    const pos = value.lastIndexOf('|');
    if (pos <= 0) continue;
    const key = clean(value.slice(0,pos));
    const mode = clean(value.slice(pos+1)).toLowerCase();
    if (!PRESENCE_FIELDS[key] || (mode !== 'blank' && mode !== 'filled')) continue;
    byKey.set(key,{key,mode});
  }
  return Array.from(byKey.values());
}

function presenceBlankSql(field) {
  return `(${field} IS NULL OR TRIM(CAST(${field} AS TEXT))='' OR LOWER(TRIM(CAST(${field} AS TEXT))) IN ('null','undefined'))`;
}

'@ $nl
  $panel=Replace-Once $panel 'const SORT_FIELDS = Object.freeze({' ($presenceFields+'const SORT_FIELDS = Object.freeze({') 'PRESENCE_FIELDS do painel'
}

if($panel -notmatch 'presence:parsePresence\(url\)'){
  $anchor="    q:clean(url.searchParams.get('q')),“"
}
