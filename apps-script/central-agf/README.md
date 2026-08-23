# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS`.

## Escopo atual - v0.4.1

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Auditar as particoes historicas antes de qualquer substituicao da producao.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Permitir filtros por periodo, centro, local, cliente e grupo analitico.
- Gerar um diagnostico derivado de identidade no Cadastro Mestre sem alterar fatos nem criar clientes automaticamente.
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

Para liberar o diagnostico de identidade, todas as particoes precisam ter `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK`. Alertas de SRO/FATO_ID repetido continuam registrados para reconciliacao, mas nao provocam deduplicacao automatica e nao bloqueiam uma leitura diagnostica.

## Diagnostico de identidade

A funcao `centralAgfGerarDiagnosticoIdentidade()` so executa depois da homologacao estrutural, financeira e de periodo.

Somente fatos com **SRO real** entram no diagnostico de candidatos a cliente. `SEM_REGISTRO`, `PRODUTO_ECT` e outros registros sem SRO continuam integralmente preservados no faturamento/historico, mas ficam fora da identificacao e contagem de clientes.

A rotina grava uma visao rebuildable em `CADASTRO_MESTRE_CLIENTES!13_DIAGNOSTICO_IDENTIDADE`.

### Prioridade das evidencias de Centro - v0.4.1

1. `CENTRO_ID_FINAL`, quando existir, vence qualquer fallback.
2. `RAZAO_SOCIAL = GAS SHOPPING METRO` permanece contexto forte de Metro quando nao existe Centro final.
3. `CENTRO_ORIGEM` reconhecido (`AGF`/`METRO`) orienta a classificacao quando nao existe Centro final nem a regra forte Metro.
4. `RAZAO_SOCIAL = BALCÃO` so funciona como fallback AGF quando nenhum Centro reconhecido estiver disponivel.
5. Casos sem regra forte ficam `INDEFINIDO` para revisao.

Consequencias importantes:

- fato com `CENTRO_ORIGEM=METRO` e `RAZAO_SOCIAL=BALCÃO` permanece candidato Metro baseado em `NOME_REMETENTE`;
- fato AGF de Balcao permanece candidato `AGF_BALCAO_REMETENTE` baseado em `NOME_REMETENTE`;
- cliente AGF fora do Balcao continua baseado em `RAZAO_SOCIAL`;
- Metro continua baseado em `NOME_REMETENTE`;
- Centro de origem continua sendo evidencia provisoria; nao substitui Centro final confirmado no Cadastro Mestre.

A aba diagnostica variantes de nome, volume, faturamento, primeira/ultima postagem, centros/locais/atendentes observados. Ela nao grava `CLIENTE_ID`, nao corrige Centro/Local e nao vira fonte de verdade.

## Nao faz nesta versao

- Nao altera APP MODELO_AGF atual.
- Nao processa Atende + Consolidador.
- Nao resolve aliases automaticamente.
- Nao cria Cliente Master automaticamente.
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
4. Confirmar `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK` em todas as particoes.
5. Materializar primeiro um unico mes.
6. Comparar linhas e faturamento.
7. Somente depois testar periodo total.
8. Com o historico homologado, executar `centralAgfGerarDiagnosticoIdentidade()`.
9. Usar o diagnostico para definir a migracao do Cadastro Mestre, sem editar os fatos mensais.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve os arquivos por nome e armazena somente em Script Properties.
