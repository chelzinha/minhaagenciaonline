# Agenda Comercial — Fase 1 — Riscos abertos

## P1 — homologação integrada do frontend

Os módulos da Fase 1 foram isolados para reduzir regressão no `frontend/crm/app.js` legado.

Antes de merge/deploy ainda é obrigatório validar em ambiente integrado:

- ordem real de carregamento `config.js` → módulos Fase 1 → `app.js`;
- criação vinculada Cliente e Prospect sem mudança de comportamento;
- criação AVULSA sem carga de entidade;
- abertura e workspace AVULSA;
- conclusão, cancelamento e exclusão;
- filtros, responsável e permissões;
- desktop e mobile.

O teste antigo em URL `data:` não é evidência de homologação e deve ser ignorado.

## P1 — configuração APLICA_AVULSA para homologação

Nenhum tipo deve ser habilitado automaticamente.

Para homologar criação AVULSA é necessário definir explicitamente quais tipos terão `APLICA_AVULSA=SIM`. Isso é configuração controlada, não regra hardcoded no frontend.

## P2 — arquivo legado 06

`apps-script/base-metro/06_CRM_JORNADA_FASE3.js` foi regravado pelo conector e o diff removeu comentários inline além das alterações funcionais.

Revisão atual do patch confirmou:

- não houve remoção de função;
- as 80 deleções são comentários/documentação inline;
- alterações executáveis estão restritas a schema aditivo, reconhecimento de AVULSA, guards de CRM, `TITULO` e exclusão de AVULSA dos indicadores comerciais.

Mesmo assim, Cliente e Prospect permanecem no checklist obrigatório de regressão.

## P2 — bug legado `agendaWin` em atividade vinculada

O core atual possui um risco pré-existente: `openActivityModal()` procura `state.agenda.items` e `state.overdue`, enquanto a renderização pode usar `state.agendaWin.items`.

Classificação para esta Fase 1:

- não é causado pelo modo AVULSA;
- AVULSA não depende desse lookup porque o módulo Fase 1 intercepta seu próprio clique;
- não será ampliado dentro desta entrega pequena sem reprodução integrada;
- atividade vinculada navegada em nova janela/período deve ser testada antes do merge;
- se o erro for reproduzido, corrigir em commit separado ou bloquear merge.

## Resolvido — documentação geral

O fechamento técnico já está consolidado em:

- `CHANGELOG.md`;
- `docs/FRONTEND.md`;
- `docs/APPS_SCRIPT.md`;
- `docs/PLANILHAS_E_DADOS.md`;
- `docs/PERFORMANCE.md`;
- documentação específica `docs/AGENDA_COMERCIAL_FASE1_*`.

## Resolvido — rollback de `APLICA_AVULSA`

A criação continua exigindo `APLICA_AVULSA=SIM`, mas atividades AVULSAS já existentes podem ser concluídas mesmo depois de a configuração ser desabilitada.

Isso permite bloquear novas criações sem inutilizar histórico já gravado.

## Resolvido — recarga indevida de jornadas após AVULSA

Operações AVULSA não usam mais `location.reload()` nem `bgRefreshAgendaJourney()`.

A atualização é reconciliada localmente na Agenda, evitando recarga intencional de funis/tratativas.

## Resolvido — observer global do DOM

O módulo AVULSA não observa mais toda a árvore de `document.body`.

A sincronização reage somente a respostas de API e ações da própria Agenda, mantendo apenas observers pontuais de classe nos dois modais envolvidos.

## Resolvido — captura ampla do módulo de vencidas

O módulo de filtros de pendências vencidas passou a clonar somente respostas do endpoint configurado do CRM, evitando processar `fetch` não relacionado.
