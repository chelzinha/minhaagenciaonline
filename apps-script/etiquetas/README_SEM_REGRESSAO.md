# Backend Balcão AGF v2 — sem regressão no /app

Este pacote foi remontado usando como base o backend `backend_etiquetas_fix5_manual_preco_prazo`, que mantinha a cotação do /app corrigida.

## Mantido do /app
- 00_CFG.js atualizado, com `CFG.ETIQUETA_DIRETA` e versão 2.1.4.
- 09_CWS_PRECO.js corrigido, com regra anti-regressão de Valor Declarado:
  - PAC usa VD 064.
  - SEDEX usa VD 019.
- 12_ETIQUETAS.js mantém `action_criarEtiquetaDireta_`.
- 99_ROUTER.js mantém `criarEtiquetaDireta` e adiciona apenas actions do balcão.

## Adicionado para /balcao
- 20_BALCAO_CONFIG.js
- 21_BALCAO_HELPERS.js
- 22_BALCAO_PRAZO.js
- 23_BALCAO_CALCULO.js

## Separação da API Prazo do balcão
A configuração da API Prazo do balcão usa propriedades próprias:

- BALCAO_CWS_LOGIN_IDCORREIOS
- BALCAO_CWS_TOKEN_API
- BALCAO_CWS_CARTAO_POSTAGEM
- BALCAO_CWS_AMBIENTE
- BALCAO_CWS_PRAZO_TOKEN_CACHE

Ela não altera as credenciais, token, cartão ou fluxo CWS do /app.


## v3 CEP Balcão

- A action pública `balcaoCep` agora usa a mesma função de busca do `/app` (`buscarCepCorreios_`), mas com as credenciais isoladas do módulo balcão (`BALCAO_CWS_*`).
- Não altera a action privada `cep` do `/app`.
- Não exige sessão de cliente para `/balcao`.
