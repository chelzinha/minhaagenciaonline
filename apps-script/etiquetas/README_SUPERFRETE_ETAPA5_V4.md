# AGF SuperFrete — Etapa 5 v4

## Produção controlada sem checkout

Esta versão permite criar pedido real no carrinho da SuperFrete tanto em SANDBOX quanto em PRODUCAO.

Segurança mantida:

- NÃO chama `/checkout`.
- NÃO chama `/tag/print`.
- NÃO consome saldo real por este módulo.
- Em PRODUCAO exige confirmação explícita do frontend.
- O pedido fica pendente na SuperFrete.
- O sistema reserva limite interno do cliente.

## Arquivos alterados

- `30_SF_CFG.js`
- `40_SF_PEDIDO_REAL.js`

## Como testar

1. Salve o token de PRODUCAO em Integração SuperFrete.
2. Selecione Ambiente = PRODUCAO.
3. Salve configuração.
4. Faça cotação real.
5. Clique em Criar pedido real.
6. Digite `PRODUCAO` quando o painel pedir confirmação.
7. Confirme que o pedido apareceu no histórico como `PENDING_SUPERFRETE`.

## Observação

O checkout real fica para a próxima etapa.
