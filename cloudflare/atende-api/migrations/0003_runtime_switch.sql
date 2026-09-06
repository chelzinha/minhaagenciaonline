CREATE TABLE IF NOT EXISTS atende_runtime_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO atende_runtime_config(chave, valor)
VALUES ('panel_source', 'legacy');
