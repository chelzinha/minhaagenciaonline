-- ============================================================
-- ATENDE - BIBLIOTECA CEP -> BAIRRO / LOCALIDADE (V6)
-- Numerada 0018 porque 0017 foi reservado ao pre-requisito
-- de classificacao RECORRENTE/CAMPANHA/PONTUAL.
-- A carga deve ser feita fora do request do dashboard.
-- Fonte preferencial: DNE Correios. Alternativa: ViaCEP pontual.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_cep_bairro (
  cep           TEXT PRIMARY KEY,
  bairro        TEXT NOT NULL DEFAULT '',
  localidade    TEXT NOT NULL DEFAULT '',
  uf            TEXT NOT NULL DEFAULT '',
  fonte         TEXT NOT NULL DEFAULT 'manual',
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_atende_cep_bairro_local
  ON atende_cep_bairro(localidade, bairro);
