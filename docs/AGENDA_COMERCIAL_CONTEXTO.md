# Agenda Comercial AGF — contexto consolidado e revisão completa

> Documento de handoff para iniciar uma conversa separada dedicada exclusivamente à Agenda do CRM Comercial da Plataforma Digital AGF.
>
> Revisão consolidada em 2026-08-29 a partir do histórico disponível no projeto, código atual do repositório, documentação técnica e histórico de commits relacionados à Agenda.
>
> Objetivo: preservar o que já funciona, registrar as decisões de negócio já tomadas, explicitar lacunas atuais e orientar uma evolução segura de layout, usabilidade, fluxo operacional, performance e experiência mobile.

---

## 1. Conclusão prática

A Agenda **não deve ser tratada apenas como um calendário**.

A direção do produto é transformá-la na **foto do dia do comercial**: ao abrir a Agenda, a pessoa deve entender em poucos segundos:

1. o que precisa fazer hoje;
2. o que está atrasado;
3. qual é a próxima atividade;
4. o que já foi concluído;
5. quanto ainda falta executar;
6. onde precisa estar;
7. com quem precisa falar;
8. quais atividades exigem atenção imediata;
9. como está a carga do dia e da semana;
10. quais ações podem ser executadas diretamente dali.

A Agenda também precisa funcionar **mesmo quando a atividade não estiver vinculada a cadastro de Cliente, Prospect ou Tratativa**.

Isso é requisito de negócio e precisa ser tratado como parte do desenho principal, não como exceção.

A implementação atual já possui uma base funcional importante. A próxima etapa **não é reconstruir do zero**: é reorganizar a experiência sobre os fluxos existentes, corrigir lacunas e tornar a tela muito mais operacional.

---

## 2. Como interpretar este documento

Para evitar misturar fato, decisão e proposta, os itens abaixo usam quatro classificações.

### CONFIRMADO NO CÓDIGO

Comportamento encontrado no repositório atual ou no histórico técnico versionado.

### DECISÃO DE NEGÓCIO

Direção já definida na conversa e que deve ser preservada na próxima implementação.

### PROPOSTA DE EVOLUÇÃO

Sugestão de UX/arquitetura ainda sujeita a validação visual ou técnica.

### A CONFIRMAR

Ponto que precisa ser validado no código, planilha, operação real ou com a Rachel antes de implementar.

A próxima conversa deve preservar essa distinção.

---

## 3. Regra para a próxima conversa

Antes de alterar qualquer arquivo:

1. Ler este documento inteiro.
2. Inspecionar o código atual no GitHub.
3. Abrir a Agenda atual em navegador/preview e registrar visualmente o estado real.
4. Mapear o fluxo completo de leitura, criação, edição, conclusão, cancelamento e exclusão de atividade.
5. Mapear as dependências de Apps Script e planilhas.
6. Confirmar como a Agenda se comporta hoje com Cliente, Prospect e Tratativa.
7. Auditar especificamente a criação de atividade **sem vínculo cadastral**.
8. Preservar nomes de actions, IDs de elementos, abas, colunas e estruturas já consumidas, salvo mudança deliberada e documentada.
9. Evitar regressão em Prospects, Clientes, Home, Funis e CRM.
10. Fazer mudanças pequenas e homologáveis.
11. Atualizar documentação e CHANGELOG a cada etapa funcional.

A Agenda deve ser tratada como sistema em produção.

---

## 4. Visão do produto: “foto do dia do comercial”

### DECISÃO DE NEGÓCIO

A Agenda deve responder prioritariamente:

> “O que o comercial precisa fazer agora, o que vem depois e o que está escapando?”

A experiência ideal combina três papéis.

### 4.1 Execução diária

Mostrar de forma prioritária:

- atividades de hoje;
- atrasadas;
- próximas atividades;
- horário ou janela;
- título/assunto;
- cliente/prospect quando houver;
- tipo de atividade;
- responsável;
- local quando aplicável;
- status;
- ação rápida aplicável.

### 4.2 Planejamento

Permitir visualizar:

- dia;
- semana útil;
- mês;
- distribuição de carga;
- espaços livres;
- concentração de compromissos;
- atividades por tipo, responsável e local.

### 4.3 Gestão

Para perfis com visão de equipe, permitir enxergar:

- atividades planejadas;
- concluídas;
- vencidas;
- taxa de execução;
- distribuição por responsável;
- gargalos;
- dias sobrecarregados;
- atividades sem responsável ou sem horário quando isso for relevante.

A Agenda precisa funcionar tanto como **instrumento pessoal de execução** quanto como **visão operacional da equipe**, respeitando permissões.

---

## 5. Modelo conceitual correto de atividade

### DECISÃO DE NEGÓCIO

