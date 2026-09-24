-- LOCAL da carteira: cada cliente pertence a UM LOCAL (AGF, BALCAO ou METRO).
-- Cliente com postagens em um LOCAL so: definido automaticamente.
-- Cliente com postagens em mais de um LOCAL: vai para a fila do admin, que escolhe.
ALTER TABLE cid_clientes ADD COLUMN local_carteira TEXT;
ALTER TABLE cid_clientes ADD COLUMN local_fonte TEXT;

-- Decisao do admin, gravada por no do motor (sobrevive a agrupamentos e novos IDs)
CREATE TABLE IF NOT EXISTS cid_local_decisoes (
  chave     TEXT PRIMARY KEY,
  local     TEXT NOT NULL CHECK (local IN ('AGF','BALCAO','METRO')),
  autor     TEXT NOT NULL,
  em        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cid_clientes_local ON cid_clientes(local_carteira);

-- Feed do CRM passa a levar o LOCAL da carteira
DROP VIEW IF EXISTS cid_v_postagem_cliente;
CREATE VIEW cid_v_postagem_cliente AS
SELECT p.raw_id, p.origem, p.grafia, p.local_codigo, p.contrato, p.cartao, p.data_postagem, p.valor,
       n.cliente_id, c.nome AS cliente_nome, c.local_carteira, n.regra
FROM cid_postagens p
LEFT JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia
LEFT JOIN cid_nos n ON n.chave = g.no_chave
LEFT JOIN cid_clientes c ON c.id = n.cliente_id;
