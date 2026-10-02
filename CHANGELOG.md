# Changelog

Todas as mudancas relevantes deste projeto serao registradas aqui.

## 2026-10-02 - Visão 360: percentuais do Balcão na arte PNG seguem a regra do ranking

### Corrigido
- Arte do Balcão (aba Comercial) escondia colaborador com R$ 0,00. Agora ELEN, ALESSON e LEVY aparecem sempre.
- Percentual passa a usar o `percentualDoBalcao` do servidor: valor do colaborador ÷ realizado total do Balcão (antes dividia só pela soma dos colaboradores listados).
- Barra de cada colaborador passa a ser proporcional ao percentual (antes era relativa ao maior valor, e o 1º sempre aparecia com barra cheia).
- Venda sem escala semanal cadastrada aparece no cabeçalho do bloco ("Sem escala: R$ X").
- Com filtro de atendente ativo, os percentuais ficam suspensos com aviso, igual ao ranking do painel.

## 2026-10-02 - Visão 360: novas artes PNG na aba Comercial

### Adicionado
- `DashboardCommercialPngV2.html`: botão "Salvar PNG" da aba Comercial gera as artes 1080x1080 de Balcão AGF, Encomendas e Metrô no padrão do Método de Artes AGF (Poppins/Inter, paleta em vigor, ícones da biblioteca AGF, medalhas Bronze/Prata/Ouro).
- Cada arte mostra realizado, % da Bronze contra o mês decorrido, cartões das metas configuradas (Bronze, Prata, Ouro), média diária realizada x necessária para a próxima meta e, no Balcão, os percentuais por colaborador.
- Fontes subconjunto embutidas no HTML (cerca de 100 KB) para o Browser Run não depender de rede.

### Alterado
- Gerador antigo (`DashboardCommercialPngV1`, cartões 600x600) migrou para a aba Gestão. Única mudança: a aba onde o botão aparece.
- `ATENDE_renderCommercialPngV1` e o Worker `/render-commercial-png` aceitam `width`/`height` (600 ou 1080). Sem parâmetro continua 600x600.

### Regras
- Fonte única dos números: os mesmos dados da aba Comercial (`metas.config`, `metas.realizado`, `rankingBalcao`, dias úteis do mês).
- Encomendas passa a usar dias úteis, como Balcão e Metrô.
- Meta não configurada (valor zero) não aparece. Sem meta Bronze, o PNG não é gerado e aparece aviso.

## 2026-10-02 - Cadastro: LOCAL da carteira aparece no CRM na hora

### Corrigido
- Trocar o LOCAL da carteira no /cadastros (ficha, lista ou "aplicar sugestões fortes") gravava a decisão, mas o CRM só recalculava no cron de 10 min, que fica travado enquanto a sincronização do Atende não termina a passagem (motor pendente). Ex.: DEPARTAMENTO MUNICIPAL DE PROTECAO E DEFESA DOS DIRE (PROCON) ficou em AGF no CRM depois de ir para METRÔ.
- `/api/v2/definir-local` agora recalcula o CRM na mesma chamada (cerca de 5 s), como já acontecia com os grupos comerciais. Resposta ganha `crmAtualizado`. Se o recálculo falhar, a decisão fica gravada e o cron recalcula depois.

## 2026-10-02 - Visão 360: projeção do mês com ritmo ponderado pelo histórico

### Alterado
- Projeção recorrente deixa de ser `realizado ÷ dias decorridos × dias do mês`. Nova regra, por cliente: `realizado + (p × ritmo do mês + (1 - p) × ritmo histórico) × dias restantes`, com `p = dias decorridos ÷ dias do mês` e ritmo histórico = Média 3m (ou Base recorrente manual) ÷ dias do mês. Cliente sem histórico segue só o ritmo do mês. Campanha, Pontual e pendente continuam somando só o realizado.
- Vale para total, grupos (Mensageria/Encomendas), locais (Balcão/Metrô/AGF), alerta de degrau, base recorrente e queda de clientes.
- Texto do cartão de capacidade do degrau atualizado.

### Corrigido
- Histórico de 3 meses por cliente guardava só o valor do último LOCAL lido em cada mês (a consulta agrupa por local). Agora soma todos os locais. Afeta a Média 3m de clientes que postam em mais de um local.