Uma atividade da Agenda pode nascer de quatro contextos principais:

```text
ATIVIDADE DA AGENDA
|
|-- vinculada a CLIENTE
|-- vinculada a PROSPECT
|-- vinculada a TRATATIVA
`-- AVULSA / SEM VINCULO CADASTRAL
```

A Agenda **não pode obrigar a criação de Cliente ou Prospect apenas para registrar um compromisso**.

Exemplos legítimos de atividade sem vínculo:

- reunião interna;
- treinamento;
- tarefa administrativa;
- compromisso comercial geral;
- visita exploratória ainda sem prospect cadastrado;
- retorno operacional;
- organização interna;
- lembrete;
- evento;
- contato ainda não cadastrado;
- outra atividade relevante para o dia de trabalho.

Essas atividades precisam aparecer normalmente em:

- visão Diária;
- visão Semanal;
- visão Mensal;
- foto do dia;
- fila de próximas ações;
- vencidas;
- concluídas;
- indicadores de execução, quando fizer sentido.

### Regra importante

Atividade sem vínculo **não deve criar automaticamente uma Tratativa vazia ou artificial**.

Ela deve existir como atividade legítima por si só.

---

## 6. Lacuna técnica atual: atividade avulsa ainda não funciona

### CONFIRMADO NO CÓDIGO

O frontend atual ainda obriga vínculo com Cliente ou Prospect.

No `frontend/crm/app.js`, `saveAgenda()` interrompe o salvamento quando `agendaEntityId` está vazio e exibe a mensagem:

```text
Selecione um cliente ou prospect.
```

O payload atual envia:

- `tipoEntidade`;
- `entidadeId`;
- `tratativaId`;
- tipo de atividade;
- responsável;
- data;
- bloco;
- horário;
- duração;
- mídia;
- observação.

### CONFIRMADO NO CÓDIGO

O backend atual também exige entidade.

`crm3_apiSaveAtividade_()`:

1. normaliza `tipoEntidade`;
2. exige `entidadeId`;
3. busca a entidade;
4. falha se a entidade não existir;
5. procura Tratativa aberta;
6. se não houver, cria uma Tratativa automaticamente;
7. grava a atividade em `AGENDA_EXECUCAO`;
8. atualiza snapshot da Tratativa;
9. atualiza snapshot da entidade;
10. registra evento de CRM.

Portanto, **atividade avulsa não é suportada hoje**.

### Impacto na conclusão/cancelamento

A conclusão de atividade também usa:

- `ENTIDADE_TIPO`;
- `ENTIDADE_ID`;
- `TRATATIVA_ID`;
- atualização de snapshot da entidade;
- interação/evento do CRM;
- transição de jornada quando houver Tratativa.

A próxima implementação precisa tornar esses passos condicionais quando a atividade for avulsa.

### PROPOSTA DE ARQUITETURA

Antes de codificar, decidir a representação técnica de atividade sem vínculo.

Alternativas possíveis:

1. `ENTIDADE_TIPO = AVULSA` e `ENTIDADE_ID` vazio;
2. `ENTIDADE_TIPO = INTERNA` para atividades internas e outro tipo para avulsas externas;
3. entidade técnica específica de Agenda, sem contaminar Cliente/Prospect;
4. campos opcionais de título/contato/local sem vínculo cadastral.

**Não escolher silenciosamente uma dessas alternativas.**

A próxima conversa deve avaliar compatibilidade com:

- `AGENDA_EXECUCAO`;
- APIs atuais;
- filtros;
- conclusão;
- cancelamento;
- exportação;
- eventos;
- indicadores;
- futuras integrações.

---

## 7. Estado funcional atual que deve ser preservado

### 7.1 Modos de visualização

### CONFIRMADO NO CÓDIGO

A Agenda possui:

- visão **Diária**;
- visão **Semanal**;
- visão **Mensal**.

O estado usa `agendaMode` e `agendaCursor`.

A troca entre Diário/Semanal/Mensal preserva o cursor/data selecionada.

### 7.2 Semana útil

### CONFIRMADO NO CÓDIGO

A visualização semanal exibe segunda a sexta.

A visão mensal também foi desenhada visualmente sem fins de semana.

### DECISÃO ATUAL

Preservar semana útil até existir nova decisão explícita de negócio.

### 7.3 Navegação de período

### CONFIRMADO NO CÓDIGO

Já existem:

- período anterior;
- período seguinte;
- botão `Hoje`;
- seletor de data;
- rótulo clicável do período;
- preservação do cursor ao trocar modo.

### 7.4 Renderização rápida

### CONFIRMADO NO CÓDIGO/HISTÓRICO

A Agenda passou a renderizar imediatamente com dados disponíveis ao trocar período/modo.

Quando a janela necessária ainda não está carregada, o carregamento ocorre em background e a Agenda renderiza novamente depois.

Também houve evolução para recarga otimista/escopada após mudanças.

### REGRA

Não voltar a bloquear a interface esperando o Apps Script quando já existirem dados locais suficientes para renderização imediata.

### 7.5 Filtros próprios

### CONFIRMADO NO CÓDIGO

A Agenda possui filtros próprios para:

- Local;
- Responsável;
- Tipo de atividade;
- Status.

O filtro de Local combina opções aplicáveis a CRM/Clientes e Prospects.

### REGRA

A Agenda não deve herdar silenciosamente filtros de Home, Prospects ou Clientes.

### 7.6 Permissões de responsável/equipe

### CONFIRMADO NO CÓDIGO

O frontend considera perfil de CRM, `canViewTeam` e `agendaScope`.

Quando o perfil não pode ver a equipe ou o escopo é `OWN`, a Agenda limita a visão ao próprio responsável.

### REGRA

Qualquer redesign precisa preservar exatamente o comportamento de permissão.

### 7.7 Chips/filtros padronizados

### CONFIRMADO NO HISTÓRICO

Os filtros passaram por padronização visual em chips.

Houve correções de multiple select, seleção de todos, limpar filtro e badge de quantidade.

### REGRA

Não regredir para filtros inconsistentes, excessivamente altos ou visualmente diferentes do restante do CRM.

### 7.8 Cores por tipo de atividade

### CONFIRMADO NO HISTÓRICO

Paleta definida:

- Visita Presencial: `#EA9A06`
- Ligação: `#1F63DE`
- WhatsApp: `#079C54`
- Email: `#B48414`
- Reunião Online: `#027973`
- Proposta: `#E0631D`
- Retorno: `#0677B4`
- Treinamento: `#804DF5`

