/**
 * Audita a aplicação da unidade escolhida nas operações.
 *
 * Não cria receitas, despesas, sangrias ou fechamentos.
 */
function auditarContextoOperacionalUnidadesV2() {
  var env = v2Environment_();
  var erros = [];
  var cenarios = [];

  function user_(username, unitId) {
    return {
      id: username,
      name: username,
      role: 'user',
      requestedUnitId: unitId || ''
    };
  }

  function exigir(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function testarSucesso(
    nome,
    username,
    unitId,
    expectedUnitId
  ) {
    try {
      var context = v2ResolveContext_(
        env,
        user_(username, unitId)
      );

      exigir(
        String(context.unit.unit_id) === expectedUnitId,
        'Unidade resolvida incorretamente.'
      );

      cenarios.push({
        nome: nome,
        username: username,
        unidadeSolicitada: unitId || '',
        resultado: 'PERMITIDO',
        unidadeResolvida: String(
          context.unit.unit_id
        )
      });
    } catch (error) {
      erros.push(
        nome + ': ' +
        String(error.message || error)
      );
    }
  }

  function testarBloqueio(
    nome,
    username,
    unitId,
    expectedCode
  ) {
    try {
      v2ResolveContext_(
        env,
        user_(username, unitId)
      );

      erros.push(
        nome + ': o acesso deveria ter sido recusado.'
      );
    } catch (error) {
      var actualCode = String(error.code || '');

      if (actualCode !== expectedCode) {
        erros.push(
          nome +
          ': código esperado ' +
          expectedCode +
          ', recebido ' +
          actualCode +
          '.'
        );
      }

      cenarios.push({
        nome: nome,
        username: username,
        unidadeSolicitada: unitId || '',
        resultado: 'BLOQUEADO',
        codigo: actualCode
      });
    }
  }

  testarBloqueio(
    'Administrador sem escolher unidade',
    'admin',
    '',
    'UNIT_SELECTION_REQUIRED'
  );

  testarSucesso(
    'Administrador acessa AGF',
    'admin',
    'AGF',
    'AGF'
  );

  testarSucesso(
    'Administrador acessa Shopping Metrô',
    'admin',
    'SHOPPING_METRO',
    'SHOPPING_METRO'
  );

  testarSucesso(
    'Manu entra automaticamente na AGF',
    'manu',
    '',
    'AGF'
  );

  testarBloqueio(
    'Manu não acessa Shopping Metrô',
    'manu',
    'SHOPPING_METRO',
    'UNIT_NOT_ALLOWED'
  );

  testarSucesso(
    'Emerson entra automaticamente no Shopping Metrô',
    'emerson',
    '',
    'SHOPPING_METRO'
  );

  testarBloqueio(
    'Will permanece sem unidade',
    'will',
    '',
    'UNIT_MAPPING_REQUIRED'
  );

  var result = {
    ok: erros.length === 0,
    seguroParaUsarUnidadeNasOperacoes:
      erros.length === 0,
    erros: erros,
    cenariosTestados: cenarios.length,
    cenarios: cenarios
  };

  var output = JSON.stringify(result, null, 2);

  console.log(output);
  Logger.log(output);

  return result;
}