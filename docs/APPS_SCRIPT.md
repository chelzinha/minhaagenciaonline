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
