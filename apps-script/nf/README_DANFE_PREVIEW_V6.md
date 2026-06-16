# NF-e PDF Extractor v6 — DANFE Simplificado Etiqueta em modo de amostragem

## O que entrou

- Extração adicional de emitente, CNPJ, IE, UF, protocolo de autorização, data de emissão e tipo de operação.
- Validação de chave de acesso com 44 dígitos e dígito verificador.
- Validação matemática de CPF e CNPJ.
- Actions novas:
  - `saveDanfePreviewSample`
  - `listDanfePreviewSamples`
  - `getDanfeAuditInfo`
- Criação automática da planilha `AGF — Amostragem DANFE Simplificado Etiqueta` na primeira prévia registrada.

## Segurança

A prévia 10x15 permanece sempre com a marca d'água `PRÉVIA DE TESTE — NÃO UTILIZAR PARA TRANSPORTE`.

## Instalação

1. Substitua/adicone os arquivos do ZIP no projeto Apps Script externo do extrator.
2. Preserve a URL preenchida em `00_NFE_CFG.js` > `AUTH.MAIN_APP_GAS_URL`.
3. Salve e gere nova versão da implantação.
4. Autorize o novo escopo de Google Sheets quando solicitado.
