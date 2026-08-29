# Agenda Comercial — Fase 1 — Implementação

**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Início:** 2026-08-29  
**Status atual:** fundação técnica, frontend mínimo, dias úteis, filtros e QA frontend isolado implementados na branch; produção permanece inalterada.

## 1. Regra de registro

Cada fechamento técnico relevante desta frente deve ser registrado neste arquivo ou nos documentos técnicos correspondentes antes ou junto do respectivo commit.

## 2. Etapa 1A — schema/configuração aditiva

Criada rotina administrativa específica e idempotente:

- `setupCrmAgendaAvulsaFase1()`;
- `auditCrmAgendaAvulsaFase1Schema()`.

Quando executada, adicionará somente se ausentes:

- `TITULO` ao final de `AGENDA_EXECUCAO`;
- `APLICA_AVULSA` ao final de `CRM_TIPOS_ATIVIDADE`.

Propriedades:

- usa `DocumentLock`;
- não executa setup amplo/seeds;
- não altera linhas antigas;
- não habilita `APLICA_AVULSA=SIM` automaticamente;
- não cria Cliente, Prospect ou Tratativa;
- invalida somente revisões necessárias de dados/configuração.

## 3. Etapa 1B — backend explícito AVULSA

Representação canônica:

- `ENTIDADE_TIPO = AVULSA`;
- `ENTIDADE_ID = ''`;
- `TRATATIVA_ID = ''`;
- `TITULO` obrigatório;
- campos de Cliente/Prospect ficam vazios.

Rotas preservadas:

- `save_atividade`;
- `complete_atividade`;
- `cancel_atividade`;
- `delete_agenda_item` e aliases;
- `get_crm_agenda_v3`.

Para AVULSA não executar:

- criação/localização de Tratativa;
- criação de Cliente/Prospect;
- `CRM_INTERACOES`;
- `CRM_EVENTOS` nesta primeira versão;
- snapshots;
- transição de funil;
- lifecycle legado;
- mídia derivada de entidade.

`APLICA_AVULSA=SIM` é requisito para **criação nova**, não para concluir registro AVULSA já existente. Isso permite rollback por configuração sem prender atividades antigas.

A leitura da Agenda projeta `titulo` e o dashboard comercial exclui AVULSA nesta primeira versão.

## 4. Etapa 1C — frontend mínimo AVULSA

Arquivo principal:

- `frontend/crm/agenda-avulsa-fase1.js`.

Integração:

- `frontend/crm/config.js` carrega os módulos da Fase 1 antes do core;
- Cliente/Prospect continuam no fluxo legado existente.

Nova atividade AVULSA:

- escolha `Sem vínculo`;
- `Título` obrigatório;
- `Local` opcional;
- busca de entidade e mídia ficam ocultas;
- tipos vêm de `APLICA_AVULSA=SIM`;
- não há mini-cadastro de contato.

Duração:

- default usa `DURACAO_PADRAO_MIN`;
- troca de tipo atualiza o default enquanto o usuário não editar a duração;
- edição manual não é sobrescrita depois.

Workspace AVULSA:

- resumo;
- resultado quando exigido;
- observação de execução;
- concluir/cancelar/excluir.

Não carrega:

- materiais de entidade;
- checklist;
- notas de entidade;
- follow-up comercial;
- snapshot/funil.

## 5. Etapa 1D — dias úteis

Arquivo:

- `frontend/crm/agenda-dias-uteis-fase1.js`.

Regras:

- Diária pula sexta → segunda e segunda → sexta;
- `Hoje`, em fim de semana na Diária, aponta para o próximo dia útil;
- Semanal usa segunda → sexta e rótulo termina na sexta;
- seleção manual de sábado/domingo permanece possível;
- backend não bloqueia fim de semana.

## 6. Etapa 1E — filtros de Pendências vencidas

Arquivo:

- `frontend/crm/agenda-filtros-vencidas-fase1.js`.

Filtros aplicados:

- tipo;
- status;
- responsável;
- local.

Integração final:

- o módulo AVULSA captura os itens já retornados pelo core;
- compartilha os itens pelo evento interno `agf:agenda-f1-items`;
- o módulo de vencidas não cria segundo wrapper de `fetch`;
- a ocultação filtrada usa classe própria `agenda-f1-filtered-out` restrita a `#overdueList`;
- a reconciliação AVULSA não remove essa classe.

## 7. Etapas 1F/1G — performance e sincronização

Fechamentos:

- nenhuma mutação AVULSA usa `location.reload()`;
- nenhuma mutação AVULSA chama `bgRefreshAgendaJourney()`;
- estado da Agenda é reconciliado localmente;
- abrir modal não carrega cadastro detalhado de Cliente/Prospect por si só;
- não existe `MutationObserver` global sobre `document.body`;
- permanecem apenas observers pontuais de classe nos modais;
- uma única captura de respostas da Agenda alimenta os módulos da Fase 1.

Documentos:

- `docs/AGENDA_COMERCIAL_FASE1_ETAPA1F_PERFORMANCE.md`;
- `docs/AGENDA_COMERCIAL_FASE1_ETAPA1G_SINCRONIZACAO_DOM.md`.

## 8. Etapa 1H — QA frontend isolado

Foi criado harness frontend-only com API mockada e sem dados/endpoints de produção.

O harness carregou o código real da branch a partir de commit fixado.

### Falha encontrada e corrigida

O QA detectou erro real de sintaxe em `agenda-avulsa-fase1.js`:

`Unexpected token ')'`.

Correção:

- `b4ed94cfd87df8b47bad385a91b62af3fb42809e` — `fix(crm): corrigir sintaxe do card da agenda avulsa`.

Também foi refinada a integração dos filtros de vencidas para evitar disputa de visibilidade entre módulos.

### Resultado final

**10/10 verificações aprovadas**:

1. módulo AVULSA carregado;
2. `APLICA_AVULSA` respeitado;
3. duração padrão por tipo;
4. criação AVULSA mockada sem entidade;
5. workspace AVULSA enxuto;
6. Diária sexta → segunda;
7. Semanal segunda → sexta;
8. tipo filtra Pendências vencidas;
9. evento interno compartilha itens;
10. nenhuma chamada usa endpoint de produção.

Documento detalhado:

- `docs/AGENDA_COMERCIAL_FASE1_ETAPA1H_QA_FRONTEND_ISOLADO.md`.

## 9. Estado de produção

Até este fechamento:

- nenhum Apps Script da Fase 1 foi publicado;
- nenhum frontend da Fase 1 foi publicado;
- `setupCrmAgendaAvulsaFase1()` não foi executado em produção;
- `TITULO` não foi criado na planilha viva por esta branch;
- `APLICA_AVULSA` não foi criado/configurado na planilha viva por esta branch;
- nenhuma atividade AVULSA real foi criada.

A produção foi conferida visualmente no Opera durante o QA e permaneceu na versão anterior.

## 10. Gate ainda aberto

Próximo fechamento obrigatório: **homologação integrada segura com Apps Script/schema da Fase 1**.

Deve validar:

- Cliente e Prospect sem regressão;
- AVULSA contra backend real de homologação;
- setup `TITULO`/`APLICA_AVULSA`;
- ausência de Tratativa/CRM_INTERACOES/CRM_EVENTOS para AVULSA;
- conclusão/cancelamento/exclusão;
- permissões `canViewTeam`/`agendaScope`;
- desktop/mobile;
- risco legado `openActivityModal()` x `agendaWin.items` para atividade vinculada.

Nenhum merge/deploy em produção antes desse gate.
