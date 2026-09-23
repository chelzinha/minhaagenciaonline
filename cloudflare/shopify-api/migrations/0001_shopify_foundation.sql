PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shopify_shops (
  shop_domain TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  shop_gid TEXT,
  shop_name TEXT,
  primary_domain TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','UNINSTALLED','SUSPENDED','ERROR')),
  scopes TEXT,
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uninstalled_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shopify_shops_customer
  ON shopify_shops(customer_id, status);

CREATE TABLE IF NOT EXISTS shopify_tokens (
  shop_domain TEXT PRIMARY KEY,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scopes TEXT,
  token_type TEXT NOT NULL DEFAULT 'OFFLINE_EXPIRING',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_domain) REFERENCES shopify_shops(shop_domain) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shopify_oauth_states (
  state TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_lookup
  ON shopify_oauth_states(shop_domain, expires_at, used_at);

CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  id TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  api_version TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','IGNORED','ERROR')),
  payload_json TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_shop
  ON shopify_webhook_events(shop_domain, received_at DESC);

CREATE TABLE IF NOT EXISTS shopify_sync_state (
  shop_domain TEXT PRIMARY KEY,
  orders_cursor TEXT,
  last_orders_sync_at TEXT,
  last_reconciliation_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_domain) REFERENCES shopify_shops(shop_domain) ON DELETE CASCADE
);
