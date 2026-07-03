function registerDefaultWebhooksForStore_(storeId) {
  const cfg = getConfig_();
  if (!cfg.webappUrl) throw new Error('Configure CONNECTOR_WEBAPP_URL nas Script Properties.');

  const targets = [
    { event: 'order/created', url: cfg.webappUrl + '?route=webhookOrder' },
    { event: 'order/updated', url: cfg.webappUrl + '?route=webhookOrder' },
    { event: 'order/paid', url: cfg.webappUrl + '?route=webhookOrder' }
  ];

  const existing = listWebhooks_(storeId);
  const existingList = Array.isArray(existing) ? existing : (existing.webhooks || []);

  targets.forEach(function(target) {
    const found = existingList.find(function(w) {
      return String(w.event) === target.event && String(w.url) === target.url;
    });
    const webhook = found || createWebhook_(storeId, target.event, target.url);

    upsertWebhookRow_({
      STORE_ID: String(storeId),
      EVENT: target.event,
      WEBHOOK_ID: String(webhook.id || ''),
      URL: target.url,
      STATUS: 'ACTIVE',
      RAW_JSON: stringifySafe_(webhook),
      UPDATED_AT: nowIso_()
    });
  });

  appendLog_('INFO', 'webhook.register', storeId, '', 'Webhooks padrão registrados', targets);
  return { ok: true, registered: targets.length };
}

function registerDefaultWebhooksFirstStore_() {
  const store = getFirstActiveStore_();
  if (!store) throw new Error('Nenhuma loja ativa encontrada.');
  return registerDefaultWebhooksForStore_(store.USER_ID);
}

function handleOrderWebhook_(e) {
  const body = parsePostBody_(e);
  const storeId = body.store_id || body.storeId || '';
  const orderId = body.id || '';

  appendLog_('INFO', 'webhook.order.received', storeId, orderId, 'Webhook recebido', {
    event: body.event || '',
    id: orderId,
    store_id: storeId
  });

  if (!storeId || !orderId) {
    appendLog_('WARN', 'webhook.order.received', storeId, orderId, 'Payload sem store_id ou id', {
      event: body.event || ''
    });
    return asJson_({ ok: true, ignored: true });
  }

  try {
    const result = syncPaidOrderById_(storeId, orderId);
    return asJson_(result);
  } catch (err) {
    appendLog_('ERROR', 'webhook.order.process', storeId, orderId, err.message, {
      event: body.event || '',
      id: orderId,
      store_id: storeId
    });
    return asJson_({ ok: false, error: err.message });
  }
}

function handleLgpdWebhook_(kind, e) {
  const body = parsePostBody_(e);
  appendLog_('INFO', 'lgpd.' + kind, body.store_id || '', '', 'Webhook LGPD recebido', body);
  return asJson_({ ok: true });
}

function runRegisterDefaultWebhooksFirstStore() {
  return registerDefaultWebhooksFirstStore_();
}