### Motivo
- 01/10/2026: um único dia (R$ 69.412,16, sendo R$ 44.355,85 da ENEL em 6 objetos) × 21 dias úteis gerou projeção de R$ 1.457.655,36. Com 1 dia decorrido, qualquer dia atípico de cliente grande e irregular era multiplicado por 21.

## 2026-10-02 - Visão 360: base recorrente manual por cliente (projeção V6)

### Adicionado
- Coluna **Base recorrente** na tabela "Tipo de receita para projeção V6" (Metas). Valor mensal opcional por cliente. Quando preenchido, substitui a Média 3m do cliente na base recorrente do grupo, na queda de clientes (defesa de receita), no radar R5 e nos sinais de revisão. Vazio mantém a Média 3m calculada.
- Na coluna Média 3m, cliente com base manual mostra o valor usado e, abaixo, a média calculada original.
- Cliente com mais de um grupo (Mensageria/Encomendas): a base é distribuída na proporção do histórico de cada grupo.
- Migração `0022_cliente_base_recorrente.sql` (coluna `base_recorrente_mensal`). Já aplicada em produção e registrada em `d1_migrations`.

### Inalterado
- Projeção do mês continua `(recorrente realizado / dias úteis decorridos × dias úteis do mês) + eventual + pendente`. A Média 3m nunca entrou nessa conta.

### Motivo
- TRE-CE: campanha eleitoral de 18/08 a 29/09 inflou a Média 3m para R$ 39.398,04. Base recorrente pré-campanha (mai-jul/2026): cerca de R$ 3.000/mês.

## 2026-10-02 - CRM: nome fantasia sempre na lista do Cadastro

### Corrigido
- Lista do Cadastro mostrava o CNPJ na 2ª linha quando o nome fantasia era igual ao nome do cliente (30 clientes, ex.: CIA PAULISTA, VIVARA, NUAGE). Agora mostra sempre o nome fantasia; o CNPJ só aparece quando não há fantasia. Cards do Funil seguem sem repetir o nome quando o fantasia é igual. Cache v=7.

## 2026-10-02 - CRM: cadastro do Portal Postal, nome fantasia e contrato próprio

### Adicionado
- Carga do cadastro do Portal Postal (CSV de clientes + planilha "Fantasia Clientes Portal") no `crm_cadastro` do D1, direto no banco: 302 clientes do Portal que já estão no CRM. Campos: nome fantasia, razão social, CNPJ/CPF, WhatsApp (celular), telefone (fixo), e-mail, endereço, e o contrato próprio do Portal (código, contrato, cartão, cód. administrativo, tipo e vigência). Valor já preenchido à mão no CRM não foi sobrescrito. Backup: tabela `crm_cadastro_bkp_20261002`.
- Migração `0106_crm_cadastro_portal.sql`: 6 colunas novas (`CODIGO_PORTAL`, `CONTRATO_PORTAL`, `CARTAO_PORTAL`, `COD_ADM_PORTAL`, `TIPO_CONTRATO_PORTAL`, `VIGENCIA_CONTRATO_PORTAL`). Já aplicada em produção e registrada em `d1_migrations`.
- API do CRM: cliente ganha `telefone`, `cidade`, `uf`, `codigoPortal`, `contratoPortal`, `cartaoPortal`, `tipoContratoPortal`, `vigenciaContratoPortal`, `contratoPortalVencido` e `situacaoContratoProprio` (`USA_OUTRO_CONTRATO`, `USA_O_PROPRIO`, `PROPRIO_SEM_USO`, `SEM_CONTRATO_PROPRIO`). Card do funil ganha `nomeFantasia`. Só campos acrescentados.
- Cadastro: coluna "Contrato próprio" (filtrável) para achar quem tem contrato próprio e posta com outro. Busca também por telefone, contrato e cartão do Portal.
- Ficha do cliente: seção "Cadastro" com fantasia, razão social, CNPJ, WhatsApp, telefone, e-mail, endereço, contrato próprio e contrato nas postagens.

