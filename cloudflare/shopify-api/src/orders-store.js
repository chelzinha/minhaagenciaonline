// Conector Shopify - persistência de pedidos no D1
// Responsável por: query de sincronização, normalização, status AGF e leitura local.
// Sem dependência de request/sessão: index.js valida acesso antes de chamar.

// ------------------------------------------------------------ CFG

export const SYNC_PAGE_SIZE = 20;          // custo GraphQL ~600 pts por página
export const SYNC_MAX_PAGES = 5;           // por chamada; o frontend repete enquanto houver mais
export const SYNC_TIME_BUDGET_MS = 20000;
export const SYNC_LOCK_SECONDS = 90;
export const SYNC_WINDOW_DAYS = 60;        // limite da Shopify sem read_all_orders
export const SYNC_OVERLAP_MS = 2 * 60 * 1000;

export const AGF_STATUS = Object.freeze({
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
  AGUARDANDO_XML: 'AGUARDANDO_XML',
  DADOS_INCOMPLETOS: 'DADOS_INCOMPLETOS',
  XML_VINCULADO: 'XML_VINCULADO',
  FISCAL_COM_ERRO: 'FISCAL_COM_ERRO',
  PRONTO_PARA_EMITIR: 'PRONTO_PARA_EMITIR',
  EMITINDO: 'EMITINDO',
  ETIQUETA_EMITIDA: 'ETIQUETA_EMITIDA',
  RASTREIO_PENDENTE: 'RASTREIO_PENDENTE',
  RASTREIO_SINCRONIZADO: 'RASTREIO_SINCRONIZADO',
  ERRO_RASTREIO: 'ERRO_RASTREIO',
  CANCELADO: 'CANCELADO',
  SEM_ENVIO: 'SEM_ENVIO',
  ENVIADO_FORA_AGF: 'ENVIADO_FORA_AGF'
});

// Status que a sincronização nunca altera: já existe postagem/etiqueta.
const LOCKED_STATUSES = new Set([
  AGF_STATUS.EMITINDO,
  AGF_STATUS.ETIQUETA_EMITIDA,
  AGF_STATUS.RASTREIO_PENDENTE,
  AGF_STATUS.RASTREIO_SINCRONIZADO,
  AGF_STATUS.ERRO_RASTREIO
]);

// Status de progresso fiscal: mantidos enquanto o pedido continuar elegível.
const FISCAL_PROGRESS_STATUSES = new Set([
  AGF_STATUS.XML_VINCULADO,
  AGF_STATUS.FISCAL_COM_ERRO,
  AGF_STATUS.PRONTO_PARA_EMITIR
]);

const PAID_STATUSES = new Set(['PAID', 'PARTIALLY_REFUNDED']);
const VOID_STATUSES = new Set(['REFUNDED', 'VOIDED']);

