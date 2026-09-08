// ============================================================
// ATENDE - ADDON VISUAL DO DASHBOARD
// ============================================================

function ATENDE_dashboardAddonJs() {
  // O Index.html injeta o retorno desta função dentro de uma tag <script>
  // criada no navegador. DashboardTabsV4.html já possui sua própria tag
  // <script>, por isso removemos apenas o wrapper externo antes de devolver
  // o JavaScript ao frontend.
  const html = HtmlService.createHtmlOutputFromFile('DashboardTabsV4').getContent();
  return String(html || '')
    .replace(/^\s*<script\b[^>]*>/i, '')
    .replace(/<\/script>\s*$/i, '');
}
