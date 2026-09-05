CREATE TABLE IF NOT EXISTS atende_postagens (
  source_key TEXT PRIMARY KEY,
  atendimento TEXT,
  altura REAL,
  cep_destinatario TEXT,
  cep_remetente TEXT,
  mcu TEXT,
  codigo_objeto TEXT,
  codigo_servico TEXT,
  comprimento REAL,
  data_postagem TEXT NOT NULL,
  diametro REAL,
  largura REAL,
  nome_destinatario TEXT,
  nome_remetente TEXT,
  nome_servico TEXT,
  cartao_postagem TEXT,
  numero_contrato TEXT,
  numero_plp TEXT,
  sistema_postagem TEXT,
  peso REAL,
  peso_tarifado REAL,
  valor_atendimento REAL,
  valor_declarado REAL,
  estorno TEXT,
  cpf_matricula_atendente TEXT,
  modalidade_pagamento TEXT,
  forma_pagamento TEXT,
  row_hash TEXT NOT NULL,
  arquivo_origem TEXT,
  importado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_atende_data_postagem
  ON atende_postagens(data_postagem DESC);
CREATE INDEX IF NOT EXISTS idx_atende_codigo_objeto
  ON atende_postagens(codigo_objeto);
CREATE INDEX IF NOT EXISTS idx_atende_atendimento
  ON atende_postagens(atendimento);
CREATE INDEX IF NOT EXISTS idx_atende_numero_contrato
  ON atende_postagens(numero_contrato);
CREATE INDEX IF NOT EXISTS idx_atende_cartao_postagem
  ON atende_postagens(cartao_postagem);
CREATE INDEX IF NOT EXISTS idx_atende_atendente
  ON atende_postagens(cpf_matricula_atendente);
CREATE INDEX IF NOT EXISTS idx_atende_sistema
  ON atende_postagens(sistema_postagem);
CREATE INDEX IF NOT EXISTS idx_atende_modalidade
  ON atende_postagens(modalidade_pagamento);
CREATE INDEX IF NOT EXISTS idx_atende_forma_pagamento
  ON atende_postagens(forma_pagamento);

CREATE TABLE IF NOT EXISTS atende_importacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo_nome TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL UNIQUE,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  recebidas INTEGER NOT NULL DEFAULT 0,
  gravadas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  concluido_em TEXT
);
