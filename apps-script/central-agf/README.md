# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS` e às visões derivadas do `CADASTRO_MESTRE_CLIENTES`.

## Escopo atual - v0.9.0

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Auditar as particoes historicas antes de qualquer substituicao da producao.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Permitir filtros por periodo, centro, local, cliente e grupo analitico.
- Gerar diagnostico derivado de identidade sem alterar fatos nem criar clientes automaticamente.
- Gerar previa de migracao, separando prontos, casos para revisao e placeholders que nao devem virar cliente.
- Gerar fila assistida de revisao com sugestoes deterministicas e evidencias legadas, sempre dependentes de decisao humana.
- Consolidar apenas `PRONTO_PREVIA` em um lote seguro por Centro + nome canonico, isolando conflitos reais antes de qualquer escrita no Cadastro Mestre.
- Gerar proposta idempotente de `CLIENTE_ID` sem escrever em `01_CLIENTES_MASTER`.
- Auditar a qualidade cadastral dos nomes propostos usando `02_CONTRATOS` e evidencias historicas de contrato/remetente antes de qualquer persistencia.
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

## Lote seguro de migracao - v0.7.1

`centralAgfGerarLoteSeguroMigracaoClientes()` le somente `STATUS_PREVIA=PRONTO_PREVIA` e gera:

- `18_LOTE_SEGURO_CLIENTES`: identidades consolidadas que passaram por todas as travas;
- `19_CONFLITOS_LOTE_SEGURO`: identidades retiradas do lote por colisao ou incompatibilidade;
- `20_RESUMO_LOTE_SEGURO`: contagens e faturamento da entrada, lote seguro e conflitos.

A consolidacao usa a chave provisoria `CENTRO_SUGERIDO + NOME_CANONICO normalizado`. `LOTE_ITEM_ID` e apenas uma chave deterministica da visao derivada.

No `CTR_AGF`, quando o mesmo nome canonico aparece exatamente como `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL`, isso representa dois canais/evidencias da mesma identidade. `AGF_RAZAO_SOCIAL` prevalece como identidade cadastral oficial e a ocorrencia de Balcao permanece como alias/evidencia.

## Proposta de Cliente ID - v0.8.0

`centralAgfGerarPropostaClienteId()` so executa quando `20_RESUMO_LOTE_SEGURO` indica zero conflitos residuais e gera:

- `21_PROPOSTA_CLIENTES_MASTER`: proposta de linhas para o Cadastro Mestre, ainda sem escrita;
- `22_CONFLITOS_PROPOSTA_ID`: colisao de ID, duplicidade de chave ou conflito com linha ja existente no Master;
- `23_RESUMO_PROPOSTA_ID`: reconciliacao da quantidade proposta.

Regra do `CLIENTE_ID`:

- formato `CLI_` + 20 caracteres hexadecimais;
- calculado por SHA-256 sobre um namespace fixo e o `LOTE_ITEM_ID`;
- nao codifica nome, Centro, contrato, CPF/CNPJ ou significado comercial visivel;
- e deterministico durante a homologacao;
- depois de persistido no Cadastro Mestre, deve ser tratado como imutavel.

`LOCAL_ID_PRINCIPAL`, `CNPJ_CPF` e `NOME_FANTASIA` permanecem vazios sem fonte homologada.

## Auditoria de qualidade do Master - v0.9.0

`centralAgfAuditarQualidadePropostaMaster()` gera:

- `24_AUDITORIA_QUALIDADE_MASTER`: uma linha para cada proposta de Cliente ID, com nome atual, evidencias de contratos/remetentes, nome final sugerido, fonte, regra de limpeza e status de qualidade;
- `25_RESUMO_QUALIDADE_MASTER`: contagens e faturamento por status de qualidade.

Para clientes AGF contratados, a rotina cruza `NUMERO_CONTRATO` observado nos fatos historicos com `PROCESSAMENTO_POSTAGENS_CORREIOS!02_CONTRATOS`. Essa fonte atual pode substituir uma Razao Social historica contaminada por codigos operacionais quando o contrato observado aponta de forma univoca para outro nome.

Limpezas automaticas nesta etapa sao restritas a padroes fortemente deterministas, como CNPJ/raiz de CNPJ prefixando o nome ou lista numerica operacional antes do nome. Depois da limpeza, qualquer colisao entre dois `CLIENTE_ID` do mesmo Centro vira `REVISAR_QUALIDADE`.

A auditoria continua somente leitura em relacao a `01_CLIENTES_MASTER`: nenhum cliente e criado, ativado ou atualizado.

## Nao faz nesta versao

- Nao altera APP MODELO_AGF atual.
- Nao processa Atende + Consolidador.
- Nao escreve em `01_CLIENTES_MASTER`.
- Nao ativa cliente no Cadastro Mestre.
- Nao define Local principal automaticamente.
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
8. Exigir zero conflitos em `19_CONFLITOS_LOTE_SEGURO`.
9. `centralAgfGerarPropostaClienteId()`.
10. Exigir zero conflitos em `22_CONFLITOS_PROPOSTA_ID`.
11. `centralAgfAuditarQualidadePropostaMaster()`.
12. Revisar `25_RESUMO_QUALIDADE_MASTER` e qualquer `REVISAR_QUALIDADE` antes de desenhar a escrita em `01_CLIENTES_MASTER`.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve os arquivos por nome e armazena somente em Script Properties. As visoes de identidade contem dados cadastrais e financeiros e nao devem ser publicadas no frontend nem copiadas para documentacao com exemplos reais.
