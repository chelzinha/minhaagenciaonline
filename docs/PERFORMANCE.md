# PERFORMANCE

Documento tecnico em preparacao.

## Modulo Reverso - pontos de performance

Chamadas que merecem atencao:
- getDashboard: pode ficar pesado se montar resumo lendo muitas linhas.
- getUserHistory: pode crescer com historico e deve considerar limite, filtro ou paginacao.
- readEtiqueta: deve evitar varredura ampla de planilha quando possivel.
- confirmDropoff: deve priorizar escrita objetiva e segura.
- getUnitBySlug e getUnitStatus: candidatas a cache curto.

Pontos positivos identificados:
- Uso de LockService em pontos de escrita/concorrencia.
- Uso de setValues e escrita em lote em alguns fluxos.
- Separacao entre camada API e regra de negocio.

Melhorias futuras recomendadas:
- Avaliar CacheService para unidade/status.
- Avaliar limite ou paginacao em historico.
- Avaliar aba-resumo ou cache para dashboard.
- Evitar getDataRange().getValues() em abas grandes quando houver consulta especifica.

Observacao:
- Nenhuma otimizacao de codigo foi aplicada nesta etapa. Este registro e diagnostico tecnico.

## Modulo Atende - performance

Pontos aplicados:
- Importacoes usam `LockService` para reduzir risco de concorrencia.
- Leitura e atualizacao da aba `Postagens` usam matrizes com `getValues()`/`setValues()`.
- Linhas alteradas sao agrupadas em blocos antes de gravar.
- Endpoint de consulta do `/atende` usa `CacheService` apenas em consultas filtradas por data.
- Payloads de consulta maiores que 90 KB nao sao gravados no `CacheService`.
- Importacoes invalidam o cache e retornam apenas resumo pequeno, sem devolver a aba `Postagens` completa.

Cuidados futuros:
- Se a aba `Postagens` crescer muito, avaliar paginacao real no backend.
- Se os JSONs RAW ficarem grandes, avaliar politica de retencao/backup.
- Evitar consultas por data com varredura completa caso o volume cresca de forma relevante.

## Correcao - Argument too large no Atende

Problema identificado:
- Apos cada importacao, `buildImportResponse_` chamava `buscarDados()`.
- Isso fazia o Apps Script tentar devolver todas as postagens pelo `google.script.run`.
- `buscarDadosPorData_` tambem tentava salvar payloads grandes no `CacheService`.

Correcao aplicada:
- `buildImportResponse_` retorna somente resumo da importacao.
- `clearAtendeCache_()` e chamado no retorno da importacao.
- `CacheService.put` so e usado quando ha filtro de data.
- Antes de cachear, o backend mede `JSON.stringify(payload).length`.
- Payloads com 90.000 caracteres ou mais nao sao cacheados.
