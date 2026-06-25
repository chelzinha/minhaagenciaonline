# SUPABASE_MIGRACAO_BASE_TOTAL

Plano de migração da **BASE_TOTAL** (Google Sheets → Supabase/`core.movimentos`), em
**paralelo** e com **zero regressão**. O Sheets só é desligado após validação completa.

## Princípios

- **Chave natural**: campo **`objeto`** (código do objeto postal) — único, imutável, nunca
  se repete. `UNIQUE (objeto)` em `core.movimentos`.
- **BASE_TOTAL é editável**: linhas podem mudar após criadas ⇒ toda gravação é
  **UPSERT idempotente**: `INSERT ... ON CONFLICT (objeto) DO UPDATE SET ..., updated_at=now()`.
- **Dual-write antes de cutover**: Sheets e Supabase recebem as mesmas escritas até a
  paridade ser comprovada.
- **Reconciliação como gate**: nenhum consumidor migra a leitura sem `diff_qtd = 0` e
  `diff_valor = 0` na view `core.v_reconciliacao_basetotal`.

## Estruturas envolvidas (já criadas em `0005`)

- `core.movimentos` — tabela final (com `UNIQUE(objeto)`, índices em `data`, `categoria`,
  `numero_contrato`, `usuario_padrao`, trigger `updated_at`, RLS).
- `core.movimentos_staging` — área de pouso sem constraints, para carga bruta em lote.
- `core.v_reconciliacao_basetotal` — contagem e soma de `valor` por `data`, staging vs
  final (`diff_qtd` / `diff_valor` = 0 ⇒ paridade).

## Fases

### Fase 0 — Validação com 1 mês de dados
- Exportar **1 mês** da BASE_TOTAL para CSV e carregar em `core.movimentos_staging`.
- Promover para `core.movimentos` via upsert por `objeto`.
- Rodar `core.v_reconciliacao_basetotal` e conferir `diff = 0` para todas as datas do mês.
- Objetivo: validar mapeamento de colunas, tipos (`valor numeric`, `data date`, `qtd int`)
  e a unicidade de `objeto` em dados reais. **Gate** para seguir.

### Fase 1 — Backfill histórico (dados > 6 meses)
- Exportar o histórico em **blocos** (ex.: por mês/ano), dado o volume que estourou o Sheets.
- Carregar cada bloco em `staging` → promover via upsert → truncar staging → próximo bloco.
- Reconciliar por período após cada bloco. Backfill é idempotente (upsert por `objeto`),
  então pode ser reexecutado com segurança.

### Fase 2 — Dual-write (Sheets + Supabase em paralelo)
- O Apps Script passa a gravar **cada nova/alterada postagem** no Sheets **e** no Supabase
  (`supabaseUpsert('core','movimentos', row, 'objeto')`).
- Sheets permanece como produção. Falha de escrita no Supabase é logada sem quebrar o fluxo
  do Sheets (resiliência durante a transição).

### Fase 3 — Validação via view de reconciliação
- Comparar Sheets vs Supabase de forma contínua (carga periódica do Sheets em `staging`
  + `core.v_reconciliacao_basetotal`).
- Investigar e zerar qualquer `diff_qtd`/`diff_valor`. **Gate**: paridade estável por um
  período acordado antes de migrar leituras.

### Fase 4 — Cutover de leitura por consumidor (um por vez)
- Migrar a **leitura** de cada consumidor (dashboard, painel, CRM) para o Supabase,
  **um de cada vez**, validando cada um antes de seguir.
- Métricas derivadas (curva ABC, FAT_30D, ticket) passam a vir de **views/materialized
  views** no Supabase, substituindo o cálculo em JS no Apps Script.

### Fase 5 — Desligar escrita no Sheets
- Após **todos** os consumidores lerem do Supabase e validados, encerrar o **dual-write**:
  o Supabase passa a ser a única fonte de escrita.

### Fase 6 — Sheets read-only por 30 dias, depois arquiva
- Tornar a BASE_TOTAL no Sheets **somente leitura** por **30 dias** (janela de segurança/
  rollback).
- Encerrado o período sem incidentes, **arquivar** a planilha. Migração concluída.

## Estratégia de upsert (referência)

```sql
insert into core.movimentos
  (objeto, data, categoria, tipo_servico, razao_social, local, grupo, valor, qtd,
   intermediador, usuario_padrao, numero_contrato, cartao_postagem, nome_servico,
   segmento, cx_prefixo, codigo_ect, ad_codigo, origem)
values (...)
on conflict (objeto) do update set
  data            = excluded.data,
  categoria       = excluded.categoria,
  tipo_servico    = excluded.tipo_servico,
  razao_social    = excluded.razao_social,
  local           = excluded.local,
  grupo           = excluded.grupo,
  valor           = excluded.valor,
  qtd             = excluded.qtd,
  intermediador   = excluded.intermediador,
  usuario_padrao  = excluded.usuario_padrao,
  numero_contrato = excluded.numero_contrato,
  cartao_postagem = excluded.cartao_postagem,
  nome_servico    = excluded.nome_servico,
  segmento        = excluded.segmento,
  cx_prefixo      = excluded.cx_prefixo,
  codigo_ect      = excluded.codigo_ect,
  ad_codigo       = excluded.ad_codigo,
  origem          = excluded.origem,
  updated_at      = now();
```

## Rollback

Enquanto o dual-write estiver ativo (Fases 2–5) e nos 30 dias da Fase 6, o Sheets continua
íntegro como fonte de rollback. O upsert por `objeto` garante que reprocessar dados do
Sheets para o Supabase nunca duplica linhas.

## Observação sobre colunas

`core.movimentos` inclui campos especificados para a migração (`grupo`, `nome_servico`,
`cx_prefixo`, `codigo_ect`, `ad_codigo`, além de `segmento`) que podem não existir hoje no
mapeamento de código da BASE_TOTAL. Na Fase 0, confirmar o mapeamento real coluna-a-coluna
do Sheets para estes campos antes do backfill em massa.
