-- Atende - contrato enriquecido para painel/filtros
-- Mantem observacao por compatibilidade historica, mas o novo Admin nao a utiliza.

ALTER TABLE atende_contratos ADD COLUMN cliente TEXT;

CREATE INDEX IF NOT EXISTS idx_atende_contratos_cliente
  ON atende_contratos(cliente);

CREATE INDEX IF NOT EXISTS idx_atende_contratos_tipo
  ON atende_contratos(tipo);

CREATE INDEX IF NOT EXISTS idx_atende_contratos_intermediador
  ON atende_contratos(nome);
