/** Autenticação, sessões persistentes e troca segura da própria senha. */
function agfLogin_(request) {
  const username = agfNormalizeUsername_(request.username);
  const password = String(request.password || '');
  const userAgent = agfSheetSafeText_(request.userAgent || '', 300);
  if (!/^[a-z0-9._-]{3,60}$/.test(username) || !password || password.length > 200) throw new Error('Informe login e senha válidos.');
  agfAssertLoginAllowed_(username);
  const user = agfFindUser_(username);
  if (!user || !agfToBool_(user.active, false)) {
    agfRecordLoginFailure_(username);
    agfLog_('LOGIN_DENIED', username, 'Usuário ausente ou inativo.');
    throw new Error('Login ou senha inválidos.');
  }
  const actual = agfHashPassword_(password, user.salt);
  if (!agfTimingSafeEqual_(actual, user.password_hash)) {
    agfRecordLoginFailure_(username);
    agfLog_('LOGIN_DENIED', username, 'Senha inválida.');
    throw new Error('Login ou senha inválidos.');
  }
  agfClearLoginFailures_(username);
  const sid = agfRandomToken_(32);
  const sidHash = agfSha256_(sid);
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + AGF_AUTH_CFG.SESSION_DAYS * 86400;
  const payload = {
    sub: username,
    name: String(user.display_name || username),
    role: agfNormalizeRole_(user.role),
    apps: agfEffectiveAppsForUser_(user),
    crm: agfCrmProfileFromUser_(user),
    sid: sid,
    iat: issuedAt,
    exp: exp
  };
  const token = agfCreateJwt_(payload);
  const nowIso = agfNowIso_();
  const expIso = new Date(exp * 1000).toISOString();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = agfGetDb_();
    ss.getSheetByName(AGF_AUTH_CFG.SHEETS.SESSIONS).appendRow([
      sidHash, username, payload.role, nowIso, nowIso, expIso, true, userAgent
    ]);
    ss.getSheetByName(AGF_AUTH_CFG.SHEETS.USERS).getRange(user._row, 9).setValue(nowIso);
    CacheService.getScriptCache().remove('users_all');
  } finally {
    lock.releaseLock();
  }
  agfLog_('LOGIN_OK', username, 'role=' + payload.role + ';apps=' + JSON.stringify(payload.apps) + ';crmLinked=' + payload.crm.linked);
  return { ok: true, token: token, user: agfPublicUserFromPayload_(payload) };
}

function agfValidate_(token) {
  const payload = agfParseAndVerifyJwt_(token);
  const sidHash = agfSha256_(payload.sid);
  const cache = CacheService.getScriptCache();
  const cached = cache.get('session_' + sidHash);
  if (cached) return { ok: true, user: JSON.parse(cached) };

  const session = agfReadSessions_().find((s) => String(s.sid_hash || '') === sidHash);
  if (!session || !agfToBool_(session.active, false)) throw new Error('Sessão encerrada. Faça login novamente.');
  if (new Date(session.expires_at).getTime() < Date.now()) throw new Error('Sessão expirada. Faça login novamente.');
  const user = agfFindUser_(payload.sub);
  if (!user || !agfToBool_(user.active, false)) throw new Error('Usuário inativo.');
  const currentRole = agfNormalizeRole_(user.role);
  const currentApps = agfEffectiveAppsForUser_(user);
  const currentCrm = agfCrmProfileFromUser_(user);
  if (currentRole !== payload.role) throw new Error('Perfil alterado. Faça login novamente.');
  if (Array.isArray(payload.apps) && !agfAppsEqual_(payload.apps, currentApps)) throw new Error('Permissões alteradas. Faça login novamente.');
  if (payload.crm && !agfCrmProfilesEqual_(payload.crm, currentCrm)) throw new Error('Permissões do CRM alteradas. Faça login novamente.');

  const publicUser = agfPublicUserFromPayload_(payload, currentApps, currentCrm);
  cache.put('session_' + sidHash, JSON.stringify(publicUser), AGF_AUTH_CFG.SESSION_CACHE_SECONDS);
  agfTouchSession_(session);
  return { ok: true, user: publicUser };
}

