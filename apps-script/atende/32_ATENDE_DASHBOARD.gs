// ============================================================
// ATENDE - ADDONS DO DASHBOARD V6 (BRANCH DE TESTE)
// ============================================================

function ATENDE_dashboardAddonJs() {
  // DashboardTabsV4 permanece como base estrutural estável.
  // A V6 substitui a inteligência V5 apenas neste deployment de teste.
  // DashboardVisualV6 aplica os refinamentos visuais aprovados.
  const arquivos = [
    'DashboardTabsV4',
    'DashboardIntelligenceV6',
    'DashboardVisualV6',
    'DashboardMetaAdminV6'
  ];

  return arquivos.map(function(nome) {
    const html = HtmlService.createHtmlOutputFromFile(nome).getContent();
    return String(html || '')
      .replace(/^\s*<script\b[^>]*>/i, '')
      .replace(/<\/script>\s*$/i, '');
  }).join('\n\n');
}
