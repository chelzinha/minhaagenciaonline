# Backend Apps Script — v2.1.5-HIST-MES

## Arquivos alterados
- `00_CFG.js`: versão do backend.
- `10_HISTORICO.js`: filtro mensal e resumo financeiro.

## Publicação
Substitua os dois arquivos no projeto Apps Script, salve e faça nova implantação do Web App.

## Regra financeira
O resumo mensal soma somente linhas do cliente logado com `STATUS = CONCLUIDO`. Linhas canceladas, processando ou com erro não entram no faturamento mensal.
