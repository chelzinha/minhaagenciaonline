# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS`.

## Escopo V1

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Permitir filtros por periodo, centro, local, cliente e grupo analitico.
- Materializar `01_CLIENTES_MASTER` em `02_CLIENTES` quando o cadastro estiver pronto.

## Nao faz nesta versao

- Nao altera APP MODELO_AGF atual.
- Nao processa Atende + Consolidador.
- Nao resolve aliases/identidade.
- Nao altera Centro/Local no historico.
- Nao publica nada em producao.

## Parametros da consulta

A aba `01_PARAMETROS` usa as chaves:

- DATA_INICIO
- DATA_FIM
- CENTRO_ID (`TODOS` ou um valor)
- LOCAL_ID (`TODOS` ou um valor)
- CLIENTE_ID
- GRUPO_ANALITICO_ID
- MODO (`CLIENTES` ou `POSTAGENS`)

Datas em branco significam todo o historico disponivel.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve os arquivos por nome e armazena somente em Script Properties.
