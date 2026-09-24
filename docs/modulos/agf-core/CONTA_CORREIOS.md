# AGF Core — Conta Correios por cliente

**Branch de implementação:** `feature/agf-core-correios`  
**Entidade:** `customer_integrations`  
**Provider:** `CORREIOS`

## Objetivo

Centralizar no AGF Core os identificadores operacionais do contrato Correios de cada cliente da Plataforma AGF, de forma independente dos módulos Shopify, Nuvemshop, Minhas Postagens ou outros.

O módulo consumidor recebe o `customer_id` e consulta a conta Correios correspondente.

```text
Cliente AGF
   |
   +-- customer_id
          |
          +-- Shopify
          +-- Nuvemshop
          +-- Minhas Postagens
          +-- CORREIOS
```

## Local de armazenamento

A conta Correios não é armazenada como colunas específicas da tabela `customers`.

Ela utiliza a entidade genérica:

```text
customer_integrations
```

com:

```text
provider = CORREIOS
```

Isso preserva a regra de que integrações externas não pertencem ao cadastro-base do cliente.

## Dados cadastrais da conta Correios

A configuração pública da integração contém somente identificadores operacionais:

- `contractNumber` — número do contrato;
- `postingCard` — cartão de postagem;
- `documentNumber` — CNPJ vinculado ao contrato;
- `dr` — DR;
- `drs` — DRS.

O `external_account_id` recebe o número do contrato quando disponível.

## Segredos

Senhas, tokens, chaves de API e demais segredos do CWS **não devem** ser armazenados em `configuration_json`.

O campo existente:

```text
credentials_ref
```

é reservado para apontar para uma referência segura de credenciais.

A API expõe apenas:

```text
credentialsConfigured: true | false
```

Nunca retorna o conteúdo de `credentials_ref`.

## Status

A integração usa os estados existentes em `customer_integrations`:

- `CONNECTED`;
- `DISCONNECTED`;
- `ERROR`;
- `DISABLED`.

Na etapa inicial, é possível cadastrar contrato e cartão mantendo `DISCONNECTED` enquanto as credenciais CWS ainda não estiverem configuradas.

## API

O `GET /api/customers/:id` passa a incluir:

```json
{
  "customer": {},
  "modules": [],
  "correios": {
    "id": "int_...",
    "provider": "CORREIOS",
    "status": "DISCONNECTED",
    "contractNumber": "...",
    "postingCard": "...",
    "documentNumber": "...",
    "dr": "...",
    "drs": "...",
    "credentialsConfigured": false
  }
}
```

Rotas específicas:

```text
GET /api/customers/:id/integrations/correios
PUT /api/customers/:id/integrations/correios
```

## Interface administrativa

A rota:

```text
/admin/cadastros/
```

passa a ter a seção **Conta Correios** com:

- Número do contrato;
- Cartão de postagem;
- CNPJ do contrato;
- DR;
- DRS;
- Status da integração.

Nenhuma credencial CWS é digitada nessa seção.

## Integração com o Conector Shopify

A prévia de expedição do Shopify consulta o cliente selecionado no AGF Core e exibe a conta Correios no checklist de prontidão.

Estados esperados:

```text
Sem conta Correios
→ bloqueia preparação da postagem

Contrato/cartão cadastrados, sem credenciais CWS
→ bloqueia chamada aos Correios e informa a pendência

Conta ativa + credenciais CWS configuradas
→ requisito de conta Correios atendido
```

Ainda permanecem validações independentes para:

- serviço Correios;
- endereço/bairro;
- peso e dimensões quando necessários;
- situação do pedido Shopify.

## Regra de arquitetura

O Conector Shopify não é dono do contrato Correios.

A relação correta é:

```text
Shopify Store
    |
    v
customer_id
    |
    v
AGF Core
    |
    v
customer_integrations(provider = CORREIOS)
```

Assim, a mesma conta Correios poderá ser reutilizada por todos os módulos da Plataforma AGF.
