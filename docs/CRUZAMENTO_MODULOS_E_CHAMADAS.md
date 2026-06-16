# Cruzamento entre modulos e chamadas do frontend

Este documento cruza o mapa de modulos com o mapa de chamadas do frontend.

Objetivo: confirmar quais telas dependem de quais Apps Script, Web Apps, planilhas e integracoes externas.

Atencao: nao registrar URLs privadas completas, tokens, chaves, senhas ou dados reais.

## 1. Fontes usadas

- docs/MAPA_MODULOS.md
- docs/MAPA_CHAMADAS_FRONTEND.md
- apps-script/
- frontend/

## 2. Mapa de validacao por modulo

| Modulo | Frontend | Apps Script esperado | Chamadas encontradas | Status | Observacao |
|---|---|---|---|---|---|
| Portal AGF | frontend/agf | autenticacao, atende | confirmar | pendente | Validar se e portal, area interna ou pagina institucional |
| Reverso usuario | frontend/reverso | logistica, autenticacao | confirmar | pendente | Confirmar chamadas de login, cadastro, consulta e registro |
| Reverso admin | frontend/reverso-admin | logistica, autenticacao | confirmar | pendente | Confirmar chamadas administrativas e filtros |
| Reverso coleta | frontend/reverso-coleta | logistica, autenticacao | confirmar | pendente | Confirmar chamadas mobile/coleta/status |
| Reverso expedicao | frontend/reverso-expedicao | logistica, autenticacao | confirmar | pendente | Confirmar chamadas de expedicao e rastreio |
| SuperFrete admin | frontend/superfrete-admin | etiquetas, nuvemshop, nf | confirmar | pendente | Confirmar chamadas de pedidos, etiquetas, NF e integracoes |
| Balcao | frontend/balcao | etiquetas, cep, caixa | confirmar | pendente | Confirmar chamadas de calculo, prazo, preco e emissao |
| Shared | frontend/shared | varios | confirmar | pendente | Confirmar funcoes compartilhadas e URLs centralizadas |

## 3. Perguntas de confirmacao

Para cada modulo, confirmar:

1. Qual arquivo HTML abre a tela principal.
2. Qual arquivo JS concentra as chamadas.
3. Se a URL do Web App esta hardcoded ou centralizada.
4. Qual Apps Script responde.
5. Qual planilha o Apps Script acessa.
6. Se existe dado sensivel no fluxo.
7. Se a tela carrega dados demais na abertura.
8. Se precisa de cache, paginacao ou carregamento progressivo.

## 4. Atencao sensivel

Este documento pode envolver endpoints, dados operacionais e integracoes.

Nao registrar:

- URL completa de Web App quando houver risco
- token
- senha
- chave
- secret
- dados reais de cliente
- CPF, CNPJ, telefone, email ou endereco

Registrar apenas:

- modulo
- arquivo
- tipo de chamada
- Apps Script relacionado
- status de confirmacao
- risco conhecido sem expor segredo

## 5. Proxima etapa

Preencher a coluna 'Chamadas encontradas' a partir do arquivo docs/MAPA_CHAMADAS_FRONTEND.md.

Depois atualizar docs/MAPA_MODULOS.md com os vinculos confirmados.

## 6. Status

Documento inicial criado para orientar o cruzamento tecnico dos modulos.
