-- ============================================================
-- ATENDE - CADASTRO PORTAL VINDO DO CONSOLIDADOR
--
-- O RAW do Atende permanece imutavel.
-- O Consolidador e armazenado em RAW proprio e a ligacao com o Atende
-- fica em atende_cliente_portal, permitindo recalculo diario e D+N.
-- ============================================================

CREATE TABLE IF NOT EXISTS consolidador_importacoes (
  import_key TEXT PRIMARY KEY,
  arquivo_id TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_modificado_em TEXT,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  recebidas INTEGER NOT NULL DEFAULT 0,
  gravadas INTEGER NOT NULL DEFAULT 0,
  invalidas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  concluido_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_cons_import_arquivo
  ON consolidador_importacoes(arquivo_id, arquivo_hash);

CREATE TABLE IF NOT EXISTS consolidador_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_key TEXT NOT NULL,
  arquivo_id TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  numero_linha INTEGER NOT NULL,

  venda_pp TEXT,
  objeto TEXT,
  ect TEXT,
  cliente TEXT,
  data TEXT,
  qtd TEXT,
  valor TEXT,
  ad TEXT,
  cx_at TEXT,
  contrato TEXT,
  cartao TEXT,
  destinatario TEXT,
  raw_json TEXT NOT NULL,

  venda_pp_norm TEXT,
  objeto_norm TEXT,
  ect_norm TEXT,
  cliente_norm TEXT,
  data_iso TEXT,
  qtd_num REAL,
  valor_num REAL,
  caixa TEXT,
  importado_em TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(import_key, numero_linha)
);
CREATE INDEX IF NOT EXISTS idx_cons_raw_import_key ON consolidador_raw(import_key);
CREATE INDEX IF NOT EXISTS idx_cons_raw_venda_pp ON consolidador_raw(venda_pp_norm);
CREATE INDEX IF NOT EXISTS idx_cons_raw_objeto ON consolidador_raw(objeto_norm);
CREATE INDEX IF NOT EXISTS idx_cons_raw_data ON consolidador_raw(data_iso);
CREATE INDEX IF NOT EXISTS idx_cons_raw_ect ON consolidador_raw(ect_norm);
CREATE INDEX IF NOT EXISTS idx_cons_raw_cliente ON consolidador_raw(cliente_norm);
CREATE INDEX IF NOT EXISTS idx_cons_raw_caixa ON consolidador_raw(caixa);

CREATE TABLE IF NOT EXISTS atende_cliente_portal (
  raw_id INTEGER PRIMARY KEY,
  source_key TEXT NOT NULL,
  cliente_portal TEXT NOT NULL,
  cliente_portal_norm TEXT NOT NULL,
  origem_cliente TEXT NOT NULL CHECK (origem_cliente IN ('SRO','ATENDIMENTO')),
  confianca TEXT NOT NULL CHECK (confianca IN ('ALTA','MEDIA')),
  cx_at TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (raw_id) REFERENCES atende_postagens_raw(id)
);
CREATE INDEX IF NOT EXISTS idx_cliente_portal_source ON atende_cliente_portal(source_key);
CREATE INDEX IF NOT EXISTS idx_cliente_portal_nome ON atende_cliente_portal(cliente_portal_norm);
CREATE INDEX IF NOT EXISTS idx_cliente_portal_origem ON atende_cliente_portal(origem_cliente);
