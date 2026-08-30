# Worker Santander Pix

Worker dedicado à integração bancária do Caixa à Vista.

## Por que é separado do Cloudflare Pages

O frontend continua no Cloudflare Pages. O Worker bancário fica separado para permitir:

- credenciais e tokens fora do navegador;
- armazenamento temporário de cobranças em KV;
- certificado cliente por binding mTLS;
- webhook idempotente;
- consulta de contingência;
- comunicação autenticada com o Apps Script do caixa.

O Pages encaminha `/api/santander/pix/*` ao Worker por um Service Binding chamado `SANTANDER_PIX_SERVICE`.

## Entrada segura

O arquivo de entrada é:

```text
src/secure-index.js
```

Ele envolve o adaptador bancário e aplica antes do processamento:

- autenticação obrigatória do webhook em produção;
- bloqueio de webhook sem autenticação fora de `mock` ou `sandbox`;
- remoção de nome e documento do pagador;
- sanitização do corpo recebido;
- remoção de respostas bancárias completas antes da gravação no KV, por padrão.

## Rotas

- `GET /api/santander/pix/health`
- `POST /api/santander/pix/create`
- `GET /api/santander/pix/status/:txid`
- `POST /api/santander/pix/webhook`

## Modos

- `disabled`: frontend usa o Pix local como fallback.
- `mock`: devolve o código configurado em `SANTANDER_MOCK_PIX_CODE` e permite testar o fluxo automático.
- `sandbox`: chama os endpoints de homologação informados pelo Santander.
- `production`: chama os endpoints produtivos.

## Variáveis sem segredo

- `SANTANDER_MODE`
- `SANTANDER_API_PROFILE=bacen-v2`
- `SANTANDER_TOKEN_URL`
- `SANTANDER_CREATE_URL_TEMPLATE`, contendo `{txid}` quando aplicável
- `SANTANDER_STATUS_URL_TEMPLATE`, contendo `{txid}` quando aplicável
- `SANTANDER_CREATE_METHOD`
- `SANTANDER_AUTH_STYLE=basic|body`
- `SANTANDER_GRANT_TYPE`
- `SANTANDER_SCOPE`
- `SANTANDER_PIX_KEY`
- `SANTANDER_PIX_EXPIRATION_SECONDS`
- `SANTANDER_REQUIRE_MTLS=true|false`
- `SANTANDER_WEBHOOK_AUTH_MODE=shared-secret|none`
- `SANTANDER_STORE_RAW_RESPONSES=false`
- `PIX_STATE_TTL_SECONDS`
- `CAIXA_APPS_SCRIPT_URL`
- `AGF_API_AUTH_MODE=off|monitor|enforce`

Em produção, use `SANTANDER_WEBHOOK_AUTH_MODE=shared-secret` até que o Santander confirme o mecanismo definitivo. O modo `none` é aceito apenas em `mock` ou `sandbox`.

## Secrets

Cadastrar como secrets no Cloudflare, nunca no Git:

- `SANTANDER_CLIENT_ID`
- `SANTANDER_CLIENT_SECRET`
- `SANTANDER_WEBHOOK_SECRET`, enquanto o mecanismo usado for segredo compartilhado
- `CAIXA_INTERNAL_SECRET`
- `AGF_AUTH_JWT_SECRET`

## Bindings

### KV

Criar um namespace e vinculá-lo como:

```text
PIX_STATE
```

Ele guarda:

- token OAuth em cache;
- cobrança por `txid`;
- status recebido pelo webhook;
- `e2eid` e horário de liquidação.

Por padrão, não guarda a resposta bancária completa. `SANTANDER_STORE_RAW_RESPONSES=true` deve ser usado apenas temporariamente em homologação e após análise de privacidade.

### mTLS

Se exigido pelo Santander, enviar certificado e chave ao Cloudflare com Wrangler e criar o binding:

```text
SANTANDER_MTLS
```

O código usa `SANTANDER_MTLS.fetch()` nas chamadas bancárias. Sem o binding, o Worker só permite chamada comum quando `SANTANDER_REQUIRE_MTLS=false`.

## Pontos que dependem da liberação do Santander

O adaptador está preparado para o perfil Pix padrão BACEN, mas estes dados precisam ser preenchidos com a documentação liberada para a aplicação:

- endpoint OAuth;
- estilo de autenticação do token;
- escopos;
- endpoint e método de criação;
- endpoint de consulta;
- nome exato do campo do Pix Copia e Cola;
- autenticação e formato do webhook;
- exigência e cadeia do certificado mTLS.

Não alterar o adaptador para produção antes de comparar uma resposta real do sandbox.

## Webhook e Apps Script

O Worker registra primeiro o evento mínimo no KV e depois envia ao Apps Script:

```json
{
  "action": "internalPixWebhook",
  "timestamp": "...",
  "payload": {},
  "signature": "HMAC-SHA256 em Base64"
}
```

A assinatura usa `CAIXA_INTERNAL_SECRET` e o texto:

```text
timestamp.JSON_DO_PAYLOAD
```

O Apps Script rejeita mensagens antigas ou assinaturas inválidas.
