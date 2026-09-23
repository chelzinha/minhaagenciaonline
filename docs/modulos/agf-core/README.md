# AGF Core - Cadastro Base da Plataforma

**Status:** V1 funcional validada  
**Rota administrativa:** `/admin/cadastros/`  
**Backend:** `cloudflare/agf-core-api`  
**Banco:** Cloudflare D1 `agf-core`  
**Worker:** `https://agf-core-api.chelzinha.workers.dev`  
**Branch inicial:** `feature/agf-core-cadastros`

## 1. Objetivo

O AGF Core é a fonte central e independente para cadastro de clientes da Plataforma Digital AGF.

Ele nasce sem dependência de:

- planilhas de CRM;
- `ID_CRM` ou `ID_CRM_REF`;
- Portal Postal;
- cadastros legados;
- Apps Script como banco de clientes.

Sistemas antigos poderão ser ligados posteriormente ao AGF Core por referências externas, sem transformar identificadores legados na identidade principal do cliente.

## 2. Princípio modular

O cliente pertence à Plataforma AGF, não a um módulo específico.

```text
CLIENTE
   |
   +-- USUÁRIOS
   |
   +-- MÓDULOS HABILITADOS
   |      +-- Shopify
   |      +-- Minhas Postagens
   |      +-- Nuvemshop
   |      +-- módulos futuros
   |
   +-- INTEGRAÇÕES
          +-- Shopify Store
          +-- Correios
          +-- outros provedores
```

A tabela `customer_modules` responde à pergunta:

> Quais módulos da Plataforma AGF este cliente está autorizado a utilizar?

A permissão de uma pessoa dentro de um cliente é outra responsabilidade e não deve ser confundida com a habilitação comercial/operacional do módulo para a empresa.

## 3. Identidade do cliente

Todo novo cliente recebe um identificador técnico próprio do AGF Core no formato:

```text
cus_XXXXXXXXXXXX
```

O sufixo possui 12 caracteres URL-safe gerados a partir de 72 bits aleatórios.

Exemplo:

```text
cus_7rFenH8BS9ZB
```

Esse `customer_id` é a referência canônica para módulos novos.

Não usar como chave primária:

- ID de CRM;
- CNPJ;
- ID Shopify;
- ID Nuvemshop;
- contrato Correios;
- ID Portal Postal.

Esses identificadores podem existir como dados ou referências externas, mas não substituem `customer_id`.

### Compatibilidade inicial

O primeiro cadastro criado durante a validação do AGF Core utilizou o formato anterior baseado em UUID. Esse identificador continua válido internamente para preservar integridade referencial. Novos clientes usam apenas o formato curto.

O ID técnico não deve ocupar posição de destaque na interface administrativa.

## 4. Entidades iniciais

### `customers`

Cadastro base da empresa ou pessoa cliente.

### `modules`

Catálogo central dos módulos da Plataforma AGF.

Seed inicial:

- `SHOPIFY` - Conector Shopify;
- `MINHAS_POSTAGENS` - Minhas Postagens;
- `NUVEMSHOP` - Conector Nuvemshop.

Novos módulos devem entrar no catálogo em vez de criar colunas específicas no cadastro do cliente.

### `customer_modules`

Relaciona cliente e módulo.

Permite estados:

- `ACTIVE`;
- `TRIAL`;
- `SUSPENDED`;
- `DISABLED`.

### `platform_users`

Reserva a identidade lógica dos futuros usuários externos da Plataforma AGF.

A senha não é armazenada nesta tabela. O vínculo com um provedor de identidade será feito por `auth_provider` + `auth_subject`.

### `customer_users`

Relaciona usuários externos aos clientes.

### `customer_integrations`

Registra contas externas vinculadas ao cliente sem misturar integrações no registro principal de `customers`.

Exemplos futuros:

- Shopify;
- Nuvemshop;
- Correios;
- ERP/fiscal.

Segredos não devem ser armazenados em claro em `configuration_json`.

### `audit_log`

Registra alterações administrativas relevantes realizadas no AGF Core.

## 5. Autenticação administrativa inicial

A tela `/admin/cadastros/` reutiliza a autenticação interna AGF já existente.

