-- =====================================================================================
-- 0005_core_movimentos_basetotal.sql
-- Propósito:
--   Tabela-alvo da migração da BASE_TOTAL (Google Sheets -> Supabase).
--   * core.movimentos: ledger de objetos postados. Chave natural = `objeto`
--     (único, imutável, nunca se repete). BASE_TOTAL é editável => usamos UPSERT
--     por `objeto` (ON CONFLICT (objeto) DO UPDATE).
--   * core.movimentos_staging: área de pouso para importação em lote (sem constraints).
--   * core.v_reconciliacao_basetotal: compara contagem e soma de valor por data entre
--     staging e a tabela final, para validar o backfill/dual-write.
--   * Índices de consulta + RLS + trigger updated_at.
-- Depende de: 0001 (pgcrypto, schema core, set_updated_at), 0004 (default privileges).
-- =====================================================================================

-- 1) Tabela final: core.movimentos ---------------------------------------------------
create table if not exists core.movimentos (
  id              uuid primary key default gen_random_uuid(),
  objeto          text not null unique,        -- CHAVE NATURAL: código do objeto postal
  data            date not null,
  categoria       text,
  tipo_servico    text,
  razao_social    text,
  local           text,
  grupo           text,
  valor           numeric(12, 2),
  qtd             integer,
  intermediador   text,
  usuario_padrao  text,
  numero_contrato text,
  cartao_postagem text,
  nome_servico    text,
  segmento        text,
  cx_prefixo      text,
  codigo_ect      text,
  ad_codigo       text,
  origem          text not null default 'sheets',
  importado_em    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table  core.movimentos is 'Ledger de objetos postados (migração da BASE_TOTAL). Chave natural: objeto.';
comment on column core.movimentos.objeto is 'Código do objeto postal — único, imutável, nunca se repete. Chave de upsert.';
comment on column core.movimentos.origem is 'Origem do registro (ex.: sheets, app, api).';

-- Índices de consulta (dashboards/relatórios).
create index if not exists ix_movimentos_data on core.movimentos (data);
create index if not exists ix_movimentos_categoria on core.movimentos (categoria);
create index if not exists ix_movimentos_numero_contrato on core.movimentos (numero_contrato);
create index if not exists ix_movimentos_usuario_padrao on core.movimentos (usuario_padrao);

-- Trigger updated_at.
drop trigger if exists trg_movimentos_updated_at on core.movimentos;
create trigger trg_movimentos_updated_at
  before update on core.movimentos
  for each row execute function core.set_updated_at();

-- RLS default deny (service_role ignora; grants vindos das default privileges de 0004).
alter table core.movimentos enable row level security;

-- PADRÃO DE UPSERT (referência — executado pelo Apps Script / backfill):
--   insert into core.movimentos (objeto, data, categoria, ... )
--   values (...)
--   on conflict (objeto) do update set
--     data = excluded.data,
--     categoria = excluded.categoria,
--     tipo_servico = excluded.tipo_servico,
--     razao_social = excluded.razao_social,
--     local = excluded.local,
--     grupo = excluded.grupo,
--     valor = excluded.valor,
--     qtd = excluded.qtd,
--     intermediador = excluded.intermediador,
--     usuario_padrao = excluded.usuario_padrao,
--     numero_contrato = excluded.numero_contrato,
--     cartao_postagem = excluded.cartao_postagem,
--     nome_servico = excluded.nome_servico,
--     segmento = excluded.segmento,
--     cx_prefixo = excluded.cx_prefixo,
--     codigo_ect = excluded.codigo_ect,
--     ad_codigo = excluded.ad_codigo,
--     origem = excluded.origem,
--     updated_at = now();

-- 2) Staging de importação: core.movimentos_staging ----------------------------------
-- Mesma estrutura de colunas de negócio, SEM constraints (permite carga bruta e
-- detecção de duplicidades/divergências antes de promover para core.movimentos).
create table if not exists core.movimentos_staging (
  objeto          text,
  data            date,
  categoria       text,
  tipo_servico    text,
  razao_social    text,
  local           text,
  grupo           text,
  valor           numeric(12, 2),
  qtd             integer,
  intermediador   text,
  usuario_padrao  text,
  numero_contrato text,
  cartao_postagem text,
  nome_servico    text,
  segmento        text,
  cx_prefixo      text,
  codigo_ect      text,
  ad_codigo       text,
  origem          text default 'sheets',
  importado_em    timestamptz default now()
);

comment on table core.movimentos_staging is
  'Área de pouso (sem constraints) para importação em lote da BASE_TOTAL antes de promover para core.movimentos.';

-- Não habilitamos updated_at aqui (staging é descartável/recarregável).
alter table core.movimentos_staging enable row level security;

-- 3) View de reconciliação: core.v_reconciliacao_basetotal --------------------------
-- Compara, por data, a contagem de objetos e a soma de valor entre staging e final.
-- diff_qtd / diff_valor = 0 indicam paridade total para aquela data.
create or replace view core.v_reconciliacao_basetotal as
with s as (
  select data, count(*)::bigint as qtd_staging, coalesce(sum(valor), 0) as valor_staging
  from core.movimentos_staging
  group by data
),
m as (
  select data, count(*)::bigint as qtd_movimentos, coalesce(sum(valor), 0) as valor_movimentos
  from core.movimentos
  group by data
)
select
  coalesce(s.data, m.data)                                   as data,
  coalesce(s.qtd_staging, 0)                                 as qtd_staging,
  coalesce(m.qtd_movimentos, 0)                              as qtd_movimentos,
  coalesce(s.qtd_staging, 0) - coalesce(m.qtd_movimentos, 0) as diff_qtd,
  coalesce(s.valor_staging, 0)                               as valor_staging,
  coalesce(m.valor_movimentos, 0)                            as valor_movimentos,
  coalesce(s.valor_staging, 0) - coalesce(m.valor_movimentos, 0) as diff_valor
from s
full outer join m on s.data = m.data
order by data;

comment on view core.v_reconciliacao_basetotal is
  'Reconciliação BASE_TOTAL: contagem e soma de valor por data, staging vs core.movimentos (diff=0 => paridade).';
