# Agenda Comercial — Fase 1 — Implementação

**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Início:** 2026-08-29  
**Status atual:** Etapas 1A e 1B concluídas em código na branch; ainda não aplicadas na planilha/Apps Script de produção.

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

### Commits

- `dd9570df8064a8e7bb17f45c4b4be32473dcf8c5` — `feat(crm): preparar schema da agenda avulsa`
- `bd2ad0e606bc77aef4e333741b47da89c4c25ec8` — `feat(crm): adicionar nucleo backend da agenda avulsa`

## 3. Etapa 1B — suporte explícito a AVULSA no backend

### Fechamento

As mesmas rotas públicas da Agenda passam a suportar `ENTIDADE_TIPO=AVULSA`, sem criar API paralela e sem alterar o contrato das atividades vinculadas.

### Comportamento canônico

Para AVULSA:

- `ENTIDADE_TIPO = AVULSA`;
- `ENTIDADE_ID = ''`;
- `TRATATIVA_ID = ''`;
- `CLIENTE`, `CLIENTE_ID`, `PROSPECT_ID` e `CLIENTE_MASTER_ID` ficam vazios;
- `TITULO` é obrigatório;
- o tipo precisa estar ativo e ter `APLICA_AVULSA=SIM`;
- `DURACAO_PADRAO_MIN` é usada quando o payload não informa duração;
- `REQUEST_ID` continua garantindo idempotência;
- responsável, local, data, horário, status e resultado continuam sendo campos normais da Agenda.

### Operações deliberadamente não executadas para AVULSA

- criação/localização de Tratativa;
- criação de Cliente/Prospect;
- `CRM_INTERACOES`;
- `CRM_EVENTOS`;
- snapshot de Cliente/Prospect;
- transição de funil;
- sincronização de lifecycle legado;
- mídia derivada de entidade.

### Rotas preservadas

Continuam sendo usadas:

- `save_atividade`;
- `complete_atividade`;
- `cancel_atividade`;
- `delete_agenda_item` e aliases atuais;
- `get_crm_agenda_v3`.

### Funções alteradas no backend principal

`apps-script/base-metro/06_CRM_JORNADA_FASE3.js`:

- `crm3_normalizeEntityType_()` reconhece `AVULSA` explicitamente;
- `crm3_apiCreateTratativa_()` rejeita AVULSA;
- `crm3_apiSaveAtividade_()` desvia AVULSA para o núcleo específico antes de resolver entidade/tratativa;
- `crm3_apiCompleteAtividade_()` conclui AVULSA sem operações de CRM;
- `crm3_apiCancelAtividade_()` cancela AVULSA somente em `AGENDA_EXECUCAO`;
- `crm3_apiDeleteAtividade_()` preserva a semântica atual de exclusão física, sem criar evento de CRM para AVULSA;
- `crm3_readAgendaV3_scan_()` projeta `titulo`;
- `crm3_getEntity_()` não trata AVULSA como Cliente;
- `crm3_updateEntityTreatmentSnapshot_()` e `crm3_syncLegacyLifecycle_()` ignoram AVULSA;
- `crm3_apiGetDashboard_()` exclui AVULSA dos indicadores comerciais nesta primeira versão.

### Compatibilidade

- Registros antigos não são migrados nem reinterpretados.
- Cliente/Prospect continuam usando os fluxos existentes.
- Valor vazio/legado de tipo de entidade mantém o fallback anterior; somente `AVULSA` explícito entra no novo fluxo.
- `TITULO` é opcional para atividades vinculadas.

### Gate de regressão do commit principal

Foi revisado o diff do commit de integração do arquivo `06_CRM_JORNADA_FASE3.js`.

Resultado:

- funções críticas existentes continuam presentes;
- não foi identificada remoção de lógica de Cliente/Prospect;
- as deleções extras do diff são majoritariamente comentários/documentação inline do arquivo;
- por segurança, próximas alterações em arquivos grandes devem evitar regravação ampla quando houver alternativa mais localizada.

### Commit

`5d5d071b24b67842612ec45c4cdc549f1f758cb2` — `feat(crm): suportar agenda avulsa no backend`

## 4. Estado de produção

Até este fechamento:

- nenhum Apps Script da Fase 1 foi publicado;
- `setupCrmAgendaAvulsaFase1()` não foi executado em produção;
- `TITULO` ainda não foi adicionado à planilha viva por esta branch;
- `APLICA_AVULSA` ainda não foi adicionado/configurado na planilha viva por esta branch;
- nenhuma atividade AVULSA real foi criada.

## 5. Próximo fechamento

Etapa 1C — frontend mínimo homologável:

- permitir escolher atividade vinculada ou sem vínculo;
- exibir `TITULO`/`LOCAL` para AVULSA;
- filtrar tipos por `APLICA_AVULSA`;
- corrigir duração padrão por tipo sem sobrescrever edição manual;
- não carregar Cliente/Prospect no modo AVULSA;
- abrir/renderizar AVULSA sem fallback para Cliente;
- workspace enxuto;
- refresh somente da Agenda após salvar AVULSA;
- corrigir abertura de cards vindos de `agendaWin` e consistência dos filtros de vencidas.
