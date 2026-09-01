/**
 * CAIXA À VISTA V2
 * Controle de acesso e seleção de unidade.
 *
 * Nesta etapa as funções são apenas preparatórias.
 * Nenhuma rotina de lançamento ou fechamento é alterada.
 */

function v2UnitAccessUsername_(user) {
  var value = '';

  if (user && typeof user === 'object') {
    value = user.id || user.username || '';
  } else {
    value = user || '';
  }

  return String(value).trim().toLowerCase();
}

function v2ListAccessibleUnits_(env, user) {
  var username = v2UnitAccessUsername_(user);

  if (!username) {
    return [];
  }

  var userRows = v2ReadObjects_(
    env.users,
    CAIXA_V2_CFG.HEADERS.USERS
  );

  var unitRows = v2ReadObjects_(
    env.units,
    CAIXA_V2_CFG.HEADERS.UNITS
  );

  var activeUnits = {};

  unitRows.forEach(function(unit) {
    var unitId = String(unit.unit_id || '').trim();

    if (unitId && v2Bool_(unit.active)) {
      activeUnits[unitId] = unit;
    }
  });

  var resultByUnit = {};

  userRows.forEach(function(mapping) {
    if (!v2Bool_(mapping.active)) {
      return;
    }

    var mappedUsername = String(
      mapping.username || ''
    ).trim().toLowerCase();

    /*
     * Não usamos mais o usuário genérico "*".
     * O acesso precisa existir nominalmente.
     */
    if (
      mappedUsername === '*' ||
      mappedUsername !== username
    ) {
      return;
    }

    var unitId = String(mapping.unit_id || '').trim();
    var unit = activeUnits[unitId];

    if (!unit) {
      return;
    }

    if (!resultByUnit[unitId]) {
      resultByUnit[unitId] = {
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

    /*
     * Caso uma unidade tenha sido cadastrada duas vezes,
     * as permissões são combinadas sem duplicar a unidade.
     */
    resultByUnit[unitId].permissions.revenue =
      resultByUnit[unitId].permissions.revenue ||
      v2Bool_(mapping.can_revenue);

    resultByUnit[unitId].permissions.expense =
      resultByUnit[unitId].permissions.expense ||
      v2Bool_(mapping.can_expense);

    resultByUnit[unitId].permissions.close =
      resultByUnit[unitId].permissions.close ||
      v2Bool_(mapping.can_close);

    resultByUnit[unitId].permissions.withdraw =
      resultByUnit[unitId].permissions.withdraw ||
      v2Bool_(mapping.can_withdraw);
  });

  return Object.keys(resultByUnit)
    .map(function(unitId) {
      return resultByUnit[unitId];
    })
    .sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
}

function v2ResolveUnitSelection_(
  env,
  user,
  requestedUnitId
) {
  var username = v2UnitAccessUsername_(user);
  var units = v2ListAccessibleUnits_(env, user);
  var requested = String(
    requestedUnitId || ''
  ).trim();

  if (!units.length) {
    return {
      ok: false,
      code: 'UNIT_MAPPING_REQUIRED',
      message: 'Usuário sem unidade autorizada.',
      username: username,
      requiresSelection: false,
      selectedUnit: null,
      units: []
    };
  }

  if (requested) {
    var selected = units.filter(function(unit) {
      return unit.id === requested;
    })[0];

    if (!selected) {
      return {
        ok: false,
        code: 'UNIT_NOT_ALLOWED',
        message: 'Usuário sem acesso à unidade solicitada.',
        username: username,
        requiresSelection: units.length > 1,
        selectedUnit: null,
        units: units
      };
    }

    return {
      ok: true,
      username: username,
      requiresSelection: false,
      selectedUnit: selected,
      units: units
    };
  }

  /*
   * Usuários com uma única unidade entram automaticamente.
   */
  if (units.length === 1) {
    return {
      ok: true,
      username: username,
      requiresSelection: false,
      selectedUnit: units[0],
      units: units
    };
  }

  /*
   * Usuários com duas unidades precisam escolher.
   */
  return {
    ok: true,
    username: username,
    requiresSelection: true,
    selectedUnit: null,
    units: units
  };
}

function auditarSelecaoUnidadesV2() {
  var env = v2Environment_();

  var expected = {
    admin: ['AGF', 'SHOPPING_METRO'],
    assis: ['AGF', 'SHOPPING_METRO'],
    helena: ['AGF', 'SHOPPING_METRO'],
    georgia: ['AGF', 'SHOPPING_METRO'],
    levy: ['AGF', 'SHOPPING_METRO'],
    manu: ['AGF'],
    elen: ['AGF'],
    alesson: ['AGF'],
    emerson: ['SHOPPING_METRO'],
    julio: ['SHOPPING_METRO'],
    will: [],
    lucas: []
  };

  var erros = [];
  var avisos = [];
  var usuarios = [];

  Object.keys(expected).forEach(function(username) {
    var expectedUnits = expected[username].slice().sort();

    var access = v2ListAccessibleUnits_(
      env,
      { id: username }
    );

    var actualUnits = access.map(function(unit) {
      return unit.id;
    }).sort();

    if (
      JSON.stringify(expectedUnits) !==
      JSON.stringify(actualUnits)
    ) {
      erros.push(
        username +
        ': esperado [' +
        expectedUnits.join(', ') +
        '], encontrado [' +
        actualUnits.join(', ') +
        '].'
      );
    }

    var state = v2ResolveUnitSelection_(
      env,
      { id: username },
      ''
    );

    if (expectedUnits.length === 2) {
      if (
        !state.ok ||
        !state.requiresSelection ||
        state.selectedUnit
      ) {
        erros.push(
          username +
          ': deveria exigir escolha de unidade.'
        );
      }

      expectedUnits.forEach(function(unitId) {
        var selectedState = v2ResolveUnitSelection_(
          env,
          { id: username },
          unitId
        );

        if (
          !selectedState.ok ||
          !selectedState.selectedUnit ||
          selectedState.selectedUnit.id !== unitId
        ) {
          erros.push(
            username +
            ': falhou ao selecionar ' +
            unitId +
            '.'
          );
        }
      });
    }

    if (expectedUnits.length === 1) {
      if (
        !state.ok ||
        state.requiresSelection ||
        !state.selectedUnit ||
        state.selectedUnit.id !== expectedUnits[0]
      ) {
        erros.push(
          username +
          ': deveria entrar automaticamente em ' +
          expectedUnits[0] +
          '.'
        );
      }
    }

    if (expectedUnits.length === 0 && state.ok) {
      erros.push(
        username +
        ': deveria permanecer sem acesso.'
      );
    }

    usuarios.push({
      username: username,
      unidadesEsperadas: expectedUnits,
      unidadesEncontradas: actualUnits,
      escolhaObrigatoria:
        expectedUnits.length === 2,
      unidadeAutomatica:
        expectedUnits.length === 1
          ? expectedUnits[0]
          : ''
    });
  });

  var userRows = v2ReadObjects_(
    env.users,
    CAIXA_V2_CFG.HEADERS.USERS
  );

  var wildcardRows = userRows.filter(function(row) {
    return (
      String(row.username || '').trim() === '*' &&
      v2Bool_(row.active)
    );
  });

  if (wildcardRows.length) {
    erros.push(
      'Ainda existe usuário genérico "*" ativo na Biblioteca_Usuarios.'
    );
  }

  var knownUsers = Object.keys(expected);

  var unexpectedUsers = userRows.filter(function(row) {
    var username = String(
      row.username || ''
    ).trim().toLowerCase();

    return (
      username &&
      username !== '*' &&
      v2Bool_(row.active) &&
      knownUsers.indexOf(username) === -1
    );
  });

  unexpectedUsers.forEach(function(row) {
    avisos.push(
      'Usuário ativo não previsto na auditoria: ' +
      row.username +
      ' / ' +
      row.unit_id
    );
  });

  var result = {
    ok: erros.length === 0,
    seguroParaIntegrarFrontend:
      erros.length === 0,
    erros: erros,
    avisos: avisos,
    usuarios: usuarios
  };

  var texto = JSON.stringify(result, null, 2);

  console.log(texto);
  Logger.log(texto);

  return result;
}

/**
 * Resposta da API para consulta e escolha de unidade.
 */
function v2UnitAccessResponse_(user, requestedUnitId) {
  var env = v2Environment_();

  var state = v2ResolveUnitSelection_(
    env,
    user,
    requestedUnitId
  );

  return {
    ok: state.ok,
    code: state.ok ? '' : String(state.code || ''),
    message: state.ok ? '' : String(state.message || ''),
    username: String(state.username || ''),
    requiresUnitSelection: Boolean(
      state.requiresSelection
    ),
    selectedUnit: state.selectedUnit || null,
    units: state.units || []
  };
}

/**
 * Auditoria da resposta que será consumida pelo frontend.
 */
function auditarEndpointUnidadesV2() {
  var erros = [];
  var cenarios = [];

  function registrar(
    nome,
    username,
    requestedUnitId,
    validar
  ) {
    var response = v2UnitAccessResponse_(
      { id: username },
      requestedUnitId
    );

    try {
      validar(response);
    } catch (error) {
      erros.push(
        nome + ': ' + String(error.message || error)
      );
    }

    cenarios.push({
      nome: nome,
      username: username,
      unidadeSolicitada: requestedUnitId || '',
      resposta: response
    });
  }

  function exigir(condicao, mensagem) {
    if (!condicao) {
      throw new Error(mensagem);
    }
  }

  registrar(
    'Administrador precisa escolher',
    'admin',
    '',
    function(response) {
      exigir(
        response.ok === true,
        'A resposta deveria ser válida.'
      );

      exigir(
        response.requiresUnitSelection === true,
        'Deveria exigir escolha de unidade.'
      );

      exigir(
        response.selectedUnit === null,
        'Nenhuma unidade deveria estar selecionada.'
      );

      exigir(
        response.units.length === 2,
        'Deveria retornar duas unidades.'
      );
    }
  );

  registrar(
    'Administrador escolhe AGF',
    'admin',
    'AGF',
    function(response) {
      exigir(
        response.ok === true,
        'A escolha da AGF deveria ser aceita.'
      );

      exigir(
        response.selectedUnit &&
        response.selectedUnit.id === 'AGF',
        'A unidade selecionada deveria ser AGF.'
      );

      exigir(
        response.requiresUnitSelection === false,
        'Após a escolha não deveria exigir nova seleção.'
      );
    }
  );

  registrar(
    'Administrador escolhe Shopping Metrô',
    'admin',
    'SHOPPING_METRO',
    function(response) {
      exigir(
        response.ok === true,
        'A escolha do Shopping Metrô deveria ser aceita.'
      );

      exigir(
        response.selectedUnit &&
        response.selectedUnit.id === 'SHOPPING_METRO',
        'A unidade selecionada deveria ser SHOPPING_METRO.'
      );
    }
  );

  registrar(
    'Manu entra automaticamente na AGF',
    'manu',
    '',
    function(response) {
      exigir(
        response.ok === true,
        'O acesso da Manu deveria ser válido.'
      );

      exigir(
        response.requiresUnitSelection === false,
        'A Manu não deveria escolher unidade.'
      );

      exigir(
        response.selectedUnit &&
        response.selectedUnit.id === 'AGF',
        'A unidade automática deveria ser AGF.'
      );
    }
  );

  registrar(
    'Emerson entra automaticamente no Shopping Metrô',
    'emerson',
    '',
    function(response) {
      exigir(
        response.ok === true,
        'O acesso do Emerson deveria ser válido.'
      );

      exigir(
        response.requiresUnitSelection === false,
        'O Emerson não deveria escolher unidade.'
      );

      exigir(
        response.selectedUnit &&
        response.selectedUnit.id === 'SHOPPING_METRO',
        'A unidade automática deveria ser SHOPPING_METRO.'
      );
    }
  );

  registrar(
    'Manu não pode escolher Shopping Metrô',
    'manu',
    'SHOPPING_METRO',
    function(response) {
      exigir(
        response.ok === false,
        'A escolha indevida deveria ser recusada.'
      );

      exigir(
        response.code === 'UNIT_NOT_ALLOWED',
        'O código deveria ser UNIT_NOT_ALLOWED.'
      );

      exigir(
        response.selectedUnit === null,
        'Nenhuma unidade deveria ser liberada.'
      );
    }
  );

  registrar(
    'Will permanece sem acesso',
    'will',
    '',
    function(response) {
      exigir(
        response.ok === false,
        'O acesso deveria ser recusado.'
      );

      exigir(
        response.code === 'UNIT_MAPPING_REQUIRED',
        'O código deveria ser UNIT_MAPPING_REQUIRED.'
      );

      exigir(
        response.units.length === 0,
        'Nenhuma unidade deveria ser retornada.'
      );
    }
  );

  var result = {
    ok: erros.length === 0,
    seguroParaIntegrarTela:
      erros.length === 0,
    erros: erros,
    cenariosTestados: cenarios.length,
    cenarios: cenarios
  };

  var texto = JSON.stringify(result, null, 2);

  console.log(texto);
  Logger.log(texto);

  return result;
}
