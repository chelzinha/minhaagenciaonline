# Agenda Comercial — Fase 1 — Implementação

**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Início:** 2026-08-29  
**Status atual:** Etapa 1A concluída em código; ainda não aplicada na planilha de produção.

## 1. Regra de registro

Cada fechamento técnico relevante desta frente deve ser registrado neste arquivo ou nos documentos técnicos correspondentes antes ou junto do respectivo commit.

## 2. Etapa 1A — schema/configuração aditiva

### Fechamento

Foi criada uma rotina administrativa específica e idempotente para preparar o schema necessário às atividades `AVULSA`, sem executar setup amplo do CRM e sem alterar linhas existentes.

### Arquivo criado

`apps-script/base-metro/17_CRM_AGENDA_AVULSA_FASE1.js`

### Funções

- `setupCrmAgendaAvulsaFase1()`
- `auditCrmAgendaAvulsaFase1Schema()`

### Alterações previstas quando o setup for executado

`AGENDA_EXECUCAO`:

- adicionar `TITULO` ao final, somente se ausente.

`CRM_TIPOS_ATIVIDADE`:

- adicionar `APLICA_AVULSA` ao final, somente se ausente.

### Propriedades da migração

- usa `DocumentLock` por meio de `op_withDocumentLock_`;
- é idempotente;
- não preenche `APLICA_AVULSA=SIM` automaticamente;
- não cria ou altera Cliente, Prospect ou Tratativa;
- não altera registros antigos da Agenda;
- invalida a revisão de dados da Agenda e a revisão de configuração V5 apenas para evitar cache de schema antigo;
- possui auditoria somente leitura dos dois cabeçalhos esperados.

### Commit

`dd9570df8064a8e7bb17f45c4b4be32473dcf8c5` — `feat(crm): preparar schema da agenda avulsa`

### Estado de produção

Nenhum Apps Script foi publicado e nenhuma coluna foi adicionada na planilha de produção por este commit. O código está somente na branch de homologação.

## 3. Próximo fechamento

Etapa 1B — tornar o backend explicitamente compatível com `ENTIDADE_TIPO=AVULSA`, preservando integralmente os fluxos atuais de Cliente e Prospect e sem habilitar ainda um redesign da interface.
