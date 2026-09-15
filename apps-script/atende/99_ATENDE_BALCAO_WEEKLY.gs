function ATENDE_adminBuscarEscalaBalcao(
  platformToken,
  competencia
) {
  const mes =
    String(
      competencia || ''
    ).trim();

  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new Error(
      'Competência inválida. Use AAAA-MM.'
    );
  }

  return ATENDE_adminGetV6_(
    platformToken,
    '/admin/dashboard-balcao-weekly?competencia=' +
      encodeURIComponent(mes)
  );
}

function ATENDE_adminSalvarEscalaBalcao(
  platformToken,
  payload
) {
  return ATENDE_adminPostV6_(
    platformToken,
    '/admin/dashboard-balcao-weekly',
    payload || {}
  );
}