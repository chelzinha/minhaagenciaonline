/** Persistência em Google Sheets, com leituras e escritas em lote. */
function setupAgfAuth() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let dbId = props.getProperty(AGF_AUTH_CFG.DB_PROP);
    let ss;
    if (!dbId) {
      ss = SpreadsheetApp.create('AGF José Bonifácio — Controle de Acesso');
      dbId = ss.getId();
      props.setProperty(AGF_AUTH_CFG.DB_PROP, dbId);
    } else {
      ss = SpreadsheetApp.openById(dbId);
    }
    if (!props.getProperty(AGF_AUTH_CFG.CRM_DB_PROP) && AGF_AUTH_CFG.CRM_DEFAULT_DB_ID) props.setProperty(AGF_AUTH_CFG.CRM_DB_PROP, AGF_AUTH_CFG.CRM_DEFAULT_DB_ID);
    if (!props.getProperty(AGF_AUTH_CFG.PEPPER_PROP)) props.setProperty(AGF_AUTH_CFG.PEPPER_PROP, agfRandomToken_(48));
    if (!props.getProperty(AGF_AUTH_CFG.JWT_PROP)) props.setProperty(AGF_AUTH_CFG.JWT_PROP, agfRandomToken_(64));
    if (!props.getProperty(AGF_AUTH_CFG.UI_PROP)) props.setProperty(AGF_AUTH_CFG.UI_PROP, JSON.stringify(AGF_AUTH_CFG.DEFAULT_UI));

    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.USERS, AGF_USERS_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.SESSIONS, AGF_SESSIONS_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.UI, AGF_UI_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.LOGS, AGF_LOG_HEADERS);
    CacheService.getScriptCache().put('agf_schema_v5_ready', '1', 21600);

    const users = agfReadUsers_();
    let initialAdminPassword = '';
    if (!users.length) {
      initialAdminPassword = agfRandomToken_(8);
      agfCreateOrUpdateUserInternal_('admin', 'Administrador', initialAdminPassword, 'admin', true);
      agfLog_('SETUP_ADMIN_CREATED', 'admin', 'Usuário admin inicial criado.');
    }
    agfWriteUiSnapshot_('setup', JSON.parse(props.getProperty(AGF_AUTH_CFG.UI_PROP)));
    agfTrySyncCrmProjection_('setup');
    if (initialAdminPassword) {
      console.log('==========================================');
      console.log('ADMIN INICIAL CRIADO');
      console.log('Login: admin');
      console.log('Senha temporária: ' + initialAdminPassword);
      console.log('Guarde esta senha. Ela não pode ser recuperada pelo hash.');
      console.log('==========================================');
    } else {
      console.log('O usuário admin já existia. A estrutura foi atualizada. Para redefinir a senha, execute resetAdminPasswordAndLog().');
    }
    return {
      ok: true,
      spreadsheetId: dbId,
      spreadsheetUrl: ss.getUrl(),
      crmSpreadsheetId: props.getProperty(AGF_AUTH_CFG.CRM_DB_PROP) || '',
      initialAdminUsername: 'admin',
      initialAdminPassword: initialAdminPassword || '(já criado anteriormente)',
      nextStep: 'Implante como Web App executando como você e com acesso para qualquer pessoa com o link.'
    };
  } finally {
    lock.releaseLock();
  }
}

