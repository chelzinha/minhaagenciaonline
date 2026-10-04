-- Gateway Correios AGF
-- Credenciais CWS criptografadas por cliente (customer_id do AGF Core),
-- cache de token e de cotações. Contrato e cartão são cópia do AGF Core.

CREATE TABLE IF NOT EXISTS correios_accounts (
  customer_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL DEFAULT 'PRODUCAO',
  contract_number TEXT,
  posting_card TEXT,
  document_number TEXT,
  core_status TEXT,
  dr_number TEXT,
  origin_cep TEXT,
  services_json TEXT NOT NULL DEFAULT '{}',
  login_enc TEXT,
  access_code_enc TEXT,
  login_hint TEXT,
  check_status TEXT NOT NULL DEFAULT 'PENDING',
  check_message TEXT,
  check_at TEXT,
  token_apis_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS correios_tokens (
  customer_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  posting_card TEXT NOT NULL,
  token_enc TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS correios_quote_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_correios_quote_cache_exp
  ON correios_quote_cache(expires_at);

CREATE TABLE IF NOT EXISTS correios_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT,
  actor TEXT,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_correios_audit_customer
  ON correios_audit(customer_id, created_at DESC);
