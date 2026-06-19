# SEGURANCA_E_DADOS

Documento tecnico em preparacao.

## Apps Script e arquivos locais

Os arquivos .clasp.json foram ignorados via .gitignore para evitar exposicao de identificadores locais dos projetos Apps Script.

Antes do commit inicial dos Apps Script, foi realizada verificacao por termos sensiveis como token, secret, senha, password, api_key, client_secret, authorization, bearer, credencial, private_key, CWS e NUVEMSHOP.

Resultado informado: apareceram apenas referencias a nomes de variaveis/funcoes, sem segredo real identificado.

## Modulo Reverso - atencao de seguranca e dados

Tipo de atencao:
- Endpoint Web App usado pelo frontend.
- Actions publicas recebidas pelo backend.
- Planilhas com possiveis dados pessoais, historico operacional e rastreio.

Cuidados obrigatorios:
- Nao registrar URL completa de Web App em documentacao.
- Nao registrar ID completo de planilha.
- Nao registrar token, senha, chave ou segredo.
- Nao registrar payload completo com dados reais.
- Evitar logs com CPF, telefone, e-mail ou dados de cliente completos.

Validacoes recomendadas:
- Cada action deve validar payload.
- Cada action deve validar usuario e unidade quando aplicavel.
- Operacoes de escrita devem validar permissao e estado atual do registro.
- Respostas ao frontend devem retornar apenas os dados necessarios.

## Modulo Atende - ATENCAO SENSIVEL

Tipo de atencao:
- Importacao de JSONs do Correios Atende.
- Dados pessoais de remetentes e destinatarios.
- Dados operacionais de objetos postais, atendimentos, contratos e cartao de postagem.

Controles aplicados:
- `SPREADSHEET_ID` e `INGEST_TOKEN` devem ficar em `PropertiesService`.
- `doPost` exige token de ingestao.
- Logs de importacao nao gravam payload completo.
- Erros usam sanitizacao para mascarar CPF, CNPJ, telefone e termos sensiveis.
- JSONs brutos sao salvos somente nas abas RAW da planilha operacional.

Pontos que nao devem ser feitos:
- Nao salvar senha, cookie, token, header `Authorization` ou segredo em codigo.
- Nao copiar payload completo para `LOG_IMPORTACOES` ou `ERROS`.
- Nao documentar IDs reais de planilha nem URL completa de Web App em arquivos publicos.
