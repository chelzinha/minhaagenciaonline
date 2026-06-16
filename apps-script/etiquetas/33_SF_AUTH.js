/**
 * AGF SUPERFRETE — 33_SF_AUTH.gs
 * Autenticação separada do módulo SuperFrete.
 */

function sfSha256_(value) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function sfFindUserByLogin_(login) {
  const needle = lower_(login);
  if (!needle) return null;
  return sfReadObjects_(SF.SHEETS.USUARIOS).find(function (u) {
    return lower_(u.LOGIN) === needle;
  }) || null;
}

function sfCreateSession_(user) {
  const sessionToken = Utilities.getUuid();
  const payload = {
    USUARIO_ID: sanitize_(user.USUARIO_ID),
    TIPO_USUARIO: upper_(user.TIPO_USUARIO),
    CLIENTE_ID: sanitize_(user.CLIENTE_ID),
    NOME: sanitize_(user.NOME),
    LOGIN: sanitize_(user.LOGIN),
    PERMISSOES: sanitize_(user.PERMISSOES),
    createdAt: nowIso_()
  };
  CacheService.getScriptCache().put(SF.SESSION_PREFIX + sessionToken, JSON.stringify(payload), SF.SESSION_TTL_SEC);
  sfUpdateRowByHeaders_(SF.SHEETS.USUARIOS, user._row, { ULTIMO_LOGIN: nowIso_(), ATUALIZADO_EM: nowIso_() });
  return { sessionToken: sessionToken, user: payload };
}

function sfGetSession_(sessionToken) {
  const tk = sanitize_(sessionToken);
  if (!tk) throw new Error('Sessão SuperFrete não informada.');
  const raw = CacheService.getScriptCache().get(SF.SESSION_PREFIX + tk);
  if (!raw) throw new Error('Sessão SuperFrete expirada. Faça login novamente.');
  return JSON.parse(raw);
}

function sfRequireAdmin_(sessionToken) {
  const user = sfGetSession_(sessionToken);
  if (upper_(user.TIPO_USUARIO) !== 'ADMIN') throw new Error('Acesso restrito ao administrador.');
  return user;
}

function sfRequireClient_(sessionToken) {
  const user = sfGetSession_(sessionToken);
  if (upper_(user.TIPO_USUARIO) !== 'CLIENTE') throw new Error('Acesso restrito ao cliente.');
  return user;
}

function sfLogin_(params, expectedType) {
  const login = sanitize_(params.login);
  const senha = sanitize_(params.senha);
  if (!login || !senha) throw new Error('Informe login e senha.');

  const user = sfFindUserByLogin_(login);
  if (!user || upper_(user.STATUS) !== 'ATIVO') {
    sfLog_('WARN', 'SF_AUTH', 'LOGIN_FAIL', { MENSAGEM: 'Usuário inexistente/inativo', login: login });
    throw new Error('Login ou senha inválidos.');
  }

  if (expectedType && upper_(user.TIPO_USUARIO) !== expectedType) {
    sfLog_('WARN', 'SF_AUTH', 'LOGIN_WRONG_PORTAL', { MENSAGEM: 'Tipo de usuário incorreto', login: login, tipo: user.TIPO_USUARIO });
    throw new Error('Login ou senha inválidos para este portal.');
  }

  if (sanitize_(user.SENHA_HASH) !== sfSha256_(senha)) {
    sfLog_('WARN', 'SF_AUTH', 'LOGIN_FAIL', { MENSAGEM: 'Senha incorreta', login: login });
    throw new Error('Login ou senha inválidos.');
  }

  return sfCreateSession_(user);
}

function action_sfAdminLogin_(params) {
  return sfLogin_(params, 'ADMIN');
}

function action_sfClientLogin_(params) {
  return sfLogin_(params, 'CLIENTE');
}

function action_sfAdminMe_(params) {
  return { user: sfRequireAdmin_(params.sessionToken) };
}

function action_sfClientMe_(params) {
  const user = sfRequireClient_(params.sessionToken);
  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', user.CLIENTE_ID);
  const conta = sfGetContaByClienteId_(user.CLIENTE_ID);
  return { user: user, cliente: cliente, conta: conta };
}
