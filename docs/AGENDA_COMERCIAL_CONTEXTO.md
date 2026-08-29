# Agenda Comercial AGF — contexto consolidado para evolução

> Documento de handoff para iniciar uma conversa separada dedicada exclusivamente à Agenda do CRM Comercial da Plataforma Digital AGF.
>
> Objetivo: preservar o que já funciona, recuperar as decisões anteriores e orientar uma evolução completa de layout, usabilidade, fluxo operacional, desempenho e experiência mobile.

## 1. Conclusão prática

A Agenda **não deve ser tratada apenas como um calendário**.

A direção de produto é transformá-la na **foto do dia do comercial**: ao abrir a Agenda, a pessoa deve entender em poucos segundos:

1. o que precisa fazer hoje;
2. o que está atrasado;
3. qual é a próxima atividade;
4. o que já foi concluído;
5. quanto ainda falta executar;
6. com quais clientes/prospects precisa falar;
7. onde estão os compromissos;
8. quais atividades exigem atenção imediata;
9. como está a carga do dia e da semana;
10. quais ações podem ser executadas diretamente dali.

A Agenda atual já possui uma base funcional importante. A próxima etapa **não é reconstruir do zero**: é reorganizar a experiência em cima dos fluxos existentes, eliminar atrito e tornar a tela muito mais operacional.

---

## 2. Regra para a próxima conversa

Antes de alterar qualquer arquivo:

1. Ler este documento inteiro.
2. Inspecionar o código atual no GitHub.
3. Abrir a Agenda atual em navegador/preview e registrar visualmente o estado real.
4. Mapear o fluxo completo de leitura, criação, edição, conclusão, cancelamento e exclusão de atividade.
5. Mapear as dependências de Apps Script e planilhas.
6. Preservar nomes de actions, IDs de elementos, abas, colunas e estruturas já consumidas.
7. Evitar regressão em Prospects, Clientes, Home e CRM.
8. Fazer mudanças pequenas e homologáveis.
9. Atualizar documentação e CHANGELOG a cada etapa funcional.

A Agenda deve ser tratada como sistema em produção.

---

## 3. Visão do produto: “foto do dia do comercial”

A ideia central é que a Agenda seja a tela que responde:

> “O que o comercial precisa fazer agora, o que vem depois e o que está escapando?”

A experiência ideal deve combinar três papéis:

### 3.1 Execução diária

Mostrar de forma prioritária:

- atividades de hoje;
- atrasadas;
- próximas atividades;
- horário/janela;
- cliente ou prospect;
- tipo de atividade;
- responsável;
- local;
- status;
- ação rápida aplicável.

### 3.2 Planejamento

Permitir visualizar:

- dia;
- semana útil;
- mês;
- distribuição de carga;
- espaços livres;
- concentração de compromissos;
- atividades por tipo, responsável e local.

### 3.3 Gestão

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

## 4. Estado funcional já existente e que deve ser preservado

A implementação atual já possui uma série de funcionalidades importantes.

### 4.1 Modos de visualização

A Agenda possui:

- visão **Diária**;
- visão **Semanal**;
- visão **Mensal**.

O estado usa `agendaMode` e `agendaCursor`.

A troca entre Diário/Semanal/Mensal foi evoluída para preservar o cursor/data selecionada.

### 4.2 Semana útil

A visualização semanal foi organizada como semana útil, exibindo segunda a sexta.

A visão mensal também trabalha visualmente com dias úteis.

Essa decisão deve ser preservada, salvo nova decisão explícita de negócio.

### 4.3 Navegação de período

Já existem:

- período anterior;
- período seguinte;
- botão `Hoje`;
- seletor de data;
- rótulo clicável do período;
- preservação do cursor ao trocar modo.

### 4.4 Renderização rápida

Uma decisão anterior importante foi fazer a Agenda **renderizar imediatamente com os dados disponíveis** ao trocar período/modo, em vez de bloquear a tela aguardando toda a busca.

Quando a janela necessária ainda não está carregada, a busca pode acontecer em background e a Agenda renderiza novamente ao concluir.

Essa característica deve ser preservada e melhorada, não revertida.

### 4.5 Filtros próprios

