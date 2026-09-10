// ============================================================
// ATENDE - ADDON VISUAL DO DASHBOARD
// ============================================================

function ATENDE_dashboardAddonJs() {
  // Mantemos o Dashboard V4 como base estável e carregamos a camada V5
  // em seguida. O Index.html injeta o retorno dentro de uma tag <script>,
  // portanto cada arquivo HTML tem apenas seu wrapper <script> removido.
  const arquivos = ['DashboardTabsV4', 'DashboardIntelligenceV5'];
  return arquivos.map(function(nome) {
    const html = HtmlService.createHtmlOutputFromFile(nome).getContent();
    return String(html || '')
      .replace(/^\s*<script\b[^>]*>/i, '')
      .replace(/<\/script>\s*$/i, '');
  }).join('\n\n');
}
