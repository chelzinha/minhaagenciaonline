# Backend APP v23 — correção de reimpressão pelo Drive

## Problema corrigido

A conta do Google Drive permite criar os PDFs, mas bloqueia `setSharing(ANYONE_WITH_LINK)`.
Na versão anterior, criação e compartilhamento ficavam no mesmo `try`. Quando o compartilhamento
falhava, o arquivo continuava existindo na pasta, porém seu `fileId` e URL eram descartados.
O histórico ficava sem referência e a reimpressão tentava regenerar o rótulo na Correios.

Além disso, a aba HISTORICO_ETIQUETAS existente não recebia automaticamente novos headers.

## Correções

- preserva `fileId` e URL interna mesmo quando compartilhamento público é negado;
- adiciona migração incremental de headers ausentes, sem apagar ou deslocar dados antigos;
- grava `FILE_ID_PDF_DRIVE` e `FILE_ID_DECLARACAO_DRIVE`;
- recupera PDFs antigos automaticamente pelo padrão do nome na pasta configurada;
- evita assumir DC em linhas legadas sem `TIPO_DOCUMENTO`, impedindo tentativa indevida de DACE em etiqueta com NF-e;
- mantém fallback final de regeneração via Correios somente quando o arquivo realmente não existe no Drive.

## Arquivos alterados

- `00_CFG.js`
- `07_CWS_ROTULO.js`
- `07B_CWS_DECLARACAO.js`
- `10_HISTORICO.js`
- `12_ETIQUETAS.js`

## Publicação

Substitua os cinco arquivos, salve e faça uma nova implantação do Web App.
O frontend v22 pode ser mantido sem alterações.
