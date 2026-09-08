# Rodada - Cadastro Portal no Atende

Data: 2026-09-08
Branch: `feat/atende-csv-diario`

## Objetivo

Trazer diariamente para o painel `/atende` o campo `CLIENTE` do CSV do Consolidador, exibido como `CADASTRO PORTAL`, sem alterar o RAW do Atende e sem substituir a coluna `CLIENTE` de contratos.

## Fluxo diario

1. CSV do Atende em `ENTRADA`.
2. CSV do Consolidador na mesma `ENTRADA`.
3. O mesmo gatilho `ATENDE_importarCsvDriveD1Agora` identifica a fonte pelo cabecalho.
4. Atende continua em `atende_postagens_raw`.
5. Consolidador entra em `consolidador_raw`.
6. `atende_cliente_portal` e recalculada quando um lote Atende ou Consolidador termina.
7. Arquivo concluido vai para `PROCESSADA`.

## Identificacao da fonte

ATENDE:
- `ATENDIMENTO`
- `CODIGO_OBJETO`
- `DATA_POSTAGEM`

CONSOLIDADOR:
- `OBJETO`
- `VENDA/PP.`
- `CX./AT.`

O nome do arquivo nunca e usado para decidir a fonte.

## Estrutura D1

Migration: `0008_cliente_portal.sql`

Novas tabelas:
- `consolidador_importacoes`
- `consolidador_raw`
- `atende_cliente_portal`

O Consolidador preserva a linha importada e tambem guarda `raw_json` com os campos recebidos.

## Pareamento

### SRO

- SRO valido termina em `BR`.
- SRO repetido nao e deduplicado no RAW.
- Cada lado recebe numero de ocorrencia por SRO.
- O pareamento e `SRO + ocorrencia`.
- `origem_cliente = SRO`.
- `confianca = ALTA`.

### Sem SRO

- O mapa `atendente -> caixa` e aprendido dos pares por SRO.
- Consolidador e agrupado por dia + caixa + servico + valor.
- Apenas grupos com um unico cliente sao aceitos.
- Atende e pareado por dia + caixa + servico + valor + ocorrencia.
- `origem_cliente = ATENDIMENTO`.
- `confianca = MEDIA`.

## Painel

Colunas novas:
- `CADASTRO PORTAL`
- `ORIGEM PORTAL`

Campos tecnicos retornados pelo Worker:
- `_CONFIANCA_PORTAL`
- `_CX_AT_PORTAL`

`CADASTRO PORTAL` e read-only.

A coluna `CLIENTE` existente continua representando o cliente do contrato.

## Local

A rodada preserva a hierarquia ja aprovada:

`Manual > Atendente > Remetente > vazio`

O wrapper do Cadastro Portal importa `local-defaults-wrapper-v2.js`, portanto nao remove essa regra.

## Diagnostico Apps Script

- `ATENDE_statusCadastroPortal()`
- `ATENDE_recalcularCadastroPortal()`
- `ATENDE_identificarCsvEntradaSemGravar()`

O gatilho continua sendo apenas `ATENDE_importarCsvDriveD1Agora`.

## Deploy

1. Aplicar migrations D1.
2. Publicar Worker.
3. `clasp push` e atualizar o deployment do Apps Script.
4. Antes da primeira carga, usar `ATENDE_identificarCsvEntradaSemGravar()` se quiser conferir a deteccao.
5. Colocar o CSV do Consolidador em `ENTRADA`.
6. Executar manualmente `ATENDE_importarCsvDriveD1Agora` no primeiro teste ou aguardar o gatilho.
7. Conferir `ATENDE_statusCadastroPortal()` e o painel.
