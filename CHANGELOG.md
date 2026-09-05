# Changelog

Todas as mudancas relevantes deste projeto serao registradas aqui.

## 2026-09-05 - shared/ui - Rodada 0.5: 8 componentes compartilhados

### Adicionado
- 8 componentes em `frontend/shared/ui/agf-ui.css`, todos no namespace `.agf-*`:
  `.agf-btn` (`--primary`, `--secondary`, `--danger`), `.agf-btn-icon`,
  `.agf-chip` (7 variantes), `.agf-input`, `.agf-select`, `.agf-field-label`,
  `.agf-filter-row` e `.agf-field-search`. 18 classes, zero cor literal:
  todos os 49 valores vem de token `--agf-*`.
- Nenhuma classe generica declarada. `.primary-btn`, `.chip`, `.icon-btn`,
  `.input` e `.select` ja existem com aparencias diferentes em `crm/styles.css`
  e `intra/styles/app-shell.css`, e este arquivo e carregado nos dois; declarar
  qualquer uma criaria dependencia de ordem de `<link>` em 20 modulos.
- `frontend/shared/ui/styleguide-shared.html`: pagina de prova com os 8
  componentes lado a lado com os equivalentes do CRM, renderizados dentro de
  `.crm-shell` para comparacao honesta.
- Complemento de tokens da Rodada 0: 14 primitivos, 5 semanticos, 2 sombras e
  3 de tipografia/dimensao que faltavam para montar os componentes sem inventar
  valor. Todos medidos em `crm/styles.css`.

### Corrigido
- ATENCAO - regressao no proprio design system: as sombras `--agf-sh-2` e
  `--agf-sh-3` voltam a ser `--crm-shadow-card` e `--crm-shadow-lift`. O commit
  8c1f6fb as trocou pelo `--shadow` da camada base do CRM por contagem de usos,
  sem notar que `.crm-shell` sobrescreve TODO card (`.surface-card`,
  `.stat-card`, `.kpi-card`, `.deal-card` e mais 5) com `--crm-shadow-card`.
  Na tela, quem aparece e a sombra do `.crm-shell`.
- A11Y: `:focus-visible` e `:disabled` em todos os componentes interativos.

### Cache
- Sufixo `-ds05` no nome de cache dos 10 service workers que precacheiam
  `/shared/ui/agf-ui.css`: raiz, `/agf`, `/atende`, `/balcao`, `/caixa`, `/cep`,
  `/crm`, `/sla`, `/superfrete`, `/superfrete-admin`. Todos limpam caches
  antigos no `activate`, entao os componentes chegam ao usuario no primeiro
  carregamento apos o deploy. Sem isso, a Rodada 1 depuraria um bug que nao
  existe no CSS.

### Ajustado apos revisao
- D3 resolvido com modificador: `.agf-input--pill` e `.agf-select--pill`. O
  `.crm-shell` aplica raio pill a TODOS os controles de barra de filtro
  (`.search-field`, `.filter-row select`, `.filter-row input`,
  `.agenda-toolbar select`), nao so a busca. O modificador deixa a Rodada 1
  usar a forma certa em barra de filtro; formulario continua retangular.
- Registrada em `docs/FRONTEND.md` a tabela de divergencias `intra/` contra a
  camada `.crm-shell`, que substitui a tabela da Rodada 0. Aquela comparou o
  intra contra a camada BASE do CRM, que nao pinta a tela, e por isso nao pode
  ser usada como entrada da Rodada 1.

### Divergencias deliberadas com o CRM
- D1: botao de icone 44px (alvo de toque) contra 40px do CRM.
- D2: chip com padding `4px 10px` e gap `6px`, contra `4px 9px` e `5px`, porque
  9px e 5px estao fora da grade de 4px.
- D3: input e select com raio `10px`; a pill fica so no campo de busca.

### Achados
- `crm/styleguide.html` nao envolve o conteudo em `.crm-shell`, entao renderiza
  a aparencia antiga (raio 11px, altura 38px) e nao corresponde ao app. A
  aparencia dos componentes foi extraida do `.crm-shell`, nao do styleguide.
- O CRM ja tem foco visivel (`--crm-focus`), equivalente ao `--agf-focus-ring`.
- O `.crm-shell` ja subiu o chip de 8,5px para 10px. O compartilhado nasce em
  10px e nao herda o problema de legibilidade da camada base.
