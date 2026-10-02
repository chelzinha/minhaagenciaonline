-- Banco D1 agf-dicas - catálogo do /dicas (Vitrine do Lojista)
-- Idempotente: pode rodar de novo sem perder dados.

CREATE TABLE IF NOT EXISTS categorias (
  id         TEXT PRIMARY KEY,              -- slug: impressoras, etiquetas...
  nome       TEXT NOT NULL,
  descricao  TEXT NOT NULL DEFAULT '',
  icone      TEXT NOT NULL DEFAULT 'sell',  -- nome do Material Symbols
  cor        TEXT NOT NULL DEFAULT '#00416B',
  ordem      INTEGER NOT NULL DEFAULT 100,
  ativo      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS produtos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id     TEXT NOT NULL REFERENCES categorias(id),
  titulo           TEXT NOT NULL,
  dica             TEXT NOT NULL DEFAULT '',   -- dica da AGF exibida no card
  imagem_url       TEXT NOT NULL DEFAULT '',
  icone            TEXT NOT NULL DEFAULT '',   -- ícone da miniatura quando não há foto
  link             TEXT NOT NULL,              -- onde comprar: qualquer endereço https
  preco_min        REAL,
  preco_max        REAL,
  avaliacao        REAL,
  vendas           INTEGER,
  loja             TEXT NOT NULL DEFAULT '',
  origem           TEXT NOT NULL DEFAULT 'manual',  -- manual | busca (link de busca da carga inicial)
  destaque         INTEGER NOT NULL DEFAULT 0,      -- 1 = entra no Kit inicial
  ordem            INTEGER NOT NULL DEFAULT 100,
  ativo            INTEGER NOT NULL DEFAULT 1,
  cliques          INTEGER NOT NULL DEFAULT 0,
  criado_em        TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_produtos_cat   ON produtos (categoria_id, ativo, ordem);

CREATE TABLE IF NOT EXISTS cliques_dia (
  produto_id INTEGER NOT NULL,
  dia        TEXT NOT NULL,      -- AAAA-MM-DD (UTC-3)
  total      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (produto_id, dia)
);
