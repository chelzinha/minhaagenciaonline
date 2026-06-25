-- =====================================================================================
-- 0004_rls_policies.sql
-- Propósito:
--   * Confirmar a postura de segurança: RLS ligado SEM policies => default deny.
--   * Conceder acesso ao role service_role (usado server-side pelo Apps Script).
--   * Garantir, via ALTER DEFAULT PRIVILEGES, que tabelas futuras dos schemas
--     core/coleta (ex.: 0005) também fiquem acessíveis ao service_role.
-- Depende de: 0001 (schemas), 0002, 0003 (tabelas).
--
-- MODELO DE ACESSO
--   - service_role: chave secreta usada SOMENTE no backend (Apps Script). Ignora RLS
--     por design no Supabase; aqui garantimos também os GRANTs de tabela/schema.
--   - anon / authenticated: SEM policies neste momento => acesso negado. As policies
--     para esses roles só serão criadas quando o frontend passar a acessar o Supabase
--     diretamente (fase futura), com Supabase Auth/JWT. Até lá, todo acesso é via
--     Apps Script com service_role.
-- =====================================================================================

-- 1) Uso dos schemas pelo service_role -----------------------------------------------
grant usage on schema core   to service_role;
grant usage on schema coleta to service_role;

-- 2) Acesso total às tabelas existentes ----------------------------------------------
grant all privileges on all tables in schema core   to service_role;
grant all privileges on all tables in schema coleta to service_role;

-- Sequências (caso surjam colunas serial/identity no futuro).
grant all privileges on all sequences in schema core   to service_role;
grant all privileges on all sequences in schema coleta to service_role;

-- 3) Privilégios default para objetos FUTUROS ----------------------------------------
-- Cobre tabelas criadas em migrations posteriores (ex.: 0005 core.movimentos) sem
-- precisar repetir o GRANT manualmente. Aplica-se a objetos criados pelo role corrente.
alter default privileges in schema core
  grant all privileges on tables to service_role;
alter default privileges in schema coleta
  grant all privileges on tables to service_role;

alter default privileges in schema core
  grant all privileges on sequences to service_role;
alter default privileges in schema coleta
  grant all privileges on sequences to service_role;

-- 4) Lembrete (default deny) ---------------------------------------------------------
-- Nenhuma policy é criada aqui para anon/authenticated: a ausência de policy com RLS
-- ligado significa "negar tudo" para esses roles. Não conceder acesso a anon/public.
