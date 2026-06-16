# AGF SuperFrete — Etapa 7

## Objetivo
Adicionar impressão experimental da etiqueta AGF com logo do cliente, usando os dados já gravados após checkout real da SuperFrete.

## Importante
A etiqueta AGF não substitui o PDF oficial da SuperFrete nesta fase. O PDF oficial continua sendo o fallback operacional obrigatório, porque o QR/2D oficial da etiqueta SuperFrete ainda não é reproduzido pelo nosso layout.

## Arquivos novos/alterados
- 43_SF_ETIQUETA_AGF.js
- 38_SF_EMISSAO_SIMULADA.js
- 99_ROUTER.js
- superfrete-admin/js/api.js
- superfrete-admin/js/app.js
- superfrete-admin/js/config.js
- superfrete-admin/index.html

## Nova action
- sfAdminGetAgfLabelData

## Teste rápido
1. Gere uma etiqueta real até o checkout.
2. Aguarde/atualize até aparecer SRO/tracking.
3. No histórico, clique em Etiqueta AGF.
4. Confira se a etiqueta abre em nova janela com a logo do cliente, SRO, barcode, destinatário e remetente.
5. Imprima em 10x15 / A6 e compare com o PDF oficial.
