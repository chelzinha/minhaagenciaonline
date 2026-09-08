// ============================================================
// ATENDE - ADMIN DE LOCAIS E TRAVAS POR CLIENTE PORTAL
// ============================================================

function ATENDE_adminSalvarLocal(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/local', payload || {});
}

function ATENDE_adminSalvarTravaClientePortal(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/portal-client-local', payload || {});
}

function ATENDE_adminSalvarTravasClientePortalLote(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/portal-clients-local-bulk', payload || {});
}
