// ============================================================
// ATENDE - ADDON VISUAL DO DASHBOARD
// ============================================================

function ATENDE_dashboardAddonJs() {
  var html = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  return String(html || '')
    .replace(/^\s*<script\b[^>]*>\s*/i, '')
    .replace(/\s*<\/script>\s*$/i, '');
}
