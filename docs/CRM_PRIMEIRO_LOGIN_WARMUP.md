# CRM - primeiro login e warmup V5

Data: 2026-08-21
Status: em homologacao no PR #27. Nao fazer merge/publicacao definitiva sem validacao funcional.

## Problemas priorizados

### 1. Primeiro login muito lento

No trace de Chrome analisado nesta investigacao, o HTML/CSS do CRM ficam disponiveis rapidamente, mas a tela permanece em `Carregando CRM...` ate a resposta de `get_crm_boot_lite_v5`.

Baseline observado no trace:
- FCP: aproximadamente 1,2 s;
- `get_crm_boot_lite_v5`: aproximadamente 13 s;
- o spinner inicial so e escondido depois que essa chamada responde.

Conclusao: o gargalo percebido no primeiro login esta no backend do Apps Script/cache frio, nao na renderizacao inicial do HTML.

### 2. Gatilho `crm5x_warmupTrigger` excedendo o tempo

A notificacao do Google Apps Script de 20/08/2026 mostra:
- handler: `crm5x_warmupTrigger`;
- tipo: time-based;
- inicio: 07:59:55 BRT;
- fim: 08:05:56 BRT;
- erro: `Exceeded maximum execution time`.

O acionador esta disparando. O problema e que a execucao antiga faz trabalho demais em uma unica rodada.

O warmup legado tenta aquecer:
- configuracao;
- Agenda ampla;
- entidades lite;
- tratativas.

Com a base atual, essa estrategia pode ultrapassar o limite de execucao e ainda nao garante que o cache final do dashboard esperado pelo primeiro login esteja pronto.

## Correcao preparada

Arquivo: `apps-script/base-metro/18_CRM_PERF_TRIGGER.js`

Novo handler:
- `crm5x_warmupFastTrigger`

Estrategia:
- le somente as colunas necessarias da Agenda e das Tratativas para os indicadores iniciais;
- reproduz o mesmo payload de `crm3_apiGetDashboard_`;
- grava o resultado na mesma chave consumida por `crm5x_dashboardCached_`;
- aquece a semana atual para o escopo geral, responsaveis ativos e sem responsavel;
- evita montar as bases completas apenas para preparar o primeiro login.

Arquivo de diagnostico:
- `apps-script/base-metro/19_CRM_PERF_DIAG.js`

Funcoes:
- `crm5x_diagPrimeiroLogin()` - somente leitura; informa se os caches do primeiro login estao quentes e mostra o status dos gatilhos.
- `crm5x_testarWarmupPrimeiroLogin()` - executa o warmup rapido manualmente e valida imediatamente os caches gerados.

## Migracao do acionador

A migracao NAO acontece automaticamente com o deploy.

Depois de publicar esta versao no projeto Apps Script correto, executar uma vez:

`crm5x_migrarWarmupTrigger()`

Essa funcao:
1. remove gatilhos do handler legado `crm5x_warmupTrigger`;
2. remove eventual duplicidade do handler novo;
3. cria um unico `crm5x_warmupFastTrigger` a cada 10 minutos;
4. executa um warmup imediato;
5. devolve o status e os tempos do warmup.

## Validacao obrigatoria depois da publicacao

1. Executar `crm5x_testarWarmupPrimeiroLogin()`.
2. Confirmar `ok: true`.
3. Confirmar `diagnostico.todosCachesQuentes: true`.
4. Executar `crm5x_statusWarmupTrigger()`.
5. Confirmar:
   - `handler = crm5x_warmupFastTrigger`;
   - `instalado = true`;
   - `quantidade = 1`;
   - `legacyQuantidade = 0`.
6. Abrir Acionadores no Apps Script e confirmar que o handler antigo nao aparece mais.
7. Aguardar/forcar uma execucao agendada e confirmar que termina sem `Exceeded maximum execution time`.
8. Fazer logout do portal.
9. Fazer login novamente e abrir `/crm/`.
10. Medir `get_crm_boot_lite_v5` com `debugPerf=1` ou DevTools.
11. Comparar com o baseline de aproximadamente 13 s.

## Criterio de aceite

O ajuste so deve ser considerado concluido quando:
- o gatilho novo executar repetidamente sem timeout;
- o diagnostico mostrar cache quente para o primeiro login;
- o spinner inicial cair substancialmente abaixo do baseline observado;
- Home, Prospects, Clientes e Agenda continuarem funcionais;
- nenhum recurso for removido para obter ganho de velocidade.

## Observacao de deploy

O projeto usa `clasp` como ferramenta oficial para publicar Apps Script. Deve ser reutilizado o `deploymentId` existente do ambiente. Nao inventar ou criar um deployment novo sem necessidade, pois a URL do Web App deve permanecer estavel.
