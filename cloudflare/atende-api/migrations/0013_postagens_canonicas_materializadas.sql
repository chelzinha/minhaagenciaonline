-- ============================================================
-- ATENDE - INDICE MATERIALIZADO DE OPERACOES CANONICAS
--
-- O RAW permanece intacto.
-- Materializa somente o raw_id escolhido para cada operacao.
-- A view atende_postagens_canonicas passa a ser um JOIN simples.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_postagens_canonicas_ids (
  operation_key TEXT PRIMARY KEY,
  raw_id INTEGER NOT NULL UNIQUE,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (raw_id) REFERENCES atende_postagens_raw(id)
);

DELETE FROM atende_postagens_canonicas_ids;

INSERT INTO atende_postagens_canonicas_ids(operation_key, raw_id)
SELECT operation_key, MIN(raw_id)
FROM (
  SELECT
    r.id AS raw_id,
    CASE
      WHEN TRIM(COALESCE(r.codigo_objeto_norm, '')) <> '' THEN
        'OBJ:' || TRIM(r.codigo_objeto_norm) ||
        '|ATD:' || COALESCE(NULLIF(TRIM(r.atendimento), ''), 'SEM_ATENDIMENTO')

      WHEN TRIM(COALESCE(r.atendimento, '')) <> '' THEN
        'ATD:' || TRIM(r.atendimento)

      ELSE
        'RAW:' || CAST(r.id AS TEXT)
    END AS operation_key
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri
    ON ri.import_key = r.import_key
   AND ri.concluido_em IS NOT NULL
)
GROUP BY operation_key;

DROP VIEW IF EXISTS atende_postagens_canonicas;

CREATE VIEW atende_postagens_canonicas AS
SELECT r.*
FROM atende_postagens_raw r
JOIN atende_postagens_canonicas_ids c
  ON c.raw_id = r.id;
