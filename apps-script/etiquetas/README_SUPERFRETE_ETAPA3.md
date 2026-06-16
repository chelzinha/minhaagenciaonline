# AGF SuperFrete — Etapa 3

Esta versão adiciona a emissão administrativa simulada/controlada.

## Objetivo

Validar o fluxo completo antes da API real da SuperFrete:

1. selecionar cliente/remetente;
2. preencher destinatário, pacote e itens da DC-e;
3. informar valor cotado e valor real/final simulado;
4. validar limite interno do cliente;
5. validar saldo estimado da carteira SuperFrete AGF;
6. registrar etiqueta simulada em `SF_ETIQUETAS`;
7. debitar a conta corrente do cliente;
8. consumir a carteira SuperFrete espelho;
9. salvar itens em `SF_DECLARACAO_ITENS` e documento em `SF_DCE_DOCUMENTOS`.

## Novas actions

- `sfAdminEmissionBootstrap`
- `sfAdminCreateSimulatedLabel`
- `sfAdminListLabels`
- `sfAdminRegisterSuperFreteRecharge`

## Arquivos alterados/adicionados

- `38_SF_EMISSAO_SIMULADA.js` novo
- `99_ROUTER.js` atualizado

## Sem regressão

Não foram alterados os fluxos CWS do `/app` nem o fluxo `/balcao`.

## Teste mínimo

1. Atualizar backend no Apps Script.
2. Implantar nova versão do Web App.
3. Subir frontend atualizado no Netlify.
4. Abrir `/superfrete-admin`.
5. Entrar como admin.
6. Ir em **Emitir etiqueta**.
7. Registrar uma recarga SuperFrete simulada.
8. Selecionar cliente/remetente.
9. Preencher destinatário, pacote, valores e item DC-e.
10. Gerar etiqueta simulada.
11. Conferir se a etiqueta apareceu no histórico.
12. Conferir a conta corrente do cliente e a carteira SuperFrete.
