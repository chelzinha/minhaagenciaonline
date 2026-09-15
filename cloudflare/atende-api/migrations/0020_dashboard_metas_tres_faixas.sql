-- ============================================================
-- ATENDE - METAS COM 3 FAIXAS
--
-- Regras vigentes:
-- Encomendas: Bronze / Prata / Ouro
-- Balcao AGF: Bronze / Prata / Ouro
-- Metro: Bronze / Prata / Ouro
--
-- Colunas antigas sao preservadas para compatibilidade.
-- ============================================================

ALTER TABLE atende_dashboard_metas_mensais
ADD COLUMN encomendas_bronze REAL NOT NULL DEFAULT 0;

ALTER TABLE atende_dashboard_metas_mensais
ADD COLUMN encomendas_prata REAL NOT NULL DEFAULT 0;

ALTER TABLE atende_dashboard_metas_mensais
ADD COLUMN encomendas_ouro REAL NOT NULL DEFAULT 0;

-- Metas informadas para setembro/2026.
UPDATE atende_dashboard_metas_mensais
SET
  encomendas_bronze = 830000,
  encomendas_prata  = 855000,
  encomendas_ouro   = 880000
WHERE competencia = '2026-09';