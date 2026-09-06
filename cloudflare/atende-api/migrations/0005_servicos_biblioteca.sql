-- Biblioteca administrativa de servicos.
-- O RAW permanece imutavel; estes campos sao metadados derivados/cadastrais.
-- A tabela e reconstruida para permitir tipo_objeto vazio quando o servico
-- possui metadados (TIPO/SUBGRUPO/TABELA), mas nao precisa de fallback de OBJETO.

CREATE TABLE atende_servico_classificacao_v2 (
  codigo_servico TEXT PRIMARY KEY,
  nome_servico_referencia TEXT,
  tipo_objeto TEXT CHECK (tipo_objeto IN ('PRODUTO ECT','SEM REGISTRO','')),
  observacao TEXT,
  tipo_servico TEXT,
  subgrupo TEXT,
  tabela TEXT,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO atende_servico_classificacao_v2(
  codigo_servico,
  nome_servico_referencia,
  tipo_objeto,
  observacao,
  atualizado_por,
  atualizado_em
)
SELECT
  codigo_servico,
  nome_servico_referencia,
  COALESCE(tipo_objeto,''),
  observacao,
  atualizado_por,
  atualizado_em
FROM atende_servico_classificacao;

DROP TABLE atende_servico_classificacao;
ALTER TABLE atende_servico_classificacao_v2 RENAME TO atende_servico_classificacao;

CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_tipo
  ON atende_servico_classificacao(tipo_servico);

CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_subgrupo
  ON atende_servico_classificacao(subgrupo);

CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_tabela
  ON atende_servico_classificacao(tabela);
