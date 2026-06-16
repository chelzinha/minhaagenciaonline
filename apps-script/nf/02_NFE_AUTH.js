/** AGF NFE PDF EXTRACTOR — 02_NFE_AUTH.gs */

function nfeValidateCaller_(body) {
  var out = { ok: true, method: 'none', client: null, warning: '' };
  var sessionToken = nfeSanitize_(body.sessionToken);
  var mainUrl = nfeSanitize_(NFE_CFG.AUTH.MAIN_APP_GAS_URL);

  // Caminho principal: valida a sessão no Web App atual.
  // O /app usa action=me. O portal /superfrete usa sfClientDashboard.
  // Aceitamos apenas actions de leitura previamente autorizadas.
  var allowedSessionActions = { me: true, sfClientDashboard: true, sfAdminMe: true };
  var requestedSessionAction = nfeSanitize_(body.sessionAction || '');
  var portalSessionAction = nfeSanitize_(body.portal) === 'superfrete' ? 'sfClientDashboard' : (NFE_CFG.AUTH.SESSION_ACTION || 'me');
  var sessionAction = allowedSessionActions[requestedSessionAction] ? requestedSessionAction : portalSessionAction;
  if (!allowedSessionActions[sessionAction]) sessionAction = 'me';

  if (mainUrl && sessionToken) {
    try {
      var resp = UrlFetchApp.fetch(mainUrl, {
        method: 'post',
        contentType: 'text/plain;charset=utf-8',
        payload: JSON.stringify({
          action: sessionAction,
          sessionToken: sessionToken
        }),
        muteHttpExceptions: true
      });
      var code = resp.getResponseCode();
      var json = nfeSafeJsonParse_(resp.getContentText());
      if (code >= 200 && code < 300 && json && json.ok !== false) {
        out.method = 'main_app_session';
        out.client = json.data ? (json.data.client || json.data.cliente || null) : null;
        return out;
      }
      throw new Error((json && json.error) || ('HTTP ' + code));
    } catch (e) {
      throw new Error('Sessão do app inválida ou expirada. Faça login novamente. Detalhe: ' + e.message);
    }
  }

  // Fallback opcional: secret salvo em Script Properties.
  var expectedSecret = '';
  try {
    expectedSecret = PropertiesService.getScriptProperties().getProperty(NFE_CFG.AUTH.SECRET_PROP_NAME) || '';
  } catch (e2) {}

  if (expectedSecret) {
    var provided = nfeSanitize_(body.apiKey || body.sharedSecret || body.secret);
    if (provided !== expectedSecret) {
      throw new Error('Acesso não autorizado ao extrator de NF-e.');
    }
    out.method = 'script_property_secret';
    return out;
  }

  if (NFE_CFG.AUTH.ALLOW_WITHOUT_AUTH_WHEN_UNCONFIGURED === true) {
    out.method = 'auth_disabled_for_setup';
    out.warning = 'Autenticação ainda não configurada. Configure MAIN_APP_GAS_URL ou NFE_API_SECRET antes de produção.';
    return out;
  }

  throw new Error('Autenticação do extrator não configurada. Configure MAIN_APP_GAS_URL ou NFE_API_SECRET.');
}
