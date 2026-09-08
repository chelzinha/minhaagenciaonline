PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS caixa_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caixa_units (
  unit_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cost_center_name TEXT NOT NULL DEFAULT '',
  cost_center_ca_id TEXT NOT NULL DEFAULT '',
  default_revenue_contact_ca_id TEXT NOT NULL DEFAULT '',
  default_expense_contact_ca_id TEXT NOT NULL DEFAULT '',
  drive_root_folder_id TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caixa_user_units (
  username TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  can_revenue INTEGER NOT NULL DEFAULT 0,
  can_expense INTEGER NOT NULL DEFAULT 0,
  can_close INTEGER NOT NULL DEFAULT 0,
  can_withdraw INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (username, unit_id)
);

CREATE TABLE IF NOT EXISTS caixa_accounts (
  account_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name_front TEXT NOT NULL,
  name_conta_azul TEXT NOT NULL DEFAULT '',
  conta_azul_id TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, unit_id)
);

CREATE TABLE IF NOT EXISTS caixa_payments (
  payment_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name_front TEXT NOT NULL,
  conta_azul_method TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL DEFAULT '',
  allow_revenue INTEGER NOT NULL DEFAULT 0,
  allow_expense INTEGER NOT NULL DEFAULT 0,
  allow_batch INTEGER NOT NULL DEFAULT 0,
  generate_pix INTEGER NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pix_mode TEXT NOT NULL DEFAULT '',
  pix_key TEXT NOT NULL DEFAULT '',
  pix_receiver_name TEXT NOT NULL DEFAULT '',
  pix_city TEXT NOT NULL DEFAULT '',
  pix_active INTEGER NOT NULL DEFAULT 0,
  pix_share_message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id, unit_id)
);

CREATE TABLE IF NOT EXISTS caixa_revenue_types (
  revenue_type_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name_front TEXT NOT NULL,
  description_default TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL DEFAULT '',
  category_ca_id TEXT NOT NULL DEFAULT '',
  allow_attendance INTEGER NOT NULL DEFAULT 0,
  allow_single INTEGER NOT NULL DEFAULT 0,
  allow_batch INTEGER NOT NULL DEFAULT 0,
  require_client INTEGER NOT NULL DEFAULT 0,
  require_description INTEGER NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (revenue_type_id, unit_id)
);

CREATE TABLE IF NOT EXISTS caixa_expense_types (
  expense_type_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name_front TEXT NOT NULL,
  description_default TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL DEFAULT '',
  category_ca_id TEXT NOT NULL DEFAULT '',
  default_payment_id TEXT NOT NULL DEFAULT '',
  default_account_id TEXT NOT NULL DEFAULT '',
  allow_batch INTEGER NOT NULL DEFAULT 0,
  require_description INTEGER NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (expense_type_id, unit_id)
);

