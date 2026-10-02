-- 0106 - CRM: dados do cadastro do Portal Postal no crm_cadastro (02/10/2026)
-- Contrato proprio do cliente (Portal Postal), separado do contrato usado nas postagens (que continua vindo do Visao 360).
-- ATENCAO: aplicada direto no D1 de producao em 02/10/2026, junto com a carga dos 302 clientes do Portal
-- (backup: tabela crm_cadastro_bkp_20261002). Registrada em d1_migrations para o "migrate:remote" nao rodar de novo.
ALTER TABLE crm_cadastro ADD COLUMN CODIGO_PORTAL TEXT;
ALTER TABLE crm_cadastro ADD COLUMN CONTRATO_PORTAL TEXT;
ALTER TABLE crm_cadastro ADD COLUMN CARTAO_PORTAL TEXT;
ALTER TABLE crm_cadastro ADD COLUMN COD_ADM_PORTAL TEXT;
ALTER TABLE crm_cadastro ADD COLUMN TIPO_CONTRATO_PORTAL TEXT;
ALTER TABLE crm_cadastro ADD COLUMN VIGENCIA_CONTRATO_PORTAL TEXT;
