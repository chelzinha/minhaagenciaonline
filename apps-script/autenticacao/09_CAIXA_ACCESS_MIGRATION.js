/**
 * Alinha allowed_apps_json ao acesso operacional do Caixa Balcão.
 * Preserva todos os outros aplicativos e nunca toca em senha, salt ou hash.
 */
function agfCaixaExpectedUsers_() {
  return {
    withAccess: [
      'admin','assis','julio','helena','manu',
      'elen','levy','georgia','alesson','emerson'
    ],
    withoutAccess: ['lucas','will']
  };
}

function auditarAcessoCaixaBalcaoV2() {
  var expected = agfCaixaExpectedUsers_();
  var users = agfReadUsers_();
  var errors = [];
  var result = [];

  users.forEach(function(user) {
    var username = agfNormalizeUsername_(user.username);
    var apps = agfEffectiveAppsForUser_(user);
    var hasCaixa = apps.indexOf('caixa') >= 0;
    var shouldHave = expected.withAccess.indexOf(username) >= 0;
    var shouldNotHave = expected.withoutAccess.indexOf(username) >= 0;

    if (shouldHave && !hasCaixa) {
      errors.push(username + ': falta acesso ao caixa.');
    }

    if (shouldNotHave && hasCaixa) {
      errors.push(username + ': acesso ao caixa deveria estar removido.');
    }

    result.push({
      username:username,
      hasCaixa:hasCaixa,
      expected:shouldHave ? 'COM_ACESSO' : (shouldNotHave ? 'SEM_ACESSO' : 'NAO_GERENCIADO')
    });
  });

  expected.withAccess.concat(expected.withoutAccess).forEach(function(username) {
    if (!users.some(function(user){
      return agfNormalizeUsername_(user.username) === username;
    })) {
      errors.push(username + ': usuário não encontrado.');
    }
  });

  return {
    ok: errors.length === 0,
    errors: errors,
    users: result
  };
}

function migrarAcessoCaixaBalcaoV2() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    CacheService.getScriptCache().remove('users_all');

    var expected = agfCaixaExpectedUsers_();
    var users = agfReadUsers_();
    var sh = agfGetDb_().getSheetByName(AGF_AUTH_CFG.SHEETS.USERS);
    var appsColumn = AGF_USERS_HEADERS.indexOf('allowed_apps_json') + 1;
    var changed = [];

    users.forEach(function(user) {
      var username = agfNormalizeUsername_(user.username);
      var shouldHave = expected.withAccess.indexOf(username) >= 0;
      var shouldNotHave = expected.withoutAccess.indexOf(username) >= 0;

      if (!shouldHave && !shouldNotHave) return;

      var apps = agfEffectiveAppsForUser_(user).slice();
      var before = JSON.stringify(apps);

      if (shouldHave && apps.indexOf('caixa') < 0) {
        apps.push('caixa');
      }

      if (shouldNotHave) {
        apps = apps.filter(function(app) {
          return app !== 'caixa';
        });
      }

      apps = agfSanitizeAppsForRole_(apps, user.role, false);
      var after = JSON.stringify(apps);

      if (before === after) return;

      sh.getRange(user._row, appsColumn).setValue(after);
      var revoked = agfRevokeUserSessionsInternal_(username);

      agfLog_(
        'CAIXA_ACCESS_MIGRATED',
        username,
        'caixa=' + (apps.indexOf('caixa') >= 0) +
        ';sessionsRevoked=' + revoked
      );

      changed.push({
        username:username,
        caixa:apps.indexOf('caixa') >= 0,
        sessionsRevoked:revoked
      });
    });

    CacheService.getScriptCache().remove('users_all');

    return {
      ok:true,
      changed:changed,
      audit:auditarAcessoCaixaBalcaoV2()
    };
  } finally {
    lock.releaseLock();
  }
}
