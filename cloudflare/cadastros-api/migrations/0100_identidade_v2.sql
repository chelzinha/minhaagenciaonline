-- Cadastro de Clientes v2 - identidade comercial (ponte Atende -> CRM)
-- Nao altera nem apaga as tabelas da v1 (customers, customer_aliases, source_postings...).
-- Desenho: a postagem aponta para a GRAFIA recebida; a grafia aponta para um NO do motor;
-- o no aponta para o CLIENTE. Agrupar clientes = atualizar poucas linhas de cid_nos, nunca as 94 mil postagens.

-- Cliente comercial estavel
CREATE TABLE IF NOT EXISTS cid_clientes (
  id              TEXT PRIMARY KEY,                       -- CLI_xxxxxxxxxxxxxxxx (estavel)
  nome            TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  fonte_nome      TEXT NOT NULL DEFAULT 'MAIS_COMPLETO' CHECK (fonte_nome IN ('PORTAL','MAIS_COMPLETO','MANUAL','PLANILHA')),
  portal_chave    TEXT UNIQUE,                            -- preenchido quando o cliente e um CLIENTE PORTAL direto
  situacao        TEXT NOT NULL DEFAULT 'ATIVO' CHECK (situacao IN ('ATIVO','INATIVO')),
  criado_em       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cid_clientes_nome ON cid_clientes(nome COLLATE NOCASE);

-- No do motor: um nome normalizado (P: = CLIENTE PORTAL direto, S: = NOME REMETENTE de portal compartilhado)
CREATE TABLE IF NOT EXISTS cid_nos (
  chave           TEXT PRIMARY KEY,                       -- 'P:AMPLA ENERGIA E SERVICOS' / 'S:KARINE PINHEIRO'
  tipo            TEXT NOT NULL CHECK (tipo IN ('P','S')),
  cliente_id      TEXT REFERENCES cid_clientes(id),
  regra           TEXT NOT NULL DEFAULT 'NOVO',           -- regra que ligou este no ao cliente (ver REGRAS do motor)
  atualizado_em   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cid_nos_cliente ON cid_nos(cliente_id);

-- Grafia exatamente como veio do Atende, por origem
CREATE TABLE IF NOT EXISTS cid_grafias (
  origem          TEXT NOT NULL CHECK (origem IN ('PORTAL','BALCAO','METRO','CF')),
  grafia          TEXT NOT NULL,
  no_chave        TEXT,                                   -- NULL = grafia descartada (REMETENTE, -, vazio)
  PRIMARY KEY (origem, grafia)
);
CREATE INDEX IF NOT EXISTS idx_cid_grafias_no ON cid_grafias(no_chave);

-- Ponte: 1 linha por postagem canonica do Atende (fato operacional, somente leitura para o CRM)
CREATE TABLE IF NOT EXISTS cid_postagens (
  raw_id          INTEGER PRIMARY KEY,
  origem          TEXT NOT NULL CHECK (origem IN ('PORTAL','BALCAO','METRO','CF','SEM_PORTAL')),
  grafia          TEXT NOT NULL DEFAULT '',               -- CLIENTE PORTAL (origem PORTAL) ou NOME REMETENTE (compartilhados)
  cliente_portal  TEXT NOT NULL DEFAULT '',
  nome_remetente  TEXT NOT NULL DEFAULT '',
  local_codigo    TEXT NOT NULL DEFAULT '',               -- LOCAL efetivo do Atende (AGF / BALCAO / METRO)
  contrato        TEXT NOT NULL DEFAULT '',
  cartao          TEXT NOT NULL DEFAULT '',
  data_postagem   TEXT NOT NULL DEFAULT '',
  valor           REAL NOT NULL DEFAULT 0,
  impressao       TEXT NOT NULL,                          -- hash dos campos acima (detecta mudanca no Atende)
  passagem        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cid_postagens_grafia ON cid_postagens(origem, grafia);
CREATE INDEX IF NOT EXISTS idx_cid_postagens_local ON cid_postagens(local_codigo, data_postagem);

-- Decisoes humanas (entrada do motor; nunca apagadas, so desativadas)
CREATE TABLE IF NOT EXISTS cid_decisoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('UNIR','SEPARAR','NOME')),
  chave_a         TEXT NOT NULL,
  chave_b         TEXT NOT NULL DEFAULT '',
  valor           TEXT NOT NULL DEFAULT '',               -- tipo NOME: nome padronizado escolhido
  autor           TEXT NOT NULL,
  ativo           INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cid_decisoes_ativas ON cid_decisoes(ativo, tipo);

-- Decisoes manuais legadas (planilha CADASTRO_MESTRE_CLIENTES, VALIDACAO_LEGADO = MANUAL)
CREATE TABLE IF NOT EXISTS cid_planilha_legado (
  grafia          TEXT PRIMARY KEY,
  nome_manual     TEXT NOT NULL
);

-- Sugestoes geradas a cada execucao do motor (tabela substituida inteira)
CREATE TABLE IF NOT EXISTS cid_sugestoes (
  par             TEXT PRIMARY KEY,                       -- chaveA|chaveB (ordenado)
  chave_a         TEXT NOT NULL,
  chave_b         TEXT NOT NULL,
  cliente_a       TEXT NOT NULL,
  cliente_b       TEXT NOT NULL,
  score           INTEGER NOT NULL,
  motivo          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cid_sugestoes_cliente_a ON cid_sugestoes(cliente_a);
CREATE INDEX IF NOT EXISTS idx_cid_sugestoes_cliente_b ON cid_sugestoes(cliente_b);

-- IDs que deixaram de existir por agrupamento (para o CRM remapear tratativas/agenda)
CREATE TABLE IF NOT EXISTS cid_ids_fundidos (
  id_antigo       TEXT PRIMARY KEY,
  id_novo         TEXT NOT NULL,
  em              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Resumo materializado por cliente e aba (reconstruido apos cada execucao do motor)
-- aba: PORTAL / BALCAO / METRO / CF  (um cliente pode aparecer em mais de uma aba)
CREATE TABLE IF NOT EXISTS cid_resumo (
  cliente_id      TEXT NOT NULL,
  aba             TEXT NOT NULL,
  postagens       INTEGER NOT NULL DEFAULT 0,
  valor           REAL NOT NULL DEFAULT 0,
  grafias         INTEGER NOT NULL DEFAULT 0,
  local_agf       INTEGER NOT NULL DEFAULT 0,
  local_balcao    INTEGER NOT NULL DEFAULT 0,
  local_metro     INTEGER NOT NULL DEFAULT 0,
  local_vazio     INTEGER NOT NULL DEFAULT 0,
  primeira        TEXT NOT NULL DEFAULT '',
  ultima          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cliente_id, aba)
);
CREATE INDEX IF NOT EXISTS idx_cid_resumo_aba ON cid_resumo(aba, postagens DESC);

-- Execucoes do motor e da sincronizacao
CREATE TABLE IF NOT EXISTS cid_execucoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('MOTOR','SYNC')),
  autor           TEXT NOT NULL,
  resumo_json     TEXT NOT NULL DEFAULT '{}',
  criado_em       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cid_estado (
  chave           TEXT PRIMARY KEY,
  valor           TEXT NOT NULL,
  atualizado_em   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO cid_estado(chave, valor) VALUES ('sync_cursor', '0'), ('sync_passagem', '0'), ('sync_lease', '0'), ('motor_pendente', '1');

-- Leitura pronta para o CRM e para a tela: postagem -> cliente
CREATE VIEW IF NOT EXISTS cid_v_postagem_cliente AS
SELECT p.raw_id, p.origem, p.grafia, p.local_codigo, p.contrato, p.cartao, p.data_postagem, p.valor,
       n.cliente_id, c.nome AS cliente_nome, n.regra
FROM cid_postagens p
LEFT JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia
LEFT JOIN cid_nos n ON n.chave = g.no_chave
LEFT JOIN cid_clientes c ON c.id = n.cliente_id;
