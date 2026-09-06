# Atende - Performance

## 2026-09-05 - Importação CSV diária

**Tela:** `/atende`  
**Problema:** incorporar relatório diário sem aumentar o tempo de carregamento do painel.  
**Fonte:** CSV do Atende salvo no Google Drive.

## Estratégia aplicada

O frontend não processa nem lê o CSV.

```text
Drive
→ gatilho Apps Script
→ validação e upsert em segundo plano
→ Postagens
→ índice/cache
→ painel
```

## Decisões de performance

- gatilho executa fora do carregamento do usuário;
- a classificação do lote lê somente a coluna `Objeto` e as notas dessa coluna;
- a matriz completa de `Postagens` só é lida se houver registros existentes que precisem ser atualizados;
- novos registros são escritos em um único `setValues` por arquivo;
- atualizações existentes usam `writeChangedRowsInBlocks_`;
- nenhuma leitura ou escrita de célula é feita dentro do loop principal do CSV;
- `LockService` impede duas importações concorrentes;
- o índice `IDX_POSTAGENS_DATAS` é reconstruído uma única vez ao final do lote;
- `ATENDE_CACHE_VERSION` é alterada somente quando dados foram inseridos ou atualizados;
- arquivos já processados são descartados antes da gravação por assinatura/hash;
- máximo de 5 arquivos pendentes por execução para limitar recuperação de backlog.

## Baseline

Arquivo analisado em 05/09/2026:

- 980 registros;
- 965 com código de objeto;
- 15 sem rastreio;
- 0 objetos duplicados dentro do arquivo.

## Gargalo conhecido

Quando muitos objetos do CSV já existem na base e precisam ser atualizados, a rotina lê a matriz completa da aba `Postagens` uma vez para fazer os merges em memória. Isso acontece no gatilho, não no boot do painel.

Se a base crescer a ponto de essa leitura ficar lenta, o próximo passo arquitetural deve ser um índice persistente por chave/linha ou migração da base operacional para banco. Não é necessário neste volume atual.

## Como medir

- tempo total retornado por `ATENDE_importarCsvDriveAgora()` em `elapsedMs`;
- `Criados`, `Atualizados` e `Ignorados` em `LOG_IMPORTACOES`;
- tempo de abertura do `/atende` antes e depois da automação;
- diagnóstico existente `diagnosticarPerformancePainel()`.
