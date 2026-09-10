-- ============================================================
-- ATENDE - POSTAGENS CANONICAS
--
-- Mantem atende_postagens_raw imutavel.
-- Remove apenas duplicacoes LOGICAS entre arquivos sobrepostos.
--
-- Chave:
--   com SRO    -> SRO + ATENDIMENTO
--   sem SRO    -> ATENDIMENTO
--   sem ambos  -> preserva a linha RAW individual
--
-- Em caso de repeticao da mesma operacao, preserva o primeiro
-- registro importado (menor id).
-- ============================================================

DROP VIEW IF EXISTS atende_postagens_canonicas;

CREATE VIEW atende_postagens_canonicas AS
SELECT *
FROM (
  SELECT
    r.*,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN TRIM(COALESCE(r.codigo_objeto_norm, '')) <> '' THEN
            'OBJ:' || TRIM(r.codigo_objeto_norm) ||
            '|ATD:' || COALESCE(NULLIF(TRIM(r.atendimento), ''), 'SEM_ATENDIMENTO')

          WHEN TRIM(COALESCE(r.atendimento, '')) <> '' THEN
            'ATD:' || TRIM(r.atendimento)

          ELSE
            'RAW:' || CAST(r.id AS TEXT)
        END
      ORDER BY r.id ASC
    ) AS _canon_rn
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri
    ON ri.import_key = r.import_key
   AND ri.concluido_em IS NOT NULL
)
WHERE _canon_rn = 1;
