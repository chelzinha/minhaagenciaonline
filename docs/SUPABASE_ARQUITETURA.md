# SUPABASE_ARQUITETURA

Arquitetura do banco de dados Supabase (PostgreSQL) da AGF José Bonifácio e as convenções
que valem para todos os módulos migrados.

## 1. Por que migrar para o Supabase

- A **BASE_TOTAL** (ledger de objetos postados) **ultrapassou o limite de linhas do Google
  Sheets**, que hoje é o "banco de dados" de todo o ecossistema AGF.
- Dashboards, CRM, Reverso e o /app dependem de Sheets lido via Apps Script — modelo que
  não escala e não suporta consultas relacionais/índices.
- Decisão: migrar para **Supabase (PostgreSQL)** de forma **gradual e em paralelo**, com
  **zero regressão**. Sheets e Supabase rodam juntos durante a transição; o que está em
  produção só é desligado após validação completa.

O **Apps Script continua sendo o motor de backend**. A mudança é a fonte dos dados: em vez
de `SpreadsheetApp`, passa a fazer chamadas HTTP à **API REST (PostgREST)** do Supabase,
através do cliente `apps-script/shared/SupabaseClient.gs`. O frontend não muda nesta fase.

## 2. Schemas e organização por módulo

A modelagem é organizada em **schemas PostgreSQL por módulo**:

| Schema   | Conteúdo |
|----------|----------|
| `core`   | Entidades compartilhadas: `eventos` (auditoria), `coletadores`, `movimentos` (BASE_TOTAL) e `movimentos_staging`. |
| `coleta` | Módulo greenfield **Rotas de Coleta** (separado do Reverso/`logistica`): `pontos_coleta`, `rotas`, `rota_paradas`, `coleta_objetos`. |

No Supabase, exponha `core` e `coleta` em **Project Settings → API → Exposed schemas**
(além de `public`). O `SupabaseClient.gs` seleciona o schema por requisição via headers
`Accept-Profile` (leitura) e `Content-Profile` (escrita).

Módulos futuros (CRM, dashboards/analytics) ganharão seus próprios schemas e serão migrados
sem pressa, um consumidor por vez.

## 3. Convenções de modelagem

- **PK**: `uuid` com default `gen_random_uuid()` (extensão `pgcrypto`).
- **Nomes**: `snake_case`; tabelas no plural.
- **Timestamps**: `created_at` / `updated_at timestamptz default now()` (UTC; conversão
  para America/Fortaleza fica na borda). `updated_at` mantido pelo trigger
  `core.set_updated_at()`.
- **Status/listas**: `text` + `CHECK` (ex.: `status_rota in ('planejada','em_andamento',
  'concluida','cancelada')`), evitando enums rígidos durante a transição.
- **Auditoria**: trigger `core.fn_audit_log()` grava INSERT/UPDATE/DELETE em `core.eventos`
  (entidade, ação, ator, payload `jsonb`). Aplicada onde há valor de trilha (ex.:
  `coleta.rotas`, `coleta.rota_paradas`).
- **Soft state**: preferir colunas `status_*` a deletes físicos.

## 4. Estratégia de autenticação

- O Apps Script (backend confiável, server-side) autentica com a **service_role key**,
  guardada nas **Script Properties** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- A **service_role NUNCA** vai para o frontend e **NUNCA** é versionada no repositório.
- O `SupabaseClient.gs` **recusa** qualquer chave que não seja service_role
  (aceita `sb_secret_*` ou JWT legacy com `role=service_role`; rejeita anon/publishable).
- O frontend continua falando apenas com o Apps Script — único detentor da chave.

## 5. RLS (Row Level Security) — default deny

- **Todas** as tabelas têm `ENABLE ROW LEVEL SECURITY`.
- **Nenhuma policy** é criada para `anon`/`authenticated` nesta fase ⇒ acesso negado por
  padrão para esses roles.
- A **service_role ignora RLS** por design (acesso server-side via Apps Script). Os GRANTs
  explícitos de schema/tabela para `service_role` estão em `0004_rls_policies.sql`, com
  `ALTER DEFAULT PRIVILEGES` cobrindo tabelas futuras.
- Quando o frontend passar a acessar o Supabase diretamente (fase futura), criaremos
  policies por role com Supabase Auth/JWT. Até lá, o default deny é a postura de segurança.

## 6. Módulos desta fundação

### 6.1 `coleta` — Rotas de Coleta (greenfield)
Primeiro módulo construído nativamente no Supabase. Fluxo:
`pontos_coleta` → `rotas` (cabeçalho diário por coletador) → `rota_paradas` (visitas
ordenadas) → `coleta_objetos` (itens coletados). `rotas.coletador_id` referencia
`core.coletadores`.

### 6.2 `core.movimentos` — migração da BASE_TOTAL
Tabela-alvo do ledger de objetos postados. A migração é detalhada em
`docs/SUPABASE_MIGRACAO_BASE_TOTAL.md`. Pontos-chave abaixo.

## 7. Chave natural do objeto postal

- A BASE_TOTAL é **editável** (linhas podem ser atualizadas após criadas).
- A **chave natural** é o campo **`objeto`** (código do objeto postal): **único, imutável,
  nunca se repete**. Em `core.movimentos` há `UNIQUE (objeto)`.
- Toda gravação usa **UPSERT idempotente**: `INSERT ... ON CONFLICT (objeto) DO UPDATE`.
  Isso torna backfill histórico e dual-write seguros contra reprocessamento.

## 8. Verificação aplicada

As migrations foram validadas em PostgreSQL 16 (roles `service_role`/`anon`/`authenticated`
criados antes): aplicação em ordem `0001→0005` + seed, e checagem de RLS ligado, grants do
service_role, triggers `updated_at` e de auditoria, upsert por `objeto` e a view
`core.v_reconciliacao_basetotal`. Procedimento reproduzível em `supabase/README.md`.