### REGRA

Antes de alterar cores, verificar se continuam parametrizadas no código/configuração atual.

### 7.9 Cards de atividade

### CONFIRMADO NO CÓDIGO

Os cards atuais conseguem mostrar:

- horário inicial;
- horário final;
- indicação de `sem hora`;
- cliente/atividade;
- tipo;
- ícone;
- responsável;
- status;
- cor do tipo.

Existe versão compacta para o mês.

### 7.10 Pendências vencidas

### CONFIRMADO NO CÓDIGO

Existe seção separada de **Pendências vencidas** para atividades planejadas com data anterior a hoje.

### ATENÇÃO TÉCNICA

Rotas de boot passaram a limitar a busca de vencidas a uma janela histórica para melhorar performance. No histórico recente, a janela usada foi de 180 dias.

### A CONFIRMAR

Definir se atividades vencidas há mais de 180 dias devem:

- continuar fora da Agenda operacional;
- ir para histórico;
- aparecer somente sob demanda;
- ou exigir outra regra.

Não ampliar a janela indiscriminadamente e voltar a varrer toda a planilha.

### 7.11 Nova atividade

### CONFIRMADO NO CÓDIGO

O modal atual possui:

- Cliente ou Prospect;
- Tipo de atividade;
- Responsável;
- Data;
- Janela ou horário;
- Horário livre;
- Duração estimada;
- Mídia recomendada;
- Observação.

### LACUNA

O primeiro campo ainda é tratado como obrigatório e não existe fluxo avulso.

### 7.12 Execução da atividade

### CONFIRMADO NO CÓDIGO

Ao abrir atividade, existe workspace com:

- resumo;
- materiais recomendados;
- checklist Correios;
- anotação rápida;
- histórico de anotações;
- resultado;
- observação de execução;
- próximo follow-up;
- conclusão;
- cancelamento;
- exclusão.

### REGRA

Esse workspace é valioso e deve ser preservado.

Atividades avulsas, porém, não devem ser obrigadas a usar recursos que só fazem sentido para Cliente/Prospect, como checklist comercial, mídia sugerida ou transição de funil.

### 7.13 Exportação

### CONFIRMADO NO CÓDIGO/HISTÓRICO

A Agenda participa do padrão unificado de exportação:

- salvar como PNG;
- imprimir / PDF.

Já houve correções específicas na exportação PNG.

### REGRA

Toda mudança visual relevante deve ser testada também na exportação.

---

## 8. Relação com Clientes, Prospects e Tratativas

### CONFIRMADO NO CÓDIGO

A Agenda não é isolada.

Uma atividade vinculada pode envolver:

- Cliente;
- Prospect;
- Tratativa;
- Responsável;
- Tipo de atividade;
- Resultado;
- mídia/material;
- checklist;
- follow-up.

Os cards dos funis possuem entrada para agendamento.

### REGRA

