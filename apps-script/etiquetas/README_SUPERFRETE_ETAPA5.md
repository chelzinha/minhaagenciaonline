# AGF SuperFrete — Etapa 5

## Objetivo
Criar pedido real no carrinho da SuperFrete em Sandbox usando `POST /api/v0/cart`, mantendo o checkout bloqueado.

## Segurança
- Somente ambiente SANDBOX.
- Não chama `/checkout`.
- Não chama `/tag/print`.
- Não consome saldo real da carteira SuperFrete.
- Reserva limite interno do cliente para proteger a futura etapa de checkout.

## Arquivos novos/alterados
- `30_SF_CFG.js` — versão 0.5.0-etapa5.
- `40_SF_PEDIDO_REAL.js` — criação real no carrinho Sandbox e liberação local de reserva.
- `99_ROUTER.js` — novas actions.

## Novas actions
- `sfAdminCreateRealCartOrder`
- `sfAdminReleasePendingOrderLocal`

## Fluxo de teste
1. Configure SuperFrete como SANDBOX no painel.
2. Confirme token Sandbox salvo.
3. Cadastre/remetente com endereço completo e UF em maiúsculo.
4. Preencha destinatário com CPF/CNPJ.
5. Adicione ao menos um item de DC-e.
6. Clique em Cotar na SuperFrete.
7. Use a cotação.
8. Clique em Criar pedido real Sandbox.
9. Confirme que a etiqueta ficou como `PENDING_SUPERFRETE` e financeiro `RESERVADA`.
10. Confira se `VALOR_RESERVADO` subiu na conta do cliente.
11. Use “Liberar reserva” para desfazer a reserva local se não for avançar para checkout depois.

## Observação
A liberação local não cancela remotamente o pedido dentro da SuperFrete nesta etapa. O cancelamento remoto será tratado em etapa posterior junto com checkout/cancelamento oficial.
