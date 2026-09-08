$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$panelPath = Join-Path $repoRoot 'apps-script\atende\30_ATENDE_D1_PAINEL.gs'
$marker = 'ATENDE_CLIENTE_PORTAL_COMPAT_V1'

if (-not (Test-Path $panelPath)) {
  throw "30_ATENDE_D1_PAINEL.gs nao encontrado: $panelPath"
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$panel = [System.IO.File]::ReadAllText($panelPath)

if ($panel.Contains($marker)) {
  Write-Host 'OK - compatibilidade CLIENTE PORTAL ja aplicada.' -ForegroundColor Green
  exit 0
}

# 1. Normaliza a coluna visual para CLIENTE PORTAL, mas preserva a chave
# CLIENTE do contrato (Razao Social) separadamente.
$panel = $panel.Replace("{ key: 'CADASTRO PORTAL', label: 'CADASTRO PORTAL'", "{ key: 'CLIENTE PORTAL', label: 'CLIENTE PORTAL'")
$panel = $panel.Replace("{ key: 'CADASTRO PORTAL', label: 'CLIENTE PORTAL'", "{ key: 'CLIENTE PORTAL', label: 'CLIENTE PORTAL'")

# 2. Garante que o filtro CLIENTE PORTAL seja enviado ao Worker.
if (-not $panel.Contains("clientePortal: ATENDE_listaFiltro_(params, 'clientesPortal', 'clientePortal')")) {
  $anchor = "    tipoObjeto: ATENDE_listaFiltro_(params, 'tiposObjeto', 'tipoObjeto'),"
  if (-not $panel.Contains($anchor)) {
    throw 'Nao foi encontrado o ponto de insercao do filtro CLIENTE PORTAL.'
  }
  $panel = $panel.Replace($anchor, $anchor + "`r`n    clientePortal: ATENDE_listaFiltro_(params, 'clientesPortal', 'clientePortal'),")
}

# 3. Compatibilidade de linha: o Worker pode responder CLIENTE PORTAL (novo)
# ou CADASTRO PORTAL (formato anterior). Nunca deixa o campo novo vazio
# quando o campo anterior contem o cliente.
$copyAnchor = '    const copy = Object.assign({}, row);'
if (-not $panel.Contains($copyAnchor)) {
  throw 'Nao foi encontrado o mapeamento das linhas do painel.'
}

$compat = @'
    // ATENDE_CLIENTE_PORTAL_COMPAT_V1
    const portalCliente = String(
      copy['CLIENTE PORTAL'] || copy['CADASTRO PORTAL'] || ''
    ).trim();
    copy['CLIENTE PORTAL'] = portalCliente;
    // Mantido internamente por compatibilidade com respostas/deploys anteriores.
    if (!Object.prototype.hasOwnProperty.call(copy, 'CADASTRO PORTAL') || !copy['CADASTRO PORTAL']) {
      copy['CADASTRO PORTAL'] = portalCliente;
    }
    if ((!Object.prototype.hasOwnProperty.call(copy, 'ORIGEM PORTAL') || !copy['ORIGEM PORTAL']) && copy._ORIGEM_PORTAL) {
      copy['ORIGEM PORTAL'] = copy._ORIGEM_PORTAL;
    }
'@
$panel = $panel.Replace($copyAnchor, $copyAnchor + "`r`n" + $compat.TrimEnd())

# 4. Evita que o modo de compatibilidade zere CLIENTE PORTAL.
$panel = $panel.Replace("      copy['CLIENTE PORTAL'] = '';", "      if (!copy['CLIENTE PORTAL']) copy['CLIENTE PORTAL'] = copy['CADASTRO PORTAL'] || '';")

# 5. Default final robusto.
$oldDefault = "    if (!Object.prototype.hasOwnProperty.call(copy, 'CLIENTE PORTAL')) copy['CLIENTE PORTAL'] = '';"
$newDefault = "    if (!Object.prototype.hasOwnProperty.call(copy, 'CLIENTE PORTAL')) copy['CLIENTE PORTAL'] = copy['CADASTRO PORTAL'] || '';`r`n    if (!copy['CLIENTE PORTAL'] && copy['CADASTRO PORTAL']) copy['CLIENTE PORTAL'] = copy['CADASTRO PORTAL'];"
if ($panel.Contains($oldDefault)) {
  $panel = $panel.Replace($oldDefault, $newDefault)
}

# 6. Filtros: usa a facet nova. Mantem fallback caso algum deploy intermediario
# responda com uma chave antiga.
if ($panel.Contains("    contratoClientes: response.contratoClientes || [],")) {
  if (-not $panel.Contains("    clientesPortal: response.clientesPortal")) {
    $anchor = "    contratoClientes: response.contratoClientes || [],"
    $panel = $panel.Replace($anchor, "    clientesPortal: response.clientesPortal || response.cadastrosPortal || [],`r`n" + $anchor)
  } else {
    $panel = $panel.Replace("    clientesPortal: response.clientesPortal || [],", "    clientesPortal: response.clientesPortal || response.cadastrosPortal || [],")
  }
}

[System.IO.File]::WriteAllText($panelPath, $panel, $utf8NoBom)

Write-Host 'OK - CLIENTE PORTAL passa a aceitar CLIENTE PORTAL ou CADASTRO PORTAL.' -ForegroundColor Green
Write-Host 'Nenhum dado do D1 foi alterado.' -ForegroundColor Cyan
Write-Host 'Arquivo alterado: apps-script/atende/30_ATENDE_D1_PAINEL.gs' -ForegroundColor DarkGray
