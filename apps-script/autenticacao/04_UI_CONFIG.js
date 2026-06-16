/** Tema e biblioteca dinâmica de ícones. */
function agfGetUiConfig_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('ui_config');
  if (cached) return { ok: true, config: JSON.parse(cached) };
  const props = PropertiesService.getScriptProperties();
  const config = agfSanitizeUiConfig_(JSON.parse(props.getProperty(AGF_AUTH_CFG.UI_PROP) || JSON.stringify(AGF_AUTH_CFG.DEFAULT_UI)));
  cache.put('ui_config', JSON.stringify(config), AGF_AUTH_CFG.UI_CACHE_SECONDS);
  return { ok: true, config: config };
}

function agfSaveUiConfig_(token, rawConfig) {
  const admin = agfRequireAdmin_(token);
  const config = agfSanitizeUiConfig_(rawConfig || {});
  PropertiesService.getScriptProperties().setProperty(AGF_AUTH_CFG.UI_PROP, JSON.stringify(config));
  CacheService.getScriptCache().remove('ui_config');
  agfWriteUiSnapshot_(admin.username, config);
  agfLog_('UI_CONFIG_SAVED', admin.username, 'version=' + config.version);
  return { ok: true, config: config };
}

function agfSanitizeUiConfig_(raw) {
  const base = JSON.parse(JSON.stringify(AGF_AUTH_CFG.DEFAULT_UI));
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawColors = source.colors && typeof source.colors === 'object' ? source.colors : {};
  const rawIcons = source.icons && typeof source.icons === 'object' ? source.icons : {};
  const config = {
    version: Math.max(1, Number(source.version || base.version || 1)),
    colors: {},
    icons: {},
    customized: { colors: [], icons: [] }
  };
  const validKey = (key) => /^[a-z0-9_-]{2,60}$/.test(String(key || ''));
  const uniqueKeys = (first, second) => {
    const seen = {};
    return first.concat(second).filter((key) => {
      const safe = String(key || '').trim();
      if (!validKey(safe) || seen[safe]) return false;
      seen[safe] = true;
      return true;
    }).slice(0, 300);
  };
  uniqueKeys(Object.keys(base.colors), Object.keys(rawColors)).forEach((key) => {
    const fallback = String(base.colors[key] || '#00416B').toUpperCase();
    const value = String(rawColors[key] || fallback).trim().toUpperCase();
    config.colors[key] = /^#[0-9A-F]{6}$/.test(value) ? value : fallback;
  });
  uniqueKeys(Object.keys(base.icons), Object.keys(rawIcons)).forEach((key) => {
    const fallback = String(base.icons[key] || key).trim();
    const value = String(rawIcons[key] || fallback).trim();
    config.icons[key] = /^[a-z0-9_]{2,60}$/.test(value) ? value : fallback;
  });
  const rawCustomized = source.customized && typeof source.customized === 'object' ? source.customized : {};
  config.customized.colors = (Array.isArray(rawCustomized.colors) ? rawCustomized.colors : [])
    .map((key) => String(key || '').trim()).filter((key, index, values) => validKey(key) && config.colors[key] && values.indexOf(key) === index).slice(0, 300);
  config.customized.icons = (Array.isArray(rawCustomized.icons) ? rawCustomized.icons : [])
    .map((key) => String(key || '').trim()).filter((key, index, values) => validKey(key) && config.icons[key] && values.indexOf(key) === index).slice(0, 300);
  return config;
}

function agfWriteUiSnapshot_(username, config) {
  const ss = agfGetDb_();
  ss.getSheetByName(AGF_AUTH_CFG.SHEETS.UI).appendRow([agfNowIso_(), String(username || ''), JSON.stringify(config)]);
}
