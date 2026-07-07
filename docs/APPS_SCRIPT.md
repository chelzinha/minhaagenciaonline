# APPS_SCRIPT

Documento tecnico em preparacao.

## Apps Script versionados no repositorio

Em 2026-06-16, os Apps Script do projeto foram copiados para apps-script/ e versionados no GitHub.

Modulos adicionados:
- autenticacao
- base-metro
- logistica
- atende
- base-cliente-etiquetas
- caixa
- cep
- etiquetas
- nf
- nuvemshop
- sla

Arquivos .clasp.json permanecem locais e nao devem ser enviados ao GitHub.

## CRM - boot v4 por view

Rota GET adicionada em 2026-07-07:
- `get_crm_boot_v4`

Arquivos relacionados:
- `apps-script/base-metro/10_OPERACAO_EXECUCAO_API.js`
- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`

Parametros aceitos:
- `view`: `home`, `prospects`, `clientes` ou `agenda`.
- `sub`: subview ativa, como `prospects-funil`, `prospects-cadastro`, `clientes-dashboard` ou `clientes-cadastro`.
- `start` e `end`: janela de dashboard/semana.
- `agendaStart` e `agendaEnd`: janela de agenda.
- `responsavelId`: filtro tecnico de responsavel ja usado pelo CRM.

Resposta:
- Mantem `{ ok: true }`.
- Retorna sempre `config`.
- Retorna apenas os blocos necessarios para a primeira tela solicitada.
- Inclui `meta.version = "4"`, `meta.view`, `meta.sub`, `meta.timings[]` e `meta.counts`.

Regras por view:
- Home: `config`, `dashboard`, `journeyClients`, `journeyProspects`, `agenda` e `overdue`.
- Prospects dashboard: `config`, `journeyProspects`, `agenda` e `overdue`.
- Prospects funil/cadastro: `config` e `journeyProspects`.
- Clientes: `config` e `journeyClients`.
- Agenda: `config`, `agenda` e `overdue`.

Compatibilidade:
- `get_crm_boot_v3` permanece ativo e nao foi removido.
- O frontend tenta v4, cai para v3 e so entao para o fluxo antigo de chamadas separadas.
- Se o Apps Script ainda nao estiver publicado, o frontend continua funcional pelo fallback.

Cuidados sensiveis:
- `meta.timings` e `meta.counts` registram apenas nomes tecnicos de etapas, duracao em ms e quantidades agregadas.
- Nao registrar dados pessoais, payload completo, nomes de clientes/prospects, tokens ou credenciais.

## CRM - regra de locais por EXIBIR_EM

Esta secao documenta uma correcao funcional ja aplicada na branch `redesign-crm`.

A aba `CRM_LOCAIS` e unica. A coluna `EXIBIR_EM` define em quais contextos cada local deve aparecer:
- `CRM`
- `PROSPECTS`
- `CRM;PROSPECTS`
- `AMBOS`
- `TODOS`

Regra de leitura esperada:
- `EXIBIR_EM=CRM` alimenta filtros e configuracoes de CRM/clientes.
- `EXIBIR_EM=PROSPECTS` alimenta filtros e cadastro de Prospects.
- `CRM;PROSPECTS`, `AMBOS` e `TODOS` podem alimentar os dois contextos.

Cuidados de regressao:
- Nao existe aba separada `PROSPECTS_LOCAIS`.
- Nao recriar a constante `PROSPECTS_LOCAIS`.
- Nao misturar locais exclusivos de clientes nos filtros ou cadastro de Prospects.
- O objetivo da regra e evitar que locais de clientes, como CF e METRO, aparecam em Prospects quando nao estiverem configurados para esse contexto.
- Prospects devem usar locais como ESTACAO FASHION, SHOPPING PARANGABA e REVERSA quando esses locais estiverem configurados com `EXIBIR_EM=PROSPECTS`.
- Exemplos de documentacao nao devem usar dados sensiveis reais.

## Modulo Reverso - backend Apps Script

Backend principal identificado:
- apps-script/logistica/04_Api.gs
- apps-script/logistica/03_Core.gs

Fluxo resumido:
- frontend/reverso/js/screens chama frontend/reverso/services/api.js.
- services/api.js envia action para o Web App.
- 04_Api.gs recebe doGet/doPost e roteia por action.
- 03_Core.gs concentra regras de negocio principais de leitura de etiqueta e confirmacao de drop-off.

Actions principais identificadas:
- getUnitBySlug
- registerOrLoginUser
- readEtiqueta
- confirmDropoff
- getUserHistory
- getDashboard
- getUnitStatus

Funcoes backend relacionadas:
- apiGetUnitBySlug_()
- apiRegisterOrLoginUser_()
- apiReadEtiqueta_()
- apiConfirmDropoff_()
- apiGetUserHistory_()
- apiGetDashboard_()
- apiGetUnitStatus_()
- reversaReadEtiqueta()
- reversaConfirmDropoff()

Cuidados tecnicos:
- Validar payload, usuario, unidade e permissao em cada action.
- Evitar logs com dados pessoais completos.
- Preservar nomes de actions usadas pelo frontend.
- Evitar mudancas diretas em rotas, actions e nomes de funcoes sem cruzar uso no frontend.

## Modulo /app - backend Apps Script

Backend principal identificado:
- apps-script/etiquetas/99_ROUTER.js
- apps-script/etiquetas/00_CFG.js
- apps-script/etiquetas/03_AUTH_APP.js
- apps-script/etiquetas/08_CWS_CEP.js
- apps-script/etiquetas/09_CWS_PRECO.js
- apps-script/etiquetas/10_HISTORICO.js
- apps-script/etiquetas/11_DESTINATARIOS.js
- apps-script/etiquetas/12_ETIQUETAS.js

Backend auxiliar identificado:
- apps-script/nf/* para leitura de NF-e/DANFE em PDF.

Fluxo resumido:
- frontend/app/js/api.js envia POST para o Web App principal.
- O body vai como JSON serializado em Content-Type text/plain para evitar preflight CORS do Apps Script.
- apps-script/etiquetas/99_ROUTER.js recebe doPost, identifica action e chama a funcao correspondente.
- Actions privadas exigem sessionToken.
- Sessao do /app e validada no Apps Script e armazenada em cache do script.
- O modulo de NF-e e um Web App separado e valida a sessao do /app quando configurado para isso.

Actions principais consumidas pelo /app:
- ping
- login
- me
- logout
- cep
- cotar
- cotarTodos
- criarEtiqueta
- criarEtiquetaDireta
- cancelarEtiqueta
- reimprimirEtiqueta
- listarHistorico
- detalheEtiqueta
- rastrearObjeto
- buscarDestinatarios
- listarDestinatarios
- salvarDestinatario
- excluirDestinatario
- importarDestinatariosCsv
- testarTokenCws
- diagnostico

Integracoes Apps Script:
- Google Sheets como base operacional.
- Google Drive para salvar e recuperar PDFs gerados.
- APIs Correios/CWS para CEP, preco, prazo, prepostagem, rotulo e declaracao.
- Web App externo de NF-e para converter PDF/DANFE em dados estruturados.

Cuidados tecnicos:
- Nao alterar nomes de actions sem revisar frontend/app/js/api.js e telas relacionadas.
- Preservar o padrao text/plain no fetch para evitar bloqueio por CORS/preflight.
- Nao registrar URLs completas de Web App em documentacao.
- Nao registrar IDs completos de planilha ou pasta Drive.
- Evitar logs com CPF, CNPJ, telefone, e-mail, endereco, payload de NF-e ou PDF.
- Operacoes de emissao, cancelamento, reimpressao e importacao devem validar sessao, cliente e payload.
- Alteracoes em Apps Script devem considerar limites de tempo, CacheService, LockService e chamadas externas dos Correios.

### Checklist tecnico de validacao segura - /app

Este checklist orienta revisoes futuras no Apps Script do /app sem alterar comportamento por engano.

Pontos criticos:
- Confirmar que PUBLIC_ACTIONS contem apenas actions realmente publicas.
- Confirmar que actions privadas exigem sessionToken antes de acessar planilha, Drive ou Correios/CWS.
- Confirmar que diagnostico retorna somente informacoes seguras, mascaradas ou booleanas.
- Confirmar que o Web App de NF-e valida sessao do /app em producao.

Pontos altos:
- Conferir se historico, reimpressao, cancelamento e detalhes filtram pelo cliente da sessao.
- Conferir se logs usam truncamento e nao persistem payload completo.
- Conferir se PDFs no Drive sao recuperados sem expor link ou arquivo para usuario indevido.
- Conferir se credenciais Correios/CWS nao saem do backend.

Pontos medios:
- Conferir se payloads de CEP, cotacao, etiqueta, destinatario e importacao CSV sao validados antes de escrita.
- Conferir se operacoes de escrita usam protecao contra concorrencia quando houver risco de duplicidade.
- Conferir se importacoes em lote respeitam limites do Apps Script.
- Conferir se falhas externas dos Correios/CWS geram erro claro, sem stack trace sensivel.

Pontos baixos:
- Conferir se comentarios e documentacao tecnica nao copiam URLs, IDs, tokens ou dados reais.
- Conferir se qualquer nova action e registrada tambem na documentacao de frontend, dados e seguranca quando aplicavel.

Atencao sensivel:
- Nao usar exemplos reais de cliente, etiqueta, NF-e, PDF, rastreio ou destinatario em testes documentados.
- Nao colar resposta completa de Web App em issue, changelog ou documentacao.
- Se um teste encontrar dado sensivel exposto, remover o dado antes de registrar a evidencia.

### Mapa de actions e payloads - /app

Escopo:
- Actions consumidas pelo frontend em frontend/app/js/api.js e frontend/app/js/nfe-import.js.
- Payloads descritos de forma resumida e sem dados reais.
- Respostas descritas por tipo de informacao esperada, sem exemplo real.

Observacoes:
- Todas as actions privadas recebem sessionToken injetado por frontend/app/js/api.js.
- Nao registrar sessionToken, URL completa de Web App, IDs de planilha/Drive, tokens CWS ou dados reais em testes.
- A action parseNfePdf pertence ao Web App separado de NF-e, nao ao roteador principal de etiquetas.

| Action | Origem frontend | Funcao Apps Script relacionada | Payload resumido | Resposta esperada | Dados sensiveis | Risco de regressao |
| --- | --- | --- | --- | --- | --- | --- |
| ping | frontend/app/js/api.js; health check tecnico | apps-script/etiquetas/99_ROUTER.js: action_ping_ | Sem payload relevante | Status do servico, versao e horario | Baixo | Baixo: usado para diagnostico basico |
| login | frontend/app/js/app.js; tela de login | apps-script/etiquetas/03_AUTH_APP.js: action_login_ | login, senha | sessionToken e client resumido | Alto: credencial, sessao, dados do cliente | Critico: quebra acesso ao app |
| me | frontend/app/js/app.js; bootstrap de sessao | apps-script/etiquetas/03_AUTH_APP.js: action_me_ | sessionToken | client da sessao | Alto: sessao e dados do cliente | Critico: quebra persistencia de login |
| logout | frontend/app/js/app.js; botao sair | apps-script/etiquetas/03_AUTH_APP.js: action_logout_ | sessionToken | ok true | Medio: sessao | Medio: pode deixar sessao ativa indevida |
| cep | telas nova, etiqueta e destinatarios | apps-script/etiquetas/08_CWS_CEP.js: action_cep_ | cep | logradouro, bairro, cidade, uf e dados normalizados | Medio: endereco | Alto: afeta preenchimento de enderecos |
| cotar | frontend/app/js/api.js; uso legado/pontual | apps-script/etiquetas/09_CWS_PRECO.js: action_cotar_ | payload de destino, peso, dimensoes, servico e opcionais | preco/prazo de uma modalidade | Medio: CEP e parametros de envio | Alto: afeta cotacao individual |
| cotarTodos | frontend/app/js/screens/nova.js | apps-script/etiquetas/09_CWS_PRECO.js: action_cotarTodos_ | destinatarioCep, tipoObjeto, pesoG, dimensoes, valorDeclarado, ar, maoPropria | opcoes PAC/SEDEX, preco, prazo, status por opcao | Medio: CEP e parametros de envio | Alto: afeta etapa 1 de cotacao |
| criarEtiqueta | frontend/app/js/screens/nova.js | apps-script/etiquetas/12_ETIQUETAS.js: action_criarEtiqueta_ | servico, codigoServico, destinatario, dimensoes, documento, NF/DC, opcionais e cotacao | etiqueta gerada, PDFs/base64 ou links controlados, historico, declaracao quando houver | Alto: destinatario, CPF/CNPJ, endereco, NF-e, PDF | Critico: afeta emissao oficial |
| criarEtiquetaDireta | frontend/app/js/screens/etiqueta.js | apps-script/etiquetas/12_ETIQUETAS.js: action_criarEtiquetaDireta_ | servico, destinatario, documento, NF/DC, opcionais; dimensoes default no backend | etiqueta gerada e dados para tela de sucesso | Alto: destinatario, CPF/CNPJ, endereco, NF-e, PDF | Critico: afeta emissao direta |
| cancelarEtiqueta | frontend/app/js/screens/historico.js | apps-script/etiquetas/12_ETIQUETAS.js: action_cancelarEtiqueta_ | idRegistro | ok/status de cancelamento | Alto: etiqueta e permissao do cliente | Critico: pode cancelar etiqueta errada |
| reimprimirEtiqueta | frontend/app/js/screens/historico.js | apps-script/etiquetas/12_ETIQUETAS.js: action_reimprimirEtiqueta_ | idRegistro | PDF principal e declaracao, base64/link controlado, metadados | Alto: PDF, etiqueta, Drive | Alto: afeta recuperacao de documentos |
| listarHistorico | frontend/app/js/screens/historico.js | apps-script/etiquetas/10_HISTORICO.js: action_listarHistorico_ | filtros: mes, status, uf, busca, limit | resumo, ufs e items do cliente logado | Alto: historico, destinatario, rastreio, PDF | Alto: pode expor registros ou degradar performance |
| detalheEtiqueta | frontend/app/js/api.js; action disponivel para detalhe | apps-script/etiquetas/10_HISTORICO.js: action_detalheEtiqueta_ | idRegistro | registro completo autorizado | Alto: historico e etiqueta | Alto: risco se nao filtrar por cliente |
| rastrearObjeto | frontend/app/js/screens/historico.js | apps-script/etiquetas/14B_RASTRO_SERVICE.js: action_rastrearObjeto_ | codigoObjeto | status atual e eventos normalizados | Medio: codigo de rastreio e eventos | Medio: afeta rastreio no historico |
| buscarDestinatarios | telas nova e etiqueta | apps-script/etiquetas/11_DESTINATARIOS.js: action_buscarDestinatarios_ | q, limit, uf opcional | lista limitada para autocomplete | Alto: destinatarios, CPF/CNPJ parcial, CEP | Alto: pode expor destinatarios indevidos |
| listarDestinatarios | frontend/app/js/screens/destinatarios.js | apps-script/etiquetas/11_DESTINATARIOS.js: action_listarDestinatarios_ | filtros: busca, uf, limit | total, ufs e items do cliente logado | Alto: destinatarios completos | Alto: pode pesar ou expor base de outro cliente |
| salvarDestinatario | destinatarios.js e nfe-import.js | apps-script/etiquetas/11_DESTINATARIOS.js: action_salvarDestinatario_ | dados do destinatario e origemCadastro | ok e item salvo | Alto: CPF/CNPJ, telefone, e-mail, endereco | Alto: upsert errado altera cadastro |
| excluirDestinatario | frontend/app/js/screens/destinatarios.js | apps-script/etiquetas/11_DESTINATARIOS.js: action_excluirDestinatario_ | idDestinatario | ok e id removido | Alto: destinatario e permissao | Alto: pode remover cadastro indevido |
| importarDestinatariosCsv | frontend/app/js/screens/destinatarios.js | apps-script/etiquetas/11_DESTINATARIOS.js: action_importarDestinatariosCsv_ | items do CSV normalizados | recebidos, importados, criados, atualizados, erros | Alto: lista de destinatarios | Alto: lote pode atualizar registros errados |
| testarTokenCws | frontend/app/js/screens/config.js | apps-script/etiquetas/04_CWS_TOKEN.js: action_testarTokenCws_ | sessionToken | status de token e autorizacoes sem segredo | Alto: CWS, contrato, cartao | Alto: nao pode vazar credencial |
| diagnostico | frontend/app/js/screens/config.js | apps-script/etiquetas/99_ROUTER.js: action_diagnostico_ | sessionToken | relatorio tecnico seguro e resumido | Alto: cadastro, CWS, configuracoes | Alto: nao pode retornar segredo |
| parseNfePdf | frontend/app/js/nfe-import.js | apps-script/nf/05_NFE_ROUTER.js: nfeActionParseNfePdf_ | portal, sessionToken, sessionAction, fileName, pdfBase64 | dados extraidos da NF-e, appPayloadPatch, warnings, confidence | Critico: PDF fiscal, NF-e, CPF/CNPJ, endereco | Critico: exige auth e revisao manual |

Regras de manutencao:
- Se uma action mudar, revisar frontend/app/js/api.js, tela de origem, funcao Apps Script, planilhas afetadas e docs.
- Se um campo de payload mudar, revisar mascaras, validacoes, historico, destinatarios e emissao.
- Se uma resposta mudar, revisar renderizacao da tela, mensagens de erro, tela de sucesso e logs.
- Se a action manipula PDF, NF-e, Drive, CWS ou dados pessoais, tratar como Atencao sensivel.

### Locais do CRM resiliente (2026-06-30, v8.3.2)
- crm83_getActiveLocals_ com try/catch total; em erro cai no padrao por escopo.
- crm3_apiGetConfig_ monta segmentos/locais via crm3_safeConfigList_, sem
  derrubar o bootstrap.

## CRM — `homeLocais` na configuração

### Escopo
Atualização em `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`.

### O que mudou
A função `crm3_apiGetConfig_()` passou a expor `homeLocais`.

### Regra
`homeLocais` combina:
- locais ativos de CRM
- locais ativos de PROSPECTS

A lista é deduplicada por:
- `nome`
- `NOME_EXIBICAO`
- `localId`
- `LOCAL_ID`

### Segurança e dados
- Não houve alteração de estrutura de planilha.
- Não houve alteração de credenciais.
- Não houve exposição de tokens, senhas ou chaves.
- Não houve alteração em CPF, CNPJ ou dados cadastrais.
