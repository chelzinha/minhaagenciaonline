function exchangeCodeForToken_(code) {
  const cfg = getConfig_();
  if (!cfg.appId || !cfg.clientSecret) {
    throw new Error('App ID ou Client Secret não configurados nas Script Properties.');
  }

  const url = 'https://www.tiendanube.com/apps/authorize/token';
  const payload = {
    client_id: cfg.appId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code: code
  };

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = resp.getResponseCode();
  const body = resp.getContentText();

  if (status < 200 || status >= 300) {
    appendLog_('ERROR', 'oauth.exchange', '', '', 'Falha ao trocar code por token', body);
    throw new Error('Falha OAuth: ' + body);
  }

  return JSON.parse(body);
}

function handleOAuthCallback_(e) {
  const code = (e.parameter && e.parameter.code) || '';
  if (!code) {
    return asHtml_('Callback sem código', 'A Nuvemshop chamou o callback, mas o parâmetro <code>code</code> não veio.');
  }

  try {
    const tokenData = exchangeCodeForToken_(code);
    const existing = getStoreById_(tokenData.user_id) || {};

    upsertStore_({
      USER_ID: tokenData.user_id,
      ACCESS_TOKEN: tokenData.access_token,
      SCOPE: tokenData.scope || '',
      STATUS: 'ACTIVE',
      INSTALLED_AT: existing.INSTALLED_AT || nowIso_(),
      UPDATED_AT: nowIso_(),
      LAST_SYNC_AT: existing.LAST_SYNC_AT || '',
      LAST_SYNC_COUNT: existing.LAST_SYNC_COUNT || '',
      LAST_ERROR: '',
      ID_CRM_REF: existing.ID_CRM_REF || ''
    });

    appendLog_('INFO', 'oauth.callback', tokenData.user_id, '', 'Loja conectada com sucesso', {
      scope: tokenData.scope || ''
    });

    return asHtml_(
      'Loja conectada',
      'A loja <code>' + tokenData.user_id + '</code> foi conectada com sucesso. Agora você já pode registrar webhooks e sincronizar pedidos.'
    );
  } catch (err) {
    appendLog_('ERROR', 'oauth.callback', '', '', err.message, {});
    return asHtml_('Erro no callback', err.message);
  }
}
