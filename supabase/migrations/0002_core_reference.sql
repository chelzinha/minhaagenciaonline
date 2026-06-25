-- =====================================================================================
-- 0002_core_reference.sql
-- Propósito:
--   * Criar core.eventos: trilha de auditoria central (alimentada por core.fn_audit_log()).
--   * Criar core.coletadores: cadastro de coletadores, compartilhável entre módulos.
--   * Ligar RLS (default deny) em ambas — grants para service_role ficam em 0004.
--   * Aplicar trigger updated_at em coletadores.
-- Depende de: 0001 (pgcrypto, schema core, core.set_updated_at()).
-- =====================================================================================

-- 1) core.eventos --------------------------------------------------------------------
-- Tabela-alvo da auditoria. NÃO usa updated_at (registro imutável de evento).
create table if not exists core.eventos (
  id        uuid primary key default gen_random_uuid(),
  entidade  text not null,               -- schema.tabela que originou o evento
  acao      text not null,               -- INSERT | UPDATE | DELETE (ou ação de negócio)
  ator      text,                        -- usuário/role ou app.ator responsável
  payload   jsonb,                       -- snapshot da linha (to_jsonb)
  criado_em timestamptz not null default now()
);

comment on table  core.eventos is 'Trilha de auditoria central; alimentada por core.fn_audit_log().';
comment on column core.eventos.entidade is 'Identificador schema.tabela da entidade auditada.';
comment on column core.eventos.acao     is 'Operação registrada (INSERT/UPDATE/DELETE ou ação de negócio).';

create index if not exists ix_eventos_entidade on core.eventos (entidade);
create index if not exists ix_eventos_criado_em on core.eventos (criado_em);

-- RLS default deny (sem policies => ninguém acessa; service_role ignora RLS).
alter table core.eventos enable row level security;

-- 2) core.coletadores ----------------------------------------------------------------
create table if not exists core.coletadores (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cpf              text,
  telefone         text,
  status_coletador text not null default 'ativo'
                   check (status_coletador in ('ativo', 'inativo', 'suspenso')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  core.coletadores is 'Cadastro de coletadores, compartilhável entre módulos (ex.: coleta.rotas).';
comment on column core.coletadores.status_coletador is 'ativo | inativo | suspenso.';

create index if not exists ix_coletadores_status on core.coletadores (status_coletador);

-- Trigger updated_at.
drop trigger if exists trg_coletadores_updated_at on core.coletadores;
create trigger trg_coletadores_updated_at
  before update on core.coletadores
  for each row execute function core.set_updated_at();

-- RLS default deny.
alter table core.coletadores enable row level security;