A Agenda possui filtros próprios e não deve herdar silenciosamente filtros de outras áreas.

Filtros existentes incluem:

- Local;
- Responsável;
- Tipo de atividade;
- Status.

O filtro de Local da Agenda foi pensado para combinar locais aplicáveis a CRM/Clientes e Prospects.

### 4.6 Chips/filtros padronizados

Os filtros passaram por padronização visual em chips para manter consistência com o CRM.

Existe histórico de refinamento dessa interface e ela não deve voltar para uma composição visual inconsistente ou excessivamente carregada.

### 4.7 Cores por tipo de atividade

Foi definida uma paleta visual para diferenciar atividades:

- Visita Presencial: `#EA9A06`
- Ligação: `#1F63DE`
- WhatsApp: `#079C54`
- Email: `#B48414`
- Reunião Online: `#027973`
- Proposta: `#E0631D`
- Retorno: `#0677B4`
- Treinamento: `#804DF5`

Antes de alterar essas cores, verificar se continuam sendo usadas pelo código/configuração atual.

### 4.8 Cards de atividade

Os cards atuais conseguem apresentar:

- horário inicial;
- horário final, quando existente;
- indicação de “sem hora”;
- cliente/atividade;
- tipo de atividade;
- ícone;
- responsável;
- status;
- cor do tipo de atividade.

Existe também uma versão compacta dos cards para o mês.

### 4.9 Pendências vencidas

A Agenda já possui uma seção separada de **Pendências vencidas**, definida como atividades planejadas com data anterior a hoje.

Essa informação é fundamental para a visão “foto do dia” e deve ganhar ainda mais importância na próxima evolução.

### 4.10 Nova atividade

A Agenda possui fluxo de criação com modal próprio.

Campos existentes incluem:

- cliente ou prospect;
- tipo de atividade;
- responsável;
- data;
- janela/bloco ou horário;
- horário livre;
- duração estimada;
- mídia recomendada;
- observação.

O formulário já relaciona Agenda com cliente/prospect e com a tratativa quando aplicável.

### 4.11 Execução da atividade

Ao abrir uma atividade, já existe um workspace com:

- resumo;
- materiais recomendados;
- checklist Correios;
- anotação rápida;
- histórico de anotações;
- conclusão da atividade;
- resultado;
- observação de execução;
- próximo follow-up;
- cancelamento;
- exclusão.

Esse workspace é valioso e deve ser preservado. A melhoria deve reduzir atrito e melhorar hierarquia visual, não empobrecer o fluxo.

### 4.12 Exportação

A Agenda participa do padrão unificado de exportação do CRM:

- salvar como PNG;
- imprimir / gerar PDF.

Houve correções anteriores na exportação PNG. Alterações visuais precisam continuar sendo testadas também na captura/exportação.

---

## 5. Precedente importante: “Sua fila de ação hoje”

O dashboard de Prospects já recebeu uma seção chamada **“Sua fila de ação hoje”**.

Ela foi desenhada para combinar:

- atividades vencidas;
- atividades de hoje;
- atividades agendadas;
- prioridade/urgência;
- nome do prospect;
- etapa;
- atividade;
- data;
- ação rápida como ligação ou WhatsApp.

Esse conceito é um precedente muito próximo da visão desejada para a Agenda.

A nova Agenda pode aproveitar o princípio, porém de forma mais ampla:

- clientes + prospects;
- todas as atividades relevantes;
- ordenação temporal/prioridade;
- visão de execução do dia inteiro;
- gestão de pendências e carga.

A tela de Agenda deve ser o local natural para a versão completa dessa ideia.

---

## 6. Fontes de dados e estruturas que já fazem parte da Agenda

A planilha `APP Total CF + Metro` foi documentada como fonte viva de regras operacionais do CRM e Agenda.

### 6.1 `AGENDA_BLOCOS`

Uso principal:

- blocos/janelas de agenda;
- janelas de atendimento;
- configuração usada no agendamento.

Risco de alteração: alto.

### 6.2 `AGENDA_EXECUCAO`

Uso principal:

- agenda comercial;
- atividades programadas;
- atividades executadas;
- visitas;
- tarefas;
- histórico operacional.

Risco de alteração: crítico.

