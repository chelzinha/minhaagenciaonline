-- Rascunhos da ficha de balcão (substitui a aba BALCAO_RASCUNHOS do Apps Script)
CREATE TABLE IF NOT EXISTS balcao_rascunhos (
  id TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  usuario TEXT,
  cep_destino TEXT,
  servico TEXT,
  total REAL,
  prazo_dias INTEGER,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_balcao_rascunhos_criado ON balcao_rascunhos (criado_em);
