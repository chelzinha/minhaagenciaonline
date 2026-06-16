# AGF SuperFrete — Etapa 6

Checkout real controlado de pedidos SuperFrete já criados no carrinho.

## Novos arquivos
- 42_SF_CHECKOUT_REAL.js

## Arquivos alterados
- 30_SF_CFG.js
- 99_ROUTER.js

## Nova action
- sfAdminCheckoutRealOrder

## O que faz
- Recebe ORDER_ID_AGF de uma etiqueta com STATUS_FINANCEIRO = RESERVADA.
- Chama POST /api/v0/checkout com o ORDER_ID_SUPERFRETE.
- Consulta GET /api/v0/order/info/{id}.
- Chama POST /api/v0/tag/print para capturar PDF oficial.
- Atualiza tracking/SRO quando retornado pela SuperFrete.
- Converte reserva interna em débito real da conta corrente do cliente.
- Registra consumo na carteira SuperFrete espelho da AGF.

## Segurança
- Em produção exige confirmação: CONFIRMAR_CHECKOUT_PRODUCAO.
- No frontend o operador precisa digitar CHECKOUT.
- Não faz checkout de etiqueta sem status RESERVADA.
- Não faz checkout de etiqueta que não esteja pendente na SuperFrete.

## Action extra
- sfAdminRefreshSuperFreteOrder: atualiza order/info, tracking/SRO e PDF oficial sem alterar financeiro.
