-- ============================================================
-- ATENDE - BIBLIOTECA DE LOCAIS + TRAVA POR CLIENTE PORTAL
--
-- Hierarquia efetiva do LOCAL:
-- 1. trava pelo CLIENTE PORTAL
-- 2. override manual da postagem
-- 3. local padrao do atendente
-- 4. local padrao do remetente
-- 5. vazio
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_locais (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO atende_locais(codigo,nome,ativo,atualizado_por)
VALUES ('AGF','AGF',1,'migration'),('METRO','METRÔ',1,'migration');

CREATE TABLE IF NOT EXISTS atende_cliente_portal_local (
  cliente_portal_norm TEXT PRIMARY KEY,
  cliente_portal TEXT NOT NULL,
  local_codigo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (local_codigo) REFERENCES atende_locais(codigo)
);

CREATE INDEX IF NOT EXISTS idx_cliente_portal_local_codigo
  ON atende_cliente_portal_local(local_codigo, ativo);
