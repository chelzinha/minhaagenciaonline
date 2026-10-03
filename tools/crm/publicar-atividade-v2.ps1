# Publica a tela da atividade v2 do CRM (2 colunas, roteiro e texto sugerido, cliente, abas).
# Etapas: confere repositorio -> confere arquivos -> testes do Worker -> Git (branch + merge na main + push) -> Worker (Cloudflare).
# Para em qualquer erro e pode ser rodado de novo (etapas ja feitas sao reconhecidas).
# Outras alteracoes que estejam abertas no repositorio NAO entram no commit.

# Continue: erros de comandos externos (git, npm, wrangler) sao tratados pelo codigo de saida.
$ErrorActionPreference = 'Continue'
$Repo    = 'C:\AGF-Codex\minhaagenciaonline'
$Branch  = 'feat/crm-atividade-v2'
$Titulo  = 'tela da atividade v2 no CRM'
$Marca   = 'feat(crm): tela da atividade v2'
$Worker  = Join-Path $Repo 'cloudflare\cadastros-api'
$Arquivos = @(
  'frontend/crm/atividade.js',
  'frontend/crm/atividade.css',
  'frontend/crm/index.html',
  'frontend/crm/app.js',
  'frontend/crm/crm-integrado.js',
  'frontend/crm/sw.js',
  'cloudflare/cadastros-api/src/crm/jornada.js',
  'tools/crm/publicar-atividade-v2.ps1'
)

function Etapa($n, $texto) { Write-Host ''; Write-Host "[$n/5] $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "  ok - $texto" -ForegroundColor Green }
function Falhou($texto) {
  Write-Host ''; Write-Host "ERRO: $texto" -ForegroundColor Red
  Write-Host 'Nada foi publicado alem das etapas ja concluidas acima. Corrija e rode o comando de novo.' -ForegroundColor Yellow
  exit 1
}
function GitOk() { & git @args; if ($LASTEXITCODE -ne 0) { Falhou ("git " + ($args -join ' ') + " falhou.") } }

# 1 ------------------------------------------------------------
Etapa 1 'Conferindo o repositorio'
if (-not (Test-Path $Repo)) { Falhou "pasta do repositorio nao encontrada: $Repo" }
Set-Location $Repo
if (Test-Path (Join-Path $Repo '.git\index.lock')) { Falhou 'existe o arquivo .git\index.lock (outro git aberto ou travado). Feche VS Code/terminais com git rodando e apague esse arquivo.' }
$atual = (git branch --show-current).Trim()
if ($atual -eq $Branch) { GitOk switch main --quiet; $atual = 'main' }
if ($atual -ne 'main') { Falhou "branch atual e '$atual', esperado 'main'." }
git fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { Falhou 'git fetch falhou (sem internet ou sem acesso ao GitHub).' }
$atras = [int](git rev-list --count HEAD..origin/main)
if ($atras -gt 0) { Falhou "a main local esta $atras commit(s) atras do GitHub. Rode: git pull --ff-only origin main" }
$jaNaMain = [bool](git log origin/main --oneline --fixed-strings --grep="$Marca" -n 1)
Ok 'repositorio na main e em dia com o GitHub'

# 2 ------------------------------------------------------------
Etapa 2 'Conferindo os arquivos da entrega'
foreach ($a in $Arquivos) { if (-not (Test-Path (Join-Path $Repo $a))) { Falhou "arquivo nao encontrado: $a" } }
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  foreach ($js in @('frontend/crm/atividade.js','frontend/crm/app.js','frontend/crm/crm-integrado.js','frontend/crm/sw.js','cloudflare/cadastros-api/src/crm/jornada.js')) {
    & node --check (Join-Path $Repo $js) 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Falhou "erro de sintaxe em $js" }
  }
  Ok 'sintaxe dos 5 arquivos JavaScript'
} else { Write-Host '  aviso - node nao encontrado; conferencia de sintaxe pulada' -ForegroundColor Yellow }
$idx = Get-Content (Join-Path $Repo 'frontend/crm/index.html') -Raw -Encoding UTF8
if ($idx -notmatch 'atividade\.js\?v=' -or $idx -notmatch 'atividade\.css\?v=' -or $idx -notmatch 'id="activityScriptCard"') { Falhou 'index.html nao tem a tela nova (atividade.js/atividade.css).' }
Ok 'index.html com a tela nova'

# 3 ------------------------------------------------------------
Etapa 3 'Rodando os testes do Worker (cadastros-api)'
Set-Location $Worker
& npm run -s test:crm 2>&1 | Tee-Object -Variable saida | Out-Null
if ($LASTEXITCODE -ne 0 -or ($saida -match 'not ok')) { $saida | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" }; Set-Location $Repo; Falhou 'testes do Worker falharam.' }
Set-Location $Repo
Ok 'testes do CRM passaram'

# 4 ------------------------------------------------------------
Etapa 4 'Git: branch, merge na main e push (Netlify publica sozinho)'
if ($jaNaMain) {
  Ok 'a entrega ja esta na main do GitHub (etapa pulada)'
} else {
  $existe = [bool](git branch --list $Branch)
  if ($existe) { GitOk switch $Branch --quiet } else { GitOk switch -c $Branch --quiet }
  GitOk add -- $Arquivos
  $pendente = [bool](git diff --cached --name-only)
  if ($pendente) {
    GitOk commit --quiet -m "$Marca em 2 colunas (roteiro e texto sugerido, cliente, abas)" -m "Cabecalho e rodape fixos, acima do topo padrao. Texto do plano editavel com Copiar e Enviar no WhatsApp. Status do contato e Resultado sem valor pre-marcado. API devolve obsPlanejada e obsExecucao."
    Ok 'commit criado na branch'
  } else { Ok 'nada novo para commitar na branch' }
  GitOk switch main --quiet
  GitOk merge --no-ff --quiet $Branch -m "merge: $Titulo $(Get-Date -Format 'yyyy-MM-dd')"
  GitOk push origin main --quiet
  Ok 'main enviada ao GitHub'
}

# 5 ------------------------------------------------------------
Etapa 5 'Worker cadastros-api (Cloudflare)'
Set-Location $Worker
& npx wrangler deploy
$codigo = $LASTEXITCODE
Set-Location $Repo
if ($codigo -ne 0) { Falhou 'wrangler deploy falhou. O front ja esta publicado e funciona sem esta etapa; rode o script de novo depois de "npx wrangler login".' }
Ok 'Worker publicado'

Write-Host ''
Write-Host "PRONTO: $Titulo publicada." -ForegroundColor Green
Write-Host 'Aguarde 1 a 2 minutos o deploy da Netlify e abra https://minhaagenciaonline.com.br/crm com Ctrl+F5.'
Write-Host 'Reverter o front: git revert -m 1 <commit do merge>  e  git push origin main'
