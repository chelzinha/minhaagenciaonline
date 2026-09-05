# Changelog - Atende

## 2026-09-05 - Importação automática do CSV diário

### Adicionado

- Leitura de relatórios CSV salvos na pasta operacional `_Atende Diário`.
- Validação obrigatória de cabeçalhos antes de qualquer gravação.
- Mapeamento do relatório para o schema canônico da aba `Postagens`.
- Conversão do peso informado em gramas para `Peso (kg)`.
- Upsert por código de objeto para registros rastreáveis.
- Importação de atendimentos sem rastreio mantendo `Objeto` vazio.
- Uso do campo real `ATENDIMENTO` como chave técnica dos registros sem objeto, armazenado em nota da célula para não alterar o schema visual.
- Controle de arquivo já processado por assinatura técnica e hash SHA-256.
- Registro das execuções em `LOG_IMPORTACOES`, separando criados, atualizados e ignorados.
- Invalidação de cache e reconstrução do índice de datas após inserções ou atualizações.
- Função de validação sem gravação.
- Instalação idempotente de gatilho horário.
- Rotina de status e remoção do gatilho.

### Preservado

- Frontend atual de `/atende`.
- As 41 colunas existentes da aba `Postagens`.
- Histórico já gravado.
- Busca, filtros, paginação e resumo do painel.
- Dados mais ricos já existentes em registros previamente importados por JSON.
- Status de rastreio já avançado, evitando regressão para `Postado`.

### Performance

- O CSV é processado em segundo plano e nunca durante a abertura do painel.
- A classificação inicial lê somente `Objeto` e notas técnicas dessa coluna.
- A matriz completa é lida apenas quando existem registros que precisam ser atualizados.
- Novas linhas são gravadas em lote.
- Atualizações existentes usam escrita em blocos.
- O índice de datas é reconstruído somente depois do lote.

### Atenção sensível

- O relatório pode conter rastreios, nomes, CEPs, contratos e informações de atendimento.
- O ID da pasta do Drive fica em Script Properties e não é versionado no GitHub.
- O conteúdo bruto do CSV não é registrado em logs.
- Nenhum token ou credencial foi adicionado.

### Deploy

- Requer `clasp push` do backend Apps Script.
- Requer configurar `ATENDE_CSV_FOLDER_ID` em Script Properties.
- Requer executar a validação sem gravação antes da primeira importação.
- Requer instalar o gatilho somente após validar a primeira importação manual.
- Não requer alteração do frontend Cloudflare.