/** Atualização segura para instalações existentes. Preserva colunas e dados anteriores. */
function migrateAgfAuthV5() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty(AGF_AUTH_CFG.CRM_DB_PROP) && AGF_AUTH_CFG.CRM_DEFAULT_DB_ID) props.setProperty(AGF_AUTH_CFG.CRM_DB_PROP, AGF_AUTH_CFG.CRM_DEFAULT_DB_ID);
    const ss = agfGetDbRaw_();
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.USERS, AGF_USERS_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.SESSIONS, AGF_SESSIONS_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.UI, AGF_UI_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.LOGS, AGF_LOG_HEADERS);
    CacheService.getScriptCache().remove('users_all');
    CacheService.getScriptCache().remove('agf_schema_v4_ready');
    CacheService.getScriptCache().put('agf_schema_v5_ready', '1', 21600);
    const projection = agfTrySyncCrmProjection_('migration');
    agfLog_('SCHEMA_V5_MIGRATED', 'system', 'Campos CRM validados;projection=' + JSON.stringify(projection));
    return { ok: true, message: 'Estrutura V5 validada. Campos CRM e catálogo de aplicativos atualizados.', projection: projection };
  } finally {
    lock.releaseLock();
  }
}

/** Mantida para compatibilidade com roteiro de implantação anterior. */
function migrateAgfAuthV4() {
  return migrateAgfAuthV5();
}

function getAgfAuthDeploymentInfo() {
  const props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty(AGF_AUTH_CFG.DB_PROP) || '',
    crmSpreadsheetId: props.getProperty(AGF_AUTH_CFG.CRM_DB_PROP) || '',
    sessionDays: AGF_AUTH_CFG.SESSION_DAYS,
    apps: agfListApps_()
  };
}

function agfGetDbRaw_() {
  const dbId = PropertiesService.getScriptProperties().getProperty(AGF_AUTH_CFG.DB_PROP);
  if (!dbId) throw new Error('Banco de acesso ausente. Execute setupAgfAuth() uma vez.');
  return SpreadsheetApp.openById(dbId);
}

function agfGetDb_() {
  const ss = agfGetDbRaw_();
  agfEnsureRuntimeSchema_(ss);
  return ss;
}

function agfEnsureRuntimeSchema_(ss) {
  const cache = CacheService.getScriptCache();
  if (cache.get('agf_schema_v5_ready')) return;
  agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.USERS, AGF_USERS_HEADERS);
  cache.put('agf_schema_v5_ready', '1', 21600);
}

/** Permite acrescentar novas colunas somente ao final, preservando dados existentes. */
function agfEnsureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existingWidth = Math.max(1, sh.getLastColumn());
    const existing = sh.getRange(1, 1, 1, Math.max(headers.length, existingWidth)).getDisplayValues()[0];
    const patched = existing.slice(0, Math.max(headers.length, existingWidth));
    let changed = false;
    for (let idx = 0; idx < headers.length; idx += 1) {
      if (!patched[idx]) {
        patched[idx] = headers[idx];
        changed = true;
      } else if (patched[idx] !== headers[idx]) {
        throw new Error('Cabeçalho incompatível na aba ' + name + ' na coluna ' + (idx + 1) + '. Não altere a ordem das colunas.');
      }
    }
    if (changed) sh.getRange(1, 1, 1, patched.length).setValues([patched]);
  }
  sh.setFrozenRows(1);
  return sh;
}

function agfReadRows_(sheetName, headers) {
  const sh = agfGetDb_().getSheetByName(sheetName);
  if (!sh) throw new Error('Aba ausente: ' + sheetName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map((row, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((header, col) => { obj[header] = row[col]; });
    return obj;
  });
}

function agfReadUsers_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('users_all');
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { cache.remove('users_all'); }
  }
  const users = agfReadRows_(AGF_AUTH_CFG.SHEETS.USERS, AGF_USERS_HEADERS);
  cache.put('users_all', JSON.stringify(users), AGF_AUTH_CFG.USERS_CACHE_SECONDS);
  return users;
}

function agfReadSessions_() {
  return agfReadRows_(AGF_AUTH_CFG.SHEETS.SESSIONS, AGF_SESSIONS_HEADERS);
}

function agfFindUser_(username) {
  const key = agfNormalizeUsername_(username);
  return agfReadUsers_().find((u) => agfNormalizeUsername_(u.username) === key) || null;
}

