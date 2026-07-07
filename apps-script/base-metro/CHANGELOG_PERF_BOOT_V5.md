# CHANGELOG - PERF BOOT V5

## Objetivo
Reduzir o boot do CRM (get_crm_boot_v4, ~26,5s frio) para poucos segundos, com boot progressivo e cache que sobrevive a escritas.

## Arquivos
- `16_CRM_PERF_V5.js` (NOVO): camada de performance. Cache de agenda em janela unica (+-400d), entidades lite, Properties memoizado, cache em chunks com getAll, single-flight com LockService, actions `get_crm_boot_lite_v5`, `warm_crm_cache_v5`, `clear_crm_cache_v5`.
- `06_CRM_JORNADA_FASE3.js` (MODIFICADO):
  - `crm3_readAgendaV3_` delega para `crm5x_agendaSlice_` (1 scan da AGENDA por revisao, em vez de 3 por boot). Scan legado preservado em `crm3_readAgendaV3_scan_`.
  - `crm3_apiGetJornada_` usa mapas de entidades lite (leitura); fluxos de escrita seguem com `crm3_buildEntityMaps_` full.
  - `crm3_apiGetConfig_` cacheado inteiro sob revisao de config (POSTs nao invalidam; TTL 600s + clear manual).
  - `crm3_readObjects_` com chave de config para abas de configuracao.
  - `crm3_assertSetupReady_` e `crm3_cacheKey_` memoizados (elimina dezenas de chamadas ao PropertiesService por boot).
  - `crm3_bumpCacheRev_` propaga o bump para os memos do V5.
- `10_OPERACAO_EXECUCAO_API.js` (MODIFICADO): 3 rotas novas no `op_doGet`. Nada removido.

## Invalidação de cache
- Dados (agenda, tratativas, entidades): invalidados automaticamente a cada POST (mesma semantica de antes, via `crm3_bumpCacheRev_`).
- Config: TTL 600s ou `?action=clear_crm_cache_v5` para forcar na hora.

## Gatilho recomendado (cold start)
Editor Apps Script > Acionadores > funcao `crm5x_warmupTrigger` > tempo > a cada 10 min.

## Compatibilidade
- `get_crm_boot_v4` e `get_crm_boot_v3` continuam funcionando (e ficam rapidas).
- Nenhuma funcao removida ou com assinatura alterada. Inventario de funcoes verificado antes/depois.
