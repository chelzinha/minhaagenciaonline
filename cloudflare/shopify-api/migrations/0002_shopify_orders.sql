-- Conector Shopify - pedidos persistidos no D1
-- Pedidos importados por sincronização manual (e, na próxima etapa, por webhooks).
-- agf_status sem CHECK de propósito: novos status das etapas fiscal/postagem
-- não exigem reconstruir a tabela. A lista válida fica em src/orders-store.js.

CREATE TABLE IF NOT EXISTS shopify_orders (
  shop_domain TEXT NOT NULL,
  order_gid TEXT NOT NULL,
  legacy_order_id TEXT,
  order_name TEXT NOT NULL,
  order_key TEXT NOT NULL,
  customer_id TEXT NOT NULL,

  shopify_created_at TEXT,
  shopify_updated_at TEXT,
  processed_at TEXT,
  cancelled_at TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  requires_shipping INTEGER NOT NULL DEFAULT 1,
  currency TEXT,
  total_amount REAL,

  recipient_name TEXT,
  recipient_document TEXT,
  recipient_document_type TEXT,
  recipient_document_source TEXT,
  recipient_email TEXT,
  recipient_phone TEXT,
  company TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  province_code TEXT,
  postal_code TEXT,
  country_code TEXT,

  shipping_title TEXT,
  shipping_code TEXT,
  shipping_source TEXT,
  weight_grams INTEGER,
  items_count INTEGER NOT NULL DEFAULT 0,
  items_json TEXT,

  agf_status TEXT NOT NULL DEFAULT 'AGUARDANDO_XML',
  status_reason TEXT,
  alert_message TEXT,

  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (shop_domain, order_gid),
  FOREIGN KEY (shop_domain) REFERENCES shopify_shops(shop_domain) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_created
  ON shopify_orders(shop_domain, shopify_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_status
  ON shopify_orders(shop_domain, agf_status, shopify_created_at DESC);

-- Chave usada no pareamento com o XML da NF-e (número do pedido normalizado).
CREATE INDEX IF NOT EXISTS idx_shopify_orders_key
  ON shopify_orders(shop_domain, order_key);

ALTER TABLE shopify_sync_state ADD COLUMN sync_lock_id TEXT;
ALTER TABLE shopify_sync_state ADD COLUMN sync_lock_until TEXT;
ALTER TABLE shopify_sync_state ADD COLUMN last_sync_result TEXT;
