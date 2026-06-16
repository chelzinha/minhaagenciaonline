/**
 * AGF SUPERFRETE — 37_SF_SUPERFRETE_PLACEHOLDERS.gs
 * Placeholders seguros da Etapa 1.
 *
 * A integração real com cotação/criação/checkout/impressão SuperFrete
 * entra na Etapa 2, depois da validação em Sandbox.
 */

function action_sfQuotePreview_(params) {
  const user = sfGetSession_(params.sessionToken);
  const valorCotado = sfToMoney_(params.valorCotado || params.valor_cotado || 0);
  const margem = sfToMoney_(sfGetConfigValue_('MARGEM_SEGURANCA_COTACAO', SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO));

  let clienteId = '';
  if (upper_(user.TIPO_USUARIO) === 'CLIENTE') {
    clienteId = user.CLIENTE_ID;
  } else {
    clienteId = sanitize_(params.clienteId || params.CLIENTE_ID);
  }
  if (!clienteId) throw new Error('CLIENTE_ID obrigatório para preview de cotação.');

  const conta = sfGetContaByClienteId_(clienteId);
  if (!conta) throw new Error('Conta do cliente não encontrada.');

  const disponivel = sfComputeDisponivel_(conta);
  return {
    clienteId: clienteId,
    valorCotado: valorCotado,
    margemSeguranca: margem,
    precisaDisponivel: sfToMoney_(valorCotado + margem),
    disponivelEmissao: disponivel,
    podeEmitir: disponivel >= sfToMoney_(valorCotado + margem),
    observacao: 'Preview local. Na Etapa 2 este valor virá da cotação real da SuperFrete.'
  };
}

function sfGetConfigValue_(chave, fallback) {
  const rows = sfReadObjects_(SF.SHEETS.CONFIG);
  const row = rows.find(function (r) { return sanitize_(r.CHAVE) === sanitize_(chave); });
  return row ? row.VALOR : fallback;
}

function action_sfModel_(params) {
  sfRequireAdmin_(params.sessionToken);
  return {
    version: SF.VERSION,
    sheets: SF.SHEETS,
    headers: SF.HEADERS
  };
}
