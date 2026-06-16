# AGF SuperFrete — Etapa 2

Esta versão adiciona suporte ao primeiro painel administrativo real.

## O que mudou no backend

Novas actions privadas:

- `sfAdminGetClientFinancial`
- `sfAdminAdjustClientBalance`

A action existente `sfAdminSaveClient` agora também pode criar/atualizar o login do cliente quando receber o bloco `usuario`.

## Arquivos alterados

- `35_SF_CLIENTES.js`
- `99_ROUTER.js`

## Não foi alterado

- Fluxo CWS do `/app`
- Fluxo do `/balcao`
- Actions atuais de Correios
- Estrutura financeira validada na Etapa 1

## Teste mínimo

1. Substituir os arquivos do backend no Apps Script.
2. Salvar.
3. Implantar nova versão do Web App.
4. Abrir `/superfrete-admin` no frontend.
5. Entrar com `admin / admin123`.
6. Conferir dashboard, lista de clientes e cadastro.
