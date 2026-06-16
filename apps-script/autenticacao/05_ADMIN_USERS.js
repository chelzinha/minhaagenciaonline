/** Administração de usuários pelo portal. As funções públicas abaixo exigem sessão admin válida. */
function agfListUsersForAdmin_(token) {
  agfRequireAdmin_(token);
  return { ok: true, users: listAgfUsers(), apps: agfGetAppsCatalogForAdmin_() };
}

function agfSaveUserFromAdmin_(token, request) {
  agfRequireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return agfCreateOrUpdateUserInternal_(
      request.username,
      request.displayName,
      request.password,
      request.role,
      request.active,
      Array.isArray(request.apps) ? request.apps : undefined,
      request.crm && typeof request.crm === 'object' ? request.crm : undefined
    );
  } finally {
    lock.releaseLock();
  }
}

function agfRevokeUserSessionsFromAdmin_(token, username) {
  agfRequireAdmin_(token);
  return revokeAgfUserSessions(username);
}

function agfPurgeSessionsFromAdmin_(token) {
  agfRequireAdmin_(token);
  return purgeInactiveOrExpiredAgfSessions();
}

function agfSyncCrmResponsaveisFromAdmin_(token) {
  agfRequireAdmin_(token);
  return syncAgfCrmResponsaveis();
}
