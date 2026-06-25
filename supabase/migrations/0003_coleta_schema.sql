-- =====================================================================================
-- 0003_coleta_schema.sql
-- Propósito:
--   Modelar o módulo greenfield "Rotas de Coleta" (schema coleta), separado do Reverso.
--   Entidades: pontos_coleta -> rotas -> rota_paradas -> coleta_objetos.
--   * RLS default deny em todas (grants em 0004).
--   * Trigger updated_at em todas.
--   * Auditoria (INSERT/UPDATE) em rotas e rota_paradas via core.fn_audit_log().
-- Depende de: 0001 (schema coleta, set_updated_at, fn_audit_log) e 0002 (core.coletadores).
-- =====================================================================================

-- 1) coleta.pontos_coleta ------------------------------------------------------------
-- Ponto/cliente visitado em uma rota de coleta.
create table if not exists coleta.pontos_coleta (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  razao_social       text,
  cnpj_cpf           text,
  endereco           text,
  numero             text,
  complemento        text,
  bairro             text,
  cep                text,
  cidade             text,
  uf                 text,
  latitude           numeric(10, 7),
  longitude          numeric(10, 7),
  janela_atendimento text,                 -- ex.: "08:00-12:00" ou descrição livre
  status_ponto       text not null default 'ativo'
                     check (status_ponto in ('ativo', 'inativo', 'bloqueado')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table coleta.pontos_coleta is 'Pontos/clientes visitados nas rotas de coleta.';

create index if not exists ix_pontos_coleta_status on coleta.pontos_coleta (status_ponto);

drop trigger if exists trg_pontos_coleta_updated_at on coleta.pontos_coleta;
create trigger trg_pontos_coleta_updated_at
  before update on coleta.pontos_coleta
  for each row execute function core.set_updated_at();

alter table coleta.pontos_coleta enable row level security;

-- 2) coleta.rotas --------------------------------------------------------------------
-- Cabeçalho do roteiro diário de um coletador.
create table if not exists coleta.rotas (
  id           uuid primary key default gen_random_uuid(),
  data_rota    date not null,
  coletador_id uuid references core.coletadores (id),
  status_rota  text not null default 'planejada'
               check (status_rota in ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  hora_inicio  time,
  hora_fim     time,
  observacao   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table coleta.rotas is 'Cabeçalho do roteiro diário de coleta (uma rota por coletador/dia).';

create index if not exists ix_rotas_data on coleta.rotas (data_rota);
create index if not exists ix_rotas_coletador on coleta.rotas (coletador_id);
create index if not exists ix_rotas_status on coleta.rotas (status_rota);

drop trigger if exists trg_rotas_updated_at on coleta.rotas;
create trigger trg_rotas_updated_at
  before update on coleta.rotas
  for each row execute function core.set_updated_at();

-- Auditoria de rotas (insert/update).
drop trigger if exists trg_rotas_audit on coleta.rotas;
create trigger trg_rotas_audit
  after insert or update on coleta.rotas
  for each row execute function core.fn_audit_log();

alter table coleta.rotas enable row level security;

-- 3) coleta.rota_paradas -------------------------------------------------------------
-- Paradas ordenadas dentro de uma rota.
create table if not exists coleta.rota_paradas (
  id              uuid primary key default gen_random_uuid(),
  rota_id         uuid not null references coleta.rotas (id) on delete cascade,
  ponto_coleta_id uuid not null references coleta.pontos_coleta (id),
  ordem           integer not null default 1,
  status_parada   text not null default 'pendente'
                  check (status_parada in ('pendente', 'em_andamento', 'concluida', 'falha', 'cancelada')),
  hora_prevista   time,
  hora_chegada    time,
  hora_saida      time,
  qtde_coletada   integer not null default 0,
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table coleta.rota_paradas is 'Paradas ordenadas de uma rota (visita a um ponto de coleta).';

create index if not exists ix_rota_paradas_rota on coleta.rota_paradas (rota_id);
create index if not exists ix_rota_paradas_ponto on coleta.rota_paradas (ponto_coleta_id);

drop trigger if exists trg_rota_paradas_updated_at on coleta.rota_paradas;
create trigger trg_rota_paradas_updated_at
  before update on coleta.rota_paradas
  for each row execute function core.set_updated_at();

-- Auditoria de paradas (insert/update).
drop trigger if exists trg_rota_paradas_audit on coleta.rota_paradas;
create trigger trg_rota_paradas_audit
  after insert or update on coleta.rota_paradas
  for each row execute function core.fn_audit_log();

alter table coleta.rota_paradas enable row level security;

-- 4) coleta.coleta_objetos -----------------------------------------------------------
-- Objetos efetivamente coletados em uma parada.
create table if not exists coleta.coleta_objetos (
  id              uuid primary key default gen_random_uuid(),
  rota_parada_id  uuid not null references coleta.rota_paradas (id) on delete cascade,
  tipo_servico    text,
  qtd             integer not null default 1,
  valor           numeric(12, 2),
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table coleta.coleta_objetos is 'Objetos coletados em uma parada da rota.';

create index if not exists ix_coleta_objetos_parada on coleta.coleta_objetos (rota_parada_id);

drop trigger if exists trg_coleta_objetos_updated_at on coleta.coleta_objetos;
create trigger trg_coleta_objetos_updated_at
  before update on coleta.coleta_objetos
  for each row execute function core.set_updated_at();

alter table coleta.coleta_objetos enable row level security;
