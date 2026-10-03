-- Calculadora Balcão à vista (/balcao) - origem Fortaleza/CE
-- Banco D1. Fonte dos dados: pasta FONTE_D1_BALCAO_A_VISTA no Google Drive.

CREATE TABLE IF NOT EXISTS balcao_servicos (
  codigo TEXT PRIMARY KEY,            -- 04510, 04014
  chave TEXT NOT NULL,                -- PAC, SEDEX
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  limite_peso_g INTEGER NOT NULL,
  vd_max REAL NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 99,
  arquivo_fonte TEXT,
  vigencia TEXT NOT NULL
);

-- Preço por serviço x escala x coluna x faixa de peso.
-- tipo FAIXA: peso_max_g é o teto da faixa (300, 1000, 2000 ... 10000).
-- tipo KG_ADICIONAL: valor por kg (ou fração) acima de 10000 g.
CREATE TABLE IF NOT EXISTS balcao_tarifas (
  servico TEXT NOT NULL,
  escala TEXT NOT NULL CHECK (escala IN ('CAPITAL','INTERIOR')),
  coluna TEXT NOT NULL CHECK (coluna IN ('LOCAL','ESTADUAL','F1','F2','F3','F4','F5','F6')),
  tipo TEXT NOT NULL CHECK (tipo IN ('FAIXA','KG_ADICIONAL')),
  peso_max_g INTEGER NOT NULL,
  preco REAL NOT NULL,
  PRIMARY KEY (servico, escala, coluna, tipo, peso_max_g)
);

-- UF de destino -> coluna de preço, para a UF de origem.
CREATE TABLE IF NOT EXISTS balcao_coluna_uf (
  uf_origem TEXT NOT NULL,
  uf_destino TEXT NOT NULL,
  coluna TEXT NOT NULL,
  PRIMARY KEY (uf_origem, uf_destino)
);

-- Municípios com tratamento diferente do padrão.
-- classe_avista CAPITAL: capital, região metropolitana ou aglomeração (usa escala CAPITAL - CAPITAL).
-- Município ausente da tabela = INTERIOR.
-- trecho_especial LOCAL (RMF) ou DIVISA (Mossoró/RN, cobra coluna ESTADUAL).
CREATE TABLE IF NOT EXISTS balcao_localidades (
  uf TEXT NOT NULL,
  municipio_norm TEXT NOT NULL,
  municipio TEXT NOT NULL,
  classe_avista TEXT NOT NULL CHECK (classe_avista IN ('CAPITAL','INTERIOR')),
  trecho_especial TEXT CHECK (trecho_especial IN ('LOCAL','DIVISA') OR trecho_especial IS NULL),
  fonte TEXT,
  PRIMARY KEY (uf, municipio_norm)
);

CREATE TABLE IF NOT EXISTS balcao_adicionais (
  chave TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('VALOR','PERCENTUAL','NUMERO')),
  valor REAL NOT NULL,
  fonte TEXT
);

-- Cache da API Prazo dos Correios (evita consultar o mesmo trecho toda hora).
CREATE TABLE IF NOT EXISTS balcao_prazo_cache (
  servico TEXT NOT NULL,
  cep_origem TEXT NOT NULL,
  cep_destino TEXT NOT NULL,
  prazo_dias INTEGER,
  entrega_sabado TEXT,
  resposta_json TEXT,
  consultado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (servico, cep_origem, cep_destino)
);

-- Cache de CEP -> município/UF (evita nova busca de CEP).
CREATE TABLE IF NOT EXISTS balcao_cep_cache (
  cep TEXT PRIMARY KEY,
  uf TEXT NOT NULL,
  municipio TEXT NOT NULL,
  bairro TEXT,
  logradouro TEXT,
  fonte TEXT,
  consultado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS balcao_carga_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vigencia TEXT NOT NULL,
  linhas_tarifas INTEGER,
  linhas_localidades INTEGER,
  observacao TEXT,
  carregado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
