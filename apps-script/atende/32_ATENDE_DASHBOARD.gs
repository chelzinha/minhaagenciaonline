// ============================================================
// ATENDE - ADDONS DO DASHBOARD V6 (BRANCH DE TESTE)
// ============================================================

function ATENDE_dashboardAddonJs() {
  // DashboardTabsV4 continua como base estrutural.
  // DashboardIntelligenceV5 permanece temporariamente como camada funcional
  // estável enquanto a V6 de backend é validada em ambiente isolado.
  // DashboardVisualV6 aplica exclusivamente os refinamentos visuais da V6.
  const arquivos = [
    'DashboardTabsV4',
    'DashboardIntelligenceV5',
    'DashboardVisualV6',
    'DashboardMetaAdmin'
  ];

  return arquivos.map(function(nome) {
    const html = HtmlService.createHtmlOutputFromFile(nome).getContent();
    return String(html || '')
      .replace(/^\s*<script\b[^>]*>/i, '')
      .replace(/<\/script>\s*$/i, '');
  }).join('\n\n');
}
