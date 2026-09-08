$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$shellPath = Join-Path $repoRoot 'frontend\atende\index.html'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $indexPath)) { throw "Index.html do Apps Script nao encontrado: $indexPath" }
if (-not (Test-Path $shellPath)) { throw "frontend/atende/index.html nao encontrado: $shellPath" }

# ============================================================
# Apps Script / painel interno
# ============================================================
$inner = [System.IO.File]::ReadAllText($indexPath)
$innerMarker = 'ATENDE_MOBILE_USABILITY_V1'
if (-not $inner.Contains($innerMarker)) {
  $css = @'
<!-- ATENDE_MOBILE_USABILITY_V1 -->
<style id="atende-mobile-usability-v1">
@media (max-width:700px){
  html,body{height:auto!important;min-height:100%!important;max-width:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:auto!important}
  body{-webkit-text-size-adjust:100%;touch-action:pan-x pan-y}
  .app{height:auto!important;min-height:100%!important;overflow:visible!important}
  .content{height:auto!important;min-height:100%!important;display:block!important;overflow:visible!important;padding:6px!important}
  .card{height:auto!important;min-height:calc(100dvh - 12px)!important;display:block!important;overflow:visible!important;border-radius:10px!important}
  .table-top{padding:8px!important;overflow:visible!important}
  .query-row{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:8px!important;align-items:end!important}
  .query-search,.query-month,.total-value{grid-column:1/-1!important}
  .query-row>span:not(.summary-pill){display:none!important}
  .summary-pill{grid-column:1/-1!important;justify-self:start!important;height:36px!important;padding:0 12px!important}
  .total-value{height:auto!important;min-height:34px!important;padding-top:2px!important;font-size:18px!important}
  .query-search-box,.query-date input,.multi-button{height:44px!important;min-height:44px!important}
  .query-search-box input,.query-date input,input[type="date"],.admin-input,.admin-table input,.admin-table select{font-size:16px!important}
  .query-date,.query-date input,input[type="date"]{min-width:0!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important}
  .query-date input,input[type="date"]{-webkit-appearance:none!important;appearance:none!important;padding:0 9px!important}
  .month-nav{height:44px!important;grid-template-columns:42px minmax(0,1fr) 42px 104px!important}
  .month-nav button{height:42px!important}.month-current{font-size:11px!important}.month-all{font-size:10px!important}
  .facet-row{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;align-items:end!important}
  .facet-row .more-btn,.facet-row .clear-btn{width:100%!important;height:42px!important}
  .facet-field label,.query-search label,.query-date label,.query-month label{font-size:9px!important;margin-bottom:4px!important}
  .more-filters.on{grid-template-columns:1fr!important;gap:8px!important;padding:8px!important}
  .more-group{border-right:0!important;padding-right:0!important;border-top:1px solid var(--line)!important;padding-top:8px!important}
  .more-group:first-child{border-top:0!important;padding-top:0!important}
  .active-chips{gap:6px!important}.chip{min-height:29px!important;height:auto!important}
  .view-switch-row{margin-top:9px!important}.view-switch{width:100%!important}
  .wrap{width:100%!important;max-width:100vw!important;min-height:58dvh!important;max-height:none!important;overflow:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:auto!important;touch-action:pan-x pan-y!important}
  .data-table{min-width:2100px!important;width:max-content!important;table-layout:fixed!important}
  .data-table th,.data-table td{font-size:12px!important}
  .footer{position:static!important;min-height:44px!important;height:auto!important;flex-wrap:wrap!important;gap:7px!important;padding:7px!important}
  .pager{margin-left:0!important;width:100%!important;justify-content:space-between!important;flex-wrap:wrap!important}
  .dashboard-mode .wrap{min-height:0!important;overflow:visible!important}
  .dashboard-mode .dashboard-view{width:100%!important;max-width:100%!important;overflow:visible!important}
  .admin-overlay{padding:6px!important;align-items:flex-start!important;overflow:auto!important}
  .admin-modal{width:100%!important;height:auto!important;min-height:calc(100dvh - 12px)!important;max-height:none!important;border-radius:10px!important}
  .admin-body{overflow:visible!important}.quick-grid{grid-template-columns:1fr!important}
  .admin-tools{align-items:stretch!important}.admin-tools .grow{min-width:0!important}
  .ms-menu{max-height:min(70dvh,430px)!important}
}
@media (max-width:430px){
  .facet-row{grid-template-columns:1fr 1fr!important}
  .query-row{grid-template-columns:1fr 1fr!important}
  .data-table{min-width:2050px!important}
}
</style>
'@
  if (-not $inner.Contains('</head>')) { throw 'Nao foi encontrado </head> no Index.html.' }
  $inner = $inner.Replace('</head>', $css + "`r`n</head>")
  [System.IO.File]::WriteAllText($indexPath,$inner,$utf8NoBom)
  Write-Host 'OK - CSS mobile inserido no Apps Script.' -ForegroundColor Green
} else {
  Write-Host 'Apps Script: patch mobile ja aplicado.' -ForegroundColor DarkGray
}

# ============================================================
# Shell externo / Cloudflare Pages
# ============================================================
$shell = [System.IO.File]::ReadAllText($shellPath)
$shellMarker = 'ATENDE_MOBILE_SHELL_V1'
if (-not $shell.Contains($shellMarker)) {
  $shellCss = @'
    /* ATENDE_MOBILE_SHELL_V1 */
    @media(max-width:700px){
      html,body{height:100dvh!important;min-height:100dvh!important;overflow:hidden!important}
      .atende-shell{height:100dvh!important;min-height:100dvh!important;grid-template-rows:58px minmax(0,1fr)!important}
      .atende-topbar,.atende-topbar-inner{min-height:58px!important;height:58px!important}
      .atende-frame-wrap{min-height:0!important;height:100%!important;overflow:hidden!important;touch-action:pan-x pan-y!important}
      #atendeFrame{height:100%!important;min-height:0!important;width:100%!important;max-width:100%!important;overflow:auto!important;touch-action:pan-x pan-y!important}
      .user-wrap,.user-av,.user-av-md{flex-shrink:0!important}
      .user-av-md{width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;max-width:36px!important;max-height:36px!important;aspect-ratio:1/1!important;flex-basis:36px!important;border-radius:50%!important}
      .user-av-md img{width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;object-fit:cover!important;border-radius:50%!important}
      .atende-topbar-inner{padding-left:10px!important;padding-right:10px!important;gap:8px!important}
      .atende-brand{min-width:0!important;flex:1 1 auto!important}.atende-brand strong{overflow:hidden!important;text-overflow:ellipsis!important}
      .top-actions{flex:0 0 auto!important;min-width:max-content!important}
    }
'@
  $styleClose = '</style>'
  $pos = $shell.IndexOf($styleClose)
  if ($pos -lt 0) { throw 'Nao foi encontrado </style> no frontend/atende/index.html.' }
  $shell = $shell.Insert($pos,$shellCss + "`r`n")
  $shell = $shell.Replace('scrolling="no"','scrolling="auto"')
  [System.IO.File]::WriteAllText($shellPath,$shell,$utf8NoBom)
  Write-Host 'OK - shell mobile e scrolling do iframe corrigidos.' -ForegroundColor Green
} else {
  Write-Host 'Shell externo: patch mobile ja aplicado.' -ForegroundColor DarkGray
}

Write-Host 'Concluido. Rode o diagnostico JavaScript antes do clasp push.' -ForegroundColor Cyan
