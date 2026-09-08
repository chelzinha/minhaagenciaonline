-- ============================================================
-- ATENDE - EXCECOES DE TRAVA DE LOCAL POR POSTAGEM
--
-- Regra:
-- - a trava por CLIENTE PORTAL continua sendo a regra geral;
-- - a presenca de uma linha nesta tabela libera somente aquele raw_id;
-- - o RAW dos Correios permanece imutavel;
-- - local_override_anterior preserva o estado manual que existia antes
--   da liberacao, para que um novo clique no cadeado restaure o estado.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_postagem_trava_excecoes (
  raw_id INTEGER PRIMARY KEY,
  local_override_anterior TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (raw_id) REFERENCES atende_postagens_raw(id),
  FOREIGN KEY (local_override_anterior) REFERENCES atende_locais(codigo)
);

CREATE INDEX IF NOT EXISTS idx_atende_trava_excecoes_criado_em
  ON atende_postagem_trava_excecoes(criado_em DESC);