export const SYNC_ORDERS_QUERY = `
  query SyncOrders($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, sortKey: UPDATED_AT, query: $query) {
      nodes {
        id
        legacyResourceId
        name
        createdAt
        updatedAt
        processedAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        requiresShipping
        currentTotalWeight
        email
        phone
        customAttributes { key value }
        localizedFields(first: 5) {
          edges { node { countryCode purpose title value } }
        }
        shippingAddress {
          name firstName lastName company
          address1 address2 city province provinceCode zip countryCodeV2 phone
        }
        shippingLine { title code source }
        totalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 25) {
          nodes {
            id name sku quantity currentQuantity requiresShipping
            originalUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// ------------------------------------------------------------ helpers

function clean(value) {
  const text = String(value == null ? '' : value).trim();
  return text || null;
}

function digits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

export function normalizeOrderKey(orderName) {
  return String(orderName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ------------------------------------------------------------ normalização

export function normalizeSyncOrder(node, findDocument) {
  const address = node.shippingAddress || null;
  const document = findDocument(node.localizedFields, node.customAttributes);
  const money = node.totalPriceSet?.shopMoney || null;
  const items = (node.lineItems?.nodes || []).map((item) => ({
    id: item.id,
    name: item.name || null,
    sku: clean(item.sku),
    quantity: Number(item.quantity || 0),
    currentQuantity: Number(item.currentQuantity ?? item.quantity ?? 0),
    requiresShipping: Boolean(item.requiresShipping),
    unitPrice: item.originalUnitPriceSet?.shopMoney || null
  }));

  return {
    order_gid: node.id,
    legacy_order_id: clean(node.legacyResourceId),
    order_name: clean(node.name) || node.id,
    order_key: normalizeOrderKey(node.name),
    shopify_created_at: clean(node.createdAt),
    shopify_updated_at: clean(node.updatedAt),
    processed_at: clean(node.processedAt),
    cancelled_at: clean(node.cancelledAt),
    financial_status: clean(node.displayFinancialStatus),
    fulfillment_status: clean(node.displayFulfillmentStatus),
    requires_shipping: node.requiresShipping === false ? 0 : 1,
    currency: clean(money?.currencyCode),
    total_amount: toNumber(money?.amount),
    recipient_name: clean(address?.name) || clean([address?.firstName, address?.lastName].filter(Boolean).join(' ')),
    recipient_document: document?.digits || null,
    recipient_document_type: document?.type || null,
    recipient_document_source: document?.source || null,
    recipient_email: clean(node.email),
    recipient_phone: clean(address?.phone) || clean(node.phone),
    company: clean(address?.company),
    address1: clean(address?.address1),
    address2: clean(address?.address2),
    city: clean(address?.city),
    province_code: clean(address?.provinceCode) || clean(address?.province),
    postal_code: digits(address?.zip) || null,
    country_code: clean(address?.countryCodeV2),
    shipping_title: clean(node.shippingLine?.title),
    shipping_code: clean(node.shippingLine?.code),
    shipping_source: clean(node.shippingLine?.source),
    weight_grams: Math.round(Number(node.currentTotalWeight || 0)) || null,
    items_count: items.reduce((sum, item) => sum + (item.currentQuantity || 0), 0),
    items_json: JSON.stringify(items)
  };
}

// ------------------------------------------------------------ status AGF

export function missingShippingData(order) {
  const missing = [];
  if (!order.recipient_name) missing.push('nome do destinatário');
  if (!order.address1) missing.push('endereço');
  if (!order.city) missing.push('cidade');
  if (!order.province_code) missing.push('UF');
  if (!order.postal_code || order.postal_code.length !== 8) missing.push('CEP válido');
  if (order.country_code && order.country_code !== 'BR') missing.push('endereço no Brasil');
  const doc = order.recipient_document || '';
  if (doc.length !== 11 && doc.length !== 14) missing.push('CPF/CNPJ');
  return missing;
}

export function baseAgfStatus(order) {
  if (order.cancelled_at) {
    return { status: AGF_STATUS.CANCELADO, reason: 'Pedido cancelado na Shopify.' };
  }
  if (VOID_STATUSES.has(order.financial_status)) {
    return { status: AGF_STATUS.CANCELADO, reason: 'Pagamento estornado ou anulado na Shopify.' };
  }
  if (!order.requires_shipping) {
    return { status: AGF_STATUS.SEM_ENVIO, reason: 'Pedido sem item que exija envio.' };
  }
  if (order.fulfillment_status === 'FULFILLED') {
    return { status: AGF_STATUS.ENVIADO_FORA_AGF, reason: 'Pedido já marcado como enviado na Shopify.' };
  }
  if (!PAID_STATUSES.has(order.financial_status)) {
    return {
      status: AGF_STATUS.AGUARDANDO_PAGAMENTO,
      reason: 'Pagamento na Shopify: ' + (order.financial_status || 'não informado') + '.'
    };
  }
  const missing = missingShippingData(order);
  if (missing.length) {
    return { status: AGF_STATUS.DADOS_INCOMPLETOS, reason: 'Falta: ' + missing.join(', ') + '.' };
  }
  return { status: AGF_STATUS.AGUARDANDO_XML, reason: null };
}

export function mergeAgfStatus(current, base) {
  if (!current) return { status: base.status, reason: base.reason, alert: null };

  if (LOCKED_STATUSES.has(current.agf_status)) {
    const alert = base.status === AGF_STATUS.CANCELADO
      ? 'Pedido cancelado na Shopify depois da emissão. Verificar cancelamento da postagem.'
      : (current.alert_message || null);
    return { status: current.agf_status, reason: current.status_reason || null, alert };
  }

  // A etapa fiscal recalcula o próprio status; aqui só se preserva o progresso
  // enquanto a Shopify continuar dizendo que o pedido está apto.
  if (FISCAL_PROGRESS_STATUSES.has(current.agf_status) && base.status === AGF_STATUS.AGUARDANDO_XML) {
    return { status: current.agf_status, reason: current.status_reason || null, alert: null };
  }

  return { status: base.status, reason: base.reason, alert: null };
}

// ------------------------------------------------------------ gravação

const ORDER_COLUMNS = [
  'order_gid', 'legacy_order_id', 'order_name', 'order_key',
  'shopify_created_at', 'shopify_updated_at', 'processed_at', 'cancelled_at',
  'financial_status', 'fulfillment_status', 'requires_shipping', 'currency', 'total_amount',
  'recipient_name', 'recipient_document', 'recipient_document_type', 'recipient_document_source',
  'recipient_email', 'recipient_phone', 'company', 'address1', 'address2', 'city',
  'province_code', 'postal_code', 'country_code',
  'shipping_title', 'shipping_code', 'shipping_source', 'weight_grams', 'items_count', 'items_json',
  'agf_status', 'status_reason', 'alert_message'
];

// Uma única instrução por página (json_each): poucas queries por invocação do Worker.
const UPSERT_ORDERS_SQL = `
  INSERT INTO shopify_orders (shop_domain, customer_id, ${ORDER_COLUMNS.join(', ')})
  SELECT ?1, ?2, ${ORDER_COLUMNS.map((col) => `json_extract(value, '$.${col}')`).join(', ')}
    FROM json_each(?3)
   WHERE true
  ON CONFLICT(shop_domain, order_gid) DO UPDATE SET
    customer_id = excluded.customer_id,
    ${ORDER_COLUMNS.filter((col) => col !== 'order_gid').map((col) => `${col} = excluded.${col}`).join(',\n    ')},
    -- CEP mudou na Shopify: descarta o bairro obtido pelo CEP antigo (o manual é mantido).
    district = CASE WHEN excluded.postal_code IS NOT shopify_orders.postal_code
                     AND COALESCE(shopify_orders.district_source, '') <> 'MANUAL'
                    THEN NULL ELSE shopify_orders.district END,
    district_source = CASE WHEN excluded.postal_code IS NOT shopify_orders.postal_code
                            AND COALESCE(shopify_orders.district_source, '') <> 'MANUAL'
                           THEN NULL ELSE shopify_orders.district_source END,
    cep_checked_at = CASE WHEN excluded.postal_code IS NOT shopify_orders.postal_code
                          THEN NULL ELSE shopify_orders.cep_checked_at END,
    synced_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE shopify_orders.shopify_updated_at IS NULL
     OR excluded.shopify_updated_at >= shopify_orders.shopify_updated_at
