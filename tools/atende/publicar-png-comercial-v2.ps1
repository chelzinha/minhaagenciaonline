# Publica as novas artes PNG da aba Comercial do Visao 360 e move o PNG antigo para a aba Gestao.
# Etapas: confere repositorio -> backup -> aplica pacote -> Worker (Cloudflare) -> Apps Script -> Git.
# Para em qualquer erro e pode ser rodado de novo (etapas ja feitas sao reconhecidas).

$ErrorActionPreference = 'Stop'
$Repo     = 'C:\AGF-Codex\minhaagenciaonline'
$Pacote   = $PSScriptRoot
$DeployId = 'AKfycbwCBAG4gBVHMHh7cHgnIG215RL8m8CbymvsAaHcs4bXhp0RCyPeP_cr6IA5iZtsch_m1g'
$Patch    = Join-Path $Pacote 'png-comercial-v2.patch'
$Entrada  = Join-Path $Pacote 'changelog-entrada.md'
$Novos    = Join-Path $Pacote 'arquivos'
$Titulo   = 'novas artes PNG na aba Comercial'
$Alterados = @(
  'apps-script/atende/DashboardCommercialPngV1.html',
  'apps-script/atende/32_ATENDE_DASHBOARD.gs',
  'apps-script/atende/41_ATENDE_PNG.gs',
  'cloudflare/atende-api/src/png-browser-wrapper.js'
)

function Etapa($n, $texto) { Write-Host ''; Write-Host "[$n/6] $texto" -ForegroundColor Cyan }
function Falhou($texto) {
  Write-Host ''; Write-Host "ERRO: $texto" -ForegroundColor Red
  Write-Host 'Nada foi publicado alem das etapas ja concluidas acima. Corrija e rode o comando de novo.' -ForegroundColor Yellow
  exit 1
}

# 1 ------------------------------------------------------------
Etapa 1 'Conferindo o repositorio'
if (-not (Test-Path $Repo)) { Falhou "pasta do repositorio nao encontrada: $Repo" }
Set-Location $Repo
if (Test-Path (Join-Path $Repo '.git\index.lock')) { Falhou 'existe o arquivo .git\index.lock (outro git aberto ou travado). Feche VS Code/terminais com git rodando e apague esse arquivo.' }
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { Falhou "branch atual e '$branch', esperado 'main'." }
git fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { Falhou 'git fetch falhou (sem internet ou sem acesso ao GitHub).' }
$atras = [int](git rev-list --count HEAD..origin/main)
if ($atras -gt 0) { Falhou "a main local esta $atras commit(s) atras do GitHub. Rode: git pull --ff-only origin main" }

$ErrorActionPreference = 'Continue'
git apply --reverse --check --whitespace=nowarn $Patch 2>&1 | Out-Null
$jaAplicado = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = 'Stop'
if (-not $jaAplicado) {
  git apply --check --whitespace=nowarn $Patch
  if ($LASTEXITCODE -ne 0) { Falhou 'os arquivos do Visao 360 mudaram depois que o pacote foi montado. Nada foi alterado. Peca um pacote novo.' }
}
Write-Host ('Branch main em dia. Pacote ' + $(if ($jaAplicado) { 'ja aplicado antes, seguindo.' } else { 'pronto para aplicar.' }))

# 2 ------------------------------------------------------------
Etapa 2 'Criando backup (branch apontando para o estado atual)'
$backup = 'backup/antes-png-comercial-v2-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
git branch $backup
if ($LASTEXITCODE -ne 0) { Falhou 'nao foi possivel criar a branch de backup.' }
Write-Host "Backup: $backup"

# 3 ------------------------------------------------------------
Etapa 3 'Aplicando o pacote'
if (-not $jaAplicado) {
  git apply --whitespace=nowarn $Patch
  if ($LASTEXITCODE -ne 0) { Falhou 'git apply falhou.' }
}
$copiados = @()
Get-ChildItem -LiteralPath $Novos -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($Novos.Length + 1)
  $dest = Join-Path $Repo $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
  $copiados += ($rel -replace '\\', '/')
}
$script = Join-Path $Repo 'tools\atende\publicar-png-comercial-v2.ps1'
Copy-Item -LiteralPath $PSCommandPath -Destination $script -Force
$copiados += 'tools/atende/publicar-png-comercial-v2.ps1'

$utf8 = New-Object System.Text.UTF8Encoding $false
$chPath = Join-Path $Repo 'CHANGELOG.md'
$ch = [System.IO.File]::ReadAllText($chPath, $utf8)
if ($ch.Contains($Titulo)) {
  Write-Host 'CHANGELOG ja tem a entrada.'
} else {
  $novo = [System.IO.File]::ReadAllText($Entrada, $utf8)
  $i = $ch.IndexOf("`n## ")
  if ($i -lt 0) { Falhou 'formato inesperado do CHANGELOG.md.' }
  $ch = $ch.Substring(0, $i + 1) + $novo + $ch.Substring($i + 1)
  [System.IO.File]::WriteAllText($chPath, $ch, $utf8)
  Write-Host 'CHANGELOG atualizado.'
}
Write-Host ("Arquivos alterados: " + $Alterados.Count + " | arquivos novos: " + $copiados.Count)

# 4 ------------------------------------------------------------
Etapa 4 'Publicando o Worker (Cloudflare agf-atende-api: aceita PNG 1080x1080)'
Set-Location (Join-Path $Repo 'cloudflare\atende-api')
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { Falhou 'wrangler deploy falhou. O Apps Script ainda NAO foi publicado.' }

# 5 ------------------------------------------------------------
Etapa 5 'Publicando a tela (Apps Script do Visao 360)'
Set-Location (Join-Path $Repo 'apps-script\atende')
clasp push
if ($LASTEXITCODE -ne 0) { Falhou 'clasp push falhou. O Worker novo ja esta no ar, mas e compativel com a tela antiga.' }
clasp deploy -i $DeployId -d 'Visao 360 - PNG Comercial V2 (1080) e PNG antigo na aba Gestao'
if ($LASTEXITCODE -ne 0) { Falhou 'clasp deploy falhou.' }

# 6 ------------------------------------------------------------
Etapa 6 'Salvando no Git'
Set-Location $Repo
$lista = $Alterados + $copiados + @('CHANGELOG.md')
git add -- $lista
if ($LASTEXITCODE -ne 0) { Falhou 'git add falhou.' }
$pendente = git diff --cached --name-only
if ($pendente) {
  git commit -m 'feat(visao360): novas artes PNG 1080 na aba Comercial; PNG antigo passa para a aba Gestao'
  if ($LASTEXITCODE -ne 0) { Falhou 'git commit falhou (Worker e tela ja estao publicados).' }
} else {
  Write-Host 'Nada novo para commitar.'
}
git push origin main
if ($LASTEXITCODE -ne 0) { Falhou 'git push falhou (Worker e tela ja estao publicados). Rode: git push origin main' }

Write-Host ''
Write-Host 'PRONTO.' -ForegroundColor Green
Write-Host '1. Abra o Visao 360 > Comercial > Salvar PNG e gere Balcao AGF, Encomendas e Metro.' -ForegroundColor Green
Write-Host '2. Abra o Visao 360 > Gestao e confira o Salvar PNG antigo (cartoes 600x600).' -ForegroundColor Green
Write-Host "Backup do estado anterior: $backup" -ForegroundColor Green
