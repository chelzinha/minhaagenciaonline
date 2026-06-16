/**
 * AGF SUPERFRETE — 34_SF_FINANCEIRO.gs
 * Conta corrente do cliente + carteira SuperFrete AGF.
 */

function sfGetContaByClienteId_(clienteId) {
  const conta = sfFindBy_(SF.SHEETS.CONTAS, 'CLIENTE_ID', clienteId);
  if (!conta) return null;
  conta.LIMITE_CREDITO = sfToMoney_(conta.LIMITE_CREDITO);
  conta.SALDO_CONTA = sfToMoney_(conta.SALDO_CONTA);
  conta.VALOR_RESERVADO = sfToMoney_(conta.VALOR_RESERVADO);
  conta.DISPONIVEL_EMISSAO = sfComputeDisponivel_(conta);
  return conta;
}

function sfComputeDisponivel_(conta) {
  if (!conta) return 0;
  return sfToMoney_(toNumber_(conta.SALDO_CONTA, 0) + toNumber_(conta.LIMITE_CREDITO, 0) - toNumber_(conta.VALOR_RESERVADO, 0));
}

function sfUpdateContaComputed_(clienteId, patch) {
  const sh = sfGetSheet_(SF.SHEETS.CONTAS);
  const rows = sfReadObjectsFromSheet_(sh);
  const conta = rows.find(function (r) { return sanitize_(r.CLIENTE_ID) === sanitize_(clienteId); });
  if (!conta) throw new Error('Conta do cliente não encontrada: ' + clienteId);

  const merged = Object.assign({}, conta, patch || {});
  merged.DISPONIVEL_EMISSAO = sfComputeDisponivel_(merged);
  merged.ATUALIZADO_EM = nowIso_();

  sfUpdateRowByHeaders_(SF.SHEETS.CONTAS, conta._row, merged);
  return sfGetContaByClienteId_(clienteId);
}

function sfLancarCliente_(args) {
  return sfWithLock_(function () {
    const clienteId = sanitize_(args.CLIENTE_ID);
    if (!clienteId) throw new Error('CLIENTE_ID obrigatório para lançamento.');

    const conta = sfGetContaByClienteId_(clienteId);
    if (!conta) throw new Error('Conta do cliente não encontrada: ' + clienteId);

    const valor = sfToMoney_(args.VALOR);
    const sinal = sanitize_(args.SINAL) === '+' ? '+' : '-';
    const saldoAntes = sfToMoney_(conta.SALDO_CONTA);
    const saldoDepois = sinal === '+' ? sfToMoney_(saldoAntes + valor) : sfToMoney_(saldoAntes - valor);

    sfAppendByHeaders_(SF.SHEETS.LANC_CLIENTES, {
      LANCAMENTO_ID: uid_('SFLAN'),
      CLIENTE_ID: clienteId,
      TIPO: sanitize_(args.TIPO),
      VALOR: valor,
      SINAL: sinal,
      SALDO_ANTES: saldoAntes,
      SALDO_DEPOIS: saldoDepois,
      ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
      COBRANCA_ID: sanitize_(args.COBRANCA_ID),
      PAGAMENTO_ID: sanitize_(args.PAGAMENTO_ID),
      OPERADOR_ID: sanitize_(args.OPERADOR_ID),
      ORIGEM: sanitize_(args.ORIGEM),
      MOTIVO: sanitize_(args.MOTIVO),
      CRIADO_EM: nowIso_()
    });

    return sfUpdateContaComputed_(clienteId, { SALDO_CONTA: saldoDepois });
  });
}

function sfRegistrarConsumoCarteiraSuperFrete_(args) {
  return sfWithLock_(function () {
    const rows = sfReadObjects_(SF.SHEETS.CARTEIRA_SF);
    const last = rows.length ? rows[rows.length - 1] : null;
    const saldoAntes = last ? sfToMoney_(last.SALDO_DEPOIS) : 0;
    const valor = sfToMoney_(args.VALOR);
    const sinal = sanitize_(args.SINAL) === '+' ? '+' : '-';
    const saldoDepois = sinal === '+' ? sfToMoney_(saldoAntes + valor) : sfToMoney_(saldoAntes - valor);

    sfAppendByHeaders_(SF.SHEETS.CARTEIRA_SF, {
      LANCAMENTO_ID: uid_('SFCAR'),
      TIPO: sanitize_(args.TIPO),
      VALOR: valor,
      SINAL: sinal,
      SALDO_ANTES: saldoAntes,
      SALDO_DEPOIS: saldoDepois,
      ORDER_ID_AGF: sanitize_(args.ORDER_ID_AGF),
      ORDER_ID_SUPERFRETE: sanitize_(args.ORDER_ID_SUPERFRETE),
      OPERADOR_ID: sanitize_(args.OPERADOR_ID),
      REFERENCIA: sanitize_(args.REFERENCIA),
      OBS: sanitize_(args.OBS),
      CRIADO_EM: nowIso_()
    });

    return { saldoAntes: saldoAntes, saldoDepois: saldoDepois };
  });
}

function action_sfAdminGetFinancialSnapshot_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const contas = sfReadObjects_(SF.SHEETS.CONTAS);
  const carteira = sfReadObjects_(SF.SHEETS.CARTEIRA_SF);
  const etiquetas = sfReadObjects_(SF.SHEETS.ETIQUETAS);

  let limiteTotal = 0;
  let saldoClientes = 0;
  let reservado = 0;
  let disponivelClientes = 0;
  contas.forEach(function (c) {
    limiteTotal += sfToMoney_(c.LIMITE_CREDITO);
    saldoClientes += sfToMoney_(c.SALDO_CONTA);
    reservado += sfToMoney_(c.VALOR_RESERVADO);
    disponivelClientes += sfComputeDisponivel_(c);
  });

  const lastCarteira = carteira.length ? carteira[carteira.length - 1] : null;
  const saldoSuperFreteEstimado = lastCarteira ? sfToMoney_(lastCarteira.SALDO_DEPOIS) : 0;

  return {
    operador: user.USUARIO_ID,
    clientes: {
      qtdContas: contas.length,
      limiteTotal: limiteTotal,
      saldoClientes: saldoClientes,
      valorReservado: reservado,
      disponivelEmissao: disponivelClientes
    },
    superfrete: {
      saldoEstimado: saldoSuperFreteEstimado,
      qtdLancamentos: carteira.length
    },
    etiquetas: {
      qtdTotal: etiquetas.length
    },
    timestamp: nowIso_()
  };
}