`;

export async function persistOrders(env, shop, customerId, orders) {
  if (!orders.length) return { inserted: 0, updated: 0 };

  const ids = JSON.stringify(orders.map((order) => order.order_gid));
  const existing = await env.DB.prepare(
    `SELECT order_gid, agf_status, status_reason, alert_message
       FROM shopify_orders
      WHERE shop_domain = ?1
        AND order_gid IN (SELECT value FROM json_each(?2))`
  ).bind(shop, ids).all();

  const currentById = new Map((existing.results || []).map((row) => [row.order_gid, row]));

  const rows = orders.map((order) => {
    const merged = mergeAgfStatus(currentById.get(order.order_gid), baseAgfStatus(order));
    return Object.assign({}, order, {
      agf_status: merged.status,
      status_reason: merged.reason,
      alert_message: merged.alert
    });
  });

  await env.DB.prepare(UPSERT_ORDERS_SQL).bind(shop, customerId, JSON.stringify(rows)).run();

  const inserted = rows.filter((row) => !currentById.has(row.order_gid)).length;
  return { inserted, updated: rows.length - inserted };
}

// ------------------------------------------------------------ trava de sincronização

export async function acquireSyncLock(env, shop, lockId) {
  const now = new Date();
  const until = new Date(now.getTime() + SYNC_LOCK_SECONDS * 1000).toISOString();
  const [, result] = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO shopify_sync_state (shop_domain) VALUES (?)').bind(shop),
    env.DB.prepare(
      `UPDATE shopify_sync_state
          SET sync_lock_id = ?1, sync_lock_until = ?2, updated_at = CURRENT_TIMESTAMP
        WHERE shop_domain = ?3
          AND (sync_lock_until IS NULL OR sync_lock_until < ?4)`
    ).bind(lockId, until, shop, now.toISOString())
  ]);
  return Number(result?.meta?.changes || 0) === 1;
}

export async function finishSync(env, shop, lockId, lastSyncAt, resultSummary) {
  const sets = ['sync_lock_id = NULL', 'sync_lock_until = NULL', 'updated_at = CURRENT_TIMESTAMP'];
  const binds = [];
  if (lastSyncAt) {
    sets.push('last_orders_sync_at = ?');
    binds.push(lastSyncAt);
  }
  if (resultSummary) {
    sets.push('last_sync_result = ?');
    binds.push(JSON.stringify(resultSummary));
  }
  binds.push(shop, lockId);
  await env.DB.prepare(
    `UPDATE shopify_sync_state SET ${sets.join(', ')} WHERE shop_domain = ? AND sync_lock_id = ?`
  ).bind(...binds).run();
}

export async function readSyncState(env, shop) {
  return env.DB.prepare(
    `SELECT last_orders_sync_at, last_sync_result, sync_lock_until
       FROM shopify_sync_state WHERE shop_domain = ?`
  ).bind(shop).first();
}

export function syncStartIso(state, fullResync) {
  const floor = new Date(Date.now() - SYNC_WINDOW_DAYS * 86400000);
  const last = !fullResync && state?.last_orders_sync_at ? new Date(state.last_orders_sync_at) : null;
  const since = last && !Number.isNaN(last.getTime()) && last > floor
    ? new Date(last.getTime() - SYNC_OVERLAP_MS)
    : floor;
  return since.toISOString();
}

// Espera necessária antes da próxima página, a partir do custo informado pela Shopify.
export function throttleWaitMs(extensions) {
  const cost = extensions?.cost;
  const status = cost?.throttleStatus;
  if (!cost || !status) return 0;
  const needed = Number(cost.requestedQueryCost || cost.actualQueryCost || 0) * 1.1;
  const available = Number(status.currentlyAvailable || 0);
  const restore = Number(status.restoreRate || 0);
  if (available >= needed || restore <= 0) return 0;
  return Math.ceil(((needed - available) / restore) * 1000);
}

// ------------------------------------------------------------ leitura local

function parseItems(text) {
  try {
    const parsed = JSON.parse(text || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapLocalOrder(row) {
  return {
    id: row.order_gid,
    legacyResourceId: row.legacy_order_id,
    name: row.order_name,
    createdAt: row.shopify_created_at,
    updatedAt: row.shopify_updated_at,
    financialStatus: row.financial_status,
    fulfillmentStatus: row.fulfillment_status,
    total: row.total_amount == null ? null : { amount: String(row.total_amount), currencyCode: row.currency || 'BRL' },
    recipientName: row.recipient_name,
    city: row.city,
    provinceCode: row.province_code,
    shippingTitle: row.shipping_title,
    agfStatus: row.agf_status,
    statusReason: row.status_reason,
    alert: row.alert_message,
    syncedAt: row.synced_at,
    lineItems: parseItems(row.items_json).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.currentQuantity ?? item.quantity,
      sku: item.sku,
      unitPrice: item.unitPrice
    }))
  };
}

export async function listLocalOrders(env, shop, filters) {
  const where = ['shop_domain = ?'];
  const binds = [shop];

  if (filters.status) {
    where.push('agf_status = ?');
    binds.push(filters.status);
  }
  if (filters.search) {
    const key = normalizeOrderKey(filters.search);
    const text = '%' + filters.search.toLowerCase() + '%';
    if (key) {
      where.push('(order_key LIKE ? OR lower(recipient_name) LIKE ?)');
      binds.push('%' + key + '%', text);
    } else {
      where.push('lower(recipient_name) LIKE ?');
      binds.push(text);
    }
  }

  const [page, counts, total] = await env.DB.batch([
    env.DB.prepare(
      `SELECT * FROM shopify_orders
        WHERE ${where.join(' AND ')}
        ORDER BY shopify_created_at DESC
        LIMIT ? OFFSET ?`
    ).bind(...binds, filters.limit, filters.offset),
    env.DB.prepare(
      `SELECT agf_status, COUNT(*) AS total FROM shopify_orders WHERE shop_domain = ? GROUP BY agf_status`
    ).bind(shop),
    env.DB.prepare(
      `SELECT COUNT(*) AS total FROM shopify_orders WHERE ${where.join(' AND ')}`
    ).bind(...binds)
  ]);

  const statusCounts = {};
  for (const row of counts.results || []) statusCounts[row.agf_status] = Number(row.total || 0);

  return {
    orders: (page.results || []).map(mapLocalOrder),
    statusCounts,
    total: Number(total.results?.[0]?.total || 0)
  };
}
