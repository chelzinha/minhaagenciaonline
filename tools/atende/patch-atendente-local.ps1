$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'

if (-not (Test-Path $indexPath)) {
  throw "Index.html do Atende nao encontrado em: $indexPath"
}

$text = [System.IO.File]::ReadAllText($indexPath)
$marker = 'ATENDE_LOCAL_ATENDENTE_PATCH_V1'

if ($text.Contains($marker)) {
  Write-Host 'OK - patch de Local padrao por Atendente ja esta aplicado.' -ForegroundColor Green
  exit 0
}

$pattern = 'function renderAdminAttendants\(\)\{.*?\}function saveAttendant\(code,i\)\{.*?\}(?=function adminPresence)'
$matches = [regex]::Matches($text, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

if ($matches.Count -ne 1) {
  throw "Bloco de Atendentes nao encontrado de forma unica (encontrados: $($matches.Count)). Patch cancelado para evitar alteracao incorreta."
}

$replacement = @'
/* ATENDE_LOCAL_ATENDENTE_PATCH_V1 */
function renderAdminAttendants(){if(!ADMIN_DATA)return;var q=getValue('searchAttendant').toLowerCase(),rows=(ADMIN_DATA.atendentes||[]).filter(function(x){return!q||(String(x.codigo||'')+' '+String(x.nome||'')+' '+String(x.local_padrao||'')).toLowerCase().includes(q)}).slice(0,200);document.getElementById('adminAttendants').innerHTML='<table class="admin-table"><thead><tr><th>Código</th><th>Ocorr.</th><th>Nome exibido</th><th>Local padrão</th><th></th></tr></thead><tbody>'+rows.map(function(x,i){var local=String(x.local_padrao||'').toUpperCase();return'<tr><td>'+esc(x.codigo)+'</td><td>'+Number(x.ocorrencias||0).toLocaleString('pt-BR')+'</td><td><input id="att-'+i+'" value="'+esc(x.nome||'')+'" placeholder="Nome do atendente"></td><td><select id="att-local-'+i+'"><option value="" '+(!local?'selected':'')+'>Sem padrão</option><option value="AGF" '+(local==='AGF'?'selected':'')+'>AGF</option><option value="METRO" '+(local==='METRO'?'selected':'')+'>METRÔ</option></select></td><td><button class="btn" onclick="saveAttendant(\''+js(x.codigo)+'\','+i+')">Salvar</button></td></tr>'}).join('')+'</tbody></table>'}function saveAttendant(code,i){adminCall('attendant',{codigo:code,nome:getValue('att-'+i),localPadrao:getValue('att-local-'+i)})}
'@

$text = [regex]::Replace(
  $text,
  $pattern,
  [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement },
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$noteOld = 'O filtro ATENDENTE agrupa nomes repetidos. Aqui os códigos continuam separados porque cada código original precisa manter seu vínculo com a pessoa.'
$noteNew = 'O filtro ATENDENTE agrupa nomes repetidos. Cada código continua separado e pode ter um Local padrão. Quando o Remetente não tiver Local padrão, a postagem usa o Local padrão do Atendente. A alteração manual do Local na tabela continua tendo prioridade.'
if ($text.Contains($noteOld)) {
  $text = $text.Replace($noteOld, $noteNew)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($indexPath, $text, $utf8NoBom)

Write-Host 'OK - painel de Atendentes agora permite cadastrar Local padrao.' -ForegroundColor Green
Write-Host 'Regra efetiva: Manual > Remetente > Atendente > vazio.' -ForegroundColor Cyan
Write-Host 'Arquivo alterado: apps-script/atende/Index.html' -ForegroundColor DarkGray
