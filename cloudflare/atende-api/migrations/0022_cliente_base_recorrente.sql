-- ============================================================
-- ATENDE - BASE RECORRENTE MANUAL POR CLIENTE (V6)
-- Valor mensal informado pela gestao. Quando preenchido, substitui
-- a Media 3M do cliente nos indicadores que usam historico
-- (base recorrente, queda de clientes, radar R5 e sinais).
-- Uso tipico: cliente que saiu de campanha e cuja Media 3M
-- ficou inflada pelos meses de campanha.
-- NULL = usa a Media 3M calculada (comportamento anterior).
-- ============================================================

ALTER TABLE atende_cliente_receita_classificacao ADD COLUMN base_recorrente_mensal REAL;