### 6.3 Outras estruturas relacionadas

A Agenda também se relaciona com:

- `CLIENTES_MASTER`;
- `PROSPECTS`;
- `CRM_TRATATIVAS`;
- `CRM_TIPOS_ATIVIDADE`;
- `CRM_RESULTADOS_ATIVIDADE`;
- `CRM_RESPONSAVEIS`;
- `CRM_EVENTOS`;
- `CRM_VISITA_CHECKLIST`;
- `CRM_LOCAIS`;
- `MIDIAS_CRM`;
- regras de jornada e transições do CRM.

Não criar novas abas para substituir essas estruturas sem mapear primeiro o fluxo atual.

---

## 7. Relação entre Agenda, Clientes e Prospects

A Agenda não é um módulo isolado.

Uma atividade pode estar relacionada a:

- cliente;
- prospect;
- tratativa;
- responsável;
- tipo de atividade;
- resultado;
- mídia/material;
- checklist;
- follow-up.

A própria tela de Prospects e os cards de funil já possuem pontos de entrada para agendamento.

Portanto, qualquer alteração na Agenda precisa validar:

1. criação a partir da própria Agenda;
2. criação a partir de Prospect;
3. criação a partir de Cliente/tratativa;
4. abertura do card da Agenda;
5. conclusão e próximo follow-up;
6. atualização refletida nos dashboards e funis.

---

## 8. Performance: decisões anteriores que não podem regredir

A Agenda já causou preocupação de performance porque depende de dados em planilhas.

Foram implementadas otimizações no CRM, incluindo:

- boot unificado/progressivo;
- leitura da Agenda em janela;
- reaproveitamento de dados já carregados;
- cache;
- redução de varreduras repetidas de `AGENDA_EXECUCAO`;
- projeções mais leves para entidades;
- renderização imediata com atualização posterior.

Uma otimização posterior passou a evitar múltiplas varreduras completas da Agenda durante o boot, usando uma janela cacheada e filtros em memória.

### Regra para a evolução

Não melhorar o visual às custas de voltar a:

- buscar a planilha inteira a cada clique;
- disparar várias requisições redundantes;
- recarregar Clientes/Prospects inteiros para mudar um dia;
- bloquear a interface enquanto Apps Script responde;
- invalidar cache de configuração sem necessidade.

### Meta

A Agenda deve parecer instantânea.

Interações como:

- trocar dia;
- mudar Diário/Semanal/Mensal;
- filtrar;
- abrir atividade;

precisam responder imediatamente com estado local sempre que possível.

---

## 9. Direção de UX para a próxima versão

Esta seção consolida a evolução desejada. É uma diretriz de produto para a próxima conversa, não uma descrição do que já existe hoje.

## 9.1 A visão Diária deve se tornar a “foto do dia”

A visão Diária deve ser a experiência mais operacional da Agenda.

### Faixa superior sugerida

Exibir um resumo enxuto do dia:

- Planejadas hoje;
- Concluídas;
- Restantes;
- Vencidas;
- taxa de execução.

Evitar excesso de KPIs. A prioridade é ação, não dashboard ornamental.

### Bloco “Agora / Próxima ação”

Destacar a atividade mais urgente ou a próxima cronologicamente.

Possíveis informações:

- horário;
- cliente/prospect;
- tipo;
- local;
- responsável;
- observação curta;
- botão para abrir atividade;
- ação rápida quando aplicável.

### Linha do dia

O centro da tela deve ser uma agenda operacional em ordem cronológica.

Sugestão de separação:

1. atrasadas que ainda precisam ser resolvidas;
2. manhã;
3. tarde;
4. sem horário;
5. concluídas em seção recolhível ou visualmente suavizada.

A leitura precisa ser muito mais rápida do que um calendário genérico.

### Pendências vencidas

As vencidas não devem ficar escondidas no fim de uma página longa.

Na visão diária, considerar:

- bloco destacado acima da linha do dia; ou
- faixa lateral/accordion com contador; ou
- integração na fila prioritária.

A decisão visual deve ser tomada após testar com dados reais.

---

## 9.2 Visão Semanal = planejamento

A semana deve continuar sendo útil de segunda a sexta.

