$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'

if (-not (Test-Path $indexPath)) {
  throw "Index.html nao encontrado: $indexPath"
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$html = [System.IO.File]::ReadAllText($indexPath)

$pattern = 'function\s+applyPortalLocalUi\s*\(\)\s*\{[\s\S]*?(?=function\s+renderAdminHistory\s*\()'
$matches = [regex]::Matches($html, $pattern)
if ($matches.Count -ne 1) {
  throw "applyPortalLocalUi nao encontrada de forma unica (encontrados: $($matches.Count)). Patch cancelado."
}

$fixedFunction = @'
function applyPortalLocalUi(){
  if(!IS_ADMIN)return;
  ROWS.forEach(function(r){
    var id=Number(r._RAW_ID||0);
    if(!id)return;
    var tr=document.querySelector('tr[data-id="'+id+'"]');
    if(!tr)return;
    var locked=Number(r._LOCAL_TRAVADO||0)===1;
    var check=tr.querySelector('.rowCheck');
    var sel=tr.querySelector('.local-select');
    if(locked&&check){
      check.disabled=true;
      check.title='Local travado pelo CLIENTE PORTAL';
    }
    if(!sel)return;
    if(locked){
      var td=sel.parentNode;
      td.title='Local travado pelo CLIENTE PORTAL: '+String(r['CLIENTE PORTAL']||'');
      td.innerHTML='<span class="obj-chip">&#128274; '+esc(r.LOCAL||r._LOCAL_TRAVA_PORTAL||'')+'</span>';
    }else{
      sel.innerHTML=localOptions(r.LOCAL||'','Padrao');
      sel.value=String(r.LOCAL||'');
    }
  });
}

'@

$html = [regex]::Replace($html, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $fixedFunction }, 1)

# Corrige regressao separada observada pelo diagnostico.
$html = $html.Replace('varkey=csvNorm(codigo);','var key=csvNorm(codigo);')

[System.IO.File]::WriteAllText($indexPath, $html, $utf8NoBom)

Write-Host 'OK - sintaxe de applyPortalLocalUi corrigida.' -ForegroundColor Green
Write-Host 'OK - importServicesCsv corrigido (var key).' -ForegroundColor Green
Write-Host 'Rode diagnosticar-index-js.ps1 antes do clasp push.' -ForegroundColor Cyan
