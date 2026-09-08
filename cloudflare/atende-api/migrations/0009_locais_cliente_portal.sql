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

-- atende_locais ja existe desde 0002. Esta migration apenas evolui
-- a biblioteca para permitir administracao completa.
ALTER TABLE atende_locais ADD COLUMN atualizado_por TEXT;
ALTER TABLE atende_locais ADD COLUMN atualizado_em TEXT;

UPDATE atende_locais
SET atualizado_por = COALESCE(atualizado_por,'migration'),
    atualizado_em = COALESCE(atualizado_em,datetime('now'));

INSERT OR IGNORE INTO atende_locais(codigo,nome,ativo)
VALUES ('AGF','AGF',1),('METRO','METRÔ',1);

-- A coluna local_padrao criada em 0007 tem CHECK limitado a AGF/METRO.
-- Para permitir novos Locais sem recriar a tabela de atendentes, a partir
-- daqui a associacao dinamica fica nesta tabela separada.
CREATE TABLE IF NOT EXISTS atende_atendente_local (
  codigo TEXT PRIMARY KEY,
  local_codigo TEXT NOT NULL,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (codigo) REFERENCES atende_atendentes(codigo),
  FOREIGN KEY (local_codigo) REFERENCES atende_locais(codigo)
);

INSERT OR IGNORE INTO atende_atendente_local(codigo,local_codigo,atualizado_por)
SELECT codigo,local_padrao,'migration'
FROM atende_atendentes
WHERE local_padrao IS NOT NULL AND TRIM(local_padrao)<>'';

CREATE INDEX IF NOT EXISTS idx_atendente_local_codigo
  ON atende_atendente_local(local_codigo);

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
