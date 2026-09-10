-- ============================================================
-- ATENDE V6 - CONTAGEM MATERIALIZADA DE CONTRATOS
--
-- Evita recalcular GROUP BY de todos os contratos em cada
-- consulta do dashboard.
--
-- O RAW e as postagens canonicas permanecem intactos.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_contrato_counts (
  numero TEXT PRIMARY KEY,
  ocorrencias INTEGER NOT NULL DEFAULT 0
    CHECK (ocorrencias >= 0),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

DELETE FROM atende_contrato_counts;

INSERT INTO atende_contrato_counts (
  numero,
  ocorrencias,
  atualizado_em
)
SELECT
  TRIM(r.numero_contrato_norm) AS numero,
  COUNT(*) AS ocorrencias,
  datetime('now') AS atualizado_em
FROM atende_postagens_canonicas r
WHERE r.numero_contrato_norm IS NOT NULL
  AND TRIM(r.numero_contrato_norm) <> ''
  AND LOWER(TRIM(r.numero_contrato_norm)) <> 'null'
GROUP BY TRIM(r.numero_contrato_norm);