- O CRM usa dois vermelhos com papeis diferentes: `#d6483d` no botao perigoso e
  `#b42318` em chip e texto de status. Registrados como
  `--agf-color-danger-ink` e `--agf-color-danger`.

### Escopo
- `crm/styles.css` NAO foi alterado. O CRM passa a consumir o compartilhado na
  rodada dele.
- Os outros 13 componentes minimos continuam so dentro de cada modulo.
- Merge previsto junto com a Rodada 1 (`intra/`), para nao deixar CSS sem
  consumidor na `main`.

## 2026-09-05 - shared/ui - Rodada 0 do design system

### Padronizado
- `frontend/shared/ui/agf-ui.css` passa a declarar a camada de tokens da
  plataforma: 113 tokens em duas camadas (primitivos + semantica), todos no
  namespace `--agf-*`, extraidos dos valores ja em uso em `crm/styles.css`,
  `intra/styles/app-shell.css` e nas 6 copias de `styles/tokens.css`.
- Os 10 tokens legados do bloco `:root` original (`--agf-brand-blue`,
  `--agf-brand-blue-2`, `--agf-surface`, `--agf-bg`, `--agf-border`,
  `--agf-text`, `--agf-muted`, `--agf-radius`, `--agf-topbar-height`,
  `--agf-shadow`) passam a apontar para a camada nova. Valor computado
  conferido token a token: identico ao anterior. Regressao visual zero.
- Nenhum nome generico (`--navy`, `--accent`, `--bg`, `--text`, `--shadow`,
  `--success`, `--danger`, `--line`, `--muted`, `--surface`, `--info`,
  `--topbar-h`, `--primary`, `--ink`, `--card`) foi declarado, porque esses
  nomes existem com valores diferentes em 4 sistemas da plataforma e
  declara-los aqui repintaria modulos em producao.

### Corrigido
- A11Y: adicionado `@media (prefers-reduced-motion: reduce)`.
- Status semantico (`--agf-color-danger/warning/success/info` e os `-soft`)
  resolvido cor a cor, por uso real na tela (`var()` mais hex literal em
  `crm/styles.css`, fora do `:root`), nao familia a familia. O CRM declara duas
  familias de status e usa as duas; nenhuma vence sozinha:
  perigo `#b42318` (9 usos, vence `--danger` 3), sucesso `#15803d` (6 usos,
  vence `--success` 2), alerta `#e08a2e` (4 usos, vence `--amber` 0) e
  info `#3b6fd8` (6 usos, sem par legado). `#b42318` e `#15803d` ainda aparecem
  hardcoded em `.chip.rescue` e `.chip.fidel`, que sao as cores das telas de
  referencia. Os pares perdedores (`#d6483d`, `#23976b`, `#b45309`) seguem
  declarados como primitivo, marcados "quase sem uso", para a Rodada N do CRM
  decidir se elimina um dos dois.
- `--agf-color-text` NAO adota o `#17354b` do CRM. Fica no `#14324a` do proprio
  agf-ui, porque `--agf-text` aponta para ele e ja tem consumidor. Trocar
  repinta texto em producao e e decisao de Rodada N.
- Sombras `--agf-sh-1/2/3` realinhadas aos valores reais do CRM. Estavam
  documentadas como "vindas do CRM" mas usavam `rgba(15,32,56,...)`, que nao
  existe em lugar nenhum da plataforma. Agora `--agf-sh-2` e o `--shadow` do
  CRM literal (19 usos) e `--agf-sh-3` e o `--shadow-hover` literal.
- Corrigido `*/` prematuro dentro do comentario de cabecalho do bloco de
  tokens. Sem essa correcao o comentario fechava cedo, o seletor do `:root`
  seguinte era invalidado e os 113 tokens nao seriam aplicados pelo browser.

### Preservado
- As 811 linhas originais de `agf-ui.css` seguem byte a byte identicas.
  O bloco novo foi apenas anexado ao final (+221 linhas, 0 remocoes).
- Chaves balanceadas: 147 / 147. Comentarios balanceados: 112. Zero `*/` orfao.

### Diagnostico registrado (auditoria da Rodada 0)
- 21 arquivos CSS, 384 KB: 375 cores hex, 148 `rgba()`, 111 `box-shadow`,
  70 `font-size`, 65 `border-radius`, 244 custom properties, 22 breakpoints,
  16 `font-weight`, 14 `font-family` e 291 `!important`.