CREATE TABLE IF NOT EXISTS caixa_clients (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caixa_entries (
  entry_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL DEFAULT '',
  batch_index INTEGER NOT NULL DEFAULT 1,
  date_iso TEXT NOT NULL,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL,
  mode TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  operator_id TEXT NOT NULL DEFAULT '',
  operator_name TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_source TEXT NOT NULL DEFAULT '',
  object_count INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  payment_id TEXT NOT NULL DEFAULT '',
  payment_name TEXT NOT NULL DEFAULT '',
  payment_ca_method TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL DEFAULT '',
  account_ca_id_snapshot TEXT NOT NULL DEFAULT '',
  account_ca_name_snapshot TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL DEFAULT '',
  category_ca_id_snapshot TEXT NOT NULL DEFAULT '',
  category_ca_name_snapshot TEXT NOT NULL DEFAULT '',
  cost_center_ca_id_snapshot TEXT NOT NULL DEFAULT '',
  cost_center_ca_name_snapshot TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  pix_status TEXT NOT NULL DEFAULT '',
  pix_txid TEXT NOT NULL DEFAULT '',
  pix_e2eid TEXT NOT NULL DEFAULT '',
  pix_received_at TEXT NOT NULL DEFAULT '',
  pix_provider TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ATIVO',
  closure_id TEXT NOT NULL DEFAULT '',
  conta_azul_status TEXT NOT NULL DEFAULT 'NAO_ENVIADO',
  conta_azul_protocol TEXT NOT NULL DEFAULT '',
  conta_azul_last_error TEXT NOT NULL DEFAULT '',
  conta_azul_attempts INTEGER NOT NULL DEFAULT 0,
  conta_azul_synced_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT NOT NULL DEFAULT '',
  deleted_by TEXT NOT NULL DEFAULT '',
  deleted_by_name TEXT NOT NULL DEFAULT '',
  delete_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caixa_daily_balances (
  unit_id TEXT NOT NULL,
  date_iso TEXT NOT NULL,
  opening_cash_cents INTEGER NOT NULL DEFAULT 0,
  opening_source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  expected_cash_cents INTEGER NOT NULL DEFAULT 0,
  counted_cash_cents INTEGER NOT NULL DEFAULT 0,
  difference_cents INTEGER NOT NULL DEFAULT 0,
  closing_withdrawal_cents INTEGER NOT NULL DEFAULT 0,
  carryover_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ABERTO',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (unit_id, date_iso)
);

CREATE TABLE IF NOT EXISTS caixa_withdrawals (
  withdrawal_id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  created_at TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  operator_id TEXT NOT NULL DEFAULT '',
  operator_name TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  destination TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  balance_before_cents INTEGER NOT NULL DEFAULT 0,
  balance_after_cents INTEGER NOT NULL DEFAULT 0,
  declaration_version TEXT NOT NULL DEFAULT '',
  declaration_text TEXT NOT NULL DEFAULT '',
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT NOT NULL DEFAULT '',
  closure_id TEXT NOT NULL DEFAULT '',
  pdf_status TEXT NOT NULL DEFAULT '',
  pdf_file_id TEXT NOT NULL DEFAULT '',
  pdf_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caixa_closures (
  closure_id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  unit_name TEXT NOT NULL DEFAULT '',
  cost_center_ca_id_snapshot TEXT NOT NULL DEFAULT '',
  cost_center_ca_name_snapshot TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'FECHADO',
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  expense_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  payment_totals_json TEXT NOT NULL DEFAULT '{}',
  payment_counts_json TEXT NOT NULL DEFAULT '{}',
  opening_cash_cents INTEGER NOT NULL DEFAULT 0,
  cash_revenue_cents INTEGER NOT NULL DEFAULT 0,
  cash_expense_cents INTEGER NOT NULL DEFAULT 0,
  withdrawals_before_close_cents INTEGER NOT NULL DEFAULT 0,
  expected_cash_cents INTEGER NOT NULL DEFAULT 0,
  counted_cash_cents INTEGER NOT NULL DEFAULT 0,
  difference_cents INTEGER NOT NULL DEFAULT 0,
  closing_withdrawal_cents INTEGER NOT NULL DEFAULT 0,
  carryover_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  declaration_version TEXT NOT NULL DEFAULT '',
  declaration_text TEXT NOT NULL DEFAULT '',
  declaration_confirmed INTEGER NOT NULL DEFAULT 0,
  declaration_confirmed_at TEXT NOT NULL DEFAULT '',
  pdf_status TEXT NOT NULL DEFAULT '',
  pdf_file_id TEXT NOT NULL DEFAULT '',
  pdf_url TEXT NOT NULL DEFAULT '',
  conta_azul_status TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caixa_closure_supplements (
  supplement_id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  unit_name TEXT NOT NULL DEFAULT '',
  base_closure_id TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'FECHADO',
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  expense_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  cash_revenue_cents INTEGER NOT NULL DEFAULT 0,
  cash_expense_cents INTEGER NOT NULL DEFAULT 0,
  expected_cash_cents INTEGER NOT NULL DEFAULT 0,
  counted_cash_cents INTEGER NOT NULL DEFAULT 0,
  closing_withdrawal_cents INTEGER NOT NULL DEFAULT 0,
  carryover_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  entry_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caixa_conta_azul_queue (
  queue_id TEXT PRIMARY KEY,
  closure_id TEXT NOT NULL DEFAULT '',
  entry_id TEXT NOT NULL DEFAULT '',
  unit_id TEXT NOT NULL DEFAULT '',
  entry_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  attempts INTEGER NOT NULL DEFAULT 0,
  protocol TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_caixa_user_units_username_active
  ON caixa_user_units(username, active);
CREATE INDEX IF NOT EXISTS idx_caixa_accounts_unit_active_sort
  ON caixa_accounts(unit_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_caixa_payments_unit_active_sort
  ON caixa_payments(unit_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_caixa_revenue_types_unit_active_sort
  ON caixa_revenue_types(unit_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_caixa_expense_types_unit_active_sort
  ON caixa_expense_types(unit_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_caixa_clients_normalized_active
  ON caixa_clients(normalized_name, active);
CREATE INDEX IF NOT EXISTS idx_caixa_entries_unit_date_status
  ON caixa_entries(unit_id, date_iso, status);
CREATE INDEX IF NOT EXISTS idx_caixa_entries_unit_pix_status
  ON caixa_entries(unit_id, pix_status, status, date_iso);
CREATE UNIQUE INDEX IF NOT EXISTS idx_caixa_entries_pix_txid
  ON caixa_entries(pix_txid)
  WHERE pix_txid <> '';
CREATE INDEX IF NOT EXISTS idx_caixa_entries_closure
  ON caixa_entries(closure_id);
CREATE INDEX IF NOT EXISTS idx_caixa_entries_ca_status
  ON caixa_entries(conta_azul_status);
CREATE INDEX IF NOT EXISTS idx_caixa_balances_unit_date
  ON caixa_daily_balances(unit_id, date_iso DESC);
CREATE INDEX IF NOT EXISTS idx_caixa_withdrawals_unit_date
  ON caixa_withdrawals(unit_id, date_iso, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caixa_closures_unit_date
  ON caixa_closures(unit_id, date_iso DESC);
CREATE INDEX IF NOT EXISTS idx_caixa_supplements_unit_date
  ON caixa_closure_supplements(unit_id, date_iso, sequence);
CREATE INDEX IF NOT EXISTS idx_caixa_queue_closure_status
  ON caixa_conta_azul_queue(closure_id, status);

INSERT OR IGNORE INTO caixa_meta(key, value)
VALUES ('schema_version', '1');
