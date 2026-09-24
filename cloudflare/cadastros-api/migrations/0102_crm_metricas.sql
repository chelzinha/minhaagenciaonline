-- CRM (aba CLIENTES) calculado a partir do Visao 360.
-- 1) cid_postagens passa a guardar as colunas do Atende que definem o tipo de negocio.
ALTER TABLE cid_postagens ADD COLUMN intermediador TEXT NOT NULL DEFAULT '';   -- INTERMEDIADOR do Atende (VR, PORTAL POSTAL, INTERMEDIADOR, CONTRATO ECT)
ALTER TABLE cid_postagens ADD COLUMN contrato_tipo TEXT NOT NULL DEFAULT '';   -- TIPO do Atende (PLATINUM, SUPERFRETE, CLUBE CORREIOS...)
ALTER TABLE cid_postagens ADD COLUMN subgrupo TEXT NOT NULL DEFAULT '';        -- subgrupo do servico (SEDEX, PAC, Reverso...)
ALTER TABLE cid_postagens ADD COLUMN estorno INTEGER NOT NULL DEFAULT 0;

-- 2) Resultado do motor do CRM: 1 linha por cliente. Curva e acao calculadas dentro do LOCAL da carteira.
CREATE TABLE IF NOT EXISTS crm_metricas (
  cliente_id      TEXT PRIMARY KEY,
  local           TEXT NOT NULL,                  -- AGF | BALCAO | METRO | SEM_LOCAL
  curva           TEXT NOT NULL DEFAULT 'C',
  acao            TEXT NOT NULL DEFAULT 'MANTER',
  sub_acao        TEXT NOT NULL DEFAULT '',
  prioridade      TEXT NOT NULL DEFAULT 'BAIXA',
  nome            TEXT NOT NULL DEFAULT '',
  prioridade_rank INTEGER NOT NULL DEFAULT 0,     -- CRITICA 4, ALTA 3, MEDIA 2, BAIXA 1
  score           INTEGER NOT NULL DEFAULT 0,
  share           REAL NOT NULL DEFAULT 0,        -- participacao no faturamento 30d do LOCAL
  status          TEXT NOT NULL DEFAULT '',
  perfil          TEXT NOT NULL DEFAULT '',
  fat_30d         REAL NOT NULL DEFAULT 0,
  ultima          TEXT NOT NULL DEFAULT '',
  dados           TEXT NOT NULL,                  -- todas as colunas do antigo CLIENTES_MASTER (JSON)
  assinatura      TEXT NOT NULL DEFAULT '',       -- hash de dados: so grava o que mudou
  calculado_em    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_metricas_fila ON crm_metricas(local, prioridade_rank DESC, score DESC, share DESC);
CREATE INDEX IF NOT EXISTS idx_crm_metricas_acao ON crm_metricas(local, acao);

-- 3) Controle. O marco "crm_min_passagem" e gravado pelo proprio Worker na primeira sincronizacao com o codigo novo
--    (ele recomeca a passagem para preencher as colunas acima). Assim esta migracao pode ser aplicada antes do deploy.
INSERT INTO cid_estado(chave, valor) VALUES ('crm_pendente', '1') ON CONFLICT(chave) DO UPDATE SET valor = '1';
