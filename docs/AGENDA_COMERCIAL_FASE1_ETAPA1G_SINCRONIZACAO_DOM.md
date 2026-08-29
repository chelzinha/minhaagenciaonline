# Agenda Comercial — Fase 1 — Etapa 1G — Sincronização DOM

## Fechamento

O módulo `frontend/crm/agenda-avulsa-fase1.js` deixou de observar globalmente todo o `document.body` com `MutationObserver`.

A sincronização visual das atividades `AVULSA` passa a reagir somente a eventos próprios da Agenda e às respostas de API já observadas pelo módulo.

## Motivo

O observer global podia ser acionado pelas próprias alterações de DOM feitas pelo módulo, aumentando trabalho de renderização e criando risco de ciclos de atualização desnecessários.

## Comportamento atual

A atualização AVULSA é reprocessada quando ocorre:

- resposta do boot/API contendo configuração ou itens da Agenda;
- mudança de modo Diário/Semanal/Mensal;
- período anterior/próximo;
- botão Hoje;
- alteração do seletor de data;
- interação com filtros próprios da Agenda;
- criação, conclusão, cancelamento ou exclusão AVULSA.

Continuam existindo apenas observers pontuais nos modais `agendaModal` e `activityModal`, limitados à mudança da classe do próprio modal.

## Performance

- não há observer global da árvore inteira;
- não há reload de página após mutação AVULSA;
- não há recarga intencional de jornadas/funis após mutação AVULSA;
- a reconciliação visual é limitada ao estado da Agenda.

### Gate adicional — carga de Cliente/Prospect

Revisão do core atual confirmou:

- `openAgendaModal()` não chama `loadLegacyData()` ao abrir;
- Clientes e Prospects detalhados só são carregados em `renderEntityOptions()` quando existe texto na busca de entidade e o legado ainda não está pronto;
- no modo AVULSA, a busca de entidade fica oculta e os IDs são esvaziados;
- portanto, selecionar `Sem vínculo` não cria por si só uma carga de Cliente/Prospect.

Isso preserva a decisão de usar AVULSA também como caminho mais leve para a Agenda.

## Compatibilidade

Nenhuma action, endpoint, coluna ou regra de Cliente/Prospect foi alterada nesta etapa.

A revisão de `CRM_RESULTADOS_ATIVIDADE` também confirmou que a configuração canônica usa a coluna `ATIVA`, compatível com a validação do workspace AVULSA.

## Commits

- `474d382277258a7527f868016eab6fed564f4de9` — `perf(crm): limitar sincronizacao DOM da agenda avulsa`
- commit documental deste gate registra a validação de carga e resultados.

## Estado

Implementado na branch `feat/crm-agenda-avulsa-fase1`. Produção permanece inalterada e a homologação integrada ainda é obrigatória antes de merge/deploy.
