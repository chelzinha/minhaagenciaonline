# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS` e às visões derivadas do `CADASTRO_MESTRE_CLIENTES`.

## Escopo atual - v0.6.0

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Auditar as particoes historicas antes de qualquer substituicao da producao.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Permitir filtros por periodo, centro, local, cliente e grupo analitico.
- Gerar diagnostico derivado de identidade sem alterar fatos nem criar clientes automaticamente.
- Gerar previa de migracao, separando prontos, casos para revisao e placeholders que nao devem virar cliente.
- Gerar fila assistida de revisao com sugestoes deterministicas e evidencias legadas, sempre dependentes de decisao humana.
- Materializar `01_CLIENTES_MASTER` em `02_CLIENTES` quando o cadastro estiver homologado.

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

`centralAgfGerarDiagnosticoIdentidade()` grava uma visao rebuildable em `CADASTRO_MESTRE_CLIENTES!13_DIAGNOSTICO_IDENTIDADE`.

Somente fatos com SRO real entram no diagnostico de candidatos a cliente. `SEM_REGISTRO`, `PRODUTO_ECT` e outros registros sem SRO continuam integralmente preservados no faturamento/historico, mas ficam fora da identificacao e contagem de clientes.

### Regras de Centro confirmadas

1. `RAZAO_SOCIAL = BALCÃO` pertence ao Centro AGF e usa `NOME_REMETENTE` para a identidade preliminar.
2. `RAZAO_SOCIAL = GAS SHOPPING METRO` pertence ao Centro METRO e usa `NOME_REMETENTE` para a identidade preliminar.
3. Essas duas regras comerciais vencem `CENTRO_ORIGEM`.
4. Para as demais identidades, `CENTRO_ID_FINAL` confirmado vence fallbacks.
5. Na ausencia de Centro final, `CENTRO_ORIGEM` reconhecido pode orientar a classificacao provisoria.

## Previa de migracao - v0.5.0

`centralAgfGerarPreviaMigracaoClientes()` gera:

- `14_PREVIA_MIGRACAO_CLIENTES`: todos os candidatos com estrategia, confianca e status;
- `15_FILA_REVISAO_IDENTIDADE`: somente os candidatos que ainda exigem revisao.

A previa reaproveita automaticamente apenas:

- alias legado confirmado manualmente;
- alias legado `EXATO_NORM` com score 100;
- identidade AGF contratada baseada em `RAZAO_SOCIAL`.

Correspondencias fuzzy/score legado nao sao promovidas automaticamente a cliente.

## Revisao assistida - v0.6.0

`centralAgfGerarAssistenciaRevisaoIdentidade()` gera:

- `16_RESUMO_IDENTIDADE`: contagens por status, tipo, estrategia, motivo de revisao e classificacao da assistencia;
- `17_FILA_REVISAO_ASSISTIDA`: fila ordenada por impacto financeiro com ate tres sugestoes de nome por candidato.

A assistencia usa apenas evidencias locais e deterministicas:

- alias ja confiavel que foi retido para revisao por outro motivo;
- correspondencia unica com um candidato pronto apos remover somente espacos/pontuacao;
- correspondencia unica com um candidato pronto apos retirar sufixo numerico de 2 a 5 digitos;
- sugestoes existentes no legado, inclusive scores menores, mas apenas como sugestao para revisao humana.

Nenhuma sugestao da v0.6.0 grava `CLIENTE_ID`, altera Centro/Local, muda fatos ou confirma identidade automaticamente.

## Nao faz nesta versao

- Nao altera APP MODELO_AGF atual.
- Nao processa Atende + Consolidador.
- Nao cria Cliente Master automaticamente.
- Nao altera Centro/Local no historico.
- Nao publica nada em producao.
- Nao usa IA externa com nomes de clientes.

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

1. `centralAgfAutoConfigurar()`.
2. `centralAgfSincronizarCatalogoParticoes()`.
3. `centralAgfValidarHistorico()`.
4. `centralAgfGerarDiagnosticoIdentidade()`.
5. `centralAgfGerarPreviaMigracaoClientes()`.
6. `centralAgfGerarAssistenciaRevisaoIdentidade()`.
7. Revisar as visoes derivadas antes de qualquer escrita em `01_CLIENTES_MASTER`.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve os arquivos por nome e armazena somente em Script Properties. As visoes de identidade contem dados cadastrais e financeiros e nao devem ser publicadas no frontend nem copiadas para documentacao com exemplos reais.