/** Utilitários compartilhados. */
function agfNowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Fortaleza', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function agfNormalizeUsername_(value) {
  return String(value || '').trim().toLowerCase();
}

function agfNormalizeRole_(value) {
  const role = String(value || '').trim().toLowerCase();
  if (AGF_AUTH_CFG.ROLES.indexOf(role) === -1) throw new Error('Perfil inválido. Use admin, manager ou user.');
  return role;
}

function agfRandomToken_(bytes) {
  const chunks = [];
  const count = Math.max(1, Math.ceil(Number(bytes || 32) / 16));
  for (let i = 0; i < count; i += 1) chunks.push(Utilities.getUuid().replace(/-/g, ''));
  return chunks.join('').slice(0, Number(bytes || 32) * 2);
}

function agfB64UrlFromString_(value) {
  return Utilities.base64EncodeWebSafe(String(value), Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function agfB64UrlFromBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function agfB64UrlToString_(value) {
  const text = String(value || '');
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
}

function agfSha256_(value) {
  return agfB64UrlFromBytes_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  ));
}

function agfHashPassword_(password, salt) {
  const props = PropertiesService.getScriptProperties();
  const pepper = props.getProperty(AGF_AUTH_CFG.PEPPER_PROP);
  if (!pepper) throw new Error('Controle de acesso ainda não configurado. Execute setupAgfAuth().');
  let digest = String(password || '') + '|' + String(salt || '') + '|' + pepper;
  for (let i = 0; i < AGF_AUTH_CFG.HASH_ROUNDS; i += 1) {
    digest = agfSha256_(digest + '|' + i);
  }
  return digest;
}

function agfTimingSafeEqual_(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) diff |= (left.charCodeAt(i % Math.max(1, left.length)) || 0) ^ (right.charCodeAt(i % Math.max(1, right.length)) || 0);
  return diff === 0;
}

function agfCreateJwt_(payload) {
  const secret = PropertiesService.getScriptProperties().getProperty(AGF_AUTH_CFG.JWT_PROP);
  if (!secret) throw new Error('JWT secret ausente. Execute setupAgfAuth().');
  const header = agfB64UrlFromString_(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = agfB64UrlFromString_(JSON.stringify(payload));
  const signature = agfB64UrlFromBytes_(Utilities.computeHmacSha256Signature(header + '.' + body, secret));
  return header + '.' + body + '.' + signature;
}

function agfParseAndVerifyJwt_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Sessão inválida.');
  const secret = PropertiesService.getScriptProperties().getProperty(AGF_AUTH_CFG.JWT_PROP);
  if (!secret) throw new Error('JWT secret ausente.');
  const expected = agfB64UrlFromBytes_(Utilities.computeHmacSha256Signature(parts[0] + '.' + parts[1], secret));
  if (!agfTimingSafeEqual_(expected, parts[2])) throw new Error('Assinatura de sessão inválida.');
  const payload = JSON.parse(agfB64UrlToString_(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) < now) throw new Error('Sessão expirada.');
  if (!payload.sid || !payload.sub || !payload.role) throw new Error('Sessão incompleta.');
  return payload;
}

function agfJson_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function agfParseRequest_(e) {
  const params = Object.assign({}, (e && e.parameter) || {});
  let body = {};
  try {
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('JSON inválido na requisição.');
  }
  return Object.assign({}, params, body || {});
}


function agfSheetSafeText_(value, maxLength) {
  const text = String(value == null ? '' : value).slice(0, Number(maxLength || 5000));
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function agfLoginAttemptKey_(username) {
  return 'login_attempts_' + agfSha256_(agfNormalizeUsername_(username)).slice(0, 24);
}

function agfGetLoginAttemptCount_(username) {
  return Number(CacheService.getScriptCache().get(agfLoginAttemptKey_(username)) || 0);
}

function agfAssertLoginAllowed_(username) {
  if (agfGetLoginAttemptCount_(username) >= AGF_AUTH_CFG.LOGIN_MAX_ATTEMPTS) {
    throw new Error('Muitas tentativas de login. Aguarde alguns minutos e tente novamente.');
  }
}

function agfRecordLoginFailure_(username) {
  const cache = CacheService.getScriptCache();
  const key = agfLoginAttemptKey_(username);
  const count = Math.min(AGF_AUTH_CFG.LOGIN_MAX_ATTEMPTS, agfGetLoginAttemptCount_(username) + 1);
  cache.put(key, String(count), AGF_AUTH_CFG.LOGIN_ATTEMPT_WINDOW_SECONDS);
}

function agfClearLoginFailures_(username) {
  CacheService.getScriptCache().remove(agfLoginAttemptKey_(username));
}

function agfToBool_(value, fallback) {
  if (value === true || String(value).toLowerCase() === 'true' || String(value) === '1') return true;
  if (value === false || String(value).toLowerCase() === 'false' || String(value) === '0') return false;
  return Boolean(fallback);
}

function agfLog_(eventName, username, detail) {
  try {
    const ss = agfGetDb_();
    const sh = ss.getSheetByName(AGF_AUTH_CFG.SHEETS.LOGS);
    sh.appendRow([agfNowIso_(), agfSheetSafeText_(eventName, 80), agfSheetSafeText_(username, 80), agfSheetSafeText_(detail, 1000)]);
  } catch (err) {
    console.warn('[AGF_AUTH] Falha ao registrar log:', err && err.message ? err.message : err);
  }
}

/** Normaliza o escopo de agenda do CRM sem expor valores inválidos ao frontend. */
function agfNormalizeCrmScope_(value, fallback) {
  const scope = String(value || fallback || 'OWN').trim().toUpperCase();
  return AGF_AUTH_CFG.CRM_SCOPES.indexOf(scope) >= 0 ? scope : 'OWN';
}

/** Defaults conservadores: vínculo CRM não concede acesso ou edição implicitamente. */
function agfCrmDefaultsForRole_(role) {
  const safeRole = agfNormalizeRole_(role);
  return {
    linked: false,
    responsavelId: '',
    agendaScope: safeRole === 'admin' ? 'ALL' : (safeRole === 'manager' ? 'TEAM' : 'OWN'),
    canEditClients: safeRole === 'admin' || safeRole === 'manager',
    canEditProspects: safeRole === 'admin' || safeRole === 'manager',
    canMoveFunnel: true,
    canCompleteActivities: true,
    canViewTeam: safeRole === 'admin' || safeRole === 'manager',
    canViewIndicators: safeRole === 'admin' || safeRole === 'manager'
  };
}

function agfCrmProfileFromUser_(user) {
  const raw = user || {};
  const defaults = agfCrmDefaultsForRole_(raw.role || 'user');
  return {
    linked: agfToBool_(raw.crm_linked, defaults.linked),
    responsavelId: String(raw.crm_responsavel_id || '').trim(),
    agendaScope: agfNormalizeCrmScope_(raw.crm_agenda_scope, defaults.agendaScope),
    canEditClients: agfToBool_(raw.crm_can_edit_clients, defaults.canEditClients),
    canEditProspects: agfToBool_(raw.crm_can_edit_prospects, defaults.canEditProspects),
    canMoveFunnel: agfToBool_(raw.crm_can_move_funnel, defaults.canMoveFunnel),
    canCompleteActivities: agfToBool_(raw.crm_can_complete_activities, defaults.canCompleteActivities),
    canViewTeam: agfToBool_(raw.crm_can_view_team, defaults.canViewTeam),
    canViewIndicators: agfToBool_(raw.crm_can_view_indicators, defaults.canViewIndicators)
  };
}

function agfNormalizeCrmProfile_(raw, existingUser, role) {
  const existing = agfCrmProfileFromUser_(existingUser || { role: role });
  const defaults = agfCrmDefaultsForRole_(role);
  const source = raw && typeof raw === 'object' ? raw : {};
  const pick = (keys, fallback) => {
    for (let i = 0; i < keys.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(source, keys[i])) return source[keys[i]];
    }
    return fallback;
  };
  const linked = agfToBool_(pick(['linked', 'crmLinked', 'crm_linked'], existing.linked), existing.linked);
  let responsavelId = String(pick(['responsavelId', 'crmResponsavelId', 'crm_responsavel_id'], existing.responsavelId) || '').trim();
  if (linked && !responsavelId) responsavelId = 'RSP_' + agfRandomToken_(6).toUpperCase();
  return {
    linked: linked,
    responsavelId: responsavelId,
    agendaScope: agfNormalizeCrmScope_(pick(['agendaScope', 'crmAgendaScope', 'crm_agenda_scope'], existing.agendaScope || defaults.agendaScope), defaults.agendaScope),
    canEditClients: agfToBool_(pick(['canEditClients', 'crmCanEditClients', 'crm_can_edit_clients'], existing.canEditClients), defaults.canEditClients),
    canEditProspects: agfToBool_(pick(['canEditProspects', 'crmCanEditProspects', 'crm_can_edit_prospects'], existing.canEditProspects), defaults.canEditProspects),
    canMoveFunnel: agfToBool_(pick(['canMoveFunnel', 'crmCanMoveFunnel', 'crm_can_move_funnel'], existing.canMoveFunnel), defaults.canMoveFunnel),
    canCompleteActivities: agfToBool_(pick(['canCompleteActivities', 'crmCanCompleteActivities', 'crm_can_complete_activities'], existing.canCompleteActivities), defaults.canCompleteActivities),
    canViewTeam: agfToBool_(pick(['canViewTeam', 'crmCanViewTeam', 'crm_can_view_team'], existing.canViewTeam), defaults.canViewTeam),
    canViewIndicators: agfToBool_(pick(['canViewIndicators', 'crmCanViewIndicators', 'crm_can_view_indicators'], existing.canViewIndicators), defaults.canViewIndicators)
  };
}

function agfCrmProfileToUserCells_(profile) {
  const safe = profile || agfCrmDefaultsForRole_('user');
  return [
    String(safe.responsavelId || ''), Boolean(safe.linked), String(safe.agendaScope || 'OWN'),
    Boolean(safe.canEditClients), Boolean(safe.canEditProspects), Boolean(safe.canMoveFunnel),
    Boolean(safe.canCompleteActivities), Boolean(safe.canViewTeam), Boolean(safe.canViewIndicators)
  ];
}

function agfCrmProfilesEqual_(left, right) {
  return JSON.stringify(agfNormalizeCrmProfile_(left || {}, {}, 'user')) === JSON.stringify(agfNormalizeCrmProfile_(right || {}, {}, 'user'));
}
