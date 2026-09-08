-- ============================================================
-- ATENDE - LOCAL PADRAO POR ATENDENTE
-- Prioridade do LOCAL exibido:
-- 1. override manual da postagem
-- 2. local padrao do remetente/cliente mestre
-- 3. local padrao do atendente
-- 4. vazio
-- ============================================================

ALTER TABLE atende_atendentes
  ADD COLUMN local_padrao TEXT
  CHECK (local_padrao IS NULL OR local_padrao IN ('AGF','METRO'));

CREATE INDEX IF NOT EXISTS idx_atende_atendentes_local
  ON atende_atendentes(local_padrao);
