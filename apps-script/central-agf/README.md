# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS`.

## Escopo atual - v0.2.0

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Auditar as particoes historicas antes de qualquer substituicao da producao.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Permitir filtros por periodo, centro, local, cliente e grupo analitico.
- Materializar `01_CLIENTES_MASTER` em `02_CLIENTES` quando o cadastro estiver pronto.

## Auditoria historica

A funcao `centralAgfValidarHistorico()` valida, para cada particao:

- quantidade de linhas versus catalogo;
- faturamento versus catalogo, com tolerancia de centavos;
- data minima e maxima versus periodo catalogado;
- duplicidade de SRO real dentro da particao e entre particoes;
- duplicidade de `FATO_ID` dentro da particao e entre particoes;
- contagem separada de `SEM_REGISTRO`, `PRODUTO_ECT` e outros valores sem formato SRO.

O resultado e gravado em `07_HOMOLOGACAO`. A auditoria e somente leitura sobre os fatos mensais.

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

## Ordem de homologacao

1. Executar `centralAgfAutoConfigurar()`.
2. Executar `centralAgfSincronizarCatalogoParticoes()`.
3. Executar `centralAgfValidarHistorico()` e revisar `07_HOMOLOGACAO`.
4. Materializar primeiro um unico mes.
5. Comparar linhas e faturamento.
6. Somente depois testar periodo total.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve os arquivos por nome e armazena somente em Script Properties.
