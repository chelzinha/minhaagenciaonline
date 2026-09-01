# Caixa à Vista: Santander Pix no Cloudflare

## Arquitetura

```text
Cloudflare Pages
    ↓ /api/santander/pix/*
Pages Function
    ↓ Service Binding
Worker agf-santander-pix
    ├─ OAuth Santander
    ├─ mTLS Santander
    ├─ KV PIX_STATE
    ├─ criação e consulta da cobrança
    └─ webhook
            ↓ HMAC
       Apps Script Caixa à Vista
            ↓
       Google Sheets / Conta Azul
```

## Motivo do Worker dedicado

Pages Functions são adequadas para roteamento e autenticação, mas o componente bancário precisa suportar certificado cliente de saída. O Worker dedicado possui binding mTLS e usa `SANTANDER_MTLS.fetch()`.

## Service Binding do Pages

No projeto Pages, adicionar:

```text
Variable name: SANTANDER_PIX_SERVICE
Service: agf-santander-pix
Environment: preview e production
```

## KV

Criar um KV namespace, por exemplo:

```text
agf-santander-pix-state
```

Vincular ao Worker como:

```text
PIX_STATE
```

## Secrets

### Worker

- `SANTANDER_CLIENT_ID`
- `SANTANDER_CLIENT_SECRET`
- `AGF_AUTH_JWT_SECRET`
- `CAIXA_INTERNAL_SECRET`
- `SANTANDER_WEBHOOK_SECRET`, somente quando o banco confirmar esse mecanismo

### Apps Script

- `CAIXA_INTERNAL_SECRET`, exatamente igual ao Worker
- `AGF_AUTH_JWT_SECRET`

## Variáveis Santander a preencher após a liberação

- `SANTANDER_MODE=sandbox`
- `SANTANDER_TOKEN_URL`
- `SANTANDER_CREATE_URL_TEMPLATE`
- `SANTANDER_STATUS_URL_TEMPLATE`
- `SANTANDER_CREATE_METHOD`
- `SANTANDER_AUTH_STYLE`
- `SANTANDER_GRANT_TYPE`
- `SANTANDER_SCOPE`
- `SANTANDER_PIX_KEY`
- `SANTANDER_REQUIRE_MTLS`

## Certificado mTLS

1. Obter do Santander os requisitos de certificado.
2. Converter certificado e chave para PEM, quando necessário.
3. Enviar ao Cloudflare por Wrangler.
4. Copiar o `certificate_id`.
5. Configurar o binding `SANTANDER_MTLS`.
6. Testar em ambiente remoto, pois mTLS não é simulado integralmente no desenvolvimento local.

## Homologação sugerida

1. `SANTANDER_MODE=disabled`: validar fallback local.
2. `SANTANDER_MODE=mock`: validar tela, salvamento, polling e webhook simulado.
3. `SANTANDER_MODE=sandbox`: validar token, criação e consulta reais.
4. Simular webhook repetido e confirmar idempotência.
5. Simular valor divergente e confirmar bloqueio.
6. Confirmar que o fechamento não ocorre com Pix aberto.
7. Validar exportação Conta Azul com `txid` e `e2eid`.
8. Somente então alterar para `production`.

## Dados que não podem entrar no Git

- Client Secret;
- certificados e chaves privadas;
- token OAuth;
- segredo HMAC;
- respostas bancárias contendo dados pessoais reais;
- arquivos `.dev.vars` ou `.env`.