Qualquer alteração precisa validar:

1. criação a partir da própria Agenda;
2. criação a partir de Prospect;
3. criação a partir de Cliente/Tratativa;
4. criação avulsa sem cadastro;
5. abertura do card da Agenda;
6. conclusão;
7. cancelamento;
8. exclusão;
9. próximo follow-up;
10. reflexo nos dashboards/funis quando houver vínculo;
11. ausência de efeito indevido nos dashboards/funis quando não houver vínculo.

---

## 9. Fontes de dados e estruturas relacionadas

A planilha `APP Total CF + Metro` foi documentada como fonte viva de regras operacionais do CRM e Agenda.

### 9.1 `AGENDA_BLOCOS`

Uso:

- blocos/janelas de Agenda;
- horário inicial/final;
- configuração usada no agendamento.

Risco de alteração: alto.

### 9.2 `AGENDA_EXECUCAO`

Uso:

- atividades programadas;
- atividades executadas;
- agenda comercial;
- visitas;
- tarefas;
- histórico operacional.

Risco de alteração: crítico.

### CONFIRMADO NO CÓDIGO

A Fase 3 acrescenta campos como:

- `REQUEST_ID`;
- `ENTIDADE_TIPO`;
- `ENTIDADE_ID`;
- `HORA_FIM_PROGRAMADA`;
- `LINK_MIDIA_RECOMENDADA`;
- `LINK_MIDIA_USADA`;
- `OBSERVACAO`;
- `CRIADO_POR`;
- `ATUALIZADO_POR`;
- `CONCLUIDA_EM`;
- `MOTIVO_CANCELAMENTO`;
- `PROXIMO_FOLLOWUP_EM`.

Também utiliza campos legados e atuais como:

- `AGENDA_ID`;
- `DATA`;
- `BLOCO_ID`;
- `HORA_INICIO`;
- `HORA_FIM`;
- `TIPO_ATIVIDADE`;
- `CLIENTE_ID`;
- `CLIENTE`;
- `LOCAL`;
- `STATUS_AGENDA`;
- `PRIORIDADE`;
- `OBS_PLANEJADA`;
- `RESPONSAVEL`;
- `ORIGEM_TIPO`;
- `ORIGEM_ID`;
- `PROSPECT_ID`;
- `CLIENTE_MASTER_ID`;
- `TRATATIVA_ID`;
- `TIPO_ATIVIDADE_ID`;
- `STATUS_ATIVIDADE`;
- `DATA_PROGRAMADA`;
- `HORA_PROGRAMADA`;
- `DURACAO_MIN`;
- `RESPONSAVEL_ID`.

### REGRA

Antes de criar novas colunas para atividade avulsa, auditar o cabeçalho real da planilha em produção e verificar se algum campo atual pode ser reutilizado sem ambiguidade.

### 9.3 Outras estruturas relacionadas

- `CLIENTES_MASTER`;
- `PROSPECTS`;
- `CRM_TRATATIVAS`;
- `CRM_TIPOS_ATIVIDADE`;
- `CRM_RESULTADOS_ATIVIDADE`;
- `CRM_RESPONSAVEIS`;
- `CRM_EVENTOS`;
- `CRM_VISITA_CHECKLIST`;
- `CRM_INTERACOES`;
- `CRM_LOCAIS`;
- `MIDIAS_CRM`;
- regras de jornada/transições.

---

## 10. Tipos de atividade e parametrização

### CONFIRMADO NO CÓDIGO

O frontend possui ícones padrão para tipos como:

- Visita;
- Ligação;
- WhatsApp;
- Email;
- Reunião Online;
- Proposta;
- Retorno;
- Treinamento.

O backend lê `CRM_TIPOS_ATIVIDADE` e valida:

- se o tipo está ativo;
- se aplica a Cliente;
- se aplica a Prospect;
- se usa bloco;
- duração padrão;
- necessidade de resultado.

### LACUNA PARA ATIVIDADE AVULSA

A regra atual conhece aplicabilidade a Cliente/Prospect, mas não há evidência de uma regra de `APLICA_AVULSA`.

### A CONFIRMAR

Na evolução, decidir se:

1. todos os tipos ativos podem ser usados em atividade avulsa; ou
2. a configuração deve ganhar uma coluna específica; ou
3. alguns tipos internos/administrativos devem ser criados separadamente.

Não hardcodar essa decisão no frontend.

---

## 11. Precedente importante: “Sua fila de ação hoje”

### CONFIRMADO NO HISTÓRICO

O dashboard de Prospects já recebeu uma seção chamada **Sua fila de ação hoje**.

Ela combina:

- vencidas;
- hoje;
- agendadas;
- prioridade/urgência;
- prospect;
- etapa;
- atividade;
- data;
- ação rápida como ligação ou WhatsApp.

