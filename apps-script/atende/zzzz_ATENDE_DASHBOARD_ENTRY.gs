// ============================================================
// ATENDE - ENTRY POINT FINAL COM DASHBOARD EMBUTIDO
//
// Fonte unica do Dashboard: DashboardAddon.html.
// Antes de injetar o addon atual, remove qualquer copia antiga que tenha
// ficado embutida no Index.html em rodadas anteriores. Isso evita que um
// Dashboard legado inicialize primeiro e bloqueie a V2 pelo viewSwitchRow.
// ============================================================

function ATENDE_limparDashboardLegadoDoHtml_(html) {
  html = String(html || '');

  // Rodada antiga que embutiu uma copia completa do Dashboard no Index.
  html = html.replace(
    /<!--[\s]*ATENDE_DASHBOARD_INLINE_START[\s]*-->[\s\S]*?<!--[\s]*ATENDE_DASHBOARD_INLINE_END[\s]*-->/g,
    ''
  );

  // Loader assincrono antigo. O addon agora e incorporado pelo servidor e
  // nao precisa de uma segunda chamada google.script.run depois do load.
  html = html.replace(
    /<script>[\s\S]*?ATENDE_dashboardAddonJs\(\);[\s\S]*?<\/script>/g,
    ''
  );

  return html;
}

function doGet() {
  var indexOriginal = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var indexHtml = ATENDE_limparDashboardLegadoDoHtml_(indexOriginal);
  var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  var dashboardScript = '<script>\n' + dashboardJs + '\n<\/script>\n';

  // Marca a versao servida para facilitar diagnostico no navegador.
  var versionMarker = '<meta name="atende-dashboard-version" content="gestao-v2">\n';
  if (indexHtml.indexOf('</head>') >= 0) {
    indexHtml = indexHtml.replace('</head>', versionMarker + '</head>');
  }

  var html;
  if (indexHtml.indexOf('</body>') >= 0) {
    html = indexHtml.replace('</body>', dashboardScript + '</body>');
  } else {
    html = indexHtml + dashboardScript;
  }

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Postagens — AGF José Bonifácio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Diagnostico manual opcional. Nao altera dados.
function ATENDE_testarHtmlDashboard() {
  var indexOriginal = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var indexLimpo = ATENDE_limparDashboardLegadoDoHtml_(indexOriginal);
  var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  return {
    ok: true,
    indexBytesOriginal: indexOriginal.length,
    indexBytesLimpo: indexLimpo.length,
    dashboardBytes: dashboardJs.length,
    tinhaDashboardInlineLegado: indexOriginal.indexOf('ATENDE_DASHBOARD_INLINE_END') >= 0,
    loaderAssincronoLegado: indexOriginal.indexOf('ATENDE_dashboardAddonJs') >= 0,
    addonPossuiSwitch: dashboardJs.indexOf('viewSwitchRow') >= 0,
    addonPossuiDashboard: dashboardJs.indexOf('dashboardView') >= 0,
    addonGestaoV2: dashboardJs.indexOf('Visão executiva') >= 0 && dashboardJs.indexOf('ATENDE_buscarDashboardGestaoD1') >= 0
  };
}
