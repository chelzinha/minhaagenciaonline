-- Ponte entre o CLIENTE_ID antigo do CRM (CLI_000123, planilha CLIENTES_ALIAS) e o cliente do Cadastro v2.
-- Assim o CRM continua usando o ID antigo onde ja existe historico (cadastro manual, tratativas, agenda)
-- e nada precisa ser reescrito nas planilhas.
CREATE TABLE IF NOT EXISTS crm_id_legado (
  id_antigo      TEXT PRIMARY KEY,
  id_novo        TEXT,                       -- cliente do Cadastro v2 (NULL = sem par)
  metodo         TEXT NOT NULL CHECK (metodo IN ('NOME_EXATO','NOME_NUCLEO','AMBIGUO','SEM_PAR')),
  tem_dados      INTEGER NOT NULL DEFAULT 0, -- o ID antigo tem cadastro manual ou tratativa no CRM
  nome           TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_id_legado_novo ON crm_id_legado(id_novo);
