// ============================================================
// ATENDE - ADDON VISUAL DO DASHBOARD V6 (BRANCH DE TESTE)
// ============================================================

function ATENDE_dashboardAddonJs() {
  // DashboardTabsV4 permanece como base visual estável.
  // Nesta branch carregamos apenas a camada Intelligence V6 e o Admin V6.
  // V5 continua preservado no repositório e pode ser restaurado trocando
  // apenas esta lista de arquivos.
  const arquivos = ['DashboardTabsV4', 'DashboardIntelligenceV6', 'DashboardMetaAdminV6'];
  return arquivos.map(function(nome) {
    const html = HtmlService.createHtmlOutputFromFile(nome).getContent();
    return String(html || '')
      .replace(/^\s*<script\b[^>]*>/i, '')
      .replace(/<\/script>\s*$/i, '');
  }).join('\n\n');
}