- 4 sistemas de token mutuamente incompativeis, com 19 colisoes de nome.
- Dos 21 componentes minimos previstos, apenas 1 existe completo em `shared/`.

### Pendente
- Decisao de paleta de acao: `--accent` teal `#0E9594` (CRM) vs amarelo
  `#FFD400` (intra shell). Bloqueia a unificacao dos 4 sistemas de token.
- 20 dos 21 componentes minimos ainda nao existem em `shared/`.
- 6 copias de `styles/tokens.css` continuam no repositorio.
- 22 breakpoints ativos; alvo e 480 / 640 / 768 / 1024 / 1280.
- Versionamento do asset (`?v=`) nao foi aplicado: 10 service workers
  precacheiam `/shared/ui/agf-ui.css` sem query string, e mudar so o `<link>`
  quebraria o match do precache. Decidir junto com o bump dos SW.

### Escopo
- Alteracao restrita a `frontend/shared/ui/agf-ui.css` mais documentacao.
- Nao altera Apps Script, planilhas, autenticacao, rotas, IDs, seletores,
  endpoints, regras de negocio ou deploy.

## 2026-09-05 - Baseline documental dos modulos da Plataforma AGF

### Documentado
- Criado `docs/modulos/` como estrutura oficial de documentacao tecnica por modulo e submodulo.
- Documentados os principais modulos publicos, de clientes, internos, analiticos e tecnicos compartilhados encontrados na `main`.
- Atualizado `docs/MAPA_MODULOS.md` para refletir rotas e estruturas atualmente encontradas no repositorio.
- Registrados como aliases, e nao como modulos independentes, `/intra/agenda` -> `/crm/?view=agenda` e `/intra/crm` -> `/crm/?view=clientes`.
- Definido `/caixa/` como unica rota oficial do Caixa. A antiga implementacao `/intra/caixa/` foi removida definitivamente da `main`, sem redirect ou compatibilidade; o card Caixa do `/intra` aponta para `/caixa/`.
- Separado conceitualmente o modulo visual `/intra/logistica` do backend `apps-script/logistica`, hoje relacionado a familia de Logistica Reversa.
- Criadas documentacoes especificas para os submodulos da familia Reverso e para as visoes de Inteligencia.
- Criadas documentacoes iniciais para servicos compartilhados como autenticacao, etiquetas, NF-e/DANFE, base-metro, base-cliente-etiquetas e logistica.
- Informacoes sem evidencia suficiente foram marcadas como `NAO CONFIRMADO`, `NAO IDENTIFICADO` ou `NAO MAPEADO`, em vez de serem inferidas como fato.

### Escopo
- Baseline documental e organizacao de conhecimento tecnico.
- A remocao funcional de `/intra/caixa/` foi aplicada separadamente na `main` antes da consolidacao desta documentacao.
- Este PR documental nao altera Apps Script, planilhas, autenticacao, regras de negocio, dados ou deploy.

### Atencao sensivel
- A documentacao mapeia modulos que podem tratar dados cadastrais, fiscais, financeiros, rastreios, autenticacao e integracoes externas.
- Nenhum token, senha, secret, valor de PropertiesService, ID privado ou dado real de cliente foi adicionado.

## 2026-08-29 - Auditoria Fase 0 da Agenda Comercial

### Documentado
- Criado `docs/AGENDA_COMERCIAL_FASE0_AUDITORIA.md` como complemento ao handoff principal da Agenda.
- Registrados os achados da auditoria visual e tecnica: semana util, excesso de espaco na visao diaria, bloqueio atual para atividade avulsa, dependencias Cliente/Prospect/Tratativa, ausencia de campo proprio de titulo, duracao fixa de 30 minutos no frontend e simplificacao proposta para data/horario.
- Consolidada a recomendacao tecnica de `ENTIDADE_TIPO=AVULSA`, `ENTIDADE_ID` e `TRATATIVA_ID` vazios, com `TITULO` proprio e aplicabilidade parametrizada por tipo de atividade.
- Registradas regras para workspace avulso, filtros, permissoes, performance, idempotencia e nao criacao de CRM paralelo para contatos avulsos.

### Escopo
- Apenas documentacao e auditoria.
- Nenhuma alteracao funcional em frontend, Apps Script, planilhas, dados ou deploy.

## 2026-08-29 - Contexto consolidado da Agenda Comercial