### DECISÃO DE PRODUTO

Esse conceito é um precedente direto da experiência desejada para a Agenda.

A Agenda deve ser a versão completa dessa ideia para:

- Clientes;
- Prospects;
- atividades avulsas;
- equipe;
- dia inteiro;
- atrasadas;
- próximas;
- concluídas.

---

## 12. Direção de UX para a próxima versão

Esta seção é **PROPOSTA DE EVOLUÇÃO**, salvo quando indicado como decisão.

### 12.1 Visão Diária = tela principal de execução

A visão Diária deve ser a experiência mais operacional.

#### Resumo superior enxuto

Possíveis indicadores:

- Planejadas hoje;
- Concluídas;
- Restantes;
- Vencidas;
- taxa de execução.

Evitar excesso de KPI.

A prioridade é ação, não decoração.

#### Bloco “Agora / Próxima ação”

Destacar a atividade mais urgente ou próxima cronologicamente.

Informações úteis:

- horário;
- título/assunto;
- Cliente/Prospect, se houver;
- tipo;
- local;
- responsável;
- observação curta;
- ação rápida;
- botão para abrir a atividade.

#### Linha do dia

Organizar cronologicamente:

1. atrasadas ainda não resolvidas;
2. manhã;
3. tarde;
4. sem horário;
5. concluídas.

Atividades concluídas podem ficar visualmente suavizadas ou recolhíveis, sem desaparecer.

### 12.2 Pendências vencidas com prioridade real

As vencidas não devem ficar escondidas no fim de uma página longa.

Alternativas a testar:

- bloco destacado acima da agenda do dia;
- faixa lateral;
- accordion com contador;
- integração na fila prioritária.

### 12.3 Visão Semanal = planejamento

Objetivo:

- comparar carga entre dias;
- encontrar espaços vazios;
- enxergar excesso de compromissos;
- organizar visitas e contatos.

Cards devem ser compactos.

### 12.4 Visão Mensal = panorama

Objetivo:

- localizar dias carregados;
- entender frequência;
- navegar rapidamente para um dia;
- visualizar compromissos principais.

Não tentar colocar todo o detalhe dentro do mês.

### 12.5 Estado visual da atividade

Diferenciar claramente:

- Planejada;
- Concluída;
- Vencida;
- Cancelada;
- Reagendada;
- sem horário.

Cor do tipo e estado da atividade são informações diferentes e não devem competir visualmente.

### 12.6 Atividades avulsas

Devem parecer atividades normais da Agenda.

Não usar visual de erro, cadastro incompleto ou exceção.

O card pode mostrar:

- título/assunto;
- tipo;
- horário;
- responsável;
- local;
- observação;
- badge discreto como `Avulsa` ou `Interna`, se isso realmente ajudar.

### 12.7 Ações rápidas

Avaliar ações contextuais:

- ligar;
- abrir WhatsApp;
- abrir endereço/mapa;
- abrir material;
- marcar concluída;
- reagendar;
- editar;
- abrir Cliente/Prospect quando houver vínculo.

Ação rápida só deve aparecer quando existir dado necessário.

---

## 13. Criação de nova atividade — fluxo desejado

### DECISÃO DE NEGÓCIO

O vínculo cadastral precisa ser opcional.

### PROPOSTA DE UX

No modal de Nova atividade, o primeiro passo pode ser algo como:

```text
Vinculo
( ) Cliente/Prospect
( ) Sem vinculo
```

ou uma experiência ainda mais simples:

- campo de busca opcional de Cliente/Prospect;
- possibilidade clara de continuar sem selecionar ninguém.

### Para atividade vinculada

Preservar:

- entidade;
- Tratativa quando houver;
- sugestões de mídia;
- contexto comercial;
- atualização de follow-up/jornada.

### Para atividade avulsa

Campos mínimos sugeridos:

- título/assunto;
- tipo de atividade;
- responsável;
- data;
- horário/bloco quando aplicável;
- duração;
- local opcional;
- observação opcional.

### A CONFIRMAR

Definir:

- nome técnico do campo `TITULO`/`ASSUNTO`;
- se Local será lista, texto livre ou combinação;
- se contato avulso poderá ter nome/telefone sem virar Prospect;
- se atividade interna usará tipos próprios;
- quais campos serão obrigatórios por tipo.

---

## 14. Execução/conclusão de atividade avulsa

### PROPOSTA DE REGRA

Uma atividade avulsa precisa poder:

- ser aberta;
- editada;
- reagendada;
- concluída;
- cancelada;
- excluída conforme permissão;
- receber observação de execução;
- registrar resultado quando o tipo exigir.

Mas não deve obrigatoriamente:

