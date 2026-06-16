# Auditoria tecnica - Modulo Reverso

Este documento registra a auditoria tecnica inicial do modulo Reverso.

Objetivo: entender frontend, chamadas, Apps Script, dados, UX/UI, performance e riscos antes de alterar codigo.

## 1. Escopo

Modulo principal:

- frontend/reverso

Modulos relacionados provaveis:

- frontend/reverso-admin
- frontend/reverso-coleta
- frontend/reverso-expedicao
- apps-script/logistica
- apps-script/autenticacao

## 2. Objetivo do modulo

Permitir que usuarios registrem devolucoes, facam primeiro acesso, consultem ou entreguem pacotes conforme o fluxo da AGF.

## 3. Pontos que precisam ser mapeados

- arquivo HTML principal
- arquivos JS usados
- CSS usado
- chamadas externas
- Apps Script relacionado
- planilhas usadas
- dados sensiveis envolvidos
- fluxo de login ou primeiro acesso
- fluxo mobile
- gargalos de performance
- pontos de UX/UI

## 4. Checklist de auditoria

1. Listar arquivos do frontend/reverso.
2. Identificar HTML principal.
3. Identificar JS principal.
4. Identificar chamadas fetch, Web App ou API.
5. Confirmar se usa autenticacao.
6. Confirmar qual Apps Script responde.
7. Confirmar quais planilhas sao acessadas.
8. Confirmar dados sensiveis.
9. Confirmar possiveis gargalos.
10. Confirmar pontos de UX/UI e mobile.

## 5. Atencao sensivel

Este modulo pode envolver CPF, telefone, nome, unidade, rastreio, status de devolucao e dados operacionais.

Nao registrar neste documento dados reais de clientes, tokens, senhas, URLs privadas completas ou chaves.

## 6. Status

Auditoria iniciada. Nenhuma alteracao funcional aplicada.

## 7. Arquivos identificados no frontend

Arquivo principal:
- frontend/reverso/index.html

Arquivos centrais:
- frontend/reverso/js/app.js
- frontend/reverso/js/config.js
- frontend/reverso/js/router.js
- frontend/reverso/js/ui.js
- frontend/reverso/services/api.js
- frontend/reverso/state/store.js

Telas identificadas:
- auth.js
- boot.js
- home.js
- formReversa.js
- historico.js
- detalhe.js
- confirm.js
- success.js
- coletor.js
- agfDashboard.js
- nova.js

CSS identificado:
- frontend/reverso/styles/tokens.css
- frontend/reverso/styles/base.css
- frontend/reverso/styles/components.css
- frontend/reverso/styles/screens.css

## 8. Chamadas externas identificadas

Arquivos com sinais de chamadas externas ou configuracao de API:
- frontend/reverso/js/config.js
- frontend/reverso/services/api.js

Linhas identificadas na varredura:
- config.js: linhas 2 e 5
- api.js: linhas 4, 19, 20, 23, 45 e 79

Observacao: nao registrar URL completa, token, segredo ou identificador privado neste documento.

## 9. Hipotese tecnica inicial

- O modulo Reverso provavelmente centraliza configuracao de endpoint em config.js.
- O modulo provavelmente centraliza chamadas HTTP em services/api.js.
- Apps Script relacionado provavel: apps-script/logistica e apps-script/autenticacao.
- Pontos de atencao: dados pessoais, login, historico, devolucoes, status e performance.

## 10. Proxima investigacao

- Ler config.js sem expor URL completa.
- Ler services/api.js para identificar nomes das funcoes/chamadas.
- Cruzar chamadas com apps-script/logistica.
- Cruzar autenticacao com apps-script/autenticacao.
- Confirmar gargalos de performance antes de qualquer alteracao.

## 11. Segunda varredura - config.js e services/api.js

Branch usada na auditoria:
- audit/reverso-api

Arquivos analisados:
- frontend/reverso/js/config.js
- frontend/reverso/services/api.js

Achados:
- config.js possui export de configuracao.
- config.js possui configuracao de API_BASE.
- config.js possui configuracao de API_TIMEOUT.
- config.js possui chaves de escopo como UNIT, USER e FLOW.
- services/api.js possui funcao async para chamada ao backend.
- services/api.js valida se a URL/configuracao do backend existe antes da chamada.
- services/api.js usa timeout/controle de tempo de resposta.
- services/api.js monta body de requisicao.
- services/api.js trata resposta do backend.
- services/api.js exporta objeto ou funcoes de API do modulo.