### Alterado
- Cards do Funil mostram o nome fantasia como 2ª linha (quando diferente do nome).
- Lista do Cadastro: a 2ª linha mostra o nome fantasia no lugar de "CNPJ a completar" (sem fantasia: CNPJ; sem os dois: "Nome fantasia a completar").
- O contrato exibido no CRM continua sendo o das postagens (regra da Rachel): o contrato do Portal fica em campos separados.
- Fusão de IDs do Cadastro leva também as colunas do Portal.
- Frontend `crm-integrado.js` e `.css` com cache v=6. Prévia na branch `feat/crm-portal-fantasia` (origem liberada no `wrangler.jsonc`).

## 2026-09-30 - Cadastro de Clientes: nome antigo e novo no Portal

### Adicionado
- Ficha do cliente do Portal mostra "Nome antigo ou novo no Portal?" quando outro cliente do Portal usa o mesmo contrato + cartão e um nome parou quando o outro começou (ou um nome é o começo do outro). Casos encontrados em 30/09: FUNDAÇÃO PARA O DESENVOLVIMENTO... / FIOTEC FUND DESENV CIENT E TECN SAUDE e M J L SANTOS BIJUTERIAS E ACESS / M J L SANTOS BIJUTERIAS E ACESSORIOS LTDA.
- "É o mesmo: juntar": junta os dois, fica com o nome mais recente do Portal e soma o histórico. O CRM leva tratativas e agenda para o ID que ficou. Dá para desfazer pelo botão de separar na grafia.

### Alterado
- Regra "dois clientes do Portal nunca viram um só" ganha uma exceção manual (decisão `UNIR` com `PORTAL_RENOMEADO`). O motor e o revisor automático continuam sem juntar dois Portais sozinhos.
- Motor do Cadastro `2026-09-30.1`: recebe a data da última postagem de cada grafia para escolher o nome atual do Portal. Sem mudança para os demais clientes.
- Erros da API do Cadastro podem trazer `codigo` (ex.: `DOIS_PORTAIS`, `SEM_CARTAO_COMUM`).

## 2026-09-30 - CRM: LOCAL com vários marcados

### Alterado
- Filtro LOCAL do CRM (Clientes e Agenda) aceita 1, 2 ou todos os LOCAIS ao mesmo tempo. Clique soma ou tira um LOCAL; "Todos" marca os três; sempre fica pelo menos um. A escolha fica salva no navegador (`crm_cix_locais`; a escolha antiga `crm_cix_local` é aproveitada).
- Com mais de um LOCAL: Dashboard, Funil, Cadastro, Ações e Agenda somam os LOCAIS marcados. Cadastro, Ações e Curva ABC ganham a coluna LOCAL.
- Curva ABC com vários LOCAIS: cada cliente mantém a classe A, B ou C do próprio LOCAL (regra aprovada da curva por LOCAL). Quem posta em mais de um LOCAL aparece numa linha por LOCAL; o card "Clientes na janela" conta o cliente uma vez e mostra quantos postam em mais de um LOCAL. O Pareto pinta cada barra com a curva do próprio LOCAL e não mostra as linhas de 80% e 95%.
- Nova atividade sem vínculo com vários LOCAIS marcados: escolhe o LOCAL no modal. Com cliente ou prospect, vale o LOCAL do cadastro.
- Só frontend (`crm-integrado.js` e `.css`, cache v=5). Servidor e banco sem mudança: a tela pede um LOCAL por vez e soma.

## 2026-09-30 - CRM: contrato próprio, Curva ABC com última postagem e colunas ocultáveis

### Alterado
- Motor do CRM 1.1.0 (regra AGF): cliente que postou com contrato próprio (Portal Postal, Contrato ECT ou número de contrato) nos últimos 60 dias TEM contrato, mesmo que o volume maior vá por VR (Clube Correios) ou balcão. Nunca recebe Converter nem Cancelar; volume relevante fora do contrato vira Fidelizar com o motivo "migrar o volume para o contrato".
- Clube Correios (VR) não conta como contrato do cliente. Cliente só VR segue a regra VR (Cancelar, salvo faturamento que justifique Converter) e não mostra mais o número do contrato coletivo.
- O motor recalcula sozinho no primeiro cron após o deploy (versão diferente da última gravada).
- Coluna Intermediador (Curva ABC, Cadastro, Ações) mostra o TIPO do Atende (SUPERFRETE, PLATINUM, CLUBE CORREIOS...), com o INTERMEDIADOR quando não há TIPO.

