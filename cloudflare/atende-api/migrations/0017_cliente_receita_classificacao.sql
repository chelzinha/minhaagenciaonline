-- ============================================================
-- ATENDE - CLASSIFICACAO DE RECEITA POR CLIENTE (V6)
-- A classificacao manual e soberana. A estatistica apenas sinaliza.
-- A tabela usa uma chave estavel calculada pelo Worker:
-- PORTAL:<cliente_portal_norm> | CLIENTE:<id> | REMETENTE:<nome_norm>
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_cliente_receita_classificacao (
  cliente_chave      TEXT PRIMARY KEY,
  cliente_nome       TEXT NOT NULL DEFAULT '',
  tipo_receita       TEXT NOT NULL CHECK (tipo_receita IN ('RECORRENTE','CAMPANHA','PONTUAL')),
  data_fim_prevista  TEXT,
  observacao         TEXT NOT NULL DEFAULT '',
  ativo              INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  atualizado_por     TEXT,
  atualizado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_atende_cliente_receita_tipo
  ON atende_cliente_receita_classificacao(tipo_receita, ativo);

CREATE INDEX IF NOT EXISTS idx_atende_cliente_receita_fim
  ON atende_cliente_receita_classificacao(data_fim_prevista, ativo);
