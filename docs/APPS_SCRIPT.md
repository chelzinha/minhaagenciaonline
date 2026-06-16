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
