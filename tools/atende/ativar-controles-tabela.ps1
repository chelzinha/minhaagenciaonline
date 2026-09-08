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

# ------------------------------------------------------------
# 1) Index.html: injeta addon sem sobrescrever outras alteracoes locais.
# ------------------------------------------------------------
$index = [System.IO.File]::ReadAllText($indexPath)
if($index -notmatch 'id="atende-table-controls-addon"'){
  $addon = [System.IO.File]::ReadAllText($addonPath)
  if($index -notmatch '</body>'){ throw 'Index.html nao possui </body>. Patch cancelado.' }
  $index = $index.Replace('</body>', $addon + [Environment]::NewLine + '</body>')
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
  $fn = 'function ATENDE_adicionarContextoFiltroQuery_(query, params) {'
  $start = $gs.IndexOf($fn)
  if($start -lt 0){ throw 'ATENDE_adicionarContextoFiltroQuery_ nao encontrada em 30_ATENDE_D1_PAINEL.gs.' }
  $next = $gs.IndexOf([Environment]::NewLine + 'function ', $start + $fn.Length)
  if($next -lt 0){ $next = $gs.Length }
  $block = $gs.Substring($start, $next - $start)
  if($block -notmatch '  return query;'){ throw 'return query nao encontrado no helper de filtros.' }
  $presenceCode = @"
  const presencasColuna = params.presencasColuna && typeof params.presencasColuna === 'object'
    ? params.presencasColuna
    : {};
  Object.keys(presencasColuna).forEach(function(key) {
    const mode = String(presencasColuna[key] || '').toLowerCase();
    if (mode === 'blank' || mode === 'filled') {
      query.push('presence=' + encodeURIComponent(String(key) + '|' + mode));
    }
  });
"@
  $newBlock = $block.Replace('  return query;', $presenceCode + '  return query;')
  $gs = $gs.Substring(0,$start) + $newBlock + $gs.Substring($next)
  Save-Text $panelGsPath $gs
  Write-Host 'OK - filtros Em branco/Nao em branco ligados ao proxy Apps Script.' -ForegroundColor Green
}else{
  Write-Host 'Filtros de presenca ja estao ativos no proxy Apps Script.' -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 3) Worker de leitura: presenca de coluna + excecao da trava por raw_id.
# ------------------------------------------------------------
$panel = [System.IO.File]::ReadAllText($panelWorkerPath)

