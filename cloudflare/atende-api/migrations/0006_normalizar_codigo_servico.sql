-- Atende - normalizacao canonica do codigo de servico
--
-- IMPORTANTE:
-- - codigo_servico (campo RAW original do CSV) NAO e alterado.
-- - somente codigo_servico_norm, coluna tecnica derivada, e normalizada.
-- - codigos puramente numericos passam a ignorar zeros a esquerda:
--     04227 = 4227
--     006238 = 6238
-- - codigos alfanumericos permanecem apenas trim/uppercase.

UPDATE atende_postagens_raw
SET codigo_servico_norm = CASE
  WHEN TRIM(COALESCE(codigo_servico_norm, '')) <> ''
   AND UPPER(TRIM(codigo_servico_norm)) NOT GLOB '*[^0-9]*'
    THEN COALESCE(NULLIF(LTRIM(UPPER(TRIM(codigo_servico_norm)), '0'), ''), '0')
  ELSE UPPER(TRIM(COALESCE(codigo_servico_norm, '')))
END;

-- Garante a mesma regra para toda nova linha RAW inserida daqui para frente.
-- O gatilho altera somente a coluna tecnica derivada codigo_servico_norm.
DROP TRIGGER IF EXISTS trg_atende_normaliza_codigo_servico;
CREATE TRIGGER trg_atende_normaliza_codigo_servico
AFTER INSERT ON atende_postagens_raw
FOR EACH ROW
BEGIN
  UPDATE atende_postagens_raw
  SET codigo_servico_norm = CASE
    WHEN TRIM(COALESCE(NEW.codigo_servico_norm, '')) <> ''
     AND UPPER(TRIM(NEW.codigo_servico_norm)) NOT GLOB '*[^0-9]*'
      THEN COALESCE(NULLIF(LTRIM(UPPER(TRIM(NEW.codigo_servico_norm)), '0'), ''), '0')
    ELSE UPPER(TRIM(COALESCE(NEW.codigo_servico_norm, '')))
  END
  WHERE id = NEW.id;
END;

-- A biblioteca administrativa usa a mesma chave canonica.
-- Se ja existirem duas entradas equivalentes (ex.: 04227 e 4227),
-- preserva a entrada mais recentemente atualizada e passa a usar uma unica chave.
CREATE TABLE atende_servico_classificacao_canon (
  codigo_servico TEXT PRIMARY KEY,
  nome_servico_referencia TEXT,
  tipo_objeto TEXT CHECK (tipo_objeto IN ('PRODUTO ECT','SEM REGISTRO')),
  observacao TEXT,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  tipo_servico TEXT,
  subgrupo TEXT,
  tabela TEXT
);

WITH normalizada AS (
  SELECT
    CASE
      WHEN TRIM(COALESCE(codigo_servico, '')) <> ''
       AND UPPER(TRIM(codigo_servico)) NOT GLOB '*[^0-9]*'
        THEN COALESCE(NULLIF(LTRIM(UPPER(TRIM(codigo_servico)), '0'), ''), '0')
      ELSE UPPER(TRIM(COALESCE(codigo_servico, '')))
    END AS codigo_canonico,
    codigo_servico,
    nome_servico_referencia,
    tipo_objeto,
    observacao,
    atualizado_por,
    atualizado_em,
    tipo_servico,
    subgrupo,
    tabela
  FROM atende_servico_classificacao
  WHERE TRIM(COALESCE(codigo_servico, '')) <> ''
), ranqueada AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY codigo_canonico
           ORDER BY atualizado_em DESC,
                    CASE WHEN codigo_servico = codigo_canonico THEN 0 ELSE 1 END,
                    codigo_servico ASC
         ) AS rn
  FROM normalizada
)
INSERT INTO atende_servico_classificacao_canon (
  codigo_servico,
  nome_servico_referencia,
  tipo_objeto,
  observacao,
  atualizado_por,
  atualizado_em,
  tipo_servico,
  subgrupo,
  tabela
)
SELECT
  codigo_canonico,
  nome_servico_referencia,
  tipo_objeto,
  observacao,
  atualizado_por,
  atualizado_em,
  tipo_servico,
  subgrupo,
  tabela
FROM ranqueada
WHERE rn = 1;

DROP TABLE atende_servico_classificacao;
ALTER TABLE atende_servico_classificacao_canon RENAME TO atende_servico_classificacao;

CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_tipo
  ON atende_servico_classificacao(tipo_servico);
CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_subgrupo
  ON atende_servico_classificacao(subgrupo);
CREATE INDEX IF NOT EXISTS idx_atende_servico_classificacao_tabela
  ON atende_servico_classificacao(tabela);