### Documentado
- Criado `docs/AGENDA_COMERCIAL_CONTEXTO.md` como handoff para uma frente dedicada de melhoria da Agenda do CRM Comercial.
- Consolidado o estado funcional ja existente: modos Diario/Semanal/Mensal, semana util, filtros, criacao e execucao de atividades, pendencias vencidas, exportacao e integracoes com Clientes/Prospects.
- Registradas decisoes anteriores de UX e performance que nao devem regredir, incluindo renderizacao imediata, preservacao do cursor de data, filtros proprios e leitura/cache de Agenda em janela.
- Definida como direcao de produto a evolucao da Agenda para uma "foto do dia do comercial", com prioridade para execucao diaria, pendencias, proxima acao, clareza visual, mobile e velocidade percebida.
- Incluido plano de auditoria, fases de implementacao, criterios de sucesso, checklist de regressao e prompt para iniciar uma conversa dedicada.

### Escopo
- Apenas documentacao e planejamento tecnico.
- Nenhuma alteracao funcional em frontend, Apps Script, planilhas, dados, autenticacao ou regras comerciais.

## 2026-08-18 - Acesso ao emissor DC-e

### Criado
- Adicionada a rota publica `/dce`, que redireciona temporariamente para o projeto isolado `agf-dce-facil` no Netlify.
- O redirecionamento usa HTTP 302 para permitir futura troca por um subdominio proprio sem cache permanente.

### Escopo
- Apenas roteamento do site principal.
- Nao altera autenticacao existente, Apps Script, planilhas, dados, regras fiscais ou o codigo do emissor.

## 2026-07-07 - CRM performance de boot e loading

### Melhorado
- Boot do CRM passa a priorizar a view ativa.
- Renderizacao inicial evita montar telas invisiveis.
- Kanban passa a limitar cards iniciais por coluna com opcao de "Ver mais".
- Dados cadastrais detalhados passam a carregar sob demanda quando possivel.
- Adicionada instrumentacao segura de performance via `debugPerf=1`.

### Escopo
- Frontend do CRM.
- Apps Script somente para rota de boot otimizada.
- Nao altera planilhas, dados ou autenticacao.

## [nao versionado] - 2026-07-03
### Alterado
- Nuvemshop (/nuvem): tela de Pedidos passou a priorizar pedidos pagos, com chips visuais por pagamento, servico PAC/SEDEX e valor do pedido no card.
- Nuvemshop (/nuvem): botao de sincronizacao do frontend agora solicita lote menor para reduzir tempo de importacao.
- Nuvemshop (/nuvem): adicionado reparo de scroll lock para evitar travamento da rolagem no desktop apos loading/modal.
- Nuvemshop Apps Script: criada sincronizacao incremental de pedidos pagos usando cursor tecnico em LAST_SYNC_AT, com bloqueio para pedidos cancelados ou sem pagamento confirmado.
- Nuvemshop Apps Script: geracao individual e em lote passa a bloquear pedido nao pago ou cancelado antes de enviar para o App de Postagens.
- Nuvemshop Apps Script: webhook de pedido passa a processar apenas pedidos pagos e registra tambem evento order/paid quando a rotina de registro for executada.

### Atencao sensivel
- A mudanca envolve pedidos Nuvemshop, status de pagamento, dados de destinatario, rastreio, Apps Script, planilhas e tokens armazenados em PropertiesService.
- Nenhum token, URL completa de Web App, ID real de planilha, payload bruto ou dado real de cliente foi registrado neste changelog.

## [nao versionado] - 2026-06-30
### Corrigido
- CRM/Prospects: barra de filtros passou a usar escopo de prospect. Local agora
  vem de config.prospectLocais e a secao Prospects nao exibe mais "Todas as
  curvas (clientes)". Clientes/Home/Agenda seguem com Local de CRM + curvas.
  Arquivo: frontend/crm/app.js.
- CRM/Locais (backend): crm3_apiGetConfig_ e crm83_getActiveLocals_ blindados.
  Uma falha de Locais nao derruba mais o bootstrap do CRM. Versao 8.3.2.
  Arquivos: apps-script/base-metro/06_CRM_JORNADA_FASE3.js e 12_CRM_LOCAIS_FASE83.js.

## Documentacao - CRM_LOCAIS por EXIBIR_EM

