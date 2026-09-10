-- ============================================================
-- ATENDE - TABELA DE REMUNERACAO DO CONTRATO, POR VIGENCIA
-- Fonte unica da escada, do ajuste e do PPCC.
-- Substitui as constantes espalhadas no Worker e nos HTMLs.
-- Tetos e ajustes gravados em PPCC (unidade do Anexo 3).
-- Valor em reais = valor_ppcc x PPCC da vigencia do periodo.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_contrato_ppcc (
  vigencia_inicio TEXT PRIMARY KEY,   -- AAAA-MM-DD
  vigencia_fim    TEXT,               -- NULL = vigente
  valor           REAL NOT NULL,
  observacao      TEXT NOT NULL DEFAULT '',
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atende_contrato_tabela (
  grupo           TEXT NOT NULL,      -- R2G1 (Mensageria) | R2G2 (Encomendas)
  degrau          INTEGER NOT NULL,
  teto_ppcc       REAL,               -- NULL = faixa aberta (ultimo degrau)
  percentual      REAL NOT NULL,
  ajuste_ppcc     REAL NOT NULL DEFAULT 0,
  vigencia_inicio TEXT NOT NULL,
  vigencia_fim    TEXT,
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (grupo, degrau, vigencia_inicio)
);

CREATE INDEX IF NOT EXISTS idx_atende_contrato_tabela_vig
  ON atende_contrato_tabela(vigencia_inicio, vigencia_fim, grupo, degrau);

-- ------------------------------------------------------------
-- PPCC. O valor mudou de 3,70 para 3,85 entre marco e abril/2026.
-- Confirmar as datas exatas com a ECT e corrigir aqui se preciso.
-- ------------------------------------------------------------
INSERT OR REPLACE INTO atende_contrato_ppcc(vigencia_inicio,vigencia_fim,valor,observacao) VALUES
  ('2025-11-17','2026-03-31',3.70,'PPCC anterior ao reajuste'),
  ('2026-04-01',NULL,        3.85,'PPCC vigente');

-- ------------------------------------------------------------
-- R2 GRUPO I - Mensageria (carta, impresso, telegrama) - 12 degraus
-- Conferencia: teto_ppcc x 3,85 reproduz os limites em reais do painel.
-- ------------------------------------------------------------
INSERT OR REPLACE INTO atende_contrato_tabela(grupo,degrau,teto_ppcc,percentual,ajuste_ppcc,vigencia_inicio,vigencia_fim) VALUES
  ('R2G1', 1,  30000, 37.00,     0, '2025-11-17', NULL),
  ('R2G1', 2,  60000, 24.00,  3900, '2025-11-17', NULL),
  ('R2G1', 3,  72000, 20.00,  6300, '2025-11-17', NULL),
  ('R2G1', 4,  82000, 17.24,  8287, '2025-11-17', NULL),
  ('R2G1', 5,  96000, 15.24,  9927, '2025-11-17', NULL),
  ('R2G1', 6, 112000, 13.56, 11540, '2025-11-17', NULL),
  ('R2G1', 7, 126000, 12.44, 12794, '2025-11-17', NULL),
  ('R2G1', 8, 164000, 10.40, 15364, '2025-11-17', NULL),
  ('R2G1', 9, 216000,  8.81, 17972, '2025-11-17', NULL),
  ('R2G1',10, 282000,  7.69, 20391, '2025-11-17', NULL),
  ('R2G1',11, 374000,  6.81, 22873, '2025-11-17', NULL),
  ('R2G1',12,   NULL,  6.02, 25828, '2025-11-17', NULL);

-- ------------------------------------------------------------
-- R2 GRUPO II - Encomendas (PAC e SEDEX) - 9 degraus
-- ------------------------------------------------------------
INSERT OR REPLACE INTO atende_contrato_tabela(grupo,degrau,teto_ppcc,percentual,ajuste_ppcc,vigencia_inicio,vigencia_fim) VALUES
  ('R2G2', 1, 247000, 29.00,     0, '2025-11-17', NULL),
  ('R2G2', 2, 319000, 22.36, 16401, '2025-11-17', NULL),
  ('R2G2', 3, 376000, 19.95, 24089, '2025-11-17', NULL),
  ('R2G2', 4, 437000, 18.09, 31083, '2025-11-17', NULL),
  ('R2G2', 5, 493000, 16.98, 35934, '2025-11-17', NULL),
  ('R2G2', 6, 558000, 15.54, 43033, '2025-11-17', NULL),
  ('R2G2', 7, 680000, 13.55, 54137, '2025-11-17', NULL),
  ('R2G2', 8, 828000, 12.39, 62025, '2025-11-17', NULL),
  ('R2G2', 9,   NULL,  8.81, 91667, '2025-11-17', NULL);
