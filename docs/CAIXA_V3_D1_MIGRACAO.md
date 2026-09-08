# Caixa V3 - Migração para Cloudflare Workers + D1

**Data:** 08/09/2026  
**Módulo:** Caixa  
**Branch:** `feature/caixa-v3-d1`  
**Status:** EM HOMOLOGAÇÃO  
**Produção afetada:** NÃO

## 1. Objetivo

Remover o principal gargalo de carregamento do Caixa, hoje concentrado em chamadas ao Google Apps Script que leem e processam várias abas do Google Sheets antes de devolver a tela.

A migração preserva as funcionalidades da V3 já definidas e troca gradualmente apenas a camada de dados.

## 2. Diagnóstico

Mesmo após otimizações do bootstrap Apps Script, a abertura continuou percebida como lenta.

O fluxo atual ainda depende de:

```text
Frontend
-> Apps Script
-> Google Sheets
-> leitura/processamento
-> JSON
-> frontend
```

O Caixa possui consultas adequadas a banco transacional indexado:

- unidade e permissões do usuário;
- movimentos da unidade/data;
- Pix pendentes;
- saldo diário;
- sangrias;
- fechamento;
- complementos;
- fila Conta Azul;
- clientes e bibliotecas parametrizadas.

## 3. Arquitetura escolhida

### Fase 1 - híbrida

```text
Frontend Caixa V3
        |
        v
Cloudflare Worker
        |
        +-- leituras rápidas -> D1
        |
        +-- escritas -> Apps Script V3 homologação
                           |
                           +-- Sheets
                           +-- Drive/PDF
                           +-- Conta Azul
        |
        +-- espelho pós-escrita -> D1
```

Leituras que passam a ser nativas no D1:

```text
unitAccess
init
summary
```

As escritas continuam no Apps Script inicialmente para preservar as integrações financeiras já homologadas.

## 4. Banco D1

Banco dedicado planejado:

```text
agf-caixa
```

Não reutilizar D1 de outro módulo.

Tabelas:

```text
caixa_meta
caixa_units
caixa_user_units
caixa_accounts
caixa_payments
caixa_revenue_types
caixa_expense_types
caixa_clients
caixa_entries
caixa_daily_balances
caixa_withdrawals
caixa_closures
caixa_closure_supplements
caixa_conta_azul_queue
```

Índices priorizam:

- usuário/unidade;
- unidade/data/status;
- Pix por status e TXID;
- fechamento;
- status Conta Azul;
- saldos;
- sangrias;
- complementos;
- fila financeira.

## 5. Compatibilidade preservada

A resposta D1 de `init` conserva o contrato consumido pelo frontend:

```text
user
library
clients
entries
withdrawals
summary
closure
supplementState
pendingPixBacklogCount
serverDate
timezone
```

Regras V3 preservadas:

- Pix pendente pertence ao movimento do dia;
- Pix pendente não bloqueia fechamento;
- Pix pode ser confirmado depois do fechamento;
- novos movimentos podem ser registrados após o fechamento principal;
- fechamento posterior cria complemento;
- somente movimentos ainda não consolidados entram no complemento;
- movimentos já enviados ao Conta Azul não são reenviados;
- Cliente de Balcão permanece fallback operacional;
- unidade padrão continua persistida por usuário.

## 6. Estratégia de migração de dados

O Apps Script de homologação recebe duas actions autenticadas:

```text
exportD1Snapshot
exportD1UnitSnapshot
```

### Snapshot completo

Usado uma vez para popular o D1 com:

- unidades;
- permissões;
- contas;
- pagamentos;
- receitas;
- despesas;
- clientes;
- lançamentos;
- saldos;
- sangrias;
- fechamentos;
- complementos;
- fila Conta Azul.

### Snapshot de unidade

Usado pela ponte híbrida após operações que alteram várias tabelas, como fechamento e saldo inicial.

O snapshot não exporta PropertiesService ou secrets.

