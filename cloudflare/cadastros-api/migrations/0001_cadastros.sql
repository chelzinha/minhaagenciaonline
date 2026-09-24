PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL CHECK (length(trim(canonical_name)) > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(canonical_name COLLATE NOCASE);

-- PORTAL se aplica somente a postagens fora dos tres portais compartilhados.
-- SENDER se aplica somente dentro dos tres portais compartilhados.
CREATE TABLE IF NOT EXISTS customer_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('PORTAL','SENDER')),
  normalized_name TEXT NOT NULL CHECK (length(normalized_name) > 0),
  original_name TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('AUTO_PORTAL','MANUAL')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (kind, normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_alias_customer ON customer_aliases(customer_id);

-- Projecao minima por operacao canonica, sem alterar o RAW do Atende.
-- O numero do objeto nao e chave: SROs legitimos podem repetir.
CREATE TABLE IF NOT EXISTS source_postings (
  source_system TEXT NOT NULL DEFAULT 'ATENDE' CHECK (source_system = 'ATENDE'),
  source_id INTEGER NOT NULL,
  portal_name TEXT NOT NULL DEFAULT '',
  portal_norm TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  sender_norm TEXT NOT NULL DEFAULT '',
  local_code TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL DEFAULT '',
  posting_card TEXT NOT NULL DEFAULT '',
  posted_at TEXT NOT NULL DEFAULT '',
  value_amount REAL NOT NULL DEFAULT 0,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  resolution TEXT NOT NULL CHECK (resolution IN ('PORTAL','SENDER_ALIAS','PENDING','OVERRIDE')),
  source_fingerprint TEXT NOT NULL,
  last_seen_pass INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_system, source_id)
);
CREATE INDEX IF NOT EXISTS idx_postings_customer_local ON source_postings(customer_id, local_code, posted_at);
CREATE INDEX IF NOT EXISTS idx_postings_pending ON source_postings(resolution, portal_norm, sender_norm);
CREATE INDEX IF NOT EXISTS idx_postings_sender ON source_postings(sender_norm, resolution);
CREATE INDEX IF NOT EXISTS idx_postings_portal ON source_postings(portal_norm, resolution);
CREATE INDEX IF NOT EXISTS idx_postings_contract ON source_postings(contract_number, posting_card);

-- Vínculos manuais de contrato são conferência, nunca chave automática.
CREATE TABLE IF NOT EXISTS customer_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  contract_number TEXT NOT NULL DEFAULT '',
  posting_card TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (contract_number <> '' OR posting_card <> ''),
  UNIQUE (customer_id, contract_number, posting_card)
);
CREATE INDEX IF NOT EXISTS idx_customer_contracts_number ON customer_contracts(contract_number, posting_card);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  source_system TEXT PRIMARY KEY,
  cursor_id INTEGER NOT NULL DEFAULT 0,
  completed_passes INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO sync_state(source_system) VALUES ('ATENDE');
