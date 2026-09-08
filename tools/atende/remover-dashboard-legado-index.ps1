$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$indexPath = Join-Path $repoRoot 'apps-script\atende\Index.html'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $indexPath)) {
  throw "Index.html nao encontrado: $indexPath"
}

$html = [System.IO.File]::ReadAllText($indexPath)
$beforeBytes = [System.Text.Encoding]::UTF8.GetByteCount($html)

# ============================================================
# 1. Remove somente o SCRIPT do Dashboard legado embutido no Index.
# Assinaturas exclusivas da versao antiga:
# - ATENDE_buscarDashboardD1
# - viewSwitchRow
# - Top 10 servicos / Evolucao no tempo
# ============================================================
$scriptRegex = New-Object System.Text.RegularExpressions.Regex(
  '<script\b[^>]*>[\s\S]*?<\/script>',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

$scriptMatches = @($scriptRegex.Matches($html))
$legacyScripts = @()
foreach ($m in $scriptMatches) {
  $text = $m.Value
  if ($text.Contains('ATENDE_buscarDashboardD1') -and $text.Contains('viewSwitchRow')) {
    $legacyScripts += $m
  }
}

if ($legacyScripts.Count -gt 1) {
  throw "Mais de um script de Dashboard legado foi encontrado ($($legacyScripts.Count)). Patch cancelado por seguranca."
}

if ($legacyScripts.Count -eq 1) {
  $html = $html.Remove($legacyScripts[0].Index, $legacyScripts[0].Length)
  Write-Host 'OK - script do Dashboard legado removido do Index.html.' -ForegroundColor Green
} else {
  Write-Host 'Nenhum script legado com ATENDE_buscarDashboardD1 foi encontrado.' -ForegroundColor DarkGray
}

# ============================================================
# 2. Remove o STYLE base da mesma versao antiga, se existir.
# O CSS mobile posterior e preservado porque nao contem .db-kpi.
# ============================================================
$styleRegex = New-Object System.Text.RegularExpressions.Regex(
  '<style\b[^>]*>[\s\S]*?<\/style>',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

$styleMatches = @($styleRegex.Matches($html))
$legacyStyles = @()
foreach ($m in $styleMatches) {
  $text = $m.Value
  if ($text.Contains('.view-switch-row') -and $text.Contains('.dashboard-view') -and $text.Contains('.db-kpi')) {
    $legacyStyles += $m
  }
}

if ($legacyStyles.Count -gt 1) {
  throw "Mais de um style base de Dashboard legado foi encontrado ($($legacyStyles.Count)). Patch cancelado por seguranca."
}

if ($legacyStyles.Count -eq 1) {
  # Recalcula a posicao no HTML atual, pois o script ja pode ter sido removido.
  $legacyStyleText = $legacyStyles[0].Value
  $stylePos = $html.IndexOf($legacyStyleText)
  if ($stylePos -ge 0) {
    $html = $html.Remove($stylePos, $legacyStyleText.Length)
    Write-Host 'OK - CSS base do Dashboard legado removido do Index.html.' -ForegroundColor Green
  }
} else {
  Write-Host 'Nenhum CSS base legado com .db-kpi foi encontrado.' -ForegroundColor DarkGray
}

# ============================================================
# 3. Validacoes de seguranca
# ============================================================
if ($html.Contains('ATENDE_buscarDashboardD1')) {
  throw 'Validacao falhou: ATENDE_buscarDashboardD1 ainda existe no Index.html.'
}
if ($html.Contains("barCard('Top 10 serviços'") -or $html.Contains("barCard('Top 10 serviços'")) {
  throw 'Validacao falhou: renderer antigo Top 10 servicos ainda existe no Index.html.'
}
if (-not $html.Contains('CLIENTE PORTAL')) {
  throw 'Validacao falhou: CLIENTE PORTAL desapareceu do Index.html.'
}
if (-not $html.Contains('ATENDE_MOBILE_USABILITY_V1')) {
  Write-Host 'AVISO - marker ATENDE_MOBILE_USABILITY_V1 nao encontrado. O patch nao o removeu, mas ele pode nao estar aplicado neste arquivo.' -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText($indexPath, $html, $utf8NoBom)
$afterBytes = [System.Text.Encoding]::UTF8.GetByteCount($html)

Write-Host ('Bytes antes: ' + $beforeBytes) -ForegroundColor Cyan
Write-Host ('Bytes depois: ' + $afterBytes) -ForegroundColor Cyan
Write-Host 'OK - Index.html ficou sem Dashboard legado. A unica fonte visual deve ser DashboardAddon.html.' -ForegroundColor Green
Write-Host 'Agora rode diagnosticar-index-js.ps1 e diagnosticar-dashboard-addon.ps1 antes do clasp push.' -ForegroundColor Cyan
