# Agenda Comercial — Fase 1F — Performance do fluxo AVULSA

**Data do fechamento:** 2026-08-29  
**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Status:** implementado na branch; pendente de homologação integrada.

## Problema encontrado na revisão do PR

A primeira versão do módulo AVULSA fazia `location.reload()` depois de salvar, concluir, cancelar ou excluir.

A revisão do core mostrou que isso contrariava a decisão de performance: `loadRestProgressive()` atualmente solicita também as jornadas de Clientes e Prospects, mesmo quando a rota ativa é Agenda. Portanto uma recarga completa após uma operação AVULSA voltaria a carregar dados de CRM que a atividade não alterou.

## Regra fechada

Operações AVULSA não devem recarregar a página nem disparar recarga de funis/jornadas apenas para refletir a alteração na Agenda.

## Implementação

Commit:

`f0c3c9969149cfc773330af4a9ea0744a9321cbe` — `perf(crm): atualizar avulsas sem recarregar jornadas`

Arquivo:

`frontend/crm/agenda-avulsa-fase1.js`

### Após salvar

- usa a resposta de `save_atividade` e o payload já validado para montar o item operacional local;
- adiciona o item ao mapa leve do módulo;
- insere o card na data visível quando aplicável;
- atualiza a seção de vencidas se a data/status fizerem o item pertencer a ela;
- não executa `location.reload()`.

### Após concluir/cancelar

- o backend permanece a fonte de verdade;
- após resposta `ok`, o status local é atualizado;
- card e vencidas são reconciliados no DOM;
- nenhum funil/jornada é recarregado.

### Após excluir

- após confirmação do backend, o ID entra no conjunto local de excluídos;
- cards daquele ID são removidos da Agenda/vencidas;
- re-renderizações do core durante a mesma sessão não ressuscitam o item excluído.

### Navegação posterior

Quando o core fizer uma nova leitura normal da Agenda, o módulo volta a capturar os dados retornados pelo servidor. Assim a atualização imediata é local, mas a verdade persistida continua sendo reidratada naturalmente pelo backend.

## Otimizações adicionais mantidas

- o módulo não faz carga eager de configuração própria; prioriza capturar `config` do boot já feito pelo CRM;
- `get_crm_config_v3` fica apenas como fallback tardio se a configuração ainda não estiver disponível quando o usuário abrir o fluxo;
- modo AVULSA não executa autocomplete de Cliente/Prospect;
- filtros de vencidas reaproveitam itens já retornados, sem request adicional.

## Impacto esperado

Reduzir trabalho desnecessário após operações AVULSA e preservar a decisão de que uma atividade sem vínculo não deve causar recarga de dados de Cliente, Prospect, Tratativa ou funil.

## Homologação necessária

- confirmar que card novo aparece sem reload;
- confirmar conclusão/cancelamento/exclusão sem reload;
- observar Network/`debugPerf=1` e confirmar ausência de `get_crm_jornada_data` causada especificamente pela mutação AVULSA;
- navegar entre modos/períodos e confirmar reidratação correta pelo servidor;
- validar desktop e 390px.