Objetivo principal:

- perceber distribuição de carga;
- encontrar dias vazios/sobrecarregados;
- organizar visitas e contatos;
- entender a semana rapidamente.

Cada coluna deve mostrar de forma compacta:

- data;
- quantidade;
- atividades em ordem;
- tipo por cor/ícone;
- horário;
- cliente/prospect;
- indicação visual de concluída/vencida.

Evitar cards altos demais que façam a semana perder comparabilidade.

---

## 9.3 Visão Mensal = panorama

O mês não precisa tentar exibir todos os detalhes.

Seu objetivo deve ser:

- localizar dias carregados;
- identificar frequência de atividades;
- navegar rapidamente para um dia;
- enxergar compromissos relevantes.

Manter cards compactos e `+N atividades` quando houver excesso.

Ao clicar em um dia, considerar abrir diretamente a visão Diária daquele dia.

---

## 10. Hierarquia visual desejada

A Agenda precisa ficar limpa, moderna e profissional.

### Prioridades

1. Dia/período atual.
2. Ações urgentes.
3. Próximas atividades.
4. Controle de modo/período.
5. Filtros.
6. Ação “Nova atividade”.
7. Exportação.

### Evitar

- muitas barras competindo entre si;
- excesso de bordas;
- chips sem hierarquia;
- botões duplicados sem necessidade;
- grandes áreas vazias;
- cards com excesso de texto;
- cores fortes usadas em áreas grandes;
- layout com aparência de template genérico;
- informação importante abaixo de muito conteúdo secundário.

---

## 11. Nova atividade: objetivo de usabilidade

O fluxo atual já tem campos suficientes, mas deve ser revisado para reduzir atrito.

### Perguntas para a auditoria

1. Quais campos são realmente obrigatórios?
2. Qual é a ordem natural de preenchimento?
3. A janela/bloco e horário livre estão claros?
4. Quando um bloco deve preencher o horário automaticamente?
5. O responsável pode vir pré-selecionado?
6. Se a atividade vem de um card de Cliente/Prospect, a entidade já deve chegar preenchida?
7. A data deve assumir o dia atualmente aberto na Agenda?
8. Tipo de atividade pode definir duração padrão?
9. Mídia recomendada precisa ficar visível sempre ou pode ser contextual?
10. O modal funciona bem no celular?

### Diretriz

O usuário não deve preencher novamente algo que o contexto já sabe.

Exemplos:

- abrir “Nova atividade” dentro do dia 15 → data padrão = dia 15;
- abrir pelo card de Prospect → prospect já selecionado;
- usuário com agenda própria → responsável padrão = usuário atual;
- tipo com duração padrão → duração pré-preenchida.

---

## 12. Abrir/executar uma atividade

O workspace atual possui conteúdo valioso, mas deve ser reorganizado pela ordem real de execução.

### Ordem sugerida

1. Resumo essencial da atividade.
2. Ação principal/contato.
3. Materiais recomendados, quando existirem.
4. Checklist aplicável.
5. Anotações rápidas.
6. Conclusão + resultado.
7. Próximo follow-up.
8. Histórico secundário.

### Princípio

A tela deve responder:

> “Estou nessa atividade agora. O que preciso ver, fazer e registrar?”

Não deve parecer apenas um formulário administrativo.

---

## 13. Ações rápidas

Avaliar ações contextuais diretamente nos cards, sem poluir o layout.

Exemplos possíveis:

- WhatsApp;
- ligação;
- abrir atividade;
- concluir;
- reagendar.

Regras:

- só mostrar quando aplicável;
- não transformar cada card em uma barra de ícones;
- priorizar ações de uso frequente;
- confirmar ações destrutivas ou irreversíveis.

O dashboard de Prospects já usou ligação/chat como ação rápida na fila do dia; essa experiência pode servir como referência.

---

## 14. Status e estados visuais

Estados precisam ser identificáveis sem depender apenas de texto ou cor.

Estados existentes/relevantes incluem:

- planejado;
- concluído;
- cancelado;
- reagendado;
- vencido como condição derivada.

Sugestão:

- planejado: neutro;
- concluído: redução de contraste + ícone de confirmação;
- vencido: destaque de atenção;
- cancelado: aparência desativada;
- reagendado: indicação de movimentação/histórico.

Nunca usar somente cor para transmitir estado.

---

## 15. Local e deslocamento

Como existem atividades presenciais e múltiplos locais, a Agenda pode evoluir para ajudar na organização de deslocamentos.

Sem inventar nova regra de negócio, avaliar:

- exibir Local de forma visível em visitas;
- permitir filtro por Local;
- perceber atividades presenciais agrupadas por Local no mesmo dia;
- evitar obrigar o usuário a abrir o card para descobrir onde precisa estar.

Uma futura otimização por rota/local só deve ser feita depois de confirmar a qualidade dos dados de Local.

---

## 16. Responsável e visão de equipe

A Agenda precisa respeitar o escopo do usuário.

Já existe lógica relacionada a:

- responsável próprio;
- permissão para ver equipe;
- `agendaScope`;
- filtro de responsável.

### Diretriz

Para usuário operacional:

- priorizar “Minha Agenda”.

Para gestor/admin:

- permitir “Minha Agenda” e “Equipe”;
- visualizar carga por responsável;
- identificar vencidas/pendências da equipe.

Não expor dados de equipe para quem não tem permissão.

---

## 17. Mobile

A Agenda precisa ser tratada como tela crítica de uso móvel.

No celular, a pessoa pode estar:

- em visita;
- em deslocamento;
- falando com cliente;
- registrando conclusão rapidamente.

### Prioridades mobile

1. Visão diária primeiro.
2. Cards em uma coluna.
3. Ações com área de toque confortável.
4. Filtros recolhíveis.
5. “Nova atividade” em FAB quando fizer sentido.
6. Modal adaptado a tela pequena.
7. Concluir/reagendar sem scroll excessivo.
8. Evitar tabelas horizontais.

---

## 18. Acessibilidade e clareza

Revisar:

- contraste;
- foco por teclado;
- labels de botões;
- `aria-label`;
- tamanho de toque;
- indicação de estado sem depender só de cor;
- navegação por teclado nos controles de período;
- feedback de loading e erro;
- estados vazios claros.

---

## 19. Não fazer agora sem necessidade

1. Não recriar a Agenda em outro framework só por estética.
2. Não trocar Apps Script por outra arquitetura nesta frente sem motivo mensurável.
3. Não criar novas planilhas paralelas para Agenda.
4. Não renomear actions existentes sem mapear consumidores.
5. Não remover `AGENDA_BLOCOS` ou `AGENDA_EXECUCAO`.
6. Não reescrever o CRM inteiro junto com a Agenda.
7. Não misturar esta frente com Cadastro Mestre postal, Central AGF ou Atende/Consolidador.
8. Não expandir para automações comerciais complexas antes de a experiência básica da Agenda estar excelente.

A conversa nova deve permanecer focada em Agenda.

---

## 20. Arquivos técnicos a inspecionar primeiro

### Frontend

- `frontend/crm/index.html`
- `frontend/crm/app.js`
- `frontend/crm/styles.css`
- `frontend/shared/ui/agf-ui.css` ou equivalente compartilhado usado pelo CRM

### Apps Script

- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`
- `apps-script/base-metro/10_OPERACAO_EXECUCAO_API.js`
- módulos de performance/cache do CRM existentes na versão atual
- qualquer arquivo que contenha funções de Agenda, criação, conclusão, cancelamento, checklist e notas

### Documentação

- `docs/FRONTEND.md`
- `docs/APPS_SCRIPT.md`
- `docs/PLANILHAS_E_DADOS.md`
- `docs/PLANILHA_APP_TOTAL_CF_METRO.md`
- `docs/PERFORMANCE.md`
- `CHANGELOG.md`

---

## 21. Auditoria obrigatória antes do redesign

Na nova conversa, começar produzindo um relatório curto com:

### 21.1 Tela atual

- screenshot desktop;
- screenshot mobile;
- Diário;
- Semanal;
- Mensal;
- Agenda vazia;
- dia com muitas atividades;
- pendências vencidas;
- modal Nova atividade;
- modal Atividade.

### 21.2 Fluxos

Testar:

- criar;
- editar/reagendar, se suportado;
- concluir;
- cancelar;
- excluir;
- próximo follow-up;
- checklist;
- anotação;
- abrir mídia;
- filtrar;
- trocar período;
- exportar PNG;
- imprimir/PDF.

### 21.3 Performance

Medir:

- tempo até Agenda utilizável;
- troca de dia;
- troca de semana;
- troca de modo;
- abertura do modal;
- salvamento;
- conclusão;
- quantidade de requests gerados;
- tamanho das respostas;
- leituras de planilha no backend quando possível.

Não otimizar “no escuro”. Medir primeiro.

---

## 22. Plano recomendado de evolução

### Fase 0 — Auditoria e baseline

Objetivo:

- entender exatamente o estado atual;
- registrar screenshots;
- mapear código e API;
- confirmar problemas reais.

Entrega:

- documento curto de baseline;
- lista priorizada de problemas;
- nenhuma mudança funcional grande.

### Fase 1 — Hierarquia visual e layout

Objetivo:

- limpar header/control bar;
- melhorar espaçamentos;
- melhorar cards;
- reforçar hoje/período;
- organizar vencidas;
- revisar desktop e mobile.

Sem alterar modelo de dados.

### Fase 2 — “Foto do dia”

Objetivo:

- transformar a visão Diária na central operacional;
- resumo do dia;
- próxima prioridade;
- fila cronológica;
- atrasadas;
- concluídas;
- ações rápidas.

Usar dados já existentes sempre que possível.

### Fase 3 — Fluxos de atividade

Objetivo:

- reduzir cliques para criar;
- melhorar defaults contextuais;
- reorganizar modal/workspace;
- simplificar conclusão e follow-up.

### Fase 4 — Semana e mês

Objetivo:

- compactar semana;
- melhorar leitura de carga;
- melhorar navegação do mês;
- ligação direta mês → dia.

### Fase 5 — Performance e refinamento

Objetivo:

- medir e reduzir latência residual;
- revisar cache;
- evitar requests redundantes;
- carregamento progressivo;
- QA de exportação;
- QA mobile.

---

## 23. Critérios de sucesso

A nova Agenda será considerada boa quando:

1. A pessoa abre e sabe imediatamente o que precisa fazer hoje.
2. A atividade vencida não passa despercebida.
3. A próxima atividade é fácil de localizar.
4. É possível criar uma atividade sem preencher dados redundantes.
5. Concluir uma atividade é rápido.
6. A semana é comparável visualmente.
7. O mês funciona como panorama e navegação.
8. Mobile é realmente utilizável.
9. Ações importantes exigem poucos cliques.
10. A tela responde rápido mesmo com histórico crescendo.
11. A mudança não quebra Prospects, Clientes, Home ou exportação.
12. O visual fica coerente com a identidade da Plataforma AGF.

---

## 24. Checklist de regressão

Antes de cada merge da frente Agenda:

- [ ] Diário funciona.
- [ ] Semanal funciona.
- [ ] Mensal funciona.
- [ ] Hoje funciona.
- [ ] Anterior/Próximo funciona.
- [ ] Seletor de data funciona.
- [ ] Cursor é preservado entre modos.
- [ ] Local funciona.
- [ ] Responsável funciona.
- [ ] Tipo funciona.
- [ ] Status funciona.
- [ ] Nova atividade funciona.
- [ ] Cliente/Prospect correto é vinculado.
- [ ] Responsável correto é persistido.
- [ ] Bloco/horário funciona.
- [ ] Duração funciona.
- [ ] Mídia funciona.
- [ ] Observação funciona.
- [ ] Abrir atividade funciona.
- [ ] Checklist funciona.
- [ ] Anotação funciona.
- [ ] Concluir funciona.
- [ ] Próximo follow-up funciona.
- [ ] Cancelar funciona.
- [ ] Excluir funciona.
- [ ] Pendências vencidas continuam corretas.
- [ ] Prospects continuam enxergando Agenda/ações relacionadas.
- [ ] Clientes/tratativas continuam enxergando Agenda/ações relacionadas.
- [ ] Home continua recebendo dados corretos de atividades.
- [ ] PNG funciona.
- [ ] Impressão/PDF funciona.
- [ ] Desktop revisado visualmente.
- [ ] Mobile revisado visualmente.
- [ ] Sem regressão perceptível de performance.

---

## 25. Documentação e versionamento

Toda mudança desta frente deve atualizar quando aplicável:

- `CHANGELOG.md`;
- `docs/FRONTEND.md`;
- `docs/APPS_SCRIPT.md`;
- `docs/PLANILHAS_E_DADOS.md`;
- `docs/PERFORMANCE.md`;
- `docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md` se houver alteração envolvendo dados pessoais, permissões, logs ou segurança.

### Branch sugerida

```text
feat/crm-agenda-foto-do-dia
```

### Commits sugeridos por etapa

```text
docs(crm): registrar baseline da agenda comercial
ui(crm): reorganizar hierarquia visual da agenda
feat(crm): criar visao foto do dia na agenda
ux(crm): simplificar criacao e conclusao de atividades
perf(crm): otimizar carregamento da agenda comercial
docs(crm): homologar nova experiencia da agenda
```

Evitar um único commit gigante misturando layout, backend, dados e performance.

---

## 26. Atenção sensível

A Agenda pode envolver:

- nomes de clientes/prospects;
- telefone/WhatsApp;
- responsáveis;
- observações comerciais;
- histórico de interação;
- dados de agenda;
- materiais internos;
- checklist;
- informações de relacionamento comercial.

Regras:

1. não registrar payloads completos em logs;
2. não copiar dados reais para documentação pública;
3. não expor Agenda diretamente sem autenticação/permissão;
4. manter escopo de responsável/equipe;
5. não incluir tokens ou credenciais em frontend;
6. não usar screenshots com dados sensíveis em documentação versionada sem mascaramento.

---

## 27. Prompt recomendado para iniciar a próxima conversa

Copiar e usar como primeira mensagem:

```text
Quero trabalhar somente na Agenda do CRM Comercial da Plataforma Digital AGF.

