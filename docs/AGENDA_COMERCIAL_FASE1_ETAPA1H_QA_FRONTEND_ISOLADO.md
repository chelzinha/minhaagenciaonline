# Agenda Comercial — Fase 1 — Etapa 1H — QA frontend isolado

Data: 2026-08-29

## 1. Objetivo

Validar os módulos frontend reais da branch `feat/crm-agenda-avulsa-fase1` antes de qualquer publicação de Apps Script, alteração de schema em produção ou deploy do frontend principal.

Este QA é **isolado** e não substitui a homologação integrada final com Apps Script/schema da Fase 1.

## 2. Ambiente

Foi criado um harness temporário frontend-only com:

- API totalmente mockada;
- nenhuma credencial AGF;
- nenhum token;
- nenhum dado real de Cliente/Prospect;
- nenhuma URL de API de produção;
- módulos carregados a partir de commit fixado da branch;
- validação visual pelo Opera;
- captura web/mobile do ambiente de QA;
- verificação explícita de que todas as chamadas do harness permanecem em `https://qa.local/api`.

O preview temporário não deve ser tratado como ambiente oficial da Plataforma Digital.

## 3. Falha real encontrada antes da homologação

Ao carregar o código exato da branch, o QA encontrou erro de sintaxe em:

`frontend/crm/agenda-avulsa-fase1.js`

Erro:

`Unexpected token ')'`

Causa:

Uma expressão ternária usada para montar a hora final no card tinha o ramo falso ausente.

Correção:

`b4ed94cfd87df8b47bad385a91b62af3fb42809e` — `fix(crm): corrigir sintaxe do card da agenda avulsa`

Esse erro foi descoberto antes de qualquer publicação em produção.

## 4. Ajuste de integração dos filtros de vencidas

O QA também mostrou uma disputa de visibilidade entre:

- reconciliação local do módulo AVULSA;
- filtro próprio da seção de Pendências vencidas.

A solução final ficou isolada no módulo pequeno de vencidas:

- os itens da Agenda são compartilhados por evento interno `agf:agenda-f1-items`;
- o módulo de vencidas não cria um segundo wrapper de `fetch`;
- a ocultação usa a classe própria `agenda-f1-filtered-out` com `display:none!important` restrito a `#overdueList`;
- o reconciliador AVULSA não remove essa classe;
- o empty-state filtrado permanece sob responsabilidade do módulo de vencidas.

Commits relacionados:

- `5434b799c9b9f7e34bad0559a81378aaa4cce92e` — `perf(crm): compartilhar itens da agenda entre modulos fase 1`;
- `9fa938388e30dfd4302ed13b442d7d25613125fa` — `perf(crm): consumir itens compartilhados nos filtros vencidos`;
- `44177df0919198fd1b5f532eaca5f71787fd0bcf` — `fix(crm): isolar visibilidade dos filtros vencidos`.

## 5. Resultado final

QA automática: **10/10 verificações aprovadas**.

| Verificação | Resultado |
| --- | --- |
| Módulo AVULSA carrega e injeta switch/campos | PASS |
| Tipos respeitam `APLICA_AVULSA` | PASS |
| Duração padrão vem do tipo configurado | PASS |
| Criação AVULSA não exige entidade | PASS |
| Workspace AVULSA oculta workspace rico | PASS |
| Diária pula sexta → segunda | PASS |
| Semanal usa rótulo segunda → sexta | PASS |
| Tipo filtra Pendências vencidas | PASS |
| Evento interno compartilha itens da Agenda | PASS |
| Nenhuma chamada usa endpoint de produção | PASS |

Evidências técnicas do último ciclo:

- filtro selecionado: `Visita`;
- pendência de `Ligação` ficou não visível;
- empty-state filtrado ficou visível;
- evento interno foi observado com itens;
- chamadas do harness permaneceram exclusivamente na API mockada.

## 6. O que este QA comprova

Comprova, em frontend isolado:

- sintaxe carregável dos módulos testados;
- parametrização de AVULSA;
- fluxo mínimo de criação mockada;
- duração configurada;
- workspace enxuto;
- navegação de dias úteis;
- filtro de vencidas;
- isolamento de endpoint de produção.

## 7. O que este QA NÃO comprova

Ainda não comprova:

- gravação real em `AGENDA_EXECUCAO`;
- setup real de `TITULO` e `APLICA_AVULSA`;
- integração real com Apps Script;
- ausência real de criação de Tratativa/CRM_INTERACOES/CRM_EVENTOS após uma escrita real;
- permissões reais `canViewTeam`/`agendaScope` em backend;
- regressão de criação vinculada Cliente/Prospect no ambiente integrado;
- bug legado `openActivityModal()` x `agendaWin.items` em atividade vinculada;
- decisão definitiva de Diária como abertura padrão.

## 8. Produção

Produção permaneceu inalterada durante todo o QA.

Foi confirmado visualmente no Opera que a Agenda pública continuava na versão anterior durante os testes.

Nenhum Apps Script da Fase 1 foi publicado e nenhuma coluna foi criada na planilha de produção por este QA.

## 9. Próximo gate

Homologação integrada segura com backend/schema da Fase 1, antes de merge/deploy em produção.
