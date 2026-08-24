# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS` e às visões derivadas do `CADASTRO_MESTRE_CLIENTES`.

## Escopo atual - v0.7.0

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Auditar as particoes historicas antes de qualquer substituicao da producao.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Permitir filtros por periodo, centro, local, cliente e grupo analitico.
- Gerar diagnostico derivado de identidade sem alterar fatos nem criar clientes automaticamente.
- Gerar previa de migracao, separando prontos, casos para revisao e placeholders que nao devem virar cliente.
- Gerar fila assistida de revisao com sugestoes deterministicas e evidencias legadas, sempre dependentes de decisao humana.
- Consolidar apenas `PRONTO_PREVIA` em um lote seguro por Centro + nome canonico, isolando conflitos antes de qualquer escrita no Cadastro Mestre.
- Materializar `01_CLIENTES_MASTER` em `02_CLIENTES` somente quando o cadastro estiver homologado.

## Auditoria historica

A funcao `centralAgfValidarHistorico()` valida quantidade de linhas, faturamento, periodo, SRO/FATO_ID repetidos e fatos especiais. O resultado e gravado em `07_HOMOLOGACAO` e a auditoria e somente leitura sobre os fatos mensais.

Para liberar o diagnostico, todas as particoes precisam ter `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK`. Alertas de SRO/FATO_ID repetido continuam registrados para reconciliacao, sem deduplicacao automatica.

## Diagnostico de identidade

`centralAgfGerarDiagnosticoIdentidade()` grava `CADASTRO_MESTRE_CLIENTES!13_DIAGNOSTICO_IDENTIDADE`.

Somente fatos com SRO real entram como candidatos de cliente. `SEM_REGISTRO`, `PRODUTO_ECT` e outros registros sem SRO continuam preservados no faturamento/historico, mas ficam fora da identificacao de clientes.

Regras de Centro confirmadas:

1. `RAZAO_SOCIAL = BALCÃO` -> `CTR_AGF`, identidade por `NOME_REMETENTE`.
2. `RAZAO_SOCIAL = GAS SHOPPING METRO` -> `CTR_METRO`, identidade por `NOME_REMETENTE`.
3. Essas duas regras comerciais vencem `CENTRO_ORIGEM`.
4. Para as demais identidades, `CENTRO_ID_FINAL` confirmado vence fallbacks.
5. Sem Centro final, `CENTRO_ORIGEM` reconhecido pode orientar provisoriamente.

## Previa de migracao - v0.5.0

`centralAgfGerarPreviaMigracaoClientes()` gera `14_PREVIA_MIGRACAO_CLIENTES` e `15_FILA_REVISAO_IDENTIDADE`.

A previa promove automaticamente apenas alias legado manual, alias `EXATO_NORM` score 100 e identidade AGF contratada baseada em `RAZAO_SOCIAL`. Correspondencias fuzzy/score legado nao viram cliente automaticamente.

## Revisao assistida - v0.6.0

`centralAgfGerarAssistenciaRevisaoIdentidade()` gera `16_RESUMO_IDENTIDADE` e `17_FILA_REVISAO_ASSISTIDA`.

A assistencia usa evidencias locais e deterministicas, mas nenhuma sugestao grava `CLIENTE_ID`, altera Centro/Local, muda fatos ou confirma identidade automaticamente.

## Lote seguro de migracao - v0.7.0

`centralAgfGerarLoteSeguroMigracaoClientes()` le somente `STATUS_PREVIA=PRONTO_PREVIA` e gera:

- `18_LOTE_SEGURO_CLIENTES`: identidades consolidadas que passaram por todas as travas;
- `19_CONFLITOS_LOTE_SEGURO`: identidades retiradas do lote por colisao ou incompatibilidade;
- `20_RESUMO_LOTE_SEGURO`: contagens e faturamento da entrada, lote seguro e conflitos.

A consolidacao usa a chave provisoria `CENTRO_SUGERIDO + NOME_CANONICO normalizado`. `LOTE_ITEM_ID` e apenas uma chave deterministica da visao derivada.

Uma identidade sai do lote seguro quando houver:

- mesmo canonico em mais de um Centro;
- mais de um tipo de identidade para o mesmo Centro + canonico;
- tipo incompatível com o Centro;
- Centro diferente de `CTR_AGF` ou `CTR_METRO`;
- estrategia diferente de `ALIAS_MANUAL_LEGADO`, `ALIAS_EXATO_NORM_LEGADO` ou `RAZAO_SOCIAL_AGF`;
- canonico vazio, generico ou operacional.

A aba 18 e totalmente rebuildable e nao contem campos de aprovacao persistente nem `CLIENTE_ID` proposto. Qualquer decisao humana persistente sera feita em uma camada separada. Nenhuma linha e escrita em `01_CLIENTES_MASTER` nesta versao.

## Nao faz nesta versao

- Nao altera APP MODELO_AGF atual.
- Nao processa Atende + Consolidador.
- Nao cria Cliente Master automaticamente.
- Nao gera `CLIENTE_ID` definitivo.
- Nao altera Centro/Local no historico.
- Nao publica nada em producao.
- Nao usa IA externa com nomes de clientes.

## Ordem de homologacao

1. `centralAgfAutoConfigurar()`.
2. `centralAgfSincronizarCatalogoParticoes()`.
3. `centralAgfValidarHistorico()`.
4. `centralAgfGerarDiagnosticoIdentidade()`.
5. `centralAgfGerarPreviaMigracaoClientes()`.
6. `centralAgfGerarAssistenciaRevisaoIdentidade()`.
7. `centralAgfGerarLoteSeguroMigracaoClientes()`.
8. Revisar `20_RESUMO_LOTE_SEGURO` e `19_CONFLITOS_LOTE_SEGURO` antes de projetar escrita em `01_CLIENTES_MASTER`.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve os arquivos por nome e armazena somente em Script Properties. As visoes de identidade contem dados cadastrais e financeiros e nao devem ser publicadas no frontend nem copiadas para documentacao com exemplos reais.