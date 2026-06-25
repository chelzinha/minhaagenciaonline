# Supabase — AGF José Bonifácio

Fundação do banco PostgreSQL (Supabase) da AGF. Migração gradual e em paralelo a partir
do Google Sheets, sem regressão. O Apps Script continua sendo o motor de backend, agora
chamando a API REST (PostgREST) do Supabase via `apps-script/shared/SupabaseClient.gs`.

> Documentos de referência:
> - `docs/SUPABASE_ARQUITETURA.md` — decisões, schemas, convenções, auth, RLS.
> - `docs/SUPABASE_MIGRACAO_BASE_TOTAL.md` — plano de migração da BASE_TOTAL em 7 fases.

## Estrutura

```
supabase/
  migrations/
    0001_init_extensions_conventions.sql   extensões, schemas core/coleta, set_updated_at(), fn_audit_log()
    0002_core_reference.sql                core.eventos, core.coletadores
    0003_coleta_schema.sql                 módulo Rotas de Coleta (pontos, rotas, paradas, objetos)
    0004_rls_policies.sql                  RLS default-deny + grants service_role
    0005_core_movimentos_basetotal.sql     core.movimentos (BASE_TOTAL) + staging + view reconciliação
  seed/
    seed_coleta_dev.sql                    dados fictícios (prefixo TEST) para dev
```

## Schemas

- **core** — entidades compartilhadas: `eventos` (auditoria), `coletadores`, `movimentos`
  (alvo da BASE_TOTAL) e `movimentos_staging`.
- **coleta** — módulo greenfield Rotas de Coleta: `pontos_coleta`, `rotas`, `rota_paradas`,
  `coleta_objetos`. Separado do módulo Reverso (`apps-script/logistica`).

Em **Project Settings → API → Exposed schemas**, exponha `core` e `coleta` (além de `public`).

## Setup local com a Supabase CLI

Pré-requisitos: [Supabase CLI](https://supabase.com/docs/guides/cli) e Docker.

```bash
# 1. Inicializar (gera supabase/config.toml) — apenas na primeira vez
supabase init

# 2. Vincular ao projeto remoto (project-ref no painel do Supabase)
supabase link --project-ref <PROJECT_REF>

# 3. Subir stack local para testar as migrations
supabase start

# 4. Aplicar as migrations locais
supabase db reset           # recria o banco local e aplica todas as migrations em ordem
```

### Aplicar migrations no projeto REMOTO

```bash
supabase db push            # envia as migrations pendentes para o projeto vinculado
```

### Rodar o seed de desenvolvimento

O seed **não** deve rodar em produção. Local:

```bash
# via CLI (banco local)
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/seed/seed_coleta_dev.sql

# ou diretamente, informando a connection string local do supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed/seed_coleta_dev.sql
```

Limpeza dos dados de teste: ver bloco de comentário no topo de `seed/seed_coleta_dev.sql`
(todos os registros usam prefixo `TEST`).

### Validação rápida sem CLi (Postgres avulso)

As migrations foram validadas com PostgreSQL 16 criando antes os roles do Supabase:

```bash
psql -c "create role service_role; create role anon; create role authenticated;"
# depois aplicar 0001..0005 em ordem e, opcionalmente, o seed.
```

## Configurar o Apps Script (Script Properties)

O backend autentica com a **service_role** (nunca no frontend, nunca versionada).

1. No projeto Apps Script: **Configurações do projeto → Propriedades do script**.
2. Adicione:
   - `SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = a service_role key (Project Settings → API)
3. O `SupabaseClient.gs` recusa qualquer chave que não seja service_role
   (`sb_secret_*` ou JWT com `role=service_role`).

## Validar a conexão

No editor do Apps Script, rode a função:

```js
supabaseHealthCheck();
```

Ela faz um GET autenticado no endpoint REST raiz e loga o status. Resultado esperado:
`{ ok: true, status: 200, url: ... }`.

> Nota: o PostgREST não expõe `information_schema` por padrão, por isso o health check
> usa o ping no endpoint REST raiz para validar URL + service_role + conectividade num
> projeto recém-criado.

## Ordem de aplicação

Sempre aplicar na sequência numérica: `0001 → 0002 → 0003 → 0004 → 0005`. As migrations
são idempotentes (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP TRIGGER IF EXISTS`).