### Adicionado
- Curva ABC: coluna Última postagem (ordenável) e exportação no CSV.
- Botão Colunas (Curva ABC, Cadastro, Ações) para esconder e mostrar colunas, salvo no navegador.
- Tabelas ocupam a altura da tela e botão Tela cheia leva a tabela para o topo.
- Filtro "Sem postar" (menos de 30 dias, 30 a 59 dias, 60 dias ou mais) na Curva ABC, no Cadastro e em Ações.

## 2026-09-29 - CRM integrado: Clientes, Agenda e Curva ABC

### Adicionado
- Clientes com 5 abas integradas (Dashboard, Funil, Cadastro, Ações e Curva ABC nova) e Agenda (diária, semanal, mensal) no visual aprovado no protótipo: `frontend/crm/crm-integrado.js` e `crm-integrado.css`.
- LOCAL como filtro pai no topo, vindo da autenticação (admin vê os 3).
- Sinalizado automático no Funil: clientes com prioridade crítica ou alta do motor aparecem sem gravar nada; a tratativa nasce ao Agendar ou Assumir.
- Sinais do Visão 360 no Dashboard: voltou a postar, contrato detectado e queda relevante.
- Curva ABC 12M por LOCAL (A até 80%, B até 95% ou a partir de R$ 5.000, C o resto), com mapa de calor mensal, Pareto e exportação CSV.
- Tabelas no padrão do /atende: ordenar, filtrar por coluna, arrastar e redimensionar colunas (largura salva no navegador).
- Gráficos interativos com Apache ECharts 5.5.0 hospedado em `frontend/shared/vendor/echarts/` (carregado só nas abas com gráfico).
- Botão de WhatsApp Web em toda atividade e cliente com número.
- Atividade sem vínculo (reunião interna, treinamento), tipo novo "Reunião interna" e duração padrão pelo tipo.
- Worker: `get_carteira_v1`, `get_curva_abc_v1`, `assumir_cliente_v1`; agenda com WhatsApp e contexto do motor; filtro opcional `local` na jornada e na agenda.
- Migração 0105 (aditiva): `crm_agenda.TITULO`, `crm_tipos_atividade.APLICA_AVULSA`, tipo `ATV_REUNIAO_INTERNA` e índices.

### Alterado
- Cliente agendado ou assumido entra no funil em "Em tratativa" (antes nascia em "Sinalizado").
- Concluir, cancelar e excluir atividade conferem LOCAL e responsável no servidor. ATENÇÃO - dados ou segurança.
- `app.js`: ponte `window.CRM_CORE`, abertura de atividade fora da semana atual e aba Ações antiga (iframe) só no modo clássico.

### Ajuste visual (Curva ABC)
- Os 6 indicadores ficam numa faixa só e os gráficos de Participação e Pareto lado a lado.
- Tabela da Curva ABC com fonte menor (meses em 11px) e colunas mais estreitas.

### Como voltar ao visual antigo
- Para um usuário: `/crm/?classico=1`. Para todos: `crmIntegrado: false` em `frontend/crm/config.js`.

## 2026-09-29 - Cadastro v2: revisor automático das sugestões

### Adicionado
- Revisor automático (`REVISOR_AUTO`): une sozinho as sugestões seguras (grafia com 1 letra de diferença e nome contido sem ambiguidade) logo após cada limpeza. Duvidosas continuam para decisão humana. Reversível.
- Rota admin `POST /api/v2/revisor`.

## 2026-09-24 - CRM inteiro no Worker e no D1

### Adicionado
- `/api/crm` no Worker `agf-cadastros-api`: todas as ações do CRM (config, cadastro, prospects, jornada, agenda, checklists, notas, Ações da carteira) no mesmo contrato do Apps Script antigo.
- Migração 0104: tabelas do CRM no D1 com os seeds de configuração do código antigo.
- Agrupamento de clientes no Cadastro v2 leva junto os registros do CRM.

### Alterado
- Front do CRM (`/crm` e `/crm/acoes`) aponta para o Worker. Nenhuma leitura da BASE METRO nem de planilha.

### Removido
- `18_CRM_FONTE_D1.js`, ponte `crm_id_legado` e rotas `/api/v2/crm/integracao/*` (etapa 3 via Apps Script substituída). Arquivos do `base-metro` voltaram ao estado anterior.

## 2026-09-24 - CRM etapas 2 e 3: responsavel com LOCAIS e aba CLIENTES pelo Visao 360

### Adicionado
- Cadastro de usuarios: LOCAIS da carteira (AGF, BALCAO, METRO) no vinculo com o CRM; `crm.locais` na sessao (AGF_AUTH).
- `18_CRM_FONTE_D1.js` (base-metro): CLIENTES_MASTER montada com as metricas do D1, chave `CRM_FONTE_CLIENTES`, troca de LOCAIS e filtro por LOCAL do responsavel.
- Ponte de IDs antigos do CRM (`crm_id_legado`, migracao 0103) e rotas de integracao `/api/v2/crm/integracao/*` com segredo compartilhado.
- CRM: lista de clientes com "Mostrar mais" no lugar do corte em 500.

### Alterado
- `op_buildMasterRows_`: parte final extraida para `op_finalizeMasterRows_` (mesmo resultado; paridade testada).

## 2026-09-24 - CRM aba CLIENTES: motor no Worker (etapa 1)

### Adicionado
- `crm_motor.js`: porte fiel do calculo do CLIENTES_MASTER (30/60 dias, curva, acao, subacao, prioridade, midia), com curva por LOCAL da carteira.
- Teste de paridade contra o Apps Script original: 0 diferencas.
- Sincronizacao do Atende passa a trazer INTERMEDIADOR, TIPO, subgrupo do servico e estorno (migracao 0102).
- Tabela `crm_metricas` e rotas `/api/v2/crm/resumo`, `/api/v2/crm/clientes`, `/api/v2/crm/recalcular`.

## 2026-09-24 - Cadastro de Clientes v2 (ponte Atende para CRM)

### Adicionado
- Worker `agf-cadastros-api` v2 (rotas `/api/v2/*`) com motor de identidade: CLIENTE PORTAL compartilhado (BALCAO, GAS SHOPPING METRO, GAS SHOPPING CENTRO FASHION) usa NOME REMETENTE limpo; os demais usam o CLIENTE PORTAL.
- Limpeza automatica: mesmo nome do Portal, nome cortado, nome sem espaco, CNPJ raiz, mesmas palavras, erro de digitacao minimo e decisoes manuais da planilha CADASTRO_MESTRE_CLIENTES.
- Sugestoes em grupos para agrupar com 1 clique; "Nao e o mesmo" permanente.
- Tabelas `cid_*` no D1 `agf-cadastros` (migracao 0100). As tabelas da v1 nao foram alteradas.
- Tela `/cadastros/` com abas CLIENTE PORTAL, BALCAO, GAS SHOPPING METRO e GAS SHOPPING CENTRO FASHION, ficha com Postagens por LOCAL, grafias e contratos observados.
- Feed para o CRM: `/api/v2/crm/postagens` e `/api/v2/crm/ids-fundidos`.

### Observacao
- ATENCAO - dados: a planilha legada (nomes de clientes) fica fora do Git, em `_entregas/cadastros-v2/`.
- Documentacao: `docs/modulos/cadastros/README_V2.md`.

## 2026-09-11 - Correcao da aba Entregas do /app

### Corrigido
- Registrada a action `painelCliente` no roteador do Apps Script.
- Implementado o backend que cruza o historico concluido do cliente autenticado com a API Rastro dos Correios.
- Mantidos os filtros de 30, 60, 90 dias e todo o historico, com deduplicacao por codigo de objeto.
- A resposta agora entrega os campos esperados pela tela: objeto, servico, destino, valor, postagem, previsao, data e situacao atual.

### Performance e resiliencia
- Consultas de rastreio usam `UrlFetchApp.fetchAll` em blocos e cache temporario por objeto.
- Falha em um objeto nao derruba o painel inteiro; esse item aparece sem informacao ate nova tentativa.
- Nenhuma nova aba, coluna ou migracao de dados foi criada.

### Atencao sensivel
- A mudanca envolve rastreios, historico de postagens, sessao do cliente e credenciais CWS.
- O backend filtra por `LOGIN_APP` da sessao e nao devolve tokens, credenciais nem resposta bruta da API ao painel.


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