function agfLogout_(token) {
  if (!token) return { ok: true };
  let payload;
  try {
    payload = agfParseAndVerifyJwt_(token);
  } catch (err) {
    return { ok: true };
  }
  const sidHash = agfSha256_(payload.sid);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const session = agfReadSessions_().find((s) => String(s.sid_hash || '') === sidHash);
    if (session) agfGetDb_().getSheetByName(AGF_AUTH_CFG.SHEETS.SESSIONS).getRange(session._row, 7).setValue(false);
    CacheService.getScriptCache().remove('session_' + sidHash);
  } finally {
    lock.releaseLock();
  }
  agfLog_('LOGOUT', payload.sub, 'Sessão encerrada pelo usuário.');
  return { ok: true };
}

function agfRequireAdmin_(token) {
  const validation = agfValidate_(token);
  if (!validation.user || validation.user.role !== 'admin') throw new Error('Acesso permitido somente para administrador.');
  return validation.user;
}

function agfChangeMyPassword_(token, request) {
  const validation = agfValidate_(token);
  const username = agfNormalizeUsername_(validation.user.username);
  const currentPassword = String((request && request.currentPassword) || '');
  const newPassword = String((request && request.newPassword) || '');
  if (!currentPassword) throw new Error('Informe sua senha atual.');
  if (newPassword.length < 8) throw new Error('A nova senha deve ter ao menos 8 caracteres.');
  if (newPassword.length > 160) throw new Error('A nova senha é muito longa.');
  if (currentPassword === newPassword) throw new Error('Escolha uma senha diferente da atual.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    CacheService.getScriptCache().remove('users_all');
    const user = agfFindUser_(username);
    if (!user || !agfToBool_(user.active, false)) throw new Error('Usuário inativo ou não encontrado.');
    const actual = agfHashPassword_(currentPassword, user.salt);
    if (!agfTimingSafeEqual_(actual, user.password_hash)) throw new Error('A senha atual está incorreta.');
    const now = agfNowIso_();
    const newSalt = agfRandomToken_(16);
    const sh = agfGetDb_().getSheetByName(AGF_AUTH_CFG.SHEETS.USERS);
    sh.getRange(user._row, 1, 1, AGF_USERS_HEADERS.length).setValues([[
      user.username, user.display_name, user.role, newSalt, agfHashPassword_(newPassword, newSalt),
      agfToBool_(user.active, true), user.created_at || now, now, user.last_login_at || '',
      user.allowed_apps_json || ''
    ].concat(agfCrmProfileToUserCells_(agfCrmProfileFromUser_(user)))]);
    CacheService.getScriptCache().remove('users_all');
    const revoked = agfRevokeUserSessionsInternal_(username);
    agfLog_('PASSWORD_CHANGED_SELF', username, 'sessionsRevoked=' + revoked);
    return { ok: true, relogin: true, sessionsRevoked: revoked };
  } finally {
    lock.releaseLock();
  }
}

function agfPublicUserFromPayload_(payload, appsOverride, crmOverride) {
  const role = String(payload.role || '');
  return {
    username: String(payload.sub || ''),
    displayName: String(payload.name || payload.sub || ''),
    role: role,
    apps: agfSanitizeAppsForRole_(Array.isArray(appsOverride) ? appsOverride : payload.apps, role, true),
    crm: agfNormalizeCrmProfile_(crmOverride || payload.crm || {}, {}, role)
  };
}

function agfTouchSession_(session) {
  try {
    const lastSeen = new Date(session.last_seen_at || 0).getTime();
    if (Date.now() - lastSeen < 6 * 60 * 60 * 1000) return;
    agfGetDb_().getSheetByName(AGF_AUTH_CFG.SHEETS.SESSIONS).getRange(session._row, 5).setValue(agfNowIso_());
  } catch (err) {
    console.warn('[AGF_AUTH] Falha no touch da sessão:', err && err.message ? err.message : err);
  }
}
