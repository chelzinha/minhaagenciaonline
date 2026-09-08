# Caixa V3 - Worker + D1

## Objetivo

Migrar gradualmente a camada operacional do Caixa de Google Sheets + Apps Script para Cloudflare Workers + D1, preservando as regras de negócio já homologadas.

## Estado desta fase

Arquitetura híbrida de homologação:

```text
Frontend Caixa V3
      |
      v
agf-caixa-api (Worker)
      |
      +-- leituras -> D1
      |
      +-- escritas -> Apps Script V3 homologação
                         |
                         +-- Sheets
                         +-- Drive/PDF
                         +-- Conta Azul
      |
      +-- espelha resultado -> D1
```

A produção não usa este Worker nesta fase.

## Por que híbrido

O gargalo percebido está no bootstrap e nas leituras de Sheets. A primeira fase move `unitAccess`, `init` e `summary` para D1, mas preserva as escritas financeiras no Apps Script até a equivalência funcional ser comprovada.

Isso reduz risco em:

- fechamento;
- fechamento complementar;
- Pix;
- sangria;
- PDFs;
- Conta Azul;
- idempotência e auditoria já existentes.

## Estrutura

```text
cloudflare/caixa-api/
  migrations/
    0001_caixa_core.sql
  src/
    auth.js
    db.js
    index.js
    legacy.js
  package.json
  wrangler.jsonc
```

## D1

Banco dedicado:

```text
agf-caixa
```

Binding:

```text
DB
```

Não reutilizar o banco de outro módulo.

## Autenticação

O Worker valida o mesmo JWT AGF usado pelo Caixa atual.

Secret obrigatório no Worker:

```text
AGF_AUTH_JWT_SECRET
```

O valor real nunca deve entrar em:

- Git;
- `wrangler.jsonc`;
- documentação;
- prints;
- mensagens de erro;
- conversa.

Configurar via:

```powershell
npx wrangler secret put AGF_AUTH_JWT_SECRET
```

## Actions na fase híbrida

### D1 nativo

```text
ping
unitAccess
init
summary
d1Status
adminSyncFromLegacy
```

### Proxy para Apps Script de homologação

```text
saveClient
saveEntry
saveBatch
deleteEntry
syncPixPayment
setOpeningBalance
createWithdrawal
closeCash
processContaAzulQueue
syncContaAzulLibrary
retryPdfs
```

As escritas bem-sucedidas são espelhadas para o D1. `closeCash` e `setOpeningBalance` fazem sincronização de unidade antes de concluir a chamada, pois alteram múltiplas tabelas relacionadas.

## Migração inicial

O Apps Script de homologação disponibiliza duas actions autenticadas:

```text
exportD1Snapshot
exportD1UnitSnapshot
```

`exportD1Snapshot` é somente admin e gera o snapshot inicial completo.

`exportD1UnitSnapshot` respeita o contexto de unidade do usuário e é usado pela ponte híbrida para reconciliar alterações compostas.

Nenhum valor do `PropertiesService` é exportado.

## Sequência de homologação

1. Criar `agf-caixa` no D1.
2. Colocar o `database_id` real no `wrangler.jsonc` da branch.
3. Aplicar migrations remotas.
4. Configurar `AGF_AUTH_JWT_SECRET` no Worker.
5. Atualizar o deployment Apps Script de homologação com a ponte D1.
6. Publicar `agf-caixa-api`.
7. Executar `adminSyncFromLegacy` autenticado.
8. Conferir `d1Status` e contagens.
9. Comparar `init` D1 com o `init` Apps Script para as duas unidades.
10. Só depois apontar uma homologação de frontend para o Worker.

## Rollback

Enquanto a arquitetura estiver híbrida, o rollback é imediato:

- não alterar a produção;
- não apontar `/caixa/` para o Worker;
- manter o Apps Script V3 de homologação operacional;
- se o D1 falhar, voltar a homologação para o endpoint Apps Script anterior.

O D1 é espelho e fonte de leitura de homologação nesta fase, não fonte financeira exclusiva.

## Segurança

Atenção sensível: o Caixa contém dados financeiros e dados de clientes.

Regras:

- autenticação validada no Worker;
- acesso à unidade validado no D1;
- nenhuma credencial Conta Azul vai para D1 ou frontend nesta fase;
- nenhum secret do Apps Script é exportado;
- logs do Worker não devem registrar JWT, payload financeiro completo ou dados pessoais desnecessários;
- produção só deve ser migrada depois de regressão e comparação de dados.