- criar Tratativa;
- alterar Cliente/Prospect;
- mover funil;
- criar snapshot cadastral;
- executar transição de jornada;
- exigir checklist comercial;
- exigir mídia de CRM.

### REGRA DE SEGURANÇA

No backend, operações ligadas a entidade devem ser condicionais:

```text
se atividade possui entidade:
    atualizar CRM/jornada/snapshots
senão:
    concluir somente a atividade e auditoria própria da Agenda
```

Não criar entidade fictícia para contornar validação.

---

## 15. Performance — decisões que não podem regredir

### CONFIRMADO NO HISTÓRICO/CÓDIGO

Foram implementadas otimizações importantes:

- boot progressivo;
- leitura da Agenda em janela;
- reaproveitamento de dados carregados;
- cache;
- redução de varreduras repetidas de `AGENDA_EXECUCAO`;
- projeções mais leves de entidades;
- renderização imediata;
- recarga escopada/otimista.

### REGRA

Não melhorar o visual às custas de:

- ler a planilha inteira a cada clique;
- disparar várias requisições redundantes;
- recarregar Clientes/Prospects inteiros ao mudar um dia;
- bloquear a tela durante requests;
- invalidar cache de configuração em toda escrita;
- recalcular tudo no frontend repetidamente.

### META

A Agenda deve parecer instantânea.

Interações como:

- trocar dia;
- mudar Diário/Semanal/Mensal;
- filtrar;
- abrir atividade;
- concluir;
- reagendar;

precisam responder imediatamente sempre que tecnicamente possível.

---

## 16. Mobile

### DECISÃO DE QUALIDADE

Mobile é parte essencial da Agenda porque execução comercial acontece fora do desktop.

### PROPOSTA DE UX

No celular:

- priorizar visão diária;
- evitar grade semanal espremida;
- permitir swipe/navegação simples entre dias;
- manter Nova atividade acessível via FAB;
- cards devem ter área de toque confortável;
- filtros podem virar drawer/bottom sheet;
- ações rápidas devem caber sem poluir;
- modal de atividade deve funcionar como tela vertical;
- conclusão deve exigir poucos passos.

### CHECKLIST MOBILE

Testar:

- 360px;
- 390px;
- 430px;
- teclado aberto;
- selects;
- date/time picker;
- scroll dentro de modal;
- FAB sobre conteúdo;
- cards longos;
- nomes extensos;
- atividades sem horário;
- avulsas sem entidade.

---

## 17. Usabilidade e acessibilidade

### PROPOSTA

A evolução deve incluir:

- hierarquia visual clara;
- contraste adequado;
- foco de teclado visível;
- labels reais nos campos;
- botões com área de clique suficiente;
- uso de ícone + texto quando a ação não for óbvia;
- estados loading/erro/vazio claros;
- não depender apenas de cor;
- preservação de `aria-label` nos controles;
- suporte a nomes longos sem quebrar layout.

---

## 18. Estados vazios e erros

A Agenda precisa diferenciar:

- dia realmente sem atividade;
- filtro sem resultado;
- dados ainda carregando;
- falha de API;
- atividade não encontrada;
- entidade vinculada que deixou de existir;
- atividade avulsa legítima.

Não mostrar atividade avulsa como “entidade ausente”.

---

## 19. Casos de borda que precisam entrar nos testes

1. atividade sem horário;
2. atividade com bloco;
3. atividade com horário livre;
4. atividade cruzando janela de horário;
5. atividade em dia passado;
6. atividade vencida;
7. atividade cancelada;
8. atividade reagendada;
9. atividade concluída;
10. Cliente sem Tratativa aberta;
11. Prospect sem Tratativa aberta;
12. atividade avulsa;
13. atividade interna;
14. responsável sem permissão de equipe;
15. gestor vendo equipe;
16. filtro por múltiplos responsáveis;
17. filtro por múltiplos tipos;
18. filtro de Local;
19. entidade excluída/inativa;
20. nome muito longo;
21. muitas atividades no mesmo dia;
22. mês com muitos compromissos;
23. exportação PNG;
24. impressão/PDF;
25. salvar atividade com rede lenta;
26. clique duplo/reenvio de request;
27. conclusão duplicada;
28. atividade antiga fora da janela de cache.

---

## 20. Idempotência e concorrência

### CONFIRMADO NO CÓDIGO

A criação usa `REQUEST_ID` e o backend verifica requisição já existente para evitar duplicidade.

O endpoint POST roda sob lock de documento.

### REGRA

Preservar:

- idempotência de criação;
- proteção contra duplo clique;
- lock/concorrência;
- mensagens de sucesso/erro;
- atualização otimista sem duplicar atividade.

---

## 21. O que não fazer

