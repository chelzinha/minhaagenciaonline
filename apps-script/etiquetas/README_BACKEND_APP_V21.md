# Backend Apps Script — v2.1.6-HIST-MES-SERVICO-FIX

## Correções consolidadas
- `00_CFG.js`: atualização da versão do backend para facilitar diagnóstico.
- `06_CWS_PREPOST.js`: corrige a identificação de PAC/SEDEX quando existe Valor Declarado. Labels textuais como `SEDEX` e `PAC` não são mais interpretados como se fossem códigos numéricos.
- `10_HISTORICO.js`: mantém o filtro mensal e o resumo financeiro entregues na v20.

## Publicação recomendada
Substitua os três arquivos no projeto Apps Script, salve e faça uma nova implantação do Web App.
O patch é consolidado: pode ser aplicado mesmo que exista dúvida sobre a publicação anterior da v20.
