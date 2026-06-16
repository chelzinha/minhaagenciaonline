const AUTH_CFG = {
  USERKEY_PREFIX: 'APP_USERKEY_'
};

function getActiveUserSessionKey_() {
  const userKey = Session.getTemporaryActiveUserKey() || 'ANON';
  return AUTH_CFG.USERKEY_PREFIX + userKey;
}

function createSession_(client) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();

  cache.put(
    CFG.SESSION_PREFIX + token,
    JSON.stringify(buildSessionPayload_(client)),
    CFG.SESSION_TTL_SEC
  );

  cache.put(
    getActiveUserSessionKey_(),
    token,
    CFG.SESSION_TTL_SEC
  );

  return token;
}

function getCurrentSessionToken_() {
  const cache = CacheService.getScriptCache();
  return cache.get(getActiveUserSessionKey_()) || '';
}

function getSession_(token) {
  const cache = CacheService.getScriptCache();
  const resolvedToken = sanitizeText_(token) || getCurrentSessionToken_();

  if (!resolvedToken) {
    throw new Error('Sessão inválida ou expirada.');
  }

  const raw = cache.get(CFG.SESSION_PREFIX + resolvedToken);
  if (!raw) {
    cache.remove(getActiveUserSessionKey_());
    throw new Error('Sessão inválida ou expirada.');
  }

  return JSON.parse(raw);
}

function destroySession_(token) {
  const cache = CacheService.getScriptCache();
  const resolvedToken = sanitizeText_(token) || getCurrentSessionToken_();

  if (resolvedToken) cache.remove(CFG.SESSION_PREFIX + resolvedToken);
  cache.remove(getActiveUserSessionKey_());

  return { ok: true };
}

function loginClienteApp(login, senha) {
  try {
    const client = findClientByLogin_(login);
    if (!client) throw new Error('Login não encontrado.');

    if (sanitizeText_(client.SENHA_APP) !== sanitizeText_(senha)) {
      throw new Error('Senha inválida.');
    }

    const token = createSession_(client);

    writeLog_('INFO', 'AUTH', 'LOGIN', {
      idCrm: client.ID_CRM,
      login: client.LOGIN_APP,
      status: 'OK',
      mensagem: 'Login realizado'
    });

    return {
      ok: true,
      token: token,
      client: buildSessionPayload_(client)
    };
  } catch (err) {
    writeLog_('ERRO', 'AUTH', 'LOGIN', {
      login: sanitizeText_(login),
      status: 'ERRO',
      mensagem: err.message || String(err)
    });

    return {
      ok: false,
      message: err.message || String(err)
    };
  }
}

function getClienteLogado(token) {
  return {
    ok: true,
    client: getSession_(token)
  };
}

function logoutClienteApp(token) {
  destroySession_(token);
  return { ok: true };
}
