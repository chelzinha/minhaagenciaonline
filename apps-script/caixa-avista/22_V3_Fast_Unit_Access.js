/**
 * CAIXA À VISTA V3 - consulta rápida de unidade.
 *
 * Evita v2Environment_() no unitAccess. A seleção continua sendo validada
 * nominalmente em Biblioteca_Usuarios e Biblioteca_Unidades, mas sem abrir,
 * conferir e congelar todas as demais abas do sistema.
 */

function v3FastAccessibleUnits_(unitRows, userRows, user) {
  var username = v2UnitAccessUsername_(user);
  if (!username) return [];

  var activeUnits = {};

  unitRows.forEach(function(unit) {
    var unitId = String(unit.unit_id || '').trim();
    if (unitId && v2Bool_(unit.active)) {
      activeUnits[unitId] = unit;
    }
  });

  var byUnit = {};

  userRows.forEach(function(mapping) {
    if (!v2Bool_(mapping.active)) return;

    var mappedUsername = String(mapping.username || '')
      .trim()
      .toLowerCase();

    if (
      !mappedUsername ||
      mappedUsername === '*' ||
      mappedUsername !== username
    ) {
      return;
    }

    var unitId = String(mapping.unit_id || '').trim();
    var unit = activeUnits[unitId];
    if (!unit) return;

    if (!byUnit[unitId]) {
      byUnit[unitId] = {
        id: unitId,
        name: String(unit.name || unitId),
        permissions: {
          revenue: false,
          expense: false,
          close: false,
          withdraw: false
        }
      };
    }

    byUnit[unitId].permissions.revenue =
      byUnit[unitId].permissions.revenue || v2Bool_(mapping.can_revenue);
    byUnit[unitId].permissions.expense =
      byUnit[unitId].permissions.expense || v2Bool_(mapping.can_expense);
    byUnit[unitId].permissions.close =
      byUnit[unitId].permissions.close || v2Bool_(mapping.can_close);
    byUnit[unitId].permissions.withdraw =
      byUnit[unitId].permissions.withdraw || v2Bool_(mapping.can_withdraw);
  });

  return Object.keys(byUnit)
    .map(function(unitId) { return byUnit[unitId]; })
    .sort(function(a, b) { return a.name.localeCompare(b.name); });
}

function v3FastUnitAccessResponse_(user, requestedUnitId) {
  var startedAt = Date.now();
  var env = v3FastEnvironment_();

  var unitRows = v2ReadObjects_(
    env.units,
    CAIXA_V2_CFG.HEADERS.UNITS
  );
  var userRows = v2ReadObjects_(
    env.users,
    CAIXA_V2_CFG.HEADERS.USERS
  );

  var username = v2UnitAccessUsername_(user);
  var units = v3FastAccessibleUnits_(unitRows, userRows, user);
  var requested = String(requestedUnitId || '').trim();

  if (!units.length) {
    return {
      ok: false,
      code: 'UNIT_MAPPING_REQUIRED',
      message: 'Usuário sem unidade autorizada.',
      username: username,
      requiresUnitSelection: false,
      selectedUnit: null,
      units: [],
      bootstrapMs: Date.now() - startedAt
    };
  }

  if (requested) {
    var selected = units.filter(function(unit) {
      return unit.id === requested;
    })[0] || null;

    if (!selected) {
      return {
        ok: false,
        code: 'UNIT_NOT_ALLOWED',
        message: 'Usuário sem acesso à unidade solicitada.',
        username: username,
        requiresUnitSelection: units.length > 1,
        selectedUnit: null,
        units: units,
        bootstrapMs: Date.now() - startedAt
      };
    }

    return {
      ok: true,
      code: '',
      message: '',
      username: username,
      requiresUnitSelection: false,
      selectedUnit: selected,
      units: units,
      bootstrapMs: Date.now() - startedAt
    };
  }

  if (units.length === 1) {
    return {
      ok: true,
      code: '',
      message: '',
      username: username,
      requiresUnitSelection: false,
      selectedUnit: units[0],
      units: units,
      bootstrapMs: Date.now() - startedAt
    };
  }

  return {
    ok: true,
    code: '',
    message: '',
    username: username,
    requiresUnitSelection: true,
    selectedUnit: null,
    units: units,
    bootstrapMs: Date.now() - startedAt
  };
}