Linhas identificadas:
- config.js: linhas 1, 2, 5, 8, 9 e 10.
- services/api.js: linhas 4, 18, 19, 23, 26, 29, 30, 33, 41, 45, 52 e 79.

Atenção sensível:
- Nao registrar URL completa do Web App.
- Nao registrar token, senha, chave ou identificador privado.
- Se houver endpoint publico de Apps Script, registrar apenas o modulo relacionado e o tipo de chamada.

Conclusao parcial:
- O frontend do Reverso esta centralizado corretamente em uma camada de configuracao e uma camada de servico de API.
- Proxima etapa: identificar os nomes das chamadas exportadas em services/api.js e cruzar com apps-script/logistica e apps-script/autenticacao.

## 12. Mapa inicial de telas x API

Arquivos de tela que usam a camada Api:

| Tela/arquivo | Chamadas identificadas | Observacao |
|---|---|---|
| agfDashboard.js | Api.getDashboard() | Painel AGF / resumo operacional |
| auth.js | Api.getUnitBySlug(), Api.getUnitStatus(), Api.registerOrLoginUser() | Login, unidade e primeiro acesso |
| boot.js | Api.getUnitBySlug() | Inicializacao por unidade/slug |
| confirm.js | Api.confirmDropoff() | Confirmacao de entrega/drop-off |
| historico.js | Api.getUserHistory() | Historico do usuario |
| home.js | Api.getUnitStatus() | Status da unidade na tela inicial |
| nova.js | Api.readEtiqueta() | Validacao/leitura de etiqueta |
| coletor.js | confirmar chamadas internas | Acoes de coleta manual, leitura e fechamento |

Arquivo de configuracao:
- frontend/reverso/js/config.js possui API_BASE_URL e API_TIMEOUT_MS.

Atenção sensível:
- A URL completa do Web App nao deve ser registrada neste documento.
- O endpoint esta no frontend e deve ser tratado como informacao publica/operacional, nao como segredo.
- Validar no futuro se o backend aplica permissao, validacao de payload e resposta minima.

Pontos de performance:
- getDashboard pode carregar resumo operacional e deve ser verificado quanto a cache.
- getUserHistory pode crescer com o tempo e deve considerar paginacao ou filtro.
- getUnitStatus e getUnitBySlug podem ser candidatos a cache curto.

Proxima etapa:
- Cruzar estas chamadas com as funcoes existentes em apps-script/logistica e apps-script/autenticacao.

## 13. Cruzamento frontend x Apps Script

Fluxo identificado:

