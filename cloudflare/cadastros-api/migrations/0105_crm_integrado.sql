-- CRM integrado (Clientes + Agenda + Curva ABC), 29/09/2026.
-- Migração ADITIVA: só acrescenta colunas e um tipo de atividade. Nada é apagado nem renomeado.
-- O código antigo continua funcionando com esta migração aplicada (as colunas novas têm valor padrão).

-- 1) Atividade sem vínculo (AVULSA): título próprio, sem cliente, prospect ou tratativa.
ALTER TABLE crm_agenda ADD COLUMN TITULO TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_tipos_atividade ADD COLUMN APLICA_AVULSA TEXT NOT NULL DEFAULT 'NAO';

-- 2) Tipos que podem ser usados sem vínculo.
UPDATE crm_tipos_atividade SET APLICA_AVULSA = 'SIM' WHERE TIPO_ATIVIDADE_ID IN ('ATV_TREINAMENTO', 'ATV_REUNIAO_ONLINE');

-- 3) Tipo novo: Reunião interna (só sem vínculo, não exige resultado).
INSERT OR IGNORE INTO crm_tipos_atividade
  (TIPO_ATIVIDADE_ID, NOME_EXIBICAO, CATEGORIA, ICONE, COR, DURACAO_PADRAO_MIN, USA_BLOCO, PERMITE_HORARIO_LIVRE, EXIGE_RESULTADO,
   ACEITA_MIDIA, APLICA_PROSPECT, APLICA_CLIENTE, ATIVA, ORDEM, APLICA_AVULSA)
VALUES ('ATV_REUNIAO_INTERNA', 'Reunião interna', 'INTERNO', 'groups', '#475569', 60, 'NAO', 'SIM', 'NAO', 'NAO', 'NAO', 'NAO', 'SIM', 9, 'SIM');

-- 4) Índices para a Agenda filtrar por LOCAL e responsável sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_crm_agenda_local_data ON crm_agenda(LOCAL, DATA_PROGRAMADA);
CREATE INDEX IF NOT EXISTS idx_crm_agenda_entidade ON crm_agenda(ENTIDADE_ID, STATUS_ATIVIDADE, DATA_PROGRAMADA);
