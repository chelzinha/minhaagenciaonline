-- ============================================================
-- ATENDE - CALENDARIO DE DIAS UTEIS E OVERRIDE DE METAS
-- Objetivo: dias uteis passam a ser CALCULADOS a partir do
-- calendario e do movimento real. O valor manual vira override.
-- Nao remove nem altera as colunas existentes (rollback simples).
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_calendario_feriados (
  data        TEXT PRIMARY KEY,          -- AAAA-MM-DD
  descricao   TEXT NOT NULL DEFAULT '',
  escopo      TEXT NOT NULL DEFAULT 'NACIONAL',  -- NACIONAL | ESTADUAL | MUNICIPAL
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_atende_feriados_data
  ON atende_calendario_feriados(data, ativo);

-- Override opcional. NULL = usar o valor calculado.
ALTER TABLE atende_dashboard_metas_mensais
  ADD COLUMN dias_uteis_realizados_override INTEGER;

ALTER TABLE atende_dashboard_metas_mensais
  ADD COLUMN dias_uteis_mes_override INTEGER;

-- ------------------------------------------------------------
-- Feriados 2026 - nacionais, estaduais CE e municipais Fortaleza
-- Ponto facultativo NAO entra. Carnaval, por exemplo, nao e removido
-- automaticamente; se a agencia fechar, use override ou cadastre a data.
-- Ajuste pelo Admin sempre que necessario.
-- ------------------------------------------------------------
INSERT OR IGNORE INTO atende_calendario_feriados(data,descricao,escopo) VALUES
  ('2026-01-01','Confraternizacao Universal','NACIONAL'),
  ('2026-03-19','Sao Jose - Fortaleza','MUNICIPAL'),
  ('2026-03-25','Data Magna do Ceara','ESTADUAL'),
  ('2026-04-03','Sexta-feira Santa','NACIONAL'),
  ('2026-04-21','Tiradentes','NACIONAL'),
  ('2026-05-01','Dia do Trabalho','NACIONAL'),
  ('2026-06-04','Corpus Christi - Fortaleza','MUNICIPAL'),
  ('2026-08-15','Nossa Senhora da Assuncao - Fortaleza','MUNICIPAL'),
  ('2026-09-07','Independencia do Brasil','NACIONAL'),
  ('2026-10-12','Nossa Senhora Aparecida','NACIONAL'),
  ('2026-11-02','Finados','NACIONAL'),
  ('2026-11-15','Proclamacao da Republica','NACIONAL'),
  ('2026-11-20','Consciencia Negra','NACIONAL'),
  ('2026-12-25','Natal','NACIONAL');

INSERT OR IGNORE INTO atende_calendario_feriados(data,descricao,escopo) VALUES
  ('2027-01-01','Confraternizacao Universal','NACIONAL'),
  ('2027-03-19','Sao Jose - Fortaleza','MUNICIPAL'),
  ('2027-03-25','Data Magna do Ceara','ESTADUAL'),
  ('2027-03-26','Sexta-feira Santa','NACIONAL'),
  ('2027-04-21','Tiradentes','NACIONAL'),
  ('2027-05-01','Dia do Trabalho','NACIONAL'),
  ('2027-05-27','Corpus Christi - Fortaleza','MUNICIPAL'),
  ('2027-08-15','Nossa Senhora da Assuncao - Fortaleza','MUNICIPAL'),
  ('2027-09-07','Independencia do Brasil','NACIONAL'),
  ('2027-10-12','Nossa Senhora Aparecida','NACIONAL'),
  ('2027-11-02','Finados','NACIONAL'),
  ('2027-11-15','Proclamacao da Republica','NACIONAL'),
  ('2027-11-20','Consciencia Negra','NACIONAL'),
  ('2027-12-25','Natal','NACIONAL');
