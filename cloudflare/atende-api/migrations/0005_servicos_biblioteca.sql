-- Biblioteca administrativa de servicos.
-- O RAW permanece imutavel; estes campos sao metadados derivados/cadastrais.

ALTER TABLE atende_servico_classificacao ADD COLUMN tipo_servico TEXT;
ALTER TABLE atende_servico_classificacao ADD COLUMN subgrupo TEXT;
ALTER TABLE atende_servico_classificacao ADD COLUMN tabela TEXT;

CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_tipo
  ON atende_servico_classificacao(tipo_servico);

CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_subgrupo
  ON atende_servico_classificacao(subgrupo);

CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_tabela
  ON atende_servico_classificacao(tabela);
