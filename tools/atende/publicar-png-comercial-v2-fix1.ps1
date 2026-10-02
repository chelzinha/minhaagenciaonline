# Correcao dos percentuais do Balcao na arte PNG da aba Comercial (Visao 360).
# Etapas: confere repositorio -> backup -> aplica -> Apps Script -> Git. Worker nao muda.
# Para em qualquer erro e pode ser rodado de novo.

$ErrorActionPreference = 'Stop'
$Repo     = 'C:\AGF-Codex\minhaagenciaonline'
$Pacote   = $PSScriptRoot
$DeployId = 'AKfycbwCBAG4gBVHMHh7cHgnIG215RL8m8CbymvsAaHcs4bXhp0RCyPeP_cr6IA5iZtsch_m1g'
$Entrada  = Join-Path $Pacote 'changelog-entrada.md'
$Novos    = Join-Path $Pacote 'arquivos'

# Versao esperada no repositorio antes da correcao (MD5). Se mudou, nada e sobrescrito.
$Esperado = @{
  'apps-script/atende/DashboardCommercialPngV2.html'              = 'F86346D902CFBC19EA57B3BA964F0CE8'
  'tools/atende/png-comercial-v2/v2_logica.js'                    = '28E9485ADF6BE144EF0A020ED516FF0B'
  'tools/atende/png-comercial-v2/balcao/modelo_balcao.html'       = '39F15720FDE221F26C4A32F4BF5ED3B1'
  'tools/atende/png-comercial-v2/balcao/dados_balcao.json'        = 'C2512E1273E5031B5DD87337FFDC5301'
  'docs/atende/PNG_COMERCIAL_V2.md'                               = 'A1D7CF61D490FBDA827119B50C52AFA1'
}

function Etapa($n, $texto) { Write-Host ''; Write-Host "[$n/5] $texto" -ForegroundColor Cyan }
function Falhou($texto) {
  Write-Host ''; Write-Host "ERRO: $texto" -ForegroundColor Red
  Write-Host 'Nada foi publicado alem das etapas ja concluidas acima. Corrija e rode o comando de novo.' -ForegroundColor Yellow
  exit 1
}

# 1 ------------------------------------------------------------
Etapa 1 'Conferindo o repositorio'
Set-Location $Repo
if (Test-Path (Join-Path $Repo '.git\index.lock')) { Falhou 'existe o arquivo .git\index.lock. Feche outros git abertos e apague esse arquivo.' }
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { Falhou "branch atual e '$branch', esperado 'main'." }
git fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { Falhou 'git fetch falhou.' }
$atras = [int](git rev-list --count HEAD..origin/main)
if ($atras -gt 0) { Falhou "a main local esta $atras commit(s) atras do GitHub. Rode: git pull --ff-only origin main" }

$jaAplicado = $true
foreach ($rel in $Esperado.Keys) {
  $atual = (Get-FileHash -Algorithm MD5 -LiteralPath (Join-Path $Repo $rel)).Hash
  $novo  = (Get-FileHash -Algorithm MD5 -LiteralPath (Join-Path $Novos $rel)).Hash
  if ($atual -eq $novo) { continue }
  $jaAplicado = $false
  if ($atual -ne $Esperado[$rel]) { Falhou "o arquivo $rel mudou depois que o pacote foi montado. Nada foi alterado. Peca um pacote novo." }
}
Write-Host ('Repositorio conferido. ' + $(if ($jaAplicado) { 'Correcao ja aplicada antes, seguindo.' } else { 'Pronto para aplicar.' }))

# 2 ------------------------------------------------------------
Etapa 2 'Criando backup'
$backup = 'backup/antes-png-v2-fix1-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
git branch $backup
if ($LASTEXITCODE -ne 0) { Falhou 'nao foi possivel criar a branch de backup.' }
Write-Host "Backup: $backup"

# 3 ------------------------------------------------------------
Etapa 3 'Aplicando a correcao'
foreach ($rel in $Esperado.Keys) {
  Copy-Item -LiteralPath (Join-Path $Novos $rel) -Destination (Join-Path $Repo $rel) -Force
}
$script = Join-Path $Repo 'tools\atende\publicar-png-comercial-v2-fix1.ps1'
Copy-Item -LiteralPath $PSCommandPath -Destination $script -Force

$utf8 = New-Object System.Text.UTF8Encoding $false
$chPath = Join-Path $Repo 'CHANGELOG.md'
$ch = [System.IO.File]::ReadAllText($chPath, $utf8)
$novoCh = [System.IO.File]::ReadAllText($Entrada, $utf8)
$primeiraLinha = ($novoCh -split "`n")[0]
if ($ch.Contains($primeiraLinha)) {
  Write-Host 'CHANGELOG ja tem a entrada.'
} else {
  $i = $ch.IndexOf("`n## ")
  if ($i -lt 0) { Falhou 'formato inesperado do CHANGELOG.md.' }
  $ch = $ch.Substring(0, $i + 1) + $novoCh + $ch.Substring($i + 1)
  [System.IO.File]::WriteAllText($chPath, $ch, $utf8)
  Write-Host 'CHANGELOG atualizado.'
}

# 4 ------------------------------------------------------------
Etapa 4 'Publicando a tela (Apps Script do Visao 360)'
Set-Location (Join-Path $Repo 'apps-script\atende')
clasp push
if ($LASTEXITCODE -ne 0) { Falhou 'clasp push falhou.' }
clasp deploy -i $DeployId -d 'Visao 360 - PNG Comercial V2: percentuais do Balcao pela regra do ranking'
if ($LASTEXITCODE -ne 0) { Falhou 'clasp deploy falhou.' }

# 5 ------------------------------------------------------------
Etapa 5 'Salvando no Git'
Set-Location $Repo
$lista = @($Esperado.Keys) + @('tools/atende/publicar-png-comercial-v2-fix1.ps1', 'CHANGELOG.md')
git add -- $lista
if ($LASTEXITCODE -ne 0) { Falhou 'git add falhou.' }
$pendente = git diff --cached --name-only
if ($pendente) {
  git commit -m 'fix(visao360): percentuais do Balcao na arte PNG seguem a regra do ranking (3 colaboradores, base no realizado do Balcao)'
  if ($LASTEXITCODE -ne 0) { Falhou 'git commit falhou (tela ja publicada).' }
} else {
  Write-Host 'Nada novo para commitar.'
}
git push origin main
if ($LASTEXITCODE -ne 0) { Falhou 'git push falhou (tela ja publicada). Rode: git push origin main' }

Write-Host ''
Write-Host 'PRONTO. Visao 360 > Comercial > Balcao AGF > Salvar PNG. Confira ELEN, ALESSON e LEVY no bloco de percentuais.' -ForegroundColor Green
Write-Host "Backup do estado anterior: $backup" -ForegroundColor Green
