-- =====================================================================================
-- 0001_init_extensions_conventions.sql
-- Fundação do banco Supabase da AGF José Bonifácio.
-- Propósito:
--   * Habilitar extensões necessárias (pgcrypto p/ gen_random_uuid()).
--   * Criar os schemas de organização por módulo: core (compartilhado) e coleta (1º módulo).
--   * Criar utilitários reutilizáveis: trigger set_updated_at() e auditoria fn_audit_log().
-- Convenções gerais: PK uuid, snake_case, timestamptz (UTC), RLS default-deny (ver 0004).
-- Idempotente: pode ser reaplicada sem erro (IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================================

-- 1) Extensões -----------------------------------------------------------------------
-- pgcrypto fornece gen_random_uuid(), usado como default das PKs.
create extension if not exists pgcrypto;

-- 2) Schemas por módulo --------------------------------------------------------------
-- core   : entidades compartilhadas (auditoria, coletadores, movimentos/BASE_TOTAL).
-- coleta : módulo greenfield "Rotas de Coleta" (separado do Reverso atual).
create schema if not exists core;
create schema if not exists coleta;

comment on schema core   is 'Entidades compartilhadas entre módulos (auditoria, coletadores, movimentos).';
comment on schema coleta is 'Módulo greenfield Rotas de Coleta (separado do Reverso/logistica).';

-- 3) Trigger function reutilizável: set_updated_at() ---------------------------------
-- Mantém a coluna updated_at sempre com o timestamp da última alteração da linha.
-- Aplicar como BEFORE UPDATE em qualquer tabela que tenha a coluna updated_at.
create or replace function core.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function core.set_updated_at() is
  'Trigger BEFORE UPDATE: atualiza updated_at = now() na linha alterada.';

-- 4) Função de auditoria reutilizável: fn_audit_log() --------------------------------
-- Trigger AFTER INSERT/UPDATE/DELETE que registra o evento em core.eventos.
-- Observação: core.eventos é criada na migration 0002. O corpo de uma função plpgsql
-- só é resolvido em tempo de execução, então a referência adiantada é segura.
-- Ator: tenta a GUC de aplicação 'app.ator' (set via SET app.ator = '...'); senão current_user.
create or replace function core.fn_audit_log()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_ator    text;
  v_payload jsonb;
  v_entidade text := tg_table_schema || '.' || tg_table_name;
begin
  begin
    v_ator := current_setting('app.ator', true);
  exception when others then
    v_ator := null;
  end;
  if v_ator is null or v_ator = '' then
    v_ator := current_user;
  end if;

  if tg_op = 'DELETE' then
    v_payload := to_jsonb(old);
  else
    v_payload := to_jsonb(new);
  end if;

  insert into core.eventos (entidade, acao, ator, payload)
  values (v_entidade, tg_op, v_ator, v_payload);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function core.fn_audit_log() is
  'Trigger de auditoria: grava INSERT/UPDATE/DELETE em core.eventos (entidade, acao, ator, payload).';
