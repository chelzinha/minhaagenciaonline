# Changelog - Atende

## 2026-09-05 - Importacao automatica do CSV diario

### Adicionado

- Leitura de relatorios CSV salvos na pasta operacional `_Atende Diario`.
- Validacao obrigatoria de cabecalhos antes de qualquer gravacao.
- Mapeamento do relatorio para o schema canonico da aba `Postagens`.
- Conversao de `PESO` em gramas para `Peso (kg)`.
- Upsert por codigo de objeto para registros rastreaveis.
- Importacao de atendimentos sem rastreio mantendo `Objeto` vazio.
- Uso do campo real `ATENDIMENTO` como chave tecnica dos registros sem objeto, armazenado em nota da celula para preservar as 41 colunas existentes.
- Controle de arquivo por assinatura tecnica e SHA-256 do conteudo.
- Registro em `LOG_IMPORTACOES` com criados, atualizados e ignorados.
- Invalidacao do cache e reconstrucao do indice de datas apos alteracoes.
- Validacao sem gravacao, importacao manual, status, instalacao idempotente e remocao do gatilho horario.

### Preservado

- Frontend atual de `/atende`.
- As 41 colunas atuais de `Postagens`.
- Historico existente.
- Fluxos manuais de JSON de postagem e atendimento.
- Busca, filtros, paginacao, resize e resumo monetario.
- Dados mais ricos ja presentes em linhas anteriores.
- Status de rastreio avancado, evitando regressao para `Postado`.

### Decisoes de dados

- Os 15 atendimentos sem `CODIGO_OBJETO` do arquivo baseline nao sao descartados nem recebem codigo artificial. Eles usam `ATENDIMENTO` como chave tecnica.
- O arquivo baseline possui R$ 69.855,97 no total, dos quais R$ 34.540,20 estao nesses 15 atendimentos sem rastreio.
- `MODALIDADE_PAGAMENTO` nao alimenta a coluna legada `tipo`, pois `A FATURAR` / `A VISTA` nao possuem a mesma semantica dos valores do JSON, como `AFATURAR_AUTOMATIZADO`.
- `ATENDIMENTO`, `MODALIDADE_PAGAMENTO`, `MCU`, `NUMERO_PLP` e `PESO_TARIFADO` ficam como metadados da importacao nesta versao, sem expansao do schema visual.

### Performance

- O CSV e processado fora do carregamento do painel.
- A classificacao inicial le somente `Objeto` e notas tecnicas.
- A matriz completa e lida apenas quando existem linhas a atualizar.
- Novas linhas sao gravadas em lote e atualizacoes em blocos.
- O indice de datas e reconstruido uma vez ao fim do lote.

### Atencao sensivel

- O relatorio pode conter rastreios, nomes, CEPs, contratos e informacoes operacionais.
- O ID da pasta fica em Script Properties e nao e versionado.
- O CSV bruto nao e enviado ao frontend nem gravado integralmente em logs.
- Nenhum token ou credencial foi adicionado.
- A funcao manual legada `removerLinhasInvalidasSemObjeto()` nao deve ser executada apos ativar a importacao enquanto nao reconhecer as notas `ATENDE_CSV_ID:`.

### Deploy

- Requer `clasp push` do Apps Script.
- Requer configurar `ATENDE_CSV_FOLDER_ID`.
- Requer validar sem gravacao e executar a primeira importacao manual antes de instalar o gatilho.
- Nao requer alteracao do frontend Cloudflare.