1. Não reconstruir a Agenda inteira antes de auditar o fluxo atual.
2. Não exigir Cliente/Prospect para toda atividade.
3. Não criar Prospect fictício para compromissos avulsos.
4. Não criar Tratativa automática para atividade sem vínculo.
5. Não remover recursos do workspace de atividade vinculada.
6. Não carregar toda `AGENDA_EXECUCAO` a cada interação.
7. Não quebrar permissões por responsável.
8. Não misturar filtros da Agenda com outros módulos.
9. Não mudar cabeçalhos de planilha sem plano de migração.
10. Não hardcodar tipos, locais ou responsáveis que já são parametrizados.
11. Não eliminar exportação.
12. Não redesenhar apenas desktop.
13. Não usar apenas cor para comunicar status.
14. Não apagar histórico para “limpar” a Agenda.
15. Não alterar transições de CRM como efeito colateral de uma mudança visual.

---

## 22. Arquivos prioritários para auditoria

### Frontend

- `frontend/crm/index.html`
- `frontend/crm/app.js`
- `frontend/crm/styles.css`
- `frontend/shared/ui/agf-ui.css`, quando aplicável

### Apps Script

- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`
- `apps-script/base-metro/10_OPERACAO_EXECUCAO_API.js`
- arquivo de performance/cache do CRM V5
- arquivos de configuração de Locais/Responsáveis/Tipos, conforme chamadas reais

### Documentação

- `docs/FRONTEND.md`
- `docs/APPS_SCRIPT.md`
- `docs/PLANILHAS_E_DADOS.md`
- `docs/PERFORMANCE.md`
- `docs/PLANILHA_APP_TOTAL_CF_METRO.md`
- `CHANGELOG.md`

---

## 23. Histórico técnico já identificado

Commits relevantes da evolução da Agenda incluem temas como:

- botões de WhatsApp e Agenda nos cards de funil;
- fila de ação hoje;
- exportação consolidada;
- filtros da Agenda em chips;
- barra unificada;
- Nova atividade;
- semana útil;
- filtro de Local;
- Agenda instantânea;
- preservação do cursor;
- padronização visual Home/Agenda;
- boot CRM otimizado;
- leitura da Agenda em janela/cache;
- recarga escopada/otimista.

A próxima conversa deve usar o histórico para entender por que certas decisões existem antes de removê-las.

---

## 24. Plano seguro de evolução

### Fase 0 — auditoria real

Sem alterar código:

1. abrir a Agenda atual;
2. capturar desktop e mobile;
3. testar Dia/Semana/Mês;
4. testar filtros;
5. criar atividade vinculada;
6. concluir/cancelar/reagendar;
7. medir requests e tempo;
8. confirmar cabeçalhos reais de `AGENDA_EXECUCAO`;
9. confirmar dados reais de `AGENDA_BLOCOS`;
10. documentar lacuna de atividade avulsa.

### Fase 1 — suporte técnico a atividade avulsa

Antes do redesign grande:

1. definir modelo de dados;
2. tornar vínculo opcional no backend;
3. impedir criação artificial de Tratativa;
4. tornar conclusão/cancelamento tolerantes a ausência de entidade;
5. adicionar título/assunto se necessário;
6. preservar idempotência;
7. criar testes de regressão.

### Fase 2 — Nova atividade UX

1. vínculo opcional;
2. campos condicionais;
3. menos atrito;
4. defaults inteligentes;
5. bom mobile.

### Fase 3 — Foto do dia

1. resumo diário;
2. vencidas;
3. Agora/Próxima;
4. linha cronológica;
5. concluídas;
6. ações rápidas.

### Fase 4 — Semana e mês

1. compactação;
2. melhor leitura de carga;
3. navegação rápida;
4. mobile adaptado.

### Fase 5 — gestão

1. equipe;
2. carga por responsável;
3. taxa de execução;
4. alertas;
5. indicadores mínimos necessários.

### Fase 6 — refinamento

1. acessibilidade;
2. exportação;
3. performance fina;
4. estados vazios;
5. QA completo.

---

## 25. Critérios de aceite mínimos

A evolução não está pronta enquanto não passar por:

### Funcional

- criar atividade de Cliente;
- criar atividade de Prospect;
- criar atividade de Tratativa;
- criar atividade sem vínculo;
- editar/reagendar;
- concluir;
- cancelar;
- excluir conforme regra;
- follow-up de atividade vinculada;
- atividade avulsa sem criação de Tratativa;
- filtros;
- Dia/Semana/Mês;
- vencidas;
- permissões.

### Dados

- nenhuma linha perdida;
- nenhum cabeçalho quebrado;
- nenhuma entidade fictícia criada;
- nenhuma Tratativa artificial por atividade avulsa;
- nenhuma duplicidade por retry;
- status coerentes;
- histórico preservado.

### Performance

- troca de modo responsiva;
- troca de período responsiva;
- filtros locais quando possível;
- criação sem reload total;
- cache preservado;
- sem varredura desnecessária da planilha.

### Visual

- desktop;
- mobile;
- cards longos;
- muitos compromissos;
- zero compromissos;
- atividade vinculada;
- atividade avulsa;
- vencida;
- concluída;
- exportação PNG;
- impressão/PDF.

---

## 26. Pontos que ainda precisam de decisão explícita

### A CONFIRMAR

1. A Agenda deve abrir por padrão em Diário, Semanal ou lembrar o último modo?
2. Fins de semana continuarão ocultos?
3. Qual será o nome técnico/visual de atividade sem vínculo: `Avulsa`, `Interna`, `Sem vínculo` ou outro?
4. Atividade avulsa terá contato livre com nome/telefone?
5. Quais tipos de atividade aceitam modo avulso?
6. Local de atividade avulsa será parametrizado, livre ou híbrido?
7. Atividades vencidas há mais de 180 dias devem aparecer onde?
8. Atividade avulsa deve gerar registro em `CRM_EVENTOS` ou um evento próprio da Agenda?
9. Indicadores de CRM devem incluir atividades internas/administrativas ou apenas comerciais?
10. Existe necessidade futura de sincronização com Google Calendar? Não assumir sem decisão.

---

## 27. Atenção sensível

A Agenda pode envolver:

- nomes de Clientes/Prospects;
- telefones;
- responsáveis;
- locais;
- observações comerciais;
- histórico de interação;
- informações operacionais internas.

Qualquer nova integração externa, sincronização de calendário ou exposição no frontend deve revisar:

- autenticação;
- permissões;
- LGPD;
- logs;
- dados enviados a terceiros.

Não registrar exemplos reais de clientes em documentação pública.

---

## 28. Documentação obrigatória após alterações

Se houver mudança funcional na Agenda:

- atualizar `CHANGELOG.md`;
- atualizar `docs/FRONTEND.md`;
- atualizar `docs/APPS_SCRIPT.md` se backend mudar;
- atualizar `docs/PLANILHAS_E_DADOS.md` se cabeçalho/coluna/regra de dado mudar;
- atualizar `docs/PERFORMANCE.md` se cache/leitura/boot mudar;
- atualizar `docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md` se houver dados sensíveis, permissões ou integração externa.

Mensagem de commit deve ser clara e escopada.

Exemplos:

```text
feat(crm): permitir atividades avulsas na agenda
```

```text
ui(crm): evoluir agenda diaria para foto do dia
```

---

## 29. Prompt recomendado para abrir a nova conversa

Copiar como primeira mensagem:

> Leia integralmente `docs/AGENDA_COMERCIAL_CONTEXTO.md` no repositório `chelzinha/minhaagenciaonline` e trabalhe exclusivamente na Agenda Comercial. Comece pela Fase 0: audite o estado atual no GitHub e na interface antes de alterar código. Preserve tudo que já funciona. Trate como requisito obrigatório que a Agenda aceite atividades sem vínculo com Cliente, Prospect ou Tratativa. Diferencie claramente o que já existe, o que é decisão de negócio, o que é proposta e o que ainda precisa ser confirmado. Não faça um redesign grande antes de me mostrar o diagnóstico e o plano de mudanças em etapas.

---

## 30. Resumo executivo para a próxima conversa

```text
AGENDA COMERCIAL AGF

Objetivo:
ser a foto do dia do comercial.

Precisa mostrar:
hoje + vencidas + próxima ação + concluídas + carga + equipe.

Precisa aceitar:
CLIENTE + PROSPECT + TRATATIVA + ATIVIDADE AVULSA.

Hoje:
atividade avulsa NÃO funciona.
O frontend exige entidade.
O backend exige entidade e cria/usa Tratativa.

Prioridade técnica:
corrigir o modelo para vínculo opcional sem quebrar CRM.

Depois:
evoluir UX da visão diária, semana, mês e mobile.

Não pode regredir:
performance + filtros + permissões + idempotência + histórico + exportação.
```

---

## 31. Status deste documento

Este arquivo é o handoff consolidado da Agenda após revisão do material disponível no projeto.

Ele **não afirma ter recuperado mensagens antigas que não estejam mais acessíveis no contexto**. Quando uma decisão não pôde ser confirmada por conversa disponível, código, documentação ou histórico versionado, foi marcada como `A CONFIRMAR` ou `PROPOSTA DE EVOLUÇÃO`.

A próxima conversa deve considerar este documento como ponto de partida, mas validar o estado vivo do sistema antes de implementar.