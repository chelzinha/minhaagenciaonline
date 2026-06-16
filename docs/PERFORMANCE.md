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
