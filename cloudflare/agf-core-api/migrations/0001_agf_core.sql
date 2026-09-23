PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED','PROSPECT')),
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  document_type TEXT CHECK (document_type IN ('CNPJ','CPF','OTHER') OR document_type IS NULL),
  document_number TEXT,
  email TEXT,
  phone TEXT,
  postal_code TEXT,
  address_line1 TEXT,
  address_number TEXT,
  address_complement TEXT,
  district TEXT,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'BR',
  notes TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_document
  ON customers(document_type, document_number)
  WHERE document_number IS NOT NULL AND document_number <> '';
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_trade_name ON customers(trade_name);
CREATE INDEX IF NOT EXISTS idx_customers_legal_name ON customers(legal_name);

CREATE TABLE IF NOT EXISTS modules (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (audience IN ('CUSTOMER','INTERNAL','SHARED')),
  route TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_modules_active_order
  ON modules(active, display_order, name);

CREATE TABLE IF NOT EXISTS customer_modules (
  customer_id TEXT NOT NULL,
  module_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','TRIAL','SUSPENDED','DISABLED')),
  activated_at TEXT,
  expires_at TEXT,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, module_code),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (module_code) REFERENCES modules(code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_customer_modules_module
  ON customer_modules(module_code, status);

CREATE TABLE IF NOT EXISTS platform_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  auth_provider TEXT,
  auth_subject TEXT,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','DISABLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_email
  ON platform_users(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_auth_subject
  ON platform_users(auth_provider, auth_subject)
  WHERE auth_subject IS NOT NULL AND auth_subject <> '';

CREATE TABLE IF NOT EXISTS customer_users (
  customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DISABLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, user_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_users_user
  ON customer_users(user_id, status);

CREATE TABLE IF NOT EXISTS customer_integrations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED' CHECK (status IN ('CONNECTED','DISCONNECTED','ERROR','DISABLED')),
  configuration_json TEXT NOT NULL DEFAULT '{}',
  credentials_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_integrations_customer
  ON customer_integrations(customer_id, provider, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_integrations_external
  ON customer_integrations(provider, external_account_id)
  WHERE external_account_id IS NOT NULL AND external_account_id <> '';

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_subject TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON audit_log(actor_subject, created_at DESC);

INSERT OR IGNORE INTO modules
  (code, name, category, audience, route, description, active, display_order)
VALUES
  ('SHOPIFY', 'Conector Shopify', 'SALES_CHANNEL', 'CUSTOMER', '/shopify', 'Integração da loja Shopify com os serviços da Plataforma AGF.', 1, 10),
  ('MINHAS_POSTAGENS', 'Minhas Postagens', 'POSTING', 'CUSTOMER', '/app', 'Emissão e gestão de postagens do cliente.', 1, 20),
  ('NUVEMSHOP', 'Conector Nuvemshop', 'SALES_CHANNEL', 'CUSTOMER', '/nuvem', 'Integração da loja Nuvemshop com os serviços da Plataforma AGF.', 1, 30);
