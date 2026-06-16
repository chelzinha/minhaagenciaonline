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