- Documentada a correcao funcional ja aplicada para separar locais de CRM/clientes e Prospects pela coluna `EXIBIR_EM` da aba unica `CRM_LOCAIS`.
- Registrado que `EXIBIR_EM=CRM` alimenta filtros e configuracoes de CRM/clientes, enquanto `EXIBIR_EM=PROSPECTS` alimenta filtros e cadastro de Prospects.
- Registrados tambem os valores aceitos `CRM`, `PROSPECTS`, `CRM;PROSPECTS`, `AMBOS` e `TODOS`.
- Reforcado que nao existe aba separada `PROSPECTS_LOCAIS` e que a constante `PROSPECTS_LOCAIS` nao deve ser recriada.
- Objetivo: evitar regressao em que locais de clientes, como CF e METRO, aparecam em Prospects; Prospects devem usar locais configurados para `PROSPECTS`, como ESTACAO FASHION, SHOPPING PARANGABA e REVERSA.
- Nenhuma alteracao funcional aplicada nesta etapa de documentacao.

## Documentacao - correcao conceitual MIDIAS_CRM x Manuais

- Corrigida a documentacao para registrar que `MIDIAS_CRM` e a biblioteca estrategica de conteudos usados pelas acoes do CRM.
- Corrigida a documentacao para registrar que `Manuais` e uma biblioteca mais ampla da tela `/intra/manuais/`, podendo incluir conteudos proprios e tambem conteudos vinculados ou equivalentes a `MIDIAS_CRM`.
- Adicionada proposta de colunas `ORIGEM_CONTEUDO` e `MIDIA_CRM_ID` para permitir relacao entre as duas estruturas sem fundir as abas.
- Nenhuma alteracao funcional aplicada nesta etapa.

## Documentacao - mapa inicial APP Total CF + Metro

- Criado `docs/PLANILHA_APP_TOTAL_CF_METRO.md` para registrar a planilha APP Total CF + Metro como fonte viva das regras de CRM, agenda, visitas, materiais e manuais.
- Registrado o achado inicial de que `/intra/manuais/` deve ser alimentado pela aba `Manuais`, nao pela estrutura fixa de acoes/midias do CRM.
- Proposta estrutura de colunas opcionais para vincular cada manual a `ACAO_CRM`, `FILTRO_CLIENTE`, publico, curva, status, tendencia, contrato e outros filtros comerciais.
- Atualizado `docs/PLANILHAS_E_DADOS.md` com referencia ao novo mapa e regra de manutencao.
- Nenhuma alteracao funcional aplicada nesta etapa.

## Setup Codex do projeto

* Adicionada estrutura local `.codex/` para apoio ao uso do Codex no projeto.
* Criado arquivo `.codex/config.toml` com regras locais seguras, sem credenciais.
* Criado prompt padrao em `.codex/prompts/trabalho-local-seguro.md`.
* Criado documento `docs/ROTINA_CODEX.md` com o fluxo recomendado de uso do Codex.
* Nenhuma alteracao funcional aplicada.

## 2026-06-16

### Criado

- Estrutura inicial do repositorio tecnico minhaagenciaonline.
- Pastas base para frontend, Apps Script, documentacao, previews e releases.
- Primeiro commit tecnico do projeto.
- Frontend atual adicionado ao repositorio GitHub.
- Deploy de producao conectado ao GitHub pela branch main.
- Netlify configurado para publicar a pasta frontend.

### Observacoes

- Antes desta migracao, o site era publicado por deploy manual no Netlify.
- A partir desta etapa, o repositorio GitHub passa a ser a fonte viva do frontend.
- O site www.minhaagenciaonline.com.br foi validado visualmente apos o deploy inicial pelo GitHub.

## 2026-06-16 - Apps Script do projeto

- Adicionados ao repositorio os Apps Script vinculados ao projeto minhaagenciaonline.
- Criado .gitignore para impedir versionamento de arquivos .clasp.json.
- Realizada verificacao inicial para evitar envio de segredos reais.
- Commit relacionado: badf763.

## Auditoria tecnica - Modulo Reverso

- Documentada auditoria inicial do modulo Reverso.
- Mapeadas telas do frontend, camada API, Apps Script, dados, planilhas, riscos e melhorias futuras.
- Consolidados pontos principais em APPS_SCRIPT, PLANILHAS_E_DADOS, PERFORMANCE e SEGURANCA_E_DADOS.
- Nenhuma alteracao funcional aplicada nesta etapa.

## Melhoria UX - mensagens do Reverso

- Ajustadas mensagens de loading e erro no frontend do modulo Reverso.
- Melhoradas mensagens de autenticacao, validacao de etiqueta, servidor e carregamento de unidade.
- Nenhuma regra de negocio, endpoint, planilha ou Apps Script foi alterado.

