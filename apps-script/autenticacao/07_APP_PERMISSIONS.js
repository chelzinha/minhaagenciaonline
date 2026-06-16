/** Permissões por aplicativo. O perfil define o teto; a lista individual define o subconjunto liberado. */
function agfListApps_() {
  return AGF_AUTH_CFG.APPS.map((app) => ({
    key: String(app.key),
    label: String(app.label),
    path: String(app.path),
    category: String(app.category),
    protected: Boolean(app.protected),
    defaultEnabled: app.defaultEnabled !== false,
    roles: app.roles.map(String)
  }));
}

function agfAppByKey_(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return AGF_AUTH_CFG.APPS.find((app) => String(app.key) === normalized) || null;
}

function agfDefaultAppsForRole_(role) {
  const safeRole = agfNormalizeRole_(role);
  return AGF_AUTH_CFG.APPS
    .filter((app) => app.roles.indexOf(safeRole) >= 0 && app.defaultEnabled !== false)
    .map((app) => String(app.key));
}

function agfParseAppsInput_(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw === null || typeof raw === 'undefined') return null;
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return text.split(',');
  }
}

function agfSanitizeAppsForRole_(raw, role, fallbackToRoleDefaults) {
  const safeRole = agfNormalizeRole_(role);
  const allowedByRole = AGF_AUTH_CFG.APPS.filter((app) => app.roles.indexOf(safeRole) >= 0).map((app) => String(app.key));
  const parsed = agfParseAppsInput_(raw);
  if (parsed === null) return fallbackToRoleDefaults === false ? [] : agfDefaultAppsForRole_(safeRole);
  const seen = {};
  return parsed.map((item) => String(item || '').trim().toLowerCase()).filter((key) => {
    if (!key || seen[key] || allowedByRole.indexOf(key) === -1) return false;
    seen[key] = true;
    return true;
  });
}

function agfEffectiveAppsForUser_(user) {
  if (!user) return [];
  const raw = user.allowed_apps_json;
  return agfSanitizeAppsForRole_(raw, user.role, true);
}

function agfAppsEqual_(first, second) {
  const left = (Array.isArray(first) ? first : []).map(String).sort();
  const right = (Array.isArray(second) ? second : []).map(String).sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

function agfCanAccessApp_(user, appKey) {
  const app = agfAppByKey_(appKey);
  if (!app || !user) return false;
  const role = agfNormalizeRole_(user.role);
  if (app.roles.indexOf(role) === -1) return false;
  return agfEffectiveAppsForUser_(user).indexOf(String(app.key)) >= 0;
}

function agfGetAppsCatalogForAdmin_() {
  return agfListApps_();
}
