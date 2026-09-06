// ============================================================
// ATENDE - ENTRY POINT FINAL COM DASHBOARD EMBUTIDO
//
// Este arquivo usa o mesmo padrao de patch final ja adotado pelo modulo
// (ex.: zz_PerformancePatch.gs). Por estar no final da ordem dos arquivos,
// redefine doGet() sem alterar o legado de Code.gs.
//
// O DashboardAddon e incorporado ao HTML no servidor. Assim a visao
// Tabela | Dashboard nao depende de uma segunda chamada assíncrona depois
// que a pagina ja foi carregada.
// ============================================================

function doGet() {
  var indexHtml = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  var dashboardScript = '<script>\n' + dashboardJs + '\n<\/script>\n';

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
  var indexHtml = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var dashboardJs = HtmlService.createHtmlOutputFromFile('DashboardAddon').getContent();
  return {
    ok: true,
    indexBytes: indexHtml.length,
    dashboardBytes: dashboardJs.length,
    addonPossuiSwitch: dashboardJs.indexOf('viewSwitchRow') >= 0,
    addonPossuiDashboard: dashboardJs.indexOf('dashboardView') >= 0
  };
}