## Melhoria UI - mobile Reverso

- Ajustados botoes, loading, toast e estado vazio no frontend do modulo Reverso.
- Melhoria restrita a CSS, sem alteracao de backend, API, planilhas ou regras de negocio.

## Documentacao - checklist de testes Reverso

- Adicionado checklist manual para validar o modulo /reverso.
- Checklist cobre carregamento inicial, unidade, login, etiqueta, camera, drop-off, historico, painel AGF, mobile e seguranca visual.
- Nenhuma alteracao funcional aplicada.

## Documentacao - Modulo /app Minhas Postagens

- Documentado o modulo /app como SPA/PWA publica de Minhas Postagens.
- Mapeados frontend, rotas internas, actions, Apps Script, planilhas, dados sensiveis, riscos e pontos de performance.
- Registrados cuidados para nao expor URLs completas de Web App, IDs de planilha, IDs de Drive, tokens ou dados reais.
- Nenhuma alteracao funcional aplicada.

## Documentacao - checklist de seguranca /app

- Criado checklist de seguranca do modulo /app por prioridade: critica, alta, media e baixa.
- Documentadas validacoes esperadas para sessao, Web Apps, actions, payloads, logs, diagnostico, NF-e/DANFE, PDFs, Drive, planilhas e Correios/CWS.
- Registradas orientacoes de teste seguro para Rachel, sem expor URLs completas, IDs reais, tokens, credenciais ou dados reais.
- Nenhuma alteracao funcional aplicada.

## Documentacao - mapa de actions e payloads /app

- Mapeadas actions consumidas pelo frontend do /app, suas origens, funcoes Apps Script relacionadas, payloads resumidos e respostas esperadas.
- Registrados dados sensiveis envolvidos e riscos de regressao por action.
- Adicionada relacao entre actions, planilhas, dados e pontos de seguranca.
- Nenhuma alteracao funcional aplicada.

## 2026-07-06 - CRM Home, Agenda e padronizacao visual

### Adicionado
- Exposicao de `homeLocais` na configuracao do CRM.
- Filtros proprios de Local e Responsavel na Visao Geral/Home.
- Padronizacao visual do CRM em CSS:
  - `CRM UI Standardization - 2026-07`
  - `CRM UI Refinement 01 - 2026-07`
  - `CRM UI Refinement 02 - 2026-07`

### Alterado
- A Visao Geral/Home deixa de herdar filtros das abas Prospects, Clientes e Agenda.
- A Agenda passa a renderizar imediatamente com dados disponiveis ao trocar periodo/modo.
- A troca entre Diario, Semanal e Mensal preserva `state.agendaCursor`.
- Padronizacao visual de headers, tabs, control bars, filtros, chips, botoes, cards, Agenda, Home e mobile.
- Inclusao de paleta visual para chips de atividades:
  - Visita Presencial: `#EA9A06`
  - Ligacao: `#1F63DE`
  - WhatsApp: `#079C54`
  - Email: `#B48414`
  - Reuniao Online: `#027973`
  - Proposta: `#E0631D`
  - Retorno: `#0677B4`
  - Treinamento: `#804DF5`

### Pendente
- Os filtros multiple select ainda precisam de revisao futura.
- Decisao tecnica desta versao: nao continuar refinando agora para evitar regressao visual.
- A revisao dos filtros multiple select deve ser tratada em branch propria futura.

## 2026-07-07 - CRM Home layout

### Corrigido
- Organizado o layout da aba Visao Geral em duas colunas independentes no desktop.
- Mantido comportamento responsivo em uma coluna no mobile.
- Atualizado cache do CSS do CRM para `v=125`.

### Observacao
- Este ajuste foi visual e isolado.
- Nao altera filtros, performance, Apps Script ou regras de dados.

## 2026-07-07 - CRM filtros multiple select

### Corrigido
- Corrigido o comportamento visual dos checkboxes dos filtros multiple select.
- Opcoes nao selecionadas agora ficam visualmente vazias.
- Opcoes selecionadas exibem o check corretamente.
- O botao "Selecionar todos" passa a selecionar todas as opcoes reais.
- O botao "Limpar filtro" passa a limpar todos os selecionados.
- O badge do chip passa a refletir a quantidade real de opcoes selecionadas.

### Escopo
- Ajuste isolado em `frontend/crm/app.js`.
- Nao altera backend, Apps Script, dados, layout da Home ou performance inicial.