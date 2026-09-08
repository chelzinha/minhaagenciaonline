-- ============================================================
-- ATENDE - METAS MENSAIS DO DASHBOARD GERENCIAL
-- Configuracao manual por competencia. Nao altera dados RAW.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_dashboard_metas_mensais (
  competencia TEXT PRIMARY KEY,
  dias_uteis_realizados INTEGER NOT NULL DEFAULT 0,
  dias_uteis_mes INTEGER NOT NULL DEFAULT 0,
  encomendas_meta REAL NOT NULL DEFAULT 0,
  balcao_bronze REAL NOT NULL DEFAULT 0,
  balcao_prata REAL NOT NULL DEFAULT 0,
  balcao_ouro REAL NOT NULL DEFAULT 0,
  balcao_diamante REAL NOT NULL DEFAULT 0,
  metro_bronze REAL NOT NULL DEFAULT 0,
  metro_prata REAL NOT NULL DEFAULT 0,
  metro_ouro REAL NOT NULL DEFAULT 0,
  metro_diamante REAL NOT NULL DEFAULT 0,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_atende_dashboard_metas_competencia
  ON atende_dashboard_metas_mensais(competencia);
