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
