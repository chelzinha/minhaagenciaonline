-- Comparador de Tarifas (/comparador) - mesma base D1 do /balcao (agf-balcao)
-- Preço à vista: tabelas balcao_* (motor do /balcao, sem alteração).
-- Preço de contrato (16 pacotes, inclui Clube Correios e Platinum) e do Correios App: tabelas cmp_*.
-- Fonte: pasta 02 - Tarifas e Tabelas de Preços/2026 + MATRIZ ORIGEM E DESTINO - CEARÁ.
-- Gerador: tools/comparador/gerar_comparador_d1.py

CREATE TABLE IF NOT EXISTS cmp_tabelas (
  codigo TEXT PRIMARY KEY,             -- PLATINUM, CLUBE_CORREIOS, DIAMANTE_1 ... APP
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('CONTRATO','APP')),
  ordem INTEGER NOT NULL DEFAULT 99,
  observacao TEXT,
  vigencia TEXT NOT NULL
);

-- Preço por tabela x serviço x coluna (L1..I4) x faixa de peso.
-- tipo FAIXA: peso_max_g é o teto da faixa (300, 500, 1000 ... 10000).
-- tipo KG_ADICIONAL: valor por kg (ou fração) acima de 10000 g.
CREATE TABLE IF NOT EXISTS cmp_tarifas (
  tabela TEXT NOT NULL,
  servico TEXT NOT NULL CHECK (servico IN ('SEDEX','PAC','MINI')),
  coluna TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('FAIXA','KG_ADICIONAL')),
  peso_max_g INTEGER NOT NULL,
  preco REAL NOT NULL,
  PRIMARY KEY (tabela, servico, coluna, tipo, peso_max_g)
);

-- Número da faixa por UF de destino, origem Fortaleza/CE.
-- faixa_capital: N e P (corredor Fortaleza E+). faixa_interior: I (Matriz Origem e Destino CE).
CREATE TABLE IF NOT EXISTS cmp_faixa_uf (
  uf TEXT PRIMARY KEY,
  faixa_capital INTEGER NOT NULL,
  faixa_interior INTEGER NOT NULL,
  observacao TEXT
);

-- Classificação de cidades (A+, A, B, C). Município ausente = interior (coluna I).
CREATE TABLE IF NOT EXISTS cmp_classe_cidade (
  uf TEXT NOT NULL,
  municipio_norm TEXT NOT NULL,
  municipio TEXT NOT NULL,
  classe TEXT NOT NULL CHECK (classe IN ('A+','A','B','C')),
  fonte TEXT,
  PRIMARY KEY (uf, municipio_norm)
);

CREATE TABLE IF NOT EXISTS cmp_regras (
  chave TEXT PRIMARY KEY,
  valor REAL NOT NULL,
  descricao TEXT,
  fonte TEXT
);

CREATE TABLE IF NOT EXISTS cmp_carga_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vigencia TEXT NOT NULL,
  linhas_tarifas INTEGER,
  linhas_cidades INTEGER,
  observacao TEXT,
  carregado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Histórico dos PDFs gerados (o que foi apresentado a cada cliente).
CREATE TABLE IF NOT EXISTS cmp_propostas (
  id TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  usuario TEXT,
  cliente TEXT NOT NULL,
  cenarios TEXT NOT NULL,              -- ex.: AVISTA,PLATINUM,APP
  referencia TEXT NOT NULL,
  postagens INTEGER,
  total_referencia REAL,
  total_proposta REAL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cmp_propostas_criado ON cmp_propostas (criado_em);
