# DANFE Simplificado 10x15 — patch do parser v1.1.1

Este pacote completo mantém o backend externo de NF-e e corrige a extração necessária para adaptar uma DANFE A4 importada para a DANFE Simplificada 10x15.

## Correções incluídas

- Prioriza o nome do emitente presente no canhoto `RECEBEMOS DE ... OS PRODUTO(S)`.
- Impede que domínio/site seja interpretado como nome empresarial.
- Captura IE do emitente quando IE e CNPJ aparecem na mesma linha em colunas distintas.
- Preenche UF do emitente a partir do código da UF existente na chave de acesso da NF-e.
- Evita interpretar horário de saída como IE do destinatário.
- Reconhece a opção selecionada de operação quando o DANFE imprime `0 - ENTRADA`, `1 - SAÍDA` e o indicador visual em linha próxima.

## Segurança

O arquivo `00_NFE_CFG.js` continua com placeholders de configuração. Antes da produção, configure `MAIN_APP_GAS_URL` ou um segredo em Script Properties e desative `ALLOW_WITHOUT_AUTH_WHEN_UNCONFIGURED`.