Use como contexto principal o arquivo:
docs/AGENDA_COMERCIAL_CONTEXTO.md

Antes de propor alterações:
1. leia o documento inteiro;
2. inspecione o estado atual da Agenda no GitHub;
3. revise frontend, Apps Script, planilhas e performance relacionados;
4. preserve tudo que já funciona;
5. não misture esta frente com Central AGF, Cadastro Mestre postal ou Atende/Consolidador.

Objetivo principal:
transformar a Agenda em uma “foto do dia do comercial”, extremamente clara, rápida, bonita e operacional, sem perder as visões Diária, Semanal e Mensal.

Quero melhorar tudo que fizer sentido:
- layout;
- hierarquia visual;
- usabilidade;
- fluxo de criação;
- fluxo de execução/conclusão;
- filtros;
- cards;
- pendências vencidas;
- visão diária;
- visão semanal;
- visão mensal;
- mobile;
- performance;
- integração com Clientes e Prospects;
- exportação;
- acessibilidade.

Comece fazendo uma auditoria do estado atual e me mostre:
1. o que existe hoje;
2. o que está bom e deve ser preservado;
3. o que está ruim/confuso;
4. quais são os maiores ganhos de UX;
5. quais alterações têm menor risco;
6. uma proposta visual/funcional em fases.

Não implemente um redesign grande antes dessa auditoria.
```

---

## 28. Resumo final para o próximo assistente

A Agenda já tem uma boa base funcional. O problema a atacar não é “falta de calendário”, mas **transformar dados e atividades em uma experiência diária realmente útil para o comercial**.

A evolução deve preservar:

- Diário/Semanal/Mensal;
- semana útil;
- cursor de data;
- carregamento rápido/progressivo;
- filtros;
- cores/tipos;
- criação;
- workspace de execução;
- checklist;
- notas;
- conclusão/follow-up;
- vencidas;
- exportação;
- integração com Cliente/Prospect/Tratativa;
- permissões.

E deve avançar principalmente em:

- “foto do dia”;
- prioridade;
- hierarquia visual;
- redução de cliques;
- ações rápidas;
- clareza de pendências;
- mobile;
- velocidade percebida.

A nova conversa deve primeiro auditar e só depois alterar.