- frontend/reverso/js/screens/*.js chama frontend/reverso/services/api.js.
- frontend/reverso/services/api.js envia action para o Web App.
- apps-script/logistica/04_Api.gs recebe doGet/doPost e roteia por action.
- apps-script/logistica/03_Core.gs contem funcoes de regra de negocio do Reverso.

| Chamada no frontend | Rota/action em 04_Api.gs | Funcao backend identificada | Observacao |
|---|---|---|---|
| Api.getUnitBySlug() | getUnitBySlug | apiGetUnitBySlug_() | Usada em auth.js e boot.js para localizar unidade por slug |
| Api.registerOrLoginUser() | registerOrLoginUser | apiRegisterOrLoginUser_() | Usada no login/cadastro de usuario |
| Api.readEtiqueta() | readEtiqueta | apiReadEtiqueta_() -> reversaReadEtiqueta() | Valida/le etiqueta; regra principal em 03_Core.gs |
| Api.confirmDropoff() | confirmDropoff | apiConfirmDropoff_() -> reversaConfirmDropoff() | Confirma drop-off; regra principal em 03_Core.gs |
| Api.getUserHistory() | getUserHistory | apiGetUserHistory_() | Historico do usuario |
| Api.getDashboard() | getDashboard | apiGetDashboard_() | Resumo/painel operacional |
| Api.getUnitStatus() | getUnitStatus | apiGetUnitStatus_() | Status da unidade |

Arquivos backend confirmados:
- apps-script/logistica/04_Api.gs: entrada HTTP, roteamento por action e funcoes api*.
- apps-script/logistica/03_Core.gs: funcoes centrais reversaReadEtiqueta() e reversaConfirmDropoff().
- apps-script/autenticacao/99_ROUTER.js: possui doGet/doPost/action, mas nao foi confirmado como backend direto do fluxo Reverso nesta etapa.

Atenção sensível:
- O roteamento usa actions publicas recebidas pelo Web App.
- Validar se cada action confere permissao, unidade, usuario e payload antes de consultar ou gravar dados.
- Nao registrar URLs completas, IDs de planilhas, tokens, chaves ou dados reais nos documentos.

Pontos de performance:
- getDashboard e getUserHistory devem ser avaliados com atencao, pois podem consultar volume maior de dados.
- getUnitBySlug e getUnitStatus sao candidatos a cache curto.
- readEtiqueta e confirmDropoff precisam priorizar operacoes objetivas e evitar leitura ampla de planilha.

Proxima etapa:
- Auditar dados e planilhas usados por readEtiqueta, confirmDropoff, getUserHistory, getDashboard e getUnitStatus.

## 14. Mapa inicial de dados e planilhas do Reverso

Objetivo desta etapa:
- Identificar quais pontos do backend do Reverso acessam planilhas, locks, leitura e escrita de dados.
- Registrar apenas informacoes tecnicas, sem expor IDs, URLs, tokens, dados reais ou nomes de clientes.

Arquivos principais identificados para o fluxo Reverso:

| Arquivo | Papel no fluxo | Achados principais |
|---|---|---|
| apps-script/logistica/03_Core.gs | Regras de negocio do Reverso | Possui reversaReadEtiqueta(), reversaConfirmDropoff(), LockService, leituras com getDataRange/getRange e escritas com setValues |
| apps-script/logistica/04_Api.gs | Entrada HTTP e roteamento por action | Possui doGet, doPost, routeApiRequest_(), apiGetUserHistory_(), apiGetDashboard_(), apiGetUnitStatus_(), apiReadEtiqueta_() e apiConfirmDropoff_() |
| apps-script/logistica/01_SetupSheets.gs | Estrutura de planilhas | Cria/garante abas, cabecalhos e estrutura inicial |
| apps-script/logistica/02_SupportData.gs | Dados auxiliares e validacoes | Usa AUX_LISTAS, PARAMETROS, validacoes e escrita em lote |
| apps-script/logistica/12_AdminPerformance.gs | Apoio de performance | Usa CacheService, indicando existencia de camada ou rotina de performance administrativa |

Funcoes principais ligadas diretamente ao Reverso:
- reversaReadEtiqueta(payload)
- reversaConfirmDropoff(payload)
- apiGetUserHistory_(req)
- apiGetDashboard_(req)
- apiGetUnitStatus_(req)
- apiReadEtiqueta_(req)
- apiConfirmDropoff_(req)

Uso de planilhas identificado:
- Uso de LockService em pontos de escrita ou operacao concorrente.
- Uso de getDataRange().getValues() em alguns pontos, que pode ser pesado quando a planilha crescer.
- Uso de getRange().getValues() para leituras especificas.
- Uso de setValues() e appendRowsBatch_(), o que indica preferencia por escrita em lote em alguns fluxos.
- Uso de getSheetByName(), indicando dependencia direta de nomes de abas.

Pontos de performance a observar:
- getDashboard pode ser pesado se montar resumo lendo muitas linhas da planilha.
- getUserHistory pode crescer com o historico e deve considerar filtros, limite ou paginacao.
- readEtiqueta e confirmDropoff devem evitar varredura ampla de planilha quando possivel.
- getUnitStatus e getUnitBySlug sao candidatos a cache curto.

Atencao sensivel:
- Nao registrar IDs completos de planilhas, URLs de Web App, tokens, chaves, senhas ou dados reais.
- Planilhas podem conter dados pessoais e operacionais.
- Qualquer ajuste futuro que altere abas, colunas, permissoes, logs ou payloads deve atualizar docs/PLANILHAS_E_DADOS.md e docs/SEGURANCA_E_DADOS.md.

Conclusao parcial:
- O fluxo Reverso usa Apps Script como backend principal e Google Sheets como base operacional.
- O uso de LockService e setValues e positivo para concorrencia e escrita em lote.
- O uso de getDataRange exige atencao em telas de dashboard, historico e buscas por etiqueta.

Proxima etapa:
- Auditar com mais detalhe quais abas e cabecalhos sao usados por reversaReadEtiqueta(), reversaConfirmDropoff(), apiGetUserHistory_(), apiGetDashboard_() e apiGetUnitStatus_(), sem expor dados reais.