/** Compatível com versões anteriores: apps e crm são opcionais. */
function createOrUpdateAgfUser(username, displayName, password, role, active, apps, crm) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return agfCreateOrUpdateUserInternal_(username, displayName, password, role, active, apps, crm);
  } finally {
    lock.releaseLock();
  }
}

function agfCreateOrUpdateUserInternal_(username, displayName, password, role, active, apps, crm) {
  const key = agfNormalizeUsername_(username);
  if (!/^[a-z0-9._-]{3,60}$/.test(key)) throw new Error('Use um login de 3 a 60 caracteres com letras minúsculas, números, ponto, hífen ou sublinhado.');
  const safeRole = agfNormalizeRole_(role);
  const safeName = agfSheetSafeText_(String(displayName || key).trim(), 80);
  const safeActive = agfToBool_(active, true);
  const existing = agfFindUser_(key);
  const newPassword = String(password || '');
  const hasAppsInput = Array.isArray(apps);
  const hasCrmInput = crm && typeof crm === 'object';
  if (newPassword && newPassword.length < 6) throw new Error('A senha deve ter ao menos 6 caracteres.');
  const now = agfNowIso_();
  const sh = agfGetDb_().getSheetByName(AGF_AUTH_CFG.SHEETS.USERS);
  if (existing && String(existing.role || '') === 'admin' && agfToBool_(existing.active, false) && (safeRole !== 'admin' || !safeActive)) {
    const activeAdmins = agfReadUsers_().filter((user) => String(user.role || '') === 'admin' && agfToBool_(user.active, false));
    if (activeAdmins.length <= 1) throw new Error('Não é possível desativar ou rebaixar o último administrador ativo.');
  }

  const appsJson = hasAppsInput
    ? JSON.stringify(agfSanitizeAppsForRole_(apps, safeRole, false))
    : (existing ? String(existing.allowed_apps_json || '') : '');
  const previousCrm = agfCrmProfileFromUser_(existing || { role: safeRole });
  const nextCrm = agfNormalizeCrmProfile_(hasCrmInput ? crm : previousCrm, existing || { role: safeRole }, safeRole);

  if (existing) {
    const salt = existing.salt || agfRandomToken_(16);
    const passHash = newPassword ? agfHashPassword_(newPassword, salt) : existing.password_hash;
    if (!passHash) throw new Error('Informe uma senha para o usuário.');
    sh.getRange(existing._row, 1, 1, AGF_USERS_HEADERS.length).setValues([[
      key, safeName, safeRole, salt, passHash, safeActive, existing.created_at || now, now,
      existing.last_login_at || '', appsJson
    ].concat(agfCrmProfileToUserCells_(nextCrm))]);
    CacheService.getScriptCache().remove('users_all');
    const appsChanged = String(existing.allowed_apps_json || '') !== appsJson;
    const crmChanged = !agfCrmProfilesEqual_(previousCrm, nextCrm);
    const mustRevoke = Boolean(newPassword) || String(existing.role || '') !== safeRole || agfToBool_(existing.active, false) !== safeActive || appsChanged || crmChanged;
    const revoked = mustRevoke ? agfRevokeUserSessionsInternal_(key) : 0;
    agfLog_('USER_UPDATED', key, 'role=' + safeRole + ';active=' + safeActive + ';apps=' + appsJson + ';crmLinked=' + nextCrm.linked + ';sessionsRevoked=' + revoked);
  } else {
    if (newPassword.length < 6) throw new Error('A senha inicial deve ter ao menos 6 caracteres.');
    const salt = agfRandomToken_(16);
    sh.appendRow([
      key, safeName, safeRole, salt, agfHashPassword_(newPassword, salt), safeActive, now, now, '', appsJson
    ].concat(agfCrmProfileToUserCells_(nextCrm)));
    agfLog_('USER_CREATED', key, 'role=' + safeRole + ';active=' + safeActive + ';apps=' + appsJson + ';crmLinked=' + nextCrm.linked);
  }
  CacheService.getScriptCache().remove('users_all');
  const projection = agfTrySyncCrmProjection_('user-save:' + key);
  const saved = agfFindUser_(key);
  return {
    ok: true,
    username: key,
    displayName: safeName,
    role: safeRole,
    active: safeActive,
    apps: agfEffectiveAppsForUser_(saved),
    crm: agfCrmProfileFromUser_(saved),
    crmProjection: projection
  };
}

