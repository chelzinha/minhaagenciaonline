# APPS_SCRIPT

Documento tecnico em preparacao.

## Apps Script versionados no repositorio

Em 2026-06-16, os Apps Script do projeto foram copiados para apps-script/ e versionados no GitHub.

Modulos adicionados:
- autenticacao
- base-metro
- logistica
- atende
- base-cliente-etiquetas
- caixa
- cep
- etiquetas
- nf
- nuvemshop
- sla

Arquivos .clasp.json permanecem locais e nao devem ser enviados ao GitHub.

## Modulo Reverso - backend Apps Script

Backend principal identificado:
- apps-script/logistica/04_Api.gs
- apps-script/logistica/03_Core.gs

Fluxo resumido:
- frontend/reverso/js/screens chama frontend/reverso/services/api.js.
- services/api.js envia action para o Web App.
- 04_Api.gs recebe doGet/doPost e roteia por action.
- 03_Core.gs concentra regras de negocio principais de leitura de etiqueta e confirmacao de drop-off.

Actions principais identificadas:
- getUnitBySlug
- registerOrLoginUser
- readEtiqueta
- confirmDropoff
- getUserHistory
- getDashboard
- getUnitStatus

Funcoes backend relacionadas:
- apiGetUnitBySlug_()
- apiRegisterOrLoginUser_()
- apiReadEtiqueta_()
- apiConfirmDropoff_()
- apiGetUserHistory_()
- apiGetDashboard_()
- apiGetUnitStatus_()
- reversaReadEtiqueta()
- reversaConfirmDropoff()

Cuidados tecnicos:
- Validar payload, usuario, unidade e permissao em cada action.
- Evitar logs com dados pessoais completos.
- Preservar nomes de actions usadas pelo frontend.
- Evitar mudancas diretas em rotas, actions e nomes de funcoes sem cruzar uso no frontend.

## Modulo Atende - backend Correios Atende

Backend relacionado:
- apps-script/atende/Code.gs
- apps-script/atende/Config.gs
- apps-script/atende/Setup.gs
- apps-script/atende/Sheets.gs
- apps-script/atende/ImportadorAtendimentos.gs
- apps-script/atende/ImportadorObjetosCaptados.gs
- apps-script/atende/NormalizadorPostagens.gs
- apps-script/atende/ApiAtende.gs
- apps-script/atende/Logs.gs
- apps-script/atende/Seguranca.gs

Fluxo preservado:
- `doGet()` sem action entrega o HTML do painel.
- `buscarDados()` continua retornando `rows` e `columns` para o front atual via `google.script.run`.
- `processarAtendimentos(jsonString)` permanece como funcao manual do front para o JSON de atendimentos.
- `processarEBuscar(jsonString)` permanece como funcao manual do front para o JSON de objetos captados/postagem.
- `getSpreadsheetUrl()` continua retornando a URL da planilha.

Novas funcoes e endpoints:
- `setupInicial()` cria/valida planilha, abas e cabecalhos.
- `doGet(e)` com `action=dados` ou `action=postagens` retorna JSON consultavel por data.
- `doPost(e)` recebe importacoes futuras e exige `INGEST_TOKEN` em `PropertiesService`.

Cuidados tecnicos:
- Usar `SPREADSHEET_ID` em `PropertiesService`.
- Nao salvar tokens, cookies ou headers sensiveis em codigo ou logs.
- Evitar logs com payload completo; os JSONs brutos ficam somente nas abas RAW.
- Usar `LockService` nas importacoes e escrita em lote em `Postagens`.
