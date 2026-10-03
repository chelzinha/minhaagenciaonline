# Conector Shopify - Plataforma AGF

**Status:** fundação técnica em desenvolvimento  
**Frontend previsto:** `/shopify/`  
**Backend:** `cloudflare/shopify-api`  
**Banco operacional:** Cloudflare D1 `agf-shopify`  
**Cadastro central:** AGF Core (`customer_id`)  
**Shopify Admin API:** GraphQL `2026-07`

## 1. Princípios

- O Conector Shopify não é dono do cadastro de cliente.
- Todo vínculo comercial/operacional parte de `customer_id` do AGF Core.
- Não usar planilha, CRM ou `ID_CRM_REF` como identidade.
- O módulo `SHOPIFY` precisa estar ativo no AGF Core para iniciar uma conexão.
- A interface é standalone na Plataforma AGF; o Shopify fornece autorização e dados.
- Usar GraphQL Admin API, não REST legado.

## 2. Vínculo central

```text
Shopify Store
     |
     v
shopify_shops.customer_id
     |
     v
AGF Core
     |
     +-- cliente ativo
     +-- módulo SHOPIFY ativo
```

O vínculo entre D1s é lógico, não uma foreign key física entre bancos distintos.

## 3. OAuth

O app standalone usa Authorization Code Grant.

Fluxo inicial:

```text
POST /api/shopify/auth/start
  -> valida sessão AGF
  -> valida customer_id no AGF Core
  -> confirma módulo SHOPIFY
  -> grava state temporário no D1
  -> devolve authorizeUrl

Shopify autorização

GET /api/shopify/auth/callback
  -> valida HMAC
  -> valida state, loja e expiração
  -> troca code por offline access token expirável
  -> consulta identidade da loja por GraphQL
  -> criptografa tokens
  -> grava shopify_shops + shopify_tokens
```

OAuth states são de uso único e possuem TTL de 10 minutos.

## 4. Tokens

Para apps públicos, o Conector solicita offline access token expirável com `expiring=1`.

Persistência:

- `access_token`: AES-GCM no D1;
- `refresh_token`: AES-GCM no D1;
- chave-mestra: Worker Secret `TOKEN_ENCRYPTION_KEY`;
- Client Secret Shopify: Worker Secret `SHOPIFY_CLIENT_SECRET`;
- tokens nunca devem ser logados.

O Worker renova o access token quando estiver próximo da expiração e persiste o novo par de tokens.

## 5. Tabelas iniciais

### `shopify_shops`

Loja instalada e seu vínculo ao `customer_id`.

### `shopify_tokens`

Credenciais criptografadas e expirações.

### `shopify_oauth_states`

Nonces OAuth temporários vinculados a cliente e loja.

### `shopify_webhook_events`

Base para idempotência e processamento de webhooks.

### `shopify_sync_state`

Cursores e timestamps da sincronização incremental.

## 6. Endpoints da fundação

```text
GET  /health
POST /api/shopify/auth/start
GET  /api/shopify/auth/callback
GET  /api/shopify/connections?customer_id=...
POST /api/shopify/test
```

Exceto callback e health, os endpoints administrativos desta fase usam a sessão AGF e validam o cliente no AGF Core.

## 7. Escopo inicial

```text
read_orders
```

Scopes adicionais para fulfillment/rastreio serão adicionados somente quando a implementação correspondente for iniciada e os requisitos atuais forem revalidados.

## 8. Próximas frentes

1. Criar D1 `agf-shopify` e aplicar migration.
2. Configurar Worker Secrets.
3. Publicar `agf-shopify-api`.
4. Validar OAuth em loja de desenvolvimento.
5. Criar frontend `/shopify/` para conexão e status da loja.
6. Sincronização de pedidos via GraphQL + webhooks.
7. Importação/vínculo de XML NF-e.
8. Etiqueta Correios + DANFE Simplificado 100x150.
9. Retorno de fulfillment/rastreio à Shopify.
10. Motor de Cotação AGF e adapters de produto/carrinho/checkout.

## 9. Pedidos persistidos (migration 0002)

Os pedidos deixam de ser lidos ao vivo a cada abertura da tela. A Shopify é consultada só na importação; a lista vem do D1.

### Tabela `shopify_orders`

- Chave: `shop_domain` + `order_gid`.
- `order_key`: número do pedido normalizado (`#1001` -> `1001`). Base do pareamento com o XML da NF-e.
- Dados de entrega, CPF/CNPJ (só dígitos), frete Shopify, peso e itens (`items_json`).
- `agf_status`, `status_reason`, `alert_message`.
- Atualização protegida por `shopify_updated_at`: um dado mais antigo nunca sobrescreve um mais novo (preparado para webhooks fora de ordem).

### Status AGF calculados na importação

| Status | Regra |
|---|---|
| CANCELADO | `cancelledAt` preenchido ou pagamento REFUNDED/VOIDED |
| SEM_ENVIO | pedido sem item que exija envio |
| ENVIADO_FORA_AGF | Shopify já marca o pedido como FULFILLED |
| AGUARDANDO_PAGAMENTO | pagamento diferente de PAID/PARTIALLY_REFUNDED |
| DADOS_INCOMPLETOS | falta nome, endereço, cidade, UF, CEP de 8 dígitos ou CPF/CNPJ |
| AGUARDANDO_XML | pago, com dados completos |

Regras de preservação:

- EMITINDO, ETIQUETA_EMITIDA, RASTREIO_* e ERRO_RASTREIO nunca são alterados pela importação. Cancelamento posterior gera `alert_message`.
- XML_VINCULADO, FISCAL_COM_ERRO e PRONTO_PARA_EMITIR são mantidos enquanto o pedido continuar apto.

### Sincronização

- Incremental por `updated_at`, janela máxima de 60 dias (limite sem `read_all_orders`), sobreposição de 2 minutos.
- 20 pedidos por página, até 5 páginas por chamada; o frontend repete até `complete = true`.
- Respeita o custo GraphQL (`throttleStatus`) e interrompe de forma segura se precisar esperar mais de 4 s.
- Trava por loja em `shopify_sync_state` (90 s) impede duas importações simultâneas.
- Gravação em uma instrução por página (`json_each`), dentro do limite de queries por invocação do plano gratuito.

### Endpoints

```text
POST /api/shopify/orders/sync    { shop, mode: "incremental" | "full" }
GET  /api/shopify/orders/local   ?shop=&status=&q=&limit=&offset=
```

`GET /api/shopify/orders` (leitura ao vivo) permanece disponível e sem alteração.

## 10. Configuração de envio (migration 0003)

- `shopify_shop_settings`: embalagem padrão da loja (formato, C x L x A, peso padrão).
- `shopify_shipping_service_map`: título do frete Shopify normalizado -> `SEDEX`, `PAC`, `MINI_ENVIOS` ou `NAO_CORREIOS`. O código do serviço do contrato é resolvido na emissão.
- `shopify_orders`: `district`, `district_source` (CEP ou MANUAL), `cep_city`, `cep_uf`, `cep_checked_at` e embalagem/peso ajustados no pedido (`pkg_*`).
- Bairro: consultado no ViaCEP (reserva BrasilAPI) na primeira abertura do pedido e gravado. Se o CEP mudar na Shopify, o bairro obtido pelo CEP é descartado; o manual é mantido.
- Prioridade da embalagem: ajuste do pedido > padrão da loja. Peso: ajuste do pedido > Shopify > padrão da loja.
- Limites validados: mínimo 15 x 10 x 1 cm, máximo 100 cm por lado, soma até 200 cm, até 30 kg. Mini Envios: até 24 x 16 x 4 cm e 300 g (bloqueio na prontidão).

Endpoints:

```text
GET  /api/shopify/shipping-config?shop=
POST /api/shopify/shipping-config   { shop, package?, services?: [{ shippingTitle, correiosService|null }] }
POST /api/shopify/order/shipping    { shop, orderId, district?, package?: { lengthCm, widthCm, heightCm, weightGrams } }
```

`GET /api/shopify/order` passa a devolver `agfShipping` (serviço mapeado, bairro, embalagem e peso efetivos).
