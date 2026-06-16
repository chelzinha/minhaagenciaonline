# AGF SuperFrete Admin — Etapa 4

## O que foi adicionado
- Configuração da integração SuperFrete no painel admin.
- Salvamento do token Sandbox/Produção via backend, em PropertiesService.
- Cotação real usando API SuperFrete `/api/v0/calculator`.
- Resultado visual das opções de frete.
- Botão "Usar" para aplicar o valor da cotação na emissão simulada.

## Importante
A emissão ainda é simulada. A Etapa 4 não chama `/cart`, não chama `/checkout` e não consome saldo real.
