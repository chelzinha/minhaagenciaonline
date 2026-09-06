# Atende - Contratos enriquecidos e novos filtros - 05/09/2026

## Objetivo

A biblioteca de contratos do Atende passa a refletir a planilha de cadastro vinculada ao Portal Postal e deixa de usar o campo Observação no fluxo administrativo.

O formato definitivo da carga administrativa de contratos é:

```text
Contrato | Ocorr. | Cliente | Tipo | Intermediador
```

## Regra de cada campo

- `Contrato`: chave técnica que faz o vínculo com `NUMERO_CONTRATO` do CSV dos Correios.
- `Ocorr.`: quantidade calculada pelo RAW do Atende. Pode constar no CSV administrativo, mas nunca é gravada a partir do arquivo importado.
- `Cliente`: cliente cadastrado/vinculado no Portal Postal para aquele contrato.
- `Tipo`: classificação do cliente/contrato, por exemplo PLATINUM, BRONZE ou CONTRATO ANTIGO.
- `Intermediador`: origem/intermediador do contrato, por exemplo PORTAL POSTAL.

`Observação` foi removida da interface e do formato CSV novo. A coluna histórica continua fisicamente no banco apenas por compatibilidade de schema e recebe `NULL` nas novas gravações.

## Banco de dados

Migration:

`cloudflare/atende-api/migrations/0004_contratos_cliente.sql`

Ela adiciona `cliente` a `atende_contratos` e cria índices para Cliente, Tipo e Intermediador.

A tabela passa a ser usada conceitualmente assim:

```text
numero       -> Contrato
cliente      -> Cliente
nome         -> Intermediador
tipo         -> Tipo
observacao   -> legado/não utilizado
```

## Importação CSV

A aba Admin > Contratos aceita CSV com os cabeçalhos:

```text
Contrato
Ocorr.
Cliente
Tipo
Intermediador
```

Regras:

- Contrato é obrigatório.
- Cliente é obrigatório.
- Intermediador é obrigatório.
- Tipo pode ficar vazio.
- Ocorr. é ignorada na escrita e recalculada pelo RAW.
- Contratos repetidos com dados conflitantes no mesmo CSV são recusados.
- Registros idênticos aos já cadastrados são classificados como sem mudança.
- O RAW dos Correios não é alterado.

## Painel

Depois de `CARTÃO POSTAGEM`, o painel passa a exibir:

```text
CONTRATO
OCORR.
CLIENTE
TIPO
INTERMEDIADOR
```

`OCORR.` é a contagem de linhas RAW concluídas que possuem aquele contrato.

## Filtros

Os cinco atributos do cadastro de contrato ficam disponíveis como filtros independentes:

- Contrato
- Ocorr.
- Cliente
- Tipo
- Intermediador

Exemplo de combinação possível:

```text
Intermediador = PORTAL POSTAL
Tipo = PLATINUM
Cliente = XIMENES SERV ASS GESTAO DOC LTDA ME
```

Os filtros não alteram dados; apenas restringem a consulta do painel.

## Separação entre Cliente do contrato e Remetente

`CLIENTE` do contrato não substitui `NOME REMETENTE`.

- `CLIENTE`: dado administrativo vinculado ao contrato/Portal Postal.
- `NOME REMETENTE`: dado da postagem, podendo ser normalizado pela biblioteca de remetentes.

Essa separação é intencional para preservar a fonte e permitir análises comerciais por contrato.

## Ordem obrigatória de publicação

Como existe migration nova, a publicação deve seguir esta ordem:

1. `git pull` da branch `feat/atende-csv-diario`.
2. Aplicar migrations remotas do D1.
3. Publicar o Worker Cloudflare.
4. `clasp push` e atualizar o deployment existente do Apps Script.
5. Recarregar `/atende` com Ctrl+F5.
6. Importar o CSV de contratos pelo Admin.

Não há alteração na casca externa do Cloudflare Pages nesta rodada.