function disableAgfUser(username) {
  const user = agfFindUser_(username);
  if (!user) throw new Error('Usuário não encontrado.');
  return createOrUpdateAgfUser(user.username, user.display_name, '', user.role, false);
}

function agfRevokeUserSessionsInternal_(username) {
  const key = agfNormalizeUsername_(username);
  const sessions = agfReadSessions_();
  if (!sessions.length) return 0;
  const sh = agfGetDb_().getSheetByName(AGF_AUTH_CFG.SHEETS.SESSIONS);
  const activeValues = sessions.map((session) => [agfToBool_(session.active, false)]);
  let count = 0;
  sessions.forEach((session, index) => {
    if (agfNormalizeUsername_(session.username) === key && activeValues[index][0]) {
      activeValues[index][0] = false;
      CacheService.getScriptCache().remove('session_' + session.sid_hash);
      count += 1;
    }
  });
  if (count) sh.getRange(2, 7, activeValues.length, 1).setValues(activeValues);
  return count;
}

function revokeAgfUserSessions(username) {
  const key = agfNormalizeUsername_(username);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const count = agfRevokeUserSessionsInternal_(key);
    agfLog_('SESSIONS_REVOKED', key, 'count=' + count);
    return { ok: true, revoked: count };
  } finally {
    lock.releaseLock();
  }
}

function purgeInactiveOrExpiredAgfSessions() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sessions = agfReadSessions_();
    if (!sessions.length) return { ok: true, removed: 0, retained: 0 };
    const keep = [];
    const removed = [];
    sessions.forEach((session) => {
      const active = agfToBool_(session.active, false);
      const expires = new Date(session.expires_at || 0).getTime();
      if (active && Number.isFinite(expires) && expires >= Date.now()) keep.push(session);
      else removed.push(session);
    });
    if (!removed.length) return { ok: true, removed: 0, retained: keep.length };
    const sh = agfGetDb_().getSheetByName(AGF_AUTH_CFG.SHEETS.SESSIONS);
    const lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, AGF_SESSIONS_HEADERS.length).clearContent();
    if (keep.length) {
      const rows = keep.map((session) => AGF_SESSIONS_HEADERS.map((header) => session[header]));
      sh.getRange(2, 1, rows.length, AGF_SESSIONS_HEADERS.length).setValues(rows);
    }
    removed.forEach((session) => CacheService.getScriptCache().remove('session_' + session.sid_hash));
    agfLog_('SESSIONS_PURGED', 'system', 'removed=' + removed.length + ';retained=' + keep.length);
    return { ok: true, removed: removed.length, retained: keep.length };
  } finally {
    lock.releaseLock();
  }
}

function listAgfUsers() {
  return agfReadUsers_().map((u) => ({
    username: String(u.username || ''),
    displayName: String(u.display_name || ''),
    role: String(u.role || ''),
    active: agfToBool_(u.active, false),
    createdAt: String(u.created_at || ''),
    updatedAt: String(u.updated_at || ''),
    lastLoginAt: String(u.last_login_at || ''),
    apps: agfEffectiveAppsForUser_(u),
    appsInherited: !String(u.allowed_apps_json || '').trim(),
    crm: agfCrmProfileFromUser_(u)
  }));
}

/** Define a planilha canônica do CRM e sincroniza os responsáveis vinculados. */
function configureAgfCrmProjection(spreadsheetId) {
  const id = String(spreadsheetId || AGF_AUTH_CFG.CRM_DEFAULT_DB_ID || '').trim();
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) throw new Error('Informe um ID válido da planilha APP Total CF + Metro.');
  PropertiesService.getScriptProperties().setProperty(AGF_AUTH_CFG.CRM_DB_PROP, id);
  return syncAgfCrmResponsaveis();
}

