-- Etiquetas digitadas pelo cliente no /postar (fila do atendente no /balcao).
-- Dados pessoais apagados após 30 dias pela rotina diária do Worker.
CREATE TABLE IF NOT EXISTS balcao_etiquetas (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,                 -- A-1234 (AGF) ou M-1234 (Metrô), único no dia
  local TEXT NOT NULL CHECK (local IN ('AGF','METRO')),
  dia TEXT NOT NULL,                    -- AAAA-MM-DD no fuso de Fortaleza
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','EM_ATENDIMENTO','CONCLUIDA','CANCELADA','EXPIRADA')),
  servico TEXT NOT NULL,
  servico_nome TEXT,
  total REAL,
  prazo_dias INTEGER,
  peso_g INTEGER,
  cotacao_json TEXT,
  remetente_json TEXT NOT NULL,
  destinatario_json TEXT NOT NULL,
  sro TEXT,
  atendente TEXT,
  ip_hash TEXT,
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizada_em TEXT,
  UNIQUE (dia, codigo)
);
CREATE INDEX IF NOT EXISTS idx_balcao_etiquetas_fila ON balcao_etiquetas (local, dia, status);
CREATE INDEX IF NOT EXISTS idx_balcao_etiquetas_criada ON balcao_etiquetas (criada_em);

-- Contador de uso das rotas públicas (por hash de IP e hora).
CREATE TABLE IF NOT EXISTS balcao_limites (
  chave TEXT PRIMARY KEY,
  contagem INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);
