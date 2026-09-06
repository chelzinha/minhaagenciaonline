-- ============================================================
-- ATENDE - CAMADA RAW IMUTAVEL + BIBLIOTECAS ADMINISTRATIVAS
-- Regra: os 26 campos vindos dos Correios nunca sao alterados.
-- Toda classificacao/limpeza fica em tabelas separadas.
-- ============================================================

CREATE TABLE IF NOT EXISTS atende_raw_importacoes (
  import_key TEXT PRIMARY KEY,
  arquivo_id TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_modificado_em TEXT,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  recebidas INTEGER NOT NULL DEFAULT 0,
  gravadas INTEGER NOT NULL DEFAULT 0,
  invalidas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  concluido_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_atende_raw_import_arquivo
  ON atende_raw_importacoes(arquivo_id, arquivo_hash);

CREATE TABLE IF NOT EXISTS atende_postagens_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_key TEXT NOT NULL,
  arquivo_id TEXT NOT NULL,
  arquivo_hash TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  numero_linha INTEGER NOT NULL,

  atendimento TEXT,
  altura TEXT,
  cep_destinatario TEXT,
  cep_remetente TEXT,
  mcu TEXT,
  codigo_objeto TEXT,
  codigo_servico TEXT,
  comprimento TEXT,
  data_postagem TEXT,
  diametro TEXT,
  largura TEXT,
  nome_destinatario TEXT,
  nome_remetente TEXT,
  nome_servico TEXT,
  cartao_postagem TEXT,
  numero_contrato TEXT,
  numero_plp TEXT,
  sistema_postagem TEXT,
  peso TEXT,
  peso_tarifado TEXT,
  valor_atendimento TEXT,
  valor_declarado TEXT,
  estorno TEXT,
  cpf_matricula_atendente TEXT,
  modalidade_pagamento TEXT,
  forma_pagamento TEXT,

  data_postagem_iso TEXT,
  valor_atendimento_num REAL,
  codigo_objeto_norm TEXT,
  codigo_servico_norm TEXT,
  nome_remetente_norm TEXT,
  numero_contrato_norm TEXT,
  atendente_norm TEXT,
  importado_em TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(import_key, numero_linha)
);
CREATE INDEX IF NOT EXISTS idx_atende_raw_data ON atende_postagens_raw(data_postagem_iso DESC);
CREATE INDEX IF NOT EXISTS idx_atende_raw_objeto ON atende_postagens_raw(codigo_objeto_norm);
CREATE INDEX IF NOT EXISTS idx_atende_raw_servico ON atende_postagens_raw(codigo_servico_norm);
CREATE INDEX IF NOT EXISTS idx_atende_raw_remetente ON atende_postagens_raw(nome_remetente_norm);
CREATE INDEX IF NOT EXISTS idx_atende_raw_contrato ON atende_postagens_raw(numero_contrato_norm);
CREATE INDEX IF NOT EXISTS idx_atende_raw_atendente ON atende_postagens_raw(atendente_norm);
CREATE INDEX IF NOT EXISTS idx_atende_raw_import_key ON atende_postagens_raw(import_key);

CREATE TABLE IF NOT EXISTS atende_sro_counts (
  codigo_objeto_norm TEXT PRIMARY KEY,
  ocorrencias INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS atende_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_atual TEXT NOT NULL,
  local_padrao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atende_cliente_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  alias_original TEXT NOT NULL,
  alias_normalizado TEXT NOT NULL UNIQUE,
  primeira_ocorrencia TEXT,
  ultima_ocorrencia TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES atende_clientes(id)
);
CREATE INDEX IF NOT EXISTS idx_atende_alias_cliente ON atende_cliente_aliases(cliente_id);

CREATE TABLE IF NOT EXISTS atende_atendentes (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atende_contratos (
  numero TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT,
  observacao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atende_servico_classificacao (
  codigo_servico TEXT PRIMARY KEY,
  nome_servico_referencia TEXT,
  tipo_objeto TEXT CHECK (tipo_objeto IN ('PRODUTO ECT','SEM REGISTRO')),
  observacao TEXT,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS atende_locais (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO atende_locais(codigo, nome) VALUES ('AGF', 'AGF');
INSERT OR IGNORE INTO atende_locais(codigo, nome) VALUES ('METRO', 'METRÔ');

CREATE TABLE IF NOT EXISTS atende_postagem_overrides (
  raw_id INTEGER PRIMARY KEY,
  local_codigo TEXT,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (raw_id) REFERENCES atende_postagens_raw(id),
  FOREIGN KEY (local_codigo) REFERENCES atende_locais(codigo)
);
CREATE INDEX IF NOT EXISTS idx_atende_override_local ON atende_postagem_overrides(local_codigo);

CREATE TABLE IF NOT EXISTS atende_admin_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  chave TEXT NOT NULL,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  usuario TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atende_historico_data ON atende_admin_historico(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_atende_historico_entidade ON atende_admin_historico(entidade, chave);