## 7. Autenticação e permissões

O Worker valida localmente o mesmo JWT AGF utilizado pelo Caixa atual.

Secret do Worker:

```text
AGF_AUTH_JWT_SECRET
```

Deve ser configurado com `wrangler secret put`.

O valor real não pode ser armazenado no GitHub.

O Worker também exige que o token possua acesso ao app `caixa` e valida a unidade autorizada no D1.

## 8. Conta Azul

Na Fase 1, a integração Conta Azul não é reescrita.

Fluxo:

```text
Worker
-> Apps Script de homologação
-> fila Conta Azul atual
-> API Conta Azul
```

Isso preserva o fluxo já testado ponta a ponta.

A migração nativa da fila Conta Azul para Worker/D1 ficará para uma fase posterior, somente depois de estabilidade do D1 operacional.

## 9. PDFs

PDFs de fechamento e sangria continuam no fluxo Apps Script + Google Drive nesta fase.

Nenhuma mudança de armazenamento de PDF faz parte deste corte.

## 10. Performance esperada

O ganho principal deve aparecer na abertura e atualização da tela, porque `unitAccess`, `init` e `summary` deixam de abrir/processar Google Sheets.

O Worker devolve `bootstrapMs` na resposta de `init` para permitir medição objetiva do processamento D1.

Não considerar a migração aprovada apenas pela sensação visual. Comparar:

- tempo total da chamada;
- `bootstrapMs`;
- conteúdo da resposta;
- totais financeiros;
- movimentos;
- unidade;
- Pix pendentes;
- fechamento/complementos.

## 11. Etapas de homologação

- [x] Criar branch isolada.
- [x] Criar schema D1 e índices.
- [x] Criar Worker híbrido.
- [x] Criar autenticação JWT no Worker.
- [x] Criar exportação de snapshot no Apps Script da branch.
- [ ] Criar banco `agf-caixa` no Cloudflare.
- [ ] Aplicar migrations.
- [ ] Configurar secret JWT no Worker.
- [ ] Atualizar Apps Script de homologação.
- [ ] Publicar Worker de homologação.
- [ ] Importar snapshot inicial.
- [ ] Conferir contagens D1 x Sheets.
- [ ] Medir `init` AGF.
- [ ] Medir `init` Shopping Metrô.
- [ ] Testar leitura de Pix antigo pendente.
- [ ] Apontar frontend isolado para Worker.
- [ ] Testar lançamento Dinheiro.
- [ ] Testar Pix.
- [ ] Testar baixa Pix.
- [ ] Testar exclusão antes de consolidar.
- [ ] Testar sangria.
- [ ] Testar fechamento.
- [ ] Testar Conta Azul.
- [ ] Testar fechamento complementar.
- [ ] Validar virada de dia.
- [ ] Só depois planejar produção.

## 12. Atenção sensível

**SIM.**

Motivo:

- valores financeiros;
- dados de clientes;
- autenticação;
- permissões;
- Pix;
- integração Conta Azul.

Mitigações:

- branch e D1 isolados;
- produção intacta;
- secrets fora do Git;
- leitura D1 com JWT validado;
- escrita financeira preservada no backend já homologado;
- rollback simples para Apps Script.

## 13. Rollback

Enquanto a Fase 1 estiver em homologação:

1. não alterar `/caixa/` em produção;
2. manter endpoint Apps Script atual;
3. se o Worker/D1 falhar, retirar o override do frontend de homologação;
4. voltar a homologação para o Apps Script V3;
5. nenhum dado de produção depende exclusivamente do D1 nesta fase.

## 14. Critério de promoção

Só promover quando houver equivalência comprovada entre D1 e Apps Script para:

- acesso por unidade;
- bibliotecas;
- clientes;
- movimentos;
- saldos;
- Pix;
- sangrias;
- fechamento;
- complementos;
- status Conta Azul;
- virada de dia.

E quando o tempo de abertura medido justificar a migração.
