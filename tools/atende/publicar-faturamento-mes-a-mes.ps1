# Publica o card "Faturamento mes a mes" do Visao 360 (API Cloudflare + tela Apps Script + Git).
# Para em qualquer erro. Uso:
#   powershell -ExecutionPolicy Bypass -File C:\AGF-Codex\minhaagenciaonline\tools\atende\publicar-faturamento-mes-a-mes.ps1

$ErrorActionPreference = 'Stop'
$Repo = 'C:\AGF-Codex\minhaagenciaonline'
$DeployId = 'AKfycbwCBAG4gBVHMHh7cHgnIG215RL8m8CbymvsAaHcs4bXhp0RCyPeP_cr6IA5iZtsch_m1g'
$Arquivos = @(
  'cloudflare/atende-api/src/dashboard-v3-wrapper.js',
  'apps-script/atende/DashboardTabsV4.html',
  'apps-script/atende/DashboardIntelligenceV6.html'
)

function Etapa($n, $texto) { Write-Host ''; Write-Host "[$n/4] $texto" -ForegroundColor Cyan }
function Falhou($texto) { Write-Host ''; Write-Host "ERRO: $texto" -ForegroundColor Red; Write-Host 'Nada foi desfeito. Corrija e rode o script de novo (ele pode ser repetido).' -ForegroundColor Yellow; exit 1 }

Etapa 1 'Conferindo o repositorio'
Set-Location $Repo
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { Falhou "branch atual e '$branch', esperado 'main'." }
foreach ($a in $Arquivos) { if (-not (Test-Path (Join-Path $Repo $a))) { Falhou "arquivo nao encontrado: $a" } }
$pendentes = git status --porcelain -- $Arquivos
if (-not $pendentes) { Write-Host 'Os 3 arquivos ja estao commitados. Seguindo so com a publicacao.' -ForegroundColor Yellow }
else { Write-Host 'Alteracoes encontradas:' ; $pendentes | ForEach-Object { Write-Host "  $_" } }

Etapa 2 'Publicando a API (Cloudflare Worker agf-atende-api)'
Set-Location (Join-Path $Repo 'cloudflare\atende-api')
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { Falhou 'wrangler deploy falhou.' }

Etapa 3 'Publicando a tela (Apps Script do Visao 360)'
Set-Location (Join-Path $Repo 'apps-script\atende')
clasp push
if ($LASTEXITCODE -ne 0) { Falhou 'clasp push falhou.' }
clasp deploy -i $DeployId -d 'Visao 360 - faturamento mes a mes'
if ($LASTEXITCODE -ne 0) { Falhou 'clasp deploy falhou.' }

Etapa 4 'Salvando no Git'
Set-Location $Repo
if ($pendentes) {
  git add -- $Arquivos 'tools/atende/publicar-faturamento-mes-a-mes.ps1'
  git commit -m 'feat(visao360): Operacao mostra faturamento mes a mes (ate 12 meses)'
  if ($LASTEXITCODE -ne 0) { Falhou 'git commit falhou.' }
}
git push
if ($LASTEXITCODE -ne 0) { Falhou 'git push falhou (API e tela ja estao publicadas).' }

Write-Host ''
Write-Host 'PRONTO. Abra o Visao 360 > Operacao e confira o card "Faturamento mes a mes" (jan a out).' -ForegroundColor Green