function agfGetCrmDbId_() {
  return String(PropertiesService.getScriptProperties().getProperty(AGF_AUTH_CFG.CRM_DB_PROP) || AGF_AUTH_CFG.CRM_DEFAULT_DB_ID || '').trim();
}

function syncAgfCrmResponsaveis() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const result = agfSyncCrmProjection_();
    agfLog_('CRM_RESPONSIBLES_SYNCED', 'system', JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function agfTrySyncCrmProjection_(origin) {
  try {
    const result = agfSyncCrmProjection_();
    return Object.assign({ ok: true }, result);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    agfLog_('CRM_RESPONSIBLES_SYNC_WARNING', 'system', 'origin=' + String(origin || '') + ';error=' + message);
    return { ok: false, warning: message };
  }
}

function agfSyncCrmProjection_() {
  const crmDbId = agfGetCrmDbId_();
  if (!crmDbId) throw new Error('Planilha canônica do CRM não configurada. Execute configureAgfCrmProjection().');
  const crmSs = SpreadsheetApp.openById(crmDbId);
  const sh = agfEnsureSheet_(crmSs, AGF_AUTH_CFG.SHEETS.CRM_RESPONSIBLES, AGF_CRM_RESPONSAVEIS_HEADERS);
  const now = agfNowIso_();
  const rows = agfReadUsers_()
    .map((user) => ({ user: user, crm: agfCrmProfileFromUser_(user) }))
    .filter((entry) => entry.crm.linked || entry.crm.responsavelId)
    .map((entry) => [
      entry.crm.responsavelId,
      String(entry.user.username || ''),
      String(entry.user.display_name || ''),
      String(entry.user.role || ''),
      agfToBool_(entry.user.active, false),
      Boolean(entry.crm.linked),
      entry.crm.agendaScope,
      Boolean(entry.crm.canEditClients),
      Boolean(entry.crm.canEditProspects),
      Boolean(entry.crm.canMoveFunnel),
      Boolean(entry.crm.canCompleteActivities),
      Boolean(entry.crm.canViewTeam),
      Boolean(entry.crm.canViewIndicators),
      now
    ]);
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, AGF_CRM_RESPONSAVEIS_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, AGF_CRM_RESPONSAVEIS_HEADERS.length).setValues(rows);
  return { ok: true, spreadsheetId: crmDbId, sheet: AGF_AUTH_CFG.SHEETS.CRM_RESPONSIBLES, synced: rows.length };
}


/** Atualização segura do catálogo de aplicativos para incluir os módulos internos do Reverso. */
function migrateAgfAuthV6() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = agfGetDbRaw_();
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.USERS, AGF_USERS_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.SESSIONS, AGF_SESSIONS_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.UI, AGF_UI_HEADERS);
    agfEnsureSheet_(ss, AGF_AUTH_CFG.SHEETS.LOGS, AGF_LOG_HEADERS);
    CacheService.getScriptCache().remove('users_all');
    CacheService.getScriptCache().remove('ui_config');
    CacheService.getScriptCache().put('agf_schema_v5_ready', '1', 21600);
    const apps = agfListApps_();
    agfLog_('SCHEMA_V6_MIGRATED', 'system', 'Catálogo atualizado com reverso-admin, reverso-coleta e reverso-expedicao.');
    return {
      ok: true,
      message: 'Catálogo de aplicativos atualizado com Admin Reverso, Coleta Reverso e Expedição Reverso.',
      apps: apps
    };
  } finally {
    lock.releaseLock();
  }
}


/** Atualização segura do catálogo de aplicativos para incluir Expedição Reverso. */
function migrateAgfAuthV7() {
  return migrateAgfAuthV6();
}
