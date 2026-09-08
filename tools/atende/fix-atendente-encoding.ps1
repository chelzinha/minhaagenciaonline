$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'

if (-not (Test-Path $indexPath)) {
  throw "Index.html do Atende nao encontrado em: $indexPath"
}

$text = [System.IO.File]::ReadAllText($indexPath)
$marker = '/* ATENDE_LOCAL_ATENDENTE_PATCH_V2 */'
$endAnchor = 'function adminPresence('

$start = $text.IndexOf($marker, [System.StringComparison]::Ordinal)
if ($start -lt 0) {
  throw 'Marcador ATENDE_LOCAL_ATENDENTE_PATCH_V2 nao encontrado. Correcao cancelada.'
}

$end = $text.IndexOf($endAnchor, $start, [System.StringComparison]::Ordinal)
if ($end -le $start) {
  throw 'Fim do bloco de Atendentes nao encontrado. Correcao cancelada.'
}

# Este bloco e propositalmente ASCII-only. Os acentos sao gerados pelo
# JavaScript via escapes Unicode, evitando mojibake no Windows PowerShell 5.1.
$replacement = @'
/* ATENDE_LOCAL_ATENDENTE_PATCH_V2 */
function renderAdminAttendants(){if(!ADMIN_DATA)return;var q=getValue('searchAttendant').toLowerCase(),rows=(ADMIN_DATA.atendentes||[]).filter(function(x){return!q||(String(x.codigo||'')+' '+String(x.nome||'')+' '+String(x.local_padrao||'')).toLowerCase().includes(q)}).slice(0,200);document.getElementById('adminAttendants').innerHTML='<table class="admin-table"><thead><tr><th>C\u00F3digo</th><th>Ocorr.</th><th>Nome exibido</th><th>Local padr\u00E3o</th><th></th></tr></thead><tbody>'+rows.map(function(x,i){var local=String(x.local_padrao||'').toUpperCase();return'<tr><td>'+esc(x.codigo)+'</td><td>'+Number(x.ocorrencias||0).toLocaleString('pt-BR')+'</td><td><input id="att-'+i+'" value="'+esc(x.nome||'')+'" placeholder="Nome do atendente"></td><td><select id="att-local-'+i+'"><option value="" '+(!local?'selected':'')+'>Sem padr\u00E3o</option><option value="AGF" '+(local==='AGF'?'selected':'')+'>AGF</option><option value="METRO" '+(local==='METRO'?'selected':'')+'>METR\u00D4</option></select></td><td><button class="btn" onclick="saveAttendant(\''+js(x.codigo)+'\','+i+')">Salvar</button></td></tr>'}).join('')+'</tbody></table>'}
function saveAttendant(code,i){adminCall('attendant',{codigo:code,nome:getValue('att-'+i),localPadrao:getValue('att-local-'+i)})}
'@

$text = $text.Substring(0, $start) + $replacement + $text.Substring($end)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($indexPath, $text, $utf8NoBom)

Write-Host 'OK - encoding dos textos de Atendentes corrigido.' -ForegroundColor Green
Write-Host 'Codigo, Local padrao, Sem padrao e METRO passam a renderizar com acentos corretos.' -ForegroundColor Cyan
Write-Host 'Arquivo alterado: apps-script/atende/Index.html' -ForegroundColor DarkGray