if($panel -notmatch 'pte\.raw_id IS NULL THEN pcl\.local_codigo'){
  $oldLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(pcl.local_codigo, po.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $newLocal = "const LOCAL_EXIBIDO_SQL = ``COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  if(-not $panel.Contains($oldLocal)){ throw 'Expressao LOCAL_EXIBIDO_SQL esperada nao encontrada em panel-v3-portal.js.' }
  $panel = $panel.Replace($oldLocal,$newLocal)
}

if($panel -notmatch 'LEFT JOIN atende_postagem_trava_excecoes pte'){
  $anchor = '  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id'
  if(-not $panel.Contains($anchor)){ throw 'Join de postagem_overrides nao encontrado em panel-v3-portal.js.' }
  $panel = $panel.Replace($anchor,$anchor + [Environment]::NewLine + '  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id')
}

if($panel -notmatch 'const PRESENCE_FIELDS = Object\.freeze'){
  $presenceFields = @"
const PRESENCE_FIELDS = Object.freeze({
  'DATA':'r.data_postagem_iso',
  'CEP DESTINATARIO':'r.cep_destinatario',
  'CEP REMETENTE':'r.cep_remetente',
  'OBJETO':`CASE WHEN `${OBJETO_VAZIO_SQL} THEN COALESCE(sc.tipo_objeto,'') ELSE r.codigo_objeto END`,
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
  return `(` + field + ` IS NULL OR TRIM(CAST(` + field + ` AS TEXT))='' OR LOWER(TRIM(CAST(` + field + ` AS TEXT))) IN ('null','undefined'))`;
}

"@
  $anchor = 'const SORT_FIELDS = Object.freeze({'
  if(-not $panel.Contains($anchor)){ throw 'SORT_FIELDS nao encontrado em panel-v3-portal.js.' }
  $panel = $panel.Replace($anchor,$presenceFields + $anchor)
}

if($panel -notmatch 'presence:parsePresence\(url\)'){
  $anchor = "    q:clean(url.searchParams.get('q'))," + [Environment]::NewLine + '    facets'
  if(-not $panel.Contains($anchor)){ throw 'Objeto parseFilterState esperado nao encontrado em panel-v3-portal.js.' }
  $panel = $panel.Replace($anchor,"    q:clean(url.searchParams.get('q'))," + [Environment]::NewLine + '    presence:parsePresence(url),' + [Environment]::NewLine + '    facets')
}

if($panel -notmatch 'for \(const item of state\.presence'){
  $anchor = "  if (excludeFacet !== 'tiposObjeto') addObjectFilter(where,args,state.facets.tiposObjeto);" + [Environment]::NewLine + '  return {where,args,whereSql:where.length?` WHERE ${where.join('' AND '')}`:''''};'
  if(-not $panel.Contains($anchor)){ throw 'Final de buildWhere nao encontrado em panel-v3-portal.js.' }
  $replacement = "  if (excludeFacet !== 'tiposObjeto') addObjectFilter(where,args,state.facets.tiposObjeto);" + [Environment]::NewLine + @"
  for (const item of state.presence || []) {
    const field = PRESENCE_FIELDS[item.key];
    if (!field) continue;
    const blankSql = presenceBlankSql(field);
    where.push(item.mode === 'blank' ? blankSql : `NOT (` + blankSql + `)`);
  }
  return {where,args,whereSql:where.length?` WHERE `${where.join(' AND ')}`:''};
"@
  $panel = $panel.Replace($anchor,$replacement.TrimEnd())
}

if($panel -notmatch 'AS "_LOCAL_EXCECAO"'){
  $oldMeta = "    COALESCE(cp.cx_at,'') AS \"_CX_AT_PORTAL\",CASE WHEN pcl.local_codigo IS NOT NULL THEN 1 ELSE 0 END AS \"_LOCAL_TRAVADO\"," + [Environment]::NewLine + "    COALESCE(pcl.local_codigo,'') AS \"_LOCAL_TRAVA_PORTAL\","
  $newMeta = "    COALESCE(cp.cx_at,'') AS \"_CX_AT_PORTAL\",CASE WHEN pcl.local_codigo IS NOT NULL AND pte.raw_id IS NULL THEN 1 ELSE 0 END AS \"_LOCAL_TRAVADO\"," + [Environment]::NewLine + "    CASE WHEN pte.raw_id IS NOT NULL THEN 1 ELSE 0 END AS \"_LOCAL_EXCECAO\"," + [Environment]::NewLine + "    COALESCE(pcl.local_codigo,'') AS \"_LOCAL_TRAVA_PORTAL\","
  if(-not $panel.Contains($oldMeta)){ throw 'Metadados de trava esperados nao encontrados em panel-v3-portal.js.' }
  $panel = $panel.Replace($oldMeta,$newMeta)
}
Save-Text $panelWorkerPath $panel
Write-Host 'OK - Worker da tabela atualizado para filtros de celulas vazias e excecao por linha.' -ForegroundColor Green

# ------------------------------------------------------------
# 4) Dashboard: Local deve respeitar a mesma excecao por linha.
# ------------------------------------------------------------
$dash = [System.IO.File]::ReadAllText($dashboardWorkerPath)
if($dash -notmatch 'pte\.raw_id IS NULL THEN pcl\.local_codigo'){
  $old = "const LOCAL_EXIBIDO_SQL = ``COALESCE(pcl.local_codigo, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  $new = "const LOCAL_EXIBIDO_SQL = ``COALESCE(CASE WHEN pte.raw_id IS NULL THEN pcl.local_codigo ELSE NULL END, po.local_codigo, atl.local_codigo, a.local_padrao, c.local_padrao, '')``;"
  if(-not $dash.Contains($old)){ throw 'LOCAL_EXIBIDO_SQL esperado nao encontrado em dashboard-v3-wrapper.js.' }
  $dash = $dash.Replace($old,$new)
}
if($dash -notmatch 'LEFT JOIN atende_postagem_trava_excecoes pte'){
  $anchor='  LEFT JOIN atende_postagem_overrides po ON po.raw_id = r.id'
  if(-not $dash.Contains($anchor)){ throw 'Join postagem_overrides nao encontrado no dashboard V3.' }
  $dash=$dash.Replace($anchor,$anchor+[Environment]::NewLine+'  LEFT JOIN atende_postagem_trava_excecoes pte ON pte.raw_id = r.id')
}
Save-Text $dashboardWorkerPath $dash
Write-Host 'OK - Dashboard alinhado com as excecoes individuais de Local.' -ForegroundColor Green

# ------------------------------------------------------------
# 5) Trava geral do cliente: bulk-local ignora linhas explicitamente liberadas.
# ------------------------------------------------------------
$locals = [System.IO.File]::ReadAllText($localsWorkerPath)
if($locals -notmatch 'pte\.raw_id IS NULL'){
  $fn='async function lockedRowsFromRequest(request, env) {'
  $start=$locals.IndexOf($fn)
  if($start -lt 0){ throw 'lockedRowsFromRequest nao encontrada em portal-locais-wrapper.js.' }
  $next=$locals.IndexOf([Environment]::NewLine+'async function ', $start+$fn.Length)
  if($next -lt 0){ $next=$locals.Length }
  $block=$locals.Substring($start,$next-$start)
  $joinAnchor="       AND pcl.ativo=1" + [Environment]::NewLine + '      WHERE cp.raw_id IN (${chunk.map(()=>''?'').join('','')})'
  if(-not $block.Contains($joinAnchor)){ throw 'Consulta de linhas travadas mudou; patch automatico cancelado.' }
  $joinNew="       AND pcl.ativo=1" + [Environment]::NewLine + '      LEFT JOIN atende_postagem_trava_excecoes pte' + [Environment]::NewLine + '        ON pte.raw_id=cp.raw_id' + [Environment]::NewLine + '      WHERE cp.raw_id IN (${chunk.map(()=>''?'').join('','')})' + [Environment]::NewLine + '        AND pte.raw_id IS NULL'
  $newBlock=$block.Replace($joinAnchor,$joinNew)
  $locals=$locals.Substring(0,$start)+$newBlock+$locals.Substring($next)
  Save-Text $localsWorkerPath $locals
}
Write-Host 'OK - bulk de Local respeita linhas destravadas individualmente.' -ForegroundColor Green

# ------------------------------------------------------------
# 6) Wrangler passa pelo novo wrapper, sem alterar Pages/topo.
# ------------------------------------------------------------
$wrangler=[System.IO.File]::ReadAllText($wranglerPath)
if($wrangler -notmatch 'src/table-controls-wrapper\.js'){
  if($wrangler -notmatch '"main"\s*:\s*"src/dashboard-v3-wrapper\.js"'){ throw 'main esperado nao encontrado no wrangler.jsonc.' }
  $wrangler=[regex]::Replace($wrangler,'"main"\s*:\s*"src/dashboard-v3-wrapper\.js"','"main": "src/table-controls-wrapper.js"',1)
  Save-Text $wranglerPath $wrangler
}
Write-Host 'OK - Worker passa pelo table-controls-wrapper.js.' -ForegroundColor Green
Write-Host 'OK - nenhum arquivo de Cloudflare Pages/frontend foi alterado.' -ForegroundColor Green
Write-Host 'Proximo passo: rode diagnosticar-controles-tabela.ps1 antes de migration/deploy.' -ForegroundColor Cyan
