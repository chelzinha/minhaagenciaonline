# AGF SuperFrete — Backend Etapa 1

Este pacote adiciona o módulo SuperFrete sem alterar o funcionamento do `/app` CWS e do `/balcao`.

## O que está incluído

- Arquivos Apps Script `30_SF_*.js` até `37_SF_*.js`
- Patch no `99_ROUTER.js` com actions SuperFrete isoladas
- Planilha modelo `.xlsx` em `/planilha/AGF_SuperFrete_Modelo_Planilha.xlsx`
- Funções de bootstrap para criar as abas Google Sheets

## Observação sobre SF_REMETENTES

A aba `SF_REMETENTES` inclui:

- `NOME_REMETENTE`
- `RAZAO_SOCIAL`
- `CNPJ_CPF`

Assim você pode decidir se o nome exibido será nome fantasia, razão social ou outro padrão operacional.

## DC-e / DACE

Campos preparados:

- `SF_DECLARACAO_ITENS`
- `SF_DCE_DOCUMENTOS`
- campos `DCE_STATUS`, `DCE_CHAVE_ACESSO` e `DACE_URL` em `SF_ETIQUETAS`

A documentação pública da SuperFrete informa que a DC-e é gerada dentro do fluxo de emissão da etiqueta e usa:
dados do remetente, dados do destinatário com CPF/CNPJ e produtos com descrição, quantidade e valor.
O formato exato do payload via API ainda deve ser validado em Sandbox na Etapa 2.

## Instalação rápida

1. Suba estes arquivos no projeto Apps Script atual via clasp ou editor.
2. Abra o editor Apps Script.
3. Execute uma das funções:
   - `sfCreateStandaloneSpreadsheet()` para criar uma planilha nova; ou
   - `sfInstallIntoConfiguredSpreadsheet()` para instalar as abas SF_* na planilha configurada em `CFG.SF_SPREADSHEET_ID`.
4. Autorize o Apps Script.
5. Se usar planilha nova, copie o ID retornado para `CFG.SF_SPREADSHEET_ID`.
6. Publique/atualize o Web App.

## Login inicial

Admin inicial criado pelo bootstrap:

- login: `admin`
- senha: `admin123`

Trocar antes de usar em produção.

Cliente exemplo:

- login: `cliente.exemplo`
- senha: `cliente123`

## Actions disponíveis na Etapa 1

Públicas:

- `sfHealth`
- `sfAdminLogin`
- `sfClientLogin`

Privadas:

- `sfAdminMe`
- `sfClientMe`
- `sfAdminListClients`
- `sfAdminGetClient`
- `sfAdminSaveClient`
- `sfAdminGetFinancialSnapshot`
- `sfValidateDcePayload`
- `sfQuotePreview`
- `sfModel`

## Checklist de validação

1. Executar `sfCreateStandaloneSpreadsheet()`.
2. Conferir se todas as abas `SF_*` foram criadas.
3. Fazer POST `sfHealth`.
4. Fazer POST `sfAdminLogin` com `admin/admin123`.
5. Usar `sessionToken` no POST `sfAdminListClients`.
6. Conferir se `CLI_EXEMPLO` aparece.
7. Testar `sfQuotePreview` com `valorCotado: 30`.
8. Testar `sfValidateDcePayload` com destinatário/remetente/documento e itens.
9. Conferir se `/app` continua respondendo `ping/login` antigo.
10. Conferir se `/balcao` continua respondendo actions antigas.

## Reversão

Se algo der errado:

1. Remova os arquivos `30_SF_*.js` a `37_SF_*.js`.
2. Volte o `99_ROUTER.js` anterior.
3. As abas `SF_*` podem permanecer na planilha sem afetar `/app` ou `/balcao`.


## Correção v2 — planilha separada

O módulo SuperFrete usa `CFG.SF_SPREADSHEET_ID`. Não substitua `CFG.SPREADSHEET_ID`, porque ele continua sendo usado pelo `/app` e pelo `/balcao`.


## v3 - Correção de valores da DC-e

A função `sfToMoney_` foi ajustada para interpretar corretamente números enviados pelo frontend, como `35.50`, sem transformar em `355`. Também aceita valores em formato brasileiro, como `35,50` e `1.234,56`.