A página exige:

```js
window.AGF_ACCESS = { roles: ['admin'] };
```

A segurança não depende apenas do frontend.

O Worker `agf-core-api` recebe o Bearer token da sessão atual, chama a action `validate` do backend AGF_AUTH e exige que o usuário validado tenha:

```text
role = admin
```

Esse mecanismo é reutilizado para o painel interno porque já existe e permite avançar sem duplicar autenticação.

O login futuro dos clientes externos é uma camada separada e não deve reutilizar senha em planilha.

## 6. API inicial

### Público

```text
GET /health
```

### Somente administrador autenticado

```text
GET   /api/modules
GET   /api/customers
POST  /api/customers
GET   /api/customers/:id
PATCH /api/customers/:id
GET   /api/customers/:id/modules
PUT   /api/customers/:id/modules
```

Não existe DELETE físico de cliente nesta primeira versão. Desativação deve usar status para preservar integridade e histórico.

## 7. Frontend inicial

Rota:

```text
/admin/cadastros/
```

A primeira tela oferece:

- busca de clientes;
- filtro por status;
- criação de cliente;
- edição cadastral;
- habilitação/desabilitação de módulos.

O visual atual é funcional e provisório. O redesign será tratado em rodada própria, sem misturar acabamento visual com a fundação de dados.

Próximas abas previstas dentro do cliente:

```text
Dados gerais
Usuários
Módulos
Integrações
Correios
Histórico
```

A V1 implementa Dados gerais + Módulos.

## 8. Relação com o Conector Shopify

O Conector Shopify não será dono do cadastro de cliente.

Fluxo oficial:

```text
Shopify OAuth
     |
     v
shopify_shops
     |
     v
customer_id
     |
     v
AGF Core
```

O mesmo `customer_id` poderá ser usado por:

- Shopify;
- Minhas Postagens;
- Motor de Cotação AGF;
- Nuvemshop;
- outros módulos futuros.

Não usar `ID_CRM_REF` no novo Conector Shopify.

## 9. Banco D1

Configuração atual:

```text
database_name = agf-core
binding = DB
```

Database ID:

```text
09b63793-d6c3-4658-b83a-f7db13d93b54
```

Migration inicial:

```text
migrations/0001_agf_core.sql
```

A migration foi validada localmente e aplicada com sucesso no D1 remoto.

## 10. Validação concluída

Foi validado de ponta a ponta:

```text
Autenticação AGF admin
        ↓
/admin/cadastros
        ↓
agf-core-api
        ↓
D1 agf-core
        ↓
customers
+
customer_modules
```

Também foi validado:

- carregamento do catálogo de módulos;
- listagem de clientes;
- criação de cliente;
- persistência após recarregar a página;
- habilitação do módulo `SHOPIFY`;
- persistência do vínculo em `customer_modules`.

## 11. Regras travadas nesta fundação

1. O cadastro base novo não depende de planilha.
2. O cadastro base novo não depende de `ID_CRM`.
3. `customer_id` é a identidade canônica da Plataforma AGF.
4. Cliente e módulo são entidades diferentes.
5. Um cliente pode possuir vários módulos.
6. Novos módulos entram no catálogo `modules`.
7. Integrações externas não viram colunas do cadastro principal.
8. Senhas não são armazenadas no D1 do cadastro.
9. Segredos de integrações não ficam em texto claro no cadastro.
10. O AGF Core deve ser consumível por Shopify e por módulos futuros.
11. Novos IDs de cliente usam o formato curto `cus_XXXXXXXXXXXX`.

## 12. Próximos passos

1. Integrar o Conector Shopify ao AGF Core por `customer_id`.
2. Criar `shopify_shops` vinculado ao cliente.
3. Implementar OAuth Shopify.
4. Associar loja autorizada ao cliente com módulo `SHOPIFY` ativo.
5. Criar a camada de conta Correios por cliente.
6. Construir o Motor de Cotação AGF.
7. Em rodada posterior, redesenhar `/admin/cadastros/`.
8. Posteriormente readequar CRM e outros sistemas legados para consumirem o AGF Core.
