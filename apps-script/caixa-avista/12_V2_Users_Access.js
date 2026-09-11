/**
 * Configuração dos usuários autorizados no Caixa à Vista.
 *
 * Usuários com duas unidades aparecem em duas linhas.
 * Will e Lucas não recebem acesso ao Caixa.
 */

function configurarUsuariosCaixaV2() {
  var env = v2Environment_();
  var headers = CAIXA_V2_CFG.HEADERS.USERS;

  var acessoDuplo = [
    'admin',
    'assis',
    'helena',
    'georgia',
    'levy'
  ];

  var somenteAgf = [
    'manu',
    'elen',
    'alesson'
  ];

  var somenteMetro = [
    'emerson',
    'julio'
  ];

  var semAcesso = [
    'will',
    'lucas'
  ];

  var rows = [];

  function adicionar(username, unitId) {
    rows.push([
      username,
      unitId,
      true,  // receitas
      true,  // despesas
      true,  // fechamento
      true,  // sangria
      true   // ativo
    ]);
  }

  acessoDuplo.forEach(function(username) {
    adicionar(username, 'AGF');
    adicionar(username, 'SHOPPING_METRO');
  });

  somenteAgf.forEach(function(username) {
    adicionar(username, 'AGF');
  });

  somenteMetro.forEach(function(username) {
    adicionar(username, 'SHOPPING_METRO');
  });

  if (env.users.getLastRow() > 1) {
    env.users
      .getRange(
        2,
        1,
        env.users.getLastRow() - 1,
        headers.length
      )
      .clearContent();
  }

  env.users
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  env.users
    .getRange(
      2,
      1,
      rows.length,
      headers.length
    )
    .setValues(rows);

  env.users.setFrozenRows(1);

  SpreadsheetApp.flush();

  return {
    ok: true,
    totalVinculos: rows.length,
    vinculosAgf: rows.filter(function(row) {
      return row[1] === 'AGF';
    }).length,
    vinculosMetro: rows.filter(function(row) {
      return row[1] === 'SHOPPING_METRO';
    }).length,
    acessoDuplo: acessoDuplo,
    somenteAgf: somenteAgf,
    somenteMetro: somenteMetro,
    semAcesso: semAcesso
  };
}

function configurarUsuariosEAuditarCaixaV2() {
  var configuracao = configurarUsuariosCaixaV2();
  var auditoria = auditarConfiguracaoCaixaV2();

  var resultado = {
    ok: auditoria.ok,
    seguroParaTeste: auditoria.seguroParaTeste,
    configuracao: configuracao,
    erros: auditoria.erros,
    avisos: auditoria.avisos,
    filaPendente: auditoria.filaPendente,
    usuariosConfigurados: auditoria.usuarios
  };

  var texto = JSON.stringify(resultado, null, 2);

  console.log(texto);
  Logger.log(texto);

  return resultado;
}
