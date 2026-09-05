# Changelog - Atende

## 2026-09-05 - Importação automática do CSV diário

### Adicionado

- Leitura de relatórios CSV salvos na pasta operacional `_Atende Diário`.
- Validação obrigatória de cabeçalhos antes de qualquer gravação.
- Mapeamento do relatório para o schema canônico da aba `Postagens`.
- Conversão do peso informado em gramas para `Peso (kg)`.
- Deduplicação por código de objeto.
- Controle de arquivo já processado por assinatura técnica e hash SHA-256.
- Registro das execuções em `LOG_IMPORTACOES`.
- Invalidação de cache e reconstrução do índice de datas após novas inserções.
- Função de validação sem gravação.
- Instalação idempotente de gatilho horário.
- Rotina de status e remoção do gatilho.

### Preservado

- Frontend atual de `/atende`.
- Schema existente da aba `Postagens`.
- Histórico já gravado.
- Busca, filtros, paginação e resumo do painel.
- Regra de unicidade por objeto.

### Performance

- O CSV é processado em segundo plano e nunca durante a abertura do painel.
- Novas linhas são gravadas em lote.
- A leitura anti-duplicata consulta somente a coluna `Objeto`.
- O índice de datas é reconstruído somente depois do lote.

### Atenção sensível

- O relatório pode conter rastreios, nomes, CEPs, contratos e informações de atendimento.
- O ID da pasta do Drive fica em Script Properties e não é versionado no GitHub.
- O conteúdo bruto do CSV não é registrado em logs.

### Deploy

- Requer `clasp push` do backend Apps Script.
- Requer configurar `ATENDE_CSV_FOLDER_ID` em Script Properties.
- Requer executar a validação sem gravação antes da primeira importação.
- Requer instalar o gatilho somente após validar a primeira importação manual.
- Não requer alteração do frontend Cloudflare.
