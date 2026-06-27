/**
 * Troca o authorization code por access_token + user_id.
 * Endpoint: POST https://www.tiendanube.com/apps/authorize/token
 */
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

/**
 * Extrai o storeId do tokenData com fallback nos parâmetros da URL.
 * A Nuvemshop retorna o ID em user_id. Fallbacks existem por precaução.
 */
function resolveOAuthStoreId_(tokenData, e) {
  const params = (e && e.parameter) || {};
  return String(
    tokenData.user_id ||
    tokenData.store_id ||
    tokenData.storeId ||
    params.user_id ||
    params.store_id ||
    params.storeId ||
    ''
  ).trim();
}

/**
 * Busca nome e email da loja via GET /{storeId}/store.
 * Chamada APÓS salvar o token, pois nuvemFetch_ precisa do registro em STORES.
 * Retorna { name, email } — ambos podem vir vazios se a API não retornar.
 */
function fetchStoreInfo_(storeId) {
  try {
    const info = nuvemFetch_(storeId, 'get', '/store');
    return {
      name: String(
        (info && (info.name || (Array.isArray(info.name) ? info.name[0] : ''))) || ''
      ).trim(),
      email: String((info && info.email) || '').trim()
    };
  } catch (err) {
    appendLog_('WARN', 'oauth.fetchStoreInfo', storeId, '', 'Não foi possível buscar dados da loja via API', {
      error: err.message || String(err)
    });
    return { name: '', email: '' };
  }
}

/**
 * Callback OAuth principal.
 * Chamado pela Nuvemshop após o cliente autorizar o app na loja dele.
 * URL de entrada: ?code=XYZ ou ?route=oauthCallback&code=XYZ
 */
function handleOAuthCallback_(e) {
  const code = (e.parameter && e.parameter.code) || '';
  if (!code) {
    return asHtml_(
      'Callback sem código',
      'A Nuvemshop chamou o callback, mas o parâmetro <code>code</code> não veio.'
    );
  }

  try {
    // 1. Trocar code por token
    const tokenData = exchangeCodeForToken_(code);
    const storeId = resolveOAuthStoreId_(tokenData, e);

    if (!storeId || storeId === 'undefined' || storeId === 'null') {
      appendLog_('ERROR', 'oauth.callback.storeId', '', '', 'Token recebido sem user_id/store_id. Loja não gravada.', {
        tokenKeys: Object.keys(tokenData || {}),
        scope: tokenData.scope || '',
        hasAccessToken: !!tokenData.access_token
      });
      return asHtml_(
        'Loja não identificada',
        'A autorização retornou um token, mas não retornou o ID da loja. ' +
        'A loja não foi gravada para evitar cadastro inválido. ' +
        'Avise a AGF José Bonifácio para verificar os logs e reinstalar o aplicativo.'
      );
    }

    // 2. Salvar token imediatamente para que nuvemFetch_ consiga chamar a API
    const existing = getStoreById_(storeId) || {};
    upsertStore_({
      USER_ID: storeId,
      STORE_NAME: existing.STORE_NAME || '',
      STORE_EMAIL: existing.STORE_EMAIL || '',
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

    // 3. Buscar nome e email da loja via API (agora que o token já está salvo)
    const storeInfo = fetchStoreInfo_(storeId);

    // 4. Atualizar com nome e email se encontrados
    if (storeInfo.name || storeInfo.email) {
      upsertStore_({
        USER_ID: storeId,
        STORE_NAME: storeInfo.name,
        STORE_EMAIL: storeInfo.email
      });
    }

    const displayName = storeInfo.name || ('Loja #' + storeId);

    appendLog_('INFO', 'oauth.callback', storeId, '', 'Loja conectada com sucesso', {
      storeName: storeInfo.name,
      storeEmail: storeInfo.email,
      scope: tokenData.scope || '',
      hasAccessToken: !!tokenData.access_token
    });

    return asHtml_(
      'Loja conectada',
      'A loja <strong>' + displayName + '</strong> (ID: <code>' + storeId + '</code>) foi conectada com sucesso. ' +
      'A AGF José Bonifácio irá vincular esta loja ao seu cadastro e ativar a sincronização de pedidos em breve.'
    );

  } catch (err) {
    appendLog_('ERROR', 'oauth.callback', '', '', err.message, {
      stack: err && err.stack ? String(err.stack).slice(0, 2000) : ''
    });
    return asHtml_('Erro no callback', err.message);
  }
}
