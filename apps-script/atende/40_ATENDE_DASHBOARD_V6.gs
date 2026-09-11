// ============================================================
// ATENDE - DASHBOARD V6
// Produção: usa ATENDE_D1_API_URL / ATENDE_D1_API_TOKEN
// através da integração D1 oficial do Atende.
// ============================================================

function ATENDE_adminGetV6_(platformToken, path) {
  const admin = ATENDE_validarAdmin_(platformToken);
  return ATENDE_fetchD1_(path, {
    method: 'get',
    headers: { 'X-AGF-Admin-User': admin.username }
  });
}

function ATENDE_adminPostV6_(platformToken, path, payload) {
  const admin = ATENDE_validarAdmin_(platformToken);
  return ATENDE_fetchD1_(path, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    headers: { 'X-AGF-Admin-User': admin.username }
  });
}

function ATENDE_testarD1V6() {
  return ATENDE_testarD1();
}

function ATENDE_adminBuscarClassificacaoReceita(platformToken, competencia) {
  const mes = String(competencia || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new Error('Competência inválida. Use AAAA-MM.');
  }

  return ATENDE_adminGetV6_(
    platformToken,
    '/admin/dashboard-revenue-clients?competencia=' + encodeURIComponent(mes)
  );
}

function ATENDE_adminSalvarClassificacaoReceita(platformToken, payload) {
  return ATENDE_adminPostV6_(
    platformToken,
    '/admin/dashboard-revenue-client',
    payload || {}
  );
}