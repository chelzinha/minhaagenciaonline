/** Endpoint JSON do Portal Interno. */
function doGet(e) {
  return agfHandleRequest_(e);
}

function doPost(e) {
  return agfHandleRequest_(e);
}

function agfHandleRequest_(e) {
  try {
    const request = agfParseRequest_(e);
    const action = String(request.action || 'health');
    switch (action) {
      case 'health':
        return agfJson_({ ok: true, app: AGF_AUTH_CFG.APP_NAME, timestamp: agfNowIso_() });
      case 'login':
        return agfJson_(agfLogin_(request));
      case 'validate':
        return agfJson_(agfValidate_(request.token));
      case 'logout':
        return agfJson_(agfLogout_(request.token));
      case 'changeMyPassword':
        return agfJson_(agfChangeMyPassword_(request.token, request));
      case 'getMyAvatar':
        return agfJson_(agfGetMyAvatar_(request.token));
      case 'uploadMyAvatar':
        return agfJson_(agfUploadMyAvatar_(request.token, request));
      case 'getUiConfig':
        return agfJson_(agfGetUiConfig_());
      case 'saveUiConfig':
        return agfJson_(agfSaveUiConfig_(request.token, request.config));
      case 'adminListUsers':
        return agfJson_(agfListUsersForAdmin_(request.token));
      case 'adminSaveUser':
        return agfJson_(agfSaveUserFromAdmin_(request.token, request));
      case 'adminRevokeSessions':
        return agfJson_(agfRevokeUserSessionsFromAdmin_(request.token, request.username));
      case 'adminPurgeSessions':
        return agfJson_(agfPurgeSessionsFromAdmin_(request.token));
      case 'adminSyncCrmResponsaveis':
        return agfJson_(agfSyncCrmResponsaveisFromAdmin_(request.token));
      default:
        throw new Error('Ação inválida: ' + action);
    }
  } catch (err) {
    console.error('[AGF_AUTH]', err && err.stack ? err.stack : err);
    return agfJson_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}
