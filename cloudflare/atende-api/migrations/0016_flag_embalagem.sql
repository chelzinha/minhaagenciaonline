-- ============================================================
-- ATENDE - FLAG EXPLICITA DE EMBALAGEM
-- Substitui o LIKE '%CAIXA%' / '%ENVELOPE BOLHA%' do Worker,
-- que nao capturava itens como "Envelope Convencional Oficio",
-- "Envelope Saco I" e "Envelope Basico RPC" (todos R1 G1).
-- O Worker mantem o LIKE como fallback: se a flag nao estiver
-- marcada em nenhum servico, o comportamento antigo continua.
-- ============================================================

ALTER TABLE atende_servico_classificacao
  ADD COLUMN eh_embalagem INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_atende_servico_eh_embalagem
  ON atende_servico_classificacao(eh_embalagem);

-- Codigos confirmados no Anexo 3 (R1 G1, base 100% sobre a venda).
UPDATE atende_servico_classificacao
   SET eh_embalagem = 1
 WHERE codigo_servico IN (
   '116601558','116601566','116601540','116601728','765000911','765000660'
 );

-- Demais itens R1 G1 do contrato com nome de embalagem.
-- Cobre caixa, envelope (todos os tipos), saco e plastico bolha.
UPDATE atende_servico_classificacao
   SET eh_embalagem = 1
 WHERE REPLACE(REPLACE(UPPER(TRIM(COALESCE(tabela,''))),' ',''),'-','') = 'R1G1'
   AND (
        UPPER(COALESCE(nome_servico_referencia,'')) LIKE '%CAIXA%'
     OR UPPER(COALESCE(nome_servico_referencia,'')) LIKE '%ENVELOPE%'
     OR UPPER(COALESCE(nome_servico_referencia,'')) LIKE '%EMBALAGEM%'
     OR UPPER(COALESCE(nome_servico_referencia,'')) LIKE '%PLASTICO BOLHA%'
   )
   -- Selos e capitalizacao tambem sao R1 G1 e nao sao embalagem.
   AND UPPER(COALESCE(nome_servico_referencia,'')) NOT LIKE '%SELO%'
   AND UPPER(COALESCE(nome_servico_referencia,'')) NOT LIKE '%TELESENA%'
   AND UPPER(COALESCE(nome_servico_referencia,'')) NOT LIKE '%CAIXA POSTAL%';
