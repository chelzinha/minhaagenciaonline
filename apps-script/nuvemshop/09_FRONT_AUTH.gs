
function buildClientPublicPayload_(client, storeRow) {
  return {
    ID_CRM: String(client.ID_CRM || ''),
    LOGIN_APP: String(client.LOGIN_APP || ''),
    NOME_REMETENTE: String(client.NOME_REMETENTE || ''),
    NOME_FANTASIA: String(client.NOME_FANTASIA || ''),
    EMAIL: String(client.EMAIL || ''),
    WHATSAPP: String(client.WHATSAPP || ''),
    STATUS_TESTE_CWS: String(client.STATUS_TESTE_CWS || ''),
    STORE_ID: String(storeRow.USER_ID || ''),
    STORE_STATUS: String(storeRow.STATUS || ''),
    ID_CRM_REF: String(storeRow.ID_CRM_REF || '')
  };
}

function findClienteAppByLogin_(login) {
  const rows = loadClientesAppRows_();
  const needle = String(login || '').trim().toLowerCase();
  if (!needle) return null;
  return rows.find(function(r) {
    return String(r.LOGIN_APP || '').trim().toLowerCase() === needle;
  }) || null;
}

function findStoreByIdCrmRef_(idCrm) {
  const rows = sheetRowsAsObjects_(CFG.SHEETS.STORES);
  const needle = String(idCrm || '').trim();
  return rows.find(function(r) {
    return String(r.ID_CRM_REF || '').trim() === needle;
  }) || null;
}

function createFrontSession_(client, storeRow) {
  const sessionToken = Utilities.getUuid();
  const payload = buildClientPublicPayload_(client, storeRow);
  CacheService.getScriptCache().put(
    FRONT_CFG.SESSION_PREFIX + sessionToken,
    JSON.stringify(payload),
    FRONT_CFG.SESSION_TTL_SEC
  );
  return { sessionToken: sessionToken, client: payload };
}

function getFrontSession_(sessionToken) {
  const tk = String(sessionToken || '').trim();
  if (!tk) throw new Error('Sessão não informada. Faça login novamente.');
  const raw = CacheService.getScriptCache().get(FRONT_CFG.SESSION_PREFIX + tk);
  if (!raw) throw new Error('Sessão expirada. Faça login novamente.');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Sessão corrompida. Faça login novamente.');
  }
}

function destroyFrontSession_(sessionToken) {
  const tk = String(sessionToken || '').trim();
  if (!tk) return;
  CacheService.getScriptCache().remove(FRONT_CFG.SESSION_PREFIX + tk);
}

function action_ping_(params) {
  return {
    service: FRONT_CFG.APP_NAME,
    version: FRONT_CFG.VERSION,
    timestamp: nowIso_()
  };
}

function action_login_(params) {
  const login = String(params.login || '').trim();
  const senha = String(params.senha || '').trim();
  if (!login || !senha) throw new Error('Informe login e senha.');

  const client = findClienteAppByLogin_(login);
  if (!client || String(client.SENHA_APP || '').trim() !== senha) {
    appendLog_('WARN', 'front.auth.login', '', '', 'Falha de login', { login: login });
    throw new Error('Login ou senha inválidos.');
  }

  const storeRow = findStoreByIdCrmRef_(client.ID_CRM);
  if (!storeRow) {
    throw new Error('Este usuário ainda não está vinculado a uma loja Nuvemshop.');
  }
  if (!storeRow.ACCESS_TOKEN) {
    throw new Error('Loja vinculada sem token ativo. Refaça a autorização da Nuvemshop.');
  }

  const session = createFrontSession_(client, storeRow);
  appendLog_('INFO', 'front.auth.login', String(storeRow.USER_ID || ''), '', 'Login ok', {
    idCrm: client.ID_CRM,
    login: client.LOGIN_APP
  });
  return session;
}

function action_me_(params) {
  return { client: getFrontSession_(params.sessionToken) };
}

function action_logout_(params) {
  destroyFrontSession_(params.sessionToken);
  return { ok: true };
}
