# AGF SuperFrete — Etapa 4

## Objetivo
Adicionar cotação real na API SuperFrete usando `/api/v0/calculator`, com token salvo no `PropertiesService`.

## Importante
Esta etapa **não cria pedido**, **não faz checkout** e **não consome saldo real**. Ela apenas calcula o frete real na SuperFrete para preencher o valor cotado da emissão simulada.

## Arquivos novos/alterados
- `39_SF_SUPERFRETE_API.js` novo
- `99_ROUTER.js` atualizado com novas actions
- `30_SF_CFG.js` versão atualizada para etapa 4

## Novas actions
- `sfAdminGetSuperFreteConfig`
- `sfAdminSaveSuperFreteConfig`
- `sfAdminQuoteSuperFrete`

## Configuração
No painel `/superfrete-admin`, na tela Emitir etiqueta, cole o token Sandbox da SuperFrete e salve.

Tokens são salvos em `PropertiesService`, não em planilha.
