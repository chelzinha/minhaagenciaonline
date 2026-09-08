// ============================================================
// ATENDE - CONTROLES AVANCADOS DA TABELA
// Proxy administrativo para destravar/restaurar trava por raw_id.
// A validacao de sessao continua centralizada em 31_ATENDE_D1_ADMIN.gs.
// ============================================================

function ATENDE_adminAlterarTravaLinhas(platformToken, payload) {
  payload = payload || {};
  const ids = Array.isArray(payload.rawIds)
    ? payload.rawIds.map(function(v) { return Number(v); }).filter(function(v) { return isFinite(v) && v > 0; })
    : [];
  if (!ids.length) throw new Error('Selecione pelo menos uma linha.');
  if (ids.length > 1000) throw new Error('Selecione no maximo 1.000 linhas por operacao.');

  return ATENDE_adminPost_(platformToken, '/admin/row-lock-exception', {
    rawIds: ids,
    unlocked: payload.unlocked === true
  });
}
