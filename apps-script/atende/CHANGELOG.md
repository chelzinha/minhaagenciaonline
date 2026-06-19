
## 2026-06-18 - Otimização do painel Atende por período

- Remove a área de importação manual de JSONs do front do Apps Script.
- Mantém o layout principal do painel, tabela, filtros e todas as colunas da aba Postagens.
- Adiciona carregamento por período no painel lateral.
- Altera `buscarDados(params)` para aceitar `dataInicio` e `dataFim`.
- Evita carregar a planilha inteira no front por padrão; o carregamento inicial usa últimos 7 dias.
- Corrige `Config.js` para usar nomes de propriedades (`SPREADSHEET_ID`, `SS_ID`, `INGEST_TOKEN`) em vez de valores reais.

Atenção sensível:
- ID de planilha e token devem permanecer em PropertiesService.
- JSONs reais e dados pessoais não devem ser versionados.

# CHANGELOG - Atende

## 2026-06-17 - Correcao de payload grande no Apps Script

### Corrigido
- Corrigido fluxo de importacao que chamava `buscarDados()` dentro de `buildImportResponse_`.
- A resposta da importacao agora retorna apenas resumo pequeno, evitando retorno completo da aba `Postagens`.
- `buscarDadosPorData_` agora usa cache somente quando ha filtro de data.
- Payloads grandes nao sao enviados para `CacheService`.
- `salvarRawJson_` nao grava mais o JSON completo nas abas RAW; grava hash, resumo e tamanho do payload.
- `Index.html` passou a recarregar os dados apos importacao, em vez de esperar a planilha inteira na resposta.

### Atencao sensivel
- Os JSONs do Correios Atende podem conter nomes, documentos, telefones, enderecos e objetos postais.
- JSONs reais nao devem ser gravados no GitHub nem em logs completos.

## 2026-06-18 - Ajuste visual do período no Atende

- Remove texto explicativo sobre importação automática da lateral do painel.
- Organiza o retorno de `msgPeriodo` em formato compacto com período e quantidade de registros.
- Mantém a estrutura do painel e todas as colunas da aba `Postagens`.


## 2026-06-18 - recuperação visual do Atende

- Reverte a alteração experimental de autoajuste automático de colunas.
- Mantém o painel por período sem a área de importação manual.
- Corrige apenas o layout dos chips de período/registro para não estourarem na lateral.
- Preserva estrutura da tabela, filtros, paginação e redimensionamento manual de colunas.
