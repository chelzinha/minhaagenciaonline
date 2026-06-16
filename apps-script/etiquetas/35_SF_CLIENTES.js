/**
 * AGF SUPERFRETE — 35_SF_CLIENTES.gs
 * Consultas básicas do painel admin.
 */

function action_sfHealth_(params) {
  return {
    ok: true,
    service: SF.APP_NAME,
    version: SF.VERSION,
    timestamp: nowIso_(),
    spreadsheetId: sfGetSpreadsheetId_()
  };
}

function action_sfAdminListClients_(params) {
  sfRequireAdmin_(params.sessionToken);

  const clientes = sfReadObjects_(SF.SHEETS.CLIENTES);
  const contas = sfReadObjects_(SF.SHEETS.CONTAS);
  const remetentes = sfReadObjects_(SF.SHEETS.REMETENTES);

  const contasByCliente = {};
  contas.forEach(function (c) { contasByCliente[sanitize_(c.CLIENTE_ID)] = c; });

  const remetentesByCliente = {};
  remetentes.forEach(function (r) {
    const id = sanitize_(r.CLIENTE_ID);
    if (!remetentesByCliente[id]) remetentesByCliente[id] = [];
    remetentesByCliente[id].push(r);
  });

  return clientes.map(function (c) {
    const conta = contasByCliente[sanitize_(c.CLIENTE_ID)] || {};
    return {
      CLIENTE_ID: sanitize_(c.CLIENTE_ID),
      STATUS: sanitize_(c.STATUS),
      NOME_EXIBICAO: sanitize_(c.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(c.RAZAO_SOCIAL),
      DOCUMENTO: sanitize_(c.DOCUMENTO),
      EMAIL: sanitize_(c.EMAIL),
      TELEFONE: sanitize_(c.TELEFONE),
      QTD_REMETENTES: (remetentesByCliente[sanitize_(c.CLIENTE_ID)] || []).length,
      LIMITE_CREDITO: sfToMoney_(conta.LIMITE_CREDITO),
      SALDO_CONTA: sfToMoney_(conta.SALDO_CONTA),
      VALOR_RESERVADO: sfToMoney_(conta.VALOR_RESERVADO),
      DISPONIVEL_EMISSAO: sfComputeDisponivel_(conta)
    };
  });
}

function action_sfAdminGetClient_(params) {
  sfRequireAdmin_(params.sessionToken);
  const clienteId = sanitize_(params.clienteId || params.CLIENTE_ID);
  if (!clienteId) throw new Error('clienteId obrigatório.');

  const usuarios = sfReadObjects_(SF.SHEETS.USUARIOS).filter(function (u) {
    return upper_(u.TIPO_USUARIO) === 'CLIENTE' && sanitize_(u.CLIENTE_ID) === clienteId;
  }).map(function (u) {
    return {
      USUARIO_ID: sanitize_(u.USUARIO_ID),
      TIPO_USUARIO: sanitize_(u.TIPO_USUARIO),
      CLIENTE_ID: sanitize_(u.CLIENTE_ID),
      NOME: sanitize_(u.NOME),
      LOGIN: sanitize_(u.LOGIN),
      STATUS: sanitize_(u.STATUS),
      PERMISSOES: sanitize_(u.PERMISSOES),
      ULTIMO_LOGIN: sanitize_(u.ULTIMO_LOGIN),
      CRIADO_EM: sanitize_(u.CRIADO_EM),
      ATUALIZADO_EM: sanitize_(u.ATUALIZADO_EM)
    };
  });

  const lancamentos = sfReadObjects_(SF.SHEETS.LANC_CLIENTES)
    .filter(function (l) { return sanitize_(l.CLIENTE_ID) === clienteId; })
    .slice(-50)
    .reverse();

  const cobrancas = sfReadObjects_(SF.SHEETS.COBRANCAS_PIX)
    .filter(function (c) { return sanitize_(c.CLIENTE_ID) === clienteId; })
    .slice(-30)
    .reverse();

  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', clienteId) || {};
  const logoDriveId = sanitize_(cliente.LOGO_DRIVE_ID);
  if (logoDriveId && typeof sfBuildLogoDataUrl_ === 'function') {
    cliente.LOGO_DATA_URL = sfBuildLogoDataUrl_(logoDriveId);
  } else {
    cliente.LOGO_DATA_URL = '';
  }

  return {
    cliente: cliente,
    conta: sfGetContaByClienteId_(clienteId),
    remetentes: sfReadObjects_(SF.SHEETS.REMETENTES).filter(function (r) { return sanitize_(r.CLIENTE_ID) === clienteId; }),
    usuarios: usuarios,
    lancamentos: lancamentos,
    cobrancas: cobrancas,
    ultimasEtiquetas: sfReadObjects_(SF.SHEETS.ETIQUETAS).filter(function (e) { return sanitize_(e.CLIENTE_ID) === clienteId; }).slice(-20).reverse()
  };
}

function action_sfAdminSaveClient_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  return sfWithLock_(function () {
    const cliente = params.cliente || {};
    const remetente = params.remetente || {};
    const conta = params.conta || {};

    const clienteId = sanitize_(cliente.CLIENTE_ID) || uid_('CLI');
    const now = nowIso_();

    const existing = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', clienteId);
    const clientePatch = {
      CLIENTE_ID: clienteId,
      STATUS: sanitize_(cliente.STATUS) || 'ATIVO',
      NOME_EXIBICAO: sanitize_(cliente.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(cliente.RAZAO_SOCIAL),
      DOCUMENTO: sfNormalizeDoc_(cliente.DOCUMENTO),
      EMAIL: sanitize_(cliente.EMAIL),
      TELEFONE: digitsOnly_(cliente.TELEFONE),
      LOGO_DRIVE_ID: sanitize_(cliente.LOGO_DRIVE_ID),
      LOGO_URL: sanitize_(cliente.LOGO_URL),
      OBS_INTERNA: sanitize_(cliente.OBS_INTERNA),
      ATUALIZADO_EM: now
    };
    if (existing) {
      sfUpdateRowByHeaders_(SF.SHEETS.CLIENTES, existing._row, clientePatch);
    } else {
      clientePatch.CRIADO_EM = now;
      sfAppendByHeaders_(SF.SHEETS.CLIENTES, clientePatch);
    }

    if (remetente && Object.keys(remetente).length) {
      const remetenteId = sanitize_(remetente.REMETENTE_ID) || uid_('REM');
      const remExisting = sfFindBy_(SF.SHEETS.REMETENTES, 'REMETENTE_ID', remetenteId);
      const remPatch = {
        REMETENTE_ID: remetenteId,
        CLIENTE_ID: clienteId,
        STATUS: sanitize_(remetente.STATUS) || 'ATIVO',
        NOME_REMETENTE: sanitize_(remetente.NOME_REMETENTE),
        RAZAO_SOCIAL: sanitize_(remetente.RAZAO_SOCIAL),
        CNPJ_CPF: sfNormalizeDoc_(remetente.CNPJ_CPF),
        EMAIL: sanitize_(remetente.EMAIL),
        TELEFONE: digitsOnly_(remetente.TELEFONE),
        CEP: digitsOnly_(remetente.CEP),
        ENDERECO: sanitize_(remetente.ENDERECO),
        NUMERO: sanitize_(remetente.NUMERO),
        COMPLEMENTO: sanitize_(remetente.COMPLEMENTO),
        BAIRRO: sanitize_(remetente.BAIRRO),
        CIDADE: sanitize_(remetente.CIDADE),
        UF: upper_(remetente.UF),
        PADRAO: sanitize_(remetente.PADRAO) || 'SIM',
        ATUALIZADO_EM: now
      };
      if (remExisting) {
        sfUpdateRowByHeaders_(SF.SHEETS.REMETENTES, remExisting._row, remPatch);
      } else {
        remPatch.CRIADO_EM = now;
        sfAppendByHeaders_(SF.SHEETS.REMETENTES, remPatch);
      }
    }

    if (conta && Object.keys(conta).length) {
      const contaExisting = sfFindBy_(SF.SHEETS.CONTAS, 'CLIENTE_ID', clienteId);
      const contaPatch = {
        CLIENTE_ID: clienteId,
        LIMITE_CREDITO: sfToMoney_(conta.LIMITE_CREDITO),
        SALDO_CONTA: sfToMoney_(conta.SALDO_CONTA),
        VALOR_RESERVADO: sfToMoney_(conta.VALOR_RESERVADO),
        STATUS_CREDITO: sanitize_(conta.STATUS_CREDITO) || 'ATIVO',
        BLOQUEAR_EMISSAO: sanitize_(conta.BLOQUEAR_EMISSAO) || 'NAO',
        ATUALIZADO_EM: now
      };
      contaPatch.DISPONIVEL_EMISSAO = sfComputeDisponivel_(contaPatch);
      if (contaExisting) {
        sfUpdateRowByHeaders_(SF.SHEETS.CONTAS, contaExisting._row, contaPatch);
      } else {
        sfAppendByHeaders_(SF.SHEETS.CONTAS, contaPatch);
      }
    }

    const usuario = params.usuario || {};
    if (usuario && Object.keys(usuario).length) {
      sfSaveClientUser_(clienteId, usuario, user.USUARIO_ID);
    }

    sfLog_('INFO', 'SF_CLIENTES', 'SAVE_CLIENT', { USUARIO_ID: user.USUARIO_ID, CLIENTE_ID: clienteId, MENSAGEM: 'Cliente salvo' });
    return action_sfAdminGetClient_(Object.assign({}, params, { clienteId: clienteId }));
  });
}

function sfSaveClientUser_(clienteId, usuario, operadorId) {
  const login = lower_(usuario.LOGIN);
  if (!login) return null;

  const usuarios = sfReadObjects_(SF.SHEETS.USUARIOS);
  const usuarioIdInformado = sanitize_(usuario.USUARIO_ID);
  let existing = null;

  if (usuarioIdInformado) {
    existing = usuarios.find(function (u) { return sanitize_(u.USUARIO_ID) === usuarioIdInformado; }) || null;
  }
  if (!existing) {
    existing = usuarios.find(function (u) {
      return upper_(u.TIPO_USUARIO) === 'CLIENTE' && sanitize_(u.CLIENTE_ID) === sanitize_(clienteId);
    }) || null;
  }

  const loginDuplicado = usuarios.find(function (u) {
    return lower_(u.LOGIN) === login && (!existing || sanitize_(u.USUARIO_ID) !== sanitize_(existing.USUARIO_ID));
  });
  if (loginDuplicado) throw new Error('Já existe um usuário com este login: ' + login);

  const senhaNova = sanitize_(usuario.SENHA_NOVA || usuario.SENHA || '');
  if (!existing && !senhaNova) throw new Error('Senha obrigatória para criar o login do cliente.');

  const now = nowIso_();
  const patch = {
    USUARIO_ID: existing ? sanitize_(existing.USUARIO_ID) : uid_('USR'),
    TIPO_USUARIO: 'CLIENTE',
    CLIENTE_ID: sanitize_(clienteId),
    NOME: sanitize_(usuario.NOME) || sanitize_(usuario.LOGIN),
    LOGIN: login,
    STATUS: sanitize_(usuario.STATUS) || 'ATIVO',
    PERMISSOES: sanitize_(usuario.PERMISSOES) || 'CLIENTE',
    ATUALIZADO_EM: now
  };

  if (senhaNova) patch.SENHA_HASH = sfSha256_(senhaNova);
  else patch.SENHA_HASH = sanitize_(existing.SENHA_HASH);

  if (existing) {
    sfUpdateRowByHeaders_(SF.SHEETS.USUARIOS, existing._row, patch);
  } else {
    patch.ULTIMO_LOGIN = '';
    patch.CRIADO_EM = now;
    sfAppendByHeaders_(SF.SHEETS.USUARIOS, patch);
  }

  sfLog_('INFO', 'SF_CLIENTES', 'SAVE_CLIENT_USER', {
    USUARIO_ID: operadorId,
    CLIENTE_ID: clienteId,
    MENSAGEM: 'Login do cliente salvo: ' + login
  });

  return patch.USUARIO_ID;
}

function action_sfAdminGetClientFinancial_(params) {
  sfRequireAdmin_(params.sessionToken);
  const clienteId = sanitize_(params.clienteId || params.CLIENTE_ID);
  if (!clienteId) throw new Error('clienteId obrigatório.');

  const conta = sfGetContaByClienteId_(clienteId);
  const lancamentos = sfReadObjects_(SF.SHEETS.LANC_CLIENTES)
    .filter(function (l) { return sanitize_(l.CLIENTE_ID) === clienteId; })
    .slice(-100)
    .reverse();
  const etiquetas = sfReadObjects_(SF.SHEETS.ETIQUETAS)
    .filter(function (e) { return sanitize_(e.CLIENTE_ID) === clienteId; })
    .slice(-100)
    .reverse();
  const cobrancas = sfReadObjects_(SF.SHEETS.COBRANCAS_PIX)
    .filter(function (c) { return sanitize_(c.CLIENTE_ID) === clienteId; })
    .slice(-100)
    .reverse();

  return {
    clienteId: clienteId,
    conta: conta,
    lancamentos: lancamentos,
    etiquetas: etiquetas,
    cobrancas: cobrancas,
    timestamp: nowIso_()
  };
}

function action_sfAdminAdjustClientBalance_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const clienteId = sanitize_(params.clienteId || params.CLIENTE_ID);
  const tipo = sanitize_(params.tipo || params.TIPO || 'AJUSTE_MANUAL_CREDITO');
  const sinal = sanitize_(params.sinal || params.SINAL || '+');
  const valor = sfToMoney_(params.valor || params.VALOR);
  const motivo = sanitize_(params.motivo || params.MOTIVO);

  if (!clienteId) throw new Error('clienteId obrigatório.');
  if (valor <= 0) throw new Error('Informe um valor maior que zero para o ajuste.');
  if (!motivo) throw new Error('Motivo obrigatório para ajuste manual.');

  return sfLancarCliente_({
    CLIENTE_ID: clienteId,
    TIPO: tipo,
    VALOR: valor,
    SINAL: sinal === '-' ? '-' : '+',
    OPERADOR_ID: user.USUARIO_ID,
    ORIGEM: 'PAINEL_ADMIN',
    MOTIVO: motivo
  });
}
