-- ============================================================
-- ATENDE - RESPONSAVEL SEMANAL DO BALCAO
-- Historico por competencia.
-- ELEN nao participa da escala semanal.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_balcao_responsavel_semanal (
  competencia TEXT NOT NULL,
  semana_inicio TEXT NOT NULL,
  semana_fim TEXT NOT NULL,

  responsavel TEXT NOT NULL
    CHECK (responsavel IN ('ALESSON','LEVY')),

  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (competencia, semana_inicio)
);

CREATE INDEX IF NOT EXISTS idx_atende_balcao_responsavel_comp
ON atende_balcao_responsavel_semanal(
  competencia,
  semana_inicio,
  semana_fim